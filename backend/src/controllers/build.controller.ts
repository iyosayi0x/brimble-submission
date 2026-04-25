import { Response, Request, NextFunction } from "express";
import * as yup from "yup";
import buildService from "@/services/build.service";
import response from "@/utils/response";
import projectService from "@/services/project.service";
import deploymentService from "@/services/deployment.service";

class BuildController {
  async deploy(req: Request, res: Response, next: NextFunction) {
    try {
      const gitUrl = await yup
        .string()
        .url("invalid git url")
        .required("git url is required")
        .validate(req.body.gitUrl);
      const deployment = await buildService.deploy(gitUrl);
      return res.status(201).json(response("Deployment queued", deployment));
    } catch (error) {
      next(error);
    }
  }

  async listProjects(req: Request, res: Response) {
    const cursor = await yup.string().optional().validate(req.params.next);
    const results = await projectService.listProjects(cursor);
    return res.status(200).json(response("Projects", results));
  }

  async listDeploymentVersions(req: Request, res: Response) {
    const cursor = await yup.string().optional().validate(req.params.next);
    const projectId = await yup
      .string()
      .required("Project id is required")
      .validate(req.params.id);
    const results = await deploymentService.listDeploymentVersions(
      projectId,
      cursor,
    );

    return res
      .status(200)
      .json(response("Project deployment versions", results));
  }

  async deleteDeployment(req: Request, res: Response, next: NextFunction) {
    try {
      const deploymentId = await yup
        .string()
        .required("Deployment id is required")
        .uuid("Invalid deployment id")
        .validate(req.params.id);
      const result = await buildService.deleteDeployment(deploymentId);
      return res.status(200).json(response("Deployment deleted", result));
    } catch (error) {
      next(error);
    }
  }

  async rollback(req: Request, res: Response, next: NextFunction) {
    try {
      const deploymentId = await yup
        .string()
        .required("Deployment id is required")
        .uuid("Invalid deployment id")
        .validate(req.params.id);
      const result = await buildService.rollback(deploymentId);
      return res
        .status(200)
        .json(response(`Rolled back to v${result.versionNumber}`, result));
    } catch (error) {
      next(error);
    }
  }
}

const buildController = new BuildController();

export default buildController;
