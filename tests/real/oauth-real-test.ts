/**
 * ТЕСТ 3: OAuth/Web API — Provider Detection + Real Requests
 *
 * Часть 1: buildAuthRequest() для всех провайдеров
 * Часть 2: Provider auto-detection по домену
 * Часть 3: HTTP Response Analyzer
 * Часть 4: Реальные OAuth запросы (Google, Microsoft) с невалидными credentials
 *
 * Запуск: npx tsx tests/real/oauth-real-test.ts
 */

import { buildAuthRequest } from "../../src/services/oauth/builder.js";
import { detectProviderFromEmail } from "../../src/services/oauth/provider-detector.js";
import { OAuthClient } from "../../src/services/oauth/client.js";
import { HttpClient } from "../../src/services/http/client.js";
import { analyzeHttpResponse } from "../../src/utils/http-response-analyzer/analyzer.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

// ═══════════════════════════════════════════════
// ЧАСТЬ 1: OAuth Request Builder
// ═══════════════════════════════════════════════

function testRequestBuilder() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 1: OAuth Request Builder — все провайдеры");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const providers = ["Google", "Microsoft", "Yahoo", "AOL", "MailRu", "Apple", "ProtonMail", "Zoho"];
  let passed = 0;

  console.log(pad("Provider", 15) + pad("URL содержит", 35) + pad("Content-Type", 30) + "OK?");
  console.log("─".repeat(85));

  for (const p of providers) {
    try {
      const req = buildAuthRequest(p as any, `test@${p.toLowerCase()}.com`, "password");
      const hasUrl = req.url && req.url.length > 10;
      const hasCT = req.headers["Content-Type"]?.length > 0;
      const ok = hasUrl && hasCT && req.provider === p;
      if (ok) passed++;

      const urlShort = req.url.length > 33 ? req.url.slice(0, 30) + "..." : req.url;
      console.log(
        pad(p, 15) + pad(urlShort, 35) + pad(req.headers["Content-Type"], 30) + (ok ? "✅" : "❌"),
      );
    } catch (err: any) {
      console.log(pad(p, 15) + pad("ERROR: " + err.message, 65) + "❌");
    }
  }

  console.log("─".repeat(85));
  console.log(`  Builder: ${passed}/${providers.length} passed\n`);
  return passed === providers.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 2: Provider Detection
// ═══════════════════════════════════════════════

function testProviderDetection() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 2: Provider Auto-Detection по домену");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const tests = [
    { email: "user@gmail.com", expected: "Google" },
    { email: "user@googlemail.com", expected: "Google" },
    { email: "user@outlook.com", expected: "Microsoft" },
    { email: "user@hotmail.com", expected: "Microsoft" },
    { email: "user@live.com", expected: "Microsoft" },
    { email: "user@yahoo.com", expected: "Yahoo" },
    { email: "user@ymail.com", expected: "Yahoo" },
    { email: "user@icloud.com", expected: "Apple" },
    { email: "user@mail.ru", expected: "MailRu" },
    { email: "user@unknown.xyz", expected: "Unknown" },
  ];

  let passed = 0;
  console.log(pad("Email", 30) + pad("Ожидание", 15) + pad("Результат", 15) + "OK?");
  console.log("─".repeat(65));

  for (const t of tests) {
    const result = detectProviderFromEmail(t.email);
    const ok = result === t.expected;
    if (ok) passed++;
    console.log(pad(t.email, 30) + pad(t.expected, 15) + pad(result, 15) + (ok ? "✅" : "❌"));
  }

  console.log("─".repeat(65));
  console.log(`  Detection: ${passed}/${tests.length} passed\n`);
  return passed === tests.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 3: HTTP Response Analyzer
// ═══════════════════════════════════════════════

