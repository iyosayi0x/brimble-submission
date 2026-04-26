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

type Builder = "dockerfile" | "railpack";

/**
 * Maps known build-tool failure signatures to a single user-actionable
 * sentence. We append one of these after the raw stderr so users have a
 * clear next step instead of just a wall of buildkit output.
 */
const FAILURE_PATTERNS: Array<{
  builder: Builder | "any";
  test: RegExp;
  hint: string;
}> = [
  {
    builder: "railpack",
    test: /no provider matched|could not detect|unable to determine/i,
    hint: "Railpack couldn't detect your project type. Add a Dockerfile to the repo root and redeploy.",
  },
  {
    builder: "any",
    test: /docker[- ]compose.*(not found|missing)|compose: command not found/i,
    hint: "Build host is missing `docker compose` v2. Contact ops.",
  },
  {
    builder: "any",
    test: /\bkilled\b.*\b(signal\s*9|sigkill)\b|out of memory|cannot allocate memory|\boom\b/i,
    hint: "Build ran out of memory. Reduce the build's memory footprint or contact ops to raise the limit.",
  },
  {
    builder: "any",
    test: /pull access denied|manifest .* not found|unable to find image/i,
    hint: "Couldn't pull a base image. Check the image reference or registry credentials.",
  },
  {
    builder: "any",
    test: /temporary failure in name resolution|could not resolve host|i\/o timeout|network is unreachable/i,
    hint: "Network error reaching a registry or package mirror. Retry the deploy.",
  },
  {
    builder: "dockerfile",
    test: /failed to compute cache key|not found.*COPY|file does not exist/i,
    hint: "Dockerfile referenced a path that's not in the repo. Check your COPY/ADD lines.",
  },
  {
    builder: "dockerfile",
    test: /unknown instruction|dockerfile parse error/i,
    hint: "Dockerfile has a syntax error.",
  },
];

