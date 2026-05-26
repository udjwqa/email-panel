import { InlineKeyboard } from "grammy";
import type { BotContext } from "../types.js";

const HELP_PAGES = {
  main: {
    text:
      `📖 <b>ИНСТРУКЦИЯ</b>\n\n` +
      `Бот делает 3 вещи:\n\n` +
      `<b>1. Генерация email'ов</b>\n` +
      `Вводишь имя + фамилию + домены → получаешь список вероятных почт (ivan.petrov@gmail.com, ipetrov@outlook.com и т.д.)\n\n` +
      `<b>2. Проверка email'ов</b>\n` +
      `SMTP: жив ли ящик? IMAP: работает ли пароль? OAuth: работает ли через API?\n\n` +
      `<b>3. Подбор паролей</b>\n` +
      `Берём email + словарь паролей → пробуем каждый → находим рабочие пары\n\n` +
      `Выбери раздел:`,
    kb: () =>
      new InlineKeyboard()
        .text("🚀 Быстрый старт", "help:quickstart")
        .row()
        .text("📂 Загрузка", "help:upload")
        .text("🔒 Проверки", "help:checks")
        .row()
        .text("🔑 Подбор паролей", "help:recovery")
        .text("💀 Stuffing", "help:stuffing")
        .row()
        .text("📊 Отчёты", "help:reports")
        .text("🔧 Команды", "help:commands")
        .row()
        .text("◀ Главное меню", "menu:back"),
  },

  quickstart: {
    text:
      `🚀 <b>БЫСТРЫЙ СТАРТ — 5 минут</b>\n\n` +
      `<b>Сценарий A: Есть файл с email:password</b>\n` +
      `1. 📂 Загрузка → Загрузить базу → кинь .txt файл\n` +
      `2. Бот парсит, считает валидные/невалидные\n` +
      `3. Жми "Запустить проверку" → MX check\n` +
      `4. 🔒 Security → SMTP Check → выбери задачу → Запустить\n` +
      `5. 🔒 Security → Full Audit → полная проверка\n` +
      `6. Результаты → файлом в чат\n\n` +
      `<b>Сценарий B: Есть только имя человека</b>\n` +
      `1. 📥 Import/Export → Генератор → wizard (имя, страна, домены)\n` +
      `2. Получаешь 36+ email'ов\n` +
      `3. 📂 Загрузка → Задачи → SMTP check\n` +
      `4. 🔑 Recovery → Паттерны → генерируй пароли из имени\n` +
      `5. 🔑 Recovery → Dict Attack → выбери словарь → подбор\n\n` +
      `<b>Сценарий C: Есть combo list (email:password)</b>\n` +
      `1. 📥 Import/Export → Import Combo → кинь .txt файл\n` +
      `2. 🔑 Recovery → Stuffing → Start → проверяет все пары\n` +
      `3. Рабочие пары → файлом\n`,
    kb: () =>
      new InlineKeyboard()
        .text("◀ Назад к инструкции", "help:main"),
  },

  upload: {
    text:
      `📂 <b>ЗАГРУЗКА И ПРОВЕРКА</b>\n\n` +
      `<b>Как загрузить базу:</b>\n` +
      `1. Из меню: 📂 Загрузка → Загрузить базу\n` +
      `   Или команда: /upload\n` +
      `2. Кидаешь .txt файл боту\n\n` +
      `<b>Поддерживаемые форматы строк:</b>\n` +
      `• email@example.com\n` +
      `• email@example.com:password\n` +
      `• email@example.com;password\n` +
      `• email@example.com|data\n\n` +
      `<b>Что происходит после загрузки:</b>\n` +
      `• Парсинг: валидный формат? есть @?\n` +
      `• Домены: gmail.com → Google, outlook.com → Microsoft\n` +
      `• MX check: есть ли MX-записи у домена?\n` +
      `• Статус: MX_FOUND = ящик скорее всего существует\n\n` +
      `<b>Задачи:</b>\n` +
      `📂 Загрузка → Мои задачи → видишь прогресс\n` +
      `Или: /tasks, /status 42, /cancel 42\n`,
    kb: () =>
      new InlineKeyboard()
        .text("◀ Назад к инструкции", "help:main"),
  },

  checks: {
    text:
      `🔒 <b>ПРОВЕРКИ (Security Audit)</b>\n\n` +
      `<b>3 вида проверок:</b>\n\n` +
      `📧 <b>SMTP Check</b>\n` +
      `Где: 📂 Загрузка → SMTP Check\n` +
      `Что: стучится к серверу и спрашивает "существует ли этот ящик?"\n` +
      `Результат: deliverable / undeliverable\n\n` +
      `🔐 <b>IMAP Validate</b>\n` +
      `Где: 📂 Загрузка → IMAP Validate\n` +
      `Что: пробует залогиниться с паролем через IMAP\n` +
      `Результат: active_clean / active_with_2fa / locked\n` +
      `Фильтр: только чистые / только 2FA / все\n\n` +
      `🔑 <b>Web Auth (OAuth)</b>\n` +
      `Где: 🔒 Security → Web Auth\n` +
      `Что: проверка через OAuth API (Google, Microsoft, Yahoo)\n` +
      `Прогресс: по провайдерам (Google: 70%, Microsoft: 33%)\n\n` +
      `🔒 <b>Full Audit Pipeline</b>\n` +
      `Где: 🔒 Security → Full Audit\n` +
      `Что: SMTP → OAuth → IMAP последовательно\n` +
      `Каждый этап фильтрует данные для следующего\n`,
    kb: () =>
      new InlineKeyboard()
        .text("◀ Назад к инструкции", "help:main"),
  },

  recovery: {
    text:
      `🔑 <b>ПОДБОР ПАРОЛЕЙ</b>\n\n` +
      `<b>Шаг 1: Словари</b>\n` +
      `Где: 🔑 Recovery → Словари\n` +
      `• Загрузи свой .txt файл с паролями\n` +
      `• Или используй встроенные (67M паролей уже скачаны!)\n` +
      `• Категории: Common 📗 / User-specific 📘 / Leaked 📕\n\n` +
      `<b>Шаг 2: Паттерны (персональные пароли)</b>\n` +
      `Где: 🔑 Recovery → Паттерны\n` +
      `• Вводишь: имя, фамилия, дата рождения, никнейм\n` +
      `• Получаешь: Ivan1990, IvanPetrov!, ivan.petrov, 1v@n1990...\n` +
      `• 140+ вариантов за 1 секунду\n` +
      `• Можно сохранить как словарь\n\n` +
      `<b>Шаг 3: Подбор</b>\n` +
      `Где: 🔑 Recovery → Dict Attack\n` +
      `• Выбираешь задачу (email'ы)\n` +
      `• Выбираешь словари (toggle кнопками)\n` +
      `• Можно загрузить свой .txt прямо в потоке\n` +
      `• Запускаешь → прогресс в реальном времени\n` +
      `• Результат → CSV файл в чат\n\n` +
      `<b>Full Recovery Pipeline:</b>\n` +
      `Где: 🔑 Recovery → Full Recovery\n` +
      `Всё автоматом: паттерны → словари → подбор → результат\n`,
    kb: () =>
      new InlineKeyboard()
        .text("◀ Назад к инструкции", "help:main"),
  },

  stuffing: {
    text:
      `💀 <b>CREDENTIAL STUFFING</b>\n\n` +
      `Это когда у тебя уже есть пары email:password\n` +
      `(из утечек, combo list'ов, Telegram каналов)\n` +
      `и ты проверяешь — работают ли они.\n\n` +
      `<b>Как использовать:</b>\n\n` +
      `1. <b>Импорт combo list</b>\n` +
      `   Где: 📥 Import/Export → Import Combo\n` +
      `   Или: /import_combo\n` +
      `   Кидаешь .txt файл в формате email:password\n\n` +
      `2. <b>Запуск stuffing</b>\n` +
      `   Где: 🔑 Recovery → Stuffing → Start\n` +
      `   Или: /stuff\n` +
      `   15 параллельных workers проверяют каждую пару\n\n` +
      `3. <b>Результаты</b>\n` +
      `   Рабочие пары сохраняются автоматически\n` +
      `   Скачать: кнопка "Results" или Audit Export\n\n` +
      `<b>Скорость:</b>\n` +
      `• Без прокси: ~500 checks/час\n` +
      `• С 15 прокси: ~15,000 checks/час\n` +
      `• При 5% success rate = 750 найденных/час\n`,
    kb: () =>
      new InlineKeyboard()
        .text("◀ Назад к инструкции", "help:main"),
  },

  reports: {
    text:
      `📊 <b>ОТЧЁТЫ И ЭКСПОРТ</b>\n\n` +
      `<b>Dashboard (живая статистика):</b>\n` +
      `Где: 📊 Аналитика → Dashboard\n` +
      `Или: /dashboard\n` +
      `Видишь: workers, proxies, задачи, найденные пары\n\n` +
      `<b>Статистика:</b>\n` +
      `Где: 📊 Аналитика → Статистика\n` +
      `Период: 1 час / 24 часа / 7 дней / 30 дней / всё время\n\n` +
      `<b>Audit Report:</b>\n` +
      `Где: 📊 Аналитика → Audit Report\n` +
      `Полный отчёт: success rate, by provider, 2FA rate, avg time\n\n` +
      `<b>Экспорт email-базы:</b>\n` +
      `Где: 📥 Import/Export → Экспорт email\n` +
      `Фильтры: задача, статус, домен, период, формат (TXT/CSV)\n\n` +
      `<b>Audit Export (результаты проверок):</b>\n` +
      `Где: 📥 Import/Export → Audit Export\n` +
      `Фильтр по accountStatus: clean, 2FA, suspicious, locked\n` +
      `Формат: CSV (email,password,status,provider)\n`,
    kb: () =>
      new InlineKeyboard()
        .text("◀ Назад к инструкции", "help:main"),
  },

  commands: {
    text:
      `🔧 <b>ВСЕ КОМАНДЫ</b>\n\n` +
      `<b>Основные:</b>\n` +
      `/start — главное меню\n` +
      `/upload — загрузить файл\n` +
      `/tasks — список задач\n` +
      `/status 42 — статус задачи #42\n` +
      `/cancel 42 — отменить задачу\n` +
      `/dashboard — живая статистика\n\n` +
      `<b>Проверки:</b>\n` +
      `/check_smtp — SMTP проверка\n` +
      `/check_web — OAuth проверка\n` +
      `/validate — IMAP валидация\n` +
      `/full_audit — полный pipeline\n\n` +
      `<b>Recovery:</b>\n` +
      `/dictionary — словари паролей\n` +
      `/generate_passwords — генератор паттернов\n` +
      `/recover — подбор паролей\n` +
      `/recover_passwords — dictionary attack (подробный)\n` +
      `/full_recover — полный recovery pipeline\n` +
      `/stuff — credential stuffing\n` +
      `/import_combo — импорт combo list\n\n` +
      `<b>Прочее:</b>\n` +
      `/stats — статистика\n` +
      `/export — экспорт\n` +
      `/generator — генератор email'ов\n` +
      `/settings — настройки (admin)\n` +
      `/proxy — прокси (admin)\n` +
      `/logs — логи (admin)\n`,
    kb: () =>
      new InlineKeyboard()
        .text("◀ Назад к инструкции", "help:main"),
  },
};

export async function showHelp(ctx: BotContext, page = "main") {
  const p = HELP_PAGES[page as keyof typeof HELP_PAGES] ?? HELP_PAGES.main;

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(p.text, {
      parse_mode: "HTML",
      reply_markup: p.kb(),
    });
  } else {
    await ctx.reply(p.text, {
      parse_mode: "HTML",
      reply_markup: p.kb(),
    });
  }
}

export async function handleHelpCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("help:")) return;

  const page = data.replace("help:", "");
  return showHelp(ctx, page);
}
