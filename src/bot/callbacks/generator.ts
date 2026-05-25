import { InlineKeyboard, InputFile } from "grammy";
import { BotContext } from "../types.js";
import { db } from "../../services/db.js";
import { emailQueue } from "../../services/queue.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import { audit } from "../../services/audit.js";
import { COUNTRIES, getCountry } from "../../services/generator/countries.js";
import { TEMPLATES, getTemplate } from "../../services/generator/templates.js";
import { generateEmails } from "../../services/generator/engine.js";
import { getNameDatabase } from "../../services/generator/names.js";

export async function handleGeneratorCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("gen:")) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "start":
      return showCountryStep(ctx);
    case "country":
      return selectCountry(ctx, parts[2]);
    case "domain":
      return toggleDomain(ctx, parts.slice(2).join(":"));
    case "domains":
      if (parts[2] === "done") return showTemplateStep(ctx);
      if (parts[2] === "back") return showCountryStep(ctx);
      break;
    case "tpl":
      if (parts[2] === "done") return showCountStep(ctx);
      if (parts[2] === "back") return showDomainStep(ctx);
      return toggleTemplate(ctx, parts[2]);
    case "count":
      if (parts[2] === "back") return showTemplateStep(ctx);
      return selectCount(ctx, Number(parts[2]));
    case "confirm":
      if (parts[2] === "back") return showCountStep(ctx);
      break;
    case "generate":
      return doGenerate(ctx);
    case "save":
      return saveToDb(ctx, false);
    case "check":
      return saveToDb(ctx, true);
    case "export":
      return exportTxt(ctx);
    case "delete":
      return deleteResult(ctx);
    case "back":
      await ctx.answerCallbackQuery();
      ctx.session.wizard = { step: null };
      await ctx.editMessageText("Выберите действие:", {
        reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
      });
      return;
  }
}

// ── Step 1: Country ─────────────────────────

async function showCountryStep(ctx: BotContext) {
  ctx.session.wizard = { step: "country" };

  const kb = new InlineKeyboard();
  for (let i = 0; i < COUNTRIES.length; i += 3) {
    const row = COUNTRIES.slice(i, i + 3);
    for (const c of row) {
      kb.text(`${c.flag} ${c.label}`, `gen:country:${c.code}`);
    }
    kb.row();
  }
  kb.text("« Главное меню", "gen:back");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "⚡ Генератор email-масок\n\nШаг 1/6: Выберите страну",
    { reply_markup: kb },
  );
}

async function selectCountry(ctx: BotContext, code: string) {
  const country = getCountry(code);
  if (!country) {
    await ctx.answerCallbackQuery("Страна не найдена");
    return;
  }

  ctx.session.wizard.step = "params";
  ctx.session.wizard.country = code;

  const nameDb = getNameDatabase(code);
  const examples = nameDb
    ? `\nИмена из базы ${country.label}:\n👤 ${nameDb.firstNames.slice(0, 6).join(", ")}\n👥 ${nameDb.lastNames.slice(0, 6).join(", ")}\n🏙 ${nameDb.cities.slice(0, 5).join(", ")}`
    : "";

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `⚡ Генератор — ${country.flag} ${country.label}\n\n` +
      `Шаг 2/6: Введите данные\n\n` +
      `Отправьте текст в формате:\n` +
      `Имя Фамилия Город ГодРождения\n\n` +
      `Пример: ${nameDb ? `${nameDb.firstNames[0]} ${nameDb.lastNames[0]} ${nameDb.cities[0]} 1995` : "Max Mueller Berlin 1995"}` +
      examples,
  );
}

// ── Step 2: Text input handler ──────────────

export async function handleWizardTextInput(ctx: BotContext) {
  if (ctx.session.wizard.step !== "params") return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    await ctx.reply(
      "Нужно минимум Имя и Фамилия.\nПример: Max Mueller Berlin 1995",
    );
    return true;
  }

  ctx.session.wizard.firstName = parts[0];
  ctx.session.wizard.lastName = parts[1];
  ctx.session.wizard.city = parts[2] || undefined;
  ctx.session.wizard.birthYear = parts[3] || undefined;
  ctx.session.wizard.domains = [];
  ctx.session.wizard.step = "domains";

  await showDomainStep(ctx);
  return true;
}

// ── Step 3: Domains ─────────────────────────

