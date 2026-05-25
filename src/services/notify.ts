import { Api } from "grammy";
import { config } from "../config.js";
import { db } from "./db.js";
import { shouldNotify } from "./telegram/notification-settings.js";

const api = new Api(config.botToken);

async function sendToUser(telegramId: bigint, text: string): Promise<void> {
  try {
    await api.sendMessage(telegramId.toString(), text, {
      parse_mode: "HTML",
    });
  } catch {
    // user may have blocked the bot
  }
}

async function sendToAdmins(text: string): Promise<void> {
  const admins = await db.user.findMany({
    where: { role: "ADMIN" },
    select: { telegramId: true },
  });

  for (const admin of admins) {
    await sendToUser(admin.telegramId, text);
  }
}

export async function notifyTaskCompleted(taskId: number): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { user: { select: { id: true, telegramId: true } } },
  });
  if (!task) return;

  if (!(await shouldNotify(task.user.id, "task_complete"))) return;

  await sendToUser(
    task.user.telegramId,
    `✅ <b>Задача #${taskId} завершена</b>\n` +
      `Файл: ${task.fileName}\n` +
      `Обработано: ${task.processedRows}\n` +
      `Валидных: ${task.validCount} | Невалидных: ${task.invalidCount} | Ошибок: ${task.errorCount}`,
  );
}

export async function notifyTaskFailed(
  taskId: number,
  reason: string,
): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { user: { select: { id: true, telegramId: true } } },
  });
  if (!task) return;

  if (!(await shouldNotify(task.user.id, "task_failed"))) return;

  await sendToUser(
    task.user.telegramId,
    `❌ <b>Задача #${taskId} остановлена с ошибкой</b>\n` +
      `Файл: ${task.fileName}\n` +
      `Причина: ${reason}`,
  );
}

export async function notifyErrorThreshold(
  taskId: number,
  errorCount: number,
  totalProcessed: number,
): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { user: { select: { id: true, telegramId: true } } },
  });
  if (!task) return;

  if (!(await shouldNotify(task.user.id, "error_threshold"))) return;

  const rate = totalProcessed > 0 ? Math.round((errorCount / totalProcessed) * 100) : 0;

  await sendToUser(
    task.user.telegramId,
    `⚠️ <b>Превышен лимит ошибок в задаче #${taskId}</b>\n` +
      `Файл: ${task.fileName}\n` +
      `Ошибок: ${errorCount} (${rate}% от обработанных)\n` +
      `Задача продолжает работу.`,
  );
}

export async function notifyExportReady(
  userId: number,
  exportId: number,
  count: number,
  fileName: string,
): Promise<void> {
  if (!(await shouldNotify(userId, "export_ready"))) return;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { telegramId: true },
  });
  if (!user) return;

  await sendToUser(
    user.telegramId,
    `📥 <b>Экспорт #${exportId} готов</b>\n` +
      `Файл: ${fileName}\n` +
      `Email: ${count}`,
  );
}

export async function notifyWorkerCrash(error: string): Promise<void> {
  await sendToAdmins(
    `🔴 <b>Критическая ошибка воркера</b>\n` +
      `Фоновый воркер валидации упал.\n` +
      `Ошибка: ${error}\n\n` +
      `Требуется перезапуск.`,
  );
}
