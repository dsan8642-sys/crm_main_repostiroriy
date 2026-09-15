# Документация SwimCRM

Этот индекс показывает, какой документ читать и насколько он авторитетен.

## Начальная навигация

- [`../README.md`](../README.md) — краткое описание и запуск.
- [`../PROJECT_MAP.md`](../PROJECT_MAP.md) — структура кода, страницы ролей и
  таблица «где менять функцию».
- [`../DEV.md`](../DEV.md) — локальное окружение и команды разработчика.

## Действующие источники истины

| Документ | Назначение |
|---|---|
| [`../DECISIONS.md`](../DECISIONS.md) | Принятые бизнес-решения |
| [`CRM_CORE_SPEC.md`](CRM_CORE_SPEC.md) | Домен, роли, сущности и границы модулей |
| [`API_CONTRACT.md`](API_CONTRACT.md) | Пояснения и примеры API-контракта |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Source of truth и синхронизация дизайна |
| [`OPERATIONS.md`](OPERATIONS.md) | Фоновые задачи, release, backup и restore |
| [`RODO_GDPR.md`](RODO_GDPR.md) | Работа с персональными данными |
| [`RELEASE_CANDIDATE_READINESS.md`](RELEASE_CANDIDATE_READINESS.md) | Границы локальной и production-готовности |

Машинным источником API остаются `swimcrm/portal/urls.py` и
`swimcrm/portal/openapi.py`. Фактическая схема данных определяется Django
models и migrations.

## Операционные и миграционные инструкции

| Документ | Когда нужен |
|---|---|
| [`LEGACY_MIGRATION.md`](LEGACY_MIGRATION.md) | Перенос и сверка legacy-данных |
| [`DJANGO_ADMIN_MIGRATION.md`](DJANGO_ADMIN_MIGRATION.md) | Разделение SPA и резервного Django admin |
| [`profile-access-guide-ru.md`](profile-access-guide-ru.md) | Выдача и восстановление доступа пользователей |
| [`PRODUCTION_CUTOVER_EVIDENCE.example.json`](PRODUCTION_CUTOVER_EVIDENCE.example.json) | Шаблон доказательств production cutover |
| [`PRODUCTION_READINESS_AUDIT.json`](PRODUCTION_READINESS_AUDIT.json) | Проверяемый снимок production readiness |

## Справочные и исторические материалы

Эти файлы полезны для контекста, но не должны переопределять действующий код и
документы выше:

- [`IMPLEMENTATION_ROADMAP.md`](IMPLEMENTATION_ROADMAP.md) — первоначальный
  фазовый план;
- [`DJANGO_SCHEMA_DRAFT.md`](DJANGO_SCHEMA_DRAFT.md) — ранний черновик схемы;
- [`TECHNICAL_REVIEW_DECISIONS.md`](TECHNICAL_REVIEW_DECISIONS.md) — решения
  технического review;
- [`UI_REWORK_BACKLOG.md`](UI_REWORK_BACKLOG.md) — закрытый UI backlog;
- [`UI_REWORK_RELEASE_EVIDENCE.md`](UI_REWORK_RELEASE_EVIDENCE.md) — evidence
  исторического UI-релиза;
- [`DESIGNER_BRIEF.md`](DESIGNER_BRIEF.md) — расширенный дизайнерский brief;
- `SwimCRM_client_presentation_ru.pptx` — клиентская презентация, не
  инженерный источник истины.

Run-specific скриншоты, логи и отчёты в корневом `audit/` — QA evidence, а не
документация архитектуры.

## Правило обновления

- Новая основная страница или роль: обновить `PROJECT_MAP.md`.
- Новый endpoint: обновить OpenAPI, тесты и при необходимости `API_CONTRACT.md`.
- Новое бизнес-решение: зафиксировать в `DECISIONS.md`.
- Новая release-процедура: обновить `OPERATIONS.md` и проверяющий скрипт.
- Не хранить в документации пароли, токены, реальные персональные данные и
  локальные абсолютные пути, кроме стабильного пути этого workspace в `DEV.md`.
