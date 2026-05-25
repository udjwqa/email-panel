import { db } from "../db.js";
import type { NotificationSetting } from "@prisma/client";

export type NotificationType =
  | "task_complete"
  | "task_failed"
  | "error_threshold"
  | "export_ready"
  | "security_alerts";

const TYPE_TO_FIELD: Record<NotificationType, keyof NotificationSetting> = {
  task_complete: "taskComplete",
  task_failed: "taskFailed",
  error_threshold: "errorThreshold",
  export_ready: "exportReady",
  security_alerts: "securityAlerts",
};

export async function getNotificationSettings(
  userId: number,
): Promise<NotificationSetting> {
  const existing = await db.notificationSetting.findUnique({
    where: { userId },
  });

  if (existing) return existing;

  return db.notificationSetting.create({
    data: { userId },
  });
}

export interface NotificationSettingUpdate {
  taskComplete?: boolean;
  taskFailed?: boolean;
  errorThreshold?: boolean;
  exportReady?: boolean;
  securityAlerts?: boolean;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
}

export async function updateNotificationSettings(
  userId: number,
  settings: NotificationSettingUpdate,
): Promise<NotificationSetting> {
  return db.notificationSetting.upsert({
    where: { userId },
    create: { userId, ...settings },
    update: settings,
  });
}

export async function shouldNotify(
  userId: number,
  type: NotificationType,
): Promise<boolean> {
  const settings = await db.notificationSetting.findUnique({
    where: { userId },
  });

  if (!settings) return true;

  const field = TYPE_TO_FIELD[type];
  if (settings[field] === false) return false;

  if (settings.quietHoursStart != null && settings.quietHoursEnd != null) {
    const hour = new Date().getHours();
    const start = settings.quietHoursStart;
    const end = settings.quietHoursEnd;

    if (start <= end) {
      if (hour >= start && hour < end) return false;
    } else {
      if (hour >= start || hour < end) return false;
    }
  }

  return true;
}
