import { InlineKeyboard } from "grammy";
import { Role } from "@prisma/client";

export function mainMenuKeyboard(role: Role, isAdmin: boolean) {
  const kb = new InlineKeyboard();

  kb.text("📂 Загрузка", "section:validation")
    .text("🔒 Security", "section:security")
    .row();

  kb.text("🔑 Recovery", "section:recovery")
    .text("📊 Аналитика", "section:analytics")
    .row();

  kb.text("📥 Import / Export", "section:import_export")
    .text("⚙️ Настройки", "section:admin")
    .row();

  kb.text("📖 Инструкция", "menu:help")
    .row();

  return kb;
}
