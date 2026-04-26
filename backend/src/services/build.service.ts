import { spawn } from "child_process";
import simpleGit from "simple-git";
import fs from "fs/promises";
import path from "path";

import { logEmitter } from "@/utils/log-emitter";
import db from "@/database";
import CustomError from "@/utils/custom-error";
import projectService from "./project.service";
import deploymentService from "./deployment.service";
import { buildQueue } from "@/utils/build.queue";
import dockerService from "./docker.service";
import { ProxyService } from "./proxy.service";

export class BuildService {
  private STORAGE_PATH = "/tmp/brimble-builds";

  /**
   * ensures url passed in is a valid gitUrl
   * @param gitUrl
   * @returns
   */
  private ensureIsValidRepositoryUrl(gitUrl: string): boolean {
    const gitRegex = /^(https?|git|ssh|rsync)\b.*\.git$/i;
    return gitRegex.test(gitUrl);
  }

  /**
   *  Orchestrates the entire deployment lifecycle using a DB Transaction
   * @param gitUrl
   * @returns
   */
  async deploy(gitUrl: string) {
    if (!this.ensureIsValidRepositoryUrl(gitUrl)) {
      throw new CustomError("Invalid Git Repository URL", 400);
    }

    /**
     * wrap setup login inside transaction
     */
    const result = await db.transaction(async (tx) => {
      /**
       * 1. find or create project
       */
      const project = await projectService.findOrCreateProject(gitUrl, tx);

      /**
       * determine version number
       */
      const lastDeployment = await deploymentService.getLastDeploymentByProject(
        project.id,
        tx,
      );

      const nextVersion = (lastDeployment?.versionNumber ?? 0) + 1;
      const imageTag = `${project.slug}:v${nextVersion}`;

      /**
       * create deployment
       */
      const deployment = await deploymentService.createDeployment(
        {
          projectId: project.id,
          versionNumber: nextVersion,
          status: "PENDING",
          imageTag,
        },
        tx,
      );

      return { deployment, gitUrl, imageTag, project };
    });

    /**
     * add build process to queue
     */
    buildQueue.enqueue(result.deployment.id, async () => {
      /**
       * triggers background worker to build the process
       */
      await this.startBuildProcess(
        result.deployment.id,
        result.gitUrl,
        result.imageTag,
        result.project.slug,
      );
    });

    return result.deployment;
  }

  /**
   * Tear down a single deployment: stop+remove its container, drop the DB
   * row, and re-route the proxy if the deleted deployment was the active
   * one.
   */
  async deleteDeployment(deploymentId: string) {
    const deployment = await deploymentService.getDeploymentById(deploymentId);
    if (!deployment) {
      throw new CustomError("Deployment not found", 404);
    }

    const project = await projectService.getProjectById(deployment.projectId);
    if (!project) {
      throw new CustomError("Project not found", 404);
    }

    /**
     * snapshot whether this deployment was serving traffic before we touch
     * anything — once we delete the row, the "latest running" lookup will
     * naturally return the next candidate.
     */
    const latest = await deploymentService.getLatestRunning(project.id);
    const wasActive = latest?.id === deployment.id;

    if (deployment.containerId) {
      await dockerService.stopAndRemoveContainer(deployment.containerId);
    }

    await deploymentService.deleteDeploymentRow(deploymentId);
    await logEmitter.deleteHistory(deploymentId);

    if (wasActive) {
      const next = await deploymentService.getLatestRunning(project.id);
      if (next?.internalIp) {
        await ProxyService.registerRoute(project.slug, next.internalIp);
      } else {
        await ProxyService.deregisterRoute(project.slug);
      }
    }

    return { id: deploymentId };
  }

  /**
   * Tear down an entire project: stop+remove every container, drop built
   * images, deregister the proxy route, then delete the row (deployments
   * cascade via FK).
   */
  async deleteProject(projectId: string) {
    const project = await projectService.getProjectById(projectId);
    if (!project) {
      throw new CustomError("Project not found", 404);
    }

    const projectDeployments =
      await deploymentService.listByProject(projectId);

    /**
     * stop & remove any containers we still have a handle to
     */
    await Promise.all(
      projectDeployments
        .filter((d) => d.containerId)
        .map((d) => dockerService.stopAndRemoveContainer(d.containerId!)),
    );

    /**
     * drop built images so we don't leak disk per project
     */
    const imageTags = Array.from(
      new Set(
        projectDeployments
          .map((d) => d.imageTag)
          .filter((tag): tag is string => Boolean(tag)),
      ),
    );
    await Promise.all(imageTags.map((tag) => dockerService.removeImage(tag)));

    /**
     * tear down the public route before the project disappears
     */
    await ProxyService.deregisterRoute(project.slug);

    await Promise.all(
      projectDeployments.map((d) => logEmitter.deleteHistory(d.id)),
    );

    /**
     * deployments cascade via FK
     */
    await projectService.deleteProjectRow(projectId);

    return { id: projectId };
  }

