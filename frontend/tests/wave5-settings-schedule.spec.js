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

async function mockAdmin(page, { clients = [], trainers = [], sessions = [], scheduleRequests = [] } = {}) {
  let historyFrom = null
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
    if (path === '/api/admin/trainers/') return json(route, { trainers, pagination: { page: 1, page_size: 50, total: trainers.length, pages: 1, has_next: false } })
    if (path === '/api/admin/payroll/rates/') return json(route, { rates: [{ id: 7, name: 'Групповая стандарт', session_type: 'group', base_amount_minor: 10000, currency: 'PLN', is_active: true }] })
    if (path === '/api/admin/payroll/preview/') return json(route, {
      rows: [{ session_id: 1, trainer_id: 8, trainer: 'Marek Nowak', date: '2026-07-10', training: 'Group', group_or_client: 'Delfiny', amount_minor: 10000, currency: 'PLN' }],
      trainers: [{ trainer_id: 8, trainer: 'Marek Nowak', sessions: 1, missing: 0, totals: { PLN: 10000 } }], totals: { PLN: 10000 }, sessions: 1,
    })
    if (path === '/api/admin/settings/client-portal/') {
      if (request.method() === 'PATCH') historyFrom = request.postDataJSON().history_from
      return json(route, { history_from: historyFrom, updated_at: null })
    }
    if (path === '/api/admin/schedule/sessions/') {
      scheduleRequests.push(url)
      return json(route, { sessions, pagination: { page: 1, page_size: 200, total: sessions.length, pages: 1, has_next: false, has_previous: false } })
    }
    const attendanceMatch = path.match(/^\/api\/admin\/schedule\/sessions\/(\d+)\/attendance\/$/)
    if (attendanceMatch) return json(route, { session: sessions.find((session) => String(session.id) === attendanceMatch[1]), students: [] })
    return json(route, EMPTY_ADMIN_COLLECTIONS)
  })
}

test('client portal history start date is configurable in Settings', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width), 'desktop and phone settings')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=settings')
  if (page.viewportSize()?.width === 390) {
    await page.locator('.ops-settings-mobile-nav').getByTestId('admin-settings-category-control').click()
    await page.locator('.ops-settings-mobile-nav').getByTestId('admin-settings-resource-clientPortal').click()
  } else {
    await page.locator('.ops-settings-desktop-nav').getByTestId('admin-settings-category-control').click()
    await page.locator('.ops-settings-desktop-nav').getByTestId('admin-settings-resource-clientPortal').click()
  }
  const panel = page.getByTestId('client-portal-history-settings')
  await expect(panel).toBeVisible()
  const date = panel.getByRole('textbox', { name: /Показывать историю начиная с|Показувати історію починаючи з|Pokazuj historię od|Show history from/ })
  await date.fill('2026-11-01')
  await panel.getByRole('button', { name: /Сохранить|Зберегти|Zapisz|Save/ }).click()
  await expect(page.getByText(/Дата начала истории сохранена|Дату початку історії збережено|Data początku historii została zapisana|History start date saved/)).toBeVisible()
  expect(await date.inputValue()).toBe('2026-11-01')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
})

test('payroll settings separates rates, assignments and calculation dates', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width), 'desktop and phone')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=settings')
  if (page.viewportSize()?.width === 390) {
    await page.locator('.ops-settings-mobile-nav').getByTestId('admin-settings-category-payroll').click()
    await page.locator('.ops-settings-mobile-nav').getByTestId('admin-settings-resource-payrollRates').click()
  } else {
    await page.locator('.ops-settings-desktop-nav').getByTestId('admin-settings-category-payroll').click()
  }
  const createRate = page.getByRole('button', { name: /Создать ставку|Створити ставку|Utwórz stawkę|Create rate/ })
  await expect(createRate).toBeVisible()
  await createRate.click()
  await expect(page.getByLabel(/Период расчёта: с|Період розрахунку: з|Okres rozliczenia: od|Calculation period: from/)).toHaveCount(0)
  await expect(page.getByLabel(/Базовая сумма|Базова сума|Kwota bazowa|Base amount/)).toBeVisible()
  await page.getByRole('button', { name: /Отмена|Скасувати|Anuluj|Cancel/ }).click()
  if (page.viewportSize()?.width === 390) await page.locator('.ops-settings-mobile-back .ops-context-back').click()
  const nav = page.viewportSize()?.width === 390 ? page.locator('.ops-settings-mobile-nav') : page.locator('.ops-settings-desktop-nav')
  await nav.getByTestId('admin-settings-resource-periods').click()
  await page.locator('.ops-edit-panel details > summary').click()
  await page.getByRole('button', { name: /Рассчитать период|Розрахувати період|Oblicz okres|Calculate period/ }).click()
  await expect(page.getByLabel(/Период расчёта: с|Період розрахунку: з|Okres rozliczenia: od|Calculation period: from/)).toBeVisible()
  await expect(page.getByLabel(/Период расчёта: по|Період розрахунку: по|Okres rozliczenia: do|Calculation period: to/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
})

