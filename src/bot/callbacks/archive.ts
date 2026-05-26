import { InlineKeyboard } from "grammy";
import {
  archiveInvalidCredentials,
  getArchivalStats,
} from "../../services/invalid-credentials/archiver.js";
import { db } from "../../services/db.js";
import { audit } from "../../services/audit.js";
import type { BotContext } from "../types.js";

export async function handleArchiveCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("arch:")) return;

  const action = data.split(":")[1];

  switch (action) {
    case "stats":
      return showArchiveStats(ctx);
    case "dryrun":
      return dryRun(ctx);
    case "run":
      return runArchive(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

async function showArchiveStats(ctx: BotContext) {
  const stats = await getArchivalStats();

  const pendingCount = await db.authResult.count({
    where: {
      status: { in: ["auth_failed", "account_not_found", "permanently_locked"] },
      checkedAt: { lte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  const statusBreakdown = Object.entries(stats.byStatus)
    .map(([status, count]) => `  ${status}: ${count}`)
    .join("\n") || "  (пусто)";

  const text =
    `🗄 <b>Архив невалидных credentials</b>\n\n` +
    `<b>В архиве:</b>\n` +
    `  Всего: ${stats.totalArchived}\n` +
    `${statusBreakdown}\n` +
    (stats.oldestRecord ? `  Самая старая: ${stats.oldestRecord.toLocaleDateString("ru-RU")}\n` : "") +
    `\n<b>Для архивации:</b>\n` +
    `  auth_failed старше 30 дней: ${pendingCount}\n`;

  const kb = new InlineKeyboard();

  if (pendingCount > 0) {
    kb.text(`🗄 Архивировать (${pendingCount})`, "arch:run").row();
  }
  kb.text("👁 Dry Run", "arch:dryrun").row();
  kb.text("🔄 Refresh", "arch:stats").row();
  kb.text("◀ Настройки", "section:admin");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
}

async function dryRun(ctx: BotContext) {
  await ctx.answerCallbackQuery("Запускаю dry run...");

  const result = await archiveInvalidCredentials({ dryRun: true });

  const kb = new InlineKeyboard()
    .text(`🗄 Архивировать (${result.archived})`, "arch:run")
    .row()
    .text("◀ Назад", "arch:stats");

  await ctx.editMessageText(
    `👁 <b>Dry Run результат</b>\n\n` +
      `Будет архивировано: ${result.archived}\n` +
      `Время: ${result.duration}ms\n\n` +
      `Нажмите "Архивировать" для реального выполнения:`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function runArchive(ctx: BotContext) {
  await ctx.answerCallbackQuery("Архивирую...");

  const result = await archiveInvalidCredentials(
    { dryRun: false },
    ctx.dbUser.id,
  );

  audit({
    userId: ctx.dbUser.id,
    type: "archive_manual",
    level: "INFO",
    message: `Manual archive: ${result.archived} archived, ${result.errors} errors`,
  });

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", "arch:stats")
    .row()
    .text("◀ Настройки", "section:admin");

  await ctx.editMessageText(
    `✅ <b>Архивация завершена</b>\n\n` +
      `Архивировано: ${result.archived}\n` +
      `Удалено из AuthResult: ${result.deleted}\n` +
      `Ошибки: ${result.errors}\n` +
      `Время: ${result.duration}ms`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}
