# Карта проекта SwimCRM

Этот файл — короткий навигатор по действующему коду. Бизнес-детали находятся в
спецификациях, а полный перечень HTTP-маршрутов — в `swimcrm/portal/urls.py` и
OpenAPI. При расхождении документа с кодом источником истины является код и
автоматические тесты; карту после этого необходимо обновить.

## 1. Архитектура в одном экране

```text
Browser
  │
  ├─ React SPA: frontend/src/main.jsx → App.jsx → AppShell.jsx
  │                                      │
  │                                      ├─ runtime.jsx: роли и навигация
  │                                      └─ app/screens/: страницы
  │
  └─ /api/*
       ↓
     config/urls.py → portal/urls.py → portal/*_views.py
                                         ↓
                               domain services.py
                                         ↓
                                  domain models.py
                                         ↓
                              SQLite dev / PostgreSQL prod

Background work: management commands или Celery → */tasks.py → services.py
```

Основной принцип: HTTP и сериализация находятся в `portal/`, бизнес-правила —
в доменных сервисах, состояние — в моделях. React не должен повторять правила,
которые сервер обязан гарантировать.

## 2. Каталоги верхнего уровня

| Путь | Назначение | Источник истины |
|---|---|---|
| `swimcrm/` | Django-приложение, доменные модули и backend-тесты | Да |
| `frontend/` | React SPA и frontend-тесты | Да |
| `design/` | Токены, компоненты и исходники дизайн-системы | Да |
| `frontend/src/design/` | Runtime-копия дизайн-системы для Vite | Генерируется из `design/` |
| `scripts/` | Локальные проверки, сборка, release и operations | Да |
| `docs/` | Спецификации, инструкции и справочные материалы | См. `docs/README.md` |
| `audit/` | Run-specific QA evidence и локальная синтетическая среда | Нет, не runtime-код |
| `releases/` | Локальные ZIP и манифесты уже собранных релизов | Нет, производные артефакты |

`swimcrm/audit/` — это Django-модуль журнала аудита. Его нельзя путать с
корневым `audit/`, где лежат QA-материалы.

## 3. Навигация интерфейса

SPA использует query-параметры, а не отдельный router-пакет:

```text
/?role=<role>&view=<view>&client=<id>&session=<id>&group=<id>...
```

Разбор и запись URL находятся в `frontend/src/app/AppShell.jsx`. Разрешённые
страницы и меню определены в `frontend/src/app/runtime.jsx`.

### Администратор

| `view` | Экран | Основная область API |
|---|---|---|
| `overview` | Рабочий стол | `/api/admin/dashboard/`, `/api/admin/upcoming/` |
| `clients` | Клиенты | `/api/admin/clients/` |
| `clientDetail` | Карточка клиента | `/api/admin/clients/{id}/`, participant endpoints |
| `schedule` | Расписание | `/api/admin/schedule/*` |
| `attendance` | Посещаемость занятия | schedule attendance endpoints |
| `groups` | Группы | `/api/admin/groups/` |
| `trainers` | Тренеры | `/api/admin/trainers/` |
| `payments` | Платежи | `/api/admin/payments/` |
| `debtors` | Должники | `/api/admin/debtors/` |
| `subscriptions` | Абонементы | `/api/admin/subscriptions/` |
| `settings` | Настройки и операции | `/api/admin/settings/*`, reports, import, payroll, notifications, system |

`clientDetail` и `attendance` — контекстные страницы, поэтому в основном меню
они не показываются. Внутри настроек находятся каталог, уведомления, зарплата,
локализация, контроль/импорт и отчёты.

### Тренер

| `view` | Назначение | API |
|---|---|---|
| `sessions` | Список занятий | `/api/trainer/sessions/` |
| `session` | Занятие и отметка посещений | `/api/trainer/sessions/{id}/` |
| `groups` | Группы тренера | `/api/trainer/groups/` |
| `history` | История занятий | `/api/trainer/history/` |

### Клиент/родитель

| `view` | Назначение | API |
|---|---|---|
| `home` | Обзор аккаунта и участников | `/api/client/overview/` |
| `schedule` | Расписание | `/api/client/schedule/` |
| `subscription` | Абонемент участника | client overview/charges |
| `payments` | Платежи и пополнение | `/api/client/payments/`, `/api/client/charges/` |
| `history` | Посещения и история платежей | attendance/payment-history endpoints |
| `profile` | Профиль и контакты | `/api/client/profile/` |
| `consents` | Контекстный экран согласий | `/api/client/consents/` |

Роль пользователя приходит из `/api/me/`. Серверная роль `parent` в SPA
нормализуется в `client`.

## 4. Backend-модули

