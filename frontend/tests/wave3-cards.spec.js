import { expect, test } from '@playwright/test'


const pagination = (total = 1, pageSize = 20) => ({
  page: 1,
  page_size: pageSize,
  total,
  pages: total ? 1 : 0,
  has_next: false,
  has_previous: false,
})

async function fulfillJson(route, payload, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
}

async function mockAdminWave3(page) {
  const longName = 'Чрезвычайно Длинная Фамилия-Клиента Александра-Мария'
  const client = {
    id: 7,
    client_id: 10,
    first_name: 'Александра-Мария',
    last_name: 'Чрезвычайно Длинная Фамилия-Клиента',
    full_name: longName,
    client_phone: '+48123456789',
    email: 'long.client@example.test',
    group: { id: 3, name: 'Дельфины продвинутая утренняя группа' },
    is_active: true,
    client_is_active: true,
    balance_minor: 12000,
    has_current_subscription: true,
    current_subscription_remaining: 3,
    current_subscription_total: 10,
    last_present_at: '2026-06-15T10:00:00+02:00',
  }
  const trainer = {
    id: 4,
    username: 'wave3-trainer',
    first_name: 'Мария',
    last_name: 'Тренер-С-Очень-Длинной-Фамилией',
    full_name: 'Мария Тренер-С-Очень-Длинной-Фамилией',
    email: 'trainer@example.test',
    phone: '+48987654321',
    is_active: true,
    user_is_active: true,
    access_activated: true,
    portal_access: 'active',
    groups_count: 2,
  }
  const group = {
    id: 3,
    name: 'Дельфины продвинутая утренняя группа',
    description: 'Синтетическая группа',
    default_trainer: { id: 4, name: trainer.full_name },
    price_minor: 9000,
    currency: 'PLN',
    default_capacity: 12,
    color_key: 'ocean',
    is_active: true,
    participants_count: 8,
    next_session: { start_at: '2026-08-17T09:00:00+02:00', location: 'Бассейн A' },
  }
  const debtor = {
    student: { id: 7, client_id: 10, full_name: longName, client_phone: '+48123456789', group: { id: 3, name: group.name } },
    reasons: ['Просроченное начисление'],
    balance_minor: 12000,
    days_overdue: 14,
    oldest_due_date: '2026-07-31',
    last_payment_at: '2026-07-01',
  }
  const payment = {
    id: 31, participant_id: 7, participant: longName, amount_minor: 12000,
    method: 'bank_transfer', source: 'client_top_up', affects_balance: false,
    paid_at: '2026-08-13', status: 'pending', comment: '', receipt: null,
  }

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === '/api/health/') return fulfillJson(route, { status: 'ok' })
    if (path === '/api/me/') return fulfillJson(route, { id: 1, username: 'admin', role: 'admin', full_name: 'Администратор Wave 3' })
    if (path === '/api/admin/dashboard/') return fulfillJson(route, { metrics: { clients: 1, active_subscriptions: 1, debtors: 1 } })
    if (path === '/api/admin/reference/') return fulfillJson(route, {
      trainers: [trainer], groups: [group], subscription_types: [], locations: [], session_types: [], participants: [client],
      choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
    })
    if (path === '/api/admin/settings/session-types/') return fulfillJson(route, { session_types: [], pagination: pagination(0, 200) })
    if (path === '/api/admin/clients/') return fulfillJson(route, { clients: [client], pagination: pagination(1, Number(url.searchParams.get('page_size') || 20)) })
    if (path === '/api/admin/clients/10/') return fulfillJson(route, {
      account: { id: 10, full_name: longName, username: 'wave3-client', phone: client.client_phone, email: client.email, is_active: true, portal_access: 'active', access_activated: true },
      participants: [], subscriptions: [], charges: [], payments: [], attendance: [], consents: [], summary: { balance_minor: 12000 },
    })
    if (path === '/api/admin/groups/') return fulfillJson(route, { groups: [group], pagination: pagination(1, Number(url.searchParams.get('page_size') || 20)) })
    if (path === '/api/admin/trainers/') return fulfillJson(route, { trainers: [trainer], pagination: pagination(1, Number(url.searchParams.get('page_size') || 20)) })
    if (path === '/api/admin/debtors/') return fulfillJson(route, { debtors: [debtor], summary: { balance_minor: 12000 }, pagination: pagination(1, Number(url.searchParams.get('page_size') || 20)) })
    if (path === '/api/admin/payments/') return fulfillJson(route, { payments: [payment], pagination: pagination(1, Number(url.searchParams.get('page_size') || 1)) })
    if (path === '/api/admin/schedule/sessions/') return fulfillJson(route, { sessions: [], pagination: pagination(0, 200) })
    if (path === '/api/admin/notifications/logs/') return fulfillJson(route, { logs: [] })
    if (path.startsWith('/api/admin/')) return fulfillJson(route, {
      subscription_types: [], locations: [], session_types: [], templates: [], rules: [], policies: [], translations: [],
      schemes: [], assignments: [], periods: [], languages: [], keys: [], entries: [], batches: [], users: [], logs: [],
      pagination: pagination(0, 200),
    })
    return fulfillJson(route, { error: `Unhandled ${path}` }, 404)
  })
  return { longName }
}

