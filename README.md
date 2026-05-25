# Email Panel — Telegram-бот для валидации и аудита email-баз

> Полноценная платформа для работы с email-базами: загрузка, валидация (MX/SMTP/IMAP/OAuth), security audit, восстановление доступа к собственным аккаунтам через dictionary attack, и экспорт результатов. Всё управляется через Telegram-бота с inline-кнопками и real-time прогрессом.

---

## Что это такое и зачем нужно

Короче, это мощный тул для тех, кто работает с email-базами. Кидаешь боту `.txt` файл с email'ами (или email:password парами), а он:

1. **Проверяет доставляемость** — резолвит MX-записи, стучится по SMTP, проверяет что ящик реально существует
2. **Проверяет пароли** — OAuth/IMAP аутентификация, определяет работает ли пара email:password
3. **Классифицирует аккаунты** — чистый, с 2FA, подозрительная активность, заблокирован
4. **Восстанавливает доступ** — dictionary attack по своим словарям, генерация паттернов из личных данных
5. **Экспортирует результаты** — CSV/TXT файлы прямо в чат

Всё крутится на BullMQ очередях, Redis кеше, PostgreSQL, и оборачивается в Docker для деплоя одной командой.

---

## Стек

```
TypeScript + Node.js 24
grammY (Telegram Bot API)
Fastify (REST API)
Prisma ORM + PostgreSQL 16
BullMQ + Redis 8 (очереди задач)
puppeteer-extra (Web Auth)
Docker Compose (деплой)
Vitest (661 тест)
```

---

## Быстрый старт

### Через Docker (рекомендуется)

```bash
git clone https://github.com/redzov/email-panel.git
cd email-panel

# Автоматическая настройка (создаёт .env, генерирует секреты, SSL, запускает стек)
chmod +x scripts/init.sh
./scripts/init.sh

# Ставим токен бота
nano .env
# → BOT_TOKEN=123456:ABC-DEF...
# → ADMIN_IDS=твой_telegram_id

# Перезапускаем
docker compose restart app
```

### Локально (для разработки)

```bash
# Зависимости
npm install

# Копируем конфиг
cp .env.example .env
# Заполняем BOT_TOKEN, DATABASE_URL, REDIS_URL

# Миграции
npx prisma migrate dev

# Запуск в dev-режиме
npm run dev

# Тесты
npm test
```

---

## Архитектура

```
┌─────────────────────────────────────────────────┐
│                 Nginx (80/443)                   │
│           SSL + Rate Limiting + Headers          │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│              Node.js Application                 │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Telegram  │  │ REST API │  │   Workers     │  │
│  │ Bot       │  │ (Fastify)│  │   (BullMQ)    │  │
│  │ (grammY)  │  │ 30+ API  │  │   10 queues   │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │         Services Layer                    │    │
│  │  SMTP · IMAP · OAuth · WebAuth           │    │
│  │  Proxy · Dictionary · Matching            │    │
│  │  Pipeline · Audit · Export                │    │
│  └──────────────────────────────────────────┘    │
└──────┬───────────────┬──────────────┬────────────┘
       │               │              │
┌──────▼───────┐ ┌─────▼──────┐ ┌────▼─────┐
│ PostgreSQL   │ │   Redis    │ │ /exports │
│ 18 таблиц    │ │ очереди +  │ │ файлы    │
│ Prisma ORM   │ │ кеш        │ │          │
└──────────────┘ └────────────┘ └──────────┘
```

---

## Все команды бота

### Основные

| Команда | Что делает |
|---------|-----------|
| `/start` | Главное меню со всеми кнопками |
| `/upload` | Загрузить .txt файл с email'ами |
| `/tasks` | Список всех задач с прогрессом |
| `/status 42` | Быстро глянуть статус задачи #42 |
| `/cancel 42` | Отменить задачу #42 |
| `/stats` | Статистика (1ч/24ч/7д/30д/всё время) |
| `/export` | Экспорт email-базы (фильтры + TXT/CSV) |
| `/generator` | Генератор email-масок по шаблонам |

