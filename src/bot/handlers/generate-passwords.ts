import type { BotContext } from "../types.js";

export async function generatePasswordsCommand(ctx: BotContext) {
  ctx.session.passwordWizard = { step: "firstName" };

  await ctx.reply(
    "🔑 <b>Генератор паттернов паролей</b>\n\n" +
      "Шаг 1/4: Введите <b>имя</b>:",
    { parse_mode: "HTML" },
  );
}

export async function handlePasswordWizardInput(
  ctx: BotContext,
): Promise<boolean> {
  const pw = ctx.session.passwordWizard;
  if (!pw?.step) return false;

  const text = ctx.message?.text?.trim();
  if (!text) return false;

  switch (pw.step) {
    case "firstName": {
      pw.firstName = text;
      pw.step = "lastName";
      await ctx.reply(
        "🔑 Шаг 2/4: Введите <b>фамилию</b>:",
        { parse_mode: "HTML" },
      );
      return true;
    }

    case "lastName": {
      pw.lastName = text;
      pw.step = "birthDate";
      await ctx.reply(
        "🔑 Шаг 3/4: Введите <b>дату рождения</b> (DD.MM.YYYY)\n" +
          "Или отправьте <b>-</b> чтобы пропустить:",
        { parse_mode: "HTML" },
      );
      return true;
    }

    case "birthDate": {
      if (text !== "-") {
        const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (match) {
          pw.birthDate = `${match[3]}-${match[2]}-${match[1]}`;
        } else {
          await ctx.reply("Неверный формат. Используйте DD.MM.YYYY или -");
          return true;
        }
      }
      pw.step = "nickname";
      await ctx.reply(
        "🔑 Шаг 4/4: Введите <b>никнейм</b> (или <b>-</b> чтобы пропустить):",
        { parse_mode: "HTML" },
      );
      return true;
    }

    case "nickname": {
      if (text !== "-") {
        pw.nickname = text;
      }

      const { generatePasswordPatterns } = await import(
        "../../services/dictionary/pattern-generator.js"
      );

      const result = generatePasswordPatterns({
        firstName: pw.firstName!,
        lastName: pw.lastName!,
        birthDate: pw.birthDate,
        nickname: pw.nickname,
      });

      pw.generatedPasswords = result.passwords;
      pw.step = "preview";

      const preview = result.passwords.slice(0, 10).map((p) => `  <code>${p}</code>`).join("\n");

      const { InlineKeyboard } = await import("grammy");
      const kb = new InlineKeyboard()
        .text("📖 Сохранить как словарь", "genpw:save")
        .row()
        .text("📥 Скачать TXT", "genpw:download")
        .row()
        .text("✖ Отмена", "genpw:cancel");

      await ctx.reply(
        `🔑 <b>Сгенерировано ${result.passwords.length} паролей</b>\n\n` +
          `Имя: ${pw.firstName}\n` +
          `Фамилия: ${pw.lastName}\n` +
          (pw.birthDate ? `Дата: ${pw.birthDate}\n` : "") +
          (pw.nickname ? `Никнейм: ${pw.nickname}\n` : "") +
          `\nПримеры:\n${preview}\n...`,
        { parse_mode: "HTML", reply_markup: kb },
      );
      return true;
    }

    default:
      return false;
  }
}
