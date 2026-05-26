import { Bot, session } from "grammy";
import { config } from "../config.js";
import { BotContext, SessionData } from "./types.js";
import { authMiddleware } from "./middleware/auth.js";
import { startCommand } from "./commands/start.js";
import { handleMenuCallback, handleSectionCallback } from "./callbacks/menu.js";
import { handleUploadCallback } from "./callbacks/upload.js";
import { handleTaskCallback, showTaskList } from "./callbacks/tasks.js";
import {
  handleGeneratorCallback,
  handleWizardTextInput,
} from "./callbacks/generator.js";
import { handleStatsCallback, showStats } from "./callbacks/stats.js";
import { handleExportCallback, showExportMain } from "./callbacks/export.js";
import { handleLogsCallback, showLogs } from "./callbacks/logs.js";
import {
  handleSettingsCallback,
  showSettingsMain,
  handleSettingsTextInput,
} from "./callbacks/settings.js";
import {
  handleProxyCallback,
  showProxyMain,
  handleProxyFileUpload,
} from "./callbacks/proxy.js";
import { requireRole } from "./middleware/role.js";
import { uploadHandler } from "./handlers/upload.js";
import { checkSmtpCommand } from "./handlers/check-smtp.js";
import { handleSmtpCallback } from "./callbacks/smtp-check.js";
import { checkWebCommand } from "./handlers/check-web.js";
import { handleWebCheckCallback } from "./callbacks/web-check.js";
import { validateCommand } from "./handlers/validate.js";
import { handleValidateCallback } from "./callbacks/validate.js";
import { fullAuditCommand } from "./handlers/full-audit.js";
import { handleAuditCallback } from "./callbacks/full-audit.js";
import { statusCommand, cancelCommand } from "./handlers/task-commands.js";
import { dictionaryCommand } from "./handlers/dictionary.js";
import { generatePasswordsCommand, handlePasswordWizardInput } from "./handlers/generate-passwords.js";
import { handleGenPwCallback } from "./callbacks/generate-passwords.js";
import { recoverCommand } from "./handlers/recover.js";
import { handleRecoverCallback } from "./callbacks/recover.js";
import { fullRecoverCommand } from "./handlers/full-recover.js";
import { recoverPasswordsCommand } from "./handlers/recover-passwords.js";
import { handleRpwCallback, handleRpwFileUpload } from "./callbacks/recover-passwords.js";
import { stuffingCommand, importComboCommand } from "./handlers/stuffing.js";
import { handleStuffingCallback, handleComboFileUpload } from "./callbacks/stuffing.js";
import { handleDashboardCallback, showDashboard } from "./callbacks/dashboard.js";
import { handleNotificationCallback } from "./callbacks/notifications.js";
import { handleHelpCallback, showHelp } from "./callbacks/help.js";
import { handleTieredCallback } from "./callbacks/tiered-recovery.js";
import { handleWordlistCallback } from "./callbacks/wordlists.js";
import { handleBreachCallback, handleBreachTextInput } from "./callbacks/breach-search.js";
import { handleArchiveCallback } from "./callbacks/archive.js";
import {
  handleRecoveryPipelineCallback,
  handleRecoveryPipelineTextInput,
} from "./callbacks/full-recover.js";
import {
  handleDictionaryCallback,
  handleDictionaryFileUpload,
  handleDictionaryTextInput,
} from "./callbacks/dictionary.js";
import {
  handleAuditExportCallback,
  showAuditExportMain,
} from "./callbacks/audit-export.js";
import { audit } from "../services/audit.js";

