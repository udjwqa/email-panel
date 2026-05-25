import { InlineKeyboard, InputFile } from "grammy";
import IORedis from "ioredis";
import { db } from "../../services/db.js";
import { recoveryPipelineQueue } from "../../services/queue.js";
import { getDictionaries } from "../../services/dictionary/manager.js";
import { exportRecoveredCredentials } from "../../services/matching/recovered-credentials.js";
import { trackTask } from "../../services/telegram/task-tracker.js";
import { audit } from "../../services/audit.js";
import { config } from "../../config.js";
import type { BotContext } from "../types.js";

export async function handleRecoveryPipelineCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("rpipe:")) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "task":
      return selectTask(ctx, Number(parts[2]));
    case "dict":
      return handleDictSelect(ctx, parts[2]);
    case "pattern":
      return handlePattern(ctx, parts[2]);
    case "run":
      return startPipeline(ctx);
    case "progress":
      return showProgress(ctx);
    case "results":
      return sendResults(ctx);
    case "cancel":
      return cancelPipeline(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

async function selectTask(ctx: BotContext, taskId: number) {
  (ctx.session as any).rpipeTaskId = taskId;
  (ctx.session as any).rpipeDictIds = [];

  const dictionaries = await getDictionaries(ctx.dbUser.id);

  if (dictionaries.length === 0) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "📖 Нет словарей. Загрузите через /dictionary.",
    );
    return;
  }

  const kb = new InlineKeyboard();
  for (const d of dictionaries.slice(0, 10)) {
    kb.text(`☐ ${d.name} (${d.entryCount})`, `rpipe:dict:${d.id}`).row();
  }
  kb.text("▶ Далее (patterns)", "rpipe:pattern:menu").row();

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🔓 <b>Задача #${taskId}</b>\n\nВыберите словари:`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function handleDictSelect(ctx: BotContext, sub: string) {
  const dictIds: number[] = (ctx.session as any).rpipeDictIds ?? [];

  if (sub !== "menu") {
    const dictId = Number(sub);
    const idx = dictIds.indexOf(dictId);
    if (idx >= 0) dictIds.splice(idx, 1);
    else dictIds.push(dictId);
    (ctx.session as any).rpipeDictIds = dictIds;
  }

  const dictionaries = await getDictionaries(ctx.dbUser.id);
  const selectedSet = new Set(dictIds);

  const kb = new InlineKeyboard();
  for (const d of dictionaries.slice(0, 10)) {
    const mark = selectedSet.has(d.id) ? "☑️" : "☐";
    kb.text(`${mark} ${d.name} (${d.entryCount})`, `rpipe:dict:${d.id}`).row();
  }
  kb.text(`▶ Далее (${dictIds.length} выбрано)`, "rpipe:pattern:menu").row();

  await ctx.answerCallbackQuery();
  await ctx.editMessageText("🔓 Выберите словари:", { reply_markup: kb });
}

async function handlePattern(ctx: BotContext, sub: string) {
  if (sub === "menu") {
    const kb = new InlineKeyboard()
      .text("✅ Без паттернов — запустить", "rpipe:run")
      .row()
      .text("🔑 Добавить паттерны", "rpipe:pattern:input");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "🔓 Добавить персонализированные паттерны?\n\n" +
        "(Имя + фамилия + дата → 60+ вариантов паролей)",
      { reply_markup: kb },
    );
    return;
  }

  if (sub === "input") {
    (ctx.session as any).rpipePatternStep = "firstName";
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "🔑 Введите <b>имя</b> для генерации паттернов:",
      { parse_mode: "HTML" },
    );
  }
}

async function startPipeline(ctx: BotContext) {
  const taskId = (ctx.session as any).rpipeTaskId as number;
  const dictIds = (ctx.session as any).rpipeDictIds as number[];
  const chatId = ctx.chat!.id;
  const patternInput = (ctx.session as any).rpipePatternInput ?? undefined;

  if (!taskId || !dictIds || dictIds.length === 0) {
    await ctx.answerCallbackQuery("Выберите задачу и словари");
    return;
  }

  const msgId = ctx.callbackQuery?.message?.message_id;

  await recoveryPipelineQueue.add(`recovery-${taskId}`, {
    userId: ctx.dbUser.id,
    taskId,
    dictionaryIds: dictIds,
    patternInput,
    method: "imap",
    chatId: chatId.toString(),
  });

  await trackTask(taskId, BigInt(chatId), "recovery_pipeline", msgId).catch(() => {});

  audit({
    userId: ctx.dbUser.id,
    type: "recovery_pipeline_started",
    level: "INFO",
    message: `Recovery pipeline started: task #${taskId}, ${dictIds.length} dicts`,
  });

  // Clear session
  (ctx.session as any).rpipeTaskId = undefined;
  (ctx.session as any).rpipeDictIds = undefined;
  (ctx.session as any).rpipePatternInput = undefined;

  await ctx.answerCallbackQuery("Pipeline запущен");
  await ctx.editMessageText(
    `⏳ <b>Recovery Pipeline запущен</b>\n\n` +
      `Задача: #${taskId}\n` +
      `Словари: ${dictIds.length}\n` +
      `Паттерны: ${patternInput ? "да" : "нет"}\n\n` +
      `Обработка начнётся...`,
    { parse_mode: "HTML" },
  );
}

async function showProgress(ctx: BotContext) {
  const taskId = (ctx.session as any).rpipeTaskId;
  const redis = new IORedis(config.redis.url);
  const raw = await redis.get(`recovery-pipeline-progress:${taskId ?? "direct"}`);
  redis.disconnect();

  if (!raw) {
    await ctx.answerCallbackQuery("Нет данных о прогрессе");
    return;
  }

  await ctx.answerCallbackQuery();
}

async function sendResults(ctx: BotContext) {
  const buffer = await exportRecoveredCredentials(ctx.dbUser.id, "csv");

  if (buffer.length === 0) {
    await ctx.answerCallbackQuery("Нет результатов");
    return;
  }

  await ctx.replyWithDocument(
    new InputFile(buffer, `recovery_${Date.now()}.csv`),
    { caption: "🔓 Recovered credentials (CSV)" },
  );
  await ctx.answerCallbackQuery();
}

async function cancelPipeline(ctx: BotContext) {
  await ctx.answerCallbackQuery("Pipeline отменён");
  await ctx.editMessageText("🚫 Recovery Pipeline отменён.", {
    parse_mode: "HTML",
  });
}

export async function handleRecoveryPipelineTextInput(
  ctx: BotContext,
): Promise<boolean> {
  const step = (ctx.session as any).rpipePatternStep;
  if (!step) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  switch (step) {
    case "firstName": {
      (ctx.session as any).rpipePatternFirstName = text;
      (ctx.session as any).rpipePatternStep = "lastName";
      await ctx.reply("🔑 Введите <b>фамилию</b>:", { parse_mode: "HTML" });
      return true;
    }
    case "lastName": {
      const firstName = (ctx.session as any).rpipePatternFirstName;
      (ctx.session as any).rpipePatternInput = { firstName, lastName: text };
      (ctx.session as any).rpipePatternStep = undefined;

      const { InlineKeyboard } = await import("grammy");
      const kb = new InlineKeyboard().text("▶ Запустить Pipeline", "rpipe:run");

      await ctx.reply(
        `🔑 Паттерны: ${firstName} ${text}\n\nНажмите для запуска:`,
        { reply_markup: kb },
      );
      return true;
    }
  }

  return false;
}
