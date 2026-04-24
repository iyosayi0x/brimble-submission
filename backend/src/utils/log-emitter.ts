import { EventEmitter } from "events";

/**
 * Global emitter for streaming build logs.
 * This allows us to decouple the build process from the HTTP response.
 */
class LogEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
  }

  /**
   * log emitter for deployment
   * @param deploymentId
   * @param message
   */
  emitLog(deploymentId: string, message: string) {
    this.emit(`logs:${deploymentId}`, message);
  }

  /**
   * Helper for cleanup
   * @param deploymentId
   * @param handler
   */
  offLog(deploymentId: string, handler: (data: string) => void) {
    this.off(`logs:${deploymentId}`, handler);
  }
}

export const logEmitter = new LogEmitter();
