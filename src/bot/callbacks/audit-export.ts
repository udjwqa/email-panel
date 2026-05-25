import { InlineKeyboard, InputFile } from "grammy";
import { BotContext, AuditExportFilters } from "../types.js";
import { db } from "../../services/db.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import { audit } from "../../services/audit.js";
import {
  generateValidatedExport,
} from "../../services/validated-credentials-exporter.js";

const ACCOUNT_STATUS_OPTIONS: { id: string; label: string }[] = [
  { id: "active_clean", label: "✅ Active Clean" },
  { id: "active_with_2fa", label: "🔵 Active 2FA" },
  { id: "suspicious_activity", label: "⚠️ Suspicious" },
  { id: "restricted", label: "🔒 Restricted" },
  { id: "locked", label: "❌ Locked" },
];

const DATE_PRESETS: Record<string, string> = {
  "24h": "24 часа",
  "7d": "7 дней",
  "30d": "30 дней",
  all: "Всё время",
};

function defaultAuditFilters(): AuditExportFilters {
  return {
    accountStatuses: ["active_clean", "active_with_2fa"],
    uniqueOnly: true,
    format: "csv",
  };
}

function summarizeAuditFilters(f: AuditExportFilters): string {
  const lines: string[] = [];
  lines.push(`📋 Задача: ${f.taskId ? `#${f.taskId}` : "Все"}`);
  const statusLabels = (f.accountStatuses ?? [])
    .map((s) => ACCOUNT_STATUS_OPTIONS.find((o) => o.id === s)?.label ?? s)
    .join(", ");
  lines.push(`🔐 Статус: ${statusLabels || "Все"}`);
  lines.push(`📅 Период: ${DATE_PRESETS[f.datePreset ?? "all"] ?? "Всё время"}`);
  lines.push(`🔄 Уникальные: ${f.uniqueOnly ? "Да" : "Нет"}`);
  lines.push(`📄 Формат: ${(f.format ?? "csv").toUpperCase()}`);
  return lines.join("\n");
}

function datePresetToDate(preset: string): Date | undefined {
  const now = new Date();
  switch (preset) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return undefined;
  }
}

export async function showAuditExportMain(ctx: BotContext) {
  if (
    !ctx.session.auditExportFilters ||
    Object.keys(ctx.session.auditExportFilters).length === 0
  ) {
    ctx.session.auditExportFilters = defaultAuditFilters();
  }
  const f = ctx.session.auditExportFilters;

  const text = `📥 <b>Экспорт результатов аудита</b>\n\nНастройте фильтры:\n\n${summarizeAuditFilters(f)}`;

  const kb = new InlineKeyboard()
    .text("📋 Задача", "aexp:task:menu")
    .text("🔐 Статус", "aexp:status:menu")
    .text("📅 Период", "aexp:date:menu")
    .row()
    .text(
      f.uniqueOnly ? "🔄 Уник: Да" : "🔄 Уник: Нет",
      "aexp:unique",
    )
    .text(
      `📄 ${(f.format ?? "csv").toUpperCase()} ↔ ${f.format === "csv" ? "TXT" : "CSV"}`,
      "aexp:format",
    )
    .row()
    .text("📥 Экспортировать", "aexp:do")
    .row()
    .text("« Главное меню", "aexp:back");

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function handleAuditExportCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("aexp:")) return;

  const parts = data.split(":");
  const action = parts[1];

  if (
    !ctx.session.auditExportFilters ||
    Object.keys(ctx.session.auditExportFilters).length === 0
  ) {
    ctx.session.auditExportFilters = defaultAuditFilters();
  }

  switch (action) {
    case "start":
      return showAuditExportMain(ctx);

    case "task":
      return handleTaskFilter(ctx, parts[2]);

    case "status":
      return handleStatusFilter(ctx, parts[2]);

    case "date":
      return handleDateFilter(ctx, parts[2]);

    case "unique": {
      ctx.session.auditExportFilters.uniqueOnly =
        !ctx.session.auditExportFilters.uniqueOnly;
      return showAuditExportMain(ctx);
    }

    case "format": {
      ctx.session.auditExportFilters.format =
        ctx.session.auditExportFilters.format === "csv" ? "txt" : "csv";
      return showAuditExportMain(ctx);
    }

    case "do":
      return doExport(ctx);

    case "back": {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("Выберите действие:", {
        reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
      });
      return;
    }

    default:
      await ctx.answerCallbackQuery();
  }
}