  /**
   * Re-point the proxy at an older RUNNING deployment and stop any newer
   * containers so the active deployment becomes the rollback target.
   */
  async rollback(deploymentId: string) {
    const target = await deploymentService.getDeploymentById(deploymentId);
    if (!target) {
      throw new CustomError("Deployment not found", 404);
    }
    if (target.status !== "RUNNING") {
      throw new CustomError("Can only rollback to a running deployment", 400);
    }
    if (!target.internalIp) {
      throw new CustomError("Target deployment has no routable address", 400);
    }

    const project = await projectService.getProjectById(target.projectId);
    if (!project) {
      throw new CustomError("Project not found", 404);
    }

    const newer = await deploymentService.listNewerRunning(
      target.projectId,
      target.versionNumber,
    );

    for (const dep of newer) {
      if (dep.containerId) {
        await dockerService.stopAndRemoveContainer(dep.containerId);
      }
      await deploymentService.updateDeployment(dep.id, { status: "STOPPED" });
    }

    await ProxyService.registerRoute(project.slug, target.internalIp);

    return { id: target.id, versionNumber: target.versionNumber };
  }

  private async startBuildProcess(
    deploymentId: string,
    gitUrl: string,
    imageTag: string,
    projectSlug: string,
  ) {
    try {
      /**
       * update deployment status to building
       */
      await deploymentService.updateDeployment(deploymentId, {
        status: "BUILDING",
      });

      /**
       * execute building
       */
      await this.execute(deploymentId, gitUrl, imageTag);

      logEmitter.emitLog(
        deploymentId,
        "--- Step 3: Launching Container ---\n",
      );

      await dockerService.runContainer(deploymentId, imageTag, projectSlug);
    } catch (error) {
      console.error(`[Build Error] Deployment ${deploymentId}:`, error);
      await deploymentService.updateDeployment(deploymentId, {
        status: "FAILED",
      });
    }
  }

  async execute(deploymentId: string, gitUrl: string, imageTag: string) {
    const repoPath = path.join(this.STORAGE_PATH, deploymentId);

    try {
      /**
       * 1. pull the code
       */
      logEmitter.emitLog(
        deploymentId,
        "--- Step 1: Cloning Repository ---\n",
      );
      await fs.mkdir(repoPath, { recursive: true });
      await simpleGit().clone(gitUrl, repoPath);
      logEmitter.emitLog(deploymentId, "Successfully cloned repository.\n");

      /**
       * 2. build with railpack
       */
      logEmitter.emitLog(
        deploymentId,
        "--- Step 2: Railpack Build Starting ---\n",
      );

      return new Promise((resolve, reject) => {
        // Run railpack build [path] --name [tag]
        const builder = spawn(
          "railpack",
          ["build", repoPath, "--name", imageTag],
          {
            env: {
              ...process.env,
              PATH: `/root/.local/bin:${process.env.PATH}`,
            },
          },
        );

        builder.stdout.on("data", (data) => {
          logEmitter.emitLog(deploymentId, data.toString());
        });

        builder.stderr.on("data", (data) => {
          // Railpack often sends progress to stderr, so we capture both
          logEmitter.emitLog(deploymentId, data.toString());
        });

        builder.on("close", async (code) => {
          // Cleanup cloned code after build to save disk space
          await fs.rm(repoPath, { recursive: true, force: true });

          if (code === 0) {
            logEmitter.emitLog(deploymentId, "--- Build Successful ---\n");
            resolve(true);
          } else {
            logEmitter.emitLog(
              deploymentId,
              `--- Build Failed (Exit Code: ${code}) ---\n`,
            );
            reject(new Error(`Railpack exited with code ${code}`));
          }
        });
      });
    } catch (error: any) {
      logEmitter.emitLog(deploymentId, `CRITICAL ERROR: ${error.message}\n`);
      throw error;
    }
  }
}

const buildService = new BuildService();

export default buildService;
