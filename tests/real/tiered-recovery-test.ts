/**
 * ТЕСТ: Tiered Recovery Strategy
 *
 * 5 тестовых аккаунтов с паролями из разных tier'ов:
 *   1. "123456" → Tier 1 (top-100)
 *   2. "Alex1990" → Tier 2 (personalized mask)
 *   3. "berlin1" → Tier 3 (top-1000, localized German)
 *   4. "sup3rs3cr3t!" → Tier 4 (custom dictionary)
 *   5. "xk29!mzQ" → Not found (random)
 *
 * Запуск: npx tsx tests/real/tiered-recovery-test.ts
 */

import { TieredRecoveryEngine, type AuthFunction, type TieredResult } from "../../src/services/matching/tiered-recovery.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

// Known passwords for each test account
const KNOWN_PASSWORDS: Record<string, string> = {
  "user1@gmail.com": "123456",             // Tier 1: top-100
  "alex.ivanov@gmail.com": "Alex1990",     // Tier 2: personalized ({Name}{Year})
  "hans.mueller@gmx.de": "berlin1",        // Tier 3: top-1000 (localized German)
  "secure.user@outlook.com": "sup3rs3cr3t!", // Tier 4: custom dictionary only
  "random@yahoo.com": "xk29!mzQ",          // NOT IN ANY TIER
};

// Mock auth function
const mockAuth: AuthFunction = async (email: string, password: string): Promise<boolean> => {
  return KNOWN_PASSWORDS[email] === password;
};

// Custom Tier 4 dictionary
const TIER4_DICTIONARY = [
  "sup3rs3cr3t!", "m3gaP@ss!", "h4ck3r2024", "adm1n!str@tor",
  "s3cur1ty!", "pr1vat3!", "c0nf1d3nt1al", "r00tAccess",
  "1337h4x0r", "p@$$w0rd!", "cr4ck3d!", "unl0ck3d!",
];

