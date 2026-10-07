# Карта проекта SwimCRM

Этот файл — короткий навигатор по действующему коду. Бизнес-детали находятся в
спецификациях, а полный перечень HTTP-маршрутов — в `swimcrm/portal/urls.py` и
OpenAPI. При расхождении документа с кодом источником истины является код и
автоматические тесты; карту после этого необходимо обновить.

## Быстрый маршрут для новой задачи

| Задача | Читать здесь | Затем открыть в коде |
|---|---|---|
| Правило или данные | разделы 4, 6–7; нужный пункт `DECISIONS.md` | `swimcrm/<domain>/services.py`, `models.py`, тесты |
| API | разделы 4, 6–7; `docs/API_CONTRACT.md` по необходимости | `swimcrm/portal/urls.py`, нужный `*_views.py`, `openapi.py` |
| Экран или навигация | разделы 3, 5–6 | `frontend/src/app/runtime.jsx`, нужный экран, `AppShell.jsx` |
| Общий дизайн | разделы 2, 5–6; `docs/DESIGN_SYSTEM.md` | `design/`, затем скрипты синхронизации |
| Запуск или выпуск | раздел 8; `DEV.md` либо `docs/OPERATIONS.md` | нужный скрипт в `scripts/` |

Открывайте только относящиеся к задаче разделы и файлы. Текущее состояние
рабочего дерева проверяйте через Git: этот документ не хранит статус задач.

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
| `overview` | Рабочий стол с быстрым переходом к внесению оплаты | `/api/admin/dashboard/`, `/api/admin/upcoming/`, `/api/admin/payments/` |
| `clients` | Клиенты | `/api/admin/clients/` |
| `clientDetail` | Карточка клиента; отзыв доступа к кабинету подтверждается отдельно и не переносит профиль в чёрный список | `/api/admin/clients/{id}/`, participant endpoints |
| `schedule` | Расписание | `/api/admin/schedule/*` |
| `attendance` | Посещаемость занятия, повторное нажатие снимает отметку | schedule attendance GET/POST/DELETE endpoints |
| `groups` | Группы | `/api/admin/groups/` |
| `trainers` | Тренеры | `/api/admin/trainers/` |
| `payments` | Платежи | `/api/admin/payments/` |
| `debtors` | Должники | `/api/admin/debtors/` |
| `subscriptions` | Абонементы | `/api/admin/subscriptions/` |
| `settings` | Настройки и операции: категории и пункты слева на десктопе, пошаговый выбор на телефоне (`AdminSettingsScreen.jsx`) | `/api/admin/settings/*`, reports, import, payroll, notifications, system |

`clientDetail` и `attendance` — контекстные страницы, поэтому в основном меню
они не показываются. Внутри настроек находятся каталог, уведомления, зарплата,
локализация, контроль/импорт и отчёты.

### Тренер

| `view` | Назначение | API |
|---|---|---|
| `sessions` | Календарь на компьютере; повестка только с датами занятий на телефоне, карточки используют цвета расписания | `/api/trainer/sessions/` |
| `session` | Занятие и отметка посещений | `/api/trainer/sessions/{id}/` |
| `groups` | Группы тренера | `/api/trainer/groups/` |
| `history` | История занятий | `/api/trainer/history/` |

### Клиент/родитель

| `view` | Назначение | API |
|---|---|---|
| `home` | Обзор аккаунта и участников | `/api/client/overview/` |
| `schedule` | Календарь на компьютере; повестка по дням с занятиями на телефоне, самозапись и лист ожидания | `/api/client/schedule/`, session booking/waitlist endpoints |
| `subscription` | Доступность занятий и движения выбранного абонемента | `/api/client/overview/` |
| `payments` | Платежи и пополнение | `/api/client/payments/`, `/api/client/charges/` |
| `history` | Посещения (компактный список на телефоне) и отправленные сообщения | `/api/client/attendance/`, `/api/client/notifications/` |
| `profile` | Просмотр профиля и участников; редактирование по кнопке | `/api/client/profile/` |
| `help` | Инструкция по работе после входа | статический экран |
| `consents` | Контекстный экран согласий | `/api/client/consents/` |

Роль пользователя приходит из `/api/me/`. Серверная роль `parent` в SPA
нормализуется в `client`.

## 4. Backend-модули

