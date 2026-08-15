import { expect, test } from '@playwright/test'


function json(route, payload, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
}

function isoToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const EMPTY_ADMIN_COLLECTIONS = {
  clients: [], trainers: [], groups: [], subscription_types: [], locations: [],
  session_types: [], payments: [], debtors: [], templates: [], rules: [], policies: [],
  translations: [], schemes: [], assignments: [], periods: [], languages: [], keys: [],
  entries: [], batches: [], users: [], logs: [],
  pagination: { page: 1, page_size: 200, total: 0, pages: 0, has_next: false, has_previous: false },
}

async function mockAdmin(page, { clients = [], sessions = [], scheduleRequests = [] } = {}) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/me/') return json(route, { id: 1, username: 'admin', role: 'admin', full_name: 'Admin Wave 5' })
    if (path === '/api/admin/dashboard/') return json(route, { metrics: { clients: clients.length, active_subscriptions: 0, debtors: 0 } })
    if (path === '/api/admin/reference/') return json(route, {
      trainers: [{ id: 1, full_name: 'Marek Trainer' }],
      groups: [{ id: 1, name: 'Delfiny', default_capacity: 8 }],
      subscription_types: [], locations: [{ id: 1, name: 'Pool A' }],
      session_types: [], participants: clients,
      choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
    })
    if (path === '/api/admin/clients/') {
      const pageSize = Number(url.searchParams.get('page_size') || 50)
      return json(route, {
        clients,
        pagination: { page: 1, page_size: pageSize, total: 120, pages: Math.ceil(120 / pageSize), has_next: pageSize < 120, has_previous: false },
      })
    }
    if (path === '/api/admin/schedule/sessions/') {
      scheduleRequests.push(url)
      return json(route, { sessions, pagination: { page: 1, page_size: 200, total: sessions.length, pages: 1, has_next: false, has_previous: false } })
    }
    return json(route, EMPTY_ADMIN_COLLECTIONS)
  })
}

test('Wave 5 mobile Settings is an unambiguous Category to Resource to Detail hierarchy', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 390, 'phone hierarchy')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=settings')

  const categories = page.getByLabel('Категории настроек')
  await expect(categories).toBeVisible()
  await expect(page.locator('.ops-settings-desktop-nav')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Обновить' })).toBeHidden()
  await categories.getByRole('button', { name: 'Справочники' }).click()

  await expect(page.getByRole('button', { name: 'Категории', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Типы абонементов/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Обновить' })).toBeHidden()
  await page.getByRole('button', { name: /Типы абонементов/ }).click()

  await expect(page.getByRole('button', { name: 'Справочники', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Типы абонементов' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Обновить' })).toBeVisible()
  await page.getByRole('button', { name: 'Справочники', exact: true }).click()
  await page.getByRole('button', { name: 'Категории', exact: true }).click()
  await expect(categories).toBeVisible()

  const geometry = await page.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    horizontalCarousels: [...document.querySelectorAll('.ops-action-strip')].filter((node) => getComputedStyle(node).overflowX === 'auto').length,
  }))
  expect(geometry).toEqual({ pageOverflow: false, horizontalCarousels: 0 })
})

test('Wave 5 Admin schedule type filter controls rows and counts only inside the requested period and resets on leave', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'phone and desktop schedule contract')
  const today = isoToday()
  const scheduleRequests = []
  const sessions = [
    { id: 1, start_at: `${today}T10:00:00+02:00`, end_at: `${today}T11:00:00+02:00`, session_type: 'group', trainer_id: 1, trainer: 'Marek Trainer', group: { id: 1, name: 'Delfiny' }, location: 'Pool A', participants_count: 4, max_participants: 8, is_cancelled: false },
    { id: 2, start_at: `${today}T12:00:00+02:00`, end_at: `${today}T13:00:00+02:00`, session_type: 'split', presentation_type_label: 'Сплит', trainer_id: 1, trainer: 'Marek Trainer', group: null, individual_participant: { id: 2, full_name: 'Anna Client' }, location: 'Pool A', participants_count: 2, max_participants: 2, is_cancelled: false },
  ]
  await mockAdmin(page, { sessions, scheduleRequests })
  await page.goto('/?role=admin&view=schedule')

  const trigger = page.getByRole('button', { name: /Фильтры/ })
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(2)
  await expect(trigger).toContainText('За неделю: 2')
  await trigger.click()
  const filters = page.getByRole('dialog', { name: 'Фильтры расписания' })
  await filters.getByLabel('Тип тренировки').selectOption('split')
  await filters.getByRole('button', { name: 'Применить' }).click()
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(1)
  await expect(trigger).toContainText('За неделю: 1')
  await page.getByRole('button', { name: 'День', exact: true }).click()
  await expect(trigger).toContainText('За день: 1')
  await page.getByRole('button', { name: 'Месяц', exact: true }).click()
  await expect(trigger).toContainText('За месяц: 1')

  const strip = page.locator('.ops-action-strip').first()
  if ((page.viewportSize()?.width || 0) === 390) {
    const stripGeometry = await strip.evaluate((node) => ({
      overflowX: getComputedStyle(node).overflowX,
      columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
      clipped: node.scrollWidth > node.clientWidth + 1,
    }))
    expect(stripGeometry).toEqual({ overflowX: 'visible', columns: 2, clipped: false })
  }

  await page.goto('/?role=admin&view=clients')
  await page.goto('/?role=admin&view=schedule')
  const resetTrigger = page.getByRole('button', { name: /Фильтры/ })
  await expect(resetTrigger).not.toContainText('· 1')
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(2)
  for (const requestUrl of scheduleRequests) {
    expect(requestUrl.searchParams.get('date_from')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(requestUrl.searchParams.get('date_to')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const days = (new Date(requestUrl.searchParams.get('date_to')) - new Date(requestUrl.searchParams.get('date_from'))) / 86_400_000
    expect(days).toBeLessThanOrEqual(42)
  }
})

