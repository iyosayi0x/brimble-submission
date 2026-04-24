import { logEmitter } from "@/utils/log-emitter";

type BuildTask = {
  deploymentId: string;
  action: () => Promise<void>;
};

class BuildQueue {
  private queue: BuildTask[] = [];
  private concurrency = 1;
  private running = 0;

  /**
   * add items to build queue
   * @param deploymentId
   * @param action
   */
  enqueue(deploymentId: string, action: () => Promise<void>) {
    this.queue.push({ deploymentId, action });
    logEmitter.emitLog(deploymentId, "🕒 Added to build queue...\n");
    this.run();
  }

  /**
   * runs build queue
   * @returns void
   */
  private async run() {
    /**
     * if at capacity or nothing to do stop
     */
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.running++;

    try {
      /**
       * execute build process
       */
      await task.action();
    } catch (error) {
      console.error(`[Queue Error] Deployment ${task.deploymentId}:`, error);
    } finally {
      this.running--;

      /**
       * immediately check if another task is waiting
       */
      this.run();
    }
  }

  /**
   *  ui helper to show ahead count
   * @param deploymentId
   * @returns
   */
  getQueuePosition(deploymentId: string) {
    return this.queue.findIndex((t) => t.deploymentId === deploymentId);
  }
}

export const buildQueue = new BuildQueue();