test('payroll preview selects a trainer and shows totals', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width), 'desktop and phone')
  await mockAdmin(page, { trainers: [{ id: 8, full_name: 'Marek Nowak', is_active: true }] })
  await page.goto('/?role=admin&view=settings')
  const nav = page.locator(page.viewportSize()?.width === 390 ? '.ops-settings-mobile-nav' : '.ops-settings-desktop-nav')
  await nav.getByTestId('admin-settings-category-payroll').click()
  await nav.getByTestId('admin-settings-resource-periods').click()
  await page.getByLabel(/Тренер|Trener|Trainer/).last().selectOption('8')
  await page.getByRole('button', { name: /Рассчитать зарплату|Розрахувати зарплату|Oblicz wynagrodzenie|Calculate salary/ }).click()
  await expect(page.getByText('100.00 PLN').first()).toBeVisible()
  await expect(page.getByText('Delfiny')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Скачать CSV|Завантажити CSV|Pobierz CSV|Download CSV/ }).click()
  expect((await download).suggestedFilename()).toBe('payroll.csv')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
})

test('trainer card assigns an existing rate without creation or calculation controls', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width), 'desktop and phone')
  await mockAdmin(page, { trainers: [{ id: 8, username: 'coach', first_name: 'Marek', last_name: 'Nowak', full_name: 'Marek Nowak', is_active: true, user_is_active: true, groups_count: 0 }] })
  await page.goto('/?role=admin&view=trainers')
  await page.getByRole('button', { name: /Marek Nowak/ }).first().click()
  await page.getByTestId('admin-trainer-tab-payroll').click()
  await expect(page.getByRole('button', { name: /Назначить ставку|Призначити ставку|Przypisz stawkę|Assign rate/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Создать ставку|Створити ставку|Utwórz stawkę|Create rate/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Рассчитать период|Розрахувати період|Oblicz okres|Calculate period/ })).toHaveCount(0)
  await page.getByRole('button', { name: /Назначить ставку|Призначити ставку|Przypisz stawkę|Assign rate/ }).click()
  await expect(page.locator('#trainer-payroll-from')).toBeVisible()
})

test('desktop Settings keeps categories and resources beside their detail', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'desktop settings navigation')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=settings')

  const nav = page.locator('.ops-settings-desktop-nav')
  await expect(nav).toBeVisible()
  await nav.getByTestId('admin-settings-category-notifications').click()
  await nav.getByTestId('admin-settings-resource-rules').click()
  await expect(nav.getByTestId('admin-settings-category-notifications')).toHaveAttribute('aria-selected', 'true')
  await expect(nav.getByTestId('admin-settings-resource-rules')).toHaveAttribute('aria-current', 'true')
  const categoryBox = await nav.getByTestId('admin-settings-category-notifications').boundingBox()
  const resourceBox = await nav.getByTestId('admin-settings-resource-rules').boundingBox()
  const nextCategoryBox = await nav.getByTestId('admin-settings-category-payroll').boundingBox()
  expect(resourceBox.y).toBeGreaterThan(categoryBox.y)
  expect(resourceBox.y).toBeLessThan(nextCategoryBox.y)
  await expect(page.locator('.ops-settings-detail .section-title')).toBeVisible()
  const [navBox, detailBox] = await Promise.all([nav.boundingBox(), page.locator('.ops-settings-detail').boundingBox()])
  expect(detailBox.x).toBeGreaterThan(navBox.x + navBox.width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
})

