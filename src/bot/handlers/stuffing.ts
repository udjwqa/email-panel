import { InlineKeyboard } from "grammy";
import { getComboStats } from "../../services/combolist/importer.js";
import type { BotContext } from "../types.js";

export async function stuffingCommand(ctx: BotContext) {
  const stats = await getComboStats(ctx.dbUser.id);

  const pending = stats.byStatus["pending"] ?? 0;
  const success = stats.byStatus["success"] ?? 0;
  const failed = stats.byStatus["failed"] ?? 0;

  const kb = new InlineKeyboard()
    .text("📂 Import Combo List", "stuff:import")
    .row()
    .text("▶ Start Stuffing", "stuff:run")
    .row()
    .text("📊 Stats", "stuff:stats")
    .text("⏹ Stop", "stuff:stop")
    .row()
    .text("« Menu", "stuff:back");

  await ctx.reply(
    `🔓 <b>Credential Stuffing</b>\n\n` +
      `📊 Combo Entries:\n` +
      `  Total: ${stats.total}\n` +
      `  Pending: ${pending}\n` +
      `  Success: ${success}\n` +
      `  Failed: ${failed}\n\n` +
      `Import combo list (email:password) или запустите stuffing:`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}

export async function importComboCommand(ctx: BotContext) {
  (ctx.session as any).awaitingComboFile = true;
  await ctx.reply(
    "📂 <b>Import Combo List</b>\n\n" +
      "Отправьте .txt файл в формате:\n" +
      "<code>email:password</code>\n" +
      "<code>email;password</code>\n" +
      "<code>email|password</code>\n\n" +
      "Один combo на строку.",
    { parse_mode: "HTML" },
  );
}
