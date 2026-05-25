import { InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import { showTaskList } from "./tasks.js";
import { handleGeneratorCallback } from "./generator.js";
import { showStats } from "./stats.js";
import { showExportMain } from "./export.js";
import { showProxyMain } from "./proxy.js";
import { showSettingsMain } from "./settings.js";
import { showLogs } from "./logs.js";
import { db } from "../../services/db.js";
import { getDomainGroup } from "../../services/domain-groups.js";

export async function handleMenuCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("menu:")) return;

  const action = data.replace("menu:", "");

  switch (action) {
    case "upload": {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "📂 Загрузка базы\n\n" +
          "Отправьте .txt файл с email-адресами.\n\n" +
          "Поддерживаемые форматы строк:\n" +
          "• email@example.com\n" +
          "• email@example.com:password\n" +
          "• email@example.com | data\n" +
          "• email@example.com,data",
        { reply_markup: backKeyboard() },
      );
      break;
    }
    case "generator": {
      ctx.callbackQuery!.data = "gen:start";
      return handleGeneratorCallback(ctx);
    }
    case "tasks": {
      return showTaskList(ctx, 0);
    }
    case "stats": {
      return showStats(ctx, "24h");
    }
    case "export": {
      return showExportMain(ctx);
    }
    case "proxy": {
      return showProxyMain(ctx);
    }
    case "settings": {
      return showSettingsMain(ctx);
    }
    case "logs": {
      return showLogs(ctx, "errors");
    }
    case "check_smtp": {
      return showMenuTaskList(ctx, "smtp");
    }
    case "check_web": {
      return showMenuTaskList(ctx, "web");
    }
    case "validate": {
      return showMenuTaskList(ctx, "validate");
    }
    case "full_audit": {
      return showMenuTaskList(ctx, "audit");
    }
    case "audit_export": {
      const { showAuditExportMain } = await import("./audit-export.js");
      return showAuditExportMain(ctx);
    }
    case "dictionary": {
      const { handleDictionaryCallback } = await import("./dictionary.js");
      ctx.callbackQuery!.data = "dict:list";
      return handleDictionaryCallback(ctx);
    }
    case "gen_passwords": {
      await ctx.answerCallbackQuery();
      const { generatePasswordsCommand } = await import("../handlers/generate-passwords.js");
      return generatePasswordsCommand(ctx as any);
    }
    case "recover": {
      await ctx.answerCallbackQuery();
      const { recoverCommand } = await import("../handlers/recover.js");
      return recoverCommand(ctx as any);
    }
    case "full_recover": {
      await ctx.answerCallbackQuery();
      const { fullRecoverCommand } = await import("../handlers/full-recover.js");
      return fullRecoverCommand(ctx as any);
    }
    case "recover_passwords": {
      await ctx.answerCallbackQuery();
      const { recoverPasswordsCommand } = await import("../handlers/recover-passwords.js");
      return recoverPasswordsCommand(ctx as any);
    }
    case "back": {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("Выберите действие:", {
        reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
      });
      break;
    }
    default:
      await ctx.answerCallbackQuery("Неизвестная команда");
  }
}

function backKeyboard() {
  return new InlineKeyboard().text("« Назад", "menu:back");
}

const AUDIT_LABELS: Record<string, { icon: string; title: string; prefix: string }> = {
  smtp: { icon: "📧", title: "SMTP Check", prefix: "smtp" },
  web: { icon: "🔑", title: "Web Auth", prefix: "web" },
  validate: { icon: "🔐", title: "IMAP Validate", prefix: "validate" },
  audit: { icon: "🔒", title: "Full Audit", prefix: "audit" },
};

async function showMenuTaskList(ctx: BotContext, type: string) {
  const label = AUDIT_LABELS[type];
  if (!label) {
    await ctx.answerCallbackQuery("Неизвестный тип");
    return;
  }

  const tasks = await db.task.findMany({
    where: { userId: ctx.dbUser.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const withCounts = await Promise.all(
    tasks.map(async (t) => {
      const count = await db.email.count({
        where: {
          taskId: t.id,
          status: "MX_FOUND",
          ...(type !== "smtp" ? { password: { not: null } } : {}),
        },
      });
      return { ...t, count };
    }),
  );

  const eligible = withCounts.filter((t) => t.count > 0);

  if (eligible.length === 0) {
    await ctx.editMessageText(
      `${label.icon} Нет задач для ${label.title}.`,
      { reply_markup: backKeyboard() },
    );
    await ctx.answerCallbackQuery();
    return;
  }

  const kb = new InlineKeyboard();
  for (const t of eligible) {
    kb.text(
      `📋 #${t.id} — ${t.fileName} (${t.count})`,
      `${label.prefix}:select:${t.id}`,
    ).row();
  }
  kb.text("« Назад", "menu:back");

  await ctx.editMessageText(
    `${label.icon} <b>${label.title}</b>\n\nВыберите задачу:`,
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery();
}