test('mobile Settings expands categories inline and opens a resource', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 390, 'phone hierarchy')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=settings')

  const categories = page.locator('.ops-settings-mobile-nav .ops-settings-mobile-list').first()
  await expect(categories).toBeVisible()
  await expect(page.locator('.ops-settings-desktop-nav')).toBeHidden()
  await expect(page.locator('.ops-settings-page-refresh')).toBeHidden()
  expect((await categories.getByTestId('admin-settings-category-catalog').boundingBox()).height).toBeLessThanOrEqual(60)
  await categories.getByTestId('admin-settings-category-catalog').click()

  await expect(categories.getByTestId('admin-settings-category-catalog')).toHaveAttribute('aria-expanded', 'true')
  await expect(categories.getByTestId('admin-settings-category-notifications')).toBeVisible()
  await expect(page.getByTestId('admin-settings-resource-subscriptionTypes').last()).toBeVisible()
  await expect(page.locator('.ops-settings-page-refresh')).toBeHidden()
  await page.getByTestId('admin-settings-resource-subscriptionTypes').last().click()

  await expect(page.locator('.ops-settings-mobile-back .ops-context-back')).toBeVisible()
  await expect(page.locator('.ops-settings-detail .section-title')).toBeVisible()
  await expect(page.locator('.ops-settings-page-refresh')).toBeVisible()
  await page.locator('.ops-settings-mobile-back > button').last().click()
  await expect(categories).toBeVisible()
  await categories.getByTestId('admin-settings-category-notifications').click()
  const templates = page.getByTestId('admin-settings-resource-templates').last()
  await expect(templates).toContainText('Тексти повідомлень')
  await expect(templates).not.toContainText('Створення та редагування')

  const geometry = await page.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    horizontalCarousels: [...document.querySelectorAll('.ops-action-strip')].filter((node) => getComputedStyle(node).overflowX === 'auto').length,
  }))
  expect(geometry).toEqual({ pageOverflow: false, horizontalCarousels: 0 })
})

