import { InlineKeyboard, InputFile } from "grammy";
import IORedis from "ioredis";
import { db } from "../../services/db.js";
import { imapValidateBatchQueue } from "../../services/queue.js";
import { getDomainGroup } from "../../services/domain-groups.js";
import { trackTask } from "../../services/telegram/task-tracker.js";
import { renderProgressBar } from "../../services/progress.js";
import { audit } from "../../services/audit.js";
import { config } from "../../config.js";
import type { BotContext } from "../types.js";

export async function handleValidateCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "select":
      return showValidateDetail(ctx, Number(parts[2]));
    case "run":
      return startValidation(ctx, Number(parts[2]), parts[3] as "all" | "clean" | "2fa");
    case "progress":
      return showValidateProgress(ctx, Number(parts[2]));
    case "file":
      return sendValidatedFile(ctx, Number(parts[2]));
    case "report":
      return sendReport(ctx, Number(parts[2]));
    case "cancel":
      return cancelValidation(ctx, Number(parts[2]));
    case "back":
      return showValidateList(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

async function showValidateList(ctx: BotContext) {
  const tasks = await db.task.findMany({
    where: { userId: ctx.dbUser.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const withCounts = await Promise.all(
    tasks.map(async (t) => {
      const count = await db.email.count({
        where: { taskId: t.id, status: "MX_FOUND", password: { not: null } },
      });
      return { ...t, authCount: count };
    }),
  );

  const eligible = withCounts.filter((t) => t.authCount > 0);

  if (eligible.length === 0) {
    await ctx.editMessageText("🔐 Нет задач для IMAP валидации.");
    await ctx.answerCallbackQuery();
    return;
  }

  const kb = new InlineKeyboard();
  for (const t of eligible) {
    kb.text(
      `📋 #${t.id} — ${t.fileName} (${t.authCount})`,
      `validate:select:${t.id}`,
    ).row();
  }

  await ctx.editMessageText(
    "🔐 <b>IMAP Валидация</b>\n\nВыберите задачу:",
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery();
}

async function showValidateDetail(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  const emails = await db.email.findMany({
    where: { taskId, status: "MX_FOUND", password: { not: null } },
    select: { email: true },
  });

  const providerCounts: Record<string, number> = {};
  for (const row of emails) {
    const domain = row.email.split("@")[1]?.toLowerCase() ?? "";
    const provider = getDomainGroup(domain);
    providerCounts[provider] = (providerCounts[provider] ?? 0) + 1;
  }

  const sorted = Object.entries(providerCounts).sort((a, b) => b[1] - a[1]);
  const breakdown = sorted.map(([p, c]) => `  ${p}: ${c}`).join("\n");

  const text =
    `🔐 <b>IMAP Валидация #${taskId}</b>\n\n` +
    `Файл: ${task.fileName}\n\n` +
    `<b>По провайдерам:</b>\n${breakdown}\n\n` +
    `Итого: ${emails.length}\n\n` +
    `Выберите фильтр экспорта:`;

  const kb = new InlineKeyboard()
    .text("✅ Все валидные", `validate:run:${taskId}:all`)
    .row()
    .text("🟢 Только чистые", `validate:run:${taskId}:clean`)
    .text("🔵 Только 2FA", `validate:run:${taskId}:2fa`)
    .row()
    .text("◀ Назад", "validate:back");

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  await ctx.answerCallbackQuery();
}

async function startValidation(
  ctx: BotContext,
  taskId: number,
  filter: "all" | "clean" | "2fa",
) {
  const chatId = ctx.chat!.id;

  const count = await db.email.count({
    where: { taskId, status: "MX_FOUND", password: { not: null } },
  });

  if (count === 0) {
    await ctx.answerCallbackQuery("Нет email для проверки");
    return;
  }

  await imapValidateBatchQueue.add(`imap-validate-${taskId}`, {
    taskId,
    chatId: chatId.toString(),
    filter,
  });

  const msgId = ctx.callbackQuery?.message?.message_id;
  await trackTask(taskId, BigInt(chatId), "imap_validate", msgId).catch(() => {});

  const filterLabel =
    filter === "clean" ? "только чистые" : filter === "2fa" ? "только 2FA" : "все валидные";

  audit({
    userId: ctx.dbUser.id,
    type: "imap_validate_started",
    level: "INFO",
    message: `IMAP validation started for task #${taskId} (${count} emails, filter: ${filter})`,
  });

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", `validate:progress:${taskId}`)
    .text("⏹ Отменить", `validate:cancel:${taskId}`);

  await ctx.editMessageText(
    `⏳ <b>IMAP валидация #${taskId} запущена</b>\n` +
      `Фильтр: ${filterLabel}\n\n` +
      renderProgressBar(0, count) +
      `\nОбработано: 0 / ${count}`,
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery("Валидация запущена");
}

async function showValidateProgress(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  if (task.status === "COMPLETED") {
    const redis = new IORedis(config.redis.url);
    const reportText = await redis.get(`imap-validate-report:${taskId}`);
    redis.disconnect();

    const text =
      `✅ <b>IMAP Валидация #${taskId} завершена</b>\n\n` +
      (reportText ?? `Проверено: ${task.processedRows}\nУспешных: ${task.validCount}\nНеуспешных: ${task.invalidCount}`);

    const kb = new InlineKeyboard()
      .text("📥 Скачать валидные", `validate:file:${taskId}`)
      .row()
      .text("📋 Полный отчёт", `validate:report:${taskId}`);

    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
    await ctx.answerCallbackQuery("Валидация завершена");
    return;
  }

  if (task.status === "PAUSED" || task.status === "CANCELLED") {
    await ctx.editMessageText(
      `⏸ <b>IMAP валидация #${taskId} — ${task.status === "PAUSED" ? "приостановлена" : "отменена"}</b>`,
      { parse_mode: "HTML" },
    );
    await ctx.answerCallbackQuery();
    return;
  }

  const totalCount = await db.email.count({
    where: {
      taskId,
      status: { in: ["MX_FOUND", "PROCESSED"] },
      password: { not: null },
    },
  });

  // Show status breakdown from Redis
  const redis = new IORedis(config.redis.url);
  const raw = await redis.get(`imap-validate-progress:${taskId}`);
  redis.disconnect();

  let statusText = "";
  if (raw) {
    const counts = JSON.parse(raw);
    statusText =
      `\n  Clean: ${counts.active_clean ?? 0}` +
      `  2FA: ${counts.active_with_2fa ?? 0}` +
      `  Locked: ${counts.locked ?? 0}`;
  }

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", `validate:progress:${taskId}`)
    .text("⏹ Отменить", `validate:cancel:${taskId}`);

  await ctx.editMessageText(
    `⏳ <b>IMAP валидация #${taskId}</b>\n\n` +
      renderProgressBar(task.processedRows, totalCount) +
      `\nОбработано: ${task.processedRows} / ${totalCount}` +
      statusText,
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery();
}

async function sendValidatedFile(ctx: BotContext, taskId: number) {
  const redis = new IORedis(config.redis.url);
  const csvContent = await redis.get(`imap-validate-result:${taskId}`);
  redis.disconnect();

  if (!csvContent) {
    await ctx.answerCallbackQuery("Результаты не найдены");
    return;
  }

  const buffer = Buffer.from(csvContent, "utf-8");
  const fileName = `validated_${taskId}_${Date.now()}.csv`;

  await ctx.replyWithDocument(new InputFile(buffer, fileName), {
    caption: `📥 Валидные credentials задачи #${taskId}`,
  });
  await ctx.answerCallbackQuery();
}

async function sendReport(ctx: BotContext, taskId: number) {
  const redis = new IORedis(config.redis.url);
  const reportText = await redis.get(`imap-validate-report:${taskId}`);
  redis.disconnect();

  if (!reportText) {
    await ctx.answerCallbackQuery("Отчёт не найден");
    return;
  }

  const buffer = Buffer.from(reportText, "utf-8");
  const fileName = `report_${taskId}_${Date.now()}.txt`;

  await ctx.replyWithDocument(new InputFile(buffer, fileName), {
    caption: `📋 Отчёт IMAP валидации #${taskId}`,
  });
  await ctx.answerCallbackQuery();
}

async function cancelValidation(ctx: BotContext, taskId: number) {
  await db.task.update({
    where: { id: taskId },
    data: { status: "CANCELLED" },
  });

  audit({
    userId: ctx.dbUser.id,
    type: "imap_validate_cancelled",
    level: "INFO",
    message: `IMAP validation cancelled for task #${taskId}`,
  });

  await ctx.editMessageText(
    `🚫 <b>IMAP валидация #${taskId} отменена</b>`,
    { parse_mode: "HTML" },
  );
  await ctx.answerCallbackQuery("Валидация отменена");
}