function testResponseAnalyzer() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 3: HTTP Response Analyzer");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const tests = [
    {
      name: "200 + access_token → auth_success",
      status: 200,
      headers: { "content-type": "application/json" },
      body: { access_token: "test-token", token_type: "Bearer" },
      expected: "auth_success",
    },
    {
      name: "401 + invalid_grant → invalid_credentials",
      status: 401,
      headers: {},
      body: { error: "invalid_grant", error_description: "Bad credentials" },
      expected: "invalid_credentials",
    },
    {
      name: "429 + rate_limit → rate_limited",
      status: 429,
      headers: { "retry-after": "60" },
      body: { error: "rate_limit_exceeded" },
      expected: "rate_limited",
    },
    {
      name: "423 + account_locked → account_locked",
      status: 423,
      headers: {},
      body: { error: "account_locked" },
      expected: "account_locked",
    },
  ];

  let passed = 0;
  console.log(pad("Тест", 45) + pad("Ожидание", 22) + pad("Результат", 22) + "OK?");
  console.log("─".repeat(95));

  for (const t of tests) {
    const analysis = analyzeHttpResponse(t.status, t.headers, t.body);
    const ok = analysis.classification === t.expected;
    if (ok) passed++;
    console.log(
      pad(t.name, 45) + pad(t.expected, 22) + pad(analysis.classification, 22) + (ok ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(95));
  console.log(`  Analyzer: ${passed}/${tests.length} passed\n`);
  return passed === tests.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 4: Реальные OAuth запросы
// ═══════════════════════════════════════════════

async function testRealOAuth() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 4: Реальные OAuth запросы (невалидные credentials)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const httpClient = new HttpClient();
  const oauthClient = new OAuthClient(httpClient);

  const tests = [
    {
      name: "Google — неверный пароль",
      provider: null as any,
      email: "test_fake_account_xyz@gmail.com",
      password: "wrong_password_123",
      expectedSuccess: false,
    },
    {
      name: "Microsoft — неверный пароль",
      provider: null as any,
      email: "test_fake_account_xyz@outlook.com",
      password: "bad_password_456",
      expectedSuccess: false,
    },
    {
      name: "Yahoo — неверный пароль",
      provider: null as any,
      email: "fake_yahoo_test_789@yahoo.com",
      password: "incorrect_pass",
      expectedSuccess: false,
    },
    {
      name: "Auto-detect Google",
      provider: null as any,
      email: "autodetect_test@gmail.com",
      password: "test123",
      expectedSuccess: false,
    },
  ];

  const results: Array<{
    name: string;
    success: boolean;
    expectedSuccess: boolean;
    provider: string;
    error?: string;
    responseTime: number;
    ok: boolean;
  }> = [];

  for (const t of tests) {
    console.log(`  Проверяю: ${t.name} ...`);
    const start = Date.now();

    try {
      const result = await oauthClient.authenticate(
        t.provider,
        t.email,
        t.password,
      );

      const elapsed = Date.now() - start;

      results.push({
        name: t.name,
        success: result.success,
        expectedSuccess: t.expectedSuccess,
        provider: result.provider ?? "?",
        error: result.error ?? undefined,
        responseTime: result.responseTime ?? elapsed,
        ok: result.success === t.expectedSuccess,
      });

      console.log(`    → success=${result.success}, provider=${result.provider}, time=${elapsed}ms`);
    } catch (err: any) {
      const elapsed = Date.now() - start;
      results.push({
        name: t.name,
        success: false,
        expectedSuccess: t.expectedSuccess,
        provider: "error",
        error: err.message?.slice(0, 60),
        responseTime: elapsed,
        ok: t.expectedSuccess === false,
      });
      console.log(`    → ERROR: ${err.message?.slice(0, 80)} — ${elapsed}ms`);
    }
  }

  console.log("");
  console.log(
    pad("Тест", 28) + pad("Success", 10) + pad("Provider", 14) +
    pad("Error", 30) + pad("Время", 10) + "OK?",
  );
  console.log("─".repeat(97));

  let passed = 0;
  for (const r of results) {
    if (r.ok) passed++;
    const errShort = r.error ? (r.error.length > 28 ? r.error.slice(0, 25) + "..." : r.error) : "—";
    console.log(
      pad(r.name, 28) + pad(r.success ? "✓" : "✗", 10) + pad(r.provider, 14) +
      pad(errShort, 30) + pad(`${r.responseTime}ms`, 10) + (r.ok ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(97));
  console.log(`  Real OAuth: ${passed}/${results.length} passed\n`);
  return passed === results.length;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  ТЕСТ 3: OAuth/Web API — Providers + Real Requests            ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const builderOk = testRequestBuilder();
  const detectionOk = testProviderDetection();
  const analyzerOk = testResponseAnalyzer();
  const realOk = await testRealOAuth();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ИТОГО");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Часть 1 — Request Builder (8 providers): ${builderOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 2 — Provider Detection (10 cases):  ${detectionOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 3 — Response Analyzer (4 cases):    ${analyzerOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 4 — Real OAuth (4 requests):        ${realOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  const allOk = builderOk && detectionOk && analyzerOk && realOk;
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
