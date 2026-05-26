# Email Panel — Генерация email + Подбор паролей + Security Audit

> Полноценная платформа: генерируешь возможные email-адреса человека → проверяешь существуют ли они → подбираешь пароли из словарей (67 миллионов паролей) → получаешь рабочие пары email:password. Всё через Telegram-бота с кнопками.

---

## Что это делает — простым языком

Представь: у тебя есть имя и фамилия человека. Бот:

1. **Генерирует email'ы** — ivan.petrov@gmail.com, ipetrov@outlook.com, ivanpetrov@gmx.de... (36+ вариантов)
2. **Проверяет что ящик существует** — стучится по SMTP к серверу, спрашивает "есть такой?"
3. **Подбирает пароль** — берёт словарь из 67 миллионов паролей и пробует каждый
4. **Находит рабочие пары** — email:password которые реально работают
5. **Отправляет результат** — CSV файл прямо в Telegram

### Три способа работы:

**Способ A — Генерация + подбор (с нуля):**
```
Имя "Ivan Petrov" → генерация 36 email'ов → SMTP проверка → 
→ генерация паролей (Ivan1990, IvanPetrov!, ivan.petrov) → 
→ подбор через IMAP → найдена пара → CSV файл
```

**Способ B — Combo list (есть email:password):**
```
Файл с 10,000 пар email:password → импорт → 
→ credential stuffing (15 параллельных workers) → 
→ проверяет каждую пару через IMAP/OAuth → 
→ рабочие пары → CSV файл
```

**Способ C — Полный pipeline (всё вместе):**
```
SMTP (жив ли ящик?) → OAuth (работает пароль через API?) → 
→ IMAP (можно залогиниться?) → классификация (чистый/2FA/locked) →
→ экспорт рабочих аккаунтов
```

---

## Стек

```
TypeScript + Node.js 24
grammY — Telegram Bot API
Fastify — REST API (30+ endpoints)
Prisma + PostgreSQL 16 — 19 таблиц
BullMQ + Redis 8 — 12 workers (15 concurrent stuffing)
Docker Compose — деплой одной командой
67M+ паролей — CrackStation, SecLists, RockYou
```

---

## Быстрый старт

```bash
git clone https://github.com/redzov/email-panel.git
cd email-panel

# Автоматическая настройка
chmod +x scripts/init.sh && ./scripts/init.sh

# Токен бота
nano .env  # → BOT_TOKEN=... ADMIN_IDS=...

# Перезапуск
docker compose restart app
```

**Локально (разработка):**
```bash
npm install
cp .env.example .env  # заполнить BOT_TOKEN, DATABASE_URL, REDIS_URL
npx prisma migrate dev
npm run dev
```

---

## Как пользоваться ботом

### Главное меню (/start)

```
[📂 Загрузка]      [🔒 Security]
[🔑 Recovery]      [📊 Аналитика]
[📥 Import/Export]  [⚙️ Настройки]
[📖 Инструкция]
```

Каждая кнопка → подменю с конкретными функциями → кнопка "◀ Назад".

---

## Все функции — подробно

### 📂 Загрузка — работа с email-базами

| Кнопка | Что делает |
|--------|-----------|
| **Загрузить базу** | Кидаешь .txt файл → бот парсит email'ы, считает валидные/невалидные, резолвит MX-записи |
| **Мои задачи** | Список всех задач с прогресс-баром и статусом |
| **SMTP Check** | Проверяет: существует ли ящик? Стучится к MX-серверу, делает RCPT TO. Результат: deliverable/undeliverable |
| **IMAP Validate** | Пробует залогиниться с паролем через IMAP. Определяет: аккаунт чистый, с 2FA, заблокирован |

**Поддерживаемые форматы файлов:**
```
email@example.com
email@example.com:password
email@example.com;password
email@example.com|data
```

### 🔒 Security — проверка аккаунтов

| Кнопка | Что делает |
|--------|-----------|
| **Web Auth (OAuth)** | Проверяет пароль через OAuth API провайдера (Google, Microsoft, Yahoo, 8 провайдеров). Показывает прогресс по каждому провайдеру отдельно |
| **Full Audit Pipeline** | Запускает 3 этапа ПОСЛЕДОВАТЕЛЬНО: SMTP → OAuth → IMAP. Каждый этап фильтрует данные для следующего. Из 1000 email'ов → 400 deliverable → 200 auth success → 150 чистых аккаунтов |
| **Audit Export** | Экспорт результатов проверок с фильтрами: по статусу (active_clean, 2FA, locked), по дате, формат TXT/CSV |
| **Breach Search** | Поиск email в базах утечек (DeHashed API). Показывает утёкшие пароли если есть |