### Security Audit (проверка баз)

| Команда | Что делает |
|---------|-----------|
| `/check_smtp` | SMTP проверка — доставляемость email'ов |
| `/check_web` | OAuth проверка — тестирование паролей через API провайдеров |
| `/validate` | IMAP валидация — полная проверка аккаунтов (inbox, 2FA, security) |
| `/full_audit` | Полный пайплайн: SMTP → OAuth → IMAP (последовательно, каждый этап фильтрует для следующего) |

### Восстановление доступа

| Команда | Что делает |
|---------|-----------|
| `/dictionary` | Менеджер словарей паролей (загрузка TXT, категории, поиск) |
| `/generate_passwords` | Генератор паттернов: имя+фамилия+дата → 60+ вариантов паролей |
| `/recover` | Простое сопоставление email × словарь |
| `/recover_passwords` | Dictionary attack с детальным UI (выбор словарей, прогресс по паролям, стоп) |
| `/full_recover` | Полный pipeline: паттерны → словари → matching → детекция |

### Админка

| Команда | Что делает |
|---------|-----------|
| `/settings` | Настройки системы (лимиты, задержки, пороги) |
| `/logs` | Просмотр логов |
| `/proxy` | Управление прокси-пулом |

---

## Как это работает — подробный flow

### 1. Загрузка базы

Кидаешь боту `.txt` файл. Поддерживаемые форматы строк:
```
email@example.com
email@example.com:password
email@example.com;password
email@example.com|data
email@example.com,data
```

Бот парсит, дедуплицирует, резолвит домены, находит MX-записи. Результат:
- `VALID_FORMAT` — формат ок
- `MX_FOUND` — MX-записи найдены (ящик скорее всего существует)
- `MX_NOT_FOUND` — домен не принимает почту

### 2. Security Audit Pipeline

Жмёшь `/full_audit` и выбираешь задачу. Pipeline запускает 3 этапа:

```
Stage 1: SMTP Check
  └─ verifyMailbox() для каждого email
  └─ Фильтр: только "deliverable" идут дальше
         ↓
Stage 2: Web Auth (OAuth)
  └─ OAuthClient.authenticate() для каждого email:password
  └─ Авто-детект провайдера (Google, Microsoft, Yahoo, etc.)
  └─ Фильтр: только "success" идут дальше
         ↓
Stage 3: IMAP Validate
  └─ IMAPVerifier.tryAuthenticateWithStatus()
  └─ Проверяет INBOX, security headers, body keywords
  └─ Классификация:
     🟢 active_clean — всё чисто
     🔵 active_with_2fa — есть 2FA
     🟡 suspicious_activity — подозрительная активность
     🔒 restricted — ограниченный доступ
     ❌ locked — заблокирован
```

Прогресс обновляется в реальном времени прямо в сообщении бота (auto-push каждые 3 сек).

### 3. Dictionary Attack (восстановление)

Для восстановления доступа к своим забытым аккаунтам:

```
/recover_passwords
  ↓
Выбираешь задачу с email'ами
  ↓
Выбираешь словари (Common 📗 / User-specific 📘 / Leaked 📕)
  └─ Можно загрузить свой .txt прямо в потоке
  ↓
Подтверждение: "500 emails × 5000 passwords = 2.5M комбинаций"
  ↓
Запуск Dictionary Attack
  ↓
Прогресс:
  📧 Email: 5 / 500
  🔑 Password: 245 / 5,000
  ▓▓▓▓░░░░░░ 4.9%
  ✅ Найдено: 3
  ↓
Результаты файлом:
  email,password,access_level,provider
  user@gmail.com,Password123,full_access,Google
  admin@yahoo.com,admin2023!,partial_2fa,Yahoo
```

**Защита от блокировок:**
- Задержка 2 сек между попытками с jitter ±30%
- Лимит 20 попыток на email
- Ротация proxy каждые 5 попыток
- Cooldown 30 сек при rate-limit ответе
- Всё настраивается через `/settings`