async function handleTaskFilter(ctx: BotContext, sub: string) {
  if (sub === "menu") {
    const tasks = await db.task.findMany({
      where: { userId: ctx.dbUser.id, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const kb = new InlineKeyboard();
    kb.text("Все задачи", "aexp:task:all").row();
    for (const t of tasks) {
      kb.text(`#${t.id} ${t.fileName}`, `aexp:task:${t.id}`).row();
    }
    kb.text("« Назад", "aexp:start");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText("📋 Выберите задачу:", { reply_markup: kb });
    return;
  }

  if (sub === "all") {
    ctx.session.auditExportFilters.taskId = undefined;
  } else {
    ctx.session.auditExportFilters.taskId = Number(sub);
  }
  return showAuditExportMain(ctx);
}

async function handleStatusFilter(ctx: BotContext, sub: string) {
  if (sub === "menu") {
    const selected = ctx.session.auditExportFilters.accountStatuses ?? [];
    const kb = new InlineKeyboard();

    for (const opt of ACCOUNT_STATUS_OPTIONS) {
      const isSelected = selected.includes(opt.id);
      kb.text(
        `${isSelected ? "☑️" : "☐"} ${opt.label}`,
        `aexp:status:${opt.id}`,
      ).row();
    }
    kb.text("« Назад", "aexp:start");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText("🔐 Выберите статусы (toggle):", {
      reply_markup: kb,
    });
    return;
  }

  // Toggle status
  const statuses = ctx.session.auditExportFilters.accountStatuses ?? [];
  const idx = statuses.indexOf(sub);
  if (idx >= 0) {
    statuses.splice(idx, 1);
  } else {
    statuses.push(sub);
  }
  ctx.session.auditExportFilters.accountStatuses = statuses;
  return handleStatusFilter(ctx, "menu");
}

async function handleDateFilter(ctx: BotContext, sub: string) {
  if (sub === "menu") {
    const kb = new InlineKeyboard();
    for (const [key, label] of Object.entries(DATE_PRESETS)) {
      const current = ctx.session.auditExportFilters.datePreset ?? "all";
      const mark = current === key ? "●" : "○";
      kb.text(`${mark} ${label}`, `aexp:date:${key}`).row();
    }
    kb.text("« Назад", "aexp:start");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText("📅 Выберите период:", { reply_markup: kb });
    return;
  }

  ctx.session.auditExportFilters.datePreset = sub;
  return showAuditExportMain(ctx);
}

async function doExport(ctx: BotContext) {
  const f = ctx.session.auditExportFilters;

  try {
    const result = await generateValidatedExport(ctx.dbUser.id, {
      accountStatuses:
        f.accountStatuses && f.accountStatuses.length > 0
          ? f.accountStatuses
          : undefined,
      dateFrom: f.datePreset ? datePresetToDate(f.datePreset) : undefined,
      uniqueOnly: f.uniqueOnly,
      format: f.format ?? "csv",
    });

    if (result.count === 0) {
      await ctx.answerCallbackQuery("Нет данных для экспорта");
      return;
    }

    const { promises: fs } = await import("fs");
    const buffer = await fs.readFile(result.filePath);

    await ctx.replyWithDocument(new InputFile(buffer, result.fileName), {
      caption: `📥 Audit Export: ${result.count} records (${(f.format ?? "csv").toUpperCase()})`,
    });

    audit({
      userId: ctx.dbUser.id,
      type: "audit_export",
      level: "INFO",
      message: `Audit export: ${result.count} records, format: ${f.format}`,
    });

    await ctx.answerCallbackQuery("Экспорт готов");
  } catch (err) {
    await ctx.answerCallbackQuery("Ошибка экспорта");
  }
}