### 🔑 Recovery — подбор паролей

Это самая мощная секция. Несколько способов подбора:

| Кнопка | Что делает | Когда использовать |
|--------|-----------|-------------------|
| **Словари** | Менеджер словарей паролей. Загрузи свой .txt или используй встроенные 67M | Подготовка к подбору |
| **Паттерны** | Генератор персональных паролей. Вводишь имя+фамилию+дату → получаешь 140+ вариантов (Ivan1990, IvanPetrov!, 1v@n) | Когда знаешь данные человека |
| **🎯 Tiered Recovery** | 6-уровневый подбор: Top100 → Маски → 10K → 100K → RockYou → Custom. Каждый уровень — больше паролей | Умный автоматический подбор |
| **Dict Attack** | Классический dictionary attack. Выбираешь задачу + словари + toggle мутации → запуск | Подбор с конкретным словарём |
| **Full Recovery** | Полный pipeline: генерация паттернов → merge со словарями → matching → детекция | Когда нужен максимальный результат |
| **Stuffing** | Credential stuffing — проверка готовых пар email:password. 15 параллельных workers | Когда есть combo list |
| **Import Combo** | Импорт combo list (email:password файл) для stuffing | Загрузка данных для stuffing |

#### Как работает подбор пароля (Dict Attack):

```
1. Выбираешь задачу с email'ами
2. Выбираешь словари (toggle кнопками):
   [☑️ 📗 common-passwords (50K)]
   [☑️ 📕 rockyou-75 (59K)]
   [☐ 📘 my-custom-dict (1K)]
3. Toggle мутации: [🧬 Мутации: ВКЛ]
   (password → Password1!, p@ssword, password2024)
4. Подтверждение:
   📧 100 email × 🔑 50,000 паролей = 5M комбинаций
5. Запуск → прогресс в реальном времени
6. Результат → CSV файл в чат
```

#### Tiered Recovery — 6 уровней:

```
Tier 1: Top 100 паролей           — 5 секунд    (123456, password, qwerty)
Tier 2: Персональные маски         — 7 минут     (Ivan1990, IvanPetrov!)
Tier 3: SecLists 10K               — 2.8 часа    (10,000 самых популярных)
Tier 4: SecLists 100K (NCSC)       — 28 часов    (UK гос. список)
Tier 5: RockYou 75K                — 16 часов    (реальная утечка)
Tier 6: Custom словарь             — зависит     (свой файл)
```

### 📊 Аналитика — статистика и отчёты

| Кнопка | Что делает |
|--------|-----------|
| **Статистика** | Статы за период (1ч/24ч/7д/30д): задачи, email'ы, ошибки, домены |
| **Dashboard** | Real-time панель: uptime, workers active, proxies alive, combos pending, recovered count |
| **Audit Report** | Детальный отчёт: total tested, success rate по провайдерам, 2FA rate, avg response time |

### 📥 Import / Export

| Кнопка | Что делает |
|--------|-----------|
| **Экспорт email** | Экспорт email-базы с фильтрами (статус, домен, дата). Форматы: TXT, CSV |
| **Audit Export** | Экспорт результатов проверок (active_clean, 2FA, locked). Фильтр по account status |
| **Генератор email** | Wizard: вводишь имя + страну + домены → получаешь 36+ email-адресов |
| **📦 Словари SecLists** | Скачать словари из SecLists (GitHub). Показывает: скачан/нет, размер, количество. Кнопка "Скачать все" |
| **Import Combo** | Импорт combo list (email:password). Поддержка форматов: `:` `;` `\|` разделители |

### ⚙️ Настройки (Admin)

