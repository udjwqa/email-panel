import { InlineKeyboard } from "grammy";
import IORedis from "ioredis";
import { BotContext } from "../types.js";
import { db } from "../../services/db.js";
import { emailQueue } from "../../services/queue.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import { audit } from "../../services/audit.js";
import { config } from "../../config.js";
import {
  formatStatus,
  formatDate,
  formatAuditTaskDetail,
  getTaskTypeIcon,
} from "../../services/progress.js";

const PAGE_SIZE = 5;

export async function handleTaskCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("task:")) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "list":
      return showTaskList(ctx, Number(parts[2]) || 0);
    case "detail":
      return showTaskDetail(ctx, Number(parts[2]));
    case "progress":
      return showTaskDetail(ctx, Number(parts[2]));
    case "pause":
      return pauseTask(ctx, Number(parts[2]));
    case "resume":
      return resumeTask(ctx, Number(parts[2]));
    case "cancel":
      return cancelTask(ctx, Number(parts[2]));
    case "back":
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("Выберите действие:", {
        reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
      });
      return;
    default:
      await ctx.answerCallbackQuery("Неизвестная команда");
  }
}

export async function showTaskList(ctx: BotContext, page: number) {
  const total = await db.task.count({ where: { userId: ctx.dbUser.id } });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  const tasks = await db.task.findMany({
    where: { userId: ctx.dbUser.id },
    orderBy: { createdAt: "desc" },
    skip: safePage * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // Load audit task types
  const telegramTasks = await db.telegramTask.findMany({
    where: { taskId: { in: tasks.map((t) => t.id) } },
    select: { taskId: true, taskType: true },
  });
  const typeMap = new Map(telegramTasks.map((t) => [t.taskId, t.taskType]));

  let text = `📋 Мои задачи (стр. ${safePage + 1}/${totalPages})\n\n`;

  if (tasks.length === 0) {
    text += "Задач пока нет.";
  } else {
    text += tasks
      .map((t, i) => {
        const icon = getTaskTypeIcon(typeMap.get(t.id) ?? null);
        return `${safePage * PAGE_SIZE + i + 1}. ${icon} ${t.fileName} — ${formatStatus(t.status)} — ${formatDate(t.createdAt)}`;
      })
      .join("\n");
  }

  const kb = new InlineKeyboard();

  for (const t of tasks) {
    kb.text(`#${t.id} ${t.fileName}`, `task:detail:${t.id}`).row();
  }

  if (totalPages > 1) {
    if (safePage > 0) kb.text("◀ Назад", `task:list:${safePage - 1}`);
    if (safePage < totalPages - 1)
      kb.text("▶ Далее", `task:list:${safePage + 1}`);
    kb.row();
  }

  kb.text("« Главное меню", "task:back");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { reply_markup: kb });
}

async function showTaskDetail(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.userId !== ctx.dbUser.id) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  const tt = await db.telegramTask.findFirst({ where: { taskId } });
  let auditProgress: Record<string, unknown> | null = null;

  if (tt?.taskType) {
    const PROGRESS_KEYS: Record<string, string> = {
      full_audit: "pipeline-progress:",
      web_auth: "web-auth-progress:",
      imap_validate: "imap-validate-progress:",
    };
    const key = PROGRESS_KEYS[tt.taskType];
    if (key) {
      const redis = new IORedis(config.redis.url);
      const raw = await redis.get(key + taskId);
      if (raw) auditProgress = JSON.parse(raw);
      redis.disconnect();
    }
  }

  const text = formatAuditTaskDetail(task, tt?.taskType ?? null, auditProgress);
  const kb = new InlineKeyboard();

  switch (task.status) {
    case "PROCESSING":
      kb.text("🔄 Обновить", `task:progress:${taskId}`);
      kb.text("⏸ Пауза", `task:pause:${taskId}`);
      kb.row();
      kb.text("✖ Отмена", `task:cancel:${taskId}`);
      break;
    case "PAUSED":
      kb.text("▶ Продолжить", `task:resume:${taskId}`);
      kb.text("✖ Отмена", `task:cancel:${taskId}`);
      break;
    case "QUEUED":
      kb.text("🔄 Обновить", `task:progress:${taskId}`);
      kb.text("✖ Отмена", `task:cancel:${taskId}`);
      break;
    case "COMPLETED":
      if (tt?.taskType) {
        kb.text("📥 Скачать результаты", `aexp:task:${taskId}`);
      }
      break;
  }

  kb.row();
  kb.text("« К списку", "task:list:0");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { reply_markup: kb });
}

async function pauseTask(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.userId !== ctx.dbUser.id) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  if (task.status !== "PROCESSING") {
    await ctx.answerCallbackQuery("Задача не в обработке");
    return;
  }

  await db.task.update({
    where: { id: taskId },
    data: { status: "PAUSED" },
  });

  audit({ userId: ctx.dbUser.id, type: "task_paused", level: "INFO", message: `Task #${taskId} paused` });

  await ctx.answerCallbackQuery("⏸ Задача приостановлена");
  return showTaskDetail(ctx, taskId);
}

async function resumeTask(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.userId !== ctx.dbUser.id) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  if (task.status !== "PAUSED") {
    await ctx.answerCallbackQuery("Задача не на паузе");
    return;
  }

  await db.task.update({
    where: { id: taskId },
    data: { status: "QUEUED" },
  });

  await emailQueue.add(
    "validate",
    { taskId },
    { jobId: `task-${taskId}-resume-${Date.now()}` },
  );

  audit({ userId: ctx.dbUser.id, type: "task_resumed", level: "INFO", message: `Task #${taskId} resumed` });

  await ctx.answerCallbackQuery("▶ Задача возобновлена");
  return showTaskDetail(ctx, taskId);
}

async function cancelTask(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.userId !== ctx.dbUser.id) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    await ctx.answerCallbackQuery("Задача уже завершена");
    return;
  }

  await db.task.update({
    where: { id: taskId },
    data: { status: "CANCELLED" },
  });

  audit({ userId: ctx.dbUser.id, type: "task_cancelled", level: "WARNING", message: `Task #${taskId} cancelled` });

  await ctx.answerCallbackQuery("🚫 Задача отменена");
  return showTaskDetail(ctx, taskId);
}
