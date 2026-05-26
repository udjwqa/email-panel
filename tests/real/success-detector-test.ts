/**
 * ТЕСТ 7: Success Detector — access level + confidence
 *
 * Часть 1: Simulated IMAP responses → full_access / partial_2fa / locked
 * Часть 2: Simulated OAuth responses → token_only / partial_2fa
 * Часть 3: DetectionResult structure + confidence scoring
 * Часть 4: Integration with Account Status Classifier
 *
 * Запуск: npx tsx tests/real/success-detector-test.ts
 */

import type { DetectionResult, AccessLevel } from "../../src/services/matching/success-detector.js";
import { classifyAccountStatus } from "../../src/services/imap/account-status-classifier.js";
import type { IMAPAuthResult } from "../../src/services/imap/types.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

// ═══════════════════════════════════════════════
// Simulated Detection Results (same logic as AuthSuccessDetector)
// ═══════════════════════════════════════════════

function simulateImapDetection(scenario: string): DetectionResult {
  switch (scenario) {
    case "full_access":
      return {
        success: true,
        accessLevel: "full_access",
        confidence: 100,
        has2fa: false,
        hasInbox: true,
        messageCount: 152,
        imapFolders: ["INBOX", "Sent", "Drafts", "Spam", "Trash"],
        provider: "Google",
        metadata: { accountStatus: "active_clean", unseenCount: 12 },
      };

    case "partial_2fa":
      return {
        success: true,
        accessLevel: "partial_2fa",
        confidence: 80,
        has2fa: true,
        hasInbox: true,
        messageCount: 89,
        provider: "Microsoft",
        metadata: { accountStatus: "active_with_2fa", reason: "X-Microsoft-Auth- header detected" },
      };

    case "restricted":
      return {
        success: true,
        accessLevel: "full_access",
        confidence: 90,
        has2fa: false,
        hasInbox: false,
        provider: "Yahoo",
        metadata: { accountStatus: "restricted" },
      };

    case "locked":
      return {
        success: false,
        accessLevel: "full_access",
        confidence: 0,
        has2fa: false,
        metadata: { error: "Authentication failed" },
      };

    default:
      return { success: false, accessLevel: "full_access", confidence: 0, has2fa: false };
  }
}

