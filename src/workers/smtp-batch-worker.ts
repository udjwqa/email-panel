import { Worker, Job } from "bullmq";
import {
  redisConnection,
  type SmtpBatchJobData,
} from "../services/queue.js";
import { verifyMailbox } from "../services/smtp/verifier.js";
import { db } from "../services/db.js";
import { notifyTaskCompleted } from "../services/notify.js";
import { updateTaskStatus } from "../services/telegram/task-tracker.js";
import { ProgressPusher } from "../services/telegram/progress-pusher.js";
import { renderProgressBar } from "../services/progress.js";
import { log, error } from "../utils/logger.js";

const BATCH_SIZE = 50;

async function processSmtpBatch(job: Job<SmtpBatchJobData>) {
  const { taskId } = job.data;

  const pusher = new ProgressPusher(taskId, "smtp");
  await pusher.init();

  await db.task.update({
    where: { id: taskId },
    data: { status: "PROCESSING" },
  });

  const totalEmails = await db.email.count({
    where: { taskId, status: "MX_FOUND" },
  });

  if (totalEmails === 0) {
    await db.task.update({
      where: { id: taskId },
      data: { status: "COMPLETED", finishedAt: new Date() },
    });
    return { processed: 0, deliverable: 0, undeliverable: 0, errors: 0 };
  }

  let processed = 0;
  let deliverable = 0;
  let undeliverable = 0;
  let errors = 0;
  const mxCache = new Map();

  while (processed < totalEmails) {
    const fresh = await db.task.findUnique({ where: { id: taskId } });
    if (fresh?.status === "PAUSED" || fresh?.status === "CANCELLED") break;

    const batch = await db.email.findMany({
      where: { taskId, status: "MX_FOUND" },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    for (const record of batch) {
      try {
        const result = await verifyMailbox(record.email, {
          timeout: 30_000,
          mxCache,
        });

        await db.email.update({
          where: { id: record.id },
          data: {
            status: "PROCESSED",
            errorReason:
              result.status !== "deliverable"
                ? `smtp:${result.status}:${result.smtpCode}`
                : null,
            processedAt: new Date(),
          },
        });

        if (result.status === "deliverable") deliverable++;
        else if (result.status === "undeliverable") undeliverable++;
        else errors++;
      } catch (err) {
        await db.email.update({
          where: { id: record.id },
          data: {
            status: "PROCESSED",
            errorReason: `smtp:error:${err instanceof Error ? err.message : "unknown"}`,
            processedAt: new Date(),
          },
        });
        errors++;
      }

      processed++;
    }

    await db.task.update({
      where: { id: taskId },
      data: { processedRows: processed },
    });

    await job.updateProgress(Math.round((processed / totalEmails) * 100));

    await pusher.pushProgress(
      `⏳ <b>SMTP проверка #${taskId}</b>\n\n` +
        renderProgressBar(processed, totalEmails) +
        `\nОбработано: ${processed} / ${totalEmails}\n` +
        `Deliverable: ${deliverable} | Errors: ${errors}`,
    );
  }

  const fresh = await db.task.findUnique({ where: { id: taskId } });
  if (fresh?.status === "CANCELLED") {
    await pusher.pushCancelled();
    return { processed, deliverable, undeliverable, errors };
  }

  await db.task.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      validCount: deliverable,
      invalidCount: undeliverable,
      errorCount: errors,
      processedRows: processed,
      finishedAt: new Date(),
    },
  });

  if (job.data.chatId) {
    await updateTaskStatus(taskId, BigInt(job.data.chatId), "completed").catch(
      () => {},
    );
  }

  await pusher.pushFinalResult(
    `✅ <b>SMTP проверка #${taskId} завершена</b>\n\n` +
      `Проверено: ${processed}\n` +
      `Deliverable: ${deliverable}\n` +
      `Undeliverable: ${undeliverable}\n` +
      `Ошибки: ${errors}`,
  );

  await notifyTaskCompleted(taskId);

  return { processed, deliverable, undeliverable, errors };
}

export function createSmtpBatchWorker() {
  const worker = new Worker<SmtpBatchJobData>(
    "smtp-batch",
    processSmtpBatch,
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on("completed", (job) =>
    log(`SMTP batch job ${job.id}: completed`),
  );
  worker.on("failed", (job, err) =>
    error(`SMTP batch job ${job?.id}: failed — ${err.message}`),
  );

  return worker;
}
