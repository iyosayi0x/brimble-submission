import type { Application } from "express";
import helmet from "helmet";
import morgan from "morgan";
import express from "express";
import cors from "cors";

/**
 * Allow any origin while still supporting credentialed requests. The
 * frontend uses `credentials: "include"` (and EventSource sends cookies
 * via withCredentials),
 */
const CORS_SETTINGS = {
  origin: true,
  credentials: true,
};

export default (app: Application) => {
  // enable CORS
  app.use(cors(CORS_SETTINGS));

  // Secure the app by setting various HTTP headers off.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Logger
  app.use(morgan("common"));

  // Tell express to recognize the incoming Request Object as a JSON Object
  app.use(express.json({ limit: "5mb" }));

  // Express body parser
  app.use(express.urlencoded({ limit: "5mb", extended: true }));

  return app;
};
