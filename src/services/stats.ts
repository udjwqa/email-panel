import { db } from "./db.js";

export type Period = "1h" | "24h" | "7d" | "30d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "1h": "за 1 час",
  "24h": "за 24 часа",
  "7d": "за 7 дней",
  "30d": "за 30 дней",
  all: "за всё время",
};

function periodToDate(period: Period): Date | null {
  if (period === "all") return null;
  const now = new Date();
  switch (period) {
    case "1h":
      return new Date(now.getTime() - 60 * 60 * 1000);
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("ru-RU");
}

function fmtUptime(): string {
  const sec = Math.floor(process.uptime());
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}д`);
  if (h > 0) parts.push(`${h}ч`);
  parts.push(`${m}м`);
  return parts.join(" ");
}

export async function getDashboard(period: Period): Promise<string> {
  const since = periodToDate(period);
  const dateFilter = since ? { gte: since } : undefined;
  const taskWhere = dateFilter ? { createdAt: dateFilter } : {};
  const emailWhere = dateFilter ? { createdAt: dateFilter } : {};

  const [
    taskCount,
    taskStatuses,
    emailCount,
    emailStatuses,
    topDomains,
    topErrors,
    completedTasks,
    userCount,
    domainCount,
  ] = await Promise.all([
    db.task.count({ where: taskWhere }),
    db.task.groupBy({
      by: ["status"],
      where: taskWhere,
      _count: true,
    }),
    db.email.count({ where: emailWhere }),
    db.email.groupBy({
      by: ["status"],
      where: emailWhere,
      _count: true,
    }),
    db.email.groupBy({
      by: ["domain"],
      where: emailWhere,
      _count: { domain: true },
      orderBy: { _count: { domain: "desc" } },
      take: 5,
    }),
    db.email.groupBy({
      by: ["errorReason"],
      where: { ...emailWhere, status: "ERROR", errorReason: { not: null } },
      _count: true,
      orderBy: { _count: { errorReason: "desc" } },
      take: 5,
    }),
    db.task.findMany({
      where: {
        ...taskWhere,
        status: "COMPLETED",
        finishedAt: { not: null },
      },
      select: { processedRows: true, createdAt: true, finishedAt: true },
    }),
    db.user.count(),
    db.domain.count(),
  ]);

  const taskStatusMap = Object.fromEntries(
    taskStatuses.map((s) => [s.status, s._count]),
  );
  const emailStatusMap = Object.fromEntries(
    emailStatuses.map((s) => [s.status, s._count]),
  );

  let avgSpeed = 0;
  if (completedTasks.length > 0) {
    let totalRate = 0;
    let counted = 0;
    for (const t of completedTasks) {
      if (!t.finishedAt) continue;
      const durationMin =
        (t.finishedAt.getTime() - t.createdAt.getTime()) / 60000;
      if (durationMin > 0) {
        totalRate += t.processedRows / durationMin;
        counted++;
      }
    }
    if (counted > 0) avgSpeed = Math.round(totalRate / counted);
  }

  const lines: string[] = [
    `📊 Dashboard — ${PERIOD_LABELS[period]}`,
    "",
    `📦 Задачи: ${fmtNum(taskCount)}`,
  ];

  const taskLines: [string, string][] = [
    ["COMPLETED", "  ✅ Завершено"],
    ["PROCESSING", "  🔄 В обработке"],
    ["QUEUED", "  ⏳ В очереди"],
    ["PAUSED", "  ⏸ На паузе"],
    ["FAILED", "  ❌ С ошибкой"],
    ["CANCELLED", "  🚫 Отменено"],
  ];
  for (const [status, label] of taskLines) {
    const count = taskStatusMap[status] ?? 0;
    if (count > 0) lines.push(`${label}: ${fmtNum(count)}`);
  }

  lines.push("");
  lines.push(`📧 Email: ${fmtNum(emailCount)}`);

  const emailLines: [string, string][] = [
    ["MX_FOUND", "  ✅ MX найден"],
    ["INVALID_FORMAT", "  ❌ Невалидный формат"],
    ["DOMAIN_NOT_FOUND", "  🔍 Домен не найден"],
    ["MX_NOT_FOUND", "  📡 MX не найден"],
    ["DUPLICATE", "  🔄 Дубликаты"],
    ["PROCESSED", "  📋 Обработано"],
    ["ERROR", "  ⚠️ Ошибки"],
  ];
  for (const [status, label] of emailLines) {
    const count = emailStatusMap[status] ?? 0;
    if (count > 0)
      lines.push(`${label}: ${fmtNum(count)} (${pct(count, emailCount)})`);
  }

  if (topDomains.length > 0) {
    lines.push("");
    lines.push("🏆 Топ домены:");
    topDomains.forEach((d, i) => {
      lines.push(`  ${i + 1}. ${d.domain} — ${fmtNum(d._count.domain)}`);
    });
  }

  if (topErrors.length > 0) {
    lines.push("");
    lines.push("⚠️ Топ ошибки:");
    topErrors.forEach((e, i) => {
      lines.push(`  ${i + 1}. ${e.errorReason ?? "Unknown"} — ${fmtNum(e._count)}`);
    });
  }

  lines.push("");
  lines.push(`⚡ Скорость: ~${fmtNum(avgSpeed)} email/мин`);
  lines.push(`⏱ Uptime: ${fmtUptime()}`);
  lines.push(`👥 Пользователей: ${fmtNum(userCount)}`);
  lines.push(`🌐 Доменов: ${fmtNum(domainCount)}`);

  return lines.join("\n");
}
