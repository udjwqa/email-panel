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
    `Добро пожаловать, ${name}!\n` +
      `Роль: ${roleLabel}\n\n` +
      `📋 Загрузка и проверка баз email\n` +
      `🔒 Security Audit (SMTP / Web / IMAP)\n` +
      `📊 Экспорт и статистика\n\n` +
      `Выберите действие:`,
    {
      reply_markup: mainMenuKeyboard(dbUser.role, dbUser.isAdmin),
    },
  );
}
