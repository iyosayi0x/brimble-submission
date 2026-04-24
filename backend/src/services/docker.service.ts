import CONFIGS from "@/config";
import Docker from "dockerode";
import deploymentService from "./deployment.service";
import { ProxyService } from "./proxy.service";
import { logEmitter } from "@/utils/log-emitter";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export class DockerService {
  async runContainer(deploymentId: string, imageTag: string, slug: string) {
    /**
     * 1. create the container
     */
    const container = await docker.createContainer({
      Image: imageTag,
      name: `brimble-${slug}-${deploymentId.substring(0, 5)}`,
      HostConfig: {
        NetworkMode: CONFIGS.DOCKER_NETWORK_NAME,
        Memory: 512 * 1024 * 1024, // 512 limit
      },
    });

    await container.start();

    logEmitter.emit(
      `logs:${deploymentId}`,
      "Container started successfully.\n",
    );

    /**
     * inspect to get the ip address inside brimble-net
     */
    const info = await container.inspect();
    const internalIp =
      info.NetworkSettings.Networks[CONFIGS.DOCKER_NETWORK_NAME].IPAddress;

    const projectUrl = `${CONFIGS.APP_DOMAIN_SECURE ? "https" : "http"}://${slug}.${CONFIGS.APP_DOMAIN}`;

    /**
     * register with proxy
     */
    logEmitter.emit(
      `logs:${deploymentId}`,
      "--- Step 4: Configuring Network Routing ---\n",
    );
    await ProxyService.registerRoute(slug, internalIp);

    logEmitter.emit(
      `logs:${deploymentId}`,
      `✨ Deployment Live: ${projectUrl}`,
    );

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
}

const dockerService = new DockerService();
export default dockerService;
