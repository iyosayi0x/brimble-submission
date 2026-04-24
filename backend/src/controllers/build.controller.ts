import { Response, Request, NextFunction } from "express";
import yup from "yup";
import buildService from "@/services/build.service";
import response from "@/utils/response";

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
}

const buildController = new BuildController();

export default buildController;
