import { expect, test } from '@playwright/test'

const EMPTY_PAGE = { pagination: { page: 1, page_size: 200, total: 0, pages: 0, has_next: false, has_previous: false } }
const SUBSCRIPTION_TYPE = {
  id: 1,
  name: 'Karnet Flex',
  price_minor: 7000,
  currency: 'PLN',
  duration_days: 30,
  sessions_count: 4,
  is_individual: false,
  is_active: true,
}

const ROUTES = {
  '/api/health/': { status: 'ok', service: 'swimcrm' },
  '/api/csrf/': { ok: true },
  '/api/me/': { id: 17, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
  '/api/admin/dashboard/': { metrics: { clients: 0, active_subscriptions: 0, debtors: 0 } },
  '/api/admin/reference/': {
    trainers: [], groups: [], subscription_types: [SUBSCRIPTION_TYPE], locations: [],
    session_types: [], participants: [], choices: { payment_methods: [], notification_channels: [] },
    notification_settings: {},
  },
  '/api/admin/clients/': { clients: [], ...EMPTY_PAGE },
  '/api/admin/trainers/': { trainers: [], ...EMPTY_PAGE },
  '/api/admin/groups/': { groups: [], ...EMPTY_PAGE },
  '/api/admin/subscription-types/': { subscription_types: [SUBSCRIPTION_TYPE], ...EMPTY_PAGE },
  '/api/admin/settings/locations/': { locations: [], ...EMPTY_PAGE },
  '/api/admin/settings/session-types/': { session_types: [], ...EMPTY_PAGE },
  '/api/admin/notifications/templates/': { templates: [], ...EMPTY_PAGE },
  '/api/admin/notifications/rules/': { rules: [], ...EMPTY_PAGE },
  '/api/admin/notifications/quiet-hours/': { policies: [], ...EMPTY_PAGE },
  '/api/admin/settings/notification-template-translations/': { translations: [], ...EMPTY_PAGE },
  '/api/admin/payroll/schemes/': { schemes: [], ...EMPTY_PAGE },
  '/api/admin/payroll/rules/': { rules: [], ...EMPTY_PAGE },
  '/api/admin/payroll/assignments/': { assignments: [], ...EMPTY_PAGE },
  '/api/admin/payroll/periods/': { periods: [], ...EMPTY_PAGE },
  '/api/admin/settings/languages/': { languages: [], ...EMPTY_PAGE },
  '/api/admin/settings/dictionary-keys/': { keys: [], ...EMPTY_PAGE },
  '/api/admin/settings/dictionary-translations/': { translations: [], ...EMPTY_PAGE },
  '/api/admin/system/audit/': { entries: [], ...EMPTY_PAGE },
  '/api/admin/system/imports/': { batches: [], ...EMPTY_PAGE },
  '/api/admin/system/security/': { users: [], ...EMPTY_PAGE },
  '/api/admin/notifications/logs/': { logs: [], ...EMPTY_PAGE },
  '/api/admin/schedule/sessions/': { sessions: [], ...EMPTY_PAGE },
  '/api/admin/payments/': { payments: [], ...EMPTY_PAGE },
  '/api/admin/debtors/': { debtors: [], ...EMPTY_PAGE },
}

test('admin settings switches RU, UK, PL and EN while entity names stay unchanged', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop locale contract is sufficient')
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const payload = ROUTES[path]
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled admin locale endpoint: ${path}` }),
    })
  })

  await page.goto('/?role=admin&view=settings')
  const localeSelector = page.locator('select').filter({ has: page.locator('option[value="uk"]') }).first()

  await expect(page.getByRole('heading', { level: 1, name: 'Настройки и контроль' })).toBeVisible()
  await expect(page.getByText('Karnet Flex', { exact: true })).toBeVisible()

  await localeSelector.selectOption('uk')
  await expect(page.getByRole('heading', { level: 1, name: 'Налаштування та контроль' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки и контроль' })).toHaveCount(0)
  await expect(page.getByText('Karnet Flex', { exact: true })).toBeVisible()

  await localeSelector.selectOption('pl')
  await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia i kontrola' })).toBeVisible()
  await expect(page.getByText('Typy karnetów', { exact: true }).first()).toBeVisible()

  await localeSelector.selectOption('en')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings and control' })).toBeVisible()
  await expect(page.getByText('Subscription types', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Karnet Flex', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('swimcrm.ui.locale.17.admin'))).toBe('en')
})
