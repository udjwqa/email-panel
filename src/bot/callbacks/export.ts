import { InlineKeyboard, InputFile } from "grammy";
import { BotContext, ExportFilters } from "../types.js";
import { db } from "../../services/db.js";
import { generateExport } from "../../services/exporter.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import { audit } from "../../services/audit.js";

const STATUS_OPTIONS: { id: string; label: string }[] = [
  { id: "MX_FOUND", label: "✅ MX найден" },
  { id: "VALID_FORMAT", label: "📝 Валидный формат" },
  { id: "INVALID_FORMAT", label: "❌ Невалидный" },
  { id: "DOMAIN_EXISTS", label: "🌐 Домен найден" },
  { id: "DOMAIN_NOT_FOUND", label: "🔍 Домен не найден" },
  { id: "MX_NOT_FOUND", label: "📡 MX не найден" },
  { id: "DUPLICATE", label: "🔄 Дубликаты" },
  { id: "PROCESSED", label: "✔️ Обработан" },
  { id: "ERROR", label: "⚠️ Ошибки" },
];

const GROUP_OPTIONS = [
  "Microsoft",
  "Google",
  "Yahoo",
  "German",
  "Polish",
  "Asian",
  "ISP",
  "Apple",
  "ProtonMail",
  "Zoho",
  "AOL",
  "French",
  "Spanish",
  "Brazilian",
  "Unknown",
];

function defaultFilters(): ExportFilters {
  return {
    statuses: ["MX_FOUND"],
    uniqueOnly: true,
    format: "txt",
  };
}

function summarizeFilters(f: ExportFilters): string {
  const lines: string[] = [];

  lines.push(
    `📋 Задача: ${f.taskId ? `#${f.taskId}` : "Все"}`,
  );

  const statusLabels = (f.statuses ?? [])
    .map((s) => STATUS_OPTIONS.find((o) => o.id === s)?.label ?? s)
    .join(", ");
  lines.push(`📊 Статус: ${statusLabels || "Все"}`);

  lines.push(`🌐 Домены: ${f.domainGroup ?? "Все"}`);
  lines.push(`📅 Период: ${f.datePreset === "all" || !f.datePreset ? "Всё время" : f.datePreset}`);
  lines.push(`🔄 Уникальные: ${f.uniqueOnly ? "Да" : "Нет"}`);
  lines.push(`📄 Формат: ${(f.format ?? "txt").toUpperCase()}`);

  return lines.join("\n");
}

export async function showExportMain(ctx: BotContext) {
  if (!ctx.session.exportFilters || Object.keys(ctx.session.exportFilters).length === 0) {
    ctx.session.exportFilters = defaultFilters();
  }
  const f = ctx.session.exportFilters;

  const text = `📥 Экспорт данных\n\nНастройте фильтры:\n\n${summarizeFilters(f)}`;

  const kb = new InlineKeyboard()
    .text("📋 Задача", "exp:task:menu")
    .text("📊 Статус", "exp:status:menu")
    .text("🌐 Домены", "exp:group:menu")
    .row()
    .text("📅 Период", "exp:date:menu")
    .text(f.uniqueOnly ? "🔄 Уник: Да" : "🔄 Уник: Нет", "exp:unique")
    .row()
    .text(
      `📄 ${(f.format ?? "txt").toUpperCase()} ↔ ${f.format === "csv" ? "TXT" : "CSV"}`,
      "exp:format",
    )
    .row()
    .text("📥 Экспортировать", "exp:do")
    .row()
    .text("« Главное меню", "exp:back");

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, { reply_markup: kb });
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

export async function handleExportCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("exp:")) return;

  const parts = data.split(":");
  const action = parts[1];

  if (!ctx.session.exportFilters || Object.keys(ctx.session.exportFilters).length === 0) {
    ctx.session.exportFilters = defaultFilters();
  }

  switch (action) {
    case "start":
      return showExportMain(ctx);

    case "task":
      return handleTaskFilter(ctx, parts[2]);

    case "status":
      return handleStatusFilter(ctx, parts[2]);

    case "group":
      return handleGroupFilter(ctx, parts[2]);

    case "date":
      return handleDateFilter(ctx, parts[2]);

    case "unique": {
      ctx.session.exportFilters.uniqueOnly =
        !ctx.session.exportFilters.uniqueOnly;
      return showExportMain(ctx);
    }

    case "format": {
      ctx.session.exportFilters.format =
        ctx.session.exportFilters.format === "csv" ? "txt" : "csv";
      return showExportMain(ctx);
    }

    case "do":
      return doExport(ctx);

    case "back": {
      ctx.session.exportFilters = {};
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("Выберите действие:", {
        reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
      });
      return;
    }
  }
}

// ── Task filter ─────────────────────────────

