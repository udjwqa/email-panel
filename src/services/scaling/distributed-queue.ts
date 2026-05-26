import { Queue } from "bullmq";
import { redisConnection } from "../queue.js";

export interface StuffingItem {
  email: string;
  password: string;
  comboId?: number;
}

export interface BatchJob {
  items: StuffingItem[];
  userId: number;
  method: "imap" | "oauth";
}

export class DistributedQueue {
  private queue: Queue<BatchJob>;

  constructor(queueName = "credential-stuffing") {
    this.queue = new Queue<BatchJob>(queueName, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }

  async distribute(
    items: StuffingItem[],
    userId: number,
    method: "imap" | "oauth" = "imap",
    batchSize = 100,
  ): Promise<{ jobCount: number; totalItems: number }> {
    let jobCount = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await this.queue.add(`batch-${jobCount}`, {
        items: batch,
        userId,
        method,
      });
      jobCount++;
    }

    return { jobCount, totalItems: items.length };
  }

  async getQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed, total: waiting + active };
  }

  async pause(): Promise<void> {
    await this.queue.pause();
  }

  async resume(): Promise<void> {
    await this.queue.resume();
  }

  async drain(): Promise<void> {
    await this.queue.drain();
  }
}
