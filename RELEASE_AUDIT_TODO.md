# Release audit TODO

Дата аудита: 2026-07-14

Цель файла: зафиксировать найденные проблемы как рабочий список задач,
чтобы последовательно закрыть их перед production release.

## Critical / High

- [x] Изолировать upload-тесты от реального `MEDIA_ROOT`
  - Приоритет: High
  - Проблема: backend test suite создает реальные файлы чеков в `.runtime/uploads/receipts/2026/07/`.
  - Где смотреть:
    - `swimcrm/tests/test_portal_api.py`
    - `ClientPortalApiRule.test_adult_client_can_upload_receipt_without_student_id`
    - `ClientPortalApiRule.test_client_can_upload_receipt_for_own_student`
  - Решение: использовать временный `MEDIA_ROOT` через `TemporaryDirectory()` + `override_settings(MEDIA_ROOT=...)` для тестов загрузки файлов.
  - Проверка:
    - `scripts\release-check-backend.cmd`
    - после тестов `rg --files -g "*.pdf" .runtime` не должен находить receipt-файлы.

- [x] Удалить текущие runtime receipt-файлы из рабочей копии
  - Приоритет: High
  - Проблема: после тестового запуска в `.runtime/uploads/receipts/2026/07/` остались `receipt.pdf` и `receipt_*.pdf`.
  - Решение: после фикса тестовой изоляции удалить созданные runtime-файлы.
  - Проверка:
    - `rg --files -g "*.pdf" .runtime`
    - `rg --files -g "*.dump" -g "*.sqlite3" -g "*.zip" -g "RELEASE_BACKLOG_TEMP.md" -g "dist" -g ".runtime"`

- [x] Восстановить валидное Git-состояние проекта
  - Приоритет: High
  - Проблема: `git status --short` возвращает `fatal: not a git repository`, хотя директория `.git` существует.
  - Риск: нельзя доказать чистоту diff, сделать нормальный tag, rollback, release snapshot.
  - Решение: восстановить корректный `.git` из исходного репозитория или заново инициализировать/подключить проект к репозиторию.
  - Проверка:
    - `git status --short`
    - `git diff --stat`

