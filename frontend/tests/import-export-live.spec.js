import { expect, test } from '@playwright/test'

const liveAudit = process.env.SWIMCRM_LIVE_AUDIT_E2E === '1'
const username = process.env.SWIMCRM_E2E_LOGIN || ''
const password = process.env.SWIMCRM_E2E_PASSWORD || ''

test('live audit DB: admin reassigns and imports a payment export', async ({ page }) => {
  test.setTimeout(60_000)
  test.skip(!liveAudit, 'requires the isolated live audit environment')
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'single desktop import workflow')
  expect(username).not.toBe('')
  expect(password).not.toBe('')

  await page.goto('/')
  await page.getByLabel('Логин или email').fill(username)
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.locator('.ops-nav-button[title="Настройки"]')).toBeVisible()

  const clients = await page.evaluate(async () => {
    const response = await fetch('/api/admin/clients/')
    if (!response.ok) throw new Error(`clients request failed: ${response.status}`)
    return (await response.json()).clients
  })
  const target = clients.find((participant) => participant.email)
  expect(target?.id).toBeTruthy()

  const referenceId = `AUDIT-LIVE-E2E-${Date.now()}`
  const crmExport = Buffer.from(
    'schema_version;exported_at;source_system;entity_type;client_email [Email клиента];amount [Сумма];currency [Валюта];paid_at [Дата];method [Способ];status [Статус];comment [Комментарий];reference_id [Reference ID]\r\n' +
    `1;2026-08-07T15:00:00+02:00;swimcrm;payments;unmatched-live-e2e@example.test;73.41;PLN;2026-08-07;cash;confirmed;Synthetic live E2E;${referenceId}\r\n`,
  )

  await page.locator('.ops-nav-button[title="Настройки"]').click()
  await page.getByRole('tab', { name: 'Контроль', exact: true }).click()
  await page.getByRole('button', { name: /Импорт и экспорт/ }).click()
  await page.getByRole('tab', { name: 'Оплаты', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: `${referenceId}.csv`, mimeType: 'text/csv', buffer: crmExport,
  })
  await expect(page.getByText(/Собственный export CRM распознан автоматически/)).toBeVisible()
  await expect(page.getByText('Клиент не найден').first()).toBeVisible()

  await page.getByRole('button', { name: 'Исправить', exact: true }).click()
  const editor = page.locator('.card').filter({ hasText: 'Исправление строки 2' }).last()
  await editor.getByLabel('Сумма *').fill('73.42')
  const amountPatch = page.waitForResponse((response) =>
    response.request().method() === 'PATCH'
      && /\/api\/admin\/import\/payments\/\d+\/rows\/2\/$/.test(response.url()))
  await editor.getByRole('button', { name: 'Сохранить исправления' }).click()
  await amountPatch
  await expect(editor).toBeHidden()
  await page.getByRole('button', { name: 'Исправить', exact: true }).click()
  const reopenedEditor = page.locator('.card')
    .filter({ hasText: 'Исправление строки 2' }).last()
  await expect(reopenedEditor).toBeVisible()
  await reopenedEditor.getByPlaceholder(
    'ID, email, телефон, имя или дата рождения').fill(target.email)
  const findButton = reopenedEditor.getByRole('button', { name: 'Найти клиента' })
  await expect(findButton).toBeEnabled()
  await findButton.click()
  const relationPatch = page.waitForResponse((response) =>
    response.request().method() === 'PATCH'
      && /\/api\/admin\/import\/payments\/\d+\/rows\/2\/$/.test(response.url()))
  await reopenedEditor.getByRole(
    'button', { name: new RegExp(`ID ${target.id}(?:\\s|·)`) }).click()
  await relationPatch
  await expect(reopenedEditor).toBeHidden()

  await page.getByLabel('Выбрать строку 2').check()
  await page.getByRole('button', { name: 'Подтвердить импорт выбранных строк' }).click()
  await expect(page.getByText(/created: 1/)).toBeVisible()

  const created = await page.evaluate(async (reference) => {
    const response = await fetch('/api/admin/payments/')
    if (!response.ok) throw new Error(`payments request failed: ${response.status}`)
    return (await response.json()).payments.find((payment) => payment.reference_id === reference)
  }, referenceId)
  expect(created?.participant_id).toBe(target.id)
  expect(created?.amount_minor).toBe(7342)
  await page.screenshot({
    path: '../audit/import-export/e2e-live-import-result.png', fullPage: true,
  })

  await page.locator('input[type="file"]').setInputFiles({
    name: `${referenceId}.csv`, mimeType: 'text/csv', buffer: crmExport,
  })
  await expect(page.getByText(/Этот файл уже был импортирован/)).toBeVisible()
  await page.screenshot({
    path: '../audit/import-export/e2e-live-duplicate-warning.png', fullPage: true,
  })
})
