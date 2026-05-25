import { InlineKeyboard } from "grammy";
import { LogLevel } from "@prisma/client";
import { BotContext } from "../types.js";
import { db } from "../../services/db.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";

type LogFilter = "errors" | "warnings" | "all";

const LEVEL_ICON: Record<LogLevel, string> = {
  CRITICAL: "🔴",
  ERROR: "🔴",
  WARNING: "🟡",
  INFO: "🔵",
};

const FILTER_LEVELS: Record<LogFilter, LogLevel[]> = {
  errors: ["ERROR", "CRITICAL"],
  warnings: ["WARNING", "ERROR", "CRITICAL"],
  all: ["INFO", "WARNING", "ERROR", "CRITICAL"],
};

function formatTimestamp(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${d}.${m} ${h}:${min}`;
}

export async function showLogs(ctx: BotContext, filter: LogFilter) {
  const levels = FILTER_LEVELS[filter];

  const logs = await db.log.findMany({
    where: { level: { in: levels } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  let text = `📋 Системные логи (${filter === "errors" ? "ошибки" : filter === "warnings" ? "важные" : "все"})\n\n`;

  if (logs.length === 0) {
    text += "Записей нет.";
  } else {
    text += logs
      .map(
        (l) =>
          `${LEVEL_ICON[l.level]} [${formatTimestamp(l.createdAt)}] ${l.type}\n    ${l.message}`,
      )
      .join("\n\n");
  }

  const kb = new InlineKeyboard()
    .text(
      filter === "errors" ? "•Ошибки" : "🔴 Ошибки",
      "log:view:errors",
    )
    .text(
      filter === "warnings" ? "•Важные" : "🟡 Важные",
      "log:view:warnings",
    )
    .text(filter === "all" ? "•Все" : "🔵 Все", "log:view:all")
    .row()
    .text("🔄 Обновить", `log:view:${filter}`)
    .row()
    .text("« Главное меню", "log:back");

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, { reply_markup: kb });
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

export async function handleLogsCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("log:")) return;

  const parts = data.split(":");
  const action = parts[1];

  if (action === "back") {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Выберите действие:", {
      reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
    });
    return;
  }

  if (action === "view") {
    const filter = (parts[2] ?? "all") as LogFilter;
    const validFilters: LogFilter[] = ["errors", "warnings", "all"];
    return showLogs(
      ctx,
      validFilters.includes(filter) ? filter : "all",
    );
  }
}
