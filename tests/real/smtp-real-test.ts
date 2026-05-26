/**
 * ТЕСТ 1: SMTP Verification на реальных серверах
 *
 * Запуск: npx tsx tests/real/smtp-real-test.ts
 */

import { verifyMailbox } from "../../src/services/smtp/verifier.js";
import { resolveMX } from "../../src/services/smtp/resolver.js";

interface TestCase {
  email: string;
  description: string;
  expectedStatus: string;
}

const TEST_CASES: TestCase[] = [
  {
    email: "postmaster@gmail.com",
    description: "Gmail — существующий (postmaster)",
    expectedStatus: "deliverable",
  },
  {
    email: "postmaster@outlook.com",
    description: "Outlook — существующий (postmaster)",
    expectedStatus: "deliverable",
  },
  {
    email: "nonexistent_xyz_fake_12345@gmail.com",
    description: "Gmail — несуществующий",
    expectedStatus: "undeliverable",
  },
  {
    email: "totally_fake_mailbox_99@outlook.com",
    description: "Outlook — несуществующий",
    expectedStatus: "undeliverable",
  },
  {
    email: "invalid-email-no-at",
    description: "Невалидный формат (нет @)",
    expectedStatus: "error",
  },
];

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ТЕСТ 1: SMTP Verification — реальные серверы");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  // Шаг 1: Проверяем MX-резолв
  console.log("--- Шаг 1: MX Resolution ---");
  const mxCache = new Map();

  for (const domain of ["gmail.com", "outlook.com"]) {
    try {
      const mx = await resolveMX(domain, mxCache);
      console.log(`  ${domain}: ${mx.length} MX records`);
      for (const record of mx.slice(0, 3)) {
        console.log(`    → ${record.host} (priority: ${record.priority})`);
      }
    } catch (err) {
      console.log(`  ${domain}: ОШИБКА — ${err}`);
    }
  }

  console.log("");
  console.log("--- Шаг 2: SMTP Verification ---");
  console.log("");

  const results: Array<{
    email: string;
    description: string;
    expected: string;
    actual: string;
    match: boolean;
    smtpCode: number | null;
    mxHost: string | null;
    responseTime: number;
    error: string | null;
  }> = [];

  for (const tc of TEST_CASES) {
    console.log(`  Проверяю: ${tc.email} ...`);
    const start = Date.now();

    try {
      const result = await verifyMailbox(tc.email, {
        timeout: 30_000,
        mxCache,
      });

      const elapsed = Date.now() - start;

      results.push({
        email: tc.email,
        description: tc.description,
        expected: tc.expectedStatus,
        actual: result.status,
        match: result.status === tc.expectedStatus,
        smtpCode: result.smtpCode,
        mxHost: result.mxHost,
        responseTime: result.responseTime || elapsed,
        error: result.error,
      });

      console.log(`    → ${result.status} (${result.smtpCode ?? "N/A"}) — ${elapsed}ms`);
    } catch (err: any) {
      const elapsed = Date.now() - start;
      results.push({
        email: tc.email,
        description: tc.description,
        expected: tc.expectedStatus,
        actual: "error",
        match: tc.expectedStatus === "error",
        smtpCode: null,
        mxHost: null,
        responseTime: elapsed,
        error: err.message,
      });

      console.log(`    → ERROR: ${err.message} — ${elapsed}ms`);
    }
  }

  // Таблица результатов
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  РЕЗУЛЬТАТЫ");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  console.log(
    padEnd("Email", 40) +
    padEnd("Ожидание", 15) +
    padEnd("Результат", 15) +
    padEnd("SMTP", 8) +
    padEnd("Время", 10) +
    padEnd("OK?", 5),
  );
  console.log("─".repeat(93));

  for (const r of results) {
    const emailShort = r.email.length > 38 ? r.email.slice(0, 35) + "..." : r.email;
    console.log(
      padEnd(emailShort, 40) +
      padEnd(r.expected, 15) +
      padEnd(r.actual, 15) +
      padEnd(String(r.smtpCode ?? "—"), 8) +
      padEnd(`${r.responseTime}ms`, 10) +
      (r.match ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(93));

  const passed = results.filter((r) => r.match).length;
  const total = results.length;
  console.log("");
  console.log(`  Passed: ${passed}/${total}`);

  // Детали ошибок
  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    console.log("");
    console.log("  Детали ошибок:");
    for (const r of errors) {
      console.log(`    ${r.email}: ${r.error}`);
    }
  }

  // MX hosts used
  console.log("");
  console.log("  MX серверы:");
  for (const r of results) {
    if (r.mxHost) {
      console.log(`    ${r.email} → ${r.mxHost}`);
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");

  process.exit(passed === total ? 0 : 1);
}

function padEnd(str: string, len: number): string {
  return str.padEnd(len);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