test('Wave 5 Admin schedule keeps filters and period when returning from a session', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'phone and desktop schedule contract')
  const today = isoToday()
  const scheduleRequests = []
  const sessions = [
    { id: 1, start_at: `${today}T10:00:00+02:00`, end_at: `${today}T11:00:00+02:00`, session_type: 'group', trainer_id: 1, trainer: 'Marek Trainer', group: { id: 1, name: 'Delfiny' }, location: 'Pool A', participants_count: 4, max_participants: 8, is_cancelled: false },
    { id: 2, start_at: `${today}T12:00:00+02:00`, end_at: `${today}T13:00:00+02:00`, session_type: 'split', presentation_type_label: 'Сплит', trainer_id: 1, trainer: 'Marek Trainer', group: null, individual_participant: { id: 2, full_name: 'Anna Client' }, location: 'Pool A', participants_count: 2, max_participants: 2, is_cancelled: false },
  ]
  await mockAdmin(page, { sessions, scheduleRequests })
  await page.goto('/?role=admin&view=schedule')

  const trigger = page.getByTestId('admin-schedule-filters-trigger')
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(2)
  await expect(page.getByTestId('schedule-period-day')).toHaveCount(0)
  if ((page.viewportSize()?.width || 0) === 390) {
    await expect(page.getByTestId('schedule-period-week')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('schedule-calendar-view-switch')).toBeHidden()
    await expect(page.locator('.ops-mobile-date-strip button')).toHaveCount(7)
    const mobileHeader = await page.locator('.ops-mobile-date-navigation').evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
      border: getComputedStyle(node).borderStyle,
      height: node.getBoundingClientRect().height,
    }))
    expect(mobileHeader.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(mobileHeader.border).toBe('solid')
    expect(mobileHeader.height).toBeGreaterThanOrEqual(58)
  } else {
    await expect(page.locator('.ops-calendar-period-header.is-week > .ops-calendar-period-arrow')).toHaveCount(2)
    await expect(page.locator('.ops-calendar-period-header.is-week > .ops-calendar-period-arrow').first()).toHaveCSS('height', '58px')
    await expect(page.locator('.ops-calendar-period-header.is-week > .ops-calendar-period-arrow').last()).toHaveCSS('height', '58px')
  }
  const lessonStyle = await page.locator('.ops-schedule-event:visible').first().evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      radius: Number.parseFloat(style.borderRadius),
      cursor: style.cursor,
      background: style.backgroundColor,
    }
  })
  expect(lessonStyle.radius).toBeGreaterThanOrEqual(8)
  expect(lessonStyle.cursor).toBe('pointer')
  expect(lessonStyle.background).not.toBe('rgba(0, 0, 0, 0)')
  await expect(page.getByTestId('admin-schedule-filter-count')).toHaveAttribute('data-total', '2')
  await expect(page.getByTestId('admin-schedule-filter-count')).toBeHidden()
  await trigger.click()
  await page.getByTestId('admin-schedule-filter-type').selectOption('split')
  await page.getByTestId('admin-schedule-filter-apply').click()
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(1)
  await expect(page.getByTestId('admin-schedule-filter-count')).toHaveAttribute('data-total', '1')
  await expect(page.getByTestId('admin-schedule-filter-count')).toBeVisible()
  if ((page.viewportSize()?.width || 0) > 767) {
    await expect(page.getByTestId('schedule-period-day')).toHaveCount(0)
    await page.getByTestId('schedule-period-month').click()
    await expect(page.getByTestId('admin-schedule-filter-count')).toHaveAttribute('data-total', '1')
    await expect(page.locator('.ops-calendar-period-header.is-month > .ops-calendar-period-arrow').first()).toHaveCSS('height', '58px')
    await expect(page.locator('.ops-calendar-period-header.is-month > .ops-calendar-period-arrow').last()).toHaveCSS('height', '58px')
  }

  const strip = page.locator('.ops-action-strip').first()
  if ((page.viewportSize()?.width || 0) === 390) {
    const stripGeometry = await strip.evaluate((node) => ({
      overflowX: getComputedStyle(node).overflowX,
      columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
      clipped: node.scrollWidth > node.clientWidth + 1,
    }))
    expect(stripGeometry).toEqual({ overflowX: 'visible', columns: 2, clipped: false })
  }

  await expect(page).toHaveURL(/sfType=split/)
  const scheduleOnlyRequests = [...scheduleRequests]
  await page.locator('.ops-schedule-event:visible').first().click()
  await expect(page).toHaveURL(/view=attendance/)
  await page.locator('.ops-attendance-page .ops-context-back').click()
  await expect(page).toHaveURL(/sfType=split/)
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(1)
  await expect(page.getByTestId('admin-schedule-filter-count')).toHaveAttribute('data-count', '1')
  if ((page.viewportSize()?.width || 0) > 767) await expect(page.getByTestId('schedule-period-month')).toHaveAttribute('aria-pressed', 'true')
  await page.goForward()
  await expect(page).toHaveURL(/view=attendance/)
  await page.goBack()
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(1)

  await page.reload()
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(1)
  await trigger.click()
  await expect(page.getByTestId('admin-schedule-filter-type')).toHaveValue('split')
  await page.getByTestId('admin-schedule-filter-reset').click()
  await page.getByTestId('admin-schedule-filter-apply').click()
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(2)
  await expect(page).not.toHaveURL(/sfType=/)
  for (const requestUrl of scheduleOnlyRequests) {
    expect(requestUrl.searchParams.get('date_from')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(requestUrl.searchParams.get('date_to')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const days = (new Date(requestUrl.searchParams.get('date_to')) - new Date(requestUrl.searchParams.get('date_from'))) / 86_400_000
    expect(days).toBeLessThanOrEqual(42)
  }
})

