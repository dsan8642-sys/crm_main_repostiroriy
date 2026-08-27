import { expect, test } from '@playwright/test'

const PARTICIPANT = {
  id: 1,
  client_id: 101,
  first_name: 'Anna',
  last_name: 'Nowak',
  client_phone: '+48111111111',
  email: 'anna@example.test',
  is_active: true,
  client_is_active: true,
  group: null,
}

const ROUTES = {
  '/api/me/': { id: 17, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
  '/api/health/': { status: 'ok', service: 'swimcrm' },
  '/api/csrf/': { ok: true },
  '/api/admin/dashboard/': { metrics: { clients: 1, active_subscriptions: 0, debtors: 0 } },
  '/api/admin/reference/': {
    trainers: [],
    groups: [],
    subscription_types: [],
    locations: [],
    session_types: [],
    participants: [PARTICIPANT],
    choices: { payment_methods: [], notification_channels: [] },
    notification_settings: {},
  },
  '/api/admin/clients/': { clients: [PARTICIPANT] },
  '/api/admin/trainers/': { trainers: [] },
  '/api/admin/groups/': { groups: [] },
  '/api/admin/subscription-types/': { subscription_types: [] },
  '/api/admin/settings/session-types/': { session_types: [] },
  '/api/admin/schedule/sessions/': { sessions: [] },
  '/api/admin/payments/': { payments: [] },
  '/api/admin/debtors/': { debtors: [] },
  '/api/admin/clients/101/': {
    account: {
      id: 101,
      full_name: 'Anna Nowak',
      username: 'anna-nowak',
      email: 'anna@example.test',
      phone: '+48111111111',
      preferred_language: 'pl',
      is_active: true,
    },
    participants: [{ ...PARTICIPANT, full_name: 'Anna Nowak', balance_minor: 0 }],
    subscriptions: [],
    charges: [],
    payments: [],
    attendance: [],
    consents: [],
    summary: { balance_minor: 0, pending_payments: 0, active_participants: 1, active_subscriptions: 0 },
  },
}

async function mockAdminFinance(page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const payload = ROUTES[path]
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled finance locale endpoint: ${path}` }),
    })
  })
}

function localeSelector(page) {
  return page.locator('select').filter({ has: page.locator('option[value="uk"]') }).first()
}

test('admin payments switches RU to UK, PL and EN without mixed finance headings', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop locale contract is sufficient')
  await mockAdminFinance(page)

  await page.goto('/?role=admin&view=payments')
  const selector = localeSelector(page)

  await expect(page.getByRole('heading', { name: 'Платежи', exact: true })).toBeVisible()
  await selector.selectOption('uk')
  await expect(page.getByRole('heading', { name: 'Платежі', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Платежи', exact: true })).toHaveCount(0)

  await selector.selectOption('pl')
  await expect(page.getByRole('heading', { name: 'Płatności', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Saldo klienta/ })).toBeVisible()

  await selector.selectOption('en')
  await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Client balance/ })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('swimcrm.ui.locale.17.admin'))).toBe('en')
})

test('client detail localizes independently from its notification language', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop client locale contract is sufficient')
  await mockAdminFinance(page)

  await page.goto('/?role=admin&view=clientDetail&client=101')
  const selector = localeSelector(page)

  await selector.selectOption('uk')
  await expect(page.getByRole('button', { name: /Поповнити баланс/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Учасники/ })).toBeVisible()

  await selector.selectOption('pl')
  await expect(page.getByRole('button', { name: /Doładuj saldo/ })).toBeVisible()

  await selector.selectOption('en')
  await expect(page.getByRole('button', { name: /Top up balance/ })).toBeVisible()
  await page.getByRole('button', { name: 'Edit client', exact: true }).click()

  const notificationLanguage = page.getByRole('dialog', { name: 'Edit client' }).getByLabel('Notification language')
  await expect(notificationLanguage).toHaveValue('pl')
  await expect(notificationLanguage.locator('option')).toHaveCount(3)
  await expect(notificationLanguage.locator('option[value="uk"]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('swimcrm.ui.locale.17.admin'))).toBe('en')
})
