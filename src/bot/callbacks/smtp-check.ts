import { InlineKeyboard } from "grammy";
import { db } from "../../services/db.js";
import { smtpBatchQueue } from "../../services/queue.js";
import { trackTask } from "../../services/telegram/task-tracker.js";
import { renderProgressBar } from "../../services/progress.js";
import { audit } from "../../services/audit.js";
import type { BotContext } from "../types.js";

export async function handleSmtpCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "select":
      return showSmtpTaskDetail(ctx, Number(parts[2]));
    case "run":
      return startSmtpCheck(ctx, Number(parts[2]));
    case "progress":
      return showSmtpProgress(ctx, Number(parts[2]));
    case "cancel":
      return cancelSmtpCheck(ctx, Number(parts[2]));
    case "back":
      return showSmtpTaskList(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

async function showSmtpTaskList(ctx: BotContext) {
  const tasks = await db.task.findMany({
    where: {
      userId: ctx.dbUser.id,
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const tasksWithCounts = await Promise.all(
    tasks.map(async (t) => {
      const mxCount = await db.email.count({
        where: { taskId: t.id, status: "MX_FOUND" },
      });
      return { ...t, mxCount };
    }),
  );

  const eligible = tasksWithCounts.filter((t) => t.mxCount > 0);

  if (eligible.length === 0) {
    await ctx.editMessageText("📧 Нет задач с MX_FOUND email'ами.");
    await ctx.answerCallbackQuery();
    return;
  }

  const kb = new InlineKeyboard();
  for (const t of eligible) {
    kb.text(
      `📋 #${t.id} — ${t.fileName} (${t.mxCount})`,
      `smtp:select:${t.id}`,
    ).row();
  }

  await ctx.editMessageText(
    "📧 <b>SMTP Проверка</b>\n\nВыберите задачу:",
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery();
}

async function showSmtpTaskDetail(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  const mxCount = await db.email.count({
    where: { taskId, status: "MX_FOUND" },
  });

  const text =
    `📧 <b>SMTP Проверка задачи #${taskId}</b>\n\n` +
    `Файл: ${task.fileName}\n` +
    `Email'ов для проверки: ${mxCount}\n\n` +
    `Нажмите "Запустить SMTP" для начала.`;

  const kb = new InlineKeyboard()
    .text("▶ Запустить SMTP", `smtp:run:${taskId}`)
    .row()
    .text("◀ Назад", "smtp:back");

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  await ctx.answerCallbackQuery();
}

async function startSmtpCheck(ctx: BotContext, taskId: number) {
  const chatId = ctx.chat!.id;

  const mxCount = await db.email.count({
    where: { taskId, status: "MX_FOUND" },
  });

  if (mxCount === 0) {
    await ctx.answerCallbackQuery("Нет email'ов для проверки");
    return;
  }

  const msgId = ctx.callbackQuery?.message?.message_id;

  await smtpBatchQueue.add(`smtp-task-${taskId}`, {
    taskId,
    chatId: chatId.toString(),
  });

  await trackTask(taskId, BigInt(chatId), "smtp_check", msgId).catch(() => {});

  audit({
    userId: ctx.dbUser.id,
    type: "smtp_check_started",
    level: "INFO",
    message: `SMTP check started for task #${taskId} (${mxCount} emails)`,
  });

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", `smtp:progress:${taskId}`)
    .text("⏹ Отменить", `smtp:cancel:${taskId}`);

  await ctx.editMessageText(
    `⏳ <b>SMTP проверка #${taskId} запущена</b>\n\n` +
      renderProgressBar(0, mxCount) +
      `\nОбработано: 0 / ${mxCount}`,
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery("SMTP проверка запущена");
}

async function showSmtpProgress(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  const mxTotal = await db.email.count({
    where: { taskId, status: { in: ["MX_FOUND", "PROCESSED"] } },
  });

  if (task.status === "COMPLETED") {
    const text =
      `✅ <b>SMTP проверка #${taskId} завершена</b>\n\n` +
      `Проверено: ${task.processedRows}\n` +
      `Доставляемые: ${task.validCount}\n` +
      `Недоставляемые: ${task.invalidCount}\n` +
      `Ошибки: ${task.errorCount}`;

    await ctx.editMessageText(text, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery("Проверка завершена");
    return;
  }

  if (task.status === "PAUSED" || task.status === "CANCELLED") {
    await ctx.editMessageText(
      `⏸ <b>SMTP проверка #${taskId} — ${task.status === "PAUSED" ? "приостановлена" : "отменена"}</b>\n\n` +
        `Обработано: ${task.processedRows} / ${mxTotal}`,
      { parse_mode: "HTML" },
    );
    await ctx.answerCallbackQuery();
    return;
  }

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", `smtp:progress:${taskId}`)
    .text("⏹ Отменить", `smtp:cancel:${taskId}`);

  await ctx.editMessageText(
    `⏳ <b>SMTP проверка #${taskId}</b>\n\n` +
      renderProgressBar(task.processedRows, mxTotal) +
      `\nОбработано: ${task.processedRows} / ${mxTotal}`,
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery();
}

async function cancelSmtpCheck(ctx: BotContext, taskId: number) {
  await db.task.update({
    where: { id: taskId },
    data: { status: "CANCELLED" },
  });

  audit({
    userId: ctx.dbUser.id,
    type: "smtp_check_cancelled",
    level: "INFO",
    message: `SMTP check cancelled for task #${taskId}`,
  });

  await ctx.editMessageText(
    `🚫 <b>SMTP проверка #${taskId} отменена</b>`,
    { parse_mode: "HTML" },
  );
  await ctx.answerCallbackQuery("Проверка отменена");
}
