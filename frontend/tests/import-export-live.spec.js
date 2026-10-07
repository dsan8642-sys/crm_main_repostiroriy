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
  await page.locator('#auth-login').fill(username)
  await page.locator('input[autocomplete="current-password"]').fill(password)
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('nav-admin-settings').first()).toBeVisible()

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

  await page.getByTestId('nav-admin-settings').first().click()
  await page.getByTestId('admin-settings-category-control').first().click()
  await page.getByTestId('admin-settings-resource-importExport').first().click()
  await page.getByTestId('admin-import-tab-payments').click()
  await page.locator('input[type="file"]').setInputFiles({
    name: `${referenceId}.csv`, mimeType: 'text/csv', buffer: crmExport,
  })
  await expect(page.getByTestId('admin-import-own-export')).toBeVisible()
  await expect(page.getByTestId('admin-import-row-edit-2')).toBeVisible()

  await page.getByTestId('admin-import-row-edit-2').click()
  const editor = page.getByTestId('form-modal')
  await editor.locator('#admin-import-edit-amount').fill('73.42')
  const amountPatch = page.waitForResponse((response) =>
    response.request().method() === 'PATCH'
      && /\/api\/admin\/import\/payments\/\d+\/rows\/2\/$/.test(response.url()))
  await editor.locator('.form-modal__footer button').last().click()
  await amountPatch
  await expect(editor).toBeHidden()
  await page.getByTestId('admin-import-row-edit-2').click()
  const reopenedEditor = page.getByTestId('form-modal')
  await expect(reopenedEditor).toBeVisible()
  await reopenedEditor.getByTestId('admin-import-client-search').fill(target.email)
  const findButton = reopenedEditor.getByTestId('admin-import-client-search-submit')
  await expect(findButton).toBeEnabled()
  await findButton.click()
  const relationPatch = page.waitForResponse((response) =>
    response.request().method() === 'PATCH'
      && /\/api\/admin\/import\/payments\/\d+\/rows\/2\/$/.test(response.url()))
  await reopenedEditor.getByTestId(`admin-import-client-${target.id}`).click()
  await relationPatch
  await expect(reopenedEditor).toBeHidden()

  await page.getByTestId('admin-import-row-select-2').check()
  await page.locator('#admin-import-payments-selected-indices').click()

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
  await expect(page.getByTestId('admin-import-duplicate-file')).toBeVisible()
  await page.screenshot({
    path: '../audit/import-export/e2e-live-duplicate-warning.png', fullPage: true,
  })
})
