/**
 * Скачивает все essential wordlists из SecLists GitHub
 * Запуск: npx tsx tests/real/download-wordlists.ts
 */

import {
  downloadAllEssential,
  downloadWordlist,
  getWordlistStats,
  AVAILABLE_WORDLISTS,
} from "../../src/services/dictionary/wordlist-manager.js";

function pad(s: string, n: number): string { return s.padEnd(n); }

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  Downloading SecLists Wordlists                                ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  console.log("  Available wordlists:");
  for (const w of AVAILABLE_WORDLISTS) {
    console.log(`    ${pad(w.name, 25)} ${pad(w.estimatedSize, 10)} ${w.description}`);
  }
  console.log("");

  // Download essential (small/medium)
  console.log("  Downloading essential wordlists...\n");
  const results = await downloadAllEssential();

  console.log(pad("  Wordlist", 28) + pad("Status", 12) + pad("Lines", 10) + "Error");
  console.log("  " + "─".repeat(60));

  for (const r of results) {
    console.log(
      pad(`  ${r.name}`, 28) +
      pad(r.success ? "✅" : "❌", 12) +
      pad(r.lines ? String(r.lines) : "—", 10) +
      (r.error ?? ""),
    );
  }

  // Download large ones
  console.log("\n  Downloading large wordlists...\n");

  const large = ["rockyou-50"];
  for (const name of large) {
    console.log(`  Downloading ${name}...`);
    const result = await downloadWordlist(name);
    console.log(`    ${result.success ? "✅" : "❌"} ${result.lines ?? 0} lines${result.error ? " — " + result.error : ""}`);
  }

  // Final stats
  console.log("\n  Final wordlist inventory:\n");
  const stats = await getWordlistStats();

  let totalLines = 0;
  let totalBytes = 0;

  console.log(pad("  Name", 28) + pad("Downloaded", 13) + pad("Lines", 12) + "Size");
  console.log("  " + "─".repeat(60));

  for (const s of stats) {
    if (s.downloaded) {
      totalLines += s.lines;
      totalBytes += s.sizeBytes;
    }
    console.log(
      pad(`  ${s.name}`, 28) +
      pad(s.downloaded ? "✅" : "❌", 13) +
      pad(s.lines > 0 ? s.lines.toLocaleString() : "—", 12) +
      (s.sizeBytes > 0 ? `${(s.sizeBytes / 1024).toFixed(1)} KB` : "—"),
    );
  }

  console.log("  " + "─".repeat(60));
  console.log(`  Total: ${totalLines.toLocaleString()} passwords, ${(totalBytes / 1024 / 1024).toFixed(1)} MB\n`);
}

main().catch(console.error);
