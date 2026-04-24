import { Router } from "express";

const router = Router();

router.get("/health-check", (req, res) => {
  res.send("Hello world");
});

export default router;
