import { logEmitter } from "@/utils/log-emitter";
import { Request, Response } from "express";
import * as yup from "yup";

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

    const send = (message: string) => {
      res.write(`data: ${JSON.stringify({ message })}\n\n`);
    };

    /**
     * Buffer live messages while we read history off disk so we don't lose
     * lines that arrive mid-replay. Flush the buffer right after the file
     * contents, then hand off to the long-lived live handler.
     */
    const buffered: string[] = [];
    const bufferHandler = (m: string) => buffered.push(m);
    logEmitter.on(`logs:${id}`, bufferHandler);

    const history = await logEmitter.readHistory(id);
    if (history) send(history);
    buffered.forEach(send);
    logEmitter.off(`logs:${id}`, bufferHandler);

    const liveHandler = (message: string) => send(message);
    logEmitter.on(`logs:${id}`, liveHandler);

    /**
     * If the user closes the tab or refreshes,
     * stop listening to avoid memory leaks
     */
    req.on("close", () => {
      logEmitter.off(`logs:${id}`, liveHandler);
      res.end();
    });
  }
}

const logController = new LogController();

export default logController;
