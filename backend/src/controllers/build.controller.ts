import { Response, Request, NextFunction } from "express";
import * as yup from "yup";
import buildService from "@/services/build.service";
import response from "@/utils/response";
import projectService from "@/services/project.service";

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
}

const buildController = new BuildController();

export default buildController;
