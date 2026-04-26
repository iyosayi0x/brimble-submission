import { EventEmitter } from "events";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const LOG_DIR = "/tmp/brimble-logs";
fs.mkdirSync(LOG_DIR, { recursive: true });

const logPath = (deploymentId: string) =>
  path.join(LOG_DIR, `${deploymentId}.log`);

/**
 * Global emitter for streaming build logs.
 *
 * Every log line flows through `emitLog` so we can:
 *  - fan out to live SSE subscribers via the `logs:${id}` channel
 *  - append to a per-deployment file so late subscribers can replay history
 */
class LogEmitter extends EventEmitter {
  private streams = new Map<string, fs.WriteStream>();

  constructor() {
    super();
    this.setMaxListeners(0);
  }

  emitLog(deploymentId: string, message: string) {
    this.emit(`logs:${deploymentId}`, message);
    this.getStream(deploymentId).write(message);
  }

  async readHistory(deploymentId: string): Promise<string> {
    try {
      return await fsp.readFile(logPath(deploymentId), "utf8");
    } catch {
      return "";
    }
  }

  async deleteHistory(deploymentId: string): Promise<void> {
    const stream = this.streams.get(deploymentId);
    if (stream) {
      stream.end();
      this.streams.delete(deploymentId);
    }
    await fsp.unlink(logPath(deploymentId)).catch(() => {});
  }

  offLog(deploymentId: string, handler: (data: string) => void) {
    this.off(`logs:${deploymentId}`, handler);
  }

  private getStream(deploymentId: string): fs.WriteStream {
    let stream = this.streams.get(deploymentId);
    if (!stream) {
      stream = fs.createWriteStream(logPath(deploymentId), { flags: "a" });
      this.streams.set(deploymentId, stream);
    }
    return stream;
  }
}

export const logEmitter = new LogEmitter();