### 4. Генератор паттернов

```
/generate_passwords
  → Имя: John
  → Фамилия: Smith
  → Дата рождения: 15.05.1990
  → Никнейм: coolcat

Результат: 87 паролей
  JohnSmith, johnsmith, Smith1990, john1505,
  JSmith90, j0hn$m1th, coolcat123, John1990!, ...
```

Генерирует 60+ шаблонов: комбинации имени, даты, leet speak (a→@, o→0), суффиксы (!,123), никнеймы, телефон.

---

## Database (18 таблиц)

```
Core:
  Users · Tasks · Emails · Domains · Settings · Logs · Exports

Auth Results:
  AuthResult · InvalidCredential · ImapCheckResult

Telegram:
  TelegramSession · TelegramTask · NotificationSetting

Recovery:
  PasswordDictionary · DictionaryPassword
  CredentialMatch · RecoveredCredential

Infrastructure:
  Proxy
```

---

## Workers (BullMQ очереди)

| Очередь | Что делает | Concurrency |
|---------|-----------|-------------|
| `email-validation` | Валидация формата + MX | 3 workers |
| `smtp-verification` | SMTP проверка отдельных email | 3 |
| `smtp-batch` | Batch SMTP из бота | 1 |
| `web-auth-batch` | Batch OAuth из бота | 1 |
| `imap-validate-batch` | Batch IMAP из бота | 1 |
| `security-audit-pipeline` | Полный audit (SMTP→Web→IMAP) | 1 |
| `credential-matching` | Dictionary attack | 1 |
| `recovery-pipeline` | Полный recovery pipeline | 1 |
| `invalid-credentials-cleanup` | Автоочистка (2 AM daily) | 1 |
| `proxy-check` | Проверка здоровья прокси | 1 |

---

## API Endpoints (30+)

```
Health:
  GET  /health                          → DB + Redis status

Auth:
  POST /api/v1/auth/login               → JWT login
  POST /api/v1/auth/refresh              → Refresh token

Tasks:
  POST /api/v1/files/upload              → Upload email file
  GET  /api/v1/tasks                     → List tasks
  GET  /api/v1/results                   → Auth results

Stats & Reports:
  GET  /api/v1/stats/summary             → Statistics
  GET  /api/v1/audit/report?format=json  → Audit report (JSON/TEXT)

Export:
  POST /api/v1/exports                   → Export emails
  POST /api/v1/exports/validated         → Export validated credentials
  GET  /api/v1/exports/:id/download      → Download file

Dictionary:
  POST /api/v1/dictionary/upload         → Upload dictionary
  GET  /api/v1/dictionary                → List dictionaries
  POST /api/v1/dictionary/search         → Search password
  GET  /api/v1/dictionary/stats          → Dictionary stats

Passwords:
  POST /api/v1/passwords/generate        → Generate patterns
  POST /api/v1/passwords/generate-and-save → Generate + save as dict

Matching:
  POST /api/v1/matching/start            → Start dictionary attack
  GET  /api/v1/matching/stats            → Match statistics
  GET  /api/v1/matching/results          → Found matches

Recovered:
  GET  /api/v1/recovered                 → List recovered creds
  GET  /api/v1/recovered/stats           → Stats by access level
  GET  /api/v1/recovered/export          → Export (CSV/TXT)

Cleanup:
  POST /api/v1/invalid-credentials/archive  → Archive invalid
  GET  /api/v1/invalid-credentials/stats    → Archive stats

Admin:
  GET  /api/v1/settings                  → All settings
  PUT  /api/v1/settings                  → Update setting
  GET  /api/v1/logs                      → View logs
  *    /api/v1/proxy/*                   → Proxy management
```

---

## Настройки (через /settings или API)

