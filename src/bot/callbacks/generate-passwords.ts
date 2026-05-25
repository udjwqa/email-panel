import { InputFile } from "grammy";
import { createDictionary } from "../../services/dictionary/manager.js";
import { parsePasswordFile } from "../../services/dictionary/parser.js";
import { audit } from "../../services/audit.js";
import type { BotContext } from "../types.js";

export async function handleGenPwCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("genpw:")) return;

  const action = data.replace("genpw:", "");
  const pw = ctx.session.passwordWizard;

  if (!pw?.generatedPasswords || pw.generatedPasswords.length === 0) {
    await ctx.answerCallbackQuery("Нет сгенерированных паролей");
    return;
  }

  switch (action) {
    case "save": {
      const content = pw.generatedPasswords.join("\n");
      const parsed = parsePasswordFile(content);

      const name = `patterns_${pw.firstName}_${pw.lastName}`.toLowerCase();
      const dict = await createDictionary(
        ctx.dbUser.id,
        name,
        "user_specific",
        parsed.entries,
        "pattern-generator",
      );

      audit({
        userId: ctx.dbUser.id,
        type: "password_patterns_saved",
        level: "INFO",
        message: `Saved ${dict.entryCount} password patterns as dictionary "${name}"`,
      });

      ctx.session.passwordWizard = { step: null };

      await ctx.answerCallbackQuery("Словарь сохранён");
      await ctx.editMessageText(
        `✅ <b>Словарь сохранён</b>\n\n` +
          `Название: ${name}\n` +
          `Паролей: ${dict.entryCount}\n` +
          `Категория: user_specific`,
        { parse_mode: "HTML" },
      );
      break;
    }

    case "download": {
      const content = pw.generatedPasswords.join("\n");
      const buffer = Buffer.from(content, "utf-8");
      const fileName = `patterns_${pw.firstName}_${pw.lastName}_${Date.now()}.txt`.toLowerCase();

      await ctx.replyWithDocument(new InputFile(buffer, fileName), {
        caption: `🔑 ${pw.generatedPasswords.length} паролей для ${pw.firstName} ${pw.lastName}`,
      });

      ctx.session.passwordWizard = { step: null };
      await ctx.answerCallbackQuery();
      break;
    }

    case "cancel": {
      ctx.session.passwordWizard = { step: null };
      await ctx.answerCallbackQuery("Отменено");
      await ctx.editMessageText("🔑 Генерация паролей отменена.");
      break;
    }

    default:
      await ctx.answerCallbackQuery();
  }
}
