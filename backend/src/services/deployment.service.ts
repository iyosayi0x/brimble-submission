import db from "@/database";
import { deployments } from "@/database/schema";
import { Deployment } from "@/types/dynamic";
import cursorPaginate from "@/utils/pagination";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
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
   * Every RUNNING deployment for a project except the one we're about to
   * promote — used by rollback/start to ensure only a single version of
   * the project is live at any time.
   */
  async listOtherRunning(
    projectId: string,
    exceptDeploymentId: string,
    tx: TransactionClient = db,
  ): Promise<Deployment[]> {
    return await tx.query.deployments.findMany({
      where: and(
        eq(deployments.projectId, projectId),
        eq(deployments.status, "RUNNING"),
        ne(deployments.id, exceptDeploymentId),
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
   * all deployments for a project — used during project teardown
   */
  async listByProject(
    projectId: string,
    tx: TransactionClient = db,
  ): Promise<Deployment[]> {
    return await tx.query.deployments.findMany({
      where: eq(deployments.projectId, projectId),
    });
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

  async shutDownDeployment(deployment: Deployment) {
    /**
     * remove containers
     */

    await dockerService.stopAndRemoveContainer(deployment.containerId!);

    /**
     * update deploymentId
     */
    await db
      .update(deployments)
      .set({
        status: "STOPPED",
      })
      .where(eq(deployments.id, deployment.id));
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

    /**
     * trigger shut down deployment
     */
    await Promise.all(
      activeDeployments.map(
        async (deployment) => await this.shutDownDeployment(deployment),
      ),
    );
  }
}

const deploymentService = new DeploymentService();
export default deploymentService;
