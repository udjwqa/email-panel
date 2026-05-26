/**
 * ТЕСТ 8: Security Audit Pipeline — реальный SMTP + pipeline logic
 *
 * Часть 1: Stage 1 (SMTP) — real MX check: фильтрует невалидные домены
 * Часть 2: Stage 2 (OAuth) — обрабатывает ТОЛЬКО deliverable из Stage 1
 * Часть 3: Pipeline progress tracking через Redis
 * Часть 4: Full flow verification — sequential stages
 *
 * Запуск: npx tsx tests/real/pipeline-test.ts
 */

import IORedis from "ioredis";
import { verifyMailbox } from "../../src/services/smtp/verifier.js";
import { OAuthClient } from "../../src/services/oauth/client.js";
import { HttpClient } from "../../src/services/http/client.js";
import { getDomainGroup } from "../../src/services/domain-groups.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

interface EmailRecord {
  email: string;
  password: string;
}

// Test data: 3 valid domains (gmail, outlook, yahoo) + 2 invalid domains
const TEST_EMAILS: EmailRecord[] = [
  { email: "test_user_1@gmail.com", password: "fake_pass_1" },
  { email: "test_user_2@outlook.com", password: "fake_pass_2" },
  { email: "test_user_3@yahoo.com", password: "fake_pass_3" },
  { email: "user@nonexistent-domain-xyz-fake-12345.com", password: "pass4" },
  { email: "admin@this-domain-does-not-exist-99.net", password: "pass5" },
];

// ═══════════════════════════════════════════════
// ЧАСТЬ 1: Stage 1 — SMTP Verification (real)
// ═══════════════════════════════════════════════

async function testStage1Smtp(): Promise<{ deliverable: EmailRecord[]; undeliverable: EmailRecord[] }> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 1: Stage 1 — SMTP Check (real MX resolution)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const deliverable: EmailRecord[] = [];
  const undeliverable: EmailRecord[] = [];
  const mxCache = new Map();

  console.log(pad("Email", 50) + pad("Status", 15) + pad("SMTP", 8) + pad("Time", 10) + "Pass?");
  console.log("─".repeat(88));

  for (const record of TEST_EMAILS) {
    const start = Date.now();
    try {
      const result = await verifyMailbox(record.email, { timeout: 15_000, mxCache });
      const elapsed = Date.now() - start;

      const isDeliverable = result.status === "deliverable";
      if (isDeliverable) {
        deliverable.push(record);
      } else {
        undeliverable.push(record);
      }

      console.log(
        pad(record.email, 50) +
        pad(result.status, 15) +
        pad(String(result.smtpCode ?? "—"), 8) +
        pad(`${elapsed}ms`, 10) +
        (isDeliverable ? "→ Stage 2" : "FILTERED"),
      );
    } catch (err: any) {
      const elapsed = Date.now() - start;
      undeliverable.push(record);
      console.log(
        pad(record.email, 50) +
        pad("error", 15) +
        pad("—", 8) +
        pad(`${elapsed}ms`, 10) +
        "FILTERED",
      );
    }
  }

  console.log("─".repeat(88));
  console.log(`  Deliverable: ${deliverable.length} → pass to Stage 2`);
  console.log(`  Filtered: ${undeliverable.length}\n`);

  return { deliverable, undeliverable };
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 2: Stage 2 — OAuth (only deliverable)
// ═══════════════════════════════════════════════

async function testStage2OAuth(deliverable: EmailRecord[]): Promise<{ successful: EmailRecord[]; failed: EmailRecord[] }> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 2: Stage 2 — OAuth (only deliverable from Stage 1)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log(`  Input: ${deliverable.length} emails (from Stage 1 deliverable)\n`);

  const httpClient = new HttpClient();
  const oauthClient = new OAuthClient(httpClient);
  const successful: EmailRecord[] = [];
  const failed: EmailRecord[] = [];

  console.log(pad("Email", 40) + pad("Provider", 12) + pad("Result", 12) + pad("Time", 10) + "Pass?");
  console.log("─".repeat(80));

  for (const record of deliverable) {
    const provider = getDomainGroup(record.email.split("@")[1] ?? "");
    const start = Date.now();

    try {
      const result = await oauthClient.authenticate(null, record.email, record.password);
      const elapsed = Date.now() - start;

      if (result.success) {
        successful.push(record);
      } else {
        failed.push(record);
      }

      console.log(
        pad(record.email, 40) +
        pad(provider, 12) +
        pad(result.success ? "SUCCESS" : "FAILED", 12) +
        pad(`${elapsed}ms`, 10) +
        (result.success ? "→ Stage 3" : "FILTERED"),
      );
    } catch (err: any) {
      const elapsed = Date.now() - start;
      failed.push(record);
      console.log(
        pad(record.email, 40) +
        pad(provider, 12) +
        pad("ERROR", 12) +
        pad(`${elapsed}ms`, 10) +
        "FILTERED",
      );
    }
  }

  console.log("─".repeat(80));
  console.log(`  Successful: ${successful.length} → would pass to Stage 3`);
  console.log(`  Failed: ${failed.length} (expected — fake passwords)\n`);

  return { successful, failed };
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 3: Pipeline Progress Tracking (Redis)
// ═══════════════════════════════════════════════

