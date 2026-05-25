import { InlineKeyboard } from "grammy";
import { Api } from "grammy";
import { db } from "../../services/db.js";
import {
  getDictionaries,
  getDictionaryPasswords,
  deleteDictionary,
  searchPassword,
  createDictionary,
  getDictionaryStats,
} from "../../services/dictionary/manager.js";
import { parsePasswordFile } from "../../services/dictionary/parser.js";
import { audit } from "../../services/audit.js";
import { config } from "../../config.js";
import type { BotContext } from "../types.js";

const CATEGORY_LABELS: Record<string, string> = {
  common: "📗 Common",
  user_specific: "📘 User-specific",
  leaked: "📕 Leaked",
};

export async function handleDictionaryCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("dict:")) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "list":
      return showDictionaryList(ctx);
    case "upload":
      return handleUpload(ctx, parts[2]);
    case "detail":
      return showDictionaryDetail(ctx, Number(parts[2]));
    case "delete":
      return handleDelete(ctx, Number(parts[2]));
    case "search":
      return promptSearch(ctx);
    case "back":
      return backToMenu(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

async function showDictionaryList(ctx: BotContext) {
  const dictionaries = await getDictionaries(ctx.dbUser.id);
  const stats = await getDictionaryStats(ctx.dbUser.id);

  let text = `📖 <b>Словари паролей</b>\n\n`;
  text += `Всего: ${stats.totalDictionaries} словарей, ${stats.totalPasswords} паролей\n`;

  const kb = new InlineKeyboard()
    .text("📂 Загрузить словарь", "dict:upload:menu")
    .row();

  for (const d of dictionaries.slice(0, 10)) {
    const catIcon = d.category === "common" ? "📗" : d.category === "leaked" ? "📕" : "📘";
    kb.text(`${catIcon} ${d.name} (${d.entryCount})`, `dict:detail:${d.id}`).row();
  }

  kb.text("🔍 Поиск", "dict:search").text("« Меню", "dict:back");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
}

async function handleUpload(ctx: BotContext, sub: string) {
  if (sub === "menu") {
    const kb = new InlineKeyboard()
      .text("📗 Common", "dict:upload:common")
      .row()
      .text("📘 User-specific", "dict:upload:user_specific")
      .row()
      .text("📕 Leaked", "dict:upload:leaked")
      .row()
      .text("« Назад", "dict:list");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "📂 <b>Загрузка словаря</b>\n\nВыберите категорию, затем отправьте TXT файл:",
      { parse_mode: "HTML", reply_markup: kb },
    );
    return;
  }

  // Set session state for awaiting file
  ctx.session.wizard = { step: null };
  (ctx.session as any).dictUploadCategory = sub;

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `📂 Категория: <b>${CATEGORY_LABELS[sub] ?? sub}</b>\n\n` +
      `Отправьте .txt файл с паролями (один пароль на строку).`,
    { parse_mode: "HTML" },
  );
}

async function showDictionaryDetail(ctx: BotContext, dictId: number) {
  const dict = await db.passwordDictionary.findUnique({
    where: { id: dictId },
  });
  if (!dict || dict.userId !== ctx.dbUser.id) {
    await ctx.answerCallbackQuery("Словарь не найден");
    return;
  }

  const { passwords, total } = await getDictionaryPasswords(dictId, 1, 5);

  let text =
    `📖 <b>${dict.name}</b>\n\n` +
    `Категория: ${CATEGORY_LABELS[dict.category] ?? dict.category}\n` +
    `Паролей: ${dict.entryCount}\n` +
    `Создан: ${dict.createdAt.toLocaleDateString("ru-RU")}\n`;

  if (dict.source) text += `Источник: ${dict.source}\n`;

  if (passwords.length > 0) {
    text += `\nПримеры (первые 5):\n`;
    for (const p of passwords) {
      const flags = [
        p.hasUpper ? "A" : "",
        p.hasDigits ? "1" : "",
        p.hasSpecial ? "#" : "",
      ]
        .filter(Boolean)
        .join("");
      text += `  <code>${p.password}</code> (${p.length}) [${flags}]\n`;
    }
  }

  const kb = new InlineKeyboard()
    .text("🗑 Удалить", `dict:delete:${dictId}`)
    .row()
    .text("« К списку", "dict:list");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
}

