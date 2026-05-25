import { TaskStatus, Task } from "@prisma/client";

const STATUS_LABELS: Record<TaskStatus, string> = {
  CREATED: "📝 Создана",
  QUEUED: "⏳ В очереди",
  PROCESSING: "🔄 В обработке",
  PAUSED: "⏸ Приостановлена",
  COMPLETED: "✅ Завершена",
  FAILED: "❌ Ошибка",
  CANCELLED: "🚫 Отменена",
};

export function formatStatus(status: TaskStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function renderProgressBar(processed: number, total: number): string {
  if (total === 0) return "░░░░░░░░░░ 0%";
  const pct = Math.min(Math.round((processed / total) * 100), 100);
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return `${"▓".repeat(filled)}${"░".repeat(empty)} ${pct}%`;
}

export function formatTaskDetail(task: Task): string {
  const lines = [
    `📋 Задача #${task.id}`,
    `Файл: ${task.fileName}`,
    `Статус: ${formatStatus(task.status)}`,
    "",
  ];

  if (
    task.status === "PROCESSING" ||
    task.status === "PAUSED" ||
    task.status === "COMPLETED"
  ) {
    lines.push(renderProgressBar(task.processedRows, task.totalRows));
    lines.push(`Обработано: ${task.processedRows} / ${task.totalRows}`);
    lines.push("");
  }

  lines.push(`✅ Валидных: ${task.validCount}`);
  lines.push(`❌ Невалидных: ${task.invalidCount}`);
  lines.push(`🔄 Дубликатов: ${task.duplicateCount}`);
  lines.push(`⚠️ Ошибок: ${task.errorCount}`);

  if (task.finishedAt) {
    lines.push("");
    lines.push(`Завершена: ${task.finishedAt.toLocaleString("ru-RU")}`);
  }

  return lines.join("\n");
}

export function formatDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  smtp_check: "SMTP Проверка",
  web_auth: "Web Auth",
  imap_validate: "IMAP Валидация",
  full_audit: "Full Audit",
};

const TASK_TYPE_ICONS: Record<string, string> = {
  smtp_check: "📧",
  web_auth: "🔑",
  imap_validate: "🔐",
  full_audit: "🔒",
};

export function getTaskTypeIcon(taskType: string | null): string {
  return taskType ? (TASK_TYPE_ICONS[taskType] ?? "📋") : "📋";
}

export function getTaskTypeLabel(taskType: string | null): string {
  return taskType ? (TASK_TYPE_LABELS[taskType] ?? taskType) : "";
}

export function formatAuditTaskDetail(
  task: Task,
  taskType: string | null,
  auditProgress?: Record<string, unknown> | null,
): string {
  let text = formatTaskDetail(task);

  if (taskType) {
    const icon = TASK_TYPE_ICONS[taskType] ?? "";
    text = text.replace("📋 Задача", `${icon} Задача`);
    text += `\nТип: ${TASK_TYPE_LABELS[taskType] ?? taskType}`;
  }

  if (auditProgress && taskType === "full_audit") {
    const stages = (auditProgress as any).stages;
    if (stages) {
      text += "\n\n📊 Pipeline:";
      const stageNames = ["smtp", "web_auth", "imap"];
      const stageLabels = ["SMTP", "Web Auth", "IMAP"];
      for (let i = 0; i < stageNames.length; i++) {
        const s = stages[stageNames[i]];
        if (!s) continue;
        const icon =
          s.status === "completed" ? "✅" : s.status === "running" ? "⏳" : "⏸";
        const info =
          s.status === "pending"
            ? "pending"
            : `${s.done}/${s.total} (✓${s.success})`;
        text += `\n  ${icon} ${stageLabels[i]}: ${info}`;
      }
    }
  }

  return text;
}
