import { Worker } from "bullmq";
import {
  invalidCredsCleanupQueue,
  redisConnection,
  type InvalidCredsCleanupJobData,
} from "../services/queue.js";
import { archiveInvalidCredentials } from "../services/invalid-credentials/archiver.js";
import { getSetting } from "../services/settings.js";

export const invalidCredsCleanupWorker =
  new Worker<InvalidCredsCleanupJobData>(
    "invalid-credentials-cleanup",
    async (job) => {
      console.log(
        `[InvalidCredsCleanupWorker] Starting job ${job.id} (manual: ${job.data.manual ?? false})`,
      );

      const enabled = await getSetting("invalid_creds_cleanup_enabled");
      if (enabled !== "true" && !job.data.manual) {
        console.log("[InvalidCredsCleanupWorker] Cleanup disabled, skipping");
        return { skipped: true };
      }

      const retentionDays = parseInt(
        await getSetting("invalid_creds_retention_days"),
        10,
      );
      const batchSize = parseInt(
        await getSetting("invalid_creds_batch_size"),
        10,
      );

      const result = await archiveInvalidCredentials(
        {
          olderThanDays: retentionDays,
          batchSize,
          dryRun: false,
        },
        job.data.userId,
      );

      console.log(
        `[InvalidCredsCleanupWorker] Completed: archived ${result.archived}, deleted ${result.deleted}, errors ${result.errors}`,
      );

      return result;
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  );

export async function scheduleInvalidCredsCleanup() {
  await invalidCredsCleanupQueue.add(
    "scheduled-cleanup",
    { manual: false },
    {
      repeat: {
        pattern: "0 2 * * *",
      },
    },
  );
  console.log("[InvalidCredsCleanupWorker] Scheduled daily cleanup at 2 AM");
}
