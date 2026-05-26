import { InlineKeyboard } from "grammy";
import { db } from "../../services/db.js";
import { TieredRecoveryEngine, type AuthFunction } from "../../services/matching/tiered-recovery.js";
import { IMAPVerifier } from "../../services/imap/verifier.js";
import { getImapConfig } from "../../services/imap/host-resolver.js";
import { trackTask } from "../../services/telegram/task-tracker.js";
import { audit } from "../../services/audit.js";
import type { BotContext } from "../types.js";

const TIER_LABELS = [
  "", // 0-indexed padding
  "Tier 1: Top 100 (мгновенный)",
  "Tier 2: Персонализированные маски",
  "Tier 3: SecLists 10K",
  "Tier 4: SecLists 100K (NCSC)",
  "Tier 5: RockYou 75K",
  "Tier 6: Custom словарь",
];

export async function handleTieredCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("tier:")) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "start":
      return showTierConfig(ctx);
    case "toggle":
      return toggleTier(ctx, Number(parts[2]));
    case "task":
      return selectTask(ctx);
    case "select":
      return taskSelected(ctx, Number(parts[2]));
    case "run":
      return runTiered(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

function getSelectedTiers(ctx: BotContext): number[] {
  return (ctx.session as any).tieredTiers ?? [1, 2, 3];
}

async function showTierConfig(ctx: BotContext) {
  if (!(ctx.session as any).tieredTiers) {
    (ctx.session as any).tieredTiers = [1, 2, 3];
  }
  const selected = getSelectedTiers(ctx);

  const kb = new InlineKeyboard();
  for (let i = 1; i <= 6; i++) {
    const mark = selected.includes(i) ? "☑️" : "☐";
    kb.text(`${mark} ${TIER_LABELS[i]}`, `tier:toggle:${i}`).row();
  }
  kb.text("📋 Выбрать задачу", "tier:task").row();
  kb.text("◀ Recovery", "section:recovery");

  const maxTier = Math.max(...selected, 0);
  const text =
    `🎯 <b>Tiered Recovery</b>\n\n` +
    `Выберите тиры для подбора паролей:\n` +
    `(каждый следующий = больше паролей, дольше)\n\n` +
    `Выбрано: ${selected.length} тиров (до Tier ${maxTier})`;

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
}

async function toggleTier(ctx: BotContext, tier: number) {
  const tiers: number[] = (ctx.session as any).tieredTiers ?? [1, 2, 3];
  const idx = tiers.indexOf(tier);
  if (idx >= 0) {
    tiers.splice(idx, 1);
  } else {
    tiers.push(tier);
    tiers.sort();
  }
  (ctx.session as any).tieredTiers = tiers;
  return showTierConfig(ctx);
}

async function selectTask(ctx: BotContext) {
  const tasks = await db.task.findMany({
    where: { userId: ctx.dbUser.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const withCounts = await Promise.all(
    tasks.map(async (t) => {
      const count = await db.email.count({
        where: { taskId: t.id, status: "MX_FOUND" },
      });
      return { ...t, count };
    }),
  );

  const eligible = withCounts.filter((t) => t.count > 0);

  if (eligible.length === 0) {
    await ctx.answerCallbackQuery("Нет задач с email'ами");
    return;
  }

  const kb = new InlineKeyboard();
  for (const t of eligible) {
    kb.text(`📋 #${t.id} — ${t.fileName} (${t.count})`, `tier:select:${t.id}`).row();
  }
  kb.text("◀ Назад", "tier:start");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText("📋 Выберите задачу:", { reply_markup: kb });
}

async function taskSelected(ctx: BotContext, taskId: number) {
  (ctx.session as any).tieredTaskId = taskId;

  const emailCount = await db.email.count({
    where: { taskId, status: "MX_FOUND" },
  });
  const selected = getSelectedTiers(ctx);
  const maxTier = Math.max(...selected, 0);

  const kb = new InlineKeyboard()
    .text("▶ Запустить Tiered Recovery", "tier:run")
    .row()
    .text("◀ Тиры", "tier:start");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🎯 <b>Готов к запуску</b>\n\n` +
      `Задача: #${taskId}\n` +
      `Email'ов: ${emailCount}\n` +
      `Тиры: ${selected.join(", ")} (до Tier ${maxTier})\n\n` +
      `Нажмите "Запустить":`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}

async function runTiered(ctx: BotContext) {
  const taskId = (ctx.session as any).tieredTaskId;
  const tiers = getSelectedTiers(ctx);
  const maxTier = Math.max(...tiers, 0);

  if (!taskId) {
    await ctx.answerCallbackQuery("Выберите задачу");
    return;
  }

  const emails = await db.email.findMany({
    where: { taskId, status: "MX_FOUND" },
    select: { email: true },
    take: 5,
  });

  audit({
    userId: ctx.dbUser.id,
    type: "tiered_recovery_started",
    level: "INFO",
    message: `Tiered recovery: task #${taskId}, tiers [${tiers.join(",")}], ${emails.length} emails`,
  });

  await ctx.answerCallbackQuery("Tiered Recovery запущен");
  await ctx.editMessageText(
    `⏳ <b>Tiered Recovery запущен</b>\n\n` +
      `Задача: #${taskId}\n` +
      `Emails: ${emails.length}\n` +
      `Max Tier: ${maxTier}\n\n` +
      `Обработка в фоне...`,
    { parse_mode: "HTML" },
  );
}
