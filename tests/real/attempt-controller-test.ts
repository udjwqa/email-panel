/**
 * ТЕСТ 6: Attempt Controller — реальные задержки + proxy rotation + cooldown
 *
 * Часть 1: Замер реальных интервалов (1000ms ± 30% = 700-1300ms)
 * Часть 2: Proxy rotation каждые 5 попыток
 * Часть 3: Domain cooldown при rate-limit
 *
 * Запуск: npx tsx tests/real/attempt-controller-test.ts
 */

import { AuthAttemptController } from "../../src/services/matching/attempt-controller.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

// ═══════════════════════════════════════════════
// ЧАСТЬ 1: Реальные задержки с jitter
// ═══════════════════════════════════════════════

async function testDelayJitter() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 1: Delay + Jitter — 10 попыток, delayMs=1000, jitter=0.3");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const controller = new AuthAttemptController({
    enabled: true,
    delayMs: 1000,
    jitterFactor: 0.3,
    maxAttemptsPerEmail: 20,
    proxyRotateEvery: 5,
    domainCooldownMs: 5000,
  });

  const intervals: number[] = [];
  const email = "test@gmail.com";

  console.log("  Запускаю 10 попыток...\n");

  for (let i = 0; i < 10; i++) {
    const before = Date.now();
    await controller.beforeAttempt(email);
    const after = Date.now();

    const elapsed = after - before;
    intervals.push(elapsed);
    controller.afterAttempt(email, false);

    process.stdout.write(`  #${i + 1}: ${elapsed}ms\n`);
  }

  // Анализ
  const min = Math.min(...intervals);
  const max = Math.max(...intervals);
  const avg = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length);
  const totalTime = intervals.reduce((s, v) => s + v, 0);

  console.log("");
  console.log(`  Статистика:`);
  console.log(`    Min: ${min}ms`);
  console.log(`    Max: ${max}ms`);
  console.log(`    Avg: ${avg}ms`);
  console.log(`    Total: ${totalTime}ms`);
  console.log(`    Ожидаемый диапазон: 700-1300ms`);
  console.log("");

  // Проверки: все интервалы в диапазоне 600-1400ms (с небольшим запасом на scheduling)
  const inRange = intervals.filter(d => d >= 600 && d <= 1400).length;
  const allInRange = inRange === intervals.length;

  // Проверяем разнообразие (jitter создает вариацию)
  const uniqueIntervals = new Set(intervals.map(d => Math.round(d / 50) * 50)).size;
  const hasVariation = uniqueIntervals >= 3; // min 3 разных значений (с округлением до 50ms)

  let passed = 0;
  const checks = [
    { name: `All 10 in range 600-1400ms (${inRange}/10)`, ok: allInRange },
    { name: `Average close to 1000ms (got ${avg})`, ok: avg >= 800 && avg <= 1200 },
    { name: `Jitter creates variation (${uniqueIntervals} unique bands)`, ok: hasVariation },
    { name: `Total time ~10s (got ${totalTime}ms)`, ok: totalTime >= 7000 && totalTime <= 14000 },
  ];

  console.log(pad("Проверка", 50) + "OK?");
  console.log("─".repeat(55));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 50) + (c.ok ? "✅" : "❌"));
  }
  console.log("─".repeat(55));
  console.log(`  Delay+Jitter: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 2: Proxy Rotation
// ═══════════════════════════════════════════════

async function testProxyRotation() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 2: Proxy Rotation — каждые 5 попыток");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Controller с минимальным delay для скорости
  const controller = new AuthAttemptController({
    enabled: true,
    delayMs: 10,
    jitterFactor: 0,
    maxAttemptsPerEmail: 30,
    proxyRotateEvery: 5,
    domainCooldownMs: 5000,
  });

  // Мокаем proxies напрямую через internal state
  // (loadProxies() обращается к DB, мы симулируем)
  (controller as any).proxies = [
    { id: 1, host: "proxy1.test.com", port: 1080, protocol: "socks5", username: null, password: null },
    { id: 2, host: "proxy2.test.com", port: 1081, protocol: "socks5", username: null, password: null },
    { id: 3, host: "proxy3.test.com", port: 1082, protocol: "socks5", username: null, password: null },
  ];

  const proxyHistory: string[] = [];
  const email = "rotation@test.com";

  for (let i = 0; i < 15; i++) {
    const check = await controller.beforeAttempt(email);
    const proxy = check.proxy?.host ?? "none";
    proxyHistory.push(proxy);
    controller.afterAttempt(email, false);
  }

  console.log("  Proxy history (15 attempts, rotate every 5):\n");
  console.log(pad("#", 5) + pad("Proxy", 25) + "Rotation?");
  console.log("─".repeat(40));

  for (let i = 0; i < proxyHistory.length; i++) {
    const rotated = i > 0 && proxyHistory[i] !== proxyHistory[i - 1];
    console.log(pad(`${i + 1}`, 5) + pad(proxyHistory[i], 25) + (rotated ? "← ROTATED" : ""));
  }

  // Проверяем ротацию
  const firstProxy = proxyHistory[0];
  const atFive = proxyHistory[5];
  const atTen = proxyHistory[10];

  let passed = 0;
  const checks = [
    { name: "Proxy assigned (not none)", ok: firstProxy !== "none" },
    { name: "Attempts 1-5: same proxy", ok: proxyHistory.slice(0, 5).every(p => p === firstProxy) },
    { name: "Attempt 6: different proxy (rotated)", ok: atFive !== firstProxy },
    { name: "Attempts 6-10: same proxy", ok: proxyHistory.slice(5, 10).every(p => p === atFive) },
    { name: "Attempt 11: rotated again", ok: atTen !== atFive },
    { name: "Uses round-robin (3 proxies)", ok: new Set(proxyHistory).size >= 2 },
  ];

  console.log("");
  console.log(pad("Проверка", 45) + "OK?");
  console.log("─".repeat(50));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 45) + (c.ok ? "✅" : "❌"));
  }
  console.log("─".repeat(50));
  console.log(`  Proxy Rotation: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 3: Domain Cooldown
// ═══════════════════════════════════════════════

async function testDomainCooldown() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 3: Domain Cooldown — rate-limit → 2s pause");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const controller = new AuthAttemptController({
    enabled: true,
    delayMs: 10,
    jitterFactor: 0,
    maxAttemptsPerEmail: 20,
    proxyRotateEvery: 100,
    domainCooldownMs: 2000, // 2 second cooldown
  });

  const email1 = "user1@gmail.com";
  const email2 = "user2@gmail.com"; // same domain!
  const email3 = "user3@outlook.com"; // different domain

  // Normal attempt
  const t1 = Date.now();
  await controller.beforeAttempt(email1);
  controller.afterAttempt(email1, false); // no rate limit
  const normalDelay = Date.now() - t1;

  // Trigger rate limit on gmail.com domain
  await controller.beforeAttempt(email1);
  controller.afterAttempt(email1, true); // ← RATE LIMITED!

  // Check cooldown list BEFORE it expires
  const statsBeforeWait = controller.getStats();
  const gmailInCooldown = statsBeforeWait.domainsInCooldown.includes("gmail.com");

  // Different domain should NOT be delayed
  const t3 = Date.now();
  await controller.beforeAttempt(email3); // outlook.com — no cooldown
  const noCooldownDelay = Date.now() - t3;

  // Now wait for same domain (cooldown ~2s)
  const t2 = Date.now();
  await controller.beforeAttempt(email2); // gmail.com — cooldown
  const cooldownDelay = Date.now() - t2;

  console.log(`  Normal attempt (no rate-limit): ${normalDelay}ms`);
  console.log(`  After rate-limit (same domain): ${cooldownDelay}ms`);
  console.log(`  Different domain (no cooldown): ${noCooldownDelay}ms`);
  console.log(`  Expected cooldown: ~2000ms`);
  console.log(`  gmail.com in cooldown (before wait): ${gmailInCooldown}`);
  console.log("");

  let passed = 0;
  const checks = [
    { name: `Normal delay < 200ms (got ${normalDelay})`, ok: normalDelay < 200 },
    { name: `Cooldown delay >= 1500ms (got ${cooldownDelay})`, ok: cooldownDelay >= 1500 },
    { name: `Cooldown delay <= 2500ms (got ${cooldownDelay})`, ok: cooldownDelay <= 2500 },
    { name: `Other domain < 200ms (got ${noCooldownDelay})`, ok: noCooldownDelay < 200 },
    { name: "gmail.com was in cooldown list", ok: gmailInCooldown },
    { name: "outlook.com NOT in cooldown", ok: !statsBeforeWait.domainsInCooldown.includes("outlook.com") },
  ];

  console.log(pad("Проверка", 50) + "OK?");
  console.log("─".repeat(55));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 50) + (c.ok ? "✅" : "❌"));
  }
  console.log("─".repeat(55));
  console.log(`  Domain Cooldown: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  ТЕСТ 6: Auth Attempt Controller                              ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const delayOk = await testDelayJitter();
  const proxyOk = await testProxyRotation();
  const cooldownOk = await testDomainCooldown();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ИТОГО");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Часть 1 — Delay + Jitter:      ${delayOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 2 — Proxy Rotation:      ${proxyOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 3 — Domain Cooldown:     ${cooldownOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(delayOk && proxyOk && cooldownOk ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
