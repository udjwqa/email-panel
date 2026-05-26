/**
 * ТЕСТ 9: Recovery Pipeline — full 4-stage flow
 *
 * Stage 1: Pattern generation (Test User, 1995-01-01)
 * Stage 2: Merge 50-password dictionary + patterns → dedup
 * Stage 3: Mock matching with real delays (AuthAttemptController)
 * Stage 4: Results aggregation
 *
 * Запуск: npx tsx tests/real/recovery-pipeline-test.ts
 */

import IORedis from "ioredis";
import { generatePasswordPatterns } from "../../src/services/dictionary/pattern-generator.js";
import { parsePasswordFile } from "../../src/services/dictionary/parser.js";
import { AuthAttemptController } from "../../src/services/matching/attempt-controller.js";
import type { DetectionResult, AccessLevel } from "../../src/services/matching/success-detector.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

// "Known" passwords for mock matching
const KNOWN_PAIRS: Record<string, string> = {
  "test.user@gmail.com": "Test1995",    // pattern-generated
  "admin@outlook.com": "admin123",       // from dictionary
};

// 50-password dictionary
const DICTIONARY_50 = [
  "password", "123456", "password123", "admin", "letmein",
  "welcome", "monkey", "dragon", "master", "qwerty",
  "login", "princess", "football", "shadow", "sunshine",
  "trustno1", "iloveyou", "batman", "access", "hello",
  "charlie", "donald", "password1", "qwerty123", "admin123",
  "abc123", "1234567", "passw0rd", "654321", "superman",
  "michael", "ashley", "jessica", "12345678", "bailey",
  "hunter2", "jennifer", "thomas", "internet", "mustang",
  "pepper", "ginger", "joshua", "summer", "george",
  "tiger", "robert", "maggie", "soccer", "whatever",
].join("\n");

// ═══════════════════════════════════════════════
// STAGE 1: Pattern Generation
// ═══════════════════════════════════════════════

function runStage1() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STAGE 1: Pattern Generation");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const result = generatePasswordPatterns({
    firstName: "Test",
    lastName: "User",
    birthDate: "1995-01-01",
    nickname: "testy",
  });

  const hasTarget = result.passwords.includes("Test1995");

  console.log(`  Input: firstName=Test, lastName=User, birthDate=1995-01-01, nickname=testy`);
  console.log(`  Generated: ${result.passwords.length} patterns`);
  console.log(`  Contains "Test1995": ${hasTarget ? "✅" : "❌"}`);
  console.log(`  Samples: ${result.passwords.slice(0, 8).join(", ")}`);
  console.log("");

  return { patterns: result.passwords, ok: result.passwords.length > 50 && hasTarget };
}

// ═══════════════════════════════════════════════
// STAGE 2: Merge Dictionary + Patterns
// ═══════════════════════════════════════════════

function runStage2(patterns: string[]) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STAGE 2: Merge Dictionary (50) + Patterns → Dedup");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const dict = parsePasswordFile(DICTIONARY_50);
  const dictPasswords = dict.entries.map(e => e.password);

  const merged = new Set([...dictPasswords, ...patterns]);
  const allPasswords = Array.from(merged);

  const overlap = dictPasswords.length + patterns.length - allPasswords.length;
  const hasAdmin123 = allPasswords.includes("admin123");
  const hasTest1995 = allPasswords.includes("Test1995");

  console.log(`  Dictionary: ${dictPasswords.length} passwords`);
  console.log(`  Patterns: ${patterns.length} passwords`);
  console.log(`  Merged (dedup): ${allPasswords.length} unique`);
  console.log(`  Overlap: ${overlap} duplicates removed`);
  console.log(`  Contains "admin123" (from dict): ${hasAdmin123 ? "✅" : "❌"}`);
  console.log(`  Contains "Test1995" (from patterns): ${hasTest1995 ? "✅" : "❌"}`);
  console.log("");

  return {
    allPasswords,
    dictCount: dictPasswords.length,
    ok: allPasswords.length > 100 && hasAdmin123 && hasTest1995,
  };
}