export function createBot() {
  const bot = new Bot<BotContext>(config.botToken);

  bot.use(
    session<SessionData, BotContext>({
      initial: (): SessionData => ({
        wizard: { step: null },
        exportFilters: {},
        auditExportFilters: {},
        passwordWizard: { step: null },
      }),
    }),
  );

  bot.use(authMiddleware);

  bot.command("start", startCommand);
  bot.command("panel", startCommand);
  bot.command("generator", async (ctx) => {
    ctx.session.wizard = { step: "country" };
    const { COUNTRIES } = await import(
      "../services/generator/countries.js"
    );
    const { InlineKeyboard } = await import("grammy");
    const kb = new InlineKeyboard();
    for (let i = 0; i < COUNTRIES.length; i += 3) {
      const row = COUNTRIES.slice(i, i + 3);
      for (const c of row) {
        kb.text(`${c.flag} ${c.label}`, `gen:country:${c.code}`);
      }
      kb.row();
    }
    kb.text("« Главное меню", "gen:back");
    await ctx.reply(
      "⚡ Генератор email-масок\n\nШаг 1/6: Выберите страну",
      { reply_markup: kb },
    );
  });

  bot.command("upload", async (ctx) => {
    await ctx.reply(
      "📂 Загрузка базы\n\n" +
        "Отправьте .txt файл с email-адресами.\n\n" +
        "Поддерживаемые форматы строк:\n" +
        "• email@example.com\n" +
        "• email@example.com:password\n" +
        "• email@example.com;password\n" +
        "• email@example.com | data\n" +
        "• email@example.com,data",
    );
  });

  bot.command("tasks", (ctx) => showTaskList(ctx, 0));

  bot.command("stats", (ctx) => showStats(ctx, "24h"));
  bot.command("export", (ctx) => showExportMain(ctx));
  bot.command("logs", requireRole("ADMIN"), (ctx) => showLogs(ctx, "errors"));
  bot.command("settings", requireRole("ADMIN"), (ctx) => showSettingsMain(ctx));
  bot.command("proxy", requireRole("ADMIN"), (ctx) => showProxyMain(ctx));
  bot.command("check_smtp", requireRole("ADMIN", "MANAGER"), checkSmtpCommand);
  bot.command("check_web", requireRole("ADMIN", "MANAGER"), checkWebCommand);
  bot.command("validate", requireRole("ADMIN", "MANAGER"), validateCommand);
  bot.command("full_audit", requireRole("ADMIN", "MANAGER"), fullAuditCommand);
  bot.command("status", statusCommand);
  bot.command("cancel", cancelCommand);
  bot.command("dictionary", dictionaryCommand);
  bot.command("generate_passwords", generatePasswordsCommand);
  bot.command("recover", requireRole("ADMIN", "MANAGER"), recoverCommand);
  bot.command("full_recover", requireRole("ADMIN", "MANAGER"), fullRecoverCommand);
  bot.command("recover_passwords", requireRole("ADMIN", "MANAGER"), recoverPasswordsCommand);
  bot.command("stuff", requireRole("ADMIN", "MANAGER"), stuffingCommand);
  bot.command("import_combo", requireRole("ADMIN", "MANAGER"), importComboCommand);
  bot.command("dashboard", (ctx) => showDashboard(ctx));
  bot.command("help", (ctx) => showHelp(ctx, "main"));

  bot.on("message:document", async (ctx) => {
    if (await handleComboFileUpload(ctx)) return;
    if (await handleRpwFileUpload(ctx)) return;
    if (await handleDictionaryFileUpload(ctx)) return;
    if (await handleProxyFileUpload(ctx)) return;
    return uploadHandler(ctx);
  });

  bot.on("message:text", async (ctx) => {
    if (await handleBreachTextInput(ctx)) return;
    if (await handleRecoveryPipelineTextInput(ctx)) return;
    if (await handlePasswordWizardInput(ctx)) return;
    if (await handleDictionaryTextInput(ctx)) return;
    if (await handleSettingsTextInput(ctx)) return;
    if (await handleWizardTextInput(ctx)) return;
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("section:")) return handleSectionCallback(ctx);
    if (data.startsWith("menu:")) return handleMenuCallback(ctx);
    if (data.startsWith("upload:")) return handleUploadCallback(ctx);
    if (data.startsWith("task:")) return handleTaskCallback(ctx);
    if (data.startsWith("gen:")) return handleGeneratorCallback(ctx);
    if (data.startsWith("stat:")) return handleStatsCallback(ctx);
    if (data.startsWith("exp:")) return handleExportCallback(ctx);
    if (data.startsWith("log:")) return handleLogsCallback(ctx);
    if (data.startsWith("set:")) return handleSettingsCallback(ctx);
    if (data.startsWith("prx:")) return handleProxyCallback(ctx);
    if (data.startsWith("smtp:")) return handleSmtpCallback(ctx);
    if (data.startsWith("web:")) return handleWebCheckCallback(ctx);
    if (data.startsWith("validate:")) return handleValidateCallback(ctx);
    if (data.startsWith("audit:")) return handleAuditCallback(ctx);
    if (data.startsWith("aexp:")) return handleAuditExportCallback(ctx);
    if (data.startsWith("dict:")) return handleDictionaryCallback(ctx);
    if (data.startsWith("genpw:")) return handleGenPwCallback(ctx);
    if (data.startsWith("match:")) return handleRecoverCallback(ctx);
    if (data.startsWith("rpipe:")) return handleRecoveryPipelineCallback(ctx);
    if (data.startsWith("rpw:")) return handleRpwCallback(ctx);
    if (data.startsWith("stuff:")) return handleStuffingCallback(ctx);
    if (data.startsWith("dash:")) return handleDashboardCallback(ctx);
    if (data.startsWith("notif:")) return handleNotificationCallback(ctx);
    if (data.startsWith("help:")) return handleHelpCallback(ctx);
    if (data.startsWith("tier:")) return handleTieredCallback(ctx);
    if (data.startsWith("wl:")) return handleWordlistCallback(ctx);
    if (data.startsWith("breach:")) return handleBreachCallback(ctx);
    if (data.startsWith("arch:")) return handleArchiveCallback(ctx);
    await ctx.answerCallbackQuery("Неизвестная команда");
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
    audit({ type: "system_error", level: "CRITICAL", message: `Bot error: ${err instanceof Error ? err.message : String(err)}` });
  });

  return bot;
}
