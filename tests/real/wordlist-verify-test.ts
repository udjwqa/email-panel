/**
 * Verify downloaded wordlists + tiered engine with SecLists
 * Запуск: npx tsx tests/real/wordlist-verify-test.ts
 */

import { loadWordlist, getWordlistStats } from "../../src/services/dictionary/wordlist-manager.js";
import { TieredRecoveryEngine, type AuthFunction } from "../../src/services/matching/tiered-recovery.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  Wordlist Verification + Tiered Recovery with SecLists         ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  // Part 1: Verify downloaded wordlists
  console.log("  PART 1: Downloaded Wordlists\n");
  const stats = await getWordlistStats();

  let totalPasswords = 0;
  console.log(pad("  Name", 25) + pad("Lines", 12) + pad("Size", 12) + "OK?");
  console.log("  " + "─".repeat(52));

  for (const s of stats) {
    totalPasswords += s.lines;
    console.log(
      pad(`  ${s.name}`, 25) +
      pad(s.lines > 0 ? s.lines.toLocaleString() : "—", 12) +
      pad(s.sizeBytes > 0 ? `${(s.sizeBytes / 1024).toFixed(0)} KB` : "—", 12) +
      (s.downloaded ? "✅" : "❌"),
    );
  }
  console.log("  " + "─".repeat(52));
  console.log(`  Total: ${totalPasswords.toLocaleString()} passwords\n`);

  // Part 2: Sample passwords from each list
  console.log("  PART 2: Sample Passwords\n");
  const lists = ["top-shortlist", "10k-most-common", "100k-NCSC", "rockyou-75"];
  for (const name of lists) {
    const passwords = await loadWordlist(name);
    if (passwords.length > 0) {
      console.log(`  ${name} (${passwords.length.toLocaleString()}):`);
      console.log(`    First 5: ${passwords.slice(0, 5).join(", ")}`);
      console.log(`    Last 5:  ${passwords.slice(-5).join(", ")}`);
      console.log("");
    }
  }

  // Part 3: Tiered recovery with SecLists
  console.log("  PART 3: Tiered Recovery with Real SecLists\n");

  // Use a password from 10k list but NOT in top-100
  const list10k = await loadWordlist("10k-most-common");
  const testPassword = list10k[5000] ?? "testing123"; // mid-list password

  // Use a password from 100k but NOT in 10k
  const list100k = await loadWordlist("100k-NCSC");
  const deepPassword = list100k[50000] ?? "deep_pass";

  // Use a password from RockYou but NOT in 100k
  const rockyou = await loadWordlist("rockyou-75");
  const rockyouPassword = rockyou[40000] ?? "rockyou_pass";

  const KNOWN: Record<string, string> = {
    "easy@test.com": "123456",           // Tier 1 (hardcoded top-100)
    "mid@test.com": testPassword,        // Tier 3 (SecLists 10K)
    "deep@test.com": deepPassword,       // Tier 4 (SecLists 100K)
    "rock@test.com": rockyouPassword,    // Tier 5 (RockYou 75K)
  };

  const mockAuth: AuthFunction = async (email, password) => KNOWN[email] === password;

  console.log(`  Known passwords:`);
  for (const [email, pw] of Object.entries(KNOWN)) {
    console.log(`    ${email}: "${pw}"`);
  }
  console.log("");

  const engine = new TieredRecoveryEngine({ delayMs: 1, jitterFactor: 0, maxAttemptsPerEmail: 200000 });

  const testEmails = Object.keys(KNOWN);
  let passed = 0;

  for (const email of testEmails) {
    console.log(`  Testing: ${email} ...`);
    const result = await engine.recover(
      email,
      { firstName: "Test", lastName: "User", birthDate: "1990-01-01" },
      mockAuth,
      { maxTier: 5 },
    );

    const ok = result.found && result.password === KNOWN[email];
    if (ok) passed++;

    console.log(
      `    ${ok ? "✅" : "❌"} Found: "${result.password}" in Tier ${result.foundInTier} (${result.tierName}), ${result.totalAttempts} attempts\n`,
    );
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  SecLists Tiered Recovery: ${passed}/${testEmails.length} passed`);
  console.log(`  Total passwords available: ${totalPasswords.toLocaleString()}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(passed === testEmails.length ? 0 : 1);
}

main().catch(console.error);
