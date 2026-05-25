import IORedis from "ioredis";
import { db } from "../db.js";
import { verifyMailbox } from "../smtp/verifier.js";
import { OAuthClient } from "../oauth/client.js";
import { HttpClient } from "../http/client.js";
import { IMAPVerifier } from "../imap/verifier.js";
import { getImapConfig, getImapProvider } from "../imap/host-resolver.js";
import { getDomainGroup } from "../domain-groups.js";
import { config } from "../../config.js";
import { audit } from "../audit.js";
import { ProgressPusher } from "../telegram/progress-pusher.js";
import { renderProgressBar } from "../progress.js";

type StageStatus = "pending" | "running" | "completed" | "cancelled";

interface StageProgress {
  status: StageStatus;
  total: number;
  done: number;
  success: number;
  failed: number;
}

export interface PipelineProgress {
  currentStage: "smtp" | "web_auth" | "imap" | "done";
  stages: {
    smtp: StageProgress;
    web_auth: StageProgress;
    imap: StageProgress;
  };
}

export interface PipelineResult {
  smtp: { total: number; deliverable: number; undeliverable: number };
  webAuth: { total: number; success: number; failed: number };
  imap: {
    total: number;
    active_clean: number;
    active_with_2fa: number;
    suspicious: number;
    restricted: number;
    locked: number;
  };
  finalClean: number;
  originalTotal: number;
}

interface EmailRecord {
  id: number;
  email: string;
  password: string | null;
}

export class SecurityAuditPipeline {
  private taskId: number;
  private chatId?: string;
  private redis: IORedis;
  private progressKey: string;
  private cancelled = false;
  private pusher: ProgressPusher;

  constructor(taskId: number, chatId?: string) {
    this.taskId = taskId;
    this.chatId = chatId;
    this.redis = new IORedis(config.redis.url);
    this.progressKey = `pipeline-progress:${taskId}`;
    this.pusher = new ProgressPusher(taskId, "audit");
  }

  async run(): Promise<PipelineResult> {
    try {
      await this.pusher.init();

      await db.task.update({
        where: { id: this.taskId },
        data: { status: "PROCESSING" },
      });

      const allEmails = await db.email.findMany({
        where: {
          taskId: this.taskId,
          status: "MX_FOUND",
          password: { not: null },
        },
        select: { id: true, email: true, password: true },
      });

      const progress: PipelineProgress = {
        currentStage: "smtp",
        stages: {
          smtp: { status: "pending", total: allEmails.length, done: 0, success: 0, failed: 0 },
          web_auth: { status: "pending", total: 0, done: 0, success: 0, failed: 0 },
          imap: { status: "pending", total: 0, done: 0, success: 0, failed: 0 },
        },
      };

      await this.saveProgress(progress);

      // Stage 1: SMTP
      progress.currentStage = "smtp";
      progress.stages.smtp.status = "running";
      await this.saveProgress(progress);

      const smtpDeliverable = await this.runSmtpStage(
        allEmails,
        progress,
      );

      progress.stages.smtp.status = "completed";
      await this.saveProgress(progress);

      await this.pusher.pushStageComplete(
        "Stage 1: SMTP",
        `Deliverable: ${smtpDeliverable.length}/${allEmails.length}`,
      );

      if (this.cancelled) return this.buildCancelledResult(progress);

      // Stage 2: Web Auth
      progress.currentStage = "web_auth";
      progress.stages.web_auth.status = "running";
      progress.stages.web_auth.total = smtpDeliverable.length;
      await this.saveProgress(progress);

      const webSuccessful = await this.runWebAuthStage(
        smtpDeliverable,
        progress,
      );

      progress.stages.web_auth.status = "completed";
      await this.saveProgress(progress);

      await this.pusher.pushStageComplete(
        "Stage 2: Web Auth",
        `Success: ${webSuccessful.length}/${smtpDeliverable.length}`,
      );

      if (this.cancelled) return this.buildCancelledResult(progress);

      // Stage 3: IMAP Validate
      progress.currentStage = "imap";
      progress.stages.imap.status = "running";
      progress.stages.imap.total = webSuccessful.length;
      await this.saveProgress(progress);

      const imapResults = await this.runImapStage(
        webSuccessful,
        progress,
      );

      progress.stages.imap.status = "completed";
      progress.currentStage = "done";
      await this.saveProgress(progress);

      // Build final result
      const result: PipelineResult = {
        smtp: {
          total: allEmails.length,
          deliverable: smtpDeliverable.length,
          undeliverable: allEmails.length - smtpDeliverable.length,
        },
        webAuth: {
          total: smtpDeliverable.length,
          success: webSuccessful.length,
          failed: smtpDeliverable.length - webSuccessful.length,
        },
        imap: imapResults,
        finalClean: imapResults.active_clean + imapResults.active_with_2fa,
        originalTotal: allEmails.length,
      };

      // Save result CSV
      const validEmails = webSuccessful.filter((e) => {
        const provider = getImapProvider(e.email);
        return provider !== "Unknown";
      });

      const csvLines = ["email,password,status,provider"];
      for (const e of validEmails) {
        const provider = getDomainGroup(e.email.split("@")[1] ?? "");
        csvLines.push(
          [e.email, e.password ?? "", "validated", provider]
            .map((f) => `"${f.replace(/"/g, '""')}"`)
            .join(","),
        );
      }
      await this.redis.set(
        `pipeline-result:${this.taskId}`,
        csvLines.join("\n"),
        "EX",
        86400,
      );

      // Save report
      const reportText = this.formatReport(result);
      await this.redis.set(
        `pipeline-report:${this.taskId}`,
        reportText,
        "EX",
        86400,
      );

      // Finalize task
      await db.task.update({
        where: { id: this.taskId },
        data: {
          status: "COMPLETED",
          validCount: result.finalClean,
          invalidCount: result.originalTotal - result.finalClean,
          processedRows: result.originalTotal,
          finishedAt: new Date(),
        },
      });

      const { InlineKeyboard } = await import("grammy");
      const finalKb = new InlineKeyboard()
        .text("📥 Скачать валидные", `audit:file:${this.taskId}`)
        .row()
        .text("📋 Полный отчёт", `audit:report:${this.taskId}`);

      await this.pusher.pushFinalResult(
        `✅ <b>Full Audit #${this.taskId} завершён</b>\n\n` + reportText,
        finalKb,
      );

      audit({
        type: "pipeline_completed",
        level: "INFO",
        message: `Pipeline #${this.taskId}: ${result.finalClean}/${result.originalTotal} clean`,
      });

      return result;
    } finally {
      this.redis.disconnect();
    }
  }