test('Admin schedule opens a shared URL with its filters, date and view', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'desktop direct-link contract')
  const today = isoToday()
  await mockAdmin(page, { sessions: [
    { id: 2, start_at: `${today}T12:00:00+02:00`, end_at: `${today}T13:00:00+02:00`, session_type: 'split', trainer_id: 1, trainer: 'Marek Trainer', group: null, location: 'Pool A', participants_count: 2, max_participants: 2, is_cancelled: false },
  ] })
  await page.goto(`/?role=admin&view=schedule&sfType=split&sfTrainer=1&sfLocation=Pool+A&sfStatus=planned&sfDate=${today}&sfMode=month&sfDisplay=list`)
  await expect(page.getByTestId('schedule-period-month')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('schedule-view-list')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('schedule-list').locator('.ops-session-row')).toHaveCount(1)
  await page.getByTestId('admin-schedule-filters-trigger').click()
  await expect(page.getByTestId('admin-schedule-filter-type')).toHaveValue('split')
  await expect(page.getByTestId('admin-schedule-filter-trainer')).toHaveValue('1')
  await expect(page.getByTestId('admin-schedule-filter-location')).toHaveValue('Pool A')
  await expect(page.getByTestId('admin-schedule-filter-status')).toHaveValue('planned')
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
  const isTablet = (page.viewportSize()?.width || 0) === 768
  const table = page.locator(`${isTablet ? '.ops-client-tablet-table' : '.ops-client-desktop-table'} .table-wrap`)
  await expect(table).toBeVisible()
  const row = table.getByRole('row').filter({ hasText: 'Ковальская-Длинная-Фамилия' })
  const actions = isTablet
    ? row.locator('.ops-entity-actions-trigger')
    : row.locator('.ops-client-row-actions')
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
  await expect(page.locator('.ops-list-pagination')).toHaveCount(0)
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
  await expect(page.getByTestId('admin-schedule-filters-trigger')).toHaveCount(0)
  await page.getByTestId('nav-trainer-schedule').first().click()
  await expect(page.getByTestId('schedule-calendar')).toBeVisible()
  await page.getByTestId('schedule-view-list').click()
  await expect(page.getByTestId('trainer-schedule-list')).toBeVisible()
  role = 'client'
  await page.goto('/?role=client&view=schedule')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByTestId('admin-schedule-filters-trigger')).toHaveCount(0)
  await expect(page.getByTestId('admin-schedule-filter-type')).toHaveCount(0)
})

test('Trainer schedule restores its period and display after opening a session', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'phone and desktop schedule contract')
  const today = isoToday()
  const session = { id: 42, start_at: `${today}T12:00:00+02:00`, end_at: `${today}T13:00:00+02:00`, group: { id: 1, name: 'Masters' }, location: 'Pool A', participants_count: 1, max_participants: 8, is_cancelled: false }
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/me/') return json(route, { id: 2, username: 'trainer', role: 'trainer', full_name: 'Marek Trainer' })
    if (path === '/api/trainer/sessions/') return json(route, { sessions: [session] })
    if (path === '/api/trainer/sessions/42/') return json(route, { session, students: [] })
    if (path === '/api/trainer/groups/') return json(route, { groups: [] })
    return json(route, {})
  })
  await page.goto('/?role=trainer&view=schedule')
  if ((page.viewportSize()?.width || 0) > 767) {
    await page.getByTestId('schedule-period-month').click()
    await page.getByTestId('schedule-view-list').click()
    await expect(page).toHaveURL(/sfMode=month.*sfDisplay=list/)
    await page.getByTestId('trainer-schedule-list').locator('button').first().click()
  } else {
    await page.getByTestId(`schedule-day-${today}`).click()
    await expect(page).toHaveURL(new RegExp(`sfDate=${today}`))
    await page.getByTestId('trainer-mobile-schedule-agenda').locator('button').first().click()
  }
  await expect(page).toHaveURL(/view=session/)
  await page.locator('.ops-context-back').first().click()
  await expect(page).toHaveURL(/view=schedule/)
  if ((page.viewportSize()?.width || 0) > 767) {
    await expect(page.getByTestId('schedule-period-month')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('schedule-view-list')).toHaveAttribute('aria-pressed', 'true')
  } else await expect(page).toHaveURL(new RegExp(`sfDate=${today}`))
})

