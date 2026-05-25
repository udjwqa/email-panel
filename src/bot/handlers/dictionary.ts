import { InlineKeyboard } from "grammy";
import { getDictionaries, getDictionaryStats } from "../../services/dictionary/manager.js";
import type { BotContext } from "../types.js";

export async function dictionaryCommand(ctx: BotContext) {
  const dictionaries = await getDictionaries(ctx.dbUser.id);
  const stats = await getDictionaryStats(ctx.dbUser.id);

  let text = `📖 <b>Словари паролей</b>\n\n`;
  text += `Всего: ${stats.totalDictionaries} словарей, ${stats.totalPasswords} паролей\n`;

  if (Object.keys(stats.byCategory).length > 0) {
    for (const [cat, count] of Object.entries(stats.byCategory)) {
      text += `  ${cat}: ${count}\n`;
    }
  }

  const kb = new InlineKeyboard()
    .text("📂 Загрузить словарь", "dict:upload:menu")
    .row();

  if (dictionaries.length > 0) {
    text += "\n<b>Мои словари:</b>\n";
    for (const d of dictionaries.slice(0, 10)) {
      const catIcon =
        d.category === "common" ? "📗" : d.category === "leaked" ? "📕" : "📘";
      text += `${catIcon} ${d.name} — ${d.entryCount} паролей\n`;
      kb.text(
        `${catIcon} ${d.name} (${d.entryCount})`,
        `dict:detail:${d.id}`,
      ).row();
    }
  }

  kb.text("🔍 Поиск пароля", "dict:search")
    .row()
    .text("« Главное меню", "dict:back");

  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}
