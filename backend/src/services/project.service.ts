import db from "@/database";
import { projects } from "@/database/schema";
import { Project } from "@/types/dynamic";
import cursorPaginate from "@/utils/pagination";
import { eq } from "drizzle-orm";

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
   * @returns project
   */
  async findOrCreateProject(
    gitUrl: string,
    tx: TransactionClient = db,
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
        })
        .returning();
      project = newProject;
    }

    return project;
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
}

const projectService = new ProjectService();
export default projectService;
