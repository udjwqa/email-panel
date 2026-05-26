import { InlineKeyboard } from "grammy";
import { BreachLookup } from "../../services/breach/lookup.js";
import type { BotContext } from "../types.js";

export async function handleBreachCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("breach:")) return;

  const action = data.split(":")[1];

  switch (action) {
    case "start":
      return promptBreachSearch(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

async function promptBreachSearch(ctx: BotContext) {
  (ctx.session as any).breachSearchMode = true;

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🔍 <b>Breach Search</b>\n\n` +
      `Введите email для поиска в утечках:\n\n` +
      `<i>Поддержка: DeHashed API (нужен ключ в настройках)</i>`,
    { parse_mode: "HTML" },
  );
}

export async function handleBreachTextInput(ctx: BotContext): Promise<boolean> {
  if (!(ctx.session as any).breachSearchMode) return false;

  const email = ctx.message?.text?.trim();
  if (!email || !email.includes("@")) return false;

  (ctx.session as any).breachSearchMode = false;

  const lookup = new BreachLookup();
  const passwords = await lookup.findKnownPasswords(email);

  const kb = new InlineKeyboard()
    .text("🔍 Искать другой", "breach:start")
    .row()
    .text("◀ Security", "section:security");

  if (passwords.length > 0) {
    const list = passwords.map((p) => `  • <code>${p}</code>`).join("\n");
    await ctx.reply(
      `🔍 <b>Breach Search: ${email}</b>\n\n` +
        `🔓 Найдено ${passwords.length} паролей:\n${list}\n\n` +
        `<i>Можно использовать в Recovery для проверки</i>`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  } else {
    await ctx.reply(
      `🔍 <b>Breach Search: ${email}</b>\n\n` +
        `✅ Пароли не найдены в утечках.\n\n` +
        `<i>Совет: добавьте DeHashed API key в ⚙️ Настройки</i>`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  }

  return true;
}
