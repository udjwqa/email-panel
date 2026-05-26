/**
 * ТЕСТ 5: Credential Matching Engine
 *
 * Mock-тест: подменяем tryAuth чтобы симулировать auth без реальных серверов.
 * Проверяем: matching logic, stop-on-first, Redis cache, controller, progress.
 *
 * Запуск: npx tsx tests/real/matching-engine-test.ts
 */

import IORedis from "ioredis";
import { AuthAttemptController } from "../../src/services/matching/attempt-controller.js";
import { parsePasswordFile } from "../../src/services/dictionary/parser.js";
import { generatePasswordPatterns } from "../../src/services/dictionary/pattern-generator.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

// Simulated "known" correct pairs
const KNOWN_PAIRS: Record<string, string> = {
  "user1@gmail.com": "Ivan1990",
  "user2@outlook.com": "admin123",
  // user3 has NO matching password in our dictionary
};

// ═══════════════════════════════════════════════
// Mock Matching Engine (same logic, mock auth)
// ═══════════════════════════════════════════════

interface MatchResult {
  email: string;
  password: string | null;
  status: "found" | "not_found";
  attempts: number;
  stoppedEarly: boolean;
}

async function simulateMatching(
  emails: string[],
  passwords: string[],
  maxAttempts: number,
  redis: IORedis,
  controller: AuthAttemptController,
): Promise<{
  results: MatchResult[];
  totalAuthCalls: number;
  cacheHits: number;
}> {
  let totalAuthCalls = 0;
  let cacheHits = 0;
  const results: MatchResult[] = [];

  for (const email of emails) {
    const cacheKey = `test-match-tried:${email}`;
    const tried = await redis.smembers(cacheKey);
    const triedSet = new Set(tried);

    const toTry = passwords.filter(p => !triedSet.has(p)).slice(0, maxAttempts);
    cacheHits += triedSet.size;

    let found = false;
    let attempts = 0;

    for (const password of toTry) {
      const check = await controller.beforeAttempt(email);
      if (!check.allowed) break;

      attempts++;
      totalAuthCalls++;

      // Mock auth: check against known pairs
      const success = KNOWN_PAIRS[email] === password;

      controller.afterAttempt(email, false);
      await redis.sadd(cacheKey, password);
      await redis.expire(cacheKey, 300);

      if (success) {
        found = true;
        results.push({
          email,
          password,
          status: "found",
          attempts,
          stoppedEarly: attempts < toTry.length,
        });
        break; // Stop on first success
      }
    }

    if (!found) {
      results.push({
        email,
        password: null,
        status: "not_found",
        attempts,
        stoppedEarly: false,
      });
    }
  }

  return { results, totalAuthCalls, cacheHits };
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 1: Basic Matching
// ═══════════════════════════════════════════════

async function testBasicMatching(redis: IORedis) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 1: Basic Matching — find 2/3 passwords");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Clean up Redis before test
  await redis.del("test-match-tried:user1@gmail.com");
  await redis.del("test-match-tried:user2@outlook.com");
  await redis.del("test-match-tried:user3@yahoo.com");

  const emails = ["user1@gmail.com", "user2@outlook.com", "user3@yahoo.com"];

  // Dictionary: includes the known passwords + decoys
  const passwords = [
    "password123", "admin", "letmein", "Ivan1990", "qwerty",
    "admin123", "dragon", "monkey", "welcome", "football",
  ];

  const controller = new AuthAttemptController({
    enabled: true,
    delayMs: 1,
    jitterFactor: 0,
    maxAttemptsPerEmail: 10,
    proxyRotateEvery: 100,
    domainCooldownMs: 100,
  });

  const { results, totalAuthCalls } = await simulateMatching(
    emails, passwords, 10, redis, controller,
  );

  let passed = 0;

  const checks = [
    {
      name: "user1 found Ivan1990",
      ok: results[0]?.status === "found" && results[0]?.password === "Ivan1990",
    },
    {
      name: "user2 found admin123",
      ok: results[1]?.status === "found" && results[1]?.password === "admin123",
    },
    {
      name: "user3 not_found",
      ok: results[2]?.status === "not_found",
    },
    {
      name: "user1 stopped early (< 10 attempts)",
      ok: results[0]?.stoppedEarly === true,
    },
    {
      name: "user2 stopped early (< 10 attempts)",
      ok: results[1]?.stoppedEarly === true,
    },
    {
      name: "user3 tried all 10 passwords",
      ok: results[2]?.attempts === 10,
    },
    {
      name: "Total auth calls < 30 (not 30 = 3×10)",
      ok: totalAuthCalls < 30,
    },
  ];

  console.log(pad("Email", 25) + pad("Status", 12) + pad("Password", 15) + pad("Attempts", 10) + "Stopped?");
  console.log("─".repeat(70));
  for (const r of results) {
    console.log(
      pad(r.email, 25) + pad(r.status, 12) + pad(r.password ?? "—", 15) +
      pad(String(r.attempts), 10) + (r.stoppedEarly ? "YES" : "NO"),
    );
  }
  console.log(`\n  Total auth calls: ${totalAuthCalls}`);

  console.log("");
  console.log(pad("Проверка", 45) + "OK?");
  console.log("─".repeat(50));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 45) + (c.ok ? "✅" : "❌"));
  }
  console.log("─".repeat(50));
  console.log(`  Basic Matching: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 2: Redis Cache — no repeat
// ═══════════════════════════════════════════════

async function testRedisCache(redis: IORedis) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 2: Redis Cache — skip tried passwords");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // DON'T clean up — reuse cache from Part 1
  const emails = ["user1@gmail.com", "user2@outlook.com", "user3@yahoo.com"];
  const passwords = [
    "password123", "admin", "letmein", "Ivan1990", "qwerty",
    "admin123", "dragon", "monkey", "welcome", "football",
  ];

  const controller = new AuthAttemptController({
    enabled: true,
    delayMs: 1,
    jitterFactor: 0,
    maxAttemptsPerEmail: 20,
    proxyRotateEvery: 100,
    domainCooldownMs: 100,
  });

  // Check cache before run
  const cachedUser1 = await redis.scard("test-match-tried:user1@gmail.com");
  const cachedUser3 = await redis.scard("test-match-tried:user3@yahoo.com");

  console.log(`  Redis cache before 2nd run:`);
  console.log(`    user1 tried passwords: ${cachedUser1}`);
  console.log(`    user3 tried passwords: ${cachedUser3}`);

  const { results, totalAuthCalls, cacheHits } = await simulateMatching(
    emails, passwords, 10, redis, controller,
  );

  let passed = 0;
  const checks = [
    {
      name: "user1 cache has entries from run 1",
      ok: cachedUser1 > 0,
    },
    {
      name: "user3 cache has 10 entries from run 1",
      ok: cachedUser3 === 10,
    },
    {
      name: "2nd run: fewer auth calls (cache working)",
      ok: totalAuthCalls < 20,
    },
    {
      name: "Cache hits > 0",
      ok: cacheHits > 0,
    },
  ];

  console.log("");
  console.log(`  2nd run results:`);
  console.log(`    Total auth calls: ${totalAuthCalls}`);
  console.log(`    Cache hits: ${cacheHits}`);

  console.log("");
  console.log(pad("Проверка", 45) + "OK?");
  console.log("─".repeat(50));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 45) + (c.ok ? "✅" : "❌"));
  }
  console.log("─".repeat(50));
  console.log(`  Redis Cache: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 3: Attempt Controller limits
// ═══════════════════════════════════════════════

async function testAttemptLimits() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 3: Attempt Controller — maxAttempts=5");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const controller = new AuthAttemptController({
    enabled: true,
    delayMs: 1,
    jitterFactor: 0,
    maxAttemptsPerEmail: 5,
    proxyRotateEvery: 100,
    domainCooldownMs: 100,
  });

  const email = "limited@test.com";
  const attempts: boolean[] = [];

  for (let i = 0; i < 8; i++) {
    const check = await controller.beforeAttempt(email);
    attempts.push(check.allowed);
    if (check.allowed) {
      controller.afterAttempt(email, false);
    }
  }

  let passed = 0;
  const checks = [
    { name: "Attempts 1-5 allowed", ok: attempts.slice(0, 5).every(a => a === true) },
    { name: "Attempt 6 blocked", ok: attempts[5] === false },
    { name: "Attempt 7 blocked", ok: attempts[6] === false },
    { name: "Attempt 8 blocked", ok: attempts[7] === false },
  ];

  console.log(`  Attempts: [${attempts.map(a => a ? "✓" : "✗").join(", ")}]`);
  console.log("");
  console.log(pad("Проверка", 40) + "OK?");
  console.log("─".repeat(45));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 40) + (c.ok ? "✅" : "❌"));
  }

  // Test reset
  controller.resetEmail(email);
  const afterReset = await controller.beforeAttempt(email);
  const resetOk = afterReset.allowed;
  if (resetOk) passed++;
  console.log(pad("After reset: allowed again", 40) + (resetOk ? "✅" : "❌"));

  // Stats
  const stats = controller.getStats();
  console.log(`\n  Controller stats:`);
  console.log(`    Total attempts: ${stats.totalAttempts}`);
  console.log(`    Emails tracked: ${stats.emailsTracked}`);

  console.log("─".repeat(45));
  console.log(`  Attempt Limits: ${passed}/${checks.length + 1} passed\n`);
  return passed === checks.length + 1;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 4: Integration — Patterns + Matching
