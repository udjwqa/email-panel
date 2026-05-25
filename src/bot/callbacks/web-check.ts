import { InlineKeyboard, InputFile } from "grammy";
import IORedis from "ioredis";
import { db } from "../../services/db.js";
import { webAuthBatchQueue } from "../../services/queue.js";
import { getDomainGroup } from "../../services/domain-groups.js";
import { trackTask } from "../../services/telegram/task-tracker.js";
import { renderProgressBar } from "../../services/progress.js";
import { audit } from "../../services/audit.js";
import { config } from "../../config.js";
import type { BotContext } from "../types.js";

interface ProviderProgress {
  [provider: string]: {
    total: number;
    done: number;
    success: number;
    failed: number;
  };
}

export async function handleWebCheckCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "select":
      return showWebTaskDetail(ctx, Number(parts[2]));
    case "run":
      return startWebCheck(ctx, Number(parts[2]));
    case "progress":
      return showWebProgress(ctx, Number(parts[2]));
    case "cancel":
      return cancelWebCheck(ctx, Number(parts[2]));
    case "back":
      return showWebTaskList(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

async function showWebTaskList(ctx: BotContext) {
  const tasks = await db.task.findMany({
    where: { userId: ctx.dbUser.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const withCounts = await Promise.all(
    tasks.map(async (t) => {
      const count = await db.email.count({
        where: { taskId: t.id, status: "MX_FOUND", password: { not: null } },
      });
      return { ...t, authCount: count };
    }),
  );

  const eligible = withCounts.filter((t) => t.authCount > 0);

  if (eligible.length === 0) {
    await ctx.editMessageText("🌐 Нет задач для Web Auth проверки.");
    await ctx.answerCallbackQuery();
    return;
  }

  const kb = new InlineKeyboard();
  for (const t of eligible) {
    kb.text(
      `📋 #${t.id} — ${t.fileName} (${t.authCount})`,
      `web:select:${t.id}`,
    ).row();
  }

  await ctx.editMessageText(
    "🌐 <b>Web Auth Проверка</b>\n\nВыберите задачу:",
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery();
}

async function showWebTaskDetail(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  const emails = await db.email.findMany({
    where: { taskId, status: "MX_FOUND", password: { not: null } },
    select: { email: true },
  });

  const providerCounts: Record<string, number> = {};
  for (const row of emails) {
    const domain = row.email.split("@")[1]?.toLowerCase() ?? "";
    const provider = getDomainGroup(domain);
    providerCounts[provider] = (providerCounts[provider] ?? 0) + 1;
  }

  const sorted = Object.entries(providerCounts).sort((a, b) => b[1] - a[1]);
  const breakdown = sorted
    .map(([p, c]) => `  ${p}: ${c}`)
    .join("\n");

  const text =
    `🌐 <b>Web Auth задача #${taskId}</b>\n\n` +
    `Файл: ${task.fileName}\n\n` +
    `<b>По провайдерам:</b>\n${breakdown}\n\n` +
    `Итого: ${emails.length} email для проверки`;

  const kb = new InlineKeyboard()
    .text("▶ Запустить", `web:run:${taskId}`)
    .row()
    .text("◀ Назад", "web:back");

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  await ctx.answerCallbackQuery();
}

async function startWebCheck(ctx: BotContext, taskId: number) {
  const chatId = ctx.chat!.id;

  const count = await db.email.count({
    where: { taskId, status: "MX_FOUND", password: { not: null } },
  });

  if (count === 0) {
    await ctx.answerCallbackQuery("Нет email для проверки");
    return;
  }

  const msgId = ctx.callbackQuery?.message?.message_id;

  await webAuthBatchQueue.add(`web-auth-task-${taskId}`, {
    taskId,
    chatId: chatId.toString(),
  });

  await trackTask(taskId, BigInt(chatId), "web_auth", msgId).catch(() => {});

  audit({
    userId: ctx.dbUser.id,
    type: "web_auth_started",
    level: "INFO",
    message: `Web Auth check started for task #${taskId} (${count} emails)`,
  });

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", `web:progress:${taskId}`)
    .text("⏹ Отменить", `web:cancel:${taskId}`);

  await ctx.editMessageText(
    `⏳ <b>Web Auth проверка #${taskId} запущена</b>\n\n` +
      `Обрабатывается ${count} email...\n` +
      renderProgressBar(0, count),
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery("Web Auth проверка запущена");
}

async function showWebProgress(ctx: BotContext, taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  if (task.status === "COMPLETED") {
    // Send results file
    const redis = new IORedis(config.redis.url);
    const csvContent = await redis.get(`web-auth-result:${taskId}`);
    redis.disconnect();

    if (csvContent) {
      const buffer = Buffer.from(csvContent, "utf-8");
      const fileName = `web_auth_${taskId}_${Date.now()}.csv`;

      await ctx.replyWithDocument(new InputFile(buffer, fileName), {
        caption:
          `✅ <b>Web Auth #${taskId} завершена</b>\n\n` +
          `Проверено: ${task.processedRows}\n` +
          `Успешных: ${task.validCount}\n` +
          `Неуспешных: ${task.invalidCount}`,
        parse_mode: "HTML",
      });
    } else {
      await ctx.editMessageText(
        `✅ <b>Web Auth #${taskId} завершена</b>\n\n` +
          `Проверено: ${task.processedRows}\n` +
          `Успешных: ${task.validCount}\n` +
          `Неуспешных: ${task.invalidCount}`,
        { parse_mode: "HTML" },
      );
    }

    await ctx.answerCallbackQuery("Проверка завершена");
    return;
  }

  if (task.status === "PAUSED" || task.status === "CANCELLED") {
    await ctx.editMessageText(
      `⏸ <b>Web Auth #${taskId} — ${task.status === "PAUSED" ? "приостановлена" : "отменена"}</b>`,
      { parse_mode: "HTML" },
    );
    await ctx.answerCallbackQuery();
    return;
  }

  // Show per-provider progress
  const redis = new IORedis(config.redis.url);
  const raw = await redis.get(`web-auth-progress:${taskId}`);
  redis.disconnect();

  let progressText = "";
  if (raw) {
    const progress: ProviderProgress = JSON.parse(raw);
    const sorted = Object.entries(progress).sort(
      (a, b) => b[1].total - a[1].total,
    );

    for (const [provider, data] of sorted) {
      progressText +=
        `  ${provider}: ${renderProgressBar(data.done, data.total)} ${data.done}/${data.total}\n`;
    }
  }

  const totalCount = await db.email.count({
    where: {
      taskId,
      status: { in: ["MX_FOUND", "PROCESSED"] },
      password: { not: null },
    },
  });

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", `web:progress:${taskId}`)
    .text("⏹ Отменить", `web:cancel:${taskId}`);

  await ctx.editMessageText(
    `⏳ <b>Web Auth проверка #${taskId}</b>\n\n` +
      (progressText || renderProgressBar(task.processedRows, totalCount)) +
      `\nОбработано: ${task.processedRows} / ${totalCount}`,
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery();
}

async function cancelWebCheck(ctx: BotContext, taskId: number) {
  await db.task.update({
    where: { id: taskId },
    data: { status: "CANCELLED" },
  });

  audit({
    userId: ctx.dbUser.id,
    type: "web_auth_cancelled",
    level: "INFO",
    message: `Web Auth check cancelled for task #${taskId}`,
  });

  await ctx.editMessageText(
    `🚫 <b>Web Auth проверка #${taskId} отменена</b>`,
    { parse_mode: "HTML" },
  );
  await ctx.answerCallbackQuery("Проверка отменена");
}