test('trainer mobile schedule marks active days and pages through the list', async ({ page }) => {
  test.skip(![390, 768].includes(page.viewportSize()?.width || 0), 'mobile schedule widths')
  await page.addInitScript(() => localStorage.setItem('swimcrm.ui.locale.2.trainer', 'ru'))
  const session = (id, day, hour, cancelled = false) => ({
    id, start_at: `${day}T${String(hour).padStart(2, '0')}:00:00+01:00`,
    end_at: `${day}T${String(hour + 1).padStart(2, '0')}:00:00+01:00`,
    group: { id: 1, name: 'Masters' }, location: 'Pool A',
    participants_count: 1, max_participants: 8, is_cancelled: cancelled,
  })
  const firstPage = [
    ...Array.from({ length: 8 }, (_, index) => session(index + 1, '2026-11-30', index + 8)),
    ...Array.from({ length: 8 }, (_, index) => session(index + 21, '2026-12-02', index + 8)),
  ]
  const cancelled = session(90, '2026-12-01', 12, true)
  const requests = []
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/health/') return json(route, { status: 'ok' })
    if (url.pathname === '/api/me/') return json(route, { id: 2, username: 'trainer', role: 'trainer', full_name: 'Marek Trainer' })
    if (url.pathname === '/api/trainer/sessions/') {
      requests.push(url.search)
      if (url.searchParams.has('page')) {
        const pageNumber = Number(url.searchParams.get('page'))
        const start = url.searchParams.get('date_from') || ''
        return json(route, { sessions: pageNumber === 1 ? firstPage.filter((row) => row.start_at.slice(0, 10) >= start) : Array.from({ length: 8 }, (_, index) => session(40 + index, '2026-12-03', index + 8)),
          pagination: { has_next: pageNumber === 1 } })
      }
      return json(route, { sessions: [...firstPage, cancelled] })
    }
    return json(route, {})
  })
  await page.goto('/?role=trainer&view=schedule&sfDate=2026-11-30')
  const titleBox = await page.locator('.ops-trainer-schedule-head .page-title').boundingBox()
  const switchBox = await page.locator('.ops-trainer-schedule-head .ops-trainer-view-toggle').boundingBox()
  expect(switchBox.x).toBeGreaterThan(titleBox.x + titleBox.width)
  expect(switchBox.width).toBeLessThan(140)
  await expect(page.getByTestId('trainer-mobile-view-list')).toHaveText('Список')
  await expect(page.getByTestId('trainer-mobile-month')).toContainText('ноябр')
  await expect(page.getByTestId('trainer-mobile-month')).not.toContainText('2026')
  await expect(page.locator('.ops-trainer-mobile-header')).toHaveCSS('background-color', await page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor))
  await expect(page.getByTestId('schedule-day-2026-11-30').locator('.ops-trainer-day-marker')).toHaveClass(/is-active/)
  await expect(page.getByTestId('schedule-day-2026-12-01').locator('.ops-trainer-day-marker')).not.toHaveClass(/is-active/)
  await expect(page.getByTestId('schedule-day-2026-11-30')).toHaveAttribute('aria-label', /Есть занятия/)
  const sticky = await page.locator('.ops-trainer-mobile-header').evaluate((node) => ({
    position: getComputedStyle(node).position, top: parseFloat(getComputedStyle(node).top),
  }))
  expect(sticky.position).toBe('sticky')
  expect(sticky.top).toBeGreaterThanOrEqual(0)

  await page.getByTestId('trainer-mobile-view-list').click()
  await expect(page.getByTestId('trainer-mobile-view-calendar')).toHaveText('Календарь')
  await expect(page.getByTestId('trainer-mobile-schedule-list').locator('.ops-mobile-session-row')).toHaveCount(16)
  expect(requests.some((query) => query.includes('status=active') && query.includes('page=1'))).toBe(true)
  await page.getByRole('button', { name: 'Показать ещё' }).click()
  await expect(page.getByTestId('trainer-mobile-schedule-list').locator('.ops-mobile-session-row')).toHaveCount(24)
  if (page.viewportSize()?.width === 768) await page.setViewportSize({ width: 768, height: 600 })
  await page.locator('.ops-agenda-day[data-date="2026-12-02"]').evaluate((node) => node.scrollIntoView({ block: 'start' }))
  await page.evaluate(() => window.scrollBy(0, 100))
  await expect(page.getByTestId('trainer-mobile-month')).toContainText('декабр')
  await page.getByTestId('trainer-mobile-view-calendar').click()
  await expect(page).toHaveURL(/sfDate=2026-12-02/)
  await page.getByTestId('trainer-mobile-view-list').click()
  await page.getByTestId('trainer-mobile-schedule-list').locator('.ops-mobile-session-open').first().click()
  await expect(page).toHaveURL(/view=session/)
})

