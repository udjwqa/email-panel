import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import {
  redisConnection,
  type MatchingJobData,
} from "../services/queue.js";
import { CredentialMatchingEngine } from "../services/matching/engine.js";
import { ProgressPusher } from "../services/telegram/progress-pusher.js";
import { renderProgressBar } from "../services/progress.js";
import { updateTaskStatus } from "../services/telegram/task-tracker.js";
import { audit } from "../services/audit.js";
import { config } from "../config.js";
import { log, error } from "../utils/logger.js";

async function processMatchingJob(job: Job<MatchingJobData>) {
  const { userId, taskId, emails, dictionaryIds, method, chatId } = job.data;

  const pusher = new ProgressPusher(taskId ?? 0, "match");
  await pusher.init();

  const engine = new CredentialMatchingEngine(userId);

  // Progress push interval
  const interval = setInterval(async () => {
    const p = engine.progress;
    if (p.totalEmails === 0) return;

    await pusher.pushProgress(
      `⏳ <b>Восстановление доступа</b>\n\n` +
        renderProgressBar(p.processed, p.totalEmails) +
        `\nEmail: ${p.processed} / ${p.totalEmails}\n` +
        `Найдено: ${p.found} | Не найдено: ${p.notFound}`,
    );
  }, 5000);

  try {
    const result = await engine.run({
      taskId,
      emails,
      dictionaryIds,
      method,
    });

    clearInterval(interval);

    // Save results to Redis for bot
    const redis = new IORedis(config.redis.url);
    if (result.matches.length > 0) {
      const csvLines = ["email,password"];
      for (const m of result.matches) {
        csvLines.push(`${m.email},${m.password}`);
      }
      await redis.set(
        `matching-result:${userId}:${taskId ?? "direct"}`,
        csvLines.join("\n"),
        "EX",
        86400,
      );
    }
    redis.disconnect();

    await pusher.pushFinalResult(
      `✅ <b>Восстановление завершено</b>\n\n` +
        `Проверено: ${result.totalEmails}\n` +
        `Найдено: ${result.found} (${result.totalEmails > 0 ? Math.round((result.found / result.totalEmails) * 100) : 0}%)\n` +
        `Не найдено: ${result.notFound}\n` +
        `Время: ${Math.round(result.duration / 1000)}s`,
    );

    if (chatId && taskId) {
      await updateTaskStatus(taskId, BigInt(chatId), "completed").catch(() => {});
    }

    audit({
      userId,
      type: "matching_completed",
      level: "INFO",
      message: `Matching: ${result.found}/${result.totalEmails} found in ${Math.round(result.duration / 1000)}s`,
    });

    return result;
  } catch (err) {
    clearInterval(interval);
    throw err;
  }
}

export function createMatchingWorker() {
  const worker = new Worker<MatchingJobData>(
    "credential-matching",
    processMatchingJob,
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on("completed", (job) =>
    log(`Matching job ${job.id}: completed`),
  );
  worker.on("failed", (job, err) =>
    error(`Matching job ${job?.id}: failed — ${err.message}`),
  );

  return worker;
}
