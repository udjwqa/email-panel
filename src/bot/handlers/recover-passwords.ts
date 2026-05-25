import { InlineKeyboard } from "grammy";
import { db } from "../../services/db.js";
import type { BotContext } from "../types.js";

export async function recoverPasswordsCommand(ctx: BotContext) {
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
      return { ...t, emailCount: count };
    }),
  );

  const eligible = withCounts.filter((t) => t.emailCount > 0);

  if (eligible.length === 0) {
    await ctx.reply("🔑 Нет задач с email для dictionary attack.");
    return;
  }

  const kb = new InlineKeyboard();
  for (const t of eligible) {
    kb.text(
      `📋 #${t.id} — ${t.fileName} (${t.emailCount})`,
      `rpw:task:${t.id}`,
    ).row();
  }

  await ctx.reply(
    "🔑 <b>Dictionary Attack</b>\n\n" +
      "Пробуем пароли из словарей для каждого email.\n\n" +
      "Выберите задачу с email'ами:",
    { parse_mode: "HTML", reply_markup: kb },
  );
}
