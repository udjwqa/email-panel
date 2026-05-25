import { InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { db } from "../../services/db.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import {
  getAllSettings,
  setSetting,
  formatFileSize,
  SETTING_LABELS,
} from "../../services/settings.js";
import { TEMPLATES } from "../../services/generator/templates.js";
import { audit } from "../../services/audit.js";

export async function showSettingsMain(ctx: BotContext) {
  const s = await getAllSettings();

  const text =
    `⚙️ Настройки\n\n` +
    `📦 Лимиты:\n` +
    `  Макс. размер файла: ${formatFileSize(Number(s.max_file_size))}\n` +
    `  Строк на задачу: ${Number(s.max_rows_per_task).toLocaleString("ru-RU")}\n` +
    `  Задач в день: ${s.daily_task_limit}\n\n` +
    `⚡ Воркеры:\n` +
    `  Параллельность: ${s.worker_concurrency}\n` +
    `  Порог ошибок: ${s.error_threshold}\n` +
    `  Порог % ошибок: ${s.error_rate_threshold}%`;

  const kb = new InlineKeyboard()
    .text("📦 Лимиты", "set:limits")
    .text("⚡ Воркеры", "set:workers")
    .row()
    .text("🌐 Домены", "set:domains")
    .text("📝 Шаблоны", "set:templates")
    .row()
    .text("« Главное меню", "set:back");

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, { reply_markup: kb });
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

export async function handleSettingsCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("set:")) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "main":
      return showSettingsMain(ctx);

    case "limits":
      return showLimits(ctx);

    case "workers":
      return showWorkers(ctx);

    case "domains":
      return showDomains(ctx);

    case "templates":
      return showTemplates(ctx);

    case "edit":
      return promptEdit(ctx, parts[2]);

    case "domain":
      if (parts[2] === "add") return promptDomainAdd(ctx);
      if (parts[2] === "del") return deleteDomain(ctx, parts.slice(3).join(":"));
      break;

    case "back": {
      ctx.session.settingsInput = undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("Выберите действие:", {
        reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
      });
      return;
    }
  }
}

// ── Limits ──────────────────────────────────

async function showLimits(ctx: BotContext) {
  const s = await getAllSettings();

  const kb = new InlineKeyboard()
    .text(
      `📏 Размер файла: ${formatFileSize(Number(s.max_file_size))}`,
      "set:edit:max_file_size",
    )
    .row()
    .text(
      `📊 Строк: ${Number(s.max_rows_per_task).toLocaleString("ru-RU")}`,
      "set:edit:max_rows_per_task",
    )
    .row()
    .text(`📅 Задач/день: ${s.daily_task_limit}`, "set:edit:daily_task_limit")
    .row()
    .text("« Назад", "set:main");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText("📦 Лимиты\n\nНажмите для изменения:", {
    reply_markup: kb,
  });
}

// ── Workers ─────────────────────────────────

async function showWorkers(ctx: BotContext) {
  const s = await getAllSettings();

  const kb = new InlineKeyboard()
    .text(
      `⚙️ Параллельность: ${s.worker_concurrency}`,
      "set:edit:worker_concurrency",
    )
    .row()
    .text(
      `⚠️ Порог ошибок: ${s.error_threshold}`,
      "set:edit:error_threshold",
    )
    .row()
    .text(
      `📊 Порог %: ${s.error_rate_threshold}%`,
      "set:edit:error_rate_threshold",
    )
    .row()
    .text("« Назад", "set:main");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText("⚡ Воркеры\n\nНажмите для изменения:", {
    reply_markup: kb,
  });
}

// ── Edit prompt ─────────────────────────────

async function promptEdit(ctx: BotContext, key: string) {
  const label = SETTING_LABELS[key] ?? key;
  ctx.session.settingsInput = key;

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `✏️ Изменение: ${label}\n\nОтправьте новое числовое значение:`,
    {
      reply_markup: new InlineKeyboard().text("✖ Отмена", "set:main"),
    },
  );
}

// ── Domains ─────────────────────────────────

async function showDomains(ctx: BotContext) {
  const groups = await db.domain.groupBy({
    by: ["group"],
    _count: true,
    orderBy: { _count: { group: "desc" } },
  });

  let text = "🌐 Домены по группам:\n\n";
  for (const g of groups) {
    text += `  ${g.group ?? "Без группы"}: ${g._count}\n`;
  }

  const total = await db.domain.count();
  text += `\nВсего: ${total}`;

  const kb = new InlineKeyboard()
    .text("➕ Добавить домен", "set:domain:add")
    .row()
    .text("« Назад", "set:main");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { reply_markup: kb });
}

async function promptDomainAdd(ctx: BotContext) {
  ctx.session.settingsInput = "domain_add";

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "➕ Добавить домен\n\n" +
      "Отправьте в формате:\n" +
      "domain.com GroupName\n\n" +
      "Пример: mail.de German",
    {
      reply_markup: new InlineKeyboard().text("✖ Отмена", "set:domains"),
    },
  );
}

async function deleteDomain(ctx: BotContext, domain: string) {
  await db.domain.deleteMany({ where: { domain } });
  audit({ userId: ctx.dbUser.id, type: "domain_deleted", level: "INFO", message: `Domain deleted: ${domain}` });

  await ctx.answerCallbackQuery(`Домен ${domain} удалён`);
  return showDomains(ctx);
}

// ── Templates ───────────────────────────────

async function showTemplates(ctx: BotContext) {
  let text = "📝 Шаблоны генерации:\n\n";
  for (const t of TEMPLATES) {
    text += `  • ${t.label} → ${t.example}\n`;
  }
  text += "\nШаблоны задаются в коде (services/generator/templates.ts)";

  const kb = new InlineKeyboard().text("« Назад", "set:main");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { reply_markup: kb });
}

// ── Text input handler ──────────────────────

export async function handleSettingsTextInput(
  ctx: BotContext,
): Promise<boolean> {
  const inputKey = ctx.session.settingsInput;
  if (!inputKey) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  if (inputKey === "domain_add") {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply("Формат: domain.com GroupName");
      return true;
    }

    const [domain, group] = parts;
    await db.domain.upsert({
      where: { domain },
      create: { domain, group },
      update: { group },
    });

    audit({ userId: ctx.dbUser.id, type: "domain_added", level: "INFO", message: `Domain added: ${domain} (${group})` });

    ctx.session.settingsInput = undefined;
    await ctx.reply(`✅ Домен ${domain} добавлен в группу ${group}`);
    return true;
  }

  const num = Number(text);
  if (isNaN(num) || num <= 0) {
    await ctx.reply("Введите положительное число.");
    return true;
  }

  const label = SETTING_LABELS[inputKey] ?? inputKey;
  await setSetting(inputKey, String(num));

  audit({ userId: ctx.dbUser.id, type: "setting_changed", level: "INFO", message: `${label}: ${num}` });

  ctx.session.settingsInput = undefined;
  await ctx.reply(`✅ ${label} = ${num}`);
  return true;
}
