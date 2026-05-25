import { InlineKeyboard } from "grammy";
import { db } from "../../services/db.js";
import type { BotContext } from "../types.js";

export async function checkSmtpCommand(ctx: BotContext) {
  const tasks = await db.task.findMany({
    where: {
      userId: ctx.dbUser.id,
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const tasksWithCounts = await Promise.all(
    tasks.map(async (t) => {
      const mxCount = await db.email.count({
        where: { taskId: t.id, status: "MX_FOUND" },
      });
      return { ...t, mxCount };
    }),
  );

  const eligible = tasksWithCounts.filter((t) => t.mxCount > 0);

  if (eligible.length === 0) {
    await ctx.reply("📧 Нет задач с MX_FOUND email'ами для SMTP проверки.");
    return;
  }

  const kb = new InlineKeyboard();
  for (const t of eligible) {
    kb.text(
      `📋 #${t.id} — ${t.fileName} (${t.mxCount})`,
      `smtp:select:${t.id}`,
    ).row();
  }

  await ctx.reply("📧 <b>SMTP Проверка</b>\n\nВыберите задачу:", {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}