async function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  Tiered Recovery Strategy — 5 test accounts                    ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const engine = new TieredRecoveryEngine({
    delayMs: 1,       // fast for testing
    jitterFactor: 0,
    maxAttemptsPerEmail: 50000,
  });

  const testCases = [
    {
      email: "user1@gmail.com",
      userData: { firstName: "John", lastName: "Doe" },
      expectedTier: 1,
      description: 'Tier 1 — "123456" (top-100 password)',
    },
    {
      email: "alex.ivanov@gmail.com",
      userData: { firstName: "Alex", lastName: "Ivanov", birthDate: "1990-05-15", city: "Berlin" },
      expectedTier: 2,
      description: 'Tier 2 — "Alex1990" (personalized mask {Name}{Year})',
    },
    {
      email: "hans.mueller@gmx.de",
      userData: { firstName: "Hans", lastName: "Mueller", city: "Berlin" },
      expectedTier: 3,
      description: 'Tier 3 — "berlin1" (top-1000, localized German)',
    },
    {
      email: "secure.user@outlook.com",
      userData: { firstName: "Secure", lastName: "User" },
      expectedTier: 4,
      description: 'Tier 4 — "sup3rs3cr3t!" (custom dictionary)',
    },
    {
      email: "random@yahoo.com",
      userData: { firstName: "Random", lastName: "Person" },
      expectedTier: null,
      description: 'Not found — "xk29!mzQ" (not in any tier)',
    },
  ];

  const results: TieredResult[] = [];

  for (const tc of testCases) {
    console.log(`  Testing: ${tc.description}`);
    console.log(`  Email: ${tc.email}\n`);

    const result = await engine.recover(
      tc.email,
      tc.userData,
      mockAuth,
      { maxTier: 4, extraDictionary: TIER4_DICTIONARY },
    );

    results.push(result);

    // Print tier breakdown
    for (const tier of result.tiers) {
      const icon = tier.found ? "✅" : "⏭";
      console.log(
        `    ${icon} Tier ${tier.tier} (${tier.name}): ${tier.attempts} attempts, ${tier.timeMs}ms` +
        (tier.found ? ` → FOUND "${tier.foundPassword}"` : ""),
      );
    }

    console.log(`    Total: ${result.totalAttempts} attempts, ${result.totalTimeMs}ms`);
    console.log(`    Result: ${result.found ? `✅ Found in Tier ${result.foundInTier}` : "❌ Not found"}`);
    console.log("");
  }

  // Summary table
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  RESULTS TABLE");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log(
    pad("Email", 30) + pad("Password", 18) + pad("Tier", 8) +
    pad("Attempts", 10) + pad("Time", 10) + "OK?",
  );
  console.log("─".repeat(82));

  let passed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const tc = testCases[i];
    const tierMatch = r.foundInTier === tc.expectedTier;
    if (tierMatch) passed++;

    console.log(
      pad(r.email.slice(0, 28), 30) +
      pad(r.password ?? "NOT FOUND", 18) +
      pad(r.foundInTier ? `Tier ${r.foundInTier}` : "—", 8) +
      pad(String(r.totalAttempts), 10) +
      pad(`${r.totalTimeMs}ms`, 10) +
      (tierMatch ? "✅" : "❌"),
    );
  }

  console.log("─".repeat(82));

  // Per-tier statistics
  console.log("\n  PER-TIER STATISTICS:");
  const tierStats: Record<number, { total: number; found: number; attempts: number }> = {};

  for (const r of results) {
    for (const t of r.tiers) {
      if (!tierStats[t.tier]) tierStats[t.tier] = { total: 0, found: 0, attempts: 0 };
      tierStats[t.tier].total++;
      tierStats[t.tier].attempts += t.attempts;
      if (t.found) tierStats[t.tier].found++;
    }
  }

  console.log(pad("  Tier", 25) + pad("Tested", 10) + pad("Found", 8) + pad("Attempts", 12) + "Rate");
  console.log("  " + "─".repeat(60));
  const tierNames = ["", "Top 100 (Fast)", "Personalized", "Top 1000", "Full Dictionary"];
  for (const [tier, stats] of Object.entries(tierStats)) {
    const rate = stats.total > 0 ? Math.round((stats.found / stats.total) * 100) : 0;
    console.log(
      pad(`  Tier ${tier}: ${tierNames[Number(tier)]}`, 25) +
      pad(String(stats.total), 10) +
      pad(String(stats.found), 8) +
      pad(String(stats.attempts), 12) +
      `${rate}%`,
    );
  }

  // Cross-tier dedup verification
  console.log("\n  CROSS-TIER DEDUP:");
  let dedupOk = true;
  for (const r of results) {
    const allAttempts = r.tiers.reduce((s, t) => s + t.attempts, 0);
    const tierPasswordCounts = r.tiers.reduce((s, t) => s + t.passwordCount, 0);
    const efficient = allAttempts <= tierPasswordCounts;
    if (!efficient) dedupOk = false;
    console.log(`  ${r.email}: ${allAttempts} attempts / ${tierPasswordCounts} total passwords → ${efficient ? "✅ dedup OK" : "❌ duplicates"}`);
  }

  // Final checks
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  VERIFICATION");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const checks = [
    { name: "user1: found in Tier 1 (top-100)", ok: results[0].foundInTier === 1 },
    { name: "alex: found in Tier 2 (personalized)", ok: results[1].foundInTier === 2 },
    { name: "hans: found in Tier 3 (top-1000)", ok: results[2].foundInTier === 3 },
    { name: "secure: found in Tier 4 (custom dict)", ok: results[3].foundInTier === 4 },
    { name: "random: not found (null)", ok: results[4].foundInTier === null },
    { name: "Tier 1 fastest (fewest attempts)", ok: results[0].totalAttempts < results[2].totalAttempts },
    { name: "Cross-tier dedup working", ok: dedupOk },
    { name: "Stop on first success (no extra tiers)", ok: results[0].tiers.length === 1 },
  ];

  let finalPassed = 0;
  console.log(pad("Check", 50) + "OK?");
  console.log("─".repeat(55));
  for (const c of checks) {
    if (c.ok) finalPassed++;
    console.log(pad(c.name, 50) + (c.ok ? "✅" : "❌"));
  }
  console.log("─".repeat(55));

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  ИТОГО: ${finalPassed}/${checks.length} checks passed`);
  console.log(`  Tier hit rate: ${passed}/5 correct tier detection`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(finalPassed === checks.length ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