test('Wave 5 desktop Clients keeps actions inside the table and reveals full ellipsized values on focus', async ({ page }) => {
  test.skip(![768, 1440].includes(page.viewportSize()?.width || 0), 'desktop boundaries')
  const client = {
    id: 1, client_id: 10, first_name: 'Александра-Очень-Длинное-Имя', last_name: 'Ковальская-Длинная-Фамилия',
    full_name: 'Александра-Очень-Длинное-Имя Ковальская-Длинная-Фамилия', birth_date: '2015-08-20',
    email: 'very-long-accessible-client-address@example.test', client_phone: '+48111222333',
    client_is_active: true, is_active: true, group: { id: 1, name: 'Очень длинное название группы дельфинов' },
  }
  await mockAdmin(page, { clients: [client] })
  await page.goto('/?role=admin&view=clients')
  const table = page.locator('.ops-client-desktop-table .table-wrap')
  await expect(table).toBeVisible()
  const row = table.getByRole('row').filter({ hasText: 'Ковальская-Длинная-Фамилия' })
  const actions = row.locator('.ops-client-row-actions')
  const bounds = await Promise.all([table.boundingBox(), actions.boundingBox()])
  expect(bounds[1].x).toBeGreaterThanOrEqual(bounds[0].x - 1)
  expect(bounds[1].x + bounds[1].width).toBeLessThanOrEqual(bounds[0].x + bounds[0].width + 1)
  expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(48)

  if ((page.viewportSize()?.width || 0) === 1440) {
    const email = row.locator('.ops-ellipsis-value[data-full-value="very-long-accessible-client-address@example.test"]')
    await email.focus()
    const tooltip = await email.evaluate((node) => ({
      display: getComputedStyle(node, '::after').display,
      content: getComputedStyle(node, '::after').content,
    }))
    expect(tooltip.display).toBe('block')
    expect(tooltip.content).toContain('very-long-accessible-client-address@example.test')
  }
  expect(await page.locator('.ops-list-pagination select option[value="500"]').evaluate((option) => option.disabled)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
})

test('Wave 5 Trainer and Client schedule surfaces never expose the Admin filter', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop role-visibility proof')
  let role = 'trainer'
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/me/') return json(route, { id: 2, username: role, role: role === 'client' ? 'parent' : role, full_name: `${role} Wave 5` })
    if (path === '/api/trainer/sessions/') return json(route, { sessions: [] })
    if (path === '/api/trainer/groups/') return json(route, { groups: [] })
    if (path === '/api/client/overview/') return json(route, { participants: [] })
    if (path === '/api/client/profile/') return json(route, { account: {}, participants: [] })
    if (path === '/api/client/consents/') return json(route, { consents: [] })
    if (path === '/api/client/schedule/') return json(route, { sessions: [] })
    if (path === '/api/client/notifications/') return json(route, { notifications: [], pagination: { has_next: false } })
    return json(route, {})
  })

  await page.goto('/?role=trainer&view=sessions')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: /Фильтры/ })).toHaveCount(0)
  role = 'client'
  await page.goto('/?role=client&view=schedule')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: /Фильтры/ })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Фильтры расписания' })).toHaveCount(0)
})
