import db from "@/database";
import { deployments, projects } from "@/database/schema";
import { Project } from "@/types/dynamic";
import cursorPaginate from "@/utils/pagination";
import { and, eq } from "drizzle-orm";
import deploymentService from "./deployment.service";

class ProjectService {
  /**
   * generates unique slug for projects
   * @param gitUrl
   * @returns
   */
  private generateUniqueSlug(gitUrl: string): string {
    const name = gitUrl.split("/").pop()?.replace(".git", "") || "app";
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    return `${name.toLowerCase()}-${randomSuffix}`;
  }

  /**
   * find or create a project
   * @param gitUrl
   * @param tx
   * @param port  service port the deployed container listens on; only
   *              applied when the project is first created — re-deploys
   *              against an existing project preserve its original port
   * @returns project
   */
  async findOrCreateProject(
    gitUrl: string,
    tx: TransactionClient = db,
    port?: number,
  ): Promise<Project> {
    let project = await tx.query.projects.findFirst({
      where: eq(projects.gitUrl, gitUrl),
    });

    if (!project) {
      const slug = this.generateUniqueSlug(gitUrl);
      const [newProject] = await tx
        .insert(projects)
        .values({
          name: gitUrl.split("/").pop()?.replace(".git", "") || "New Project",
          slug,
          gitUrl,
          ...(port !== undefined ? { port } : {}),
        })
        .returning();
      project = newProject;
    }

    return project;
  }

  /**
   * find a project by id
   */
  async getProjectById(
    id: string,
    tx: TransactionClient = db,
  ): Promise<Project | undefined> {
    return await tx.query.projects.findFirst({
      where: eq(projects.id, id),
    });
  }

  /**
   * cursor paginated projects
   * @param cursor
   * @returns PaginatedData<projects[]>
   */
  async listProjects(cursor?: string) {
    return cursorPaginate("projects", {
      cursor,
      limit: 20,
    });
  }

  /**
   * delete a project row — child deployments cascade via FK
   */
  async deleteProjectRow(projectId: string, tx: TransactionClient = db) {
    await tx.delete(projects).where(eq(projects.id, projectId));
  }

  /**
   * stop all running deployments
   * @param slug
   */
  async stopRunningProjectContainers(slug: string) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.slug, slug),
    });

    if (project) {
      /**
       * find deployments
       */
      const runningDeployments = await db.query.deployments.findMany({
        where: and(
          eq(deployments.projectId, project.id),
          eq(deployments.status, "RUNNING"),
        ),
      });

      /**
       * shutdown deployments
       */
      await Promise.all(
        runningDeployments.map(
          async (deployment) =>
            await deploymentService.shutDownDeployment(deployment),
        ),
      );
    }
  }
}

const projectService = new ProjectService();
export default projectService;