test('trainer mobile day markers stay blank until the selected week loads', async ({ page }) => {
  test.skip(![390, 768].includes(page.viewportSize()?.width || 0), 'mobile schedule widths')
  await page.addInitScript(() => localStorage.setItem('swimcrm.ui.locale.2.trainer', 'ru'))
  let releaseNextRequest
  const pending = new Promise((resolve) => { releaseNextRequest = resolve })
  const session = (id, day) => ({
    id, start_at: `${day}T17:00:00+01:00`, end_at: `${day}T18:00:00+01:00`,
    group: { id: 1, name: 'Masters' }, location: 'Pool A',
    participants_count: 1, max_participants: 8,
  })
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/health/') return json(route, { status: 'ok' })
    if (url.pathname === '/api/me/') return json(route, { id: 2, username: 'trainer', role: 'trainer' })
    if (url.pathname === '/api/trainer/sessions/') {
      const week = url.searchParams.get('date_from')
      if (week === '2026-12-07') {
        await pending
        return json(route, { sessions: [session(2, '2026-12-08')] })
      }
      if (week === '2026-12-14') return json(route, { error: 'Unavailable' }, 500)
      return json(route, { sessions: week === '2026-11-30' ? [session(1, '2026-11-30')] : [] })
    }
    return json(route, {})
  })
  await page.goto('/?role=trainer&view=schedule&sfDate=2026-11-30')
  await expect(page.getByTestId('schedule-day-2026-11-30').locator('.ops-trainer-day-marker')).toHaveClass(/is-active/)
  await page.locator('.ops-mobile-date-navigation > button').last().click()
  await expect(page.getByTestId('schedule-day-2026-12-07')).toHaveAttribute('aria-label', /Загрузка занятий/)
  await expect(page.locator('.ops-mobile-date-strip .ops-trainer-day-marker.is-active')).toHaveCount(0)
  await expect(page.locator('.ops-mobile-date-strip .ops-trainer-day-marker')).toHaveCount(7)
  await expect(page.getByTestId('schedule-day-2026-12-07').locator('.ops-trainer-day-marker')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const loadingHeight = (await page.getByTestId('schedule-day-2026-12-07').boundingBox()).height
  await expect(page.locator('.ops-schedule-mobile-content .empty[role="status"]')).toContainText('Загрузка занятий')
  releaseNextRequest()
  await expect(page.getByTestId('schedule-day-2026-12-08').locator('.ops-trainer-day-marker')).toHaveClass(/is-active/)
  expect((await page.getByTestId('schedule-day-2026-12-07').boundingBox()).height).toBe(loadingHeight)
  await page.locator('.ops-mobile-date-navigation > button').last().click()
  await expect(page.getByTestId('schedule-day-2026-12-14')).toHaveAttribute('aria-label', /недоступны/)
  await expect(page.locator('.ops-mobile-date-strip .ops-trainer-day-marker.is-active')).toHaveCount(0)
  await page.locator('.ops-mobile-date-navigation > button').last().click()
  await expect(page.getByTestId('schedule-day-2026-12-21')).toHaveAttribute('aria-label', /Нет занятий/)
  await expect(page.getByTestId('trainer-mobile-schedule-agenda')).toContainText(/Занятий.*нет/)
})

test('Client schedule restores its calendar position after navigation', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'phone and desktop schedule contract')
  const today = isoToday()
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const payload = path === '/api/me/' ? { id: 3, username: 'parent', role: 'parent' }
      : path === '/api/client/overview/' ? { participants: [] }
        : path === '/api/client/profile/' ? { account: {}, participants: [] }
          : path === '/api/client/consents/' ? { consents: [] }
            : path === '/api/client/schedule/' ? { sessions: [] }
              : path === '/api/client/notifications/' ? { notifications: [], pagination: { has_next: false } }
                : {}
    return json(route, payload)
  })
  await page.goto('/?role=client&view=schedule')
  if ((page.viewportSize()?.width || 0) > 767) {
    await page.getByTestId('schedule-period-month').click()
    await page.getByTestId('schedule-view-list').click()
  } else await page.getByTestId(`schedule-day-${today}`).click()
  await page.goto('/?role=client&view=home')
  await page.goBack()
  if ((page.viewportSize()?.width || 0) > 767) {
    await expect(page.getByTestId('schedule-period-month')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('schedule-view-list')).toHaveAttribute('aria-pressed', 'true')
  } else await expect(page).toHaveURL(new RegExp(`sfDate=${today}`))
})

