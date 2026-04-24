import type { Application } from "express";
import helmet from "helmet";
import morgan from "morgan";
import express from "express";
import cors from "cors";

const CORS_SETTINGS = {
  credentials: true,
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Allow requests with no origin (curl, server-to-server)
    if (!origin) return callback(null, true);
    // Allow any localhost origin (plain or any subdomain/port)
    if (/^https?:\/\/([^.]+\.)?localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin not allowed — ${origin}`));
  },
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
