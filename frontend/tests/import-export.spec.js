import { expect, test } from '@playwright/test'

test('admin stages, fixes, reassigns and commits a CRM payment export', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'single desktop import workflow')
  let committed = false
  let stagedRow = {
    index: 2,
    row_key: 'synthetic-row-key',
    status: 'error',
    action: 'resolve',
    excluded: false,
    data: {
      client_email: 'missing@example.test', amount: '75.25', currency: 'PLN',
      paid_at: '2026-03-20', method: 'cash', status: 'confirmed',
      comment: 'synthetic E2E', reference_id: 'e2e-ref-1',
    },
    errors: ['Клиент не найден'],
    warnings: [],
    resolved: { matching_reason: 'Клиент не найден', matching_confidence: 'none' },
  }
  const empty = {
    '/api/admin/dashboard/': { metrics: {} },
    '/api/admin/reference/': { trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [], choices: { payment_methods: [], notification_channels: [] }, notification_settings: {} },
    '/api/admin/clients/': { clients: [] },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': { sessions: [] },
    '/api/admin/debtors/': { debtors: [] },
    '/api/admin/payroll/schemes/': { schemes: [] },
    '/api/admin/payroll/rules/': { rules: [] },
    '/api/admin/payroll/assignments/': { assignments: [] },
    '/api/admin/payroll/periods/': { periods: [] },
    '/api/admin/notifications/logs/': { logs: [] },
    '/api/admin/notifications/templates/': { templates: [] },
    '/api/admin/notifications/rules/': { rules: [] },
    '/api/admin/notifications/quiet-hours/': { policies: [] },
    '/api/admin/settings/locations/': { locations: [] },
    '/api/admin/settings/languages/': { languages: [] },
    '/api/admin/settings/dictionary-keys/': { keys: [] },
    '/api/admin/settings/dictionary-translations/': { translations: [] },
    '/api/admin/settings/notification-template-translations/': { translations: [] },
    '/api/admin/system/audit/': { entries: [] },
    '/api/admin/system/security/': { users: [] },
    '/api/admin/system/credentials/': { username: 'admin', role: 'admin' },
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    let payload = empty[path]
    let status = 200

    if (path === '/api/health/') payload = { status: 'ok', service: 'swimcrm' }
    else if (path === '/api/csrf/') payload = { ok: true }
    else if (path === '/api/me/') payload = { id: 1, username: 'admin', role: 'admin', full_name: 'Synthetic Admin' }
    else if (path === '/api/admin/payments/') payload = { payments: committed ? [{
      id: 501, participant_id: 77, participant: 'Ручной Клиент', amount_minor: 7625,
      currency: 'PLN', paid_at: '2026-03-20', method: 'cash', status: 'confirmed',
      comment: 'synthetic E2E', reference_id: 'e2e-ref-1',
    }] : [] }
    else if (path === '/api/admin/system/imports/') payload = { batches: committed ? [{
      id: 41, kind: 'payments', source_name: 'payments.csv', status: 'committed',
      rows_total: 1, rows_imported: 1, created: 1, updated: 0, skipped: 0,
      errors_count: 0, report_available: true,
      rollback_strategy: { kind: 'compensating_only', label: 'Платёжный журнал неизменяем.' },
    }] : [] }
    else if (path === '/api/admin/import/client-search/') payload = { clients: [{
      id: 77, name: 'Ручной Клиент', email: 'manual@example.test',
      phone: '+48555111222', birth_date: '2014-05-06',
    }] }
    else if (path === '/api/admin/import/payments/preview/') payload = {
      batch_id: committed ? 42 : 41,
      headers: ['schema_version', 'client_email [Email клиента]', 'amount [Сумма]'],
      mapping: { 'client_email [Email клиента]': 'client_email', 'amount [Сумма]': 'amount' },
      metadata: { schema_version: '1', source_system: 'swimcrm', entity_type: 'payments' },
      own_export: true,
      duplicate_file: committed,
      source_samples: { 'client_email [Email клиента]': 'missing@example.test', 'amount [Сумма]': '75.25' },
      field_options: [
        { key: 'client_id', label: 'Client internal ID', editable: false, relation: 'clients' },
        { key: 'client_email', label: 'Email клиента', editable: true, relation: 'clients' },
        { key: 'amount', label: 'Сумма', editable: true, required: true },
        { key: 'currency', label: 'Валюта', editable: true },
        { key: 'paid_at', label: 'Дата', editable: true, required: true },
        { key: 'method', label: 'Способ', editable: true, required: true },
        { key: 'status', label: 'Статус', editable: true },
        { key: 'comment', label: 'Комментарий', editable: true },
        { key: 'reference_id', label: 'Reference ID', editable: true },
      ],
      rows: committed ? [{ ...stagedRow, status: 'duplicate', action: 'skip', errors: ['Платёж уже существует'] }] : [stagedRow],
      counts: { total: 1, [committed ? 'duplicate' : stagedRow.status]: 1, excluded: 0 },
      unused_headers: [], required_missing: [],
    }
    else if (/\/api\/admin\/import\/payments\/41\/rows\/2\/$/.test(path)) {
      const body = request.postDataJSON()
      if (body.data) stagedRow = { ...stagedRow, data: { ...stagedRow.data, ...body.data } }
      if (body.relations?.client_id) stagedRow = {
        ...stagedRow,
        status: 'new', action: 'create', errors: [],
        resolved: {
          student_id: body.relations.client_id,
          matching_reason: 'Клиент выбран вручную', matching_confidence: 'manual',
        },
      }
      payload = { batch_id: 41, row: stagedRow, counts: { total: 1, [stagedRow.status]: 1, excluded: 0 } }
    }
    else if (path === '/api/admin/import/payments/commit/') {
      committed = true
      payload = { batch_id: 41, created: 1, updated: 0, skipped: 0, errors: [] }
      status = 201
    }
    else {
      payload = payload || { error: `Unhandled E2E endpoint: ${path}` }
      status = payload.error ? 404 : 200
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
  })

  await page.goto('/')
  await page.locator('.ops-nav-button[title="Настройки"]').click()
  await page.getByRole('tab', { name: 'Контроль', exact: true }).click()
  await page.getByRole('button', { name: /Импорт и экспорт/ }).click()
  await page.getByRole('tab', { name: 'Оплаты', exact: true }).click()

  const crmExport = Buffer.from(
    'schema_version;exported_at;source_system;entity_type;client_email [Email клиента];amount [Сумма]\r\n' +
    '1;2026-08-07T12:00:00+02:00;swimcrm;payments;missing@example.test;75.25\r\n',
  )
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles({ name: 'payments.csv', mimeType: 'text/csv', buffer: crmExport })
  await expect(page.getByText(/Собственный export CRM распознан автоматически/)).toBeVisible()
  await page.getByRole('combobox').filter({ has: page.locator('option[value="unmatched"]') }).selectOption('unmatched')
  await expect(page.getByRole('cell', { name: 'Клиент не найден' }).first()).toBeVisible()
  await page.getByRole('combobox').filter({ has: page.locator('option[value="unmatched"]') }).selectOption('all')

  await page.getByRole('button', { name: 'Исправить', exact: true }).click()
  await page.getByRole('textbox', { name: 'Сумма *', exact: true }).fill('76.25')
  await page.getByRole('button', { name: 'Сохранить исправления' }).click()
  await page.getByRole('button', { name: 'Исправить', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Исправление строки 2' })
  await expect(editor).toBeVisible()
  await editor.getByPlaceholder('ID, email, телефон, имя или дата рождения').fill('manual@example.test')
  await editor.getByRole('button', { name: 'Найти клиента' }).click()
  await editor.getByRole('button', { name: /Ручной Клиент · ID 77/ }).click()
  await page.getByLabel('Выбрать строку 2').check()
  await page.getByRole('button', { name: 'Подтвердить импорт выбранных строк' }).click()
  await expect(page.getByText(/created: 1/)).toBeVisible()

  await page.locator('.ops-nav-button[title="Платежи"]').click()
  await page.getByRole('tab', { name: /Подтверждённые 1/ }).click()
  await expect(page.getByText('Ручной Клиент', { exact: true })).toBeVisible()
  await expect(page.getByText(/76[,.]25|7 625|7625/).first()).toBeVisible()

  await page.locator('.ops-nav-button[title="Настройки"]').click()
  await page.getByRole('tab', { name: 'Контроль', exact: true }).click()
  await page.getByRole('button', { name: /Импорт и экспорт/ }).click()
  await page.getByRole('tab', { name: 'Оплаты', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: 'payments.csv', mimeType: 'text/csv', buffer: crmExport })
  await expect(page.getByText(/Этот файл уже был импортирован/)).toBeVisible()
})