test('trainer attendance keeps the selected session after saving a mark', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'attendance layouts')
  await page.addInitScript(() => localStorage.setItem('swimcrm.ui.locale.2.trainer', 'uk'))
  const methods = []
  const noteText = 'Довга приватна нотатка '.repeat(25)
  const notes = [{ id: 1, body: noteText, author: 'Marek Trainer', imported: false, created_at: '2026-10-04T15:00:00+02:00', edited: false, can_manage: true }]
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/me/') return json(route, { id: 2, username: 'trainer', role: 'trainer', full_name: 'Marek Trainer' })
    if (path === '/api/csrf/') return json(route, { ok: true })
    if (path === '/api/trainer/sessions/42/' && request.method() === 'GET') return json(route, {
      session: { id: 42, start_at: '2026-10-04T17:00:00+02:00', end_at: '2026-10-04T18:00:00+02:00', group: { name: 'Masters' }, location: 'Pool A', is_cancelled: false },
      students: [{ id: 8, full_name: 'Jan Kowalski', birth_date: '2015-05-10', has_internal_notes: true, can_write_notes: true, photo_version: 'v1', attendance: null }],
    })
    if (path === '/api/trainer/sessions/42/participants/8/notes/') {
      if (request.method() === 'POST') {
        const note = { id: 2, body: request.postDataJSON().body, author: 'Marek Trainer', imported: false, created_at: '2026-10-04T16:00:00+02:00', edited: false, can_manage: true }
        notes.unshift(note)
        return json(route, note)
      }
      return json(route, { notes })
    }
    if (path === '/api/trainer/sessions/42/participants/8/photo/') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64') })
    if (path === '/api/trainer/sessions/42/attendance/' && ['POST', 'DELETE'].includes(request.method())) {
      methods.push(request.method())
      return json(route, { status: request.method() === 'DELETE' ? null : 'present' })
    }
    if (path === '/api/trainer/sessions/' || path === '/api/trainer/groups/' || path === '/api/trainer/history/') return json(route, { sessions: [], groups: [] })
    return json(route, {})
  })

  await page.goto('/?role=trainer&view=session&trainerSession=42')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.getByRole('button', { name: /Jan Kowalski/ }).first().click()
  await expect(page.getByRole('dialog', { name: 'Jan Kowalski' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Jan Kowalski' }).locator('[data-dialog-cancel]').click()
  await expect(page.locator('.ops-attendance-actions button')).toHaveCount(3)
  await expect(page.locator('.ops-attendance-actions button')).toHaveCount(3)
  const notesTrigger = page.getByTestId('participant-notes-open-8')
  await expect(notesTrigger).not.toContainText('🔒')
  if (page.viewportSize()?.width === 390) {
    const cardBox = await page.locator('.ops-attendance-card').first().boundingBox()
    const triggerBox = await notesTrigger.boundingBox()
    expect(triggerBox.x).toBeGreaterThan(cardBox.x + cardBox.width / 2)
    expect(cardBox.x + cardBox.width - triggerBox.x - triggerBox.width).toBeLessThanOrEqual(17)
  }
  await notesTrigger.click()
  const notesPanel = page.getByRole('dialog', { name: /Тільки для персоналу: Jan Kowalski/ })
  await expect(notesPanel).toBeVisible()
  await expect(notesPanel).toContainText('10.05.2015')
  await expect(notesPanel).toContainText(noteText)
  if (page.viewportSize()?.width === 390) {
    expect(await notesPanel.evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true)
    expect(await notesPanel.locator('.participant-note').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await notesPanel.getByRole('textbox').fill('Нова нотатка')
  await notesPanel.getByRole('button', { name: 'Зберегти' }).click()
  await expect(notesPanel).toContainText('Нова нотатка')
  await notesPanel.getByRole('button', { name: 'Закрити' }).click()
  if (page.viewportSize()?.width === 390) {
    for (const button of await page.locator('.ops-attendance-actions button').all()) {
      const fits = await button.evaluate((element) => {
        const outer = element.getBoundingClientRect()
        const label = element.querySelector('span').getBoundingClientRect()
        return label.left >= outer.left && label.right <= outer.right && label.top >= outer.top && label.bottom <= outer.bottom
      })
      expect(fits).toBe(true)
    }
  }
  await page.getByTestId('trainer-attendance-8-present').click()
  await expect(page.getByTestId('trainer-attendance-8-present')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('trainer-attendance-8-present').click()
  await expect(page.getByTestId('trainer-attendance-8-present')).toHaveAttribute('aria-pressed', 'false')
  expect(methods).toEqual(['POST', 'DELETE'])
  await expect(page).toHaveURL(/trainerSession=42/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