| Кнопка | Что делает |
|--------|-----------|
| **Настройки** | Лимиты файлов, задач, worker concurrency, error threshold |
| **Proxy** | Управление прокси-пулом. Upload файл, проверка, очистка мёртвых. SOCKS5/SOCKS4/HTTP |
| **Логи** | Просмотр аудит-логов (errors/warnings/all) |
| **Уведомления** | Toggle 5 типов уведомлений + quiet hours (23:00-07:00) |
| **🗄 Архив** | Архивация невалидных credentials (auth_failed старше 30 дней). Dry-run, stats, restore |

---

## Словари паролей — 67 миллионов

| Словарь | Паролей | Откуда |
|---------|---------|--------|
| CrackStation Human-Only | **63,941,069** | Все крупные утечки (LinkedIn, Adobe, MySpace) |
| BT4 Passwords | 1,652,901 | Коллекция реальных паролей |
| Most Used 1M | 999,997 | Top 1M самых используемых |
| Probable Top 304K | 303,872 | Отсортированы по частоте |
| SecLists 100K NCSC | 99,839 | UK National Cyber Security Centre |
| RockYou 75K | 59,184 | Утечка RockYou |
| + Мутации | ~2,000 | Leet speak, season+year, keyboard walks |
| + Персональные маски | ~140/чел | Генерируются из имени/фамилии/даты |
| **Итого** | **67M+** | |

Словари скачиваются из SecLists (GitHub) прямо через бота: 📥 Import/Export → 📦 Словари SecLists.

---

## Прокси и скорость

### Поддерживаемые протоколы:
- **SOCKS5** — для IMAP подбора (основной)
- **SOCKS4** — альтернатива
- **HTTP/HTTPS** — для OAuth проверок

### Скорость:

| Без прокси | С 15 прокси |
|-----------|------------|
| ~500 checks/час | ~15,000 checks/час |
| 1 IP = быстрый бан | Round-robin rotation |
| Delay 3 сек | Delay 500ms |

### Защита от блокировок:
- Задержка между попытками (настраивается: 500ms — 3s)
- Jitter ±30% (непредсказуемые интервалы)
- Per-email лимит (max 20 попыток)
- Proxy rotation каждые 5 попыток
- Domain cooldown 30 сек при rate-limit

---

## Credential Stuffing

Когда есть готовый combo list (email:password пары):

```
1. /import_combo → кидаешь .txt файл
   Формат: email:password (или ; | разделители)
   
2. /stuff → Start Stuffing
   15 параллельных workers
   Каждый с отдельным proxy
   500ms между попытками

3. Результат:
   ✅ Success: 389 / 4,521 (8.6%)
   📥 Скачать CSV
```

---

## Генерация email-адресов

13 шаблонов × N доменов = десятки вариантов:

| Шаблон | Пример |
|--------|--------|
| name.surname | ivan.petrov@gmail.com |
| n+surname | ipetrov@gmail.com |
| name+YY | ivan90@gmail.com |
| surname.name | petrov.ivan@gmail.com |
| name.city | ivan.berlin@gmail.com |
| name.sur+YY | ivan.petrov90@gmail.com |
| n+sur+YY | ipetrov90@gmail.com |
| name_surname | ivan_petrov@gmail.com |
| namesurname | ivanpetrov@gmail.com |
| surname.name+YY | petrov.ivan90@gmail.com |
| name-surname | ivan-petrov@gmail.com |
| surname+n | petrovI@gmail.com |

**Как запустить:** 📥 Import/Export → Генератор email → wizard (имя, страна, домены, шаблоны, количество)

---

## Генерация паролей (паттерны)

Вводишь данные человека → получаешь 140+ вариантов паролей:

```
Input: firstName=Ivan, lastName=Petrov, birthDate=1990-05-15, city=Berlin

Результат:
  IvanPetrov, ivanpetrov, PetrovIvan          — комбинации имени
  Ivan1990, ivan90, Petrov1990                — с годом
  ivan1505, Ivan0515                          — с датой рождения
  IPetrov1990, IP1990, ipetrov90              — с инициалами
  Ivan123, Ivan1234, ivan!, Ivan@             — суффиксы
  1v@n, p3tr0v, 1v@n1990                      — leet speak
  Berlin2024, berlin1990                       — с городом
  vanko123, Vanko1990                          — с никнеймом
```

**Как запустить:** 🔑 Recovery → Паттерны → wizard (4 шага) → Сохранить как словарь или Скачать TXT

---

## Классификация аккаунтов

После проверки каждый аккаунт получает статус:

