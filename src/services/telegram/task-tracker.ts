import { db } from "../db.js";
import type { TelegramTask } from "@prisma/client";

export async function trackTask(
  taskId: number,
  chatId: bigint,
  taskType: string = "email_validation",
  messageId?: number,
): Promise<TelegramTask> {
  return db.telegramTask.upsert({
    where: { taskId_chatId: { taskId, chatId } },
    create: {
      taskId,
      chatId,
      messageId: messageId ?? null,
      taskType,
      status: "pending",
    },
    update: {
      messageId: messageId ?? undefined,
      status: "pending",
    },
  });
}

export async function updateTaskMessage(
  taskId: number,
  chatId: bigint,
  messageId: number,
): Promise<void> {
  await db.telegramTask.update({
    where: { taskId_chatId: { taskId, chatId } },
    data: { messageId },
  });
}

export async function updateTaskStatus(
  taskId: number,
  chatId: bigint,
  status: string,
): Promise<void> {
  await db.telegramTask.update({
    where: { taskId_chatId: { taskId, chatId } },
    data: { status },
  });
}

export async function getTasksByChatId(
  chatId: bigint,
): Promise<TelegramTask[]> {
  return db.telegramTask.findMany({
    where: { chatId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTaskTracking(
  taskId: number,
): Promise<TelegramTask[]> {
  return db.telegramTask.findMany({
    where: { taskId },
  });
}
