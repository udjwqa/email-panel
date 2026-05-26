/**
 * ТЕСТ 4: Dictionary + Pattern Generator
 *
 * Часть 1: parsePasswordFile — 20 паролей, dedup, анализ
 * Часть 2: generatePasswordPatterns — Ivan Petrov 1990-05-15
 * Часть 3: Проверка конкретных паттернов
 * Часть 4: Merge dict + patterns, dedup
 *
 * Запуск: npx tsx tests/real/dictionary-patterns-test.ts
 */

import { parsePasswordFile } from "../../src/services/dictionary/parser.js";
import { generatePasswordPatterns } from "../../src/services/dictionary/pattern-generator.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

// ═══════════════════════════════════════════════
// ЧАСТЬ 1: Dictionary Parser — 20 паролей
// ═══════════════════════════════════════════════

function testDictionaryParser() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 1: Dictionary Parser — 20 паролей + дубликаты");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const dictionary = [
    "password123", "admin", "letmein", "qwerty", "123456",
    "iloveyou", "monkey", "dragon", "master", "welcome",
    "Password1!", "abc123", "football", "shadow", "sunshine",
    "trustno1", "hunter2", "batman", "access", "hello",
    // дубликаты:
    "password123", "admin", "qwerty",
    // пустые строки:
    "", "  ", "",
    // слишком длинный:
    "a".repeat(150),
  ].join("\n");

  const result = parsePasswordFile(dictionary);

  const checks = [
    { name: "Уникальных паролей", value: result.entries.length, expected: 20, ok: result.entries.length === 20 },
    { name: "Всего строк (не пустых)", value: result.totalLines, expected: 24, ok: result.totalLines === 24 },
    { name: "Валидных", value: result.validLines, expected: 20, ok: result.validLines === 20 },
    { name: "Дубликатов", value: result.duplicateCount, expected: 3, ok: result.duplicateCount === 3 },
    { name: "Пустых строк", value: result.emptyLines, expected: 3, ok: result.emptyLines === 3 },
  ];

  let passed = 0;
  console.log(pad("Метрика", 30) + pad("Ожидание", 12) + pad("Результат", 12) + "OK?");
  console.log("─".repeat(58));

  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 30) + pad(String(c.expected), 12) + pad(String(c.value), 12) + (c.ok ? "✅" : "❌"));
  }

  // Анализ характеристик
  console.log("\n  Анализ паролей:");
  const withDigits = result.entries.filter(e => e.hasDigits).length;
  const withSpecial = result.entries.filter(e => e.hasSpecial).length;
  const withUpper = result.entries.filter(e => e.hasUpper).length;
  const avgLen = Math.round(result.entries.reduce((s, e) => s + e.length, 0) / result.entries.length);

  console.log(`    С цифрами:  ${withDigits}/${result.entries.length}`);
  console.log(`    Со спец:    ${withSpecial}/${result.entries.length}`);
  console.log(`    С заглавной: ${withUpper}/${result.entries.length}`);
  console.log(`    Средняя длина: ${avgLen} символов`);

  // Проверка "Password1!" — все флаги true
  const p1 = result.entries.find(e => e.password === "Password1!");
  const p1ok = p1?.hasDigits && p1?.hasSpecial && p1?.hasUpper;
  if (p1ok) passed++;
  console.log(`\n  "Password1!" (digits+special+upper): ${p1ok ? "✅" : "❌"}`);

  console.log("─".repeat(58));
  console.log(`  Parser: ${passed}/${checks.length + 1} passed\n`);
  return passed === checks.length + 1;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 2: Pattern Generator — Ivan Petrov
// ═══════════════════════════════════════════════