| Модуль | Отвечает за |
|---|---|
| `config` | Django settings, корневые URL, ASGI/WSGI, Celery |
| `accounts` | Пользователей, роли, доступ, активацию, 2FA, лимит попыток и защиту от повтора TOTP |
| `students` | Аккаунты клиентов, участников и членство в группах |
| `catalog` | Тренеров, группы, локации и типы занятий |
| `scheduling` | Занятия, расписание, вместимость, лист ожидания и конфликты; транзакционные операции самозаписи блокируют только строку занятия |
| `scheduling.SessionTypeConfig` | Системные и пользовательские типы занятий; `base_type` сохраняет базовые правила, а `Session.session_type_config` — выбранный тип |
| `attendance` | Посещения и их влияние на абонементы/начисления; `set_attendance` проверяет покрытие действующим безлимитом отдельно от списания занятий |
| `subscriptions` | Типы и экземпляры абонементов, остатки, даты окончания, продление и заморозку |
| `billing` | Начисления и платежи привязаны к участнику для аудита; `family_balance(s)` и `family_charge_statuses` объединяют деньги по `ParentAccount`, сохраняя личные абонементы и посещаемость |
| `notifications` | Шаблоны, правила, отправку, повтор и quiet hours; `deliver` повторно проверяет согласие канала непосредственно перед вызовом внешнего backend |
| `payroll` | Схемы, ставки, назначения и расчётные периоды |
| `localization` | Языки и серверный словарь переводов |
| `audit` | Неизменяемый журнал значимых действий |
| `analytics` | Агрегации и аналитические данные |
| `dataio` | Preview/commit/rollback импорта и экспорт |
| `portal` | HTTP API для admin, trainer и client поверх доменных модулей |
| `tests` | Интеграционные, контрактные и бизнес-тесты backend |

Для изменения правила сначала ищите соответствующий `services.py`, затем
`models.py` и тесты. Не размещайте новое бизнес-правило только во view.

В резервном Django admin посещения, абонементы, журнал занятий, начисления,
платежи, события платежей и подтверждающие файлы доступны только для просмотра
через `common/admin.py`. Продажа, продление и финансовые изменения выполняются
через основной интерфейс CRM; прямое действие продления в Django admin удалено.

Операции, меняющие остаток занятий, блокируют участника перед чтением остатка:
посещаемость, покупка, продление и ручная корректировка. При продлении исходный
абонемент перечитывается под блокировкой. Массовые отметки блокируют участников
по ID; финансовый импорт сначала блокирует известные занятия, затем участников.

## 5. Frontend-модули

| Путь | Ответственность |
|---|---|
| `frontend/src/main.jsx` | React entrypoint |
| `frontend/src/App.jsx` | bootstrap, auth, загрузка данных роли, lazy loading shell |
| `frontend/src/api.js` | HTTP, CSRF, ошибки, пагинация и синхронизация auth между вкладками |
| `frontend/src/mappers.js` | Преобразование API payload в данные экранов |
| `frontend/src/i18n.jsx`, `localeContracts.js` и `*Locales.js` | Локализация интерфейса; первый вход по умолчанию на украинском, выбор сохраняется для пользователя и роли |
| `frontend/src/app/AppShell.jsx` | layout, URL-state, меню, поиск, mobile overlays |
| `frontend/src/app/runtime.jsx` | Реестр ролей, страниц и пунктов меню |
| `frontend/src/app/screens/` | Страницы по функциональным областям, включая отдельный календарь тренера и список занятий |
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
| Типы занятий | `portal/admin_settings_views.py`, `scheduling/models.py`, `scheduling/services.py` | Settings, создание/изменение занятия, API-контракт и тесты |
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

Функциональные Playwright-сценарии должны искать элементы по `data-testid`,
стабильным атрибутам и данным тестовых записей, а не по переведённым подписям.
Текстовые проверки оставлены сценариям локализации; браузерный набор должен
проходить с украинским языком по умолчанию.
Для языковой матрицы Playwright можно задать `SWIMCRM_PLAYWRIGHT_LOCALE`
(`uk`, `ru`, `pl`, `en`); параметр заполняет только начальное состояние
браузера для тестовых администраторов и клиентов.

## 9. Документы и источники истины

- Бизнес-решения: `DECISIONS.md`.
- Общая доменная спецификация: `docs/CRM_CORE_SPEC.md`.
- HTTP-контракт: код URL/OpenAPI, пояснения в `docs/API_CONTRACT.md`.
- Дизайн: `design/` и `docs/DESIGN_SYSTEM.md`.
- Эксплуатация и выпуск: `docs/OPERATIONS.md`.
- Полный индекс: `docs/README.md`.

При добавлении модуля, основной страницы или нового семейства API обновите эту
карту в том же изменении.