async function handleTaskFilter(ctx: BotContext, param: string) {
  if (param === "menu") {
    const tasks = await db.task.findMany({
      where: { userId: ctx.dbUser.id, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const kb = new InlineKeyboard().text("📋 Все задачи", "exp:task:all").row();
    for (const t of tasks) {
      kb.text(`#${t.id} ${t.fileName}`, `exp:task:${t.id}`).row();
    }
    kb.text("« Назад", "exp:start");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText("📋 Выберите задачу для экспорта:", {
      reply_markup: kb,
    });
    return;
  }

  if (param === "all") {
    delete ctx.session.exportFilters.taskId;
  } else {
    ctx.session.exportFilters.taskId = Number(param);
  }
  return showExportMain(ctx);
}

// ── Status filter ───────────────────────────

async function handleStatusFilter(ctx: BotContext, param: string) {
  if (param === "menu") {
    const selected = ctx.session.exportFilters.statuses ?? [];
    const kb = new InlineKeyboard();

    for (let i = 0; i < STATUS_OPTIONS.length; i += 2) {
      const row = STATUS_OPTIONS.slice(i, i + 2);
      for (const s of row) {
        const check = selected.includes(s.id) ? "✅" : "☐";
        kb.text(`${check} ${s.label}`, `exp:status:${s.id}`);
      }
      kb.row();
    }
    kb.text("✓ Применить", "exp:start");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText("📊 Выберите статусы (можно несколько):", {
      reply_markup: kb,
    });
    return;
  }

  const statuses = ctx.session.exportFilters.statuses ?? [];
  const idx = statuses.indexOf(param);
  if (idx >= 0) {
    statuses.splice(idx, 1);
  } else {
    statuses.push(param);
  }
  ctx.session.exportFilters.statuses = statuses;
  return handleStatusFilter(ctx, "menu");
}

// ── Domain group filter ─────────────────────

async function handleGroupFilter(ctx: BotContext, param: string) {
  if (param === "menu") {
    const current = ctx.session.exportFilters.domainGroup;
    const kb = new InlineKeyboard();
    kb.text(current ? "☐ Все" : "✅ Все", "exp:group:all").row();

    for (let i = 0; i < GROUP_OPTIONS.length; i += 3) {
      const row = GROUP_OPTIONS.slice(i, i + 3);
      for (const g of row) {
        const check = current === g ? "✅" : "☐";
        kb.text(`${check} ${g}`, `exp:group:${g}`);
      }
      kb.row();
    }
    kb.text("« Назад", "exp:start");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText("🌐 Выберите группу доменов:", {
      reply_markup: kb,
    });
    return;
  }

  if (param === "all") {
    delete ctx.session.exportFilters.domainGroup;
  } else {
    ctx.session.exportFilters.domainGroup = param;
  }
  return showExportMain(ctx);
}

// ── Date filter ─────────────────────────────

async function handleDateFilter(ctx: BotContext, param: string) {
  if (param === "menu") {
    const current = ctx.session.exportFilters.datePreset ?? "all";
    const options = [
      { id: "24h", label: "24 часа" },
      { id: "7d", label: "7 дней" },
      { id: "30d", label: "30 дней" },
      { id: "all", label: "Всё время" },
    ];

    const kb = new InlineKeyboard();
    for (const o of options) {
      const check = current === o.id ? "•" : "";
      kb.text(`${check}${o.label}`, `exp:date:${o.id}`);
    }
    kb.row().text("« Назад", "exp:start");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText("📅 Выберите период:", { reply_markup: kb });
    return;
  }

  ctx.session.exportFilters.datePreset = param;
  return showExportMain(ctx);
}

// ── Do export ───────────────────────────────

async function doExport(ctx: BotContext) {
  const filters = ctx.session.exportFilters;

  await ctx.answerCallbackQuery();
  await ctx.editMessageText("⏳ Генерация файла...");

  try {
    const result = await generateExport(ctx.dbUser.id, filters);

    if (result.count === 0) {
      await ctx.editMessageText(
        "📥 По выбранным фильтрам не найдено email.\nПопробуйте изменить фильтры.",
        {
          reply_markup: new InlineKeyboard()
            .text("🔄 Изменить фильтры", "exp:start")
            .row()
            .text("« Главное меню", "exp:back"),
        },
      );
      return;
    }

    await ctx.replyWithDocument(new InputFile(result.buffer, result.fileName), {
      caption: `📥 Экспорт #${result.exportId}: ${result.count} email (${(filters.format ?? "txt").toUpperCase()})`,
    });

    audit({ userId: ctx.dbUser.id, type: "export_created", level: "INFO", message: `Export #${result.exportId}: ${result.count} emails (${filters.format ?? "txt"})` });

    ctx.session.exportFilters = {};

    await ctx.editMessageText(
      `✅ Экспорт завершён: ${result.count} email\nФайл: ${result.fileName}`,
      {
        reply_markup: new InlineKeyboard()
          .text("📥 Новый экспорт", "exp:start")
          .row()
          .text("« Главное меню", "exp:back"),
      },
    );
  } catch (err) {
    await ctx.editMessageText(
      `❌ Ошибка экспорта: ${err instanceof Error ? err.message : "Unknown"}`,
      {
        reply_markup: new InlineKeyboard()
          .text("🔄 Попробовать снова", "exp:start")
          .row()
          .text("« Главное меню", "exp:back"),
      },
    );
  }
}
