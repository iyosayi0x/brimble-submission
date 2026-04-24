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

export class BuildService {
  private static STORAGE_PATH = "/tmp/brimble-builds";

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

      return { deployment, gitUrl, imageTag };
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
      );
    });

    return result.deployment;
  }

  private async startBuildProcess(
    deploymentId: string,
    gitUrl: string,
    imageTag: string,
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
      await BuildService.execute(deploymentId, gitUrl, imageTag);

      /**
       * update deployment status to running
       */
      await deploymentService.updateDeployment(deploymentId, {
        status: "RUNNING",
      });
    } catch (error) {
      console.error(`[Build Error] Deployment ${deploymentId}:`, error);
      await deploymentService.updateDeployment(deploymentId, {
        status: "FAILED",
      });
    }
  }

  static async execute(deploymentId: string, gitUrl: string, imageTag: string) {
    const repoPath = path.join(this.STORAGE_PATH, deploymentId);

    try {
      /**
       * 1. pull the code
       */
      logEmitter.emit(
        `logs:${deploymentId}`,
        "--- Step 1: Cloning Repository ---\n",
      );
      await fs.mkdir(repoPath, { recursive: true });
      await simpleGit().clone(gitUrl, repoPath);
      logEmitter.emit(
        `logs:${deploymentId}`,
        "Successfully cloned repository.\n",
      );

      /**
       * 2. build with railpack
       */
      logEmitter.emit(
        `logs:${deploymentId}`,
        "--- Step 2: Railpack Build Starting ---\n",
      );

      return new Promise((resolve, reject) => {
        // Run railpack build [path] -t [tag]
        const builder = spawn("railpack", ["build", repoPath, "-t", imageTag]);

        builder.stdout.on("data", (data) => {
          // Stream logs directly to the EventEmitter for SSE
          logEmitter.emit(`logs:${deploymentId}`, data.toString());
        });

        builder.stderr.on("data", (data) => {
          // Railpack often sends progress to stderr, so we capture both
          logEmitter.emit(`logs:${deploymentId}`, data.toString());
        });

        builder.on("close", async (code) => {
          // Cleanup cloned code after build to save disk space
          await fs.rm(repoPath, { recursive: true, force: true });

          if (code === 0) {
            logEmitter.emit(
              `logs:${deploymentId}`,
              "--- Build Successful ---\n",
            );
            resolve(true);
          } else {
            logEmitter.emit(
              `logs:${deploymentId}`,
              `--- Build Failed (Exit Code: ${code}) ---\n`,
            );
            reject(new Error(`Railpack exited with code ${code}`));
          }
        });
      });
    } catch (error: any) {
      logEmitter.emit(
        `logs:${deploymentId}`,
        `CRITICAL ERROR: ${error.message}\n`,
      );
      throw error;
    }
  }
}

const buildService = new BuildService();

export default buildService;