function classifyBuildFailure(
  builder: Builder,
  exitCode: number | null,
  stderrTail: string,
): string {
  for (const { builder: scope, test, hint } of FAILURE_PATTERNS) {
    if (scope !== "any" && scope !== builder) continue;
    if (test.test(stderrTail)) return hint;
  }
  return builder === "dockerfile"
    ? `Docker build failed (exit ${exitCode ?? "?"}). Check the build output above.`
    : `Railpack build failed (exit ${exitCode ?? "?"}). Add a Dockerfile if autodetect can't handle this stack.`;
}

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
   * @param port optional service port — only honored on first project
   *             creation; later re-deploys reuse the project's stored port
   * @returns
   */
  async deploy(gitUrl: string, port?: number) {
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
      const project = await projectService.findOrCreateProject(
        gitUrl,
        tx,
        port,
      );

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
        result.project.port,
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
        await ProxyService.registerRoute(
          project.slug,
          next.internalIp,
          project.port,
        );
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

    const projectDeployments = await deploymentService.listByProject(projectId);

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
    if (target.status !== "RUNNING" && target.status !== "STOPPED") {
      throw new CustomError(
        "Can only rollback to a running or stopped deployment",
        400,
      );
    }

    const project = await projectService.getProjectById(target.projectId);
    if (!project) {
      throw new CustomError("Project not found", 404);
    }

    /**
     * If the target is already RUNNING the proxy can be flipped to it as-is.
     * If it's STOPPED we revive its container first — restart picks a new
     * IP, so capture that and persist it before re-routing.
     */
    let internalIp = target.internalIp;
    if (target.status === "STOPPED") {
      const revived = await dockerService.reviveContainer(target, project.slug);
      internalIp = revived.internalIp;
      await deploymentService.updateDeployment(target.id, {
        status: "RUNNING",
        containerId: revived.containerId,
        internalIp: revived.internalIp,
      });
    }

    if (!internalIp) {
      throw new CustomError("Target deployment has no routable address", 400);
    }

    /**
     * Stop every other RUNNING sibling so the project has exactly one
     * live version after we re-route. Covers both rolling back to an
     * older deployment (newer is currently active) and "start" on the
     * latest STOPPED deployment (defensive — any leftover RUNNING
     * sibling gets cleaned up here).
     */
    const others = await deploymentService.listOtherRunning(
      target.projectId,
      target.id,
    );

    for (const dep of others) {
      if (dep.containerId) {
        await dockerService.stopAndRemoveContainer(dep.containerId);
      }
      await deploymentService.updateDeployment(dep.id, { status: "STOPPED" });
    }

    await ProxyService.registerRoute(project.slug, internalIp, project.port);

    return { id: target.id, versionNumber: target.versionNumber };
  }

  private async startBuildProcess(
    deploymentId: string,
    gitUrl: string,
    imageTag: string,
    projectSlug: string,
    port: number,
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

      logEmitter.emitLog(deploymentId, "--- Step 3: Launching Container ---\n");

      await dockerService.runContainer(
        deploymentId,
        imageTag,
        projectSlug,
        port,
      );
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
      logEmitter.emitLog(deploymentId, "--- Step 1: Cloning Repository ---\n");
      await fs.mkdir(repoPath, { recursive: true });
      await simpleGit().clone(gitUrl, repoPath);
      logEmitter.emitLog(deploymentId, "Successfully cloned repository.\n");

      /**
       * 2. pick a builder. A repo-root Dockerfile is the explicit, reliable
       * path — go straight to `docker build` for it. Anything else falls
       * through to railpack's autodetect, which is the fragile path.
       */
      const builder = await this.detectBuilder(repoPath);
      logEmitter.emitLog(
        deploymentId,
        builder === "dockerfile"
          ? "--- Step 2: Building from Dockerfile ---\n"
          : "--- Step 2: Building with Railpack (autodetect) ---\n",
      );

      await this.runBuilder(deploymentId, repoPath, imageTag, builder);
      logEmitter.emitLog(deploymentId, "--- Build Successful ---\n");
    } catch (error: any) {
      logEmitter.emitLog(deploymentId, `CRITICAL ERROR: ${error.message}\n`);
      throw error;
    } finally {
      await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async detectBuilder(repoPath: string): Promise<Builder> {
    try {
      await fs.access(path.join(repoPath, "Dockerfile"));
      return "dockerfile";
    } catch {
      return "railpack";
    }
  }

  private runBuilder(
    deploymentId: string,
    repoPath: string,
    imageTag: string,
    builder: Builder,
  ): Promise<void> {
    const cmd = builder === "dockerfile" ? "docker" : "railpack";
    const args =
      builder === "dockerfile"
        ? ["build", "-t", imageTag, repoPath]
        : ["build", repoPath, "--name", imageTag];

    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, {
        env: {
          ...process.env,
          PATH: `/root/.local/bin:${process.env.PATH}`,
        },
      });

      /**
       * keep a rolling tail of stderr so we can classify the failure on
       * close without hoarding the whole build log in memory.
       */
      const TAIL_LIMIT = 8000;
      let stderrTail = "";

      proc.stdout.on("data", (data) => {
        logEmitter.emitLog(deploymentId, data.toString());
      });

      proc.stderr.on("data", (data) => {
        const chunk = data.toString();
        logEmitter.emitLog(deploymentId, chunk);
        stderrTail = (stderrTail + chunk).slice(-TAIL_LIMIT);
      });

      /**
       * spawn-level error usually means the binary isn't on PATH. Surface
       * that as a host-config issue rather than a build failure.
       */
      proc.on("error", (err: NodeJS.ErrnoException) => {
        const msg =
          err.code === "ENOENT"
            ? `Build host is missing the \`${cmd}\` binary.`
            : `Failed to launch \`${cmd}\`: ${err.message}`;
        logEmitter.emitLog(deploymentId, `--- Build Failed --- ${msg}\n`);
        reject(new Error(msg));
      });

      proc.on("close", (code) => {
        if (code === 0) return resolve();
        const hint = classifyBuildFailure(builder, code, stderrTail);
        logEmitter.emitLog(
          deploymentId,
          `--- Build Failed (exit ${code}) --- ${hint}\n`,
        );
        reject(new Error(hint));
      });
    });
  }
}

const buildService = new BuildService();

export default buildService;
