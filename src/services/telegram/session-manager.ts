import { db } from "../db.js";
import type { TelegramSession } from "@prisma/client";

export async function getOrCreateSession(
  chatId: bigint,
  userId: number,
): Promise<TelegramSession> {
  return db.telegramSession.upsert({
    where: { chatId },
    create: {
      chatId,
      userId,
      sessionData: {},
      isActive: true,
      lastActivity: new Date(),
    },
    update: {
      isActive: true,
      lastActivity: new Date(),
    },
  });
}

export async function updateSessionData(
  chatId: bigint,
  data: Record<string, unknown>,
): Promise<void> {
  await db.telegramSession.update({
    where: { chatId },
    data: {
      sessionData: data as any,
      lastActivity: new Date(),
    },
  });
}

export async function deactivateSession(chatId: bigint): Promise<void> {
  await db.telegramSession.update({
    where: { chatId },
    data: { isActive: false },
  });
}

export async function getActiveSession(
  chatId: bigint,
): Promise<TelegramSession | null> {
  return db.telegramSession.findFirst({
    where: { chatId, isActive: true },
  });
}

export async function getSessionsByUser(
  userId: number,
): Promise<TelegramSession[]> {
  return db.telegramSession.findMany({
    where: { userId, isActive: true },
  });
}
