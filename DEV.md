# SwimCRM — как поднимать dev-окружение

Монорепозиторий:

```
H2O_CRM_V3/
├─ swimcrm/     # Django backend (модульный монолит, вся доменная логика + админка)
└─ frontend/    # React + Vite SPA для админа, клиента и тренера
```

Требования (уже установлены на этой машине): **Python 3.12+** (`python` или абсолютный путь к `python.exe`), **Node 24 / npm 11**.

> Если в свежем терминале `npm` не находится — просто открой новое окно PowerShell
> (после установки Node переменная PATH подхватывается только в новых терминалах).

---

## Backend (Django) — порт 8000

```powershell
cd C:\Users\clans\H2O_CRM_V3\swimcrm
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

- Админка: **http://127.0.0.1:8000/admin/** — логин `admin` / пароль `Admin!2026pass`
- Health: **http://127.0.0.1:8000/api/health/**
- Остановить: `Ctrl+C`

Полезное:

```powershell
.\.venv\Scripts\python.exe manage.py test tests     # прогон бизнес-правил
.\.venv\Scripts\python.exe manage.py seed_demo       # перезалить демо-данные
.\.venv\Scripts\python.exe manage.py migrate         # применить миграции
.\.venv\Scripts\python.exe manage.py run_due_jobs    # уведомления + очистка старых чеков
```

Release/smoke checks before upload:

```powershell
.\scripts\release-check-backend.ps1            # SQLite tests + production check --deploy
.\scripts\release-check-backend.ps1 -Postgres  # also runs PostgreSQL tests / GIST constraint
.\scripts\verify-release-tree.ps1              # scan for release-blocking artifacts
```

Первичная настройка venv (если папки `.venv` нет):

```powershell
cd C:\Users\clans\H2O_CRM_V3\swimcrm
& "C:\Users\clans\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_demo
```

## Frontend (React + Vite) — порт 5173

```powershell
cd C:\Users\clans\H2O_CRM_V3\frontend
npm install          # только при первом запуске / после изменения зависимостей
npm run dev
```

- Открывать в браузере: **http://localhost:5173/** (именно `localhost`, не `127.0.0.1` — Vite
  по умолчанию слушает IPv6 `::1`).
- Запросы к `/api/*` Vite сам проксирует на Django `:8000` (см. `frontend/vite.config.js`),
  поэтому CORS настраивать не нужно. **Backend должен быть запущен**, иначе SPA
  покажет статус «Backend недоступен».
- Остановить: `Ctrl+C`

---

## PostgreSQL (dev) — установлен, порт 5432

Установлен **PostgreSQL 17** (служба `postgresql-x64-17`, автозапуск). Суперюзер `postgres` /
`postgres`, БД проекта — `swimcrm`. На PG активен GIST-констрейнт `excl_trainer_time_overlap`
против накладок тренера (на SQLite его нет — только app-проверка).

Запуск на PostgreSQL — через helper [swimcrm/run-pg.ps1](swimcrm/run-pg.ps1) (он сам выставляет
`POSTGRES_*`):

```powershell
cd C:\Users\clans\H2O_CRM_V3\swimcrm
.\run-pg.ps1 runserver 127.0.0.1:8000   # dev-сервер на PostgreSQL
.\run-pg.ps1 migrate                     # миграции
.\run-pg.ps1 test tests                  # полный suite на PG, вкл. проверку GIST-констрейнта
```

Пересоздать БД с нуля: `& "C:\Program Files\PostgreSQL\17\bin\dropdb.exe" -U postgres swimcrm`
(с `$env:PGPASSWORD="postgres"`), затем `createdb ... swimcrm` и `.\run-pg.ps1 migrate`.

## Заметки по окружению

- **Две БД доступны:** обычный `python manage.py ...` (без env) идёт на **SQLite**
  (`swimcrm/db.sqlite3`, нулевая настройка); `.\run-pg.ps1 ...` — на **PostgreSQL** (как в проде,
  с exclusion-констрейнтом). Код один и тот же, переключение только переменными окружения.
- **Фоновые задачи:** есть два режима. Без Redis можно запускать `manage.py run_due_jobs`
  по Windows Task Scheduler / cron. Для production с очередью: `celery -A config worker -l INFO`
  и `celery -A config beat -l INFO`, broker по `CELERY_BROKER_URL` (по умолчанию Redis
  `redis://127.0.0.1:6379/0`).

## Продакшн: безопасность (раздел 6)

Защиты, зависящие от TLS, включаются автоматически при `DEBUG=0` (HSTS на год, secure-cookies,
`SECURE_SSL_REDIRECT`, заголовки). В dev (`DEBUG=1`) они инертны. Обязательный чеклист прода
(проверяется `manage.py check --deploy`; в dev-окружении без env будут security warnings, production-like env ниже проходит чисто):

```
SECRET_KEY=<длинный случайный>     # обязательно
DJANGO_ENV=production
DEBUG=0
ALLOWED_HOSTS=crm.example.com
SWIMCRM_RUNTIME_DIR=C:\SwimCRMRuntime
STATIC_ROOT=C:\SwimCRMRuntime\staticfiles
MEDIA_ROOT=C:\SwimCRMRuntime\uploads
MEDIA_URL=/media/
TRUST_PROXY_SSL_HEADER=1           # только если за TLS-терминирующим reverse-proxy
```

Валидация файлов чеков (раздел 6) — сделана: `ReceiptFile.file` принимает только PDF/JPG/PNG
(расширение + сигнатура байтов) и не больше `RECEIPT_MAX_SIZE_MB` (по умолчанию 10). Проверки
срабатывают при загрузке через админку/форму.

Блокировка после неудачных входов (раздел 6) — сделана через **django-axes**: лок пары
(логин + IP) после `AXES_FAILURE_LIMIT` неудач (по умолчанию 5), автоснятие через
`AXES_COOLOFF_MINUTES` (30). Разблокировать вручную: `.\.venv\Scripts\python.exe manage.py
axes_reset` (или `axes_reset_ip` / `axes_reset_username`). Попытки видны в админке (Axes → Access attempts).

2FA админа — встроенная TOTP-проверка перед входом в `/admin/`. В dev выключена по умолчанию,
в production (`DEBUG=0`) включается автоматически (`ADMIN_2FA_REQUIRED=1`). Настройка:

```powershell
.\.venv\Scripts\python.exe manage.py setup_admin_otp admin
.\.venv\Scripts\python.exe manage.py setup_admin_otp admin --code 123456
```

Бэкапы PostgreSQL:

```powershell
.\scripts\backup-pg.ps1 -OutDir C:\SwimCRMRuntime\backups
.\scripts\verify-pg-restore.ps1 -BackupFile C:\SwimCRMRuntime\backups\swimcrm-YYYYMMDD-HHMMSS.dump
```

Регламенты: [docs/RODO_GDPR.md](docs/RODO_GDPR.md), [docs/OPERATIONS.md](docs/OPERATIONS.md).

Ещё не закрыто из раздела 6: EU data residency зависит от выбранного хостинга.

> Историческое замечание: при Python 3.14 + Django 5.1 у **тест-клиента** встречался баг копирования
> контекста при рендере шаблона (`Context.__copy__`). Текущая `.venv` использует Python 3.12, но тесты
> вьюх всё равно держим ближе к API/сервисам, чтобы suite оставался стабильным.