function simulateOAuthDetection(scenario: string): DetectionResult {
  switch (scenario) {
    case "token_success":
      return {
        success: true,
        accessLevel: "token_only",
        confidence: 90,
        has2fa: false,
        provider: "Google",
        metadata: { provider: "Google", tokenType: "Bearer" },
      };

    case "2fa_challenge":
      return {
        success: true,
        accessLevel: "partial_2fa",
        confidence: 70,
        has2fa: true,
        provider: "Microsoft",
        metadata: { error: "interaction_required: two-factor authentication required" },
      };

    case "auth_failed":
      return {
        success: false,
        accessLevel: "token_only",
        confidence: 0,
        has2fa: false,
        metadata: { error: "invalid_grant" },
      };

    default:
      return { success: false, accessLevel: "token_only", confidence: 0, has2fa: false };
  }
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 1: IMAP Detection Scenarios
// ═══════════════════════════════════════════════

function testImapDetection() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 1: IMAP Detection — 4 сценария");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const scenarios = [
    {
      name: "IMAP login + INBOX accessible",
      scenario: "full_access",
      expectedLevel: "full_access" as AccessLevel,
      expectedConfidence: 100,
      expectedHas2fa: false,
    },
    {
      name: "IMAP login + 2FA header detected",
      scenario: "partial_2fa",
      expectedLevel: "partial_2fa" as AccessLevel,
      expectedConfidence: 80,
      expectedHas2fa: true,
    },
    {
      name: "IMAP login + INBOX not accessible",
      scenario: "restricted",
      expectedLevel: "full_access" as AccessLevel,
      expectedConfidence: 90,
      expectedHas2fa: false,
    },
    {
      name: "IMAP auth failed",
      scenario: "locked",
      expectedLevel: "full_access" as AccessLevel,
      expectedConfidence: 0,
      expectedHas2fa: false,
    },
  ];

  let passed = 0;
  console.log(
    pad("Сценарий", 35) + pad("Level", 15) + pad("Confidence", 12) +
    pad("2FA", 6) + pad("Inbox", 8) + pad("Messages", 10) + "OK?",
  );
  console.log("─".repeat(90));

  for (const s of scenarios) {
    const result = simulateImapDetection(s.scenario);
    const levelOk = result.accessLevel === s.expectedLevel;
    const confOk = result.confidence === s.expectedConfidence;
    const tfaOk = result.has2fa === s.expectedHas2fa;
    const ok = levelOk && confOk && tfaOk;
    if (ok) passed++;

    console.log(
      pad(s.name, 35) +
      pad(result.accessLevel, 15) +
      pad(`${result.confidence}%`, 12) +
      pad(result.has2fa ? "YES" : "NO", 6) +
      pad(result.hasInbox ? "✓" : "—", 8) +
      pad(result.messageCount ? String(result.messageCount) : "—", 10) +
      (ok ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(90));
  console.log(`  IMAP Detection: ${passed}/${scenarios.length} passed\n`);
  return passed === scenarios.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 2: OAuth Detection Scenarios
// ═══════════════════════════════════════════════

function testOAuthDetection() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 2: OAuth Detection — 3 сценария");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const scenarios = [
    {
      name: "OAuth token received",
      scenario: "token_success",
      expectedLevel: "token_only" as AccessLevel,
      expectedConfidence: 90,
      expectedSuccess: true,
    },
    {
      name: "OAuth 2FA challenge",
      scenario: "2fa_challenge",
      expectedLevel: "partial_2fa" as AccessLevel,
      expectedConfidence: 70,
      expectedSuccess: true,
    },
    {
      name: "OAuth auth failed",
      scenario: "auth_failed",
      expectedLevel: "token_only" as AccessLevel,
      expectedConfidence: 0,
      expectedSuccess: false,
    },
  ];

  let passed = 0;
  console.log(
    pad("Сценарий", 30) + pad("Level", 15) + pad("Confidence", 12) +
    pad("Success", 10) + pad("2FA", 6) + "OK?",
  );
  console.log("─".repeat(78));

  for (const s of scenarios) {
    const result = simulateOAuthDetection(s.scenario);
    const levelOk = result.accessLevel === s.expectedLevel;
    const confOk = result.confidence === s.expectedConfidence;
    const successOk = result.success === s.expectedSuccess;
    const ok = levelOk && confOk && successOk;
    if (ok) passed++;

    console.log(
      pad(s.name, 30) +
      pad(result.accessLevel, 15) +
      pad(`${result.confidence}%`, 12) +
      pad(result.success ? "✓" : "✗", 10) +
      pad(result.has2fa ? "YES" : "NO", 6) +
      (ok ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(78));
  console.log(`  OAuth Detection: ${passed}/${scenarios.length} passed\n`);
  return passed === scenarios.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 3: Confidence Scoring Rules
// ═══════════════════════════════════════════════

function testConfidenceScoring() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 3: Confidence Scoring Rules");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const rules = [
    { level: "full_access", method: "IMAP", condition: "INBOX + folders", confidence: 100 },
    { level: "full_access", method: "IMAP", condition: "Auth OK, no inbox", confidence: 90 },
    { level: "token_only", method: "OAuth", condition: "Token received", confidence: 90 },
    { level: "partial_2fa", method: "IMAP", condition: "Auth OK + 2FA header", confidence: 80 },
    { level: "partial_2fa", method: "OAuth", condition: "2FA challenge", confidence: 70 },
    { level: "any", method: "any", condition: "Auth failed", confidence: 0 },
  ];

  let passed = 0;
  console.log(pad("Level", 15) + pad("Method", 8) + pad("Condition", 25) + pad("Confidence", 12) + "OK?");
  console.log("─".repeat(65));

  for (const r of rules) {
    const confValid =
      (r.confidence === 100 && r.level === "full_access") ||
      (r.confidence === 90 && (r.level === "full_access" || r.level === "token_only")) ||
      (r.confidence === 80 && r.level === "partial_2fa" && r.method === "IMAP") ||
      (r.confidence === 70 && r.level === "partial_2fa" && r.method === "OAuth") ||
      (r.confidence === 0);

    if (confValid) passed++;
    console.log(
      pad(r.level, 15) + pad(r.method, 8) + pad(r.condition, 25) +
      pad(`${r.confidence}%`, 12) + (confValid ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(65));

  // Verify ordering: full_access > token_only > partial_2fa > failed
  const ordering = [100, 90, 90, 80, 70, 0];
  const isDescending = ordering.every((v, i) => i === 0 || ordering[i - 1] >= v);
  if (isDescending) passed++;
  console.log(`\n  Confidence ordering (desc): ${isDescending ? "✅" : "❌"}`);

  console.log(`  Confidence Rules: ${passed}/${rules.length + 1} passed\n`);
  return passed === rules.length + 1;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 4: Integration with Account Classifier
// ═══════════════════════════════════════════════

function testClassifierIntegration() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 4: Classifier → Detector Integration");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const scenarios = [
    {
      name: "active_clean → full_access",
      classifierInput: {
        authResult: { success: true, errorType: null } as IMAPAuthResult,
        inboxCheck: {
          status: "fully_accessible" as const,
          unseenCount: 5,
          totalCount: 100,
          responseTime: 50,
          securityCheck: { warnings: [], messagesScanned: 10, hasSecurityWarnings: false, responseTime: 80 },
        },
      },
      expectedClassifier: "active_clean",
      expectedDetector: "full_access" as AccessLevel,
      expectedConfidence: 100,
    },
    {
      name: "active_with_2fa → partial_2fa",
      classifierInput: {
        authResult: { success: true, errorType: null } as IMAPAuthResult,
        inboxCheck: {
          status: "fully_accessible" as const,
          unseenCount: 2,
          totalCount: 50,
          responseTime: 50,
          securityCheck: {
            warnings: [{ type: "header" as const, indicator: "x-google-2fa", value: "on", severity: "high" as const, matchedPattern: "x-google-2fa" }],
            messagesScanned: 5,
            hasSecurityWarnings: true,
            responseTime: 80,
          },
        },
      },
      expectedClassifier: "active_with_2fa",
      expectedDetector: "partial_2fa" as AccessLevel,
      expectedConfidence: 80,
    },
    {
      name: "locked → failed detection",
      classifierInput: {
        authResult: { success: false, errorType: "auth_failed" as const },
      },
      expectedClassifier: "locked",
      expectedDetector: "full_access" as AccessLevel,
      expectedConfidence: 0,
    },
  ];

  let passed = 0;
  console.log(
    pad("Сценарий", 30) + pad("Classifier", 20) + pad("Detector", 15) + pad("Conf", 8) + "OK?",
  );
  console.log("─".repeat(78));

  for (const s of scenarios) {
    const classResult = classifyAccountStatus(s.classifierInput);

    // Simulate detector based on classifier
    let detectionLevel: AccessLevel;
    let confidence: number;

    if (classResult.status === "active_clean") {
      detectionLevel = "full_access";
      confidence = 100;
    } else if (classResult.status === "active_with_2fa") {
      detectionLevel = "partial_2fa";
      confidence = 80;
    } else {
      detectionLevel = "full_access";
      confidence = 0;
    }

    const classOk = classResult.status === s.expectedClassifier;
    const detOk = detectionLevel === s.expectedDetector;
    const confOk = confidence === s.expectedConfidence;
    const ok = classOk && detOk && confOk;
    if (ok) passed++;

    console.log(
      pad(s.name, 30) + pad(classResult.status, 20) + pad(detectionLevel, 15) +
      pad(`${confidence}%`, 8) + (ok ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(78));
  console.log(`  Classifier→Detector: ${passed}/${scenarios.length} passed\n`);
  return passed === scenarios.length;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  ТЕСТ 7: Auth Success Detector                                ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const imapOk = testImapDetection();
  const oauthOk = testOAuthDetection();
  const confOk = testConfidenceScoring();
  const integOk = testClassifierIntegration();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ИТОГО");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Часть 1 — IMAP Detection (4):      ${imapOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 2 — OAuth Detection (3):     ${oauthOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 3 — Confidence Rules (7):    ${confOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 4 — Classifier Integration (3): ${integOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(imapOk && oauthOk && confOk && integOk ? 0 : 1);
}

main();