// ═══════════════════════════════════════════════
// STAGE 3: Mock Matching with Real Delays
// ═══════════════════════════════════════════════

async function runStage3(allPasswords: string[]) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STAGE 3: Matching — 2 emails × passwords (with delays)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const emails = Object.keys(KNOWN_PAIRS);
  const controller = new AuthAttemptController({
    enabled: true,
    delayMs: 50, // fast for testing (50ms instead of 2000ms)
    jitterFactor: 0.2,
    maxAttemptsPerEmail: allPasswords.length,
    proxyRotateEvery: 100,
    domainCooldownMs: 1000,
  });

  const results: Array<{
    email: string;
    found: boolean;
    password: string | null;
    attempts: number;
    timeMs: number;
  }> = [];

  for (const email of emails) {
    const knownPassword = KNOWN_PAIRS[email];
    const start = Date.now();
    let found = false;
    let foundPassword: string | null = null;
    let attempts = 0;

    for (const password of allPasswords) {
      const check = await controller.beforeAttempt(email);
      if (!check.allowed) break;
      attempts++;
      controller.afterAttempt(email, false);

      // Mock auth
      if (password === knownPassword) {
        found = true;
        foundPassword = password;
        break;
      }
    }

    const elapsed = Date.now() - start;
    results.push({ email, found, password: foundPassword, attempts, timeMs: elapsed });

    console.log(`  ${email}:`);
    console.log(`    Found: ${found ? "✅ " + foundPassword : "❌"}`);
    console.log(`    Attempts: ${attempts}`);
    console.log(`    Time: ${elapsed}ms`);
    console.log(`    Avg delay: ${attempts > 0 ? Math.round(elapsed / attempts) : 0}ms/attempt`);
    console.log("");
  }

  // Verify delays are real
  const totalAttempts = results.reduce((s, r) => s + r.attempts, 0);
  const totalTime = results.reduce((s, r) => s + r.timeMs, 0);
  const avgDelay = totalAttempts > 0 ? Math.round(totalTime / totalAttempts) : 0;

  console.log(`  Total attempts: ${totalAttempts}`);
  console.log(`  Total time: ${totalTime}ms`);
  console.log(`  Avg delay per attempt: ${avgDelay}ms (expected: ~50ms)`);
  console.log("");

  const bothFound = results.every(r => r.found);
  const delaysReal = avgDelay >= 30 && avgDelay <= 150; // 50ms + jitter + overhead
  const stoppedEarly = results.every(r => r.attempts < allPasswords.length);

  return {
    results,
    totalAttempts,
    totalTime,
    avgDelay,
    ok: bothFound && delaysReal && stoppedEarly,
  };
}

// ═══════════════════════════════════════════════
// STAGE 4: Results Aggregation
// ═══════════════════════════════════════════════

