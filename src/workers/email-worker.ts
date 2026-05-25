import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { db } from "../services/db.js";
import { config } from "../config.js";
import { log, error } from "../utils/logger.js";
import { EmailJobData } from "../services/queue.js";
import { validateEmail, createDnsCache } from "../services/validators/index.js";
import { audit } from "../services/audit.js";
import {
  notifyTaskCompleted,
  notifyTaskFailed,
  notifyErrorThreshold,
  notifyWorkerCrash,
} from "../services/notify.js";

const BATCH_SIZE = 100;

async function processEmailJob(job: Job<EmailJobData>) {
  const { taskId } = job.data;
  let errorThresholdNotified = false;

  await db.task.update({
    where: { id: taskId },
    data: { status: "PROCESSING" },
  });

  log(`Task #${taskId}: started processing`);
  audit({ type: "worker_started", level: "INFO", message: `Task #${taskId}: worker started` });

  const totalEmails = await db.email.count({
    where: { taskId, status: "VALID_FORMAT" },
  });

  const cache = createDnsCache();
  let processed = 0;
  let validCount = 0;
  let invalidCount = 0;
  let errorCount = 0;

  while (processed < totalEmails) {
    const batch = await db.email.findMany({
      where: { taskId, status: "VALID_FORMAT" },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    const freshTask = await db.task.findUnique({ where: { id: taskId } });
    if (freshTask?.status === "PAUSED") {
      log(`Task #${taskId}: paused by user`);
      return;
    }
    if (freshTask?.status === "CANCELLED") {
      log(`Task #${taskId}: cancelled by user`);
      return;
    }

    for (const record of batch) {
      try {
        const result = await validateEmail(record.email, record.domain, cache);

        await db.email.update({
          where: { id: record.id },
          data: {
            status: result.status,
            domainGroup: result.domainGroup,
            errorReason: result.errorReason,
            processedAt: new Date(),
          },
        });

        await db.domain.upsert({
          where: { domain: record.domain },
          create: {
            domain: record.domain,
            group: result.domainGroup,
            mxStatus: result.mxFound,
          },
          update: {
            group: result.domainGroup,
            mxStatus: result.mxFound,
          },
        });

        if (result.status === "MX_FOUND") {
          validCount++;
        } else {
          invalidCount++;
        }
      } catch (err) {
        await db.email.update({
          where: { id: record.id },
          data: {
            status: "ERROR",
            errorReason: err instanceof Error ? err.message : "Unknown error",
            processedAt: new Date(),
          },
        });
        errorCount++;
      }

      processed++;
    }

    await db.task.update({
      where: { id: taskId },
      data: { processedRows: processed },
    });

    await job.updateProgress(Math.round((processed / totalEmails) * 100));

    if (!errorThresholdNotified && processed > 0) {
      const errorRate = (errorCount / processed) * 100;
      if (
        errorCount >= config.notifications.errorThreshold ||
        errorRate >= config.notifications.errorRateThreshold
      ) {
        errorThresholdNotified = true;
        notifyErrorThreshold(taskId, errorCount, processed).catch(() => {});
        audit({ type: "error_threshold", level: "WARNING", message: `Task #${taskId}: ${errorCount} errors (${errorRate.toFixed(1)}%)` });
      }
    }
  }

  await db.task.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      processedRows: processed,
      validCount,
      invalidCount,
      errorCount,
      finishedAt: new Date(),
    },
  });

  log(
    `Task #${taskId}: completed — valid: ${validCount}, invalid: ${invalidCount}, errors: ${errorCount}`,
  );
  audit({ type: "worker_completed", level: "INFO", message: `Task #${taskId}: ${processed} processed, ${validCount} valid, ${invalidCount} invalid, ${errorCount} errors` });

  notifyTaskCompleted(taskId).catch(() => {});
}

export async function createEmailWorker() {
  const { getNumSetting } = await import("../services/settings.js");
  const concurrency = await getNumSetting("worker_concurrency");

  const connection = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<EmailJobData>("email-validation", processEmailJob, {
    connection,
    concurrency: concurrency || 2,
  });

  worker.on("completed", (job) => {
    log(`Job ${job.id} (task #${job.data.taskId}): completed`);
  });

  worker.on("error", (err) => {
    error(`Worker error: ${err.message}`);
    audit({ type: "worker_crash", level: "CRITICAL", message: `Worker crashed: ${err.message}` });
    notifyWorkerCrash(err.message).catch(() => {});
  });

  worker.on("failed", async (job, err) => {
    if (job) {
      error(
        `Job ${job.id} (task #${job.data.taskId}): failed — ${err.message}`,
      );
      audit({ type: "worker_failed", level: "ERROR", message: `Task #${job.data.taskId}: ${err.message}` });
      await db.task.update({
        where: { id: job.data.taskId },
        data: { status: "FAILED" },
      });
      notifyTaskFailed(job.data.taskId, err.message).catch(() => {});
    }
  });

  return worker;
}
