import CONFIGS from "@/config";
import Docker from "dockerode";
import deploymentService from "./deployment.service";
import { ProxyService } from "./proxy.service";
import { logEmitter } from "@/utils/log-emitter";
import projectService from "./project.service";
import CustomError from "@/utils/custom-error";
import { Deployment } from "@/types/dynamic";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export class DockerService {
  /**
   * Poll briefly until internal ip is populated
   */
  private async waitForInternalIp(
    container: Docker.Container,
  ): Promise<string> {
    const maxAttempts = 20;
    const delayMs = 150;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const info = await container.inspect();
      const ip =
        info.NetworkSettings.Networks[CONFIGS.DOCKER_NETWORK_NAME]?.IPAddress;
      if (ip) return ip;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new CustomError(
      `Container ${container.id.substring(0, 12)} never attached to ${CONFIGS.DOCKER_NETWORK_NAME}`,
      500,
    );
  }

  async runContainer(
    deploymentId: string,
    imageTag: string,
    projectSlug: string,
    port: number,
  ) {
    /**
     * 1. create the container
     */
    const container = await docker.createContainer({
      Image: imageTag,
      name: `brimble-${projectSlug}-${deploymentId.substring(0, 5)}`,
      HostConfig: {
        NetworkMode: CONFIGS.DOCKER_NETWORK_NAME,
        Memory: 512 * 1024 * 1024, // 512 limit
      },
    });

    await container.start();

    logEmitter.emitLog(deploymentId, "Container started successfully.\n");

    /**
     * inspect to get the ip address inside brimble-net
     */
    const internalIp = await this.waitForInternalIp(container);

    const projectUrl = `${CONFIGS.APP_DOMAIN_SECURE ? "https" : "http"}://${projectSlug}.${CONFIGS.APP_DOMAIN}`;

    /**
     * register with proxy
     */
    logEmitter.emitLog(
      deploymentId,
      "--- Step 4: Configuring Network Routing ---\n",
    );
    await ProxyService.registerRoute(projectSlug, internalIp, port);

    logEmitter.emitLog(deploymentId, `✨ Deployment Live: ${projectUrl}`);

    /**
     * stop existing running cntainers
     */
    await projectService.stopRunningProjectContainers(projectSlug);

    /**
     * update db with live data
     */
    await deploymentService.updateDeployment(deploymentId, {
      status: "RUNNING",
      containerId: container.id,
      internalIp: internalIp,
      url: projectUrl,
    });
  }

  /**
   * Remove a built image. Safe to call when the image is already gone or
   * still referenced by another container — we swallow the 404/409 cases.
   */
  async removeImage(imageTag: string) {
    const image = docker.getImage(imageTag);
    try {
      await image.remove({ force: true });
    } catch (err: any) {
      if (err?.statusCode !== 404 && err?.statusCode !== 409) {
        console.error("[Docker] Failed to remove image:", err?.message ?? err);
      }
    }
  }

  /**
   * Bring a previously-built deployment back online. Tries to start the
   * existing container first; if docker no longer has it (e.g. pruned),
   * recreate it from the deployment's stored imageTag and start that.
   * Returns the live containerId + the network IP the proxy should dial.
   */
  async reviveContainer(
    deployment: Deployment,
    projectSlug: string,
  ): Promise<{ containerId: string; internalIp: string }> {
    if (!deployment.imageTag) {
      throw new CustomError("Deployment has no image to revive from", 400);
    }

    /**
     * try to wake the original container — covers the common case where
     * the image is still present and we just need to start it again.
     */
    if (deployment.containerId) {
      try {
        const container = docker.getContainer(deployment.containerId);
        try {
          await container.start();
        } catch (err: any) {
          // 304 = already running, which is fine
          if (err?.statusCode !== 304) throw err;
        }
        const internalIp = await this.waitForInternalIp(container);
        return { containerId: deployment.containerId, internalIp };
      } catch (err: any) {
        // 404 means docker dropped the container — recreate from image below
        if (err?.statusCode !== 404) throw err;
      }
    }

    /**
     * recreate from the image. The container name follows the same pattern
     * as a fresh deploy so subsequent reviveContainer calls find it.
     */
    const name = `brimble-${projectSlug}-${deployment.id.substring(0, 5)}`;

    /**
     * a stale container with the same name may exist if docker only lost
     * the id we knew about — clear it before createContainer collides.
     */
    try {
      await docker.getContainer(name).remove({ force: true });
    } catch (err: any) {
      if (err?.statusCode !== 404) throw err;
    }

    const container = await docker.createContainer({
      Image: deployment.imageTag,
      name,
      HostConfig: {
        NetworkMode: CONFIGS.DOCKER_NETWORK_NAME,
        Memory: 512 * 1024 * 1024,
      },
    });
    await container.start();
    const internalIp = await this.waitForInternalIp(container);
    return { containerId: container.id, internalIp };
  }

  /**
   * Stop and remove a container. Safe to call when the container is already
   * stopped, missing, or in any other terminal state — we swallow the
   * 304/404 cases that docker returns for those.
   */
  async stopAndRemoveContainer(containerId: string) {
    const container = docker.getContainer(containerId);

    try {
      await container.stop({ t: 5 });
    } catch (err: any) {
      if (err?.statusCode !== 304 && err?.statusCode !== 404) {
        console.error(
          "[Docker] Failed to stop container:",
          err?.message ?? err,
        );
      }
    }

    try {
      await container.remove({ force: true });
    } catch (err: any) {
      if (err?.statusCode !== 404) {
        console.error(
          "[Docker] Failed to remove container:",
          err?.message ?? err,
        );
      }
    }
  }
}

const dockerService = new DockerService();
export default dockerService;
