import { InlineKeyboard } from "grammy";
import { Role } from "@prisma/client";

export function mainMenuKeyboard(role: Role, isAdmin: boolean) {
  const kb = new InlineKeyboard();

  if (isAdmin || role === "ADMIN" || role === "MANAGER") {
    kb.text("📂 Загрузить базу", "menu:upload")
      .text("⚡ Генератор", "menu:generator")
      .row();
  }

  kb.text("📋 Мои задачи", "menu:tasks")
    .text("📊 Статистика", "menu:stats")
    .row();

  if (isAdmin || role === "ADMIN" || role === "MANAGER") {
    kb.text("📥 Экспорт", "menu:export")
      .text("🌐 Proxy", "menu:proxy")
      .row();
    kb.text("📧 SMTP Check", "menu:check_smtp")
      .text("🔑 Web Auth", "menu:check_web")
      .row();
    kb.text("🔐 Validate", "menu:validate")
      .text("🔒 Full Audit", "menu:full_audit")
      .row();
    kb.text("📥 Audit Export", "menu:audit_export")
      .text("📖 Словари", "menu:dictionary")
      .row();
    kb.text("🔑 Генератор паролей", "menu:gen_passwords")
      .text("🔓 Восстановление", "menu:recover")
      .row();
    kb.text("🔓 Full Recovery", "menu:full_recover")
      .text("🔑 Dict Attack", "menu:recover_passwords")
      .row();
  }

  if (isAdmin || role === "ADMIN") {
    kb.text("⚙️ Настройки", "menu:settings")
      .text("📜 Логи", "menu:logs");
  }

  return kb;
}