async function showDomainStep(ctx: BotContext) {
  ctx.session.wizard.step = "domains";
  const country = getCountry(ctx.session.wizard.country ?? "");
  if (!country) return;

  const selected = ctx.session.wizard.domains ?? [];

  const kb = new InlineKeyboard();
  for (let i = 0; i < country.domains.length; i += 2) {
    const row = country.domains.slice(i, i + 2);
    for (const d of row) {
      const check = selected.includes(d) ? "✅" : "☐";
      kb.text(`${check} ${d}`, `gen:domain:${d}`);
    }
    kb.row();
  }
  kb.text("✓ Далее", "gen:domains:done").row();
  kb.text("« Назад", "gen:domains:back");

  const selectedText =
    selected.length > 0
      ? `\nВыбрано: ${selected.join(", ")}`
      : "\nПока ничего не выбрано";

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `⚡ Генератор\n\nШаг 3/6: Выберите домены (можно несколько)${selectedText}`,
      { reply_markup: kb },
    );
  } else {
    await ctx.reply(
      `⚡ Генератор\n\nШаг 3/6: Выберите домены (можно несколько)${selectedText}`,
      { reply_markup: kb },
    );
  }
}

async function toggleDomain(ctx: BotContext, domain: string) {
  const selected = ctx.session.wizard.domains ?? [];
  const idx = selected.indexOf(domain);
  if (idx >= 0) {
    selected.splice(idx, 1);
  } else {
    selected.push(domain);
  }
  ctx.session.wizard.domains = selected;
  await showDomainStep(ctx);
}

// ── Step 4: Templates ───────────────────────

async function showTemplateStep(ctx: BotContext) {
  const selected = ctx.session.wizard.domains ?? [];
  if (selected.length === 0) {
    await ctx.answerCallbackQuery("Выберите хотя бы один домен");
    return;
  }

  ctx.session.wizard.step = "templates";
  if (!ctx.session.wizard.templates) ctx.session.wizard.templates = [];

  const chosen = ctx.session.wizard.templates;

  const kb = new InlineKeyboard();
  for (let i = 0; i < TEMPLATES.length; i += 2) {
    const row = TEMPLATES.slice(i, i + 2);
    for (const t of row) {
      const check = chosen.includes(t.id) ? "✅" : "☐";
      kb.text(`${check} ${t.label}`, `gen:tpl:${t.id}`);
    }
    kb.row();
  }
  kb.text("✓ Далее", "gen:tpl:done").row();
  kb.text("« Назад", "gen:tpl:back");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `⚡ Генератор\n\nШаг 4/6: Выберите шаблоны\n\n` +
      TEMPLATES.map(
        (t) =>
          `${chosen.includes(t.id) ? "✅" : "☐"} ${t.label} → ${t.example}`,
      ).join("\n"),
    { reply_markup: kb },
  );
}

async function toggleTemplate(ctx: BotContext, tplId: string) {
  const chosen = ctx.session.wizard.templates ?? [];
  const idx = chosen.indexOf(tplId);
  if (idx >= 0) {
    chosen.splice(idx, 1);
  } else {
    chosen.push(tplId);
  }
  ctx.session.wizard.templates = chosen;
  await showTemplateStep(ctx);
}

// ── Step 5: Count ───────────────────────────

async function showCountStep(ctx: BotContext) {
  const chosen = ctx.session.wizard.templates ?? [];
  if (chosen.length === 0) {
    await ctx.answerCallbackQuery("Выберите хотя бы один шаблон");
    return;
  }

  ctx.session.wizard.step = "count";

  const kb = new InlineKeyboard()
    .text("10", "gen:count:10")
    .text("25", "gen:count:25")
    .text("50", "gen:count:50")
    .text("100", "gen:count:100")
    .text("500", "gen:count:500")
    .row()
    .text("« Назад", "gen:count:back");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "⚡ Генератор\n\nШаг 5/6: Количество вариантов",
    { reply_markup: kb },
  );
}

async function selectCount(ctx: BotContext, count: number) {
  ctx.session.wizard.count = count;
  ctx.session.wizard.step = "confirm";
  await showConfirmStep(ctx);
}

// ── Step 6: Confirm ─────────────────────────