  private async runSmtpStage(
    emails: EmailRecord[],
    progress: PipelineProgress,
  ): Promise<EmailRecord[]> {
    const deliverable: EmailRecord[] = [];
    const mxCache = new Map();

    for (const record of emails) {
      if (await this.checkCancelled()) break;

      try {
        const result = await verifyMailbox(record.email, {
          timeout: 30_000,
          mxCache,
        });

        if (result.status === "deliverable") {
          deliverable.push(record);
          progress.stages.smtp.success++;
        } else {
          progress.stages.smtp.failed++;
        }
      } catch {
        progress.stages.smtp.failed++;
      }

      progress.stages.smtp.done++;

      if (progress.stages.smtp.done % 10 === 0) {
        await this.saveProgress(progress);
        await this.pusher.pushProgress(
          `⏳ <b>Full Audit #${this.taskId}</b>\n\n` +
            `Stage 1: SMTP ${renderProgressBar(progress.stages.smtp.done, progress.stages.smtp.total)}\n` +
            `Stage 2: Web Auth ⏸ pending\nStage 3: IMAP ⏸ pending`,
        );
      }
    }

    await this.saveProgress(progress);
    return deliverable;
  }

  private async runWebAuthStage(
    emails: EmailRecord[],
    progress: PipelineProgress,
  ): Promise<EmailRecord[]> {
    const successful: EmailRecord[] = [];
    const httpClient = new HttpClient();
    const oauthClient = new OAuthClient(httpClient);

    for (const record of emails) {
      if (await this.checkCancelled()) break;
      if (!record.password) {
        progress.stages.web_auth.failed++;
        progress.stages.web_auth.done++;
        continue;
      }

      try {
        const result = await oauthClient.authenticate(
          null,
          record.email,
          record.password,
        );

        if (result.success) {
          successful.push(record);
          progress.stages.web_auth.success++;
        } else {
          progress.stages.web_auth.failed++;
        }
      } catch {
        progress.stages.web_auth.failed++;
      }

      progress.stages.web_auth.done++;

      if (progress.stages.web_auth.done % 10 === 0) {
        await this.saveProgress(progress);
      }
    }

    await this.saveProgress(progress);
    return successful;
  }

