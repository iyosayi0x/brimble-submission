import { ValidationError } from "yup";
import response from "@/utils/response";
import type { Application, Request, Response, NextFunction } from "express";

export default (app: Application) => {
  app.use("{*path}", (_req: Request, res: Response) => {
    res.status(404).json(response("Invalid request", null, false));
  });

  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ValidationError) {
      return res
        .status(400)
        .json(response(error.errors[0] ?? error.message, null, false));
    }

    if (error.name === "CustomError") {
      return res
        .status(error.status ?? 400)
        .json(response(error.message, null, false));
    }

    if (["CastError", "JsonWebTokenError", "SyntaxError"].includes(error.name)) {
      return res.status(400).json(response(error.message, null, false));
    }

    return res.status(500).json(response(error.message ?? "Internal server error", null, false));
  });

  return app;
};
