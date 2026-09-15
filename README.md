# SwimCRM

SwimCRM — CRM школы плавания с тремя интерфейсами: администратор,
тренер и клиент/родитель. Серверная часть — модульный Django-монолит,
пользовательский интерфейс — React SPA; Django является единственным backend.

## С чего начать

| Задача | Документ |
|---|---|
| Быстро понять структуру и найти нужный код | [PROJECT_MAP.md](PROJECT_MAP.md) |
| Поднять проект локально | [DEV.md](DEV.md) |
| Понять бизнес-правила | [DECISIONS.md](DECISIONS.md) и [docs/CRM_CORE_SPEC.md](docs/CRM_CORE_SPEC.md) |
| Найти или изменить API | [docs/API_CONTRACT.md](docs/API_CONTRACT.md) и `swimcrm/portal/urls.py` |
| Работать с дизайном | [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) |
| Проверить или выпустить приложение | [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| Найти остальные документы | [docs/README.md](docs/README.md) |

## Основная структура

```text
H2O_CRM_V5/
├─ swimcrm/       Django, доменная логика, API и backend-тесты
├─ frontend/      React/Vite SPA, unit- и Playwright-тесты
├─ design/        исходники дизайн-системы
├─ scripts/       проверки, сборка, backup/restore и release-команды
├─ docs/          актуальная и справочная документация
├─ audit/         локальные QA-материалы; не является runtime-кодом
└─ releases/      локальные release-архивы; не является исходным кодом
```

Подробное назначение модулей, страницы каждой роли и таблица «где менять
функцию» находятся в [PROJECT_MAP.md](PROJECT_MAP.md).

## Быстрый локальный запуск

Backend:

```powershell
cd C:\H2O_content\H2O_CRM_V5\swimcrm
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Frontend в другом терминале:

```powershell
cd C:\H2O_content\H2O_CRM_V5\frontend
npm.cmd install
npm.cmd run dev
```

Интерфейс: <http://localhost:5173/>. Health-check:
<http://127.0.0.1:8000/api/health/>. Учётные данные в репозитории не хранятся.

## Основные проверки

```powershell
# Backend
cd C:\H2O_content\H2O_CRM_V5\swimcrm
.\.venv\Scripts\python.exe manage.py test tests --noinput

# Frontend
cd C:\H2O_content\H2O_CRM_V5\frontend
npm.cmd test
npm.cmd run build
npm.cmd run test:smoke

# Полный локальный release gate — из корня репозитория
cd C:\H2O_content\H2O_CRM_V5
.\scripts\release-check-full.ps1
```

Commit, push, создание release-архива и production deployment — отдельные
операции. Их нельзя считать выполненными по результату локальной сборки.