| Модуль | Отвечает за |
|---|---|
| `config` | Django settings, корневые URL, ASGI/WSGI, Celery |
| `accounts` | Пользователей, роли, доступ, активацию и 2FA |
| `students` | Аккаунты клиентов, участников и членство в группах |
| `catalog` | Тренеров, группы, локации и типы занятий |
| `scheduling` | Занятия, расписание, вместимость, лист ожидания и конфликты |
| `attendance` | Посещения и их влияние на абонементы/начисления |
| `subscriptions` | Типы и экземпляры абонементов, остатки, даты окончания, продление и заморозку |
| `billing` | Начисления, платежи, баланс и финансовые операции |
| `notifications` | Шаблоны, правила, отправку, повтор и quiet hours |
| `payroll` | Схемы, ставки, назначения и расчётные периоды |
| `localization` | Языки и серверный словарь переводов |
| `audit` | Неизменяемый журнал значимых действий |
| `analytics` | Агрегации и аналитические данные |
| `dataio` | Preview/commit/rollback импорта и экспорт |
| `portal` | HTTP API для admin, trainer и client поверх доменных модулей |
| `tests` | Интеграционные, контрактные и бизнес-тесты backend |

Для изменения правила сначала ищите соответствующий `services.py`, затем
`models.py` и тесты. Не размещайте новое бизнес-правило только во view.

## 5. Frontend-модули

| Путь | Ответственность |
|---|---|
| `frontend/src/main.jsx` | React entrypoint |
| `frontend/src/App.jsx` | bootstrap, auth, загрузка данных роли, lazy loading shell |
| `frontend/src/api.js` | HTTP, CSRF, ошибки, пагинация и синхронизация auth между вкладками |
| `frontend/src/mappers.js` | Преобразование API payload в данные экранов |
| `frontend/src/i18n.jsx` и `*Locales.js` | Локализация интерфейса |
| `frontend/src/app/AppShell.jsx` | layout, URL-state, меню, поиск, mobile overlays |
| `frontend/src/app/runtime.jsx` | Реестр ролей, страниц и пунктов меню |
| `frontend/src/app/screens/` | Страницы по функциональным областям |
| `frontend/src/app/*Contracts.js` | Нормализация и проверяемые UI-контракты |
| `frontend/src/app/ops-redesign.css` | Общая раскладка и responsive-стили приложения |
| `frontend/src/design/` | Синхронизированная runtime-копия дизайн-системы |

## 6. Где вносить изменение

| Что меняется | Начать здесь | Обязательно проверить |
|---|---|---|
| Бизнес-правило | `swimcrm/<domain>/services.py` | domain models и `swimcrm/tests/` |
| Поле/связь БД | `swimcrm/<domain>/models.py` | migration, services, API, tests |
| Endpoint | `swimcrm/portal/*_views.py` и `portal/urls.py` | `portal/openapi.py`, API contract, tests |
| Поиск/пагинация | соответствующий admin view и `portal/pagination.py` | `api.js`, mapper, scale/Playwright tests |
| Страница SPA | `frontend/src/app/screens/` | locale keys, contracts, desktop/mobile Playwright |
| Пункт меню/URL | `frontend/src/app/runtime.jsx`, `AppShell.jsx` | navigation tests и все роли |
| Общий компонент/стиль | `design/` | sync script, обе runtime-копии, build |
| Локализация | frontend locale-файлы или `localization/` | RU/UK/PL, fallback и layout |
| Импорт/экспорт | `dataio/` и `portal/admin_import_views.py` | preview, idempotency, rollback, round-trip |
| Release/production | `scripts/` и `docs/OPERATIONS.md` | backup, restore, manifest, readback |

## 7. Данные и запрос

Типичный UI-запрос проходит так:

```text
Screen → api.js → portal URL/view → domain service → model/database
       ← mapper/contract ← JSON response ← serializer/helper
```

Ошибки полей должны пройти обратно в `error.fieldErrors`; не заменяйте их одним
общим сообщением. Денежные значения передаются в minor units там, где это
зафиксировано контрактом. Финансовые записи принадлежат участнику, а не группе.

## 8. Тесты

| Набор | Путь | Команда |
|---|---|---|
| Backend | `swimcrm/tests/` и тесты доменных apps | `cd swimcrm; .\.venv\Scripts\python.exe manage.py test tests --noinput` |
| Frontend unit | `frontend/test/` | `cd frontend; npm.cmd test` |
| Browser/E2E | `frontend/tests/` | `cd frontend; npm.cmd run test:smoke` |
| Production build | `frontend/` | `cd frontend; npm.cmd run build` |
| Full release gate | `scripts/` | `.\scripts\release-check-full.ps1` |

`frontend/test/` и `frontend/tests/` не дублируют друг друга: первый каталог —
unit-тесты Node, второй — Playwright.

## 9. Документы и источники истины

- Бизнес-решения: `DECISIONS.md`.
- Общая доменная спецификация: `docs/CRM_CORE_SPEC.md`.
- HTTP-контракт: код URL/OpenAPI, пояснения в `docs/API_CONTRACT.md`.
- Дизайн: `design/` и `docs/DESIGN_SYSTEM.md`.
- Эксплуатация и выпуск: `docs/OPERATIONS.md`.
- Полный индекс: `docs/README.md`.

При добавлении модуля, основной страницы или нового семейства API обновите эту
карту в том же изменении.
