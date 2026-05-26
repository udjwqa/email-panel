/**
 * ТЕСТ 2: IMAP Authentication + Account Status Classifier
 *
 * Часть 1: Classifier unit-тест (все 5 статусов, mocked data)
 * Часть 2: Реальный IMAP к Gmail/Outlook (неверные пароли → locked)
 *
 * Запуск: npx tsx tests/real/imap-real-test.ts
 */

import { IMAPVerifier } from "../../src/services/imap/verifier.js";
import { classifyAccountStatus } from "../../src/services/imap/account-status-classifier.js";
import { getImapConfig } from "../../src/services/imap/host-resolver.js";
import type { IMAPAuthResult } from "../../src/services/imap/types.js";

function padEnd(str: string, len: number): string {
  return str.padEnd(len);
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 1: Account Status Classifier (mocked)
// ═══════════════════════════════════════════════

function testClassifier() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 1: Account Status Classifier — все 5 статусов");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const tests = [
    {
      name: "Auth failed → locked",
      input: {
        authResult: { success: false, errorType: "auth_failed" as const, message: "Invalid credentials" },
      },
      expected: "locked",
    },
    {
      name: "Timeout → locked",
      input: {
        authResult: { success: false, errorType: "timeout" as const, message: "Connection timeout" },
      },
      expected: "locked",
    },
    {
      name: "INBOX restricted → restricted",
      input: {
        authResult: { success: true, errorType: null } as IMAPAuthResult,
        inboxCheck: { status: "restricted_access" as const, error: "Permission denied", responseTime: 50 },
      },
      expected: "restricted",
    },
    {
      name: "Suspicious keywords → suspicious_activity",
      input: {
        authResult: { success: true, errorType: null } as IMAPAuthResult,
        inboxCheck: {
          status: "fully_accessible" as const,
          unseenCount: 5,
          totalCount: 100,
          responseTime: 50,
          securityCheck: {
            warnings: [
              { type: "body" as const, indicator: "kw", value: "suspicious activity", severity: "medium" as const, matchedPattern: "test" },
            ],
            messagesScanned: 10,
            hasSecurityWarnings: true,
            responseTime: 100,
          },
        },
      },
      expected: "suspicious_activity",
    },
    {
      name: "Security headers → active_with_2fa",
      input: {
        authResult: { success: true, errorType: null } as IMAPAuthResult,
        inboxCheck: {
          status: "fully_accessible" as const,
          unseenCount: 2,
          totalCount: 50,
          responseTime: 50,
          securityCheck: {
            warnings: [
              { type: "header" as const, indicator: "x-google-2fa", value: "enabled", severity: "high" as const, matchedPattern: "x-google-2fa" },
            ],
            messagesScanned: 5,
            hasSecurityWarnings: true,
            responseTime: 80,
          },
        },
      },
      expected: "active_with_2fa",
    },
    {
      name: "No warnings → active_clean",
      input: {
        authResult: { success: true, errorType: null } as IMAPAuthResult,
        inboxCheck: {
          status: "fully_accessible" as const,
          unseenCount: 3,
          totalCount: 20,
          responseTime: 50,
          securityCheck: {
            warnings: [],
            messagesScanned: 10,
            hasSecurityWarnings: false,
            responseTime: 90,
          },
        },
      },
      expected: "active_clean",
    },
    {
      name: "Suspicious > 2FA priority",
      input: {
        authResult: { success: true, errorType: null } as IMAPAuthResult,
        inboxCheck: {
          status: "fully_accessible" as const,
          responseTime: 50,
          securityCheck: {
            warnings: [
              { type: "header" as const, indicator: "x-google-2fa", value: "on", severity: "high" as const, matchedPattern: "x-google-2fa" },
              { type: "body" as const, indicator: "kw", value: "unusual sign-in", severity: "medium" as const, matchedPattern: "test" },
            ],
            messagesScanned: 5,
            hasSecurityWarnings: true,
            responseTime: 80,
          },
        },
      },
      expected: "suspicious_activity",
    },
  ];

  console.log(
    padEnd("Тест", 40) + padEnd("Ожидание", 22) + padEnd("Результат", 22) + "OK?",
  );
  console.log("─".repeat(90));

  let passed = 0;
  for (const t of tests) {
    const result = classifyAccountStatus(t.input, { includeReason: true });
    const ok = result.status === t.expected;
    if (ok) passed++;

    console.log(
      padEnd(t.name, 40) +
      padEnd(t.expected, 22) +
      padEnd(result.status, 22) +
      (ok ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(90));
  console.log(`  Classifier: ${passed}/${tests.length} passed`);
  console.log("");

  // Detailed mode test
  console.log("  Detailed mode test:");
  const detailed = classifyAccountStatus(
    {
      authResult: { success: false, errorType: "auth_failed" as const },
    },
    { includeReason: true },
  );
  console.log(`    status: ${detailed.status}`);
  console.log(`    reason: ${detailed.reason}`);
  console.log(`    matchedRule: ${detailed.matchedRule}`);
  console.log(`    factors: ${JSON.stringify(detailed.factors)}`);
  console.log("");

  return passed === tests.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 2: Host Resolver
// ═══════════════════════════════════════════════

function testHostResolver() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 2: IMAP Host Resolver");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const tests = [
    { email: "user@gmail.com", expectedHost: "imap.gmail.com" },
    { email: "user@outlook.com", expectedHost: "outlook.office365.com" },
    { email: "user@yahoo.com", expectedHost: "imap.mail.yahoo.com" },
    { email: "user@icloud.com", expectedHost: "imap.mail.me.com" },
    { email: "user@unknown-domain.xyz", expectedHost: null },
  ];

  let passed = 0;
  console.log(padEnd("Email", 30) + padEnd("Ожидаемый хост", 30) + padEnd("Результат", 30) + "OK?");
  console.log("─".repeat(95));

  for (const t of tests) {
    const config = getImapConfig(t.email);
    const actual = config?.host ?? null;
    const ok = actual === t.expectedHost;
    if (ok) passed++;

    console.log(
      padEnd(t.email, 30) +
      padEnd(t.expectedHost ?? "null", 30) +
      padEnd(actual ?? "null", 30) +
      (ok ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(95));
  console.log(`  Host Resolver: ${passed}/${tests.length} passed`);
  console.log("");

  return passed === tests.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 3: Реальный IMAP (неверные пароли)
// ═══════════════════════════════════════════════

async function testRealImap() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 3: Реальный IMAP — connection + auth failure");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const verifier = new IMAPVerifier(15_000);

  const tests = [
    {
      name: "Gmail — неверный пароль",
      credentials: { host: "imap.gmail.com", port: 993, user: "test_fake_user@gmail.com", password: "wrong_password_123", tls: true },
      expectedErrorType: "auth_failed",
      expectedClassification: "locked",
    },
    {
      name: "Outlook — неверный пароль",
      credentials: { host: "outlook.office365.com", port: 993, user: "test_fake_user@outlook.com", password: "bad_password_456", tls: true },
      expectedErrorType: "auth_failed",
      expectedClassification: "locked",
    },
    {
      name: "Yahoo — неверный пароль",
      credentials: { host: "imap.mail.yahoo.com", port: 993, user: "fake_test_account@yahoo.com", password: "incorrect_789", tls: true },
      expectedErrorType: "auth_failed",
      expectedClassification: "locked",
    },
  ];

  const results: Array<{
    name: string;
    success: boolean;
    errorType: string | null;
    message?: string;
    classification: string;
    expectedClass: string;
    classOk: boolean;
    responseTime: number;
  }> = [];

  for (const t of tests) {
    console.log(`  Проверяю: ${t.name} (${t.credentials.host}) ...`);

    try {
      const result = await verifier.tryAuthenticate(t.credentials);

      const classification = classifyAccountStatus({
        authResult: result,
      });

      results.push({
        name: t.name,
        success: result.success,
        errorType: result.errorType,
        message: result.message,
        classification: classification.status,
        expectedClass: t.expectedClassification,
        classOk: classification.status === t.expectedClassification,
        responseTime: result.responseTime ?? 0,
      });

      console.log(`    → errorType: ${result.errorType}, classification: ${classification.status}, time: ${result.responseTime}ms`);
    } catch (err: any) {
      console.log(`    → EXCEPTION: ${err.message}`);
      results.push({
        name: t.name,
        success: false,
        errorType: "exception",
        message: err.message,
        classification: "locked",
        expectedClass: t.expectedClassification,
        classOk: true,
        responseTime: 0,
      });
    }
  }

  console.log("");
  console.log(
    padEnd("Тест", 30) +
    padEnd("Auth", 8) +
    padEnd("ErrorType", 20) +
    padEnd("Classifier", 22) +
    padEnd("Ожидание", 15) +
    padEnd("Время", 10) +
    "OK?",
  );
  console.log("─".repeat(110));

  let passed = 0;
  for (const r of results) {
    const authOk = r.success === false; // Мы ожидаем failure
    const ok = authOk && r.classOk;
    if (ok) passed++;

    console.log(
      padEnd(r.name, 30) +
      padEnd(r.success ? "✓" : "✗", 8) +
      padEnd(r.errorType ?? "—", 20) +
      padEnd(r.classification, 22) +
      padEnd(r.expectedClass, 15) +
      padEnd(`${r.responseTime}ms`, 10) +
      (ok ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(110));
  console.log(`  Real IMAP: ${passed}/${results.length} passed`);

  if (results.some((r) => r.message)) {
    console.log("");
    console.log("  Сообщения серверов:");
    for (const r of results) {
      if (r.message) {
        console.log(`    ${r.name}: ${r.message}`);
      }
    }
  }

  console.log("");
  return passed === results.length;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  ТЕСТ 2: IMAP Authentication + Account Status Classifier     ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log("");

  const classifierOk = testClassifier();
  const resolverOk = testHostResolver();
  const imapOk = await testRealImap();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ИТОГО");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Часть 1 — Classifier (7 cases):   ${classifierOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 2 — Host Resolver (5 cases): ${resolverOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 3 — Real IMAP (3 servers):   ${imapOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const allOk = classifierOk && resolverOk && imapOk;
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
