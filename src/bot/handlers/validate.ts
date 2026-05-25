import { InlineKeyboard } from "grammy";
import { db } from "../../services/db.js";
import type { BotContext } from "../types.js";

export async function validateCommand(ctx: BotContext) {
  const tasks = await db.task.findMany({
    where: {
      userId: ctx.dbUser.id,
      status: "COMPLETED",
    },
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
    await ctx.reply(
      "🔐 Нет задач с email:password парами для IMAP валидации.",
    );
    return;
  }

  const kb = new InlineKeyboard();
  for (const t of eligible) {
    kb.text(
      `📋 #${t.id} — ${t.fileName} (${t.authCount})`,
      `validate:select:${t.id}`,
    ).row();
  }

  await ctx.reply("🔐 <b>IMAP Валидация</b>\n\nВыберите задачу:", {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}
