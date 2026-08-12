import { expect, test } from '@playwright/test'


const EMPTY_ADMIN = {
  '/api/admin/dashboard/': {},
  '/api/admin/reference/': { trainers: [], groups: [], subscription_types: [], locations: [], participants: [], choices: {} },
  '/api/admin/clients/': { clients: [] },
  '/api/admin/trainers/': { trainers: [] },
  '/api/admin/groups/': { groups: [] },
  '/api/admin/subscription-types/': { subscription_types: [] },
  '/api/admin/settings/session-types/': { session_types: [] },
  '/api/admin/schedule/sessions/': { sessions: [] },
  '/api/admin/payments/': { payments: [] },
  '/api/admin/debtors/': { debtors: [] },
}

function currentWarsawMonth() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]))
  const lastDay = new Date(Date.UTC(Number(parts.year), Number(parts.month), 0)).getUTCDate()
  return {
    from: `${parts.year}-${parts.month}-01`,
    to: `${parts.year}-${parts.month}-${String(lastDay).padStart(2, '0')}`,
  }
}

test('admin reports share the current-month period, filter trainers, show income, and export current filters', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop contract check is sufficient')
  const expectedPeriod = currentWarsawMonth()
  const requests = []

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    requests.push(`${path}?${url.searchParams.toString()}`)

    if (path.endsWith('/xlsx/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers: { 'content-disposition': 'attachment; filename="report.xlsx"' },
        body: 'xlsx-test',
      })
      return
    }

    let status = 200
    let payload = EMPTY_ADMIN[path]
    if (path === '/api/me/') payload = { id: 1, username: 'admin', full_name: 'Admin User', role: 'admin' }
    else if (path === '/api/csrf/') payload = { ok: true }
    else if (path === '/api/admin/reports/session-counts/') payload = {
      date_from: url.searchParams.get('date_from'),
      date_to: url.searchParams.get('date_to'),
      trainer_id: null,
      rows: [
        { trainer_id: 1, trainer: 'Anna Active', is_active: true, group: 2, individual: 1, split: 1, total: 4 },
        { trainer_id: 2, trainer: 'Borys Historical', is_active: false, group: 1, individual: 0, split: 0, total: 1 },
      ],
      totals: { group: 3, individual: 1, split: 1, total: 5 },
    }
    else if (path === '/api/admin/reports/income/') payload = {
      date_from: url.searchParams.get('date_from'),
      date_to: url.searchParams.get('date_to'),
      total: '350,00 PLN',
      total_minor: 35000,
      cash: '100,00 PLN',
      cash_minor: 10000,
      non_cash: '250,00 PLN',
      non_cash_minor: 25000,
      currency: url.searchParams.get('currency') || 'PLN',
      available_currencies: ['PLN', 'EUR', 'USD'],
      payments: [{ id: 11, paid_at: '2026-08-12', participant: 'Client One', method_label: 'Карта', amount: '250,00 PLN' }],
      pagination: { page: 1, pages: 1, total: 1, has_previous: false, has_next: false },
      by_group: [],
      by_trainer: [],
    }
    if (!payload) {
      status = 404
      payload = { error: `Unhandled test endpoint: ${request.method()} ${path}` }
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
  })

  await page.goto('/')
  await page.locator('.ops-nav-button[title="Настройки"]').click()
  await page.getByRole('tab', { name: 'Отчёты' }).click()

  await expect(page.getByRole('textbox', { name: 'Период с' })).toHaveValue(expectedPeriod.from)
  await expect(page.getByRole('textbox', { name: 'Период по' })).toHaveValue(expectedPeriod.to)
  await expect(page.getByRole('row', { name: /Anna Active/ }).getByRole('cell')).toHaveText(['Anna Active', '2', '1', '1', '4'])
  await expect(page.getByRole('row', { name: /Итого по школе/ }).getByRole('cell')).toHaveText(['Итого по школе', '3', '1', '1', '5'])

  await page.getByLabel('Тренер', { exact: true }).selectOption('2')
  await expect(page.getByRole('row', { name: /Anna Active/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /Borys Historical/ }).getByRole('cell')).toHaveText(['Borys Historical', '1', '0', '0', '1'])
  const sessionDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать XLSX' }).click()
  await sessionDownload

  await page.getByRole('tab', { name: 'Поступления' }).click()
  await expect(page.getByText('350,00 PLN')).toBeVisible()
  await expect(page.getByText('100,00 PLN')).toBeVisible()
  await expect(page.getByText('250,00 PLN')).toHaveCount(2)
  await expect(page.getByRole('row', { name: /Client One/ }).getByRole('cell')).toHaveText(['2026-08-12', 'Client One', 'Карта', '250,00 PLN'])
  const incomeDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать XLSX' }).click()
  await incomeDownload

  expect(requests).toContain(`/api/admin/reports/session-counts/?date_from=${expectedPeriod.from}&date_to=${expectedPeriod.to}`)
  expect(requests).toContain(`/api/admin/reports/session-counts/xlsx/?date_from=${expectedPeriod.from}&date_to=${expectedPeriod.to}&trainer_id=2`)
  expect(requests).toContain(`/api/admin/reports/income/xlsx/?date_from=${expectedPeriod.from}&date_to=${expectedPeriod.to}&currency=PLN`)
})
