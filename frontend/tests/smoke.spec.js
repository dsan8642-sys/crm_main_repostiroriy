import { expect, test } from '@playwright/test'

async function mockPortal(page, routes) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const payload = url.pathname === '/api/health/'
      ? { status: 'ok', service: 'swimcrm' }
      : routes[url.pathname]
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled smoke endpoint: ${url.pathname}` }),
    })
  })
}

function collectPageErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      errors.push(`console ${message.type()}: ${message.text()} ${message.location().url}`)
    }
  })
  return errors
}

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
  await expect(
    page.getByRole('heading', { name: 'SwimCRM', exact: true }),
  ).toBeVisible({ timeout: 15_000 })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const motionDurations = await page.locator('.app').evaluate((element) => {
    const style = getComputedStyle(element)
    return [style.transitionDuration, style.animationDuration].map((duration) => {
      const first = duration.split(',')[0].trim()
      return first.endsWith('ms') ? Number.parseFloat(first) / 1000 : Number.parseFloat(first)
    })
  })
  expect(Math.max(...motionDurations)).toBeLessThanOrEqual(0.001)

  const bodyText = (await page.locator('body').innerText()).trim()
  expect(bodyText.length).toBeGreaterThan(20)
})

test('IBM Plex assets are local and cover RU, PL and EN samples', async ({ page }) => {
  const externalFontRequests = []
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname
    if (hostname === 'fonts.googleapis.com' || hostname === 'fonts.gstatic.com') {
      externalFontRequests.push(request.url())
    }
  })

  await page.goto('/')
  const fontState = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('16px "IBM Plex Sans"', 'Zażółć gęślą jaźń — Привет — SwimCRM'),
      document.fonts.load('16px "IBM Plex Mono"', 'PLN 12345 / ID-42'),
    ])
    await document.fonts.ready
    return {
      sans: document.fonts.check('16px "IBM Plex Sans"', 'Zażółć gęślą jaźń — Привет — SwimCRM'),
      mono: document.fonts.check('16px "IBM Plex Mono"', 'PLN 12345 / ID-42'),
    }
  })

  expect(fontState).toEqual({ sans: true, mono: true })
  expect(externalFontRequests).toEqual([])
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
  const errors = collectPageErrors(page)
  const fixtureStart = new Date(Date.now() + 24 * 60 * 60 * 1000)
  fixtureStart.setHours(17, 0, 0, 0)
  const now = fixtureStart.toISOString()
  const fixtureEnd = new Date(fixtureStart.getTime() + 60 * 60 * 1000).toISOString()
  const seenAdminEndpoints = new Set()
  const seenClientFinanceActions = new Set()
  const submittedSettings = []
  const submittedCredentials = []
  const submittedSessions = []
  const schedulePageSizes = []
  const requiredAdminBootstrapEndpoints = [
    '/api/admin/dashboard/',
    '/api/admin/reference/',
    '/api/admin/clients/',
    '/api/admin/trainers/',
    '/api/admin/groups/',
    '/api/admin/subscription-types/',
    '/api/admin/schedule/sessions/',
    '/api/admin/payments/',
    '/api/admin/debtors/',
  ]
  const routes = {
    '/api/csrf/': { ok: true },
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
      clients: [
        {
          id: 1,
          client_id: 10,
          first_name: 'Jan',
          last_name: 'Kowalski',
          full_name: 'Jan Kowalski',
          birth_date: '2016-05-10',
          email: 'jan@example.com',
          client_phone: '+48111222333',
          client_is_active: true,
          is_account_holder: false,
          is_active: true,
          group: { id: 1, name: 'Delfiny' },
        },
        {
          id: 2,
          client_id: 11,
          first_name: 'Piotr',
          last_name: 'Nowak',
          full_name: 'Piotr Nowak',
          birth_date: '2017-02-12',
          email: 'piotr@example.com',
          client_phone: '+48444555666',
          client_is_active: false,
          is_account_holder: false,
          is_active: false,
          group: { id: 2, name: 'Rekiny' },
        },
        {
          id: 3,
          client_id: 12,
          first_name: 'Aleksandra',
          last_name: 'Żółć',
          full_name: 'Aleksandra Żółć',
          birth_date: '2015-08-20',
          email: 'aleksandra@example.com',
          client_phone: '+48777888999',
          client_is_active: true,
          is_account_holder: false,
          is_active: true,
          group: null,
        },
      ],
    },
    '/api/admin/clients/10/': {
      account: { id: 10, username: 'jan-parent', full_name: 'Anna Kowalska', email: 'anna@example.com', phone: '+48111222333', is_active: true, access_activated: true, portal_access: 'active' },
      participants: [{ id: 1, client_id: 10, first_name: 'Jan', last_name: 'Kowalski', full_name: 'Jan Kowalski', birth_date: '2016-05-10', is_active: true, group: { id: 1, name: 'Delfiny' }, balance_minor: 0 }],
      subscriptions: [{ id: 1, participant_id: 1, participant: { id: 1, full_name: 'Jan Kowalski' }, type: '8 wejsc', status: 'active', remaining_sessions: 7, start_date: '2026-07-01', effective_end_date: '2026-07-31', created_at: '2026-07-01T10:00:00+02:00' }],
      charges: [],
      payments: [],
      attendance: [],
      consents: [],
      summary: { participants_count: 1, active_participants: 1, balance_minor: 0, active_subscriptions: 1, pending_payments: 0 },
    },
    '/api/admin/trainers/': {
      trainers: [{ id: 1, username: 'marek', full_name: 'Marek Zielinski', email: 'm@example.com', phone: '+48000111222', is_active: true, user_is_active: true, access_activated: true, portal_access: 'active', groups_count: 1 }],
    },
    '/api/admin/groups/': {
      groups: [{ id: 1, name: 'Delfiny', description: 'Grupa testowa', default_trainer: { id: 1, name: 'Marek Zielinski' }, participants_count: 1, is_active: true }],
    },
    '/api/admin/subscription-types/': {
      subscription_types: [{ id: 1, name: '8 wejsc', price_minor: 24000, currency: 'PLN', duration_days: 30, sessions_count: 8, is_unlimited: false, is_individual: false, is_active: true }],
    },
    '/api/admin/schedule/sessions/': {
      sessions: [
        { id: 1, start_at: now, end_at: fixtureEnd, location: 'Basen A', session_type: 'group', trainer_id: 1, trainer: 'Marek Zielinski', group: { id: 1, name: 'Delfiny' }, is_cancelled: false, max_participants: 8, participants_count: 1, notes: '' },
        { id: 2, start_at: new Date(fixtureStart.getTime() + 2 * 60 * 60 * 1000).toISOString(), end_at: new Date(fixtureStart.getTime() + 3 * 60 * 60 * 1000).toISOString(), location: 'Basen A', session_type: 'group', trainer_id: 1, trainer: 'Marek Zielinski', group: { id: 1, name: 'Delfiny' }, is_cancelled: true, max_participants: 8, participants_count: 1, notes: 'cancelled' },
      ],
    },
    '/api/admin/schedule/sessions/1/attendance/': {
      session: { id: 1, start_at: now, end_at: fixtureEnd, location: 'Basen A', session_type: 'group', trainer_id: 1, trainer: 'Marek Zielinski', group: { id: 1, name: 'Delfiny' }, is_cancelled: false, max_participants: 8, participants_count: 1, notes: '' },
      history: [{ id: 1, action: 'session.created', actor: 'admin', changes: {}, created_at: now }],
      students: [{
        id: 1,
        client_id: 10,
        first_name: 'Jan',
        last_name: 'Kowalski',
        full_name: 'Jan Kowalski',
        client_phone: '+48111222333',
        balance_minor: 24000,
        currency: 'PLN',
        group: { id: 1, name: 'Delfiny' },
        attendance: null,
        session_participant: null,
        can_remove_from_session: false,
      }],
    },
    '/api/admin/payments/': {
      payments: [
        { id: 1, participant_id: 1, participant: 'Jan Kowalski', amount_minor: 24000, currency: 'PLN', paid_at: '2026-07-16', method: 'bank_transfer', status: 'pending', comment: '' },
        { id: 2, participant_id: 1, participant: 'Jan Kowalski', amount_minor: 12000, currency: 'PLN', paid_at: '2026-07-15', method: 'cash', status: 'confirmed', comment: '' },
        { id: 3, participant_id: 1, participant: 'Jan Kowalski', amount_minor: 9000, currency: 'PLN', paid_at: '2026-07-14', method: 'bank_transfer', status: 'rejected', comment: '' },
      ],
    },
    '/api/admin/debtors/': {
      debtors: [{ student: { id: 1, client_id: 10, full_name: 'Jan Kowalski', client_phone: '+48111222333', group: { id: 1, name: 'Delfiny' } }, reasons: ['Przeterminowana platnosc'], balance_minor: 24000, currency: 'PLN', oldest_due_date: '2026-07-10', days_overdue: 11, last_payment_at: '2026-06-20' }],
    },
    '/api/admin/participants/1/subscriptions/': {
      subscriptions: [{ id: 1, type: '8 wejsc', status: 'active', remaining_sessions: 7 }],
    },
    '/api/admin/payroll/schemes/': { schemes: [{ id: 1, name: 'Основные ставки', location: '', is_active: true }] },
    '/api/admin/payroll/rules/': { rules: [{ id: 1, scheme_id: 1, session_type: 'group', rule_type: 'group', base_amount_minor: 5000, currency: 'PLN', min_clients_threshold: 4, extra_client_amount_minor: 500, is_active: true }] },
    '/api/admin/payroll/assignments/': { assignments: [{ id: 1, trainer_id: 1, scheme_id: 1, scheme: 'Основные ставки', effective_from: '2026-01-01', effective_to: null }] },
    '/api/admin/payroll/periods/': { periods: [] },
    '/api/admin/notifications/logs/': { logs: [] },
    '/api/admin/notifications/templates/': { templates: [] },
    '/api/admin/notifications/rules/': { rules: [] },
    '/api/admin/notifications/quiet-hours/': { policies: [] },
    '/api/admin/settings/locations/': { locations: [] },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/settings/languages/': { languages: [] },
    '/api/admin/settings/dictionary-keys/': { keys: [] },
    '/api/admin/settings/dictionary-translations/': { translations: [] },
    '/api/admin/settings/notification-template-translations/': { translations: [] },
    '/api/admin/system/audit/': { entries: [] },
    '/api/admin/system/imports/': { batches: [] },
    '/api/admin/system/security/': { users: [] },
    '/api/admin/system/credentials/': { username: 'admin', role: 'admin' },
  }

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    const financeResponses = {
      '/api/admin/participants/1/charges/': { charge: { id: 1 } },
      '/api/admin/participants/1/subscriptions/': { subscription: { id: 2 } },
      '/api/admin/subscriptions/1/renew/': { subscription: { id: 3 } },
      '/api/admin/subscriptions/1/freeze/': { days: 7 },
      '/api/admin/subscriptions/1/adjust/': { subscription: { id: 1, remaining_sessions: 8 } },
    }
    const accessResponses = {
      '/api/admin/clients/10/access/issue/': {
        purpose: 'recovery',
        login: 'anna@example.com',
        activation_code: 'synthetic-client-recovery-code',
        expires_at: '2026-08-01T12:00:00+02:00',
      },
      '/api/admin/trainers/1/access/issue/': {
        purpose: 'recovery',
        login: 'marek',
        activation_code: 'synthetic-trainer-recovery-code',
        expires_at: '2026-08-01T12:00:00+02:00',
      },
    }
    if (method === 'POST' && accessResponses[url.pathname]) {
      seenAdminEndpoints.add(url.pathname)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(accessResponses[url.pathname]),
      })
      return
    }
    if (method === 'GET' && url.pathname === '/api/admin/schedule/sessions/') {
      schedulePageSizes.push(Number(url.searchParams.get('page_size')))
    }
    if (method === 'POST' && url.pathname === '/api/admin/schedule/check-conflict/') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ has_conflict: false }),
      })
      return
    }
    if (method === 'POST' && url.pathname === '/api/admin/schedule/sessions/') {
      const submitted = route.request().postDataJSON()
      submittedSessions.push(submitted)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 3, ...submitted, is_cancelled: false }),
      })
      return
    }
    if (method === 'POST' && url.pathname === '/api/admin/schedule/sessions/2/restore/') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...routes['/api/admin/schedule/sessions/'].sessions[1], is_cancelled: false, restored: true }),
      })
      return
    }
    if (method === 'POST' && financeResponses[url.pathname]) {
      seenAdminEndpoints.add(url.pathname)
      seenClientFinanceActions.add(url.pathname)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(financeResponses[url.pathname]),
      })
      return
    }
    if (method === 'POST' && url.pathname === '/api/admin/payments/') {
      seenAdminEndpoints.add(url.pathname)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 2,
          participant_id: 1,
          participant: 'Jan Kowalski',
          amount_minor: 12000,
          currency: 'PLN',
          paid_at: '2026-07-16',
          method: 'cash',
          status: 'confirmed',
          comment: 'manual smoke',
        }),
      })
      return
    }
    if (method === 'POST' && url.pathname === '/api/admin/settings/locations/') {
      const submitted = route.request().postDataJSON()
      submittedSettings.push(submitted)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 2, ...submitted }),
      })
      return
    }
    if (method === 'PATCH' && url.pathname === '/api/admin/system/credentials/') {
      submittedCredentials.push(route.request().postDataJSON())
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, username: 'admin-renamed', role: 'admin' }),
      })
      return
    }
    if (method === 'POST' && url.pathname === '/api/admin/clients/11/restore/') {
      seenAdminEndpoints.add(url.pathname)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account: { id: 11, is_active: true }, participants: [] }),
      })
      return
    }
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
  await expect(page.locator('h2.page-title', { hasText: 'Рабочий стол' })).toBeVisible()
  await expect(page.getByText('Marek Zielinski').first()).toBeVisible()
  await page.getByLabel('Глобальный поиск').fill('Jan Kowalski')
  await page.getByRole('button', { name: /Jan Kowalski/ }).first().click()
  await expect(page.locator('h2.page-title', { hasText: 'Anna Kowalska' })).toBeVisible()
  await expect(page).toHaveURL(/client=10/)
  await page.reload()
  await expect(page.locator('h2.page-title', { hasText: 'Anna Kowalska' })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить доступ', exact: true }).click()
  await expect(page.getByText('Код восстановления доступа')).toBeVisible()
  await expect(page.getByText('synthetic-client-recovery-code')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать логин' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать код' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать всё' })).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.getByRole('button', { name: 'Редактировать клиента' }).click()
  await page.getByLabel('Телефон', { exact: true }).fill('+48999999999')
  await page.getByRole('button', { name: 'Сохранить изменения' }).click()
  await expect(page.getByText('Данные владельца аккаунта обновлены.')).toBeVisible()

  await page.locator('.ops-nav-button[title="Клиенты"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Клиенты' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Kowalski Jan/ })).toBeVisible()
  await expect(page.locator('.ops-nav-button[title="Платежи"] .ops-nav-count')).toHaveText('1')
  await expect(page.getByRole('button', { name: /Новый клиент/ })).toBeVisible()
  await expect(page.getByText('Piotr Nowak')).toHaveCount(0)
  await page.getByRole('button', { name: 'Чёрный список', exact: true }).click()
  await expect(page.getByText('Nowak Piotr')).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Восстановить' }).click()
  await expect(page.getByText('Клиент восстановлен и снова отображается в рабочем списке.')).toBeVisible()
  expect(seenAdminEndpoints).toContain('/api/admin/clients/11/restore/')

  await page.locator('.ops-nav-button[title="Тренеры"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Тренеры' })).toBeVisible()
  await expect(page.getByText('Marek Zielinski').first()).toBeVisible()
  await page.getByRole('button', { name: /Marek Zielinski/ }).first().click()
  await expect(page.getByRole('region', { name: /Профиль тренера/ })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить доступ', exact: true }).click()
  await expect(page.getByText('Код восстановления доступа')).toBeVisible()
  await expect(page.getByText('synthetic-trainer-recovery-code')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать логин' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать код' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать всё' })).toBeVisible()
  await page.getByRole('tab', { name: 'Зарплата и ставки' }).click()
  await expect(page.getByText('Ставки по типам занятий')).toBeVisible()

  await page.locator('.ops-nav-button[title="Группы"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Группы' })).toBeVisible()
  await expect(page.getByText('Delfiny').first()).toBeVisible()
  await page.getByRole('button', { name: 'Delfiny', exact: true }).first().click()
  await expect(page.getByRole('region', { name: /Карточка группы/ })).toBeVisible()
  await expect(page.getByText('Состав группы')).toBeVisible()
  const clientCombobox = page.getByRole('combobox', { name: 'Добавить участника' })
  await clientCombobox.fill('zolc aleks')
  await expect(page.getByRole('option', { name: /Żółć Aleksandra/ })).toBeVisible()
  await clientCombobox.press('Escape')

  await page.locator('.ops-nav-button[title="Расписание"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Расписание' })).toBeVisible()
  await expect(page.getByTestId('schedule-calendar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Календарь', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Неделя', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('За неделю: 2')).toBeVisible()
  await expect(page.getByText(/Шаблоны расписания|Создать из шаблона/)).toHaveCount(0)
  expect(schedulePageSizes.every((size) => size > 0 && size <= 200)).toBe(true)
  const filterDetails = page.locator('.ops-filter-disclosure')
  const filterBox = await filterDetails.boundingBox()
  const pageBox = await page.locator('.page').boundingBox()
  expect(filterBox?.height).toBeLessThanOrEqual(50)
  expect(filterBox?.width).toBeLessThan(pageBox?.width || 10000)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const referencePickerButton = page.getByRole('button', { name: 'Открыть календарь: Опорная дата' })
  const referencePickerBox = await referencePickerButton.boundingBox()
  expect(referencePickerBox?.width).toBeGreaterThanOrEqual(44)
  expect(referencePickerBox?.height).toBeGreaterThanOrEqual(44)
  await referencePickerButton.click()
  await expect(page.getByRole('dialog', { name: 'Открыть календарь: Опорная дата' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(referencePickerButton).toBeFocused()
  await page.getByRole('button', { name: 'Месяц', exact: true }).click()
  await expect(page.getByText('За месяц: 0')).toBeVisible()
  const marker = page.locator('.ops-calendar-marker').first()
  await expect(marker).toContainText('2')
  await expect(marker).toHaveAttribute('aria-label', 'Занятий: 2')
  await page.getByRole('button', { name: 'День', exact: true }).click()
  await expect(page.getByText('За день: 0')).toBeVisible()
  await page.getByRole('button', { name: 'Неделя', exact: true }).click()
  await expect(page.getByText('За неделю: 2')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Уведомления' })).toHaveAttribute('aria-live', 'polite')
  await expect(page.getByTestId('schedule-list')).toHaveCount(0)
  await page.locator('[aria-label="Режим отображения расписания"] button').nth(1).click()
  await expect(page.getByTestId('schedule-list')).toBeVisible()
  await expect(page.locator('.ops-session-row').first()).toContainText('Basen A')
  await expect(page.getByRole('button', { name: 'Восстановить тренировку', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить тренировку', exact: true }).click()
  await expect(page.getByText('Тренировка восстановлена.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Групповая тренировка/ })).toBeVisible()
  await page.getByRole('button', { name: /Групповая тренировка/ }).click()
  const createSessionCard = page.locator('.card').filter({
    has: page.getByText('Новое занятие', { exact: true }),
  })
  await createSessionCard.getByLabel('Тип занятия').selectOption('individual')
  await expect(createSessionCard.getByLabel('Цена занятия, PLN')).toBeVisible()
  await createSessionCard.getByRole('combobox', { name: 'Участник' }).fill('Jan Kowalski')
  await page.getByRole('option', { name: /Kowalski Jan/ }).click()
  await expect(createSessionCard.getByLabel('Локация').locator('option', { hasText: 'Basen A' })).toHaveCount(1)
  const timePickerButton = createSessionCard.getByRole('button', { name: 'Открыть выбор времени: Начало' })
  await timePickerButton.click()
  await expect(page.getByRole('dialog', { name: 'Открыть выбор времени: Начало' })).toBeVisible()
  await expect(page.getByLabel('24-часовой выбор времени')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(timePickerButton).toBeFocused()
  await createSessionCard.getByRole('button', { name: 'Создать занятие' }).click()
  await expect(page.getByText(/Создано:.*Индивидуальное/)).toBeVisible()
  expect(submittedSessions[0].notes).toBe('')
  expect(submittedSessions[0].individual_student_id).toBe('1')

  await page.getByRole('button', { name: /Групповая тренировка/ }).click()
  const invalidCard = page.locator('.card').filter({ has: page.getByText('Новое занятие', { exact: true }) })
  await invalidCard.getByLabel('Тренер').selectOption('')
  await invalidCard.getByRole('button', { name: 'Создать занятие' }).click()
  await expect(invalidCard.getByLabel('Тренер')).toHaveAttribute('aria-invalid', 'true')
  await expect(invalidCard.getByLabel('Тренер')).toBeFocused()
  await invalidCard.getByRole('button', { name: 'Закрыть', exact: true }).click()

  await expect(page.getByText(/Недельный план|Weekly plan/i)).toHaveCount(0)

  await page.locator('.ops-session-row').first().click()
  await expect(page.locator('h2.page-title', { hasText: 'Занятие' })).toBeVisible()
  await expect(page.getByText('Jan Kowalski').first()).toBeVisible()
  await expect(page.getByText(/Долг:.*PLN/)).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Телефон' })).toHaveCount(0)
  await page.getByRole('button', { name: /Профиль/ }).click()
  await expect(page.getByText('Anna Kowalska').first()).toBeVisible()
  await page.getByRole('tab', { name: /Платежи/ }).click()
  await page.getByRole('button', { name: /Добавить оплату/ }).click()
  await page.getByLabel('Сумма').fill('120.00')
  await page.getByLabel('Комментарий').fill('manual smoke')
  await page.getByRole('button', { name: /Сохранить оплату/ }).click()
  await expect(page.getByText('Оплата добавлена и подтверждена.')).toBeVisible()

  await page.getByRole('button', { name: /Добавить списание/ }).click()
  await page.getByLabel('Описание').fill('Индивидуальное занятие')
  await page.getByLabel('Сумма').fill('80.00')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Начисление создано.')).toBeVisible()

  await page.getByRole('button', { name: /Продать абонемент/ }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Абонемент и начисление созданы.')).toBeVisible()

  await page.getByRole('button', { name: /Продлить абонемент/ }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Абонемент продлён с начислением.')).toBeVisible()

  await page.getByRole('button', { name: /Заморозить/ }).click()
  await page.getByRole('textbox', { name: 'По дату', exact: true }).fill('2026-07-23')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Абонемент заморожен на 7 дней.')).toBeVisible()

  await page.getByRole('button', { name: /Скорректировать/ }).click()
  await page.getByLabel('Изменение занятий').fill('1')
  await page.getByLabel('Комментарий').fill('Ручная корректировка')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Остаток занятий скорректирован.')).toBeVisible()

  for (const endpoint of [
    '/api/admin/participants/1/charges/',
    '/api/admin/participants/1/subscriptions/',
    '/api/admin/subscriptions/1/renew/',
    '/api/admin/subscriptions/1/freeze/',
    '/api/admin/subscriptions/1/adjust/',
  ]) {
    expect(seenClientFinanceActions, `client card should submit ${endpoint}`).toContain(endpoint)
  }

  await page.locator('.ops-nav-button[title="Платежи"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Платежи' })).toBeVisible()
  await expect(page.locator('td').filter({ hasText: 'Банковский перевод / IBAN' }).first()).toBeVisible()

  await page.locator('.ops-nav-button[title="Должники"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Должники' })).toBeVisible()
  await expect(page.getByText('Przeterminowana platnosc').first()).toBeVisible()

  await page.locator('.ops-nav-button[title="Настройки"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Настройки и контроль' })).toBeVisible()
  await expect(page.getByText('Типы абонементов').first()).toBeVisible()
  await page.getByRole('button', { name: /Локации/ }).click()
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await page.getByLabel('Код').fill('pool-b')
  await page.getByLabel('Название').fill('Бассейн B')
  await page.getByLabel('Адрес').fill('Варшава')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Запись создана.')).toBeVisible()
  expect(submittedSettings).toEqual([expect.objectContaining({ code: 'pool-b', name: 'Бассейн B', address: 'Варшава' })])
  await page.getByRole('tab', { name: 'Контроль' }).click()
  await page.getByRole('button', { name: /Логин и пароль администратора/ }).click()
  await page.getByLabel('Новый логин').fill('admin-renamed')
  await page.getByLabel('Текущий пароль').fill('Str0ngPass!123')
  await page.getByLabel('Новый пароль (необязательно)').fill('DifferentStrongPass!456')
  await page.getByLabel('Повторите новый пароль').fill('DifferentStrongPass!456')
  await page.getByRole('button', { name: 'Обновить данные входа' }).click()
  await expect(page.getByText('Логин и пароль администратора обновлены. Текущая сессия сохранена.')).toBeVisible()
  expect(submittedCredentials).toEqual([{
    username: 'admin-renamed',
    current_password: 'Str0ngPass!123',
    new_password: 'DifferentStrongPass!456',
  }])

  const pageHasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(pageHasHorizontalOverflow).toBe(false)
  if ((page.viewportSize()?.width || 0) <= 960) {
    await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Основная мобильная навигация' })).toBeVisible()
  }

  for (const endpoint of requiredAdminBootstrapEndpoints) {
    expect(seenAdminEndpoints, `admin bootstrap should request ${endpoint}`).toContain(endpoint)
  }
  expect(errors).toEqual([])
})

test('trainer can open every menu screen without runtime errors', async ({ page }) => {
  const errors = collectPageErrors(page)
  const session = {
    id: 41,
    start_at: '2026-07-22T17:00:00+02:00',
    end_at: '2026-07-22T17:45:00+02:00',
    location: 'Большой бассейн',
    max_participants: 8,
    is_cancelled: false,
    group: { id: 7, name: 'Дельфины' },
  }
  await mockPortal(page, {
    '/api/me/': { id: 2, username: 'trainer', role: 'trainer', full_name: 'Анна Тренер' },
    '/api/trainer/sessions/': { sessions: [session] },
    '/api/trainer/groups/': { groups: [{ id: 7, name: 'Дельфины', students_count: 1, students: [{ id: 5, full_name: 'Иван Петров' }], is_active: true, next_session: session }] },
    '/api/trainer/history/': { sessions: [{ ...session, start_at: '2026-07-10T17:00:00+02:00', end_at: '2026-07-10T17:45:00+02:00' }] },
    '/api/trainer/sessions/41/': {
      session,
      students: [{ id: 5, full_name: 'Иван Петров', client_phone: '+48123123123', attendance: null }],
    },
  })

  await page.goto('/')
  await expect(page.locator('main:visible')).toHaveCount(1)
  await expect(page.locator('.ops-sidebar')).toBeVisible()
  await expect(page.locator('main:visible')).toHaveCount(1)

  for (const label of ['Мои занятия', 'Посещаемость', 'Мои группы', 'История']) {
    await page.locator(`.ops-nav-button[title="${label}"]`).click()
    await expect(page.locator('.topbar h1')).toHaveText(label)
    await expect(page.locator('.page')).toBeVisible()
  }

  await page.locator('.ops-nav-button[title="Посещаемость"]').click()
  await expect(page.getByRole('button', { name: 'Все присутствовали' })).toBeVisible()
  await page.locator('.ops-nav-button[title="Мои группы"]').click()
  await page.getByRole('button', { name: /Дельфины/ }).click()
  await expect(page.getByText('Иван Петров')).toBeVisible()
  await page.locator('.ops-nav-button[title="История"]').click()

  await page.reload()
  await expect(page.locator('.ops-sidebar')).toBeVisible()
  await expect(page.locator('.topbar h1')).toHaveText('История')
  expect(errors).toEqual([])
})

test('client can open every menu screen without runtime errors', async ({ page }) => {
  const errors = collectPageErrors(page)
  const participant = {
    id: 5,
    first_name: 'Иван',
    last_name: 'Петров',
    full_name: 'Иван Петров',
    birth_date: '2016-05-10',
    email: '',
    group: { id: 7, name: 'Дельфины' },
    balance_minor: 0,
    current_subscription: { id: 9, participant_id: 5, type: '8 занятий', status: 'active', remaining_sessions: 6, created_at: '2026-07-15T10:00:00+02:00', start_date: '2026-07-15', effective_end_date: '2026-08-15', grace_end_date: '2026-08-22' },
  }
  const session = {
    id: 41,
    start_at: '2026-07-22T17:00:00+02:00',
    end_at: '2026-07-22T17:45:00+02:00',
    location: 'Большой бассейн',
    trainer: 'Анна Тренер',
    is_cancelled: false,
    group: { id: 7, name: 'Дельфины' },
  }
  await mockPortal(page, {
    '/api/me/': { id: 3, username: 'parent', role: 'parent', full_name: 'Пётр Петров' },
    '/api/client/overview/': { account: { id: 3, username: 'parent', full_name: 'Пётр Петров' }, participants: [participant] },
    '/api/client/profile/': { account: { id: 3, first_name: 'Пётр', last_name: 'Петров', email: 'parent@example.com', phone: '+48123123123', preferred_language: 'ru' }, participants: [participant], subscriptions: [{ ...participant.current_subscription, ledger: [{ id: 1, delta: -1, reason: 'attendance', created_at: '2026-07-20T18:00:00+02:00' }] }] },
    '/api/client/consents/': { consents: [{ type: 'notifications', type_label: 'Уведомления', is_active: true, policy_version: 'v1' }] },
    '/api/client/schedule/': { sessions: [session] },
    '/api/client/attendance/': { attendance: [{ student: { id: 5 }, session, status: 'present', deducts: true }] },
    '/api/client/payments/': { charges: [], payments: [] },
    '/api/client/notifications/': { notifications: [] },
  })

  await page.goto('/')
  await expect(page.locator('.ops-sidebar')).toBeVisible()
  await expect(page.locator('main:visible')).toHaveCount(1)

  for (const label of ['Главная', 'Расписание', 'Абонемент', 'Платежи', 'История', 'Профиль', 'Согласия']) {
    await page.locator(`.ops-nav-button[title="${label}"]`).click()
    await expect(page.locator('.topbar h1')).toHaveText(label)
    await expect(page.locator('.page')).toBeVisible()
  }

  await page.locator('.ops-nav-button[title="Расписание"]').click()
  await page.getByRole('button', { name: 'Список', exact: true }).click()
  await page.locator('[data-testid="client-schedule-list"] .ops-session-tile').first().click()
  await expect(page.getByText('-1 занятие')).toBeVisible()
  await page.locator('.ops-nav-button[title="Абонемент"]').click()
  await expect(page.getByText('Осталось занятий')).toBeVisible()
  await expect(page.getByText('Оформлен')).toHaveCount(0)
  await expect(page.getByText('Льготный период')).toHaveCount(0)
  await expect(page.getByText(/История списаний и корректировок/)).toHaveCount(0)
  await page.locator('.ops-nav-button[title="Согласия"]').click()

  await page.reload()
  await expect(page.locator('.ops-sidebar')).toBeVisible()
  await expect(page.locator('.topbar h1')).toHaveText('Согласия')
  expect(errors).toEqual([])
})

test('admin confirms and rejects pending payments and the nav counter decrements', async ({ page }) => {
  const errors = collectPageErrors(page)
  const seen = new Set()
  // Backend-side status the mocked API reports; the confirm/reject POSTs mutate it,
  // so the nav counter (driven by a refetch, not local table state) can be asserted.
  const status = { 1: 'pending', 4: 'pending' }
  const paymentsPayload = () => ({
    payments: [
      { id: 1, participant_id: 1, participant: 'Jan Kowalski', amount_minor: 24000, currency: 'PLN', paid_at: '2026-07-16', method: 'bank_transfer', status: status[1], comment: '' },
      { id: 4, participant_id: 2, participant: 'Piotr Nowak', amount_minor: 15000, currency: 'PLN', paid_at: '2026-07-13', method: 'cash', status: status[4], comment: '' },
    ],
  })
  const routes = {
    '/api/csrf/': { ok: true },
    '/api/health/': { status: 'ok', service: 'swimcrm' },
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 2, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [],
      choices: { payment_methods: [], notification_channels: [] },
      notification_settings: { quiet_hours: {} },
    },
    '/api/admin/clients/': {
      clients: [
        { id: 1, client_id: 10, first_name: 'Jan', last_name: 'Kowalski', full_name: 'Jan Kowalski', is_account_holder: false, is_active: true, client_is_active: true, group: null },
        { id: 2, client_id: 11, first_name: 'Piotr', last_name: 'Nowak', full_name: 'Piotr Nowak', is_account_holder: false, is_active: true, client_is_active: true, group: null },
      ],
    },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': { sessions: [] },
    '/api/admin/participants/1/subscriptions/': { subscriptions: [] },
    '/api/admin/debtors/': { debtors: [] },
  }

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (method === 'POST' && url.pathname === '/api/admin/payments/1/confirm/') {
      status[1] = 'confirmed'
      seen.add(url.pathname)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }
    if (method === 'POST' && url.pathname === '/api/admin/payments/4/reject/') {
      status[4] = 'rejected'
      seen.add(url.pathname)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }
    if (url.pathname === '/api/admin/payments/') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paymentsPayload()) })
      return
    }
    const payload = routes[url.pathname]
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled smoke endpoint: ${url.pathname}` }),
    })
  })

  await page.goto('/')
  await expect(page.locator('main:visible')).toHaveCount(1)
  await expect(page.locator('h2.page-title', { hasText: 'Рабочий стол' })).toBeVisible()

  const counter = page.locator('.ops-nav-button[title="Платежи"] .ops-nav-count')
  await expect(counter).toHaveText('2')

  await page.locator('.ops-nav-button[title="Платежи"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Платежи' })).toBeVisible()

  // Confirm the first pending payment: balance-affecting action, counter must drop 2 -> 1.
  const confirmTrigger = page.getByRole('row', { name: /Kowalski/ }).getByRole('button', { name: 'Подтвердить' })
  await confirmTrigger.click()
  const confirmDialog = page.getByRole('dialog', { name: 'Подтвердить платёж?' })
  await expect(confirmDialog).toBeVisible()
  await expect(confirmDialog).toContainText('Jan Kowalski')
  await expect(confirmDialog.getByRole('button', { name: 'Отмена' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirmDialog).toBeHidden()
  await expect(confirmTrigger).toBeFocused()
  await confirmTrigger.click()
  await page.getByRole('dialog', { name: 'Подтвердить платёж?' }).getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText('Платёж подтверждён.')).toBeVisible()
  await expect(counter).toHaveText('1')

  // Reject the remaining pending payment through the confirmation dialog: counter 1 -> 0.
  await page.getByRole('row', { name: /Nowak/ }).getByRole('button', { name: 'Отклонить' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Отклонить' }).click()
  await expect(page.getByText('Платёж отклонён.')).toBeVisible()
  await expect(counter).toHaveText('0')

  expect(seen, 'confirm endpoint should be hit').toContain('/api/admin/payments/1/confirm/')
  expect(seen, 'reject endpoint should be hit').toContain('/api/admin/payments/4/reject/')
  expect(errors).toEqual([])
})
