import { InlineKeyboard } from "grammy";
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationType,
} from "../../services/telegram/notification-settings.js";
import type { BotContext } from "../types.js";

const TYPES: Array<{ key: NotificationType; label: string }> = [
  { key: "task_complete", label: "Task Complete" },
  { key: "task_failed", label: "Task Failed" },
  { key: "error_threshold", label: "Error Threshold" },
  { key: "export_ready", label: "Export Ready" },
  { key: "security_alerts", label: "Security Alerts" },
];

const FIELD_MAP: Record<NotificationType, string> = {
  task_complete: "taskComplete",
  task_failed: "taskFailed",
  error_threshold: "errorThreshold",
  export_ready: "exportReady",
  security_alerts: "securityAlerts",
};

export async function showNotificationSettings(ctx: BotContext) {
  const settings = await getNotificationSettings(ctx.dbUser.id);

  const kb = new InlineKeyboard();

  for (const t of TYPES) {
    const field = FIELD_MAP[t.key] as keyof typeof settings;
    const enabled = settings[field] as boolean;
    const icon = enabled ? "☑️" : "☐";
    kb.text(`${icon} ${t.label}`, `notif:toggle:${t.key}`).row();
  }

  const quietStart = settings.quietHoursStart;
  const quietEnd = settings.quietHoursEnd;
  const quietText = quietStart != null && quietEnd != null
    ? `${String(quietStart).padStart(2, "0")}:00 — ${String(quietEnd).padStart(2, "0")}:00`
    : "Не установлено";

  kb.text(`🕐 Quiet Hours: ${quietText}`, "notif:quiet").row();
  kb.text("◀ Настройки", "section:admin");

  const text =
    `🔔 <b>Notification Settings</b>\n\n` +
    `Нажмите чтобы toggle:\n`;

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

export async function handleNotificationCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("notif:")) return;

  const parts = data.split(":");
  const action = parts[1];

  if (action === "toggle") {
    const type = parts[2] as NotificationType;
    const settings = await getNotificationSettings(ctx.dbUser.id);
    const field = FIELD_MAP[type] as keyof typeof settings;
    const current = settings[field] as boolean;

    await updateNotificationSettings(ctx.dbUser.id, { [FIELD_MAP[type]]: !current });
    return showNotificationSettings(ctx);
  }

  if (action === "quiet") {
    const settings = await getNotificationSettings(ctx.dbUser.id);
    const newStart = settings.quietHoursStart == null ? 23 : null;
    const newEnd = settings.quietHoursEnd == null ? 7 : null;

    await updateNotificationSettings(ctx.dbUser.id, {
      quietHoursStart: newStart,
      quietHoursEnd: newEnd,
    });
    return showNotificationSettings(ctx);
  }

  await ctx.answerCallbackQuery();
}