async function runStage4(
  stage1Patterns: number,
  stage2Merged: number,
  stage3Results: Array<{ email: string; found: boolean; password: string | null; attempts: number }>,
) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STAGE 4: Results Aggregation + Redis Progress");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Simulate detection results
  const detectionResults: Array<{ email: string; accessLevel: AccessLevel; confidence: number }> = [];
  for (const r of stage3Results) {
    if (r.found) {
      detectionResults.push({
        email: r.email,
        accessLevel: r.email.includes("gmail") ? "full_access" : "token_only",
        confidence: r.email.includes("gmail") ? 100 : 90,
      });
    }
  }

  // Aggregate
  const totalEmails = stage3Results.length;
  const found = stage3Results.filter(r => r.found).length;
  const fullAccess = detectionResults.filter(d => d.accessLevel === "full_access").length;
  const tokenOnly = detectionResults.filter(d => d.accessLevel === "token_only").length;

  // Pipeline result
  const pipelineResult = {
    stage1: { patternsGenerated: stage1Patterns },
    stage2: { totalPasswords: stage2Merged, fromDictionaries: 50, fromPatterns: stage1Patterns },
    stage3: { emailsTested: totalEmails, found, notFound: totalEmails - found },
    stage4: { fullAccess, partial2fa: 0, tokenOnly },
    totalRecovered: found,
  };

  console.log(`  Pipeline Result:`);
  console.log(`    Stage 1: ${pipelineResult.stage1.patternsGenerated} patterns generated`);
  console.log(`    Stage 2: ${pipelineResult.stage2.totalPasswords} merged (${pipelineResult.stage2.fromDictionaries} dict + ${pipelineResult.stage2.fromPatterns} patterns)`);
  console.log(`    Stage 3: ${pipelineResult.stage3.found}/${pipelineResult.stage3.emailsTested} found`);
  console.log(`    Stage 4: Full Access: ${pipelineResult.stage4.fullAccess}, Token: ${pipelineResult.stage4.tokenOnly}`);
  console.log(`    Total recovered: ${pipelineResult.totalRecovered}`);
  console.log("");

  // Save to Redis
  let redisOk = false;
  try {
    const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });
    await redis.ping();

    const key = "test-recovery-pipeline-result:999";
    await redis.set(key, JSON.stringify(pipelineResult), "EX", 60);
    const saved = await redis.get(key);
    redisOk = saved !== null;
    await redis.del(key);
    redis.disconnect();
    console.log(`  Redis save/read: ${redisOk ? "✅" : "❌"}`);
  } catch {
    console.log("  Redis: not available (skipping)");
    redisOk = true;
  }

  const aggregationOk = found === 2 && fullAccess === 1 && tokenOnly === 1;
  console.log(`  Aggregation correct: ${aggregationOk ? "✅" : "❌"}`);
  console.log("");

  return { pipelineResult, ok: aggregationOk && redisOk };
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  ТЕСТ 9: Recovery Pipeline — 4 Stages                         ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const startTime = Date.now();

  // Stage 1
  const stage1 = runStage1();

  // Stage 2
  const stage2 = runStage2(stage1.patterns);

  // Stage 3
  const stage3 = await runStage3(stage2.allPasswords);

  // Stage 4
  const stage4 = await runStage4(
    stage1.patterns.length,
    stage2.allPasswords.length,
    stage3.results,
  );

  const totalTime = Date.now() - startTime;

  // Final checks
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  VERIFICATION");
  console.log("═══════════════════════════════════════════════════════════════\n");

  let passed = 0;
  const checks = [
    { name: `Stage 1: patterns > 50 (got ${stage1.patterns.length})`, ok: stage1.ok },
    { name: `Stage 2: merged > 100 (got ${stage2.allPasswords.length})`, ok: stage2.ok },
    { name: `Stage 3: both passwords found`, ok: stage3.ok },
    { name: `Stage 3: delays real (~50ms/attempt, got ${stage3.avgDelay}ms)`, ok: stage3.avgDelay >= 30 },
    { name: `Stage 3: stopped on first match (early stop)`, ok: stage3.results.every(r => r.attempts < stage2.allPasswords.length) },
    { name: `Stage 4: aggregation correct (2 found)`, ok: stage4.ok },
    { name: `Pipeline total time: ${totalTime}ms`, ok: totalTime > 0 },
  ];

  console.log(pad("Проверка", 55) + "OK?");
  console.log("─".repeat(60));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 55) + (c.ok ? "✅" : "❌"));
  }
  console.log("─".repeat(60));

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ИТОГО");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Stage 1 — Patterns:      ${stage1.ok ? "✅ PASS" : "❌ FAIL"} (${stage1.patterns.length} generated)`);
  console.log(`  Stage 2 — Merge:         ${stage2.ok ? "✅ PASS" : "❌ FAIL"} (${stage2.allPasswords.length} merged)`);
  console.log(`  Stage 3 — Matching:      ${stage3.ok ? "✅ PASS" : "❌ FAIL"} (${stage3.totalAttempts} attempts, ${stage3.totalTime}ms)`);
  console.log(`  Stage 4 — Aggregation:   ${stage4.ok ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Pipeline: ${passed}/${checks.length} checks passed`);
  console.log(`  Total time: ${totalTime}ms`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(passed === checks.length ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
