# Изменения после предыдущего коммита

Предыдущий коммит: `c2422ab feat: improve attendance billing and compact client interface`.

В нём сохранено 100 файловых изменений. Ниже кратко перечислено их содержание и приведён полный список файлов. В конце указано, что изменено в рабочем дереве после этого коммита.

## Что вошло в коммит

- **Посещения и оплата:** администратор может массово менять источник оплаты посещений между балансом и абонементом; исправления учитываются в финансовом журнале. Добавлены фильтры посещений по источнику и статусу, выбор абонемента с учётом срока и остатка, а также предупреждение о минусовом остатке.
- **Абонементы:** добавлено редактирование даты начала независимо от даты окончания; посещение можно покрыть абонементом, даже если оно было до даты начала.
- **Карточка клиента:** сводка объединена с навигацией по разделам; добавлены фильтры и редактирование посещений, подписи абонементов с датой начала, общие меню действий, анимации и улучшения мобильного вида.
- **Оформление интерфейса:** добавлены светлая и тёмная темы, анимации переходов и локальный редактор внешнего вида.
- **Документация:** обновлены карта проекта, правила и контракты API; добавлены руководства администратора и тренера.

### Полный список файлов из коммита

#### Документы и правила

- `DECISIONS.md`
- `PROJECT_MAP.md`
- `docs/API_CONTRACT.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/README.md`
- `docs/user_guides/SwimCRM_admin_guide_text_ru.docx`
- `docs/user_guides/SwimCRM_admin_guide_visual_ru.docx`
- `docs/user_guides/SwimCRM_trainer_guide_text_ru.docx`
- `docs/user_guides/SwimCRM_trainer_guide_visual_ru.docx`

#### Дизайн-система

- `design/_ds_bundle.js`
- `design/_ds_manifest.json`
- `design/appearance.json`
- `design/assets/icons.jsx`
- `design/components/data/Badge.jsx`
- `design/components/feedback/Dialog.jsx`
- `design/components/forms/Button.jsx`
- `design/components/forms/Checkbox.jsx`
- `design/styles.css`
- `design/tokens/appearance.css`
- `design/tokens/base.css`
- `design/tokens/themes.css`

#### Frontend: каркас и компоненты

- `frontend/src/App.jsx`
- `frontend/src/adminFinanceLocales.js`
- `frontend/src/adminLocales.js`
- `frontend/src/app/AppShell.jsx`
- `frontend/src/app/AppearanceEditor.jsx`
- `frontend/src/app/Auth.jsx`
- `frontend/src/app/DateTimeField.jsx`
- `frontend/src/app/EntityListPrimitives.jsx`
- `frontend/src/app/FormModal.css`
- `frontend/src/app/FormModal.jsx`
- `frontend/src/app/ScheduleCalendar.jsx`
- `frontend/src/app/ScheduleColorPicker.jsx`
- `frontend/src/app/SearchableSelect.jsx`
- `frontend/src/app/ToastProvider.jsx`
- `frontend/src/app/TodayPrimitives.jsx`
- `frontend/src/app/appearance-editor.css`
- `frontend/src/app/appearanceBlocks.js`
- `frontend/src/app/appearanceText.js`
- `frontend/src/app/listFoundation.jsx`
- `frontend/src/app/ops-redesign.css`
- `frontend/src/app/runtime.jsx`
- `frontend/src/app/scheduleContracts.js`
- `frontend/src/app/schedulePalette.js`
- `frontend/src/app/theme-layout.css`
- `frontend/src/app/theme.js`
- `frontend/src/app/usePresence.js`
- `frontend/src/i18n.jsx`
- `frontend/src/main.jsx`
- `frontend/src/portalLocales.js`

#### Frontend: экраны

- `frontend/src/app/screens/AdminAttendanceScreen.jsx`
- `frontend/src/app/screens/AdminClientDetailScreen.jsx`
- `frontend/src/app/screens/AdminClientsScreen.jsx`
- `frontend/src/app/screens/AdminGroupsScreen.jsx`
- `frontend/src/app/screens/AdminImportExportScreen.jsx`
- `frontend/src/app/screens/AdminOverviewScreen.jsx`
- `frontend/src/app/screens/AdminPaymentsScreen.jsx`
- `frontend/src/app/screens/AdminReportsPanel.css`
- `frontend/src/app/screens/AdminScheduleScreen.jsx`
- `frontend/src/app/screens/AdminSettingsScreen.jsx`
- `frontend/src/app/screens/AdminTrainersScreen.jsx`
- `frontend/src/app/screens/ClientScreens.jsx`
- `frontend/src/app/screens/TrainerScreens.jsx`

#### Frontend: runtime-дизайн

- `frontend/src/design/_ds_bundle.js`
- `frontend/src/design/appearance.json`
- `frontend/src/design/styles.css`
- `frontend/src/design/tokens/appearance.css`
- `frontend/src/design/tokens/base.css`
- `frontend/src/design/tokens/themes.css`

#### Frontend: тесты

- `frontend/test/design-bundle-generator.test.js`
- `frontend/test/preview-feedback.test.js`
- `frontend/test/schedule-palette.test.js`
- `frontend/test/theme.test.js`
- `frontend/tests/attendance-payment.spec.js`
- `frontend/tests/client-search-trainer-reactivation.spec.js`
- `frontend/tests/locale-switcher.spec.js`
- `frontend/tests/navigation.spec.js`
- `frontend/tests/new-clients-modal.spec.js`
- `frontend/tests/smoke.spec.js`
- `frontend/tests/ui-css-regressions.spec.js`
- `frontend/tests/wave2-lists.spec.js`
- `frontend/tests/wave5-settings-schedule.spec.js`

#### Скрипты

- `scripts/generate-design-bundle.mjs`
- `scripts/sync-design-frontend.ps1`
- `scripts/verify-design-runtime.ps1`

#### Backend

- `swimcrm/attendance/migrations/0004_attendance_payment_source.py`
- `swimcrm/attendance/models.py`
- `swimcrm/attendance/services.py`
- `swimcrm/portal/admin_client_views.py`
- `swimcrm/portal/admin_schedule_views.py`
- `swimcrm/portal/admin_subscription_views.py`
- `swimcrm/portal/client_views.py`
- `swimcrm/portal/dev_appearance.py`
- `swimcrm/portal/openapi.py`
- `swimcrm/portal/support.py`
- `swimcrm/portal/urls.py`
- `swimcrm/subscriptions/services.py`
- `swimcrm/tests/test_attendance_payment.py`
- `swimcrm/tests/test_dev_appearance.py`
- `swimcrm/tests/test_portal_api.py`

## Последующие изменения

После `c2422ab` коммит `7bd1bda` уточнил отображение списаний за посещения в карточке клиента. Следующий коммит объединяет текущие локальные изменения: отмену продажи абонемента и связанного начисления, цену продажи в пределах каталога, мобильный вид модального окна, изменения карточки и списка клиентов, настройки внешнего вида и соответствующие тесты и документы.
