import { logEmitter } from "@/utils/log-emitter";
import { Request, Response } from "express";
import yup from "yup";

export class LogController {
  async pullLogsByDeploymentId(req: Request, res: Response) {
    const id = await yup.string().required().validate(req.params.id);

    /**
     * set header for sse
     */
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    /**
     * the callback will be triggered by build service
     */
    const logHandler = (message: string) => {
      res.write(`data: ${JSON.stringify({ message })}\n\n`);
    };

    /**
     * start listening
     */
    logEmitter.on(`logs:${id}`, logHandler);

    /**
     * If the user closes the tab or refreshes,
     * stop listening to avoid memory leaks
     */
    req.on("close", () => {
      logEmitter.off(`logs:${id}`, logHandler);
      res.end();
    });
  }
}

const logController = new LogController();

export default logController;
