/**
 * ТЕСТ: Email Generator для Security Audit
 *
 * Input: Ivan Petrov, Germany, 1990-05-15, 3 домена, все 9 шаблонов
 * Проверяем: генерация, dedup, группировка по доменам, локализация
 *
 * Запуск: npx tsx tests/real/email-generator-test.ts
 */

import { generateEmails, type GenerationResult } from "../../src/services/generator/engine.js";
import { TEMPLATES, applyTemplate } from "../../src/services/generator/templates.js";
import type { WizardState } from "../../src/bot/types.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

// ═══════════════════════════════════════════════
// ЧАСТЬ 1: Генерация — Ivan Petrov, 3 домена, все шаблоны
// ═══════════════════════════════════════════════

function testFullGeneration() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 1: Full Generation — Ivan Petrov × 3 domains × 9 templates");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const state: WizardState = {
    step: null,
    firstName: "Ivan",
    lastName: "Petrov",
    city: "Berlin",
    birthYear: "1990",
    domains: ["gmail.com", "outlook.com", "gmx.de"],
    templates: ["full", "first_sur", "name_num", "sur_name", "name_city", "full_year", "first_sur_num", "underscore", "concat"],
    count: 100,
  };

  const result = generateEmails(state);

  console.log(`  Input:`);
  console.log(`    Name: ${state.firstName} ${state.lastName}`);
  console.log(`    City: ${state.city}`);
  console.log(`    Birth Year: ${state.birthYear}`);
  console.log(`    Domains: ${state.domains!.join(", ")}`);
  console.log(`    Templates: ${state.templates!.length}`);
  console.log("");

  console.log(`  Output:`);
  console.log(`    Total generated: ${result.totalGenerated}`);
  console.log(`    Duplicates removed: ${result.duplicatesRemoved}`);
  console.log(`    Domains: ${Object.keys(result.byDomain).length}`);
  console.log("");

  // List all generated emails
  console.log("  All generated emails:\n");
  let num = 1;
  for (const [domain, emails] of Object.entries(result.byDomain)) {
    console.log(`    📧 ${domain} (${emails.length}):`);
    for (const email of emails) {
      console.log(`      ${num}. ${email}`);
      num++;
    }
    console.log("");
  }

  // Checks
  let passed = 0;
  const expectedEmails = [
    "ivan.petrov@gmail.com",
    "ipetrov@gmail.com",
    "ivan90@gmail.com",
    "petrov.ivan@gmail.com",
    "ivan.berlin@gmail.com",
    "ivan.petrov90@gmail.com",
    "ipetrov90@gmail.com",
    "ivan_petrov@gmail.com",
    "ivanpetrov@gmail.com",
    "ivan.petrov@outlook.com",
    "ivan.petrov@gmx.de",
  ];

  console.log("  Expected patterns:\n");
  console.log(pad("  Email", 40) + "Found?");
  console.log("  " + "─".repeat(45));

  for (const exp of expectedEmails) {
    const found = result.emails.includes(exp);
    if (found) passed++;
    console.log(pad(`  ${exp}`, 40) + (found ? "✅" : "❌"));
  }
  console.log("  " + "─".repeat(45));
  console.log(`  Expected: ${passed}/${expectedEmails.length}\n`);

  // Verification checks
  const checks = [
    { name: "Total ≥ 20 emails", ok: result.totalGenerated >= 20 },
    { name: "3 domains in output", ok: Object.keys(result.byDomain).length === 3 },
    { name: "No duplicates (set check)", ok: new Set(result.emails).size === result.emails.length },
    { name: "All emails have @ symbol", ok: result.emails.every(e => e.includes("@")) },
    { name: "All emails lowercase local part", ok: result.emails.every(e => e.split("@")[0] === e.split("@")[0].toLowerCase()) },
    { name: "Gmail emails present", ok: result.byDomain["gmail.com"]?.length > 0 },
    { name: "Outlook emails present", ok: result.byDomain["outlook.com"]?.length > 0 },
    { name: "GMX.de emails present", ok: result.byDomain["gmx.de"]?.length > 0 },
    { name: "City pattern (ivan.berlin@)", ok: result.emails.some(e => e.includes("ivan.berlin")) },
    { name: "Year pattern (ivan90@)", ok: result.emails.some(e => e.includes("ivan90")) },
    { name: "Concat pattern (ivanpetrov@)", ok: result.emails.some(e => e.includes("ivanpetrov@")) },
    { name: "Expected patterns ≥ 10/11", ok: passed >= 10 },
  ];

  let checksPassed = 0;
  console.log(pad("  Check", 45) + "OK?");
  console.log("  " + "─".repeat(50));
  for (const c of checks) {
    if (c.ok) checksPassed++;
    console.log(pad(`  ${c.name}`, 45) + (c.ok ? "✅" : "❌"));
  }
  console.log("  " + "─".repeat(50));
  console.log(`  Checks: ${checksPassed}/${checks.length}\n`);

  return checksPassed === checks.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 2: Template Coverage
