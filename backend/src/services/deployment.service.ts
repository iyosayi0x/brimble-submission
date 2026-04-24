import db from "@/database";
import { deployments } from "@/database/schema";
import { Deployment } from "@/types/dynamic";
import { desc, eq } from "drizzle-orm";

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
}

const deploymentService = new DeploymentService();
export default deploymentService;
