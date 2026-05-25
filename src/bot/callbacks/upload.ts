import { InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { db } from "../../services/db.js";
import { emailQueue } from "../../services/queue.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";
import { audit } from "../../services/audit.js";
import { getNumSetting } from "../../services/settings.js";

export async function handleUploadCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("upload:")) return;

  const parts = data.split(":");
  const action = parts[1];
  const taskId = Number(parts[2]);

  if (!taskId || isNaN(taskId)) {
    await ctx.answerCallbackQuery("Некорректная задача");
    return;
  }

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.userId !== ctx.dbUser.id) {
    await ctx.answerCallbackQuery("Задача не найдена");
    return;
  }

  switch (action) {
    case "run": {
      const dailyLimit = await getNumSetting("daily_task_limit");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCount = await db.task.count({
        where: { userId: ctx.dbUser.id, createdAt: { gte: today } },
      });
      if (todayCount >= dailyLimit) {
        await ctx.answerCallbackQuery(`Лимит задач в день: ${dailyLimit}`);
        return;
      }

      await db.task.update({
        where: { id: taskId },
        data: { status: "QUEUED" },
      });

      await emailQueue.add("validate", { taskId }, {
        jobId: `task-${taskId}`,
      });

      audit({ userId: ctx.dbUser.id, type: "task_started", level: "INFO", message: `Task #${taskId} queued (${task.validCount} emails)` });

      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `✅ Задача #${taskId} поставлена в очередь.\n` +
          `Файл: ${task.fileName}\n` +
          `Email для проверки: ${task.validCount}`,
        {
          reply_markup: new InlineKeyboard().text(
            "📋 Мои задачи",
            "menu:tasks",
          ),
        },
      );
      break;
    }
    case "cancel": {
      await db.email.deleteMany({ where: { taskId } });
      await db.task.update({
        where: { id: taskId },
        data: { status: "CANCELLED" },
      });

      audit({ userId: ctx.dbUser.id, type: "task_cancelled", level: "WARNING", message: `Task #${taskId} cancelled` });

      await ctx.answerCallbackQuery();
      await ctx.editMessageText(`✖ Задача #${taskId} отменена.`, {
        reply_markup: mainMenuKeyboard(ctx.dbUser.role, ctx.dbUser.isAdmin),
      });
      break;
    }
    default:
      await ctx.answerCallbackQuery("Неизвестная команда");
  }
}
