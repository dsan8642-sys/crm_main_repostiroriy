import { expect, test } from '@playwright/test'

async function mockPortal(page, routes) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const payload = routes[url.pathname]
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
  const now = '2026-07-21T17:00:00+02:00'
  const seenAdminEndpoints = new Set()
  const seenClientFinanceActions = new Set()
  const submittedSettings = []
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
      ],
    },
    '/api/admin/clients/10/': {
      account: { id: 10, username: 'jan-parent', full_name: 'Anna Kowalska', email: 'anna@example.com', phone: '+48111222333', is_active: true },
      participants: [{ id: 1, client_id: 10, first_name: 'Jan', last_name: 'Kowalski', full_name: 'Jan Kowalski', birth_date: '2016-05-10', is_active: true, group: { id: 1, name: 'Delfiny' }, balance_minor: 0 }],
      subscriptions: [{ id: 1, participant_id: 1, participant: { id: 1, full_name: 'Jan Kowalski' }, type: '8 wejsc', status: 'active', remaining_sessions: 7, start_date: '2026-07-01', effective_end_date: '2026-07-31', created_at: '2026-07-01T10:00:00+02:00' }],
      charges: [],
      payments: [],
      attendance: [],
      consents: [],
      summary: { participants_count: 1, active_participants: 1, balance_minor: 0, active_subscriptions: 1, pending_payments: 0 },
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
      sessions: [{ id: 1, start_at: now, end_at: '2026-07-21T18:00:00+02:00', location: 'Basen A', session_type: 'group', trainer_id: 1, trainer: 'Marek Zielinski', group: { id: 1, name: 'Delfiny' }, is_cancelled: false, max_participants: 8, participants_count: 1, notes: '' }],
    },
    '/api/admin/schedule/sessions/1/attendance/': {
      session: { id: 1, start_at: now, end_at: '2026-07-21T18:00:00+02:00', location: 'Basen A', session_type: 'group', trainer_id: 1, trainer: 'Marek Zielinski', group: { id: 1, name: 'Delfiny' }, is_cancelled: false, max_participants: 8, participants_count: 1, notes: '' },
      history: [{ id: 1, action: 'session.created', actor: 'admin', changes: {}, created_at: now }],
      students: [{
        id: 1,
        client_id: 10,
        first_name: 'Jan',
        last_name: 'Kowalski',
        full_name: 'Jan Kowalski',
        client_phone: '+48111222333',
        group: { id: 1, name: 'Delfiny' },
        attendance: null,
        session_participant: null,
        can_remove_from_session: false,
      }],
    },
    '/api/admin/payments/': {
      payments: [{ id: 1, participant_id: 1, participant: 'Jan Kowalski', amount_minor: 24000, currency: 'PLN', paid_at: '2026-07-16', method: 'bank_transfer', status: 'pending', comment: '' }],
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
  await page.getByRole('button', { name: 'Редактировать клиента' }).click()
  await page.getByLabel('Телефон', { exact: true }).fill('+48999999999')
  await page.getByRole('button', { name: 'Сохранить изменения' }).click()
  await expect(page.getByText('Данные владельца аккаунта обновлены.')).toBeVisible()

  await page.locator('.ops-nav-button[title="Клиенты"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Клиенты' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Kowalski Jan/ })).toBeVisible()
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
  await page.getByRole('tab', { name: 'Зарплата и ставки' }).click()
  await expect(page.getByText('Ставки по типам занятий')).toBeVisible()

  await page.locator('.ops-nav-button[title="Группы"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Группы' })).toBeVisible()
  await expect(page.getByText('Delfiny').first()).toBeVisible()
  await page.getByRole('button', { name: 'Delfiny', exact: true }).first().click()
  await expect(page.getByRole('region', { name: /Карточка группы/ })).toBeVisible()
  await expect(page.getByText('Состав группы')).toBeVisible()

  await page.locator('.ops-nav-button[title="Расписание"]').click()
  await expect(page.locator('h2.page-title', { hasText: 'Расписание' })).toBeVisible()
  await expect(page.locator('.ops-session-row').first()).toContainText('Basen A')
  await expect(page.getByRole('button', { name: /Новое занятие/ })).toBeVisible()
  await page.locator('.ops-session-row').first().click()
  await expect(page.locator('h2.page-title', { hasText: 'Занятие' })).toBeVisible()
  await expect(page.getByText('Jan Kowalski').first()).toBeVisible()
  await page.getByRole('button', { name: /Профиль/ }).click()
  await expect(page.getByText('Anna Kowalska').first()).toBeVisible()
  await page.getByRole('tab', { name: /Платежи/ }).click()
  await page.getByRole('button', { name: /Добавить оплату/ }).click()
  await page.getByLabel('Сумма').fill('120.00')
  await page.getByLabel('Комментарий').fill('manual smoke')
  await page.getByRole('button', { name: /Сохранить оплату/ }).click()
  await expect(page.getByText('Оплата добавлена и подтверждена.')).toBeVisible()

  await page.getByRole('button', { name: /Добавить начисление/ }).click()
  await page.getByLabel('Описание').fill('Индивидуальное занятие')
  await page.getByLabel('Сумма').fill('80.00')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Начисление создано.')).toBeVisible()

  await page.getByRole('button', { name: /Выдать абонемент/ }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Абонемент и начисление созданы.')).toBeVisible()

  await page.getByRole('button', { name: /Продлить абонемент/ }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Абонемент продлён с начислением.')).toBeVisible()

  await page.getByRole('button', { name: /Заморозить/ }).click()
  await page.getByLabel('По дату').fill('2026-07-23')
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
  await expect(page.locator('td').filter({ hasText: 'Bank transfer / IBAN' }).first()).toBeVisible()

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

  const pageHasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(pageHasHorizontalOverflow).toBe(false)
  if ((page.viewportSize()?.width || 0) <= 960) {
    await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toBeHidden()
  }

  for (const endpoint of requiredAdminBootstrapEndpoints) {
    expect(seenAdminEndpoints, `admin bootstrap should request ${endpoint}`).toContain(endpoint)
  }
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
  await expect(page.locator('.ops-sidebar')).toBeVisible()

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
  })

  await page.goto('/')
  await expect(page.locator('.ops-sidebar')).toBeVisible()

  for (const label of ['Главная', 'Расписание', 'Абонемент', 'Платежи', 'История', 'Профиль', 'Согласия']) {
    await page.locator(`.ops-nav-button[title="${label}"]`).click()
    await expect(page.locator('.topbar h1')).toHaveText(label)
    await expect(page.locator('.page')).toBeVisible()
  }

  await page.locator('.ops-nav-button[title="Расписание"]').click()
  await page.locator('.ops-session-tile').first().click()
  await expect(page.getByText('-1 занятие')).toBeVisible()
  await page.locator('.ops-nav-button[title="Абонемент"]').click()
  await expect(page.getByText(/\+7 дней/)).toBeVisible()
  await expect(page.getByText('Списание за занятие')).toBeVisible()
  await page.locator('.ops-nav-button[title="Согласия"]').click()

  await page.reload()
  await expect(page.locator('.ops-sidebar')).toBeVisible()
  await expect(page.locator('.topbar h1')).toHaveText('Согласия')
  expect(errors).toEqual([])
})