  private async runImapStage(
    emails: EmailRecord[],
    progress: PipelineProgress,
  ): Promise<PipelineResult["imap"]> {
    const verifier = new IMAPVerifier(30_000);
    const counts = {
      total: 0,
      active_clean: 0,
      active_with_2fa: 0,
      suspicious: 0,
      restricted: 0,
      locked: 0,
    };

    for (const record of emails) {
      if (await this.checkCancelled()) break;

      const imapConfig = getImapConfig(record.email);
      if (!imapConfig || !record.password) {
        counts.locked++;
        progress.stages.imap.failed++;
        progress.stages.imap.done++;
        counts.total++;
        continue;
      }

      try {
        const result = await verifier.tryAuthenticateWithStatus(
          {
            host: imapConfig.host,
            port: imapConfig.port,
            user: record.email,
            password: record.password,
            tls: true,
          },
          5,
        );

        const status = result.accountStatus?.status ?? "locked";
        switch (status) {
          case "active_clean":
            counts.active_clean++;
            progress.stages.imap.success++;
            break;
          case "active_with_2fa":
            counts.active_with_2fa++;
            progress.stages.imap.success++;
            break;
          case "suspicious_activity":
            counts.suspicious++;
            progress.stages.imap.failed++;
            break;
          case "restricted":
            counts.restricted++;
            progress.stages.imap.failed++;
            break;
          default:
            counts.locked++;
            progress.stages.imap.failed++;
        }
      } catch {
        counts.locked++;
        progress.stages.imap.failed++;
      }

      counts.total++;
      progress.stages.imap.done++;

      if (progress.stages.imap.done % 5 === 0) {
        await this.saveProgress(progress);
      }
    }

    await this.saveProgress(progress);
    return counts;
  }

  private formatReport(result: PipelineResult): string {
    const pct = (n: number, t: number) =>
      t > 0 ? `${Math.round((n / t) * 100)}%` : "0%";

    return [
      `📊 FULL AUDIT REPORT #${this.taskId}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `Stage 1 — SMTP:`,
      `  Проверено: ${result.smtp.total}`,
      `  Deliverable: ${result.smtp.deliverable} (${pct(result.smtp.deliverable, result.smtp.total)})`,
      `  Undeliverable: ${result.smtp.undeliverable}`,
      ``,
      `Stage 2 — Web Auth:`,
      `  Проверено: ${result.webAuth.total}`,
      `  Success: ${result.webAuth.success} (${pct(result.webAuth.success, result.webAuth.total)})`,
      `  Failed: ${result.webAuth.failed}`,
      ``,
      `Stage 3 — IMAP Validate:`,
      `  Проверено: ${result.imap.total}`,
      `  Active Clean: ${result.imap.active_clean} (${pct(result.imap.active_clean, result.imap.total)})`,
      `  Active 2FA: ${result.imap.active_with_2fa} (${pct(result.imap.active_with_2fa, result.imap.total)})`,
      `  Suspicious: ${result.imap.suspicious}`,
      `  Restricted: ${result.imap.restricted}`,
      `  Locked: ${result.imap.locked}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `Итого: ${result.finalClean} чистых аккаунтов из ${result.originalTotal} исходных`,
    ].join("\n");
  }

  private async buildCancelledResult(progress: PipelineProgress): Promise<PipelineResult> {
    await this.pusher.pushCancelled();
    return {
      smtp: { total: progress.stages.smtp.total, deliverable: progress.stages.smtp.success, undeliverable: progress.stages.smtp.failed },
      webAuth: { total: progress.stages.web_auth.total, success: progress.stages.web_auth.success, failed: progress.stages.web_auth.failed },
      imap: { total: 0, active_clean: 0, active_with_2fa: 0, suspicious: 0, restricted: 0, locked: 0 },
      finalClean: 0,
      originalTotal: progress.stages.smtp.total,
    };
  }

  private async checkCancelled(): Promise<boolean> {
    if (this.cancelled) return true;
    const task = await db.task.findUnique({ where: { id: this.taskId } });
    if (task?.status === "CANCELLED" || task?.status === "PAUSED") {
      this.cancelled = true;
      return true;
    }
    return false;
  }

  private async saveProgress(progress: PipelineProgress): Promise<void> {
    await this.redis.set(this.progressKey, JSON.stringify(progress), "EX", 86400);
  }
}
