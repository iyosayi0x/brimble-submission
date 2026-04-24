import buildController from "@/controllers/build.controller";
import { Router } from "express";

const buildRouter = Router();

buildRouter.post("/deploy", (req, res, next) =>
  buildController.deploy(req, res, next),
);

export default buildRouter;