test('Wave 3 admin mobile cards, clamped menu, named action and return state', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile Wave 3 contract')
  const { longName } = await mockAdminWave3(page)
  await page.goto('/?role=admin&view=clients')

  const card = page.getByTestId('client-compact-card')
  await expect(card).toBeVisible()
  const box = await card.boundingBox()
  expect(box.height).toBeGreaterThanOrEqual(104)
  expect(box.height).toBeLessThanOrEqual(120)
  expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await expect(card).toContainText('3 из 10')

  const trigger = page.getByRole('button', { name: `Действия: Чрезвычайно Длинная Фамилия-Клиента Александра-Мария` })
  await trigger.click()
  const menu = page.getByRole('menu', { name: /Действия:/ })
  const menuBox = await menu.boundingBox()
  const viewport = page.viewportSize()
  expect(menuBox.x).toBeGreaterThanOrEqual(8)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width - 8)
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height - 8)
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.click()
  await page.getByRole('heading', { name: 'Клиенты' }).click()
  await expect(menu).toBeHidden()
  await trigger.click()
  await page.getByRole('menuitem', { name: 'В чёрный список' }).click()
  await expect(page.getByRole('dialog')).toContainText(`Переместить ${longName} в чёрный список?`)
  await page.getByRole('button', { name: /Отмена|Anuluj/ }).click()

  await page.getByLabel('Поиск клиентов').fill('Чрезвычайно')
  await page.getByRole('button', { name: /Открыть профиль клиента/ }).click()
  await expect(page).toHaveURL(/view=clientDetail.*client=10/)
  await page.getByRole('button', { name: 'Клиенты' }).click()
  await expect(page).toHaveURL(/view=clients/)
  await expect(page.getByLabel('Поиск клиентов')).toHaveValue('Чрезвычайно')

  for (const [view, expected] of [['groups', 'Ближайшее'], ['trainers', 'Активных групп: 2'], ['debtors', '14 дн.'], ['payments', 'Подтвердить']]) {
    await page.goto(`/?role=admin&view=${view}`)
    await expect(page.locator('.ops-entity-mobile-list article')).toHaveCount(1)
    await expect(page.locator('.ops-entity-mobile-list article')).toContainText(expected)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  }

  await page.goto('/?role=admin&view=settings')
  await page.getByRole('button', { name: 'Справочники' }).click()
  await expect(page.getByRole('button', { name: 'Категории' })).toBeVisible()
  await page.getByRole('button', { name: /Типы абонементов/ }).click()
  await expect(page.getByRole('button', { name: 'Справочники' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Типы абонементов' })).toBeVisible()
  await page.getByRole('button', { name: 'Справочники' }).click()
  await expect(page.getByRole('button', { name: /Типы занятий/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
})

async function mockTrainerWave3(page) {
  const sessions = [
    { id: 1, start_at: '2026-08-10T09:00:00+02:00', end_at: '2026-08-10T10:00:00+02:00', group: { id: 2, name: 'Дельфины' }, trainer: 'Trainer Wave', location: 'Pool A', max_participants: 10, participants_count: 7, is_cancelled: false, presentation_color_key: 'ocean' },
    { id: 2, start_at: '2026-08-10T11:00:00+02:00', end_at: '2026-08-10T12:00:00+02:00', group: { id: 2, name: 'Дельфины' }, trainer: 'Trainer Wave', location: 'Pool B', max_participants: 10, participants_count: 6, is_cancelled: true, presentation_color_key: 'ocean' },
    { id: 3, start_at: '2026-08-09T09:00:00+02:00', end_at: '2026-08-09T10:00:00+02:00', group: { id: 3, name: 'Акулы' }, trainer: 'Trainer Wave', location: 'Pool C', max_participants: 10, participants_count: 5, is_cancelled: false, presentation_color_key: 'aqua' },
  ]
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === '/api/health/') return fulfillJson(route, { status: 'ok' })
    if (path === '/api/me/') return fulfillJson(route, { id: 2, username: 'trainer', role: 'trainer', full_name: 'Trainer Wave' })
    if (path === '/api/trainer/sessions/') return fulfillJson(route, { sessions: [] })
    if (path === '/api/trainer/groups/') return fulfillJson(route, { groups: [{ id: 2, name: 'Дельфины', is_active: true, students_count: 7, students: [] }] })
    if (path === '/api/trainer/history/') return fulfillJson(route, { sessions, pagination: pagination(3, Number(url.searchParams.get('page_size') || 20)) })
    if (/^\/api\/trainer\/sessions\/\d+\/$/.test(path)) return fulfillJson(route, { session: sessions.find((row) => path.includes(`/${row.id}/`)) || sessions[0], students: [] })
    return fulfillJson(route, { error: `Unhandled ${path}` }, 404)
  })
}

test('Wave 3 trainer history is date-grouped and contextual back returns to it', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile Wave 3 contract')
  await mockTrainerWave3(page)
  await page.goto('/?role=trainer&view=history')
  const groups = page.locator('.ops-history-date-group')
  await expect(groups).toHaveCount(2)
  await expect(groups.first().locator('.ops-history-session')).toHaveCount(2)
  await expect(groups.first()).toContainText('Отменено')
  await groups.first().locator('.ops-history-session').first().click()
  await expect(page).toHaveURL(/view=session.*trainerSession=1/)
  await page.getByRole('button', { name: 'Мои занятия' }).click()
  await expect(page).toHaveURL(/view=history/)
  await expect(groups).toHaveCount(2)
})

