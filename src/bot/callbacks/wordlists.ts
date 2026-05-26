import { InlineKeyboard } from "grammy";
import {
  AVAILABLE_WORDLISTS,
  getWordlistStats,
  downloadWordlist,
  downloadAllEssential,
  isDownloaded,
} from "../../services/dictionary/wordlist-manager.js";
import { audit } from "../../services/audit.js";
import type { BotContext } from "../types.js";

export async function handleWordlistCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("wl:")) return;

  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "list":
      return showWordlistList(ctx);
    case "download":
      return downloadOne(ctx, parts[2]);
    case "download_all":
      return downloadAll(ctx);
    default:
      await ctx.answerCallbackQuery();
  }
}

async function showWordlistList(ctx: BotContext) {
  const stats = await getWordlistStats();

  let totalLines = 0;
  let totalBytes = 0;
  let downloaded = 0;

  let list = "";
  for (const s of stats) {
    if (s.downloaded) {
      downloaded++;
      totalLines += s.lines;
      totalBytes += s.sizeBytes;
      list += `  ✅ ${s.name} (${s.lines.toLocaleString()}) — ${(s.sizeBytes / 1024).toFixed(0)} KB\n`;
    } else {
      const info = AVAILABLE_WORDLISTS.find((w) => w.name === s.name);
      list += `  ❌ ${s.name} — ${info?.estimatedSize ?? "?"}\n`;
    }
  }

  const text =
    `📦 <b>SecLists Wordlists</b>\n\n` +
    `${list}\n` +
    `📊 Скачано: ${downloaded}/${stats.length}\n` +
    `Total: ${totalLines.toLocaleString()} паролей, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`;

  const kb = new InlineKeyboard();

  // Show download buttons for not-downloaded
  for (const s of stats) {
    if (!s.downloaded) {
      kb.text(`📥 Скачать ${s.name}`, `wl:download:${s.name}`).row();
    }
  }

  const notDownloaded = stats.filter((s) => !s.downloaded).length;
  if (notDownloaded > 0) {
    kb.text(`📥 Скачать все (${notDownloaded})`, "wl:download_all").row();
  }

  kb.text("🔄 Refresh", "wl:list").row();
  kb.text("◀ Import/Export", "section:import_export");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
}

async function downloadOne(ctx: BotContext, name: string) {
  await ctx.answerCallbackQuery(`Скачиваю ${name}...`);

  const result = await downloadWordlist(name);

  if (result.success) {
    audit({
      userId: ctx.dbUser.id,
      type: "wordlist_downloaded",
      level: "INFO",
      message: `Downloaded ${name}: ${result.lines} lines`,
    });
  }

  return showWordlistList(ctx);
}

async function downloadAll(ctx: BotContext) {
  await ctx.answerCallbackQuery("Скачиваю все словари...");

  await ctx.editMessageText("⏳ Скачиваю словари из SecLists...\nЭто может занять минуту.");

  const results = await downloadAllEssential();

  const summary = results
    .map((r) => `  ${r.success ? "✅" : "❌"} ${r.name}: ${r.lines ?? 0} lines`)
    .join("\n");

  audit({
    userId: ctx.dbUser.id,
    type: "wordlists_bulk_download",
    level: "INFO",
    message: `Bulk download: ${results.filter((r) => r.success).length}/${results.length} success`,
  });

  return showWordlistList(ctx);
}