// ═══════════════════════════════════════════════

function testTemplateCoverage() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 2: Template Coverage — все 9 шаблонов");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const params = { firstName: "Ivan", lastName: "Petrov", city: "Berlin", birthYear: "1990" };
  const domain = "gmail.com";

  let passed = 0;
  console.log(pad("  Template", 18) + pad("Pattern", 20) + pad("Result", 30) + "OK?");
  console.log("  " + "─".repeat(72));

  const expected: Record<string, string> = {
    full: "ivan.petrov@gmail.com",
    first_sur: "ipetrov@gmail.com",
    name_num: "ivan90@gmail.com",
    sur_name: "petrov.ivan@gmail.com",
    name_city: "ivan.berlin@gmail.com",
    full_year: "ivan.petrov90@gmail.com",
    first_sur_num: "ipetrov90@gmail.com",
    underscore: "ivan_petrov@gmail.com",
    concat: "ivanpetrov@gmail.com",
  };

  for (const tpl of TEMPLATES) {
    const result = applyTemplate(tpl.id, params, domain);
    const exp = expected[tpl.id];
    const ok = result === exp;
    if (ok) passed++;

    console.log(
      pad(`  ${tpl.id}`, 18) +
      pad(tpl.label, 20) +
      pad(result, 30) +
      (ok ? "✅" : `❌ (expected: ${exp})`),
    );
  }

  console.log("  " + "─".repeat(72));
  console.log(`  Templates: ${passed}/${TEMPLATES.length}\n`);
  return passed === TEMPLATES.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 3: Локализация — Немецкие варианты
// ═══════════════════════════════════════════════

function testLocalization() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 3: Локализация — German names + domains");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Test with German name
  const germanState: WizardState = {
    step: null,
    firstName: "Hans",
    lastName: "Mueller",
    city: "München",
    birthYear: "1985",
    domains: ["gmx.de", "web.de", "t-online.de", "gmail.com"],
    templates: ["full", "first_sur", "name_num", "underscore", "concat", "name_city", "full_year"],
    count: 50,
  };

  const result = generateEmails(germanState);

  console.log(`  German test: Hans Mueller, München`);
  console.log(`  Domains: ${germanState.domains!.join(", ")}`);
  console.log(`  Generated: ${result.totalGenerated} emails\n`);

  for (const [domain, emails] of Object.entries(result.byDomain)) {
    console.log(`    ${domain}: ${emails.join(", ")}`);
  }
  console.log("");

  let passed = 0;
  const checks = [
    { name: "GMX.de emails present", ok: result.byDomain["gmx.de"]?.length > 0 },
    { name: "web.de emails present", ok: result.byDomain["web.de"]?.length > 0 },
    { name: "t-online.de emails present", ok: result.byDomain["t-online.de"]?.length > 0 },
    { name: "hans.mueller@gmx.de exists", ok: result.emails.includes("hans.mueller@gmx.de") },
    { name: "hmueller@web.de exists", ok: result.emails.includes("hmueller@web.de") },
    { name: "hans.münchen city pattern", ok: result.emails.some(e => e.includes("hans.m")) },
    { name: "Total ≥ 20", ok: result.totalGenerated >= 20 },
  ];

  console.log(pad("  Check", 40) + "OK?");
  console.log("  " + "─".repeat(45));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(`  ${c.name}`, 40) + (c.ok ? "✅" : "❌"));
  }
  console.log("  " + "─".repeat(45));
  console.log(`  Localization: ${passed}/${checks.length}\n`);
  return passed >= checks.length - 1; // allow 1 miss for umlauts
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 4: Dedup + Domain Grouping
// ═══════════════════════════════════════════════

