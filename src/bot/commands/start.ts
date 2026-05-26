import { BotContext } from "../types.js";
import { mainMenuKeyboard } from "../keyboards/main-menu.js";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  VIEWER: "Наблюдатель",
};

export async function startCommand(ctx: BotContext) {
  const { dbUser } = ctx;
  const name = ctx.from?.first_name ?? dbUser.username ?? "User";
  const roleLabel = ROLE_LABELS[dbUser.role] ?? dbUser.role;

  await ctx.reply(
    `👋 <b>Добро пожаловать, ${name}!</b>\n` +
      `Роль: ${roleLabel}\n\n` +
      `<b>Email Panel</b> — валидация, аудит и восстановление\n\n` +
      `📂 <b>Загрузка</b> — upload и проверка email-баз\n` +
      `🔒 <b>Security</b> — SMTP / OAuth / IMAP аудит\n` +
      `🔑 <b>Recovery</b> — словари, паттерны, stuffing\n` +
      `📊 <b>Аналитика</b> — stats, dashboard, отчёты\n` +
      `⚙️ <b>Настройки</b> — система, прокси, логи\n` +
      `📥 <b>Import</b> — combo-листы, экспорт\n\n` +
      `Выберите раздел:`,
    {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(dbUser.role, dbUser.isAdmin),
    },
  );
}
