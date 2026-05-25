# Документация для разработчика — Email Panel

> Полное описание архитектуры, всех модулей, функций, flow'ов и как всё тестировать совместно.

---

## Оглавление

1. [Общий обзор проекта](#1-общий-обзор-проекта)
2. [Стек и зависимости](#2-стек-и-зависимости)
3. [Структура проекта](#3-структура-проекта)
4. [База данных — 18 таблиц](#4-база-данных--18-таблиц)
5. [Главный entry point](#5-главный-entry-point)
6. [SMTP сервис — проверка доставляемости](#6-smtp-сервис)
7. [IMAP сервис — аутентификация и анализ](#7-imap-сервис)
8. [OAuth сервис — Web API аутентификация](#8-oauth-сервис)
9. [Verification Controller — параллельная проверка](#9-verification-controller)
10. [Account Status Classifier](#10-account-status-classifier)
11. [Dictionary — менеджер словарей](#11-dictionary--менеджер-словарей)
12. [Pattern Generator — генератор паролей](#12-pattern-generator)
13. [Matching Engine — сопоставление credentials](#13-matching-engine)
14. [Attempt Controller — защита от блокировок](#14-attempt-controller)
15. [Success Detector — детекция доступа](#15-success-detector)
16. [Security Audit Pipeline](#16-security-audit-pipeline)
17. [Recovery Pipeline](#17-recovery-pipeline)
18. [Telegram Bot — команды и callbacks](#18-telegram-bot)
19. [REST API — все endpoints](#19-rest-api)
20. [Workers — BullMQ очереди](#20-workers)
21. [Telegram Services — сессии, трекинг, уведомления](#21-telegram-services)
22. [Общий Data Flow](#22-общий-data-flow)
23. [Как запустить и тестировать](#23-как-запустить-и-тестировать)
24. [Чеклист для совместного тестирования](#24-чеклист-для-совместного-тестирования)

---

## 1. Общий обзор проекта

Платформа для работы с email-базами. Три основных pipeline:

**Pipeline 1 — Валидация базы:**
```
Upload .txt → Parse → MX Check → SMTP Check → Result
```

**Pipeline 2 — Security Audit:**
```
SMTP (deliverable?) → OAuth (password works?) → IMAP (account status?) → Report
```

**Pipeline 3 — Recovery:**
```
Dictionary + Patterns → Matching Engine → Auth Attempts → Success Detection → Results
```

Всё управляется через Telegram-бота или REST API. Задачи обрабатываются асинхронно через BullMQ + Redis.

---

## 2. Стек и зависимости

| Технология | Роль | Файл конфига |
|-----------|------|-------------|
| **Node.js 24** | Runtime | `package.json` |
| **TypeScript** | Язык | `tsconfig.json` |
| **grammY** | Telegram Bot API | `src/bot/index.ts` |
| **Fastify** | REST API сервер | `src/api/index.ts` |
| **Prisma** | ORM для PostgreSQL | `prisma/schema.prisma` |
| **BullMQ** | Очереди задач | `src/services/queue.ts` |
| **Redis (IORedis)** | Кеш + очереди | `src/config.ts` |
| **imap-simple** | IMAP протокол | `src/services/imap/verifier.ts` |
| **puppeteer-extra** | Web Auth (headless browser) | `src/services/web-auth/` |
| **axios** | HTTP клиент | `src/services/http/client.ts` |
| **Vitest** | Тесты | `vitest.config.ts` |
| **Docker Compose** | Деплой | `docker-compose.yml` |

---

## 3. Структура проекта

```
src/
├── index.ts                      # Entry point: DB → API → Workers → Bot
├── config.ts                     # ENV переменные
│
├── api/                          # REST API (Fastify)
│   ├── index.ts                  # Регистрация всех 19 route-модулей
│   ├── middleware/auth.ts        # JWT аутентификация
│   └── routes/                   # 19 файлов route-обработчиков
│       ├── health.ts             # GET /health (DB + Redis check)
│       ├── auth.ts               # POST /auth/login, /auth/refresh
│       ├── tasks.ts              # CRUD задач
│       ├── files.ts              # Upload файлов
│       ├── results.ts            # Auth results
│       ├── stats.ts              # Статистика
│       ├── exports.ts            # Экспорт email
│       ├── validated-exports.ts  # Экспорт validated credentials
│       ├── audit.ts              # Auth result audit
│       ├── audit-report.ts       # GET /audit/report (JSON/TEXT)
│       ├── invalid-credentials.ts # Архивация невалидных
│       ├── dictionary.ts         # CRUD словарей
│       ├── generate-passwords.ts # Генерация паттернов
│       ├── matching.ts           # Credential matching
│       ├── recovered.ts          # Recovered credentials
│       ├── generator.ts          # Email генератор
│       ├── logs.ts               # Логи
│       ├── settings.ts           # Настройки
│       └── proxy.ts              # Прокси
│
├── bot/                          # Telegram бот (grammY)
│   ├── index.ts                  # 21 команда + 19 callback routes + file/text handlers
│   ├── types.ts                  # BotContext, SessionData, WizardState
│   ├── commands/start.ts         # /start welcome
│   ├── keyboards/main-menu.ts    # Inline keyboard (18 кнопок)
│   ├── middleware/               # auth.ts (user lookup), role.ts (requireRole)
│   ├── handlers/                 # 10 command handlers
│   │   ├── upload.ts             # File upload processing
│   │   ├── check-smtp.ts         # /check_smtp
│   │   ├── check-web.ts          # /check_web
│   │   ├── validate.ts           # /validate
│   │   ├── full-audit.ts         # /full_audit
│   │   ├── dictionary.ts         # /dictionary
│   │   ├── generate-passwords.ts # /generate_passwords (wizard)
│   │   ├── recover.ts            # /recover
│   │   ├── recover-passwords.ts  # /recover_passwords
│   │   ├── full-recover.ts       # /full_recover
│   │   └── task-commands.ts      # /status, /cancel
│   └── callbacks/                # 15 callback modules
│       ├── menu.ts               # menu:* routing (18 actions)
│       ├── upload.ts             # upload:run, upload:cancel
│       ├── tasks.ts              # task:detail, pause, resume, cancel
│       ├── smtp-check.ts         # smtp:select/run/progress/cancel
│       ├── web-check.ts          # web:select/run/progress/cancel (per-provider)
│       ├── validate.ts           # validate:select/run/progress/file/report
│       ├── full-audit.ts         # audit:select/run/progress/file/report
│       ├── audit-export.ts       # aexp:task/status/date/format/do
│       ├── dictionary.ts         # dict:list/upload/detail/delete/search
│       ├── generate-passwords.ts # genpw:save/download/cancel
│       ├── recover.ts            # match:task/dict/method/run/results
│       ├── recover-passwords.ts  # rpw:task/dict/upload/confirm/start/progress/stop
│       ├── full-recover.ts       # rpipe:task/dict/pattern/run/progress/results
│       ├── export.ts             # exp:task/status/group/date/format/do
│       ├── stats.ts, logs.ts, settings.ts, proxy.ts, generator.ts
│
├── services/                     # Бизнес-логика
│   ├── db.ts                     # Prisma client singleton
│   ├── queue.ts                  # 10 BullMQ queues
│   ├── audit.ts                  # Fire-and-forget audit logging
│   ├── settings.ts               # Key-value settings + cache (60s TTL)
│   ├── notify.ts                 # Telegram notifications (5 types + shouldNotify)
│   ├── stats.ts                  # Dashboard stats
│   ├── progress.ts               # Progress bar rendering + task formatting
│   ├── exporter.ts               # Email export (TXT/CSV)
│   ├── validated-credentials-exporter.ts  # AuthResult export
│   ├── file-processor.ts         # TXT file parsing → Task + Emails
│   ├── parser.ts                 # Email:password parser
│   ├── domain-groups.ts          # Domain → Provider mapping (100+ domains)
│   │
│   ├── smtp/                     # SMTP verification layer
│   │   ├── client.ts             # TCP/TLS socket client
│   │   ├── verifier.ts           # verifyMailbox() — full SMTP handshake
│   │   ├── resolver.ts           # MX/A/AAAA DNS resolution + cache
│   │   ├── parser.ts             # SMTP response code parser
│   │   ├── proxy.ts              # SOCKS4/5 proxy connection
│   │   └── types.ts
│   │
│   ├── imap/                     # IMAP verification layer
│   │   ├── verifier.ts           # IMAPVerifier class (5 methods: connect → status)
│   │   ├── account-status-classifier.ts  # 5 statuses: clean/2fa/suspicious/restricted/locked
│   │   ├── host-resolver.ts      # Email domain → IMAP host (12 providers)
│   │   ├── batch.ts              # Batch IMAP processing
│   │   ├── pool.ts               # Connection pool (generic-pool)
│   │   └── types.ts
│   │
│   ├── oauth/                    # OAuth/Web API layer
│   │   ├── client.ts             # OAuthClient.authenticate() with retry
│   │   ├── builder.ts            # buildAuthRequest() — 8 providers
│   │   ├── provider-detector.ts  # Email → Provider auto-detection
│   │   ├── providers-loader.ts   # JSON config loading
│   │   ├── providers.json        # Provider endpoints config
│   │   ├── aggregator.ts         # Save OAuth results to AuthResult
│   │   ├── formatters.ts         # Request formatting (JSON/form)
│   │   └── types.ts
│   │
│   ├── web-auth/                 # Puppeteer Web Auth
│   │   ├── verifier.ts           # WebAuthVerifier.testWebAuth()
│   │   ├── browser-manager.ts    # Puppeteer launch + stealth
│   │   ├── page-actions.ts       # Fill forms, click buttons
│   │   ├── result-analyzer.ts    # Detect CAPTCHA, 2FA, success
│   │   ├── mapper.ts             # Map result → AuthStatus
│   │   └── types.ts
│   │
│   ├── http/                     # HTTP client layer
│   │   ├── client.ts             # HttpClient (axios + proxy + retry)
│   │   ├── session-store.ts      # Cookie management (tough-cookie)
│   │   ├── retry-utils.ts        # Exponential backoff + jitter
│   │   └── types.ts
│   │
│   ├── dictionary/               # Password management
│   │   ├── parser.ts             # parsePasswordFile() — dedup + analyze
│   │   ├── manager.ts            # CRUD: create/get/delete/search/stats
│   │   └── pattern-generator.ts  # generatePasswordPatterns() — 60+ templates
│   │
│   ├── matching/                 # Credential matching
│   │   ├── engine.ts             # CredentialMatchingEngine — email × passwords
│   │   ├── attempt-controller.ts # Rate-limit + proxy rotation + cooldown
│   │   ├── success-detector.ts   # Detect access level (full/2fa/token)
│   │   └── recovered-credentials.ts  # Save/export recovered
│   │
│   ├── pipeline/                 # Orchestrators
│   │   ├── security-audit-pipeline.ts  # SMTP → Web → IMAP (sequential)
│   │   └── recovery-pipeline.ts        # Patterns → Merge → Match → Detect
│   │
│   ├── telegram/                 # Telegram-specific services
│   │   ├── session-manager.ts    # Persistent sessions (DB)
│   │   ├── task-tracker.ts       # Task ↔ Chat linking
│   │   ├── notification-settings.ts  # Per-user notification prefs
│   │   └── progress-pusher.ts    # Auto-edit messages (3s throttle)
│   │
│   ├── verification/             # Multi-protocol dispatcher
│   │   ├── controller.ts         # ParallelVerificationController
│   │   └── types.ts              # CredentialInput union, VerificationBatchResult
│   │
│   ├── auth-results/             # Auth result storage
│   │   ├── aggregator.ts         # saveAuthResult, getAuthResults, getStats
│   │   └── types.ts              # AuthStatus, AuthResultRecord
│   │
│   ├── audit-report/             # Report generation
│   │   ├── generator.ts          # generateAuditReport() — Prisma aggregation
│   │   ├── formatter.ts          # formatAuditReportText() — readable tables
│   │   └── types.ts              # AuditReport interface
│   │
│   ├── invalid-credentials/      # Cleanup service
│   │   └── archiver.ts           # archive/restore/stats
│   │
│   └── proxy/, validators/, generator/  # Proxy pool, email validators, email generator
│
├── workers/                      # 11 BullMQ worker files
│   ├── index.ts                  # startWorkers() / stopWorkers()
│   ├── email-worker.ts           # Email validation (format + MX)
│   ├── smtp-worker.ts            # Individual SMTP check
│   ├── smtp-batch-worker.ts      # Batch SMTP from bot
│   ├── web-auth-batch-worker.ts  # Batch OAuth from bot
│   ├── imap-validate-batch-worker.ts  # Batch IMAP from bot
│   ├── pipeline-worker.ts        # SecurityAuditPipeline executor
│   ├── matching-worker.ts        # CredentialMatchingEngine executor
│   ├── recovery-pipeline-worker.ts  # RecoveryPipeline executor
│   ├── proxy-checker.ts          # Proxy health check
│   └── invalid-credentials-cleanup-worker.ts  # Scheduled cleanup (2 AM)
│
└── utils/                        # Утилиты
    ├── logger.ts                 # Console logger
    ├── randomization.ts          # sleepWithJitter, randomUA, etc.
    ├── error-mapper.ts           # Error → AuthStatus mapping
    ├── protection-detector.ts    # CAPTCHA/2FA/rate-limit detection
    ├── fingerprint.ts            # Browser fingerprint randomization
    └── http-response-analyzer/   # HTTP response classification
```

---

## 4. База данных — 18 таблиц

### Core

| Таблица | Ключевые поля | Для чего |
|---------|--------------|---------|
| `users` | telegramId, username, role, isAdmin | Пользователи (создаются автоматически при первом сообщении боту) |
| `tasks` | userId, fileName, status, processedRows, validCount | Задачи обработки файлов |
| `emails` | taskId, email, password, domain, domainGroup, status | Отдельные email-записи в задаче |
| `domains` | domain, group, country, mxStatus | Кеш информации о доменах |
| `settings` | key, value | Глобальные настройки (key-value) |
| `logs` | userId, type, level, message | Аудит-логи |
| `exports` | userId, filters, filePath, status | Записи об экспортах |

### Auth Results

| Таблица | Ключевые поля | Для чего |
|---------|--------------|---------|
| `auth_results` | email, password, protocol, status, accountStatus | Результаты всех auth-проверок |
| `imap_check_results` | email, host, success, errorType | IMAP-специфичные результаты |
| `invalid_credentials` | originalId, email, status, archivedAt | Архив невалидных (cleanup) |

### Telegram

| Таблица | Ключевые поля | Для чего |
|---------|--------------|---------|
| `telegram_sessions` | chatId (unique), userId, sessionData, isActive | Персистентные сессии бота |
| `telegram_tasks` | taskId+chatId (unique), messageId, taskType | Связь задач с чатами (для edit сообщений) |
| `notification_settings` | userId (unique), taskComplete, taskFailed, quietHours | Per-user настройки уведомлений |

### Recovery

| Таблица | Ключевые поля | Для чего |
|---------|--------------|---------|
| `password_dictionaries` | userId, name, category, entryCount | Словари паролей (common/user_specific/leaked) |
| `dictionary_passwords` | dictionaryId+password (unique), length, hasDigits/Special/Upper | Пароли в словарях |
| `credential_matches` | userId+email (unique), password, status, attempts | Результаты matching (found/not_found) |
| `recovered_credentials` | userId+email (unique), password, accessLevel, confidence, has2fa | Успешно восстановленные credentials |

### Infrastructure

| Таблица | Ключевые поля | Для чего |
|---------|--------------|---------|
| `proxies` | host, port, protocol, status, latency, failCount | Пул прокси-серверов |

---

## 5. Главный entry point

**Файл:** `src/index.ts`

```
Порядок запуска:
1. Database connection (Prisma)
2. API server (Fastify на порту 3000)
3. Workers (10 BullMQ workers)
4. Telegram bot (grammY polling)

Graceful shutdown:
  SIGINT/SIGTERM → stopWorkers() → bot.stop() → process.exit()
```

---

## 6. SMTP сервис

**Путь:** `src/services/smtp/`

### Ключевые функции

**`verifyMailbox(email, options?)`** — главная функция SMTP-проверки.

Flow:
```
1. Извлечь домен из email
2. resolveMX(domain) → список MX-серверов (отсортированы по priority)
   └─ Fallback: если нет MX → пробуем A/AAAA записи
3. Для каждого MX-сервера:
   a. SmtpClient.connect(host, 25, proxy?)
   b. EHLO validator.local
   c. STARTTLS (если поддерживается)
   d. MAIL FROM:<noreply@validator.local>
   e. RCPT TO:<email>
      └─ 250/251 → "deliverable"
      └─ 550/551/552/553 → "undeliverable"
      └─ 450/451/452 → "risky"
      └─ 421 → try next MX
   f. RSET → QUIT → close
4. Вернуть: { status, mxHost, smtpCode, smtpMessage, responseTime }
```

**SmtpClient** — низкоуровневый TCP/TLS клиент:
- `connect(host, port, proxy?)` — TCP или SOCKS proxy
- `sendCommand(cmd)` — отправить SMTP команду, дождаться ответа
- `startTls(host)` — апгрейд до TLS
- `close()` — QUIT + destroy socket

**Proxy support:** SOCKS4/SOCKS5 через библиотеку `socks`.

---

## 7. IMAP сервис

**Путь:** `src/services/imap/`

### IMAPVerifier — основной класс

5 уровней проверки (каждый следующий включает предыдущий):

```
connect()                    → базовое подключение
tryAuthenticate()            → аутентификация + классификация ошибки
tryAuthenticateWithInbox()   → + проверка INBOX (unseen/total count)
tryAuthenticateWithSecurity() → + security headers + body keywords
tryAuthenticateWithStatus()   → + account status classification
```

### Account Status Classifier

**`classifyAccountStatus(input, options?)`**

Приоритет правил (if/else chain):
```
1. Auth failure           → "locked"
2. INBOX restricted       → "restricted"
3. Suspicious keywords    → "suspicious_activity"  (body: "unusual sign-in", etc.)
4. Security headers       → "active_with_2fa"      (X-Google-2FA, X-Microsoft-Auth-)
5. No warnings           → "active_clean"
```

Overloads:
- Simple: `classifyAccountStatus(input)` → `{ status }`
- Detailed: `classifyAccountStatus(input, { includeReason: true })` → `{ status, reason, matchedRule, factors }`

### Host Resolver

**`getImapConfig(email)`** — по домену email'а возвращает IMAP-хост:

```
gmail.com         → imap.gmail.com:993
outlook.com       → outlook.office365.com:993
yahoo.com         → imap.mail.yahoo.com:993
icloud.com        → imap.mail.me.com:993
... (12 провайдеров)
```

---

## 8. OAuth сервис

**Путь:** `src/services/oauth/`

### OAuthClient

**`authenticate(provider, email, password, options?, proxy?)`**

Flow:
```
1. buildAuthRequest(provider, email, password)
   └─ Если provider === null → auto-detect по домену
   └─ Формирует URL + headers + body для token endpoint
2. HTTP POST к token endpoint (с retry: 5 попыток, 1s base delay)
3. Парсинг ответа:
   └─ access_token присутствует → success
   └─ error: "invalid_grant" → auth_failed
   └─ error: "account_locked" → locked
```

### Поддерживаемые провайдеры (8):
Google, Microsoft, Yahoo, MailRu, Apple, ProtonMail, Zoho, AOL

### Provider Detection

**`detectProviderFromEmail(email)`** — email.split("@")[1] → getDomainGroup() → OAuthProvider

`getDomainGroup()` маппит 100+ доменов:
```
gmail.com, googlemail.com → "Google"
outlook.com, hotmail.com, live.com → "Microsoft"
yahoo.com, ymail.com → "Yahoo"
gmx.de, web.de → "German"
... etc
```

---

## 9. Verification Controller

**Файл:** `src/services/verification/controller.ts`

### ParallelVerificationController (extends EventEmitter)

**`verifyBatch(credentials, options?)`** — универсальный dispatcher.

```typescript
type CredentialInput =
  | { protocol: "IMAP", email, password, host, port, tls }
  | { protocol: "POP3", email, password, host, port, tls }
  | { protocol: "SMTP", email }
  | { protocol: "WEB_AUTH", email, password, url, selectors? }
  | { protocol: "OAUTH", email, password, provider }
```

Flow:
```
1. Для каждого credential → verifyOne() → dispatch по protocol
2. Concurrency control через p-limit (default: 5)
3. Jitter delays между запросами (1-5 sec)
4. Emit events: start, progress, result, error, complete
5. Сохранение в AuthResult (если saveResults: true)
6. Статистика: byProtocol, byStatus, averageResponseTime
```

---

## 10. Account Status Classifier

**Файл:** `src/services/imap/account-status-classifier.ts`

Чистая функция без side-effects. 5 статусов, priority chain.

```
Input:
  - authResult: { success, errorType }
  - inboxCheck?: { status, unseenCount, totalCount, securityCheck? }

Output:
  - status: "active_clean" | "active_with_2fa" | "suspicious_activity" | "restricted" | "locked"
  - reason: "Authentication failed: auth_failed"
  - matchedRule: "auth_failed"
  - factors: { authSuccess, inboxAccessible, hasSecurityHeaders, hasSuspiciousKeywords }
```

---

## 11. Dictionary — менеджер словарей

**Путь:** `src/services/dictionary/`

### Parser

**`parsePasswordFile(content)`** — парсит TXT файл с паролями.

```
1. Split по \n, trim каждую строку
2. Skip пустых строк
3. Отклонить > 128 символов
4. Dedup через Set<string>
5. Для каждого: analyzePassword() → { length, hasDigits, hasSpecial, hasUpper }
6. Return: { entries[], totalLines, validLines, emptyLines, duplicateCount }
```

### Manager

**`createDictionary(userId, name, category, passwords, source?)`**

```
1. Создать PasswordDictionary запись
2. Batch insert passwords (1000/batch, skipDuplicates: true)
3. Обновить entryCount
```

Категории: `common`, `user_specific`, `leaked`

Другие функции: `getDictionaries()`, `getDictionaryPasswords()`, `deleteDictionary()`, `searchPassword()`, `getDictionaryStats()`

---

## 12. Pattern Generator

**Файл:** `src/services/dictionary/pattern-generator.ts`

**`generatePasswordPatterns(input)`**

Input: `{ firstName, lastName, birthDate?, nickname?, petName?, phone?, customWords? }`

Генерирует 60+ паттернов по категориям:

```
Base combos:     JohnSmith, johnsmith, SmithJohn, john.smith, john_smith
With suffixes:   John123, John1234, john!, John@, Smith#
Date combos:     John1990, john90, John1505, john0515, JSmith90
Initials:        JSmith1990, JS1990, jsmith90
Leet speak:      j0hn, $m1th, j0hn1990 (a→@, e→3, i→1, o→0, s→$)
Custom words:    coolcat123, Coolcat1990, buddy!
Phone:           John7890, john567890
```

Dedup через Set, min 4 символа.

---

## 13. Matching Engine

**Файл:** `src/services/matching/engine.ts`

### CredentialMatchingEngine

**`run(options)`** — основной метод.

```typescript
options: {
  taskId?: number        // email source (задача с MX_FOUND)
  emails?: string[]      // или прямой список
  dictionaryIds: number[] // какие словари использовать
  method?: "imap" | "oauth"
  maxAttemptsPerEmail?: number
}
```

Flow для каждого email:
```
1. Проверить: уже найден? (CredentialMatch status=found) → skip
2. Загрузить tried passwords из Redis cache (match-tried:{userId}:{email})
3. Отфильтровать untried passwords
4. Для каждого пароля:
   a. controller.beforeAttempt(email) → delay + proxy rotation
   b. tryAuth(email, password, method) → IMAP или OAuth
   c. controller.afterAttempt(email, rateLimited)
   d. Сохранить в Redis cache (SET, TTL 7 дней)
   e. Если success:
      - detector.detect(email, password, method) → access level
      - saveRecoveredCredential() → PostgreSQL
      - Upsert CredentialMatch(status: "found")
      - BREAK (остановиться на первом успехе)
5. Если все пароли failed → CredentialMatch(status: "not_found")
```

### Progress tracking

```typescript
progress: {
  totalEmails: number
  processed: number
  found: number
  notFound: number
  errors: number
  currentEmail?: string
  currentPasswordIndex?: number  // какой пароль сейчас пробуем
  totalPasswords?: number        // всего паролей в словаре
}
```

---

## 14. Attempt Controller

**Файл:** `src/services/matching/attempt-controller.ts`

### AuthAttemptController

Защита от anti-bruteforce систем.

```typescript
config: {
  delayMs: 2000           // base delay между попытками
  jitterFactor: 0.3       // ±30% случайная вариация
  maxAttemptsPerEmail: 20  // лимит попыток на 1 email
  proxyRotateEvery: 5     // новый proxy каждые N попыток
  domainCooldownMs: 30000 // 30s пауза после rate-limit
  enabled: true           // kill switch
}
```

**`beforeAttempt(email)`** — вызывается ПЕРЕД каждой попыткой:
```
1. Check per-email limit → false если превышен
2. Check domain cooldown → await если в cooldown
3. Apply delay + jitter → sleep(2000 ± 600ms)
4. Select proxy (round-robin rotation)
5. Return { allowed: true, proxy }
```

**`afterAttempt(email, rateLimited)`** — вызывается ПОСЛЕ:
```
1. Increment attempt counter
2. Если rateLimited → set domain cooldown (30s)
```

---

## 15. Success Detector

**Файл:** `src/services/matching/success-detector.ts`

### AuthSuccessDetector

3 уровня доступа:

| Level | Confidence | Как определяется |
|-------|-----------|-----------------|
| `full_access` | 100% | IMAP login + INBOX accessible + message count |
| `partial_2fa` | 70-80% | Auth success + 2FA headers/challenge |
| `token_only` | 90% | OAuth token получен (mailbox не проверен) |

**`detectImap(email, password, host, port)`**:
```
1. tryAuthenticateWithStatus()
2. Если accountStatus === "active_with_2fa" → partial_2fa (80%)
3. Если inboxCheck.status === "fully_accessible" → full_access (100%)
4. Иначе → full_access (90%, без inbox)
```

**`detectOAuth(email, password)`**:
```
1. OAuthClient.authenticate()
2. Если success → token_only (90%)
3. Если error includes "2fa" → partial_2fa (70%)
```

---

## 16. Security Audit Pipeline

**Файл:** `src/services/pipeline/security-audit-pipeline.ts`

### SecurityAuditPipeline

Последовательный 3-stage pipeline. Каждый stage фильтрует данные для следующего.

```
Stage 1: SMTP
  Input: все email'ы из задачи
  Process: verifyMailbox() для каждого
  Output: только deliverable → передаются в Stage 2
  Progress: pushProgress() каждые 10 emails

Stage 2: Web Auth
  Input: deliverable email'ы (с паролями)
  Process: OAuthClient.authenticate() для каждого
  Output: только successful → передаются в Stage 3
  Progress: pushStageComplete() + per-provider tracking

Stage 3: IMAP Validate
  Input: authenticated email'ы
  Process: IMAPVerifier.tryAuthenticateWithStatus()
  Output: classification (active_clean/2fa/suspicious/restricted/locked)
  Progress: pushProgress() каждые 5 emails
```

Result сохраняется в Redis:
- `pipeline-progress:{taskId}` — per-stage status
- `pipeline-result:{taskId}` — CSV с validated credentials
- `pipeline-report:{taskId}` — TEXT отчёт

---

## 17. Recovery Pipeline

**Файл:** `src/services/pipeline/recovery-pipeline.ts`

### RecoveryPipeline

4-stage pipeline для восстановления доступа.

```
Stage 1: Pattern Generation (optional)
  Input: PatternInput (firstName, lastName, birthDate)
  Process: generatePasswordPatterns() → save as temp dictionary
  Output: N generated passwords

Stage 2: Password Merge
  Input: selected dictionary IDs + generated patterns
  Process: count all passwords, deduplicate
  Output: total password count

Stage 3: Credential Matching
  Input: emails + all passwords
  Process: CredentialMatchingEngine.run()
    └─ AuthAttemptController (throttle)
    └─ AuthSuccessDetector (detection)
    └─ RecoveredCredential (persistence)
  Output: found/not_found counts

Stage 4: Results Aggregation
  Input: query RecoveredCredential
  Output: stats by access level (full/2fa/token)
```

---

## 18. Telegram Bot

**Файл:** `src/bot/index.ts`

### Middleware stack

```
1. Session (grammY) — in-memory state
2. authMiddleware — User lookup/create by telegramId
3. requireRole() — role-based access control
```

### Роли

```
ADMIN   — полный доступ
MANAGER — все кроме settings/logs
VIEWER  — только tasks/stats
```

### 21 зарегистрированная команда

Без role protection: `/start`, `/panel`, `/upload`, `/tasks`, `/stats`, `/export`, `/generator`, `/status`, `/cancel`, `/dictionary`, `/generate_passwords`

С requireRole("ADMIN"): `/logs`, `/settings`, `/proxy`

С requireRole("ADMIN", "MANAGER"): `/check_smtp`, `/check_web`, `/validate`, `/full_audit`, `/recover`, `/full_recover`, `/recover_passwords`

### 19 callback prefix routes

```
menu: → upload: → task: → gen: → stat: → exp: → log: → set: → prx:
smtp: → web: → validate: → audit: → aexp: → dict: → genpw: → match:
rpipe: → rpw:
```

### File upload dispatch (order matters!)

```
1. rpw file upload? (dictionary attack in-flow)
2. dictionary file upload? (словарь)
3. proxy file upload? (прокси-лист)
4. email file upload (default)
```

### Text input dispatch (order matters!)

```
1. recovery pipeline wizard? (имя/фамилия)
2. password wizard? (generate_passwords steps)
3. dictionary search? (поиск пароля)
4. settings input? (изменение настройки)
5. generator wizard? (email generator steps)
```

---

## 19. REST API

**Файл:** `src/api/index.ts`

Fastify с middleware:
- CORS
- Helmet (security headers)
- Rate limit (100 req/min)
- JWT auth (`request.user.id`, `request.user.isAdmin`)
- Multipart (50MB limit)

### Health check

```
GET /health → {
  status: "ok" | "degraded",
  uptime: 3600,
  timestamp: "2026-05-26T...",
  services: {
    database: "connected" | "disconnected",
    redis: "connected" | "disconnected"
  }
}
```

---

## 20. Workers

**Файл:** `src/services/queue.ts` — определения очередей

### Все очереди

| Queue name | JobData | Concurrency | Retry |
|-----------|---------|------------|-------|
| `email-validation` | `{ taskId }` | — | 3 attempts, exp backoff |
| `smtp-verification` | `{ email, mxServer }` | 3 | 2 attempts |
| `smtp-batch` | `{ taskId, chatId? }` | 1 | 2 attempts |
| `web-auth-batch` | `{ taskId, chatId? }` | 1 | 2 attempts |
| `imap-validate-batch` | `{ taskId, chatId?, filter? }` | 1 | 2 attempts |
| `security-audit-pipeline` | `{ taskId, chatId? }` | 1 | 1 attempt |
| `credential-matching` | `{ userId, taskId?, emails?, dictionaryIds, method?, chatId? }` | 1 | 1 attempt |
| `recovery-pipeline` | `{ userId, taskId?, dictionaryIds, patternInput?, method?, chatId? }` | 1 | 1 attempt |
| `invalid-credentials-cleanup` | `{ manual?, userId? }` | 1 | 2 attempts |
| `proxy-check` | `{ mode }` | 1 | 1 attempt |

Все workers регистрируются в `src/workers/index.ts`:
- `startWorkers()` — вызывается при старте приложения
- `stopWorkers()` — graceful shutdown

---

## 21. Telegram Services

**Путь:** `src/services/telegram/`

### ProgressPusher

Auto-edit Telegram сообщений с прогрессом.

```typescript
const pusher = new ProgressPusher(taskId, "smtp");
await pusher.init();                          // Load chatId+messageId from DB

await pusher.pushProgress(text);              // Edit message (throttle 3s)
await pusher.pushStageComplete(name, summary); // Send new message
await pusher.pushFinalResult(text, kb);       // Edit final with keyboard
await pusher.pushCancelled();                 // Edit "Отменено"
```

### Notification Settings

```typescript
shouldNotify(userId, "task_complete")  // true/false
// Проверяет:
// 1. Включён ли тип уведомления
// 2. Не в quiet hours ли сейчас
```

5 типов: `task_complete`, `task_failed`, `error_threshold`, `export_ready`, `security_alerts`

### Task Tracker

```typescript
trackTask(taskId, chatId, "smtp_check", messageId)
// Связывает задачу с чатом + сохраняет messageId для auto-edit
```

---

## 22. Общий Data Flow

### Upload → Validate → Export

```
Пользователь → /upload → .txt файл
    ↓
file-processor.ts: parse → Task(CREATED) + Email[] (VALID_FORMAT)
    ↓
upload:run callback → emailQueue.add({ taskId })
    ↓
email-worker: validate format → check domain → resolve MX
    ↓
Email.status = MX_FOUND | MX_NOT_FOUND | INVALID_FORMAT
    ↓
/export → generateExport() → CSV/TXT файл в чат
```

### Security Audit

```
/full_audit → выбор задачи
    ↓
pipelineQueue.add({ taskId })
    ↓
SecurityAuditPipeline.run():
    Stage 1: verifyMailbox() → deliverable only
    Stage 2: OAuthClient.authenticate() → successful only
    Stage 3: IMAPVerifier.tryAuthenticateWithStatus() → classify
    ↓
ProgressPusher: auto-edit message (3s throttle)
    ↓
Result: CSV + TEXT report в Redis → файл в чат
```

### Dictionary Attack

```
/recover_passwords → задача → словари → [upload свой .txt]
    ↓
matchingQueue.add({ userId, taskId, dictionaryIds })
    ↓
CredentialMatchingEngine.run():
    Load emails + passwords
    For each email:
        Redis cache check (skip tried)
        AuthAttemptController.beforeAttempt() → delay+jitter+proxy
        tryAuth(email, password, "imap") → IMAPVerifier
        Controller.afterAttempt()
        If success:
            AuthSuccessDetector.detect() → access level
            saveRecoveredCredential() → DB
            BREAK
    ↓
ProgressPusher: auto-push (5s interval)
    ↓
exportRecoveredCredentials() → CSV файл в чат
```

### Full Recovery Pipeline

```
/full_recover → задача → словари → паттерны (optional)
    ↓
recoveryPipelineQueue.add({ userId, taskId, dictionaryIds, patternInput })
    ↓
RecoveryPipeline.run():
    Stage 1: generatePasswordPatterns() → temp dictionary
    Stage 2: Merge all dictionaries + patterns → total password count
    Stage 3: CredentialMatchingEngine.run() → matching + detection
    Stage 4: getRecoveryStats() → aggregate by access level
    ↓
Report: found N / tested M (fullAccess: X, 2fa: Y, token: Z)
```

---

## 23. Как запустить и тестировать

### Запуск

```bash
# 1. Клонировать
git clone https://github.com/redzov/email-panel.git
cd email-panel

# 2. Зависимости
npm install

# 3. Конфиг
cp .env.example .env
# Заполнить: BOT_TOKEN, DATABASE_URL, REDIS_URL, JWT_SECRET

# 4. База данных
npx prisma migrate dev

# 5. Dev-режим
npm run dev

# 6. Тесты
npm test
```

### Тесты

```bash
# Все тесты (661)
npm test

# Конкретный файл
npm test tests/unit/pattern-generator.test.ts

# Конкретная группа
npm test tests/unit/
npm test tests/integration/

# С фильтром по имени
npm test -- -t "parsePasswordFile"
```

### TypeScript проверка

```bash
npx tsc --noEmit
# Должно быть 0 errors
```

---

## 24. Чеклист для совместного тестирования

### Уровень 1: Unit-тесты (автоматические)

- [ ] `npm test` — все 661 тест проходят
- [ ] `npx tsc --noEmit` — 0 ошибок компиляции

### Уровень 2: Компоненты (ручное)

- [ ] **Parser:** Создать файл `test.txt` с 10 email:password парами, проверить parseEmailFile()
- [ ] **Dictionary parser:** Создать файл с 10 паролями, проверить parsePasswordFile()
- [ ] **Pattern generator:** Вызвать generatePasswordPatterns({ firstName: "John", lastName: "Smith", birthDate: "1990-05-15" }), проверить что > 50 паттернов
- [ ] **Domain groups:** Проверить getDomainGroup("gmail.com") === "Google"
- [ ] **IMAP host resolver:** Проверить getImapConfig("test@gmail.com") → imap.gmail.com:993
- [ ] **Account classifier:** Проверить classifyAccountStatus({ authResult: { success: true, errorType: null } }) → "active_clean"
- [ ] **Attempt controller:** Создать controller с maxAttempts=3, проверить что 4-й attempt blocked

### Уровень 3: API (через curl/Postman)

- [ ] `GET /health` → status: "ok", services.database: "connected"
- [ ] `POST /api/v1/auth/login` → получить JWT token
- [ ] `POST /api/v1/dictionary/upload` → загрузить словарь
- [ ] `GET /api/v1/dictionary` → список словарей
- [ ] `POST /api/v1/passwords/generate` → сгенерировать паттерны
- [ ] `GET /api/v1/audit/report?format=text` → текстовый отчёт

### Уровень 4: Telegram бот (ручное)

- [ ] `/start` → главное меню с кнопками
- [ ] Отправить .txt файл → бот парсит, показывает статистику
- [ ] `/tasks` → список задач с пагинацией
- [ ] `/status 1` → детальный статус задачи
- [ ] `/dictionary` → менеджер словарей
- [ ] `/generate_passwords` → wizard (4 шага)
- [ ] `/check_smtp` → выбрать задачу → запустить → прогресс
- [ ] `/full_audit` → полный pipeline (3 stages)
- [ ] `/recover_passwords` → dictionary attack с выбором словарей
- [ ] `/cancel 1` → отмена задачи

### Уровень 5: Docker (production)

- [ ] `./scripts/init.sh` → автоматическая настройка
- [ ] `docker compose up -d` → все 4 сервиса running
- [ ] `docker compose logs app` → нет ошибок
- [ ] `curl localhost:3000/health` → ok
- [ ] Telegram бот отвечает на /start
- [ ] `docker compose --profile backup up backup` → бекап создан

### Уровень 6: End-to-End flow

- [ ] Upload .txt (10 emails) → Task created
- [ ] Запустить validation → MX_FOUND emails
- [ ] `/check_smtp` → SMTP check → deliverable count
- [ ] `/dictionary` → загрузить словарь (5 паролей)
- [ ] `/generate_passwords` → сгенерировать + сохранить
- [ ] `/recover_passwords` → выбрать словари → запустить
- [ ] Прогресс обновляется автоматически
- [ ] Results → CSV файл в чат
- [ ] `/full_audit` → полный pipeline → отчёт

---

## Полезные ссылки

| Что | Где |
|----|-----|
| Prisma schema | `prisma/schema.prisma` |
| ENV шаблон | `.env.example` |
| Bot commands | `src/bot/index.ts` (строки 60-120) |
| All queues | `src/services/queue.ts` |
| All API routes | `src/api/index.ts` |
| Main menu keyboard | `src/bot/keyboards/main-menu.ts` |
| Domain → Provider mapping | `src/services/domain-groups.ts` |
| Settings defaults | `src/services/settings.ts` |
