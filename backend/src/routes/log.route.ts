import { Router } from "express";

import logController from "@/controllers/log.controller";
const logRouter = Router();

logRouter.get("/deployment/:id/logs", (req, res) =>
  logController.pullLogsByDeploymentId(req, res),
);

export default logRouter;