- [x] Добавить CI/release gate
  - Приоритет: High
  - Проблема: есть локальный `scripts/release-check-backend.ps1`, но не найден CI workflow.
  - Решение: добавить workflow, который запускает backend tests, production deploy check, frontend build, dependency audit и artifact scan.
  - Минимальный набор проверок:
    - `scripts\release-check-backend.cmd`
    - `npm.cmd run build` из `frontend\`
    - `npm.cmd audit --audit-level=high`
    - scan на `db.sqlite3`, `.dump`, `.zip`, `receipts`, `.runtime`, `frontend/dist`, `node_modules`, `.venv`.

## Medium

- [x] Довести debtor reminder UI до рабочего состояния
  - Приоритет: Medium
  - Проблема: в `frontend/src/app/screens/AdminScreens.jsx` кнопки `Wyslij przypomnienia` и row icon buttons не имеют реального action handler.
  - Где смотреть:
    - `frontend/src/app/screens/AdminScreens.jsx`
    - `createAdminDebtorsScreen`
  - Решение: либо подключить API отправки/постановки reminder-уведомлений, либо временно убрать/задизейблить кнопки.
  - Проверка:
    - frontend build
    - ручной UX smoke на admin debtors screen.

- [x] Разбить `AdminScreens.jsx`
  - Приоритет: Medium
  - Проблема: файл `frontend/src/app/screens/AdminScreens.jsx` около 119 KB и остается главным frontend hotspot.
  - Риск: сложнее ревьюить, выше шанс регрессий в payments/clients/schedule flows.
  - Решение: вынести admin screens по доменам:
    - `AdminPaymentsScreen.jsx`
    - `AdminClientsScreen.jsx`
    - `AdminScheduleScreen.jsx`
    - `AdminDebtorsScreen.jsx`
    - shared admin form/API helpers при необходимости.
  - Проверка:
    - `npm.cmd run build`
    - smoke по admin flows.

- [x] Добавить frontend visual/accessibility smoke
  - Приоритет: Medium
  - Проблема: build проходит, но не было browser screenshot/a11y проверки после refactor.
  - Риск: мобильные/планшетные layout bugs, проблемы keyboard/focus/labels.
  - Решение: добавить Playwright smoke для login/admin/client/trainer screens на desktop и mobile viewport.
  - Проверка:
    - screenshots без overlap/blank screens
    - базовые a11y assertions для labels, buttons, focusable controls.

- [x] Проверить реальный production environment, а не только synthetic deploy check
  - Приоритет: Medium
  - Проблема: `release-check-backend.ps1` использует dummy `SECRET_KEY`, `ALLOWED_HOSTS=crm.example.com`, `SWIMCRM_RUNTIME_DIR=C:\SwimCRMRuntime`.
  - Решение: добавлен `scripts\check-production-env.cmd`; перед релизом выполнить его на production host с реальными production env vars.
  - Проверка:
    - `DEBUG=0`
    - сильный реальный `SECRET_KEY`
    - реальные `ALLOWED_HOSTS`
    - runtime paths вне source tree
    - корректный reverse proxy / `TRUST_PROXY_SSL_HEADER` при TLS termination.

- [x] Настроить verbosity для `django-axes` логов
  - Приоритет: Medium
  - Проблема: backend test output и production logs могут быть шумными из-за INFO-сообщений `axes`.
  - Решение: добавить logger config для `axes` / `axes.handlers.database`, например WARNING в production или отдельную настройку.
  - Проверка:
    - test output читаемый
    - login failures все еще видны как security events.

- [x] Зафиксировать packaging policy скриптом
  - Приоритет: Medium
  - Проблема: `.gitignore` и docs описывают исключения, но нет автоматического package verification script.
  - Решение: добавить script, который падает при наличии runtime/generated artifacts в release tree.
  - Проверка:
    - script обнаруживает `.runtime`, `dist`, `.venv`, `node_modules`, `*.sqlite3`, `*.dump`, `*.zip`, `receipts`.

## Low / Nice to have

- [x] Обновить stale docs: test count
  - Приоритет: Low
  - Проблема: `swimcrm/README.md` говорил про 148 тестов, фактически suite сейчас 150.
  - Решение: точное число заменено на формулировку без счетчика.
  - Проверка:
    - `rg -n "148 тестов|150 тестов" swimcrm/README.md DEV.md docs`

- [x] Обновить stale frontend package metadata
  - Приоритет: Low
  - Проблема: `frontend/package.json` description говорил `Step 1 placeholder shell`.
  - Решение: description заменен на актуальное описание SPA.
  - Проверка:
    - `rg -n "placeholder|Step 1" frontend/package.json`

- [x] Проверить README/DEV encoding display
  - Приоритет: Low
  - Проблема: часть terminal output отображает mojibake для кириллицы, хотя UTF-8 docs ранее проверялись.
  - Решение: убедиться, что файлы сохранены в UTF-8 and docs render correctly in target editor/hosting.
  - Проверка:
    - открыть docs в editor/browser
    - при необходимости добавить `.editorconfig` с `charset = utf-8`.

## Release readiness checklist after fixes

- [x] `git status --short` работает и показывает ожидаемое состояние.
- [x] `scripts\release-check-backend.cmd` проходит.
- [x] `scripts\release-check-backend.cmd -Postgres` проходит, если PostgreSQL доступен.
- [x] `npm.cmd run build` проходит.
- [x] `npm.cmd audit --audit-level=high` показывает 0 high vulnerabilities.
- [x] Нет runtime/generated артефактов в source tree.
- [x] Production env проверен реальными значениями, не dummy из release script.
- [x] Admin/client/trainer smoke пройден вручную или Playwright-тестом.
- [x] Receipt upload/cleanup протестированы без загрязнения `.runtime`.
- [x] Backup/restore process проверен через `scripts\verify-pg-restore.cmd`.
