import { InlineKeyboard } from "grammy";
import { BotContext } from "../types.js";
import { config } from "../../config.js";
import { processFile } from "../../services/file-processor.js";
import { audit } from "../../services/audit.js";
import { getNumSetting } from "../../services/settings.js";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadHandler(ctx: BotContext) {
  const doc = ctx.message?.document;
  if (!doc) return;

  const fileName = doc.file_name ?? "unknown.txt";

  if (!fileName.toLowerCase().endsWith(".txt")) {
    await ctx.reply("❌ Поддерживаются только .txt файлы.");
    return;
  }

  const mimeType = doc.mime_type ?? "";
  if (mimeType && mimeType !== "text/plain") {
    await ctx.reply("❌ Файл должен быть текстовым (text/plain).");
    return;
  }

  const fileSize = doc.file_size ?? 0;
  const maxFileSize = await getNumSetting("max_file_size");
  if (fileSize > maxFileSize) {
    await ctx.reply(
      `❌ Файл слишком большой (${formatSize(fileSize)}).\n` +
        `Максимум: ${formatSize(maxFileSize)}`,
    );
    return;
  }

  const statusMsg = await ctx.reply("⏳ Обработка файла...");

  try {
    const { task, parseResult } = await processFile(
      ctx.api,
      ctx.dbUser.id,
      doc.file_id,
      fileName,
      config.botToken,
    );

    const report =
      `📂 Файл: ${fileName}\n` +
      `📏 Размер: ${formatSize(fileSize)}\n` +
      `📊 Всего строк: ${parseResult.totalLines}\n` +
      `✅ Валидных email: ${parseResult.validLines}\n` +
      `❌ Невалидных: ${parseResult.invalidLines}\n` +
      `🔄 Дубликатов: ${parseResult.duplicateCount}`;

    const kb = new InlineKeyboard()
      .text("▶ Запустить проверку", `upload:run:${task.id}`)
      .text("✖ Отмена", `upload:cancel:${task.id}`);

    await ctx.api.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      report,
      { reply_markup: kb },
    );

    audit({ userId: ctx.dbUser.id, type: "file_uploaded", level: "INFO", message: `${fileName}: ${parseResult.validLines} valid, ${parseResult.invalidLines} invalid, ${parseResult.duplicateCount} dupes` });
  } catch (err) {
    audit({ userId: ctx.dbUser.id, type: "file_error", level: "ERROR", message: `${fileName}: ${err instanceof Error ? err.message : "Unknown error"}` });

    await ctx.api.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      `❌ Ошибка обработки файла: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }
}