async function mockClientWave3(page) {
  const participants = [
    { id: 11, full_name: 'Алиса Клиент', birth_date: '2016-02-02', email: 'alice@example.test', group: { id: 2, name: 'Дельфины' }, is_active: true, balance_minor: -5000 },
    { id: 12, full_name: 'Борис Клиент', birth_date: '2017-03-03', email: 'boris@example.test', group: { id: 3, name: 'Акулы' }, is_active: true, balance_minor: 0 },
  ]
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path === '/api/health/') return fulfillJson(route, { status: 'ok' })
    if (path === '/api/me/') return fulfillJson(route, { id: 3, username: 'client', role: 'parent', full_name: 'Елена Клиент' })
    if (path === '/api/client/overview/') return fulfillJson(route, { account: { id: 20, username: 'client', full_name: 'Елена Клиент' }, participants })
    if (path === '/api/client/profile/') return fulfillJson(route, { account: { id: 20, username: 'client', full_name: 'Елена Клиент', first_name: 'Елена', last_name: 'Клиент', email: 'elena@example.test', phone: '+48111222333', preferred_language: 'ru', telegram: { connected: false } }, participants, subscriptions: [] })
    if (path === '/api/client/consents/') return fulfillJson(route, { consents: [] })
    if (path === '/api/client/schedule/') return fulfillJson(route, { student_id: 11, sessions: [] })
    if (path === '/api/client/notifications/') return fulfillJson(route, { notifications: [], pagination: pagination(0, 200) })
    if (path === '/api/client/attendance/') return fulfillJson(route, {
      student_id: 11,
      attendance: [{ id: 1, status: 'present', deducts: true, session: { id: 5, start_at: '2026-08-10T09:00:00+02:00', group: { id: 2, name: 'Дельфины' }, trainer: 'Trainer Wave' } }],
      pagination: pagination(1, Number(url.searchParams.get('page_size') || 20)),
    })
    return fulfillJson(route, { error: `Unhandled ${path}` }, 404)
  })
}

test('Wave 3 client profile and history preserve participant context and dirty guard', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile Wave 3 contract')
  await mockClientWave3(page)
  await page.goto('/?role=client&view=profile')
  await expect(page.getByRole('heading', { name: 'Елена Клиент' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Пополнить баланс' })).toBeVisible()
  await expect(page.locator('.ops-profile-form-grid')).toHaveCSS('grid-template-columns', /[0-9.]+px/)
  const save = page.getByRole('button', { name: 'Сохранить профиль' })
  const table = page.locator('table')
  expect(await save.evaluate((node, tableNode) => Boolean(tableNode.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING), await table.elementHandle())).toBe(true)

  await page.getByLabel('Имя', { exact: true }).fill('Елена изменено')
  await page.getByRole('button', { name: 'Согласия' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Есть несохранённые изменения' })).toBeVisible()
  await page.getByRole('button', { name: 'Остаться' }).click()

  await page.goto('/?role=client&view=history')
  await expect(page.getByRole('tab', { name: 'Сообщения · недоступно' })).toBeDisabled()
  await page.getByRole('button', { name: 'Сменить' }).click()
  await expect(page.getByRole('group', { name: 'Выбор участника' })).toContainText('Борис Клиент')
  await page.getByRole('button', { name: /Борис Клиент/ }).click()
  await expect(page.locator('.ops-context-row')).toContainText('Борис Клиент')
})