function testPatternGenerator() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 2: Pattern Generator — Ivan Petrov 15.05.1990");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const result = generatePasswordPatterns({
    firstName: "Ivan",
    lastName: "Petrov",
    birthDate: "1990-05-15",
    nickname: "vanko",
  });

  console.log(`  Всего сгенерировано: ${result.passwords.length} паролей\n`);

  // Проверяем конкретные ожидаемые паттерны
  const expectedPatterns = [
    // Base name combos
    { pattern: "IvanPetrov", category: "Name+Surname" },
    { pattern: "ivanpetrov", category: "name+surname (lower)" },
    { pattern: "PetrovIvan", category: "Surname+Name" },
    { pattern: "ivan.petrov", category: "name.surname" },
    { pattern: "ivan_petrov", category: "name_surname" },
    // Initials
    { pattern: "IPetrov", category: "F+Surname" },
    { pattern: "ipetrov", category: "f+surname (lower)" },
    // With year
    { pattern: "Ivan1990", category: "Name+Year" },
    { pattern: "ivan1990", category: "name+year" },
    { pattern: "Ivan90", category: "Name+YY" },
    { pattern: "Petrov1990", category: "Surname+Year" },
    { pattern: "IPetrov1990", category: "F+Surname+Year" },
    // With date parts
    { pattern: "ivan1505", category: "name+DDMM" },
    { pattern: "Ivan0515", category: "Name+MMDD" },
    { pattern: "ivan150590", category: "name+DDMMYY" },
    // Suffixes
    { pattern: "Ivan123", category: "Name+123" },
    { pattern: "Ivan1234", category: "Name+1234" },
    { pattern: "ivan!", category: "name+!" },
    { pattern: "ivan1990!", category: "name+year+!" },
    // Leet speak
    { pattern: "1v@n", category: "leet(ivan)" },
    // Nickname
    { pattern: "vanko123", category: "nickname+123" },
    { pattern: "vanko1990", category: "nickname+year" },
    { pattern: "Vanko!", category: "Nickname+!" },
    // Initials + year
    { pattern: "IP1990", category: "F+S+Year" },
  ];

  let passed = 0;
  console.log(pad("Паттерн", 25) + pad("Категория", 25) + "Найден?");
  console.log("─".repeat(57));

  for (const ep of expectedPatterns) {
    const found = result.passwords.includes(ep.pattern);
    if (found) passed++;
    console.log(pad(ep.pattern, 25) + pad(ep.category, 25) + (found ? "✅" : "❌"));
  }

  console.log("─".repeat(57));
  console.log(`  Patterns: ${passed}/${expectedPatterns.length} found\n`);

  // Dedup check
  const uniqueSet = new Set(result.passwords);
  const noDuplicates = uniqueSet.size === result.passwords.length;
  console.log(`  Dedup: ${result.passwords.length} total, ${uniqueSet.size} unique → ${noDuplicates ? "✅ NO DUPLICATES" : "❌ HAS DUPLICATES"}`);

  // Min length check (>=4)
  const allMin4 = result.passwords.every(p => p.length >= 4);
  console.log(`  Min length ≥4: ${allMin4 ? "✅" : "❌"}`);

  // Примеры первых 15
  console.log(`\n  Первые 15 паттернов:`);
  for (const p of result.passwords.slice(0, 15)) {
    console.log(`    ${p}`);
  }
  console.log(`    ... и ещё ${result.passwords.length - 15}\n`);

  return passed >= 20 && noDuplicates && allMin4;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 3: Merge Dictionary + Patterns
// ═══════════════════════════════════════════════