async function handleDelete(ctx: BotContext, dictId: number) {
  const dict = await db.passwordDictionary.findUnique({
    where: { id: dictId },
  });
  if (!dict || dict.userId !== ctx.dbUser.id) {
    await ctx.answerCallbackQuery("Словарь не найден");
    return;
  }

  await deleteDictionary(dictId);

  audit({
    userId: ctx.dbUser.id,
    type: "dictionary_deleted",
    level: "INFO",
    message: `Dictionary "${dict.name}" deleted (${dict.entryCount} passwords)`,
  });

  await ctx.answerCallbackQuery("Словарь удалён");
  return showDictionaryList(ctx);
}

async function promptSearch(ctx: BotContext) {
  (ctx.session as any).dictSearchMode = true;

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "🔍 <b>Поиск пароля</b>\n\nВведите пароль для поиска в словарях:",
    { parse_mode: "HTML" },
  );
}

async function backToMenu(ctx: BotContext) {
  const { mainMenuKeyboard } = await import("../keyboards/main-menu.js");
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Выберите действие:", {
    reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
  });
}

export async function handleDictionaryFileUpload(
  ctx: BotContext,
): Promise<boolean> {
  const category = (ctx.session as any).dictUploadCategory;
  if (!category) return false;

  const doc = ctx.message?.document;
  if (!doc) return false;

  if (!doc.file_name?.endsWith(".txt")) {
    await ctx.reply("Поддерживается только .txt формат.");
    return true;
  }

  const api = new Api(config.botToken);
  const file = await api.getFile(doc.file_id);
  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

  const response = await fetch(url);
  const content = await response.text();

  const result = parsePasswordFile(content);

  if (result.entries.length === 0) {
    await ctx.reply("Файл пуст или не содержит валидных паролей.");
    (ctx.session as any).dictUploadCategory = undefined;
    return true;
  }

  const name = doc.file_name?.replace(".txt", "") ?? "dictionary";
  const dict = await createDictionary(
    ctx.dbUser.id,
    name,
    category,
    result.entries,
    doc.file_name,
  );

  audit({
    userId: ctx.dbUser.id,
    type: "dictionary_uploaded",
    level: "INFO",
    message: `Dictionary "${name}" uploaded: ${dict.entryCount} passwords (${category})`,
  });

  (ctx.session as any).dictUploadCategory = undefined;

  await ctx.reply(
    `✅ <b>Словарь загружен</b>\n\n` +
      `Название: ${name}\n` +
      `Категория: ${CATEGORY_LABELS[category] ?? category}\n` +
      `Строк: ${result.totalLines}\n` +
      `Валидных: ${result.validLines}\n` +
      `Дубликатов: ${result.duplicateCount}\n` +
      `Сохранено: ${dict.entryCount}`,
    { parse_mode: "HTML" },
  );

  return true;
}

export async function handleDictionaryTextInput(
  ctx: BotContext,
): Promise<boolean> {
  if (!(ctx.session as any).dictSearchMode) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  (ctx.session as any).dictSearchMode = false;

  const result = await searchPassword(text, ctx.dbUser.id);

  if (result.found) {
    await ctx.reply(
      `🔍 Пароль <code>${text}</code> найден в:\n\n` +
        result.dictionaries.map((d) => `  • ${d}`).join("\n"),
      { parse_mode: "HTML" },
    );
  } else {
    await ctx.reply(`🔍 Пароль <code>${text}</code> не найден в словарях.`, {
      parse_mode: "HTML",
    });
  }

  return true;
}
