import db from "@/database";
import { deployments } from "@/database/schema";
import { Deployment } from "@/types/dynamic";
import cursorPaginate from "@/utils/pagination";
import { and, desc, eq, gt, inArray, isNotNull, ne } from "drizzle-orm";
import dockerService from "./docker.service";

class DeploymentService {
  /**
   * get last deployment by project
   * @param projectId
   * @param tx
   */
  async getLastDeploymentByProject(
    projectId: string,
    tx: TransactionClient = db,
  ): Promise<Deployment> {
    return await tx.query.deployments.findFirst({
      where: eq(deployments.projectId, projectId),
      orderBy: [desc(deployments.versionNumber)],
    });
  }

  /**
   * find a single deployment by id
   * @param id
   * @param tx
   */
  async getDeploymentById(
    id: string,
    tx: TransactionClient = db,
  ): Promise<Deployment | undefined> {
    return await tx.query.deployments.findFirst({
      where: eq(deployments.id, id),
    });
  }

  /**
   * highest versioned RUNNING deployment for a project (currently routed)
   */
  async getLatestRunning(
    projectId: string,
    tx: TransactionClient = db,
  ): Promise<Deployment | undefined> {
    return await tx.query.deployments.findFirst({
      where: and(
        eq(deployments.projectId, projectId),
        eq(deployments.status, "RUNNING"),
      ),
      orderBy: [desc(deployments.versionNumber)],
    });
  }

  /**
   * RUNNING deployments with a higher version number — used to stop newer
   * containers on rollback.
   */
  async listNewerRunning(
    projectId: string,
    versionNumber: number,
    tx: TransactionClient = db,
  ): Promise<Deployment[]> {
    return await tx.query.deployments.findMany({
      where: and(
        eq(deployments.projectId, projectId),
        eq(deployments.status, "RUNNING"),
        gt(deployments.versionNumber, versionNumber),
      ),
    });
  }

  /**
   * creates a new deployment
   * @param input
   * @param tx
   * @returns deployment
   */
  async createDeployment(
    input: Pick<
      Deployment,
      "projectId" | "versionNumber" | "status" | "imageTag"
    >,
    tx: TransactionClient = db,
  ): Promise<Deployment> {
    const [deployment] = await tx
      .insert(deployments)
      .values({
        projectId: input.projectId,
        versionNumber: input.versionNumber,
        status: input.status,
        imageTag: input.imageTag,
      })
      .returning();

    return deployment;
  }

  /**
   * updates deployment
   * @param deploymentId
   * @param input
   */
  async updateDeployment(deploymentId: string, input: Partial<Deployment>) {
    await db
      .update(deployments)
      .set(input)
      .where(eq(deployments.id, deploymentId));
  }

  /**
   * remove a deployment row
   */
  async deleteDeploymentRow(deploymentId: string, tx: TransactionClient = db) {
    await tx.delete(deployments).where(eq(deployments.id, deploymentId));
  }

  /**
   * paginated return deployments
   * @param projectId
   * @param cursor
   * @returns PaginatedData<Deployment>
   */
  async listDeploymentVersions(projectId: string, cursor?: string) {
    return cursorPaginate("deployments", {
      cursor,
      where: eq(deployments.projectId, projectId),
    });
  }

  /**
   * shuts down running deployments on server stop
   * @returns void
   */
  async shutDownRunningDeployments() {
    console.log("::> Dropping all running containers");
    /**
     * find active deployments
     */
    const activeDeployments = await db
      .select()
      .from(deployments)
      .where(
        and(
          eq(deployments.status, "RUNNING"),
          isNotNull(deployments.containerId),
        ),
      );
    console.log(activeDeployments);

    /**
     * remove containers
     */
    await Promise.all(
      activeDeployments.map(async (deployment) => {
        dockerService.stopAndRemoveContainer(deployment.containerId!);
      }),
    );

    /**
     * change status
     */
    const deploymentIds = activeDeployments.map((item) => item.id);
    return await db
      .update(deployments)
      .set({
        status: "STOPPED",
      })
      .where(inArray(deployments.id, deploymentIds));
  }
}

const deploymentService = new DeploymentService();
export default deploymentService;