function testMerge() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 3: Merge Dictionary + Patterns → Dedup");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Dictionary
  const dict = parsePasswordFile(
    "password123\nadmin\nletmein\nqwerty\n123456\niloveyou\nmonkey\ndragon\nmaster\nwelcome"
  );

  // Patterns
  const patterns = generatePasswordPatterns({
    firstName: "Ivan",
    lastName: "Petrov",
    birthDate: "1990-05-15",
  });

  // Merge
  const allPasswords = new Set([
    ...dict.entries.map(e => e.password),
    ...patterns.passwords,
  ]);

  const dictCount = dict.entries.length;
  const patternCount = patterns.passwords.length;
  const mergedCount = allPasswords.size;

  // Check for overlaps
  const overlap = dictCount + patternCount - mergedCount;

  console.log(`  Dictionary:  ${dictCount} passwords`);
  console.log(`  Patterns:    ${patternCount} passwords`);
  console.log(`  Merged:      ${mergedCount} unique`);
  console.log(`  Overlap:     ${overlap} (passwords в обоих)`);

  const checks = [
    { name: "Dict > 0", ok: dictCount > 0 },
    { name: "Patterns > 50", ok: patternCount > 50 },
    { name: "Merged > both individually", ok: mergedCount > dictCount && mergedCount > patternCount },
    { name: "Merged ≤ sum", ok: mergedCount <= dictCount + patternCount },
    { name: "No duplicates in merged", ok: mergedCount === allPasswords.size },
    { name: "Dict passwords in merged", ok: Array.from(dict.entries).every(e => allPasswords.has(e.password)) },
    { name: "Pattern passwords in merged", ok: patterns.passwords.every(p => allPasswords.has(p)) },
  ];

  let passed = 0;
  console.log("");
  console.log(pad("Проверка", 40) + "OK?");
  console.log("─".repeat(45));
  for (const c of checks) {
    if (c.ok) passed++;
    console.log(pad(c.name, 40) + (c.ok ? "✅" : "❌"));
  }
  console.log("─".repeat(45));
  console.log(`  Merge: ${passed}/${checks.length} passed\n`);

  return passed === checks.length;
}

// ═══════════════════════════════════════════════
// ЧАСТЬ 4: Категории паттернов — статистика
// ═══════════════════════════════════════════════

function testPatternCategories() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ЧАСТЬ 4: Категории паттернов — breakdown");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const result = generatePasswordPatterns({
    firstName: "Ivan",
    lastName: "Petrov",
    birthDate: "1990-05-15",
    nickname: "vanko",
    phone: "+79161234567",
  });

  // Categorize
  const withYear = result.passwords.filter(p => p.includes("1990") || p.includes("90")).length;
  const withDate = result.passwords.filter(p => p.includes("1505") || p.includes("0515")).length;
  const withLeet = result.passwords.filter(p => /[@310$7]/.test(p)).length;
  const withSuffix = result.passwords.filter(p => /[!@#]$/.test(p) || p.endsWith("123") || p.endsWith("1234")).length;
  const withNickname = result.passwords.filter(p => p.toLowerCase().includes("vanko")).length;
  const withPhone = result.passwords.filter(p => p.includes("4567") || p.includes("234567")).length;

  console.log(`  Всего: ${result.passwords.length} паролей\n`);
  console.log(`  Категории:`);
  console.log(`    С годом (1990/90):      ${withYear}`);
  console.log(`    С датой (1505/0515):     ${withDate}`);
  console.log(`    Leet speak (@,3,1,0,$):  ${withLeet}`);
  console.log(`    С суффиксами (!,123):    ${withSuffix}`);
  console.log(`    С никнеймом (vanko):     ${withNickname}`);
  console.log(`    С телефоном (4567):      ${withPhone}`);

  const allPositive = withYear > 0 && withDate > 0 && withLeet > 0 &&
                      withSuffix > 0 && withNickname > 0 && withPhone > 0;

  console.log(`\n  Все категории представлены: ${allPositive ? "✅" : "❌"}\n`);
  return allPositive;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  ТЕСТ 4: Dictionary + Pattern Generator                       ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const parserOk = testDictionaryParser();
  const patternsOk = testPatternGenerator();
  const mergeOk = testMerge();
  const categoriesOk = testPatternCategories();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ИТОГО");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Часть 1 — Dictionary Parser:     ${parserOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 2 — Pattern Generator:     ${patternsOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 3 — Merge + Dedup:         ${mergeOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Часть 4 — Pattern Categories:    ${categoriesOk ? "✅ PASS" : "❌ FAIL"}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(parserOk && patternsOk && mergeOk && categoriesOk ? 0 : 1);
}

main();
