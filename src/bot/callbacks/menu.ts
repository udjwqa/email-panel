import { InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import {
  validationMenu,
  securityMenu,
  recoveryMenu,
  analyticsMenu,
  adminMenu,
  importExportMenu,
} from "../keyboards/sections.js";
import { showTaskList } from "./tasks.js";
import { handleGeneratorCallback } from "./generator.js";
import { showStats } from "./stats.js";
import { showExportMain } from "./export.js";
import { showProxyMain } from "./proxy.js";
import { showSettingsMain } from "./settings.js";
import { showLogs } from "./logs.js";
import { db } from "../../services/db.js";
import { getDomainGroup } from "../../services/domain-groups.js";

export async function handleSectionCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("section:")) return;

  const section = data.replace("section:", "");
  await ctx.answerCallbackQuery();

  const SECTION_TEXTS: Record<string, string> = {
    validation: "📂 <b>Загрузка и Проверка</b>\n\nUpload email-баз, SMTP/IMAP проверка, управление задачами:",
    security: "🔒 <b>Security Audit</b>\n\nOAuth проверка, полный audit pipeline, экспорт результатов:",
    recovery: "🔑 <b>Recovery</b>\n\nСловари, паттерны, dictionary attack, credential stuffing:",
    analytics: "📊 <b>Аналитика</b>\n\nСтатистика, dashboard, audit report:",
    admin: "⚙️ <b>Настройки</b>\n\nСистема, прокси, логи, уведомления:",
    import_export: "📥 <b>Import / Export</b>\n\nCombo-листы, экспорт данных, генератор email:",
  };

  const SECTION_KBS: Record<string, () => InlineKeyboard> = {
    validation: validationMenu,
    security: securityMenu,
    recovery: recoveryMenu,
    analytics: analyticsMenu,
    admin: adminMenu,
    import_export: importExportMenu,
  };

  const text = SECTION_TEXTS[section] ?? "Выберите действие:";
  const kbFn = SECTION_KBS[section];
  const kb = kbFn ? kbFn() : new InlineKeyboard().text("◀ Назад", "menu:back");

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
}

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
    case "dashboard": {
      const { showDashboard } = await import("./dashboard.js");
      return showDashboard(ctx);
    }
    case "audit_report": {
      await ctx.answerCallbackQuery();
      const { generateAuditReport } = await import("../../services/audit-report/generator.js");
      const { formatAuditReportText } = await import("../../services/audit-report/formatter.js");
      const report = await generateAuditReport({});
      const text = formatAuditReportText(report);
      await ctx.editMessageText(text.slice(0, 4000), {
        reply_markup: new InlineKeyboard().text("◀ Аналитика", "section:analytics"),
      });
      return;
    }
    case "notifications": {
      const { showNotificationSettings } = await import("./notifications.js");
      return showNotificationSettings(ctx);
    }
    case "help": {
      const { showHelp } = await import("./help.js");
      return showHelp(ctx, "main");
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
    case "stuffing": {
      await ctx.answerCallbackQuery();
      const { stuffingCommand } = await import("../handlers/stuffing.js");
      return stuffingCommand(ctx as any);
    }
    case "import_combo": {
      await ctx.answerCallbackQuery();
      const { importComboCommand } = await import("../handlers/stuffing.js");
      return importComboCommand(ctx as any);
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