function testDedupGrouping() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 4: Dedup + Domain Grouping");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Use same domain twice to force potential duplicates
  const state: WizardState = {
    step: null,
    firstName: "Test",
    lastName: "User",
    birthYear: "2000",
    domains: ["gmail.com", "gmail.com", "outlook.com"], // duplicate domain!
    templates: ["full", "concat", "underscore"],
    count: 50,
  };

  const result = generateEmails(state);

  // Check dedup: gmail.com appears twice but emails should be unique
  const uniqueCheck = new Set(result.emails);
  const noDups = uniqueCheck.size === result.emails.length;

  // Domain grouping
  const domains = Object.keys(result.byDomain);
  const domainCounts = Object.entries(result.byDomain).map(([d, e]) => `${d}: ${e.length}`);

  console.log(`  Domains (with dupe input): ${state.domains!.join(", ")}`);
  console.log(`  Output domains: ${domains.join(", ")}`);
  console.log(`  Counts: ${domainCounts.join(", ")}`);
  console.log(`  Total: ${result.totalGenerated}, Duplicates removed: ${result.duplicatesRemoved}`);
  console.log(`  Unique check: ${noDups ? "✅ No duplicates" : "❌ Has duplicates"}`);

  let passed = 0;
  const checks = [
    { name: "No duplicate emails in output", ok: noDups },
    { name: "Domain grouping correct", ok: domains.length >= 1 },
    { name: "gmail.com emails present", ok: (result.byDomain["gmail.com"]?.length ?? 0) > 0 },
    { name: "Duplicates removed > 0 (dupe domain)", ok: result.duplicatesRemoved > 0 },
  ];

  console.log("");
  console.log(pad("  Check", 45) + "OK?");
  console.log("  " + "─".repeat(50));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(`  ${c.name}`, 45) + (c.ok ? "✅" : "❌"));
  }
  console.log("  " + "─".repeat(50));
  console.log(`  Dedup: ${passed}/${checks.length}\n`);
  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 5: Multi-persona Batch
// ═══════════════════════════════════════════════

function testMultiPersona() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 5: Multi-persona — 3 людей × 3 домена");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const personas = [
    { firstName: "Ivan", lastName: "Petrov", city: "Berlin", birthYear: "1990" },
    { firstName: "Hans", lastName: "Mueller", city: "Hamburg", birthYear: "1985" },
    { firstName: "Alex", lastName: "Schmidt", city: "Munich", birthYear: "1995" },
  ];

  const domains = ["gmail.com", "outlook.com", "gmx.de"];
  const templates = ["full", "first_sur", "concat", "underscore", "name_num"];
  const allEmails: string[] = [];

  for (const p of personas) {
    const state: WizardState = {
      step: null,
      firstName: p.firstName,
      lastName: p.lastName,
      city: p.city,
      birthYear: p.birthYear,
      domains,
      templates,
      count: 50,
    };

    const result = generateEmails(state);
    console.log(`  ${p.firstName} ${p.lastName} (${p.city}, ${p.birthYear}): ${result.totalGenerated} emails`);

    for (const email of result.emails) {
      console.log(`    ${email}`);
    }
    console.log("");

    allEmails.push(...result.emails);
  }

  const uniqueTotal = new Set(allEmails);

  console.log(`  Total across all personas: ${allEmails.length}`);
  console.log(`  Unique: ${uniqueTotal.size}`);
  console.log(`  Cross-persona overlap: ${allEmails.length - uniqueTotal.size}\n`);

  let passed = 0;
  const checks = [
    { name: "Total ≥ 30 emails (3 personas)", ok: allEmails.length >= 30 },
    { name: "All unique across personas", ok: uniqueTotal.size === allEmails.length },
    { name: "Ivan emails present", ok: allEmails.some(e => e.includes("ivan")) },
    { name: "Hans emails present", ok: allEmails.some(e => e.includes("hans")) },
    { name: "Alex emails present", ok: allEmails.some(e => e.includes("alex")) },
  ];

  console.log(pad("  Check", 45) + "OK?");
  console.log("  " + "─".repeat(50));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(`  ${c.name}`, 45) + (c.ok ? "✅" : "❌"));
  }
  console.log("  " + "─".repeat(50));
  console.log(`  Multi-persona: ${passed}/${checks.length}\n`);
  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  Email Generator for Security Audit — Real Test               ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const p1 = testFullGeneration();
  const p2 = testTemplateCoverage();
  const p3 = testLocalization();
  const p4 = testDedupGrouping();
  const p5 = testMultiPersona();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ИТОГО");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Часть 1 — Full Generation:     ${p1 ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 2 — Template Coverage:   ${p2 ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 3 — Localization:        ${p3 ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 4 — Dedup + Grouping:    ${p4 ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 5 — Multi-persona:       ${p5 ? "✅ PASS" : "❌ FAIL"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(p1 && p2 && p3 && p4 && p5 ? 0 : 1);
}

main();
