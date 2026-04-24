import { Router } from "express";
import logRouter from "./log.route";
import buildRouter from "./build.route";

const router = Router();

router.get("/health-check", (req, res) => {
  res.send("Hello world");
});

router.use("/logs", logRouter);
router.use("/build", buildRouter);

export default router;