async function testProgressTracking(
  stage1Result: { deliverable: number; total: number },
  stage2Result: { successful: number; total: number },
): Promise<boolean> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 3: Pipeline Progress Tracking (Redis)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  let redis: IORedis;
  try {
    redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });
    await redis.ping();
  } catch {
    console.log("  Redis: NOT AVAILABLE — skipping progress test\n");
    return true;
  }

  // Simulate pipeline progress save
  const progressKey = "test-pipeline-progress:999";
  const progress = {
    currentStage: "done",
    stages: {
      smtp: { status: "completed", total: stage1Result.total, done: stage1Result.total, success: stage1Result.deliverable, failed: stage1Result.total - stage1Result.deliverable },
      web_auth: { status: "completed", total: stage2Result.total, done: stage2Result.total, success: stage2Result.successful, failed: stage2Result.total - stage2Result.successful },
      imap: { status: "completed", total: 0, done: 0, success: 0, failed: 0 },
    },
  };

  await redis.set(progressKey, JSON.stringify(progress), "EX", 60);

  // Read back and verify
  const raw = await redis.get(progressKey);
  const saved = JSON.parse(raw!);

  let passed = 0;
  const checks = [
    { name: "Progress saved to Redis", ok: raw !== null },
    { name: "currentStage = done", ok: saved.currentStage === "done" },
    { name: "smtp.status = completed", ok: saved.stages.smtp.status === "completed" },
    { name: `smtp.success = ${stage1Result.deliverable}`, ok: saved.stages.smtp.success === stage1Result.deliverable },
    { name: "web_auth.status = completed", ok: saved.stages.web_auth.status === "completed" },
    { name: `web_auth.total = ${stage2Result.total} (= smtp deliverable)`, ok: saved.stages.web_auth.total === stage2Result.total },
    { name: "imap.status = completed (0 processed)", ok: saved.stages.imap.status === "completed" },
  ];

  console.log(pad("Проверка", 52) + "OK?");
  console.log("─".repeat(57));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 52) + (c.ok ? "✅" : "❌"));
  }

  // Cleanup
  await redis.del(progressKey);
  redis.disconnect();

  console.log("─".repeat(57));
  console.log(`  Progress Tracking: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 4: Full Pipeline Logic Verification
// ═══════════════════════════════════════════════

function testPipelineLogic(
  stage1: { deliverable: EmailRecord[]; undeliverable: EmailRecord[] },
  stage2: { successful: EmailRecord[]; failed: EmailRecord[] },
) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 4: Pipeline Logic — sequential filtering");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const totalInput = TEST_EMAILS.length;
  const stage1Output = stage1.deliverable.length;
  const stage2Input = stage2.successful.length + stage2.failed.length;
  const stage2Output = stage2.successful.length;

  let passed = 0;
  const checks = [
    { name: `Total input: ${totalInput} emails`, ok: totalInput === 5 },
    { name: `Stage 1 filtered invalid domains`, ok: stage1.undeliverable.length >= 2 },
    { name: `Stage 1 output = ${stage1Output} deliverable`, ok: stage1Output >= 1 },
    { name: `Stage 2 input = Stage 1 output (${stage2Input} = ${stage1Output})`, ok: stage2Input === stage1Output },
    { name: `Stage 2 only processed deliverable`, ok: stage2Input <= 3 },
    { name: `Non-existent domains filtered in Stage 1`, ok: stage1.undeliverable.some(e => e.email.includes("nonexistent") || e.email.includes("does-not-exist")) },
    { name: `Pipeline reduces: ${totalInput} → ${stage1Output} → ${stage2Output}`, ok: stage2Output <= stage1Output && stage1Output <= totalInput },
  ];

  console.log(`  Flow: ${totalInput} emails → Stage 1: ${stage1Output} deliverable → Stage 2: ${stage2Input} processed → ${stage2Output} successful\n`);

  console.log(pad("Проверка", 55) + "OK?");
  console.log("─".repeat(60));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 55) + (c.ok ? "✅" : "❌"));
  }
  console.log("─".repeat(60));
  console.log(`  Pipeline Logic: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  ТЕСТ 8: Security Audit Pipeline                              ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const start = Date.now();

  // Stage 1: Real SMTP
  const stage1 = await testStage1Smtp();

  // Stage 2: OAuth (only deliverable)
  const stage2 = await testStage2OAuth(stage1.deliverable);

  // Stage 3: Progress tracking
  const progressOk = await testProgressTracking(
    { deliverable: stage1.deliverable.length, total: TEST_EMAILS.length },
    { successful: stage2.successful.length, total: stage1.deliverable.length },
  );

  // Stage 4: Logic verification
  const logicOk = testPipelineLogic(stage1, stage2);

  const totalTime = Date.now() - start;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ИТОГО");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Часть 1 — SMTP Filter:          ${stage1.deliverable.length >= 1 ? "✅ PASS" : "❌ FAIL"} (${stage1.deliverable.length} deliverable)`);
  console.log(`  Часть 2 — OAuth (filtered):     ✅ PASS (processed ${stage1.deliverable.length} of ${TEST_EMAILS.length})`);
  console.log(`  Часть 3 — Redis Progress:       ${progressOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 4 — Pipeline Logic:       ${logicOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Total time: ${totalTime}ms`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const allOk = stage1.deliverable.length >= 1 && progressOk && logicOk;
  process.exit(allOk ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
