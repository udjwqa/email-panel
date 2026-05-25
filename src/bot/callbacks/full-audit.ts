import { InlineKeyboard, InputFile } from "grammy";
import IORedis from "ioredis";
import { db } from "../../services/db.js";
import { pipelineQueue } from "../../services/queue.js";
import { trackTask } from "../../services/telegram/task-tracker.js";
import { renderProgressBar } from "../../services/progress.js";
import { audit } from "../../services/audit.js";
import { config } from "../../config.js";
import type { BotContext } from "../types.js";
import type { PipelineProgress } from "../../services/pipeline/security-audit-pipeline.js";

export async function handleAuditCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "select":
      return showAuditDetail(ctx, Number(parts[2]));
    case "run":
      return startAudit(ctx, Number(parts[2]));
    case "progress":
      return showAuditProgress(ctx, Number(parts[2]));
    case "file":
      return sendAuditFile(ctx, Number(parts[2]));
    case "report":
      return sendAuditReport(ctx, Number(parts[2]));
    case "cancel":
      return cancelAudit(ctx, Number(parts[2]));
    default:
      await ctx.answerCallbackQuery();
  }
}

async function showAuditDetail(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  const count = await db.email.count({
    where: { taskId, status: "MX_FOUND", password: { not: null } },
  });

  const text =
    `🔒 <b>Full Security Audit #${taskId}</b>\n\n` +
    `Файл: ${task.fileName}\n` +
    `Email для проверки: ${count}\n\n` +
    `<b>Pipeline выполнит 3 этапа:</b>\n` +
    `1️⃣ SMTP — проверка доставляемости\n` +
    `2️⃣ Web Auth — OAuth проверка паролей\n` +
    `3️⃣ IMAP — валидация аккаунтов\n\n` +
    `Каждый этап фильтрует данные для следующего.`;

  const kb = new InlineKeyboard()
    .text("▶ Запустить Full Audit", `audit:run:${taskId}`)
    .row()
    .text("◀ Назад", `audit:back`);

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  await ctx.answerCallbackQuery();
}

async function startAudit(ctx: BotContext, taskId: number) {
  const chatId = ctx.chat!.id;

  await pipelineQueue.add(`pipeline-${taskId}`, {
    taskId,
    chatId: chatId.toString(),
  });

  const msgId = ctx.callbackQuery?.message?.message_id;
  await trackTask(taskId, BigInt(chatId), "full_audit", msgId).catch(() => {});

  audit({
    userId: ctx.dbUser.id,
    type: "full_audit_started",
    level: "INFO",
    message: `Full audit pipeline started for task #${taskId}`,
  });

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", `audit:progress:${taskId}`)
    .text("⏹ Отменить", `audit:cancel:${taskId}`);

  await ctx.editMessageText(
    `⏳ <b>Full Audit #${taskId} запущен</b>\n\n` +
      `Stage 1: SMTP     ⏳ starting...\n` +
      `Stage 2: Web Auth ⏸ pending\n` +
      `Stage 3: IMAP     ⏸ pending`,
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery("Full Audit запущен");
}

async function showAuditProgress(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  if (task.status === "COMPLETED") {
    const redis = new IORedis(config.redis.url);
    const reportText = await redis.get(`pipeline-report:${taskId}`);
    redis.disconnect();

    const text =
      `✅ <b>Full Audit #${taskId} завершён</b>\n\n` +
      (reportText ?? `Проверено: ${task.processedRows}\nВалидных: ${task.validCount}`);

    const kb = new InlineKeyboard()
      .text("📥 Скачать валидные", `audit:file:${taskId}`)
      .row()
      .text("📋 Полный отчёт", `audit:report:${taskId}`);

    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
    await ctx.answerCallbackQuery("Audit завершён");
    return;
  }

  if (task.status === "CANCELLED") {
    await ctx.editMessageText(
      `🚫 <b>Full Audit #${taskId} отменён</b>`,
      { parse_mode: "HTML" },
    );
    await ctx.answerCallbackQuery();
    return;
  }

  // Show pipeline progress
  const redis = new IORedis(config.redis.url);
  const raw = await redis.get(`pipeline-progress:${taskId}`);
  redis.disconnect();

  let progressText = "";
  if (raw) {
    const progress: PipelineProgress = JSON.parse(raw);

    const stageIcon = (s: PipelineProgress["stages"]["smtp"]) => {
      if (s.status === "completed") return "✅";
      if (s.status === "running") return "⏳";
      return "⏸";
    };

    const stageInfo = (s: PipelineProgress["stages"]["smtp"]) => {
      if (s.status === "pending") return "pending";
      if (s.status === "completed") return `done (${s.success}/${s.total})`;
      return `${s.done}/${s.total}`;
    };

    progressText =
      `Stage 1: SMTP     ${stageIcon(progress.stages.smtp)} ${stageInfo(progress.stages.smtp)}\n` +
      `Stage 2: Web Auth ${stageIcon(progress.stages.web_auth)} ${stageInfo(progress.stages.web_auth)}\n` +
      `Stage 3: IMAP     ${stageIcon(progress.stages.imap)} ${stageInfo(progress.stages.imap)}`;

    const currentStage = progress.stages[progress.currentStage === "done" ? "imap" : progress.currentStage];
    if (currentStage && currentStage.total > 0) {
      progressText += `\n\n${renderProgressBar(currentStage.done, currentStage.total)}`;
    }
  }

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", `audit:progress:${taskId}`)
    .text("⏹ Отменить", `audit:cancel:${taskId}`);

  await ctx.editMessageText(
    `⏳ <b>Full Audit #${taskId}</b>\n\n` + (progressText || "Запуск..."),
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery();
}

async function sendAuditFile(ctx: BotContext, taskId: number) {
  const redis = new IORedis(config.redis.url);
  const csvContent = await redis.get(`pipeline-result:${taskId}`);
  redis.disconnect();

  if (!csvContent) {
    await ctx.answerCallbackQuery("Результаты не найдены");
    return;
  }

  const buffer = Buffer.from(csvContent, "utf-8");
  const fileName = `full_audit_${taskId}_${Date.now()}.csv`;

  await ctx.replyWithDocument(new InputFile(buffer, fileName), {
    caption: `📥 Валидные credentials из Full Audit #${taskId}`,
  });
  await ctx.answerCallbackQuery();
}

async function sendAuditReport(ctx: BotContext, taskId: number) {
  const redis = new IORedis(config.redis.url);
  const reportText = await redis.get(`pipeline-report:${taskId}`);
  redis.disconnect();

  if (!reportText) {
    await ctx.answerCallbackQuery("Отчёт не найден");
    return;
  }

  const buffer = Buffer.from(reportText, "utf-8");
  const fileName = `audit_report_${taskId}_${Date.now()}.txt`;

  await ctx.replyWithDocument(new InputFile(buffer, fileName), {
    caption: `📋 Full Audit Report #${taskId}`,
  });
  await ctx.answerCallbackQuery();
}

async function cancelAudit(ctx: BotContext, taskId: number) {
  await db.task.update({
    where: { id: taskId },
    data: { status: "CANCELLED" },
  });

  audit({
    userId: ctx.dbUser.id,
    type: "full_audit_cancelled",
    level: "INFO",
    message: `Full audit cancelled for task #${taskId}`,
  });

  await ctx.editMessageText(
    `🚫 <b>Full Audit #${taskId} отменён</b>`,
    { parse_mode: "HTML" },
  );
  await ctx.answerCallbackQuery("Audit отменён");
}