| Ключ | Дефолт | Описание |
|------|--------|----------|
| `max_file_size` | 20MB | Макс. размер файла |
| `max_rows_per_task` | 100000 | Макс. строк на задачу |
| `daily_task_limit` | 50 | Задач в день |
| `worker_concurrency` | 2 | Параллельность воркеров |
| `error_threshold` | 100 | Порог ошибок |
| `matching_delay_ms` | 2000 | Задержка между попытками |
| `matching_jitter_factor` | 0.3 | Jitter (±30%) |
| `matching_max_attempts_per_email` | 20 | Макс. попыток на email |
| `matching_proxy_rotate_every` | 5 | Ротация proxy |
| `matching_domain_cooldown_ms` | 30000 | Cooldown после rate-limit |
| `invalid_creds_retention_days` | 30 | Дни хранения невалидных |

---

## Docker

### Production

```bash
# Запуск всего стека
docker compose up -d

# Логи приложения
docker compose logs -f app

# Бекап базы
docker compose --profile backup up backup

# Восстановление из бекапа
./scripts/restore.sh backups/backup_20260526.sql.gz

# Стоп
docker compose down
```

### Сервисы в docker-compose

| Сервис | Image | RAM | CPU |
|--------|-------|-----|-----|
| app | node:24-alpine | 512M | 1.0 |
| postgres | postgres:16-alpine | 256M | 0.5 |
| redis | redis:8-alpine | 128M | 0.25 |
| nginx | nginx:alpine | 64M | 0.25 |

### Development

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## Структура проекта

```
src/
├── api/                    # REST API (Fastify)
│   ├── routes/             # 15 route файлов
│   └── middleware/          # auth, role
├── bot/                    # Telegram бот (grammY)
│   ├── commands/           # /start
│   ├── handlers/           # 8 command handlers
│   ├── callbacks/          # 12 callback modules
│   ├── keyboards/          # inline keyboards
│   └── middleware/          # auth, role
├── services/               # Бизнес-логика
│   ├── smtp/               # SMTP client + verifier + resolver
│   ├── imap/               # IMAP verifier + classifier + host-resolver
│   ├── oauth/              # OAuth client + builder + providers
│   ├── web-auth/           # Puppeteer web auth
│   ├── http/               # HTTP client + session store
│   ├── dictionary/         # Parser + manager + pattern-generator
│   ├── matching/           # Engine + controller + detector + recovered
│   ├── pipeline/           # SecurityAuditPipeline + RecoveryPipeline
│   ├── telegram/           # Session + tracker + notifications + progress
│   ├── verification/       # Parallel controller + types
│   ├── auth-results/       # Aggregator + types
│   ├── audit-report/       # Generator + formatter
│   └── invalid-credentials/ # Archiver
├── workers/                # 10 BullMQ workers
├── utils/                  # Logger, randomization, error-mapper
└── config.ts               # ENV configuration

tests/
├── unit/                   # 50+ unit test файлов
└── integration/            # 4 integration test файла

prisma/
├── schema.prisma           # 18 моделей
└── migrations/             # 7 миграций

scripts/
├── init.sh                 # First-time setup
├── docker-entrypoint.sh    # Container entrypoint
├── backup.sh               # PostgreSQL backup
└── restore.sh              # PostgreSQL restore
```

---

## Тесты

```bash
npm test
# 661 tests, 54 files, all passing

# Конкретный файл
npm test tests/unit/pattern-generator.test.ts

# С покрытием (если установлен @vitest/coverage-v8)
npm test -- --coverage
```

---

## Переменные окружения

```env
# Обязательные
BOT_TOKEN=123456:ABC-DEF...         # От @BotFather
ADMIN_IDS=123456789                  # Твой Telegram ID
DATABASE_URL=postgresql://user:pass@localhost:5432/email_panel
REDIS_URL=redis://localhost:6379
JWT_SECRET=random-64-char-string

# Опциональные
API_PORT=3000
API_HOST=0.0.0.0
MAX_FILE_SIZE=20971520
ERROR_THRESHOLD=100
ERROR_RATE_THRESHOLD=20
```

---

## Лицензия

Private. All rights reserved.
