import { InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { db } from "../../services/db.js";
import { proxyCheckQueue } from "../../services/queue.js";
import { loadFromText } from "../../services/proxy/pool.js";
import { getStats, removeDead } from "../../services/proxy/pool.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import { audit } from "../../services/audit.js";

export async function showProxyMain(ctx: BotContext) {
  const stats = await getStats();
  const alivePct = stats.total > 0 ? Math.round((stats.alive / stats.total) * 100) : 0;

  const text =
    `🌐 Proxy Manager\n\n` +
    `📊 Статус пула:\n` +
    `  Всего: ${stats.total}\n` +
    `  ✅ Alive: ${stats.alive} (${alivePct}%)\n` +
    `  ❌ Dead: ${stats.dead}\n` +
    `  🐌 Slow: ${stats.slow}\n` +
    `  ❓ Unchecked: ${stats.unchecked}\n` +
    `  ⚡ Avg latency: ${stats.avgLatency}ms`;

  const kb = new InlineKeyboard()
    .text("📂 Загрузить", "prx:upload")
    .text("🔄 Проверить все", "prx:check")
    .row()
    .text("🗑 Удалить dead", "prx:clean")
    .text("📊 По протоколам", "prx:protocols")
    .row()
    .text("« Главное меню", "prx:back");

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, { reply_markup: kb });
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

export async function handleProxyCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("prx:")) return;

  const action = data.split(":")[1];

  switch (action) {
    case "main":
      return showProxyMain(ctx);

    case "upload": {
      ctx.session.settingsInput = "proxy_upload";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "📂 Загрузка прокси\n\n" +
          "Отправьте .txt файл с прокси-листом.\n\n" +
          "Поддерживаемые форматы:\n" +
          "• ip:port\n" +
          "• ip:port:user:pass\n" +
          "• socks5://ip:port\n" +
          "• http://user:pass@ip:port",
        {
          reply_markup: new InlineKeyboard().text("« Назад", "prx:main"),
        },
      );
      break;
    }

    case "check": {
      await proxyCheckQueue.add("check-all", { mode: "all" });
      audit({ userId: ctx.dbUser.id, type: "proxy_check_started", level: "INFO", message: "Proxy check started (all)" });
      await ctx.answerCallbackQuery("🔄 Проверка запущена");
      return showProxyMain(ctx);
    }

    case "clean": {
      const removed = await removeDead();
      audit({ userId: ctx.dbUser.id, type: "proxy_cleaned", level: "INFO", message: `Removed ${removed} dead proxies` });
      await ctx.answerCallbackQuery(`🗑 Удалено: ${removed}`);
      return showProxyMain(ctx);
    }

    case "protocols": {
      const groups = await db.proxy.groupBy({
        by: ["protocol"],
        _count: true,
        where: { status: "alive" },
      });

      let text = "📊 Alive прокси по протоколам:\n\n";
      for (const g of groups) {
        text += `  ${g.protocol}: ${g._count}\n`;
      }
      if (groups.length === 0) text += "  Нет alive прокси";

      await ctx.answerCallbackQuery();
      await ctx.editMessageText(text, {
        reply_markup: new InlineKeyboard().text("« Назад", "prx:main"),
      });
      break;
    }

    case "back": {
      ctx.session.settingsInput = undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("Выберите действие:", {
        reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
      });
      break;
    }
  }
}

export async function handleProxyFileUpload(ctx: BotContext): Promise<boolean> {
  if (ctx.session.settingsInput !== "proxy_upload") return false;

  const doc = ctx.message?.document;
  if (!doc) return false;

  const file = await ctx.api.getFile(doc.file_id);
  const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
  const response = await fetch(url);
  const text = await response.text();

  const result = await loadFromText(text);

  ctx.session.settingsInput = undefined;

  audit({ userId: ctx.dbUser.id, type: "proxy_uploaded", level: "INFO", message: `Loaded ${result.validLines} proxies (${result.duplicateCount} dupes)` });

  await ctx.reply(
    `✅ Прокси загружены\n\n` +
      `📊 Всего строк: ${result.totalLines}\n` +
      `✅ Валидных: ${result.validLines}\n` +
      `🔄 Дубликатов: ${result.duplicateCount}`,
    {
      reply_markup: new InlineKeyboard()
        .text("🔄 Проверить все", "prx:check")
        .row()
        .text("🌐 К пулу", "prx:main"),
    },
  );

  return true;
}