async function showConfirmStep(ctx: BotContext) {
  const w = ctx.session.wizard;
  const country = getCountry(w.country ?? "");
  const tplLabels = (w.templates ?? [])
    .map((id) => getTemplate(id)?.label ?? id)
    .join(", ");

  const text =
    `⚡ Генератор\n\nШаг 6/6: Подтверждение\n\n` +
    `🌍 Страна: ${country?.flag ?? ""} ${country?.label ?? w.country}\n` +
    `👤 ${w.firstName} ${w.lastName}${w.city ? `, ${w.city}` : ""}${w.birthYear ? `, ${w.birthYear}` : ""}\n` +
    `📧 Домены: ${(w.domains ?? []).join(", ")}\n` +
    `📝 Шаблоны: ${tplLabels}\n` +
    `🔢 Количество: ${w.count}`;

  const kb = new InlineKeyboard()
    .text("✅ Сгенерировать", "gen:generate")
    .row()
    .text("« Назад", "gen:confirm:back");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { reply_markup: kb });
}

// ── Generate ────────────────────────────────

async function doGenerate(ctx: BotContext) {
  const result = generateEmails(ctx.session.wizard);
  ctx.session.wizard.generatedEmails = result.emails;

  let text =
    `⚡ Сгенерировано: ${result.totalGenerated} email` +
    (result.duplicatesRemoved > 0
      ? ` (${result.duplicatesRemoved} дублей удалено)`
      : "") +
    `\n`;

  for (const [domain, emails] of Object.entries(result.byDomain)) {
    text += `\n📧 ${domain} (${emails.length}):\n`;
    const preview = emails.slice(0, 5);
    text += preview.join("\n");
    if (emails.length > 5) text += `\n... и ещё ${emails.length - 5}`;
    text += "\n";
  }

  const kb = new InlineKeyboard()
    .text("💾 Сохранить", "gen:save")
    .text("▶ На проверку", "gen:check")
    .row()
    .text("📥 Экспорт", "gen:export")
    .text("🗑 Удалить", "gen:delete");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { reply_markup: kb });
}

// ── Final actions ───────────────────────────

async function saveToDb(ctx: BotContext, addToQueue: boolean) {
  const emails = ctx.session.wizard.generatedEmails ?? [];
  if (emails.length === 0) {
    await ctx.answerCallbackQuery("Нет email для сохранения");
    return;
  }

  const task = await db.task.create({
    data: {
      userId: ctx.dbUser.id,
      fileName: `gen_${ctx.session.wizard.country ?? "XX"}_${Date.now()}.txt`,
      status: addToQueue ? "QUEUED" : "CREATED",
      totalRows: emails.length,
      validCount: emails.length,
    },
  });

  const BATCH = 1000;
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    await db.email.createMany({
      data: batch.map((e) => ({
        taskId: task.id,
        email: e,
        domain: e.split("@")[1],
        status: "VALID_FORMAT",
        source: `generator:${ctx.session.wizard.country ?? "XX"}`,
      })),
    });
  }

  if (addToQueue) {
    await emailQueue.add(
      "validate",
      { taskId: task.id },
      { jobId: `task-${task.id}` },
    );
  }

  audit({ userId: ctx.dbUser.id, type: "generator_saved", level: "INFO", message: `Generated task #${task.id}: ${emails.length} emails${addToQueue ? " (queued)" : ""}` });

  ctx.session.wizard = { step: null };

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    addToQueue
      ? `✅ Задача #${task.id} создана и поставлена в очередь.\n${emails.length} email на проверку.`
      : `💾 Задача #${task.id} сохранена.\n${emails.length} email записано.`,
    {
      reply_markup: new InlineKeyboard()
        .text("📋 Мои задачи", "task:list:0")
        .row()
        .text("« Главное меню", "gen:back"),
    },
  );
}

async function exportTxt(ctx: BotContext) {
  const emails = ctx.session.wizard.generatedEmails ?? [];
  if (emails.length === 0) {
    await ctx.answerCallbackQuery("Нет email для экспорта");
    return;
  }

  const content = emails.join("\n");
  const buffer = Buffer.from(content, "utf-8");
  const fileName = `generated_${ctx.session.wizard.country ?? "XX"}_${emails.length}.txt`;

  await ctx.answerCallbackQuery();
  await ctx.replyWithDocument(new InputFile(buffer, fileName), {
    caption: `📥 Экспорт: ${emails.length} email`,
  });
}

async function deleteResult(ctx: BotContext) {
  ctx.session.wizard = { step: null };
  await ctx.answerCallbackQuery("🗑 Результат удалён");
  await ctx.editMessageText("Выберите действие:", {
    reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
  });
}