// ═══════════════════════════════════════════════

async function testPatternsMatching(redis: IORedis) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 4: Pattern Generation → Matching Integration");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Generate patterns for Ivan Petrov
  const patterns = generatePasswordPatterns({
    firstName: "Ivan",
    lastName: "Petrov",
    birthDate: "1990-05-15",
  });

  // Dictionary
  const dict = parsePasswordFile("password123\nadmin\nletmein\nqwerty\n123456");

  // Merge
  const allPasswords = [...new Set([
    ...dict.entries.map(e => e.password),
    ...patterns.passwords,
  ])];

  // "Known" pair — Ivan1990 should be in patterns
  const knownPairs: Record<string, string> = {
    "ivan.petrov@gmail.com": "Ivan1990",
  };

  // Clean cache
  await redis.del("test-match-tried:ivan.petrov@gmail.com");

  const controller = new AuthAttemptController({
    enabled: true, delayMs: 1, jitterFactor: 0,
    maxAttemptsPerEmail: 200, proxyRotateEvery: 100, domainCooldownMs: 100,
  });

  // Simulate matching
  let authCalls = 0;
  let foundPassword: string | null = null;
  let foundAtAttempt = 0;

  for (const password of allPasswords) {
    const check = await controller.beforeAttempt("ivan.petrov@gmail.com");
    if (!check.allowed) break;
    authCalls++;
    controller.afterAttempt("ivan.petrov@gmail.com", false);

    if (knownPairs["ivan.petrov@gmail.com"] === password) {
      foundPassword = password;
      foundAtAttempt = authCalls;
      break;
    }
  }

  const passwordInPatterns = patterns.passwords.includes("Ivan1990");
  const passwordInMerged = allPasswords.includes("Ivan1990");

  let passed = 0;
  const checks = [
    { name: "Ivan1990 in generated patterns", ok: passwordInPatterns },
    { name: "Ivan1990 in merged password list", ok: passwordInMerged },
    { name: "Found correct password", ok: foundPassword === "Ivan1990" },
    { name: "Stopped before trying all", ok: foundAtAttempt < allPasswords.length },
    { name: "Total passwords: dict + patterns", ok: allPasswords.length > 100 },
  ];

  console.log(`  Patterns generated: ${patterns.passwords.length}`);
  console.log(`  Dictionary: ${dict.entries.length}`);
  console.log(`  Merged (dedup): ${allPasswords.length}`);
  console.log(`  Auth calls: ${authCalls}`);
  console.log(`  Found: ${foundPassword ?? "NOT FOUND"} at attempt #${foundAtAttempt}`);
  console.log("");

  console.log(pad("Проверка", 45) + "OK?");
  console.log("─".repeat(50));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 45) + (c.ok ? "✅" : "❌"));
  }
  console.log("─".repeat(50));
  console.log(`  Patterns+Matching: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  ТЕСТ 5: Credential Matching Engine                           ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  let redis: IORedis;
  try {
    redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });
    await redis.ping();
    console.log("  Redis: connected ✅\n");
  } catch (err) {
    console.log("  Redis: NOT AVAILABLE ❌");
    console.log("  Skipping cache tests, running controller-only tests.\n");

    const limitsOk = await testAttemptLimits();
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`  Attempt Limits: ${limitsOk ? "✅ PASS" : "❌ FAIL"}`);
    console.log("  (Parts 1,2,4 skipped — Redis required)");
    console.log("═══════════════════════════════════════════════════════════════\n");
    process.exit(limitsOk ? 0 : 1);
    return;
  }

  try {
    const basicOk = await testBasicMatching(redis);
    const cacheOk = await testRedisCache(redis);
    const limitsOk = await testAttemptLimits();
    const integrationOk = await testPatternsMatching(redis);

    // Cleanup
    await redis.del("test-match-tried:user1@gmail.com");
    await redis.del("test-match-tried:user2@outlook.com");
    await redis.del("test-match-tried:user3@yahoo.com");
    await redis.del("test-match-tried:ivan.petrov@gmail.com");

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  ИТОГО");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`  Часть 1 — Basic Matching:        ${basicOk ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`  Часть 2 — Redis Cache:           ${cacheOk ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`  Часть 3 — Attempt Limits:        ${limitsOk ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`  Часть 4 — Patterns+Matching:     ${integrationOk ? "✅ PASS" : "❌ FAIL"}`);
    console.log("═══════════════════════════════════════════════════════════════\n");

    const allOk = basicOk && cacheOk && limitsOk && integrationOk;
    process.exit(allOk ? 0 : 1);
  } finally {
    redis.disconnect();
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
