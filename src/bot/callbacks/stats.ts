import { InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import { getDashboard, Period } from "../../services/stats.js";

const PERIODS: { id: Period; label: string }[] = [
  { id: "1h", label: "1ч" },
  { id: "24h", label: "24ч" },
  { id: "7d", label: "7д" },
  { id: "30d", label: "30д" },
  { id: "all", label: "Всё" },
];

function periodKeyboard(active: Period) {
  const kb = new InlineKeyboard();
  for (const p of PERIODS) {
    const label = p.id === active ? `•${p.label}` : p.label;
    kb.text(label, `stat:${p.id}`);
  }
  kb.row();
  kb.text("« Главное меню", "stat:back");
  return kb;
}

export async function showStats(ctx: BotContext, period: Period) {
  const text = await getDashboard(period);

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, {
      reply_markup: periodKeyboard(period),
    });
  } else {
    await ctx.reply(text, {
      reply_markup: periodKeyboard(period),
    });
  }
}

export async function handleStatsCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("stat:")) return;

  const periodStr = data.replace("stat:", "");

  if (periodStr === "back") {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Выберите действие:", {
      reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
    });
    return;
  }

  const validPeriods: Period[] = ["1h", "24h", "7d", "30d", "all"];
  const period = validPeriods.includes(periodStr as Period)
    ? (periodStr as Period)
    : "24h";

  await showStats(ctx, period);
}
