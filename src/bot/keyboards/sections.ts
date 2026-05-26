import { InlineKeyboard } from "grammy";

export function validationMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📂 Загрузить базу", "menu:upload")
    .text("📋 Мои задачи", "menu:tasks")
    .row()
    .text("📧 SMTP Check", "menu:check_smtp")
    .text("🔐 IMAP Validate", "menu:validate")
    .row()
    .text("◀ Главное меню", "menu:back");
}

export function securityMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔑 Web Auth (OAuth)", "menu:check_web")
    .row()
    .text("🔒 Full Audit Pipeline", "menu:full_audit")
    .row()
    .text("📥 Audit Export", "menu:audit_export")
    .row()
    .text("🔍 Breach Search", "breach:start")
    .row()
    .text("◀ Главное меню", "menu:back");
}

export function recoveryMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📖 Словари", "menu:dictionary")
    .text("🔑 Паттерны", "menu:gen_passwords")
    .row()
    .text("🎯 Tiered Recovery", "tier:start")
    .text("🔑 Dict Attack", "menu:recover_passwords")
    .row()
    .text("🔓 Full Recovery", "menu:full_recover")
    .row()
    .text("💀 Stuffing", "menu:stuffing")
    .text("📂 Import Combo", "menu:import_combo")
    .row()
    .text("◀ Главное меню", "menu:back");
}

export function analyticsMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Статистика", "menu:stats")
    .text("📊 Dashboard", "menu:dashboard")
    .row()
    .text("📋 Audit Report", "menu:audit_report")
    .row()
    .text("◀ Главное меню", "menu:back");
}

export function adminMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚙️ Настройки", "menu:settings")
    .text("🌐 Proxy", "menu:proxy")
    .row()
    .text("📜 Логи", "menu:logs")
    .text("🔔 Уведомления", "menu:notifications")
    .row()
    .text("🗄 Архив", "arch:stats")
    .row()
    .text("◀ Главное меню", "menu:back");
}

export function importExportMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📥 Экспорт email", "menu:export")
    .text("📥 Audit Export", "menu:audit_export")
    .row()
    .text("⚡ Генератор email", "menu:generator")
    .row()
    .text("📦 Словари SecLists", "wl:list")
    .text("📂 Import Combo", "menu:import_combo")
    .row()
    .text("◀ Главное меню", "menu:back");
}
