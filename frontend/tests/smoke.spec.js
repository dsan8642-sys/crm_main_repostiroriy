import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', service: 'swimcrm' }),
    })
  })
  await page.route('**/api/me/', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Login required' }),
    })
  })
})

test('SPA renders without a blank shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()
  await expect(page.getByText('SwimCRM').first()).toBeVisible()

  const bodyText = (await page.locator('body').innerText()).trim()
  expect(bodyText.length).toBeGreaterThan(20)
})

test('icon-only buttons have accessible names', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()

  const unnamedIconButtons = await page.locator('button').evaluateAll((buttons) => (
    buttons.filter((button) => {
      const visibleText = button.textContent?.trim()
      return !visibleText && !button.getAttribute('aria-label') && !button.getAttribute('title')
    }).length
  ))

  expect(unnamedIconButtons).toBe(0)
})

test('admin critical screens render with API-backed data', async ({ page }) => {
  const now = '2026-07-16T17:00:00+02:00'
  const seenAdminEndpoints = new Set()
  const requiredAdminBootstrapEndpoints = [
    '/api/admin/dashboard/',
    '/api/admin/reference/',
    '/api/admin/clients/',
    '/api/admin/trainers/',
    '/api/admin/groups/',
    '/api/admin/subscription-types/',
    '/api/admin/schedule/templates/',
    '/api/admin/schedule/sessions/',
    '/api/admin/payments/',
    '/api/admin/debtors/',
  ]
  const routes = {
    '/api/health/': { status: 'ok', service: 'swimcrm' },
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 1, active_subscriptions: 1, debtors: 1 } },
    '/api/admin/reference/': {
      trainers: [{ id: 1, full_name: 'Marek Zielinski' }],
      groups: [{ id: 1, name: 'Delfiny' }],
      subscription_types: [{ id: 1, name: '8 wejsc', price_minor: 24000, currency: 'PLN' }],
      locations: [{ id: 1, code: 'pool-a', name: 'Basen A' }],
      session_types: [
        { value: 'group', label: 'Grupowe' },
        { value: 'individual', label: 'Indywidualne' },
        { value: 'split', label: 'Split' },
      ],
      participants: [{ id: 1, full_name: 'Jan Kowalski' }],
      choices: {
        payment_methods: [
          { value: 'cash', label: 'Gotowka' },
          { value: 'bank_transfer', label: 'Przelew bankowy' },
        ],
        notification_channels: [
          { value: 'email', label: 'Email' },
          { value: 'sms', label: 'SMS' },
        ],
      },
      notification_settings: {
        quiet_hours: { enabled: true, start: '22:00', end: '07:00', defer_until_allowed: true },
      },
    },
    '/api/admin/clients/': {
      clients: [{
        id: 1,
        client_id: 10,
        first_name: 'Jan',
        last_name: 'Kowalski',
        full_name: 'Jan Kowalski',
        birth_date: '2016-05-10',
        email: 'jan@example.com',
        client_phone: '+48111222333',
        is_account_holder: false,
        is_active: true,
        group: { id: 1, name: 'Delfiny' },
      }],
    },
    '/api/admin/trainers/': {
      trainers: [{ id: 1, username: 'marek', full_name: 'Marek Zielinski', email: 'm@example.com', phone: '+48000111222', is_active: true, groups_count: 1 }],
    },
    '/api/admin/groups/': {
      groups: [{ id: 1, name: 'Delfiny', description: 'Grupa testowa', default_trainer: { id: 1, name: 'Marek Zielinski' }, participants_count: 1, is_active: true }],
    },
    '/api/admin/subscription-types/': {
      subscription_types: [{ id: 1, name: '8 wejsc', price_minor: 24000, currency: 'PLN', duration_days: 30, sessions_count: 8, is_unlimited: false, is_individual: false, is_active: true }],
    },
    '/api/admin/schedule/templates/': {
      templates: [{ id: 1, group: { id: 1, name: 'Delfiny' }, trainer: { id: 1, name: 'Marek Zielinski' }, weekday: 4, weekday_label: 'Czwartek', start_time: '17:00', end_time: '18:00', location: 'Basen A', max_participants: 8, is_active: true }],
    },
    '/api/admin/schedule/sessions/': {
      sessions: [{ id: 1, start_at: now, end_at: '2026-07-16T18:00:00+02:00', location: 'Basen A', trainer_id: 1, trainer: 'Marek Zielinski', group: { id: 1, name: 'Delfiny' }, is_cancelled: false, max_participants: 8, notes: '' }],
    },
    '/api/admin/payments/': {
      payments: [{ id: 1, participant_id: 1, participant: 'Jan Kowalski', amount_minor: 24000, currency: 'PLN', paid_at: '2026-07-16', method: 'bank_transfer', status: 'pending', comment: '' }],
    },
    '/api/admin/debtors/': {
      debtors: [{ student: { id: 1, client_id: 10, full_name: 'Jan Kowalski', client_phone: '+48111222333', group: { id: 1, name: 'Delfiny' } }, reasons: ['Przeterminowana platnosc'], balance_minor: 24000, currency: 'PLN' }],
    },
    '/api/admin/participants/1/subscriptions/': {
      subscriptions: [{ id: 1, type: '8 wejsc', status: 'active', remaining_sessions: 7 }],
    },
  }

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const payload = routes[url.pathname]
    if (url.pathname.startsWith('/api/admin/')) {
      seenAdminEndpoints.add(url.pathname)
    }
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled smoke endpoint: ${url.pathname}` }),
    })
  })

  await page.goto('/')
  await expect(page.locator('h2.page-title', { hasText: 'Przeglad' })).toBeVisible()
  await expect(page.getByText('Marek Zielinski').first()).toBeVisible()

  await page.getByRole('button', { name: /Klienci/ }).click()
  await expect(page.locator('h2.page-title', { hasText: 'Klienci' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Kowalski Jan/ })).toBeVisible()

  await page.getByRole('button', { name: /Grafik/ }).click()
  await expect(page.locator('h2.page-title', { hasText: 'Grafik' })).toBeVisible()
  await expect(page.getByText('Basen A').first()).toBeVisible()

  await page.getByRole('button', { name: /Platnosci/ }).click()
  await expect(page.locator('h2.page-title', { hasText: 'Platnosci' })).toBeVisible()
  await expect(page.getByText('bank_transfer').first()).toBeVisible()

  await page.getByRole('button', { name: /Dluznicy/ }).click()
  await expect(page.locator('h2.page-title', { hasText: 'Dluznicy' })).toBeVisible()
  await expect(page.getByText('Przeterminowana platnosc').first()).toBeVisible()

  for (const endpoint of requiredAdminBootstrapEndpoints) {
    expect(seenAdminEndpoints, `admin bootstrap should request ${endpoint}`).toContain(endpoint)
  }
})
