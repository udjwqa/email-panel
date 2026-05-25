import IORedis from "ioredis";
import { InlineKeyboard } from "grammy";
import { db } from "../../services/db.js";
import { config } from "../../config.js";
import { audit } from "../../services/audit.js";
import {
  formatAuditTaskDetail,
  formatStatus,
} from "../../services/progress.js";
import type { BotContext } from "../types.js";

const PROGRESS_KEYS: Record<string, string> = {
  full_audit: "pipeline-progress:",
  web_auth: "web-auth-progress:",
  imap_validate: "imap-validate-progress:",
};

export async function statusCommand(ctx: BotContext) {
  const args = ctx.message?.text?.split(" ");
  const taskId = args?.[1] ? Number(args[1]) : null;

  if (!taskId || isNaN(taskId)) {
    await ctx.reply(
      "Использование: /status <ID задачи>\n\nПример: /status 42",
    );
    return;
  }

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.userId !== ctx.dbUser.id) {
    await ctx.reply("Задача не найдена.");
    return;
  }

  const tt = await db.telegramTask.findFirst({ where: { taskId } });
  let auditProgress: Record<string, unknown> | null = null;

  if (tt?.taskType) {
    const key = PROGRESS_KEYS[tt.taskType];
    if (key) {
      const redis = new IORedis(config.redis.url);
      const raw = await redis.get(key + taskId);
      if (raw) auditProgress = JSON.parse(raw);
      redis.disconnect();
    }
  }

  const text = formatAuditTaskDetail(
    task,
    tt?.taskType ?? null,
    auditProgress,
  );

  const kb = new InlineKeyboard();
  if (task.status === "PROCESSING" || task.status === "QUEUED") {
    kb.text("⏹ Отменить", `task:cancel:${taskId}`);
  }
  if (task.status === "PAUSED") {
    kb.text("▶ Продолжить", `task:resume:${taskId}`);
    kb.text("⏹ Отменить", `task:cancel:${taskId}`);
  }

  await ctx.reply(text, { reply_markup: kb });
}

export async function cancelCommand(ctx: BotContext) {
  const args = ctx.message?.text?.split(" ");
  const taskId = args?.[1] ? Number(args[1]) : null;

  if (!taskId || isNaN(taskId)) {
    await ctx.reply(
      "Использование: /cancel <ID задачи>\n\nПример: /cancel 42",
    );
    return;
  }

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.userId !== ctx.dbUser.id) {
    await ctx.reply("Задача не найдена.");
    return;
  }

  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    await ctx.reply(
      `Задача #${taskId} уже ${formatStatus(task.status).toLowerCase()}.`,
    );
    return;
  }

  await db.task.update({
    where: { id: taskId },
    data: { status: "CANCELLED" },
  });

  audit({
    userId: ctx.dbUser.id,
    type: "task_cancelled",
    level: "WARNING",
    message: `Task #${taskId} cancelled via /cancel command`,
  });

  await ctx.reply(`🚫 Задача #${taskId} отменена.`);
}
