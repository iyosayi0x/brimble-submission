import buildController from "@/controllers/build.controller";
import { Router } from "express";

const buildRouter = Router();

buildRouter.post("/deploy", (req, res, next) =>
  buildController.deploy(req, res, next),
);

buildRouter.get("/projects", buildController.listProjects);
buildRouter.get(
  "/projects/:id/deployments",
  buildController.listDeploymentVersions,
);

buildRouter.delete("/projects/:id", (req, res, next) =>
  buildController.deleteProject(req, res, next),
);
buildRouter.delete("/deployments/:id", (req, res, next) =>
  buildController.deleteDeployment(req, res, next),
);
buildRouter.post("/deployments/:id/rollback", (req, res, next) =>
  buildController.rollback(req, res, next),
);

export default buildRouter;