| Статус | Значение | Что дальше |
|--------|----------|-----------|
| 🟢 active_clean | Логин успешен, INBOX доступен | Полный доступ |
| 🔵 active_with_2fa | Логин успешен, но есть 2FA | Частичный доступ |
| 🟡 suspicious_activity | Есть предупреждения в письмах | Аккаунт под наблюдением |
| 🔒 restricted | Логин успешен, но INBOX закрыт | Ограниченный доступ |
| ❌ locked | Логин не удался | Нет доступа |

---

## Архитектура

```
┌──────────────────────────────────────────────┐
│               Nginx (80/443)                 │
│          SSL + Rate Limiting                 │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│            Node.js Application               │
│                                              │
│  ┌──────────┐ ┌─────────┐ ┌──────────────┐  │
│  │ Telegram  │ │REST API │ │  12 Workers  │  │
│  │ Bot       │ │ 30+     │ │  (BullMQ)    │  │
│  │ (grammY)  │ │endpoints│ │  15 stuffing │  │
│  └──────────┘ └─────────┘ └──────────────┘  │
│                                              │
│  Services: SMTP · IMAP · OAuth · WebAuth     │
│  Matching · Stuffing · Dictionary · Breach   │
│  Pipeline · Audit · Export · Proxy           │
└──────┬───────────────┬──────────────┬────────┘
       │               │              │
┌──────▼───────┐ ┌─────▼──────┐ ┌────▼─────┐
│ PostgreSQL   │ │   Redis    │ │ 67M      │
│ 19 таблиц    │ │ очереди +  │ │ passwords│
│              │ │ кеш        │ │ (971 MB) │
└──────────────┘ └────────────┘ └──────────┘
```

---

## Workers (12 фоновых процессов)

| Worker | Что делает | Concurrency |
|--------|-----------|-------------|
| email-validation | Валидация формата + MX | batch |
| smtp-verification | SMTP deliverability | 3 |
| smtp-batch | Batch SMTP из бота | 1 |
| web-auth-batch | Batch OAuth из бота | 1 |
| imap-validate-batch | Batch IMAP из бота | 1 |
| security-audit-pipeline | SMTP → OAuth → IMAP pipeline | 1 |
| credential-matching | Dictionary attack | 1 |
| recovery-pipeline | Full recovery pipeline | 1 |
| **credential-stuffing** | **Combo list проверка** | **15** |
| proxy-check | Health check прокси | 1 |
| invalid-credentials-cleanup | Автоочистка (2 AM) | 1 |

---

## Все команды бота

```
/start              — главное меню (6 секций)
/help               — подробная инструкция (7 страниц)
/dashboard          — real-time статистика

/upload             — загрузить email-базу
/tasks              — список задач
/status 42          — статус задачи #42
/cancel 42          — отменить задачу

/check_smtp         — SMTP проверка
/check_web          — OAuth проверка
/validate           — IMAP валидация
/full_audit         — полный pipeline (SMTP → OAuth → IMAP)

/dictionary         — менеджер словарей
/generate_passwords — генератор паттернов паролей
/recover            — подбор паролей
/recover_passwords  — dictionary attack (подробный)
/full_recover       — полный recovery pipeline

/stuff              — credential stuffing
/import_combo       — импорт combo list

/stats              — статистика
/export             — экспорт данных
/generator          — генератор email'ов
/settings           — настройки (admin)
/proxy              — прокси (admin)
/logs               — логи (admin)
```

---

## Docker

```bash
# Запуск
docker compose up -d

# Логи
docker compose logs -f app

# Бекап
docker compose --profile backup up backup

# Стоп
docker compose down
```

| Сервис | RAM | CPU |
|--------|-----|-----|
| app | 512M | 1.0 |
| postgres | 256M | 0.5 |
| redis | 128M | 0.25 |
| nginx | 64M | 0.25 |

---

## ENV переменные

```env
# Обязательные
BOT_TOKEN=123456:ABC-DEF...
ADMIN_IDS=123456789
DATABASE_URL=postgresql://user:pass@localhost:5432/email_panel
REDIS_URL=redis://localhost:6379
JWT_SECRET=random-64-char-string

# Опциональные
API_PORT=3000
MAX_FILE_SIZE=20971520
```

---

## Лицензия

Private. All rights reserved.
