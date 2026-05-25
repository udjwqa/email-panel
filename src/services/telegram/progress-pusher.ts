import { Api, InlineKeyboard } from "grammy";
import { config } from "../../config.js";
import { db } from "../db.js";

const api = new Api(config.botToken);
const MIN_INTERVAL_MS = 3000;

export class ProgressPusher {
  private taskId: number;
  private lastPushAt = 0;
  private chatId: bigint | null = null;
  private messageId: number | null = null;
  private callbackPrefix: string;

  constructor(taskId: number, callbackPrefix = "task") {
    this.taskId = taskId;
    this.callbackPrefix = callbackPrefix;
  }

  async init(): Promise<void> {
    const tt = await db.telegramTask.findFirst({
      where: { taskId: this.taskId },
    });
    if (tt) {
      this.chatId = tt.chatId;
      this.messageId = tt.messageId;
    }
  }

  async pushProgress(text: string, showCancel = true): Promise<void> {
    if (!this.chatId || !this.messageId) return;

    const now = Date.now();
    if (now - this.lastPushAt < MIN_INTERVAL_MS) return;
    this.lastPushAt = now;

    try {
      const kb = new InlineKeyboard();
      kb.text("🔄 Обновить", `${this.callbackPrefix}:progress:${this.taskId}`);
      if (showCancel) {
        kb.text("⏹ Отменить", `${this.callbackPrefix}:cancel:${this.taskId}`);
      }

      await api.editMessageText(
        this.chatId.toString(),
        this.messageId,
        text,
        { parse_mode: "HTML", reply_markup: kb },
      );
    } catch {
      // Message deleted or content unchanged
    }
  }

  async pushStageComplete(
    stageName: string,
    summary: string,
  ): Promise<void> {
    if (!this.chatId) return;
    try {
      await api.sendMessage(
        this.chatId.toString(),
        `✅ <b>${stageName} завершён</b>\n\n${summary}`,
        { parse_mode: "HTML" },
      );
    } catch {}
  }

  async pushFinalResult(text: string, kb?: InlineKeyboard): Promise<void> {
    if (!this.chatId || !this.messageId) return;
    try {
      await api.editMessageText(
        this.chatId.toString(),
        this.messageId,
        text,
        { parse_mode: "HTML", reply_markup: kb },
      );
    } catch {}
  }

  async pushCancelled(): Promise<void> {
    if (!this.chatId || !this.messageId) return;
    try {
      await api.editMessageText(
        this.chatId.toString(),
        this.messageId,
        `🚫 <b>Задача #${this.taskId} отменена</b>`,
        { parse_mode: "HTML" },
      );
    } catch {}
  }
}
