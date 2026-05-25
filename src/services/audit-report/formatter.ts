import type { AuditReport } from "./types.js";

function fmtNum(n: number): string {
  return n.toLocaleString("ru-RU");
}

function pct(part: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function pad(str: string, len: number): string {
  return str.padEnd(len);
}

function padStart(str: string, len: number): string {
  return str.padStart(len);
}

export function formatAuditReportText(report: AuditReport): string {
  const lines: string[] = [];
  const W = 42;
  const sep = "═".repeat(W);

  lines.push(sep);
  lines.push("       AUDIT REPORT");
  lines.push(
    `       Generated: ${report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}`,
  );
  lines.push(`       Period: ${report.period}`);
  lines.push(sep);
  lines.push("");

  // Summary
  lines.push("📊 SUMMARY");
  lines.push(`  Total Tested:    ${fmtNum(report.totalTested)}`);
  lines.push(
    `  Successful:      ${fmtNum(report.totalSuccess)} (${pct(report.totalSuccess, report.totalTested)})`,
  );
  lines.push(
    `  Failed:          ${fmtNum(report.totalFailed)} (${pct(report.totalFailed, report.totalTested)})`,
  );
  lines.push("");

  // Rates
  lines.push("📈 RATES");
  lines.push(`  2FA Rate:        ${report.twoFaRate}%`);
  lines.push(`  Locked Rate:     ${report.lockedRate}%`);
  lines.push(`  Not Found Rate:  ${report.accountNotFoundRate}%`);
  lines.push("");

  // Performance
  lines.push("⏱ PERFORMANCE");
  lines.push(`  Avg Response:    ${fmtNum(report.averageResponseTime)} ms`);
  for (const [proto, avg] of Object.entries(
    report.averageResponseTimeByProtocol,
  )) {
    lines.push(`  ${pad(proto + ":", 16)} ${fmtNum(avg)} ms`);
  }
  lines.push("");

  // By Provider
  if (report.byProvider.length > 0) {
    lines.push("📧 BY PROVIDER");
    lines.push(
      `  ${pad("Provider", 18)} ${padStart("Total", 7)} ${padStart("Success", 9)} ${padStart("Rate", 8)}`,
    );
    lines.push("  " + "─".repeat(W - 2));
    for (const p of report.byProvider) {
      lines.push(
        `  ${pad(p.provider, 18)} ${padStart(fmtNum(p.total), 7)} ${padStart(fmtNum(p.successful), 9)} ${padStart(p.successRate + "%", 8)}`,
      );
    }
    lines.push("");
  }

  // By Status
  if (Object.keys(report.byStatus).length > 0) {
    lines.push("📋 BY STATUS");
    const sorted = Object.entries(report.byStatus).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [status, count] of sorted) {
      lines.push(
        `  ${pad(status + ":", 30)} ${padStart(fmtNum(count), 8)}`,
      );
    }
    lines.push("");
  }

  // By Protocol
  if (Object.keys(report.byProtocol).length > 0) {
    lines.push("🔌 BY PROTOCOL");
    for (const [proto, count] of Object.entries(report.byProtocol)) {
      lines.push(
        `  ${pad(proto + ":", 30)} ${padStart(fmtNum(count), 8)}`,
      );
    }
    lines.push("");
  }

  // By Account Status
  if (Object.keys(report.byAccountStatus).length > 0) {
    lines.push("🔐 BY ACCOUNT STATUS");
    const sorted = Object.entries(report.byAccountStatus).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [status, count] of sorted) {
      lines.push(
        `  ${pad(status + ":", 30)} ${padStart(fmtNum(count), 8)}`,
      );
    }
    lines.push("");
  }

  lines.push(sep);

  return lines.join("\n");
}
