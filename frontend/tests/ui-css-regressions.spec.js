import { expect, test } from '@playwright/test'


function json(route, payload) {
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
}

const pagination = { page: 1, page_size: 200, total: 0, pages: 0, has_next: false, has_previous: false }
const emptyCollections = {
  clients: [], trainers: [], groups: [], subscription_types: [], locations: [],
  session_types: [], payments: [], debtors: [], templates: [], rules: [], policies: [],
  translations: [], schemes: [], assignments: [], periods: [], languages: [], keys: [],
  entries: [], batches: [], users: [], logs: [], pagination,
}

async function mockAdmin(page, { clients = [], sessions = [], trainers = [] } = {}) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/me/') return json(route, { id: 1, username: 'admin', role: 'admin', full_name: 'Audit Administrator' })
    if (path === '/api/admin/dashboard/') return json(route, { metrics: { clients: clients.length, active_subscriptions: 0, debtors: 0 } })
    if (path === '/api/admin/reference/') return json(route, {
      trainers: [{ id: 1, full_name: 'Audit Trainer' }],
      groups: [{ id: 1, name: 'Audit Group', default_capacity: 8 }],
      subscription_types: [], locations: [{ id: 1, name: 'Pool A' }],
      session_types: [], participants: clients,
      choices: { payment_methods: [], notification_channels: [] },
      notification_settings: {},
    })
    if (path === '/api/admin/clients/') {
      const pageSize = Number(new URL(route.request().url()).searchParams.get('page_size') || 50)
      return json(route, { clients, pagination: { page: 1, page_size: pageSize, total: clients.length, pages: clients.length ? 1 : 0, has_next: false, has_previous: false } })
    }
    if (path === '/api/admin/trainers/') {
      const pageSize = Number(new URL(route.request().url()).searchParams.get('page_size') || 50)
      return json(route, { trainers, pagination: { page: 1, page_size: pageSize, total: trainers.length, pages: trainers.length ? 1 : 0, has_next: false, has_previous: false } })
    }
    if (path === '/api/admin/schedule/sessions/') return json(route, { sessions, pagination: { page: 1, page_size: 200, total: sessions.length, pages: sessions.length ? 1 : 0, has_next: false, has_previous: false } })
    return json(route, emptyCollections)
  })
}

test('schedule form keeps shared control sizing and vertical rhythm', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop style contract is sufficient')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=schedule')
  await page.getByRole('button', { name: /Individual|Индивиду|Індивіду/ }).click()

  const dialog = page.getByRole('dialog', { name: /New session|Новое занятие|Нове заняття/ })
  await expect(dialog).toBeVisible()
  const metrics = await dialog.evaluate((node) => {
    const grid = node.querySelector('.ops-form-grid')
    const label = grid.querySelector('label')
    const select = grid.querySelector('select')
    return {
      rowGap: Number.parseFloat(getComputedStyle(grid).rowGap),
      labelGap: Number.parseFloat(getComputedStyle(label).rowGap),
      selectHeight: select.getBoundingClientRect().height,
      selectRadius: Number.parseFloat(getComputedStyle(select).borderRadius),
    }
  })

  expect(metrics.rowGap).toBeGreaterThanOrEqual(10)
  expect(metrics.labelGap).toBeGreaterThanOrEqual(5)
  expect(metrics.selectHeight).toBeGreaterThanOrEqual(40)
  expect(metrics.selectRadius).toBeGreaterThanOrEqual(6)

  await dialog.getByRole('button', { name: /Open calendar|Открыть календарь|Відкрити календар|Otwórz kalendarz/ }).click()
  const calendarMetrics = await dialog.locator('.ops-picker-popover').evaluate((node) => {
    const arrows = [...node.querySelectorAll('.ops-picker-head button')]
    const grid = node.querySelector('.ops-date-grid')
    const today = node.querySelector('.ops-date-grid + .ops-picker-today')
    const todayStyle = getComputedStyle(today)
    return {
      arrowRadii: arrows.map((button) => Number.parseFloat(getComputedStyle(button).borderRadius)),
      arrowBackgrounds: arrows.map((button) => getComputedStyle(button).backgroundColor),
      todayRadius: Number.parseFloat(todayStyle.borderRadius),
      todayBackground: todayStyle.backgroundColor,
      todayGap: today.getBoundingClientRect().top - grid.getBoundingClientRect().bottom,
    }
  })
  expect(calendarMetrics.arrowRadii.every((radius) => radius >= 8)).toBe(true)
  expect(calendarMetrics.arrowBackgrounds.every((color) => color !== 'rgb(255, 255, 255)')).toBe(true)
  expect(calendarMetrics.todayRadius).toBeGreaterThanOrEqual(8)
  expect(calendarMetrics.todayBackground).not.toBe('rgb(255, 255, 255)')
  expect(calendarMetrics.todayGap).toBeGreaterThanOrEqual(8)
  await dialog.locator('.ops-date-grid + .ops-picker-today').click()

  await dialog.getByRole('button', { name: /Open time picker|Открыть выбор времени|Відкрити вибір часу|Otwórz wybór godziny/ }).click()
  const doneMetrics = await dialog.getByRole('button', { name: /Done|Готово|Gotowe/ }).evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      background: style.backgroundColor,
      color: style.color,
      fontWeight: Number.parseInt(style.fontWeight, 10),
      radius: Number.parseFloat(style.borderRadius),
    }
  })
  expect(doneMetrics.background).not.toBe('rgb(255, 255, 255)')
  expect(doneMetrics.color).toBe('rgb(255, 255, 255)')
  expect(doneMetrics.fontWeight).toBeGreaterThanOrEqual(600)
  expect(doneMetrics.radius).toBeGreaterThanOrEqual(6)
})

test('client search results stay opaque and below the input', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop style contract is sufficient')
  await mockAdmin(page, { clients: [
    { id: 1, client_id: 11, first_name: 'Anna', last_name: 'Client', full_name: 'Anna Client', birth_date: '2015-01-01', email: 'anna@example.test', client_phone: '+48111111111', client_is_active: true, is_active: true, group: null },
    { id: 2, client_id: 12, first_name: 'Boris', last_name: 'Client', full_name: 'Boris Client', birth_date: '2014-01-01', email: 'boris@example.test', client_phone: '+48222222222', client_is_active: true, is_active: true, group: null },
  ] })
  await page.goto('/?role=admin&view=schedule')
  await page.getByRole('button', { name: /Individual|Индивиду|Індивіду/ }).click()
  const dialog = page.getByRole('dialog', { name: /New session|Новое занятие|Нове заняття/ })
  const input = dialog.getByRole('combobox', { name: /Participant|Участник|Учасник/ })
  await input.focus()
  const list = dialog.getByRole('listbox')
  await expect(list).toBeVisible()

  const metrics = await list.evaluate((node) => {
    const input = node.closest('.ops-search-select').querySelector('input')
    const inputRect = input.getBoundingClientRect()
    const listRect = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return {
      background: style.backgroundColor,
      shadow: style.boxShadow,
      radius: Number.parseFloat(style.borderRadius),
      startsBelowInput: listRect.top >= inputRect.bottom,
    }
  })

  expect(metrics.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(metrics.shadow).not.toBe('none')
  expect(metrics.radius).toBeGreaterThanOrEqual(6)
  expect(metrics.startsBelowInput).toBe(true)
})

test('schedule navigation and training actions keep application styling', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop style contract is sufficient')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=schedule')
  await expect(page.getByRole('heading', { name: /Schedule|Расписание|Розклад/ })).toBeVisible()

  const metrics = await page.evaluate(() => {
    const activeNav = document.querySelector('.ops-nav-button.is-active')
    const action = document.querySelector('.ops-action-card')
    const style = (node) => getComputedStyle(node)
    return {
      navRadius: Number.parseFloat(style(activeNav).borderRadius),
      navBackground: style(activeNav).backgroundColor,
      actionRadius: Number.parseFloat(style(action).borderRadius),
      actionBackground: style(action).backgroundColor,
      actionBorder: Number.parseFloat(style(action).borderTopWidth),
    }
  })

  expect(metrics.navRadius).toBeGreaterThanOrEqual(7)
  expect(metrics.navBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(metrics.actionRadius).toBeGreaterThanOrEqual(10)
  expect(metrics.actionBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(metrics.actionBorder).toBeGreaterThanOrEqual(1)
})

test('sidebar shows language above the user and initials only when collapsed', async ({ page }) => {
  test.skip(![768, 1440].includes(page.viewportSize()?.width || 0), 'desktop sidebar boundaries')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=schedule')
  await expect(page.getByRole('heading', { name: /Schedule|Расписание|Розклад/ })).toBeVisible()

  const sidebar = page.locator('.ops-sidebar')
  const locale = sidebar.getByRole('combobox', { name: /Interface language|Язык интерфейса|Мова інтерфейсу/ })
  const name = sidebar.getByText('Audit Administrator', { exact: true })
  const avatar = sidebar.locator('.ops-avatar')
  const logout = sidebar.getByRole('button', { name: /Log out|Выйти|Вийти/ })
  await expect(locale).toBeVisible()
  await expect(logout).toBeVisible()

  if ((page.viewportSize()?.width || 0) === 1440) {
    await expect(name).toBeVisible()
    await expect(avatar).toBeHidden()
    const [localeBox, nameBox, logoutBox] = await Promise.all([locale.boundingBox(), name.boundingBox(), logout.boundingBox()])
    expect(localeBox.y + localeBox.height).toBeLessThanOrEqual(nameBox.y)
    expect(logoutBox.x).toBeGreaterThan(nameBox.x)
  } else {
    await expect(name).toBeHidden()
    await expect(avatar).toBeVisible()
    await expect(avatar).toHaveText('AA')
    const [sidebarBox, localeBox] = await Promise.all([sidebar.boundingBox(), locale.boundingBox()])
    expect(localeBox.x).toBeGreaterThanOrEqual(sidebarBox.x)
    expect(localeBox.x + localeBox.width).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width)
  }
})

test('trainer rows scroll inside the table on a medium-height screen', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'run once with an explicit medium viewport')
  await page.setViewportSize({ width: 1024, height: 720 })
  const trainers = Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    username: `trainer-${index + 1}`,
    full_name: `Trainer ${String(index + 1).padStart(2, '0')}`,
    email: `trainer-${index + 1}@example.test`,
    phone: `+4899000${String(index + 1).padStart(4, '0')}`,
    is_active: true,
    access_activated: true,
    portal_access: true,
    groups_count: index % 4,
  }))
  await mockAdmin(page, { trainers })
  await page.goto('/?role=admin&view=trainers')
  await expect(page.getByRole('heading', { name: /Trainers|Тренеры|Тренери/ })).toBeVisible()

  const scroller = page.locator('.ops-trainer-list-scroll > .table-wrap')
  await expect(scroller).toBeVisible()
  const metrics = await scroller.evaluate((node) => {
    const pageScrollBefore = window.scrollY
    node.scrollTop = 100
    return {
      overflowX: getComputedStyle(node).overflowX,
      overflowY: getComputedStyle(node).overflowY,
      hasHorizontalScroll: node.scrollWidth > node.clientWidth,
      hasOwnScroll: node.scrollHeight > node.clientHeight,
      scrollTop: node.scrollTop,
      pageScrollBefore,
      pageScrollAfter: window.scrollY,
    }
  })

  expect(metrics.overflowX).toBe('auto')
  expect(metrics.overflowY).toBe('auto')
  expect(metrics.hasHorizontalScroll).toBe(true)
  expect(metrics.hasOwnScroll).toBe(true)
  expect(metrics.scrollTop).toBeGreaterThan(0)
  expect(metrics.pageScrollAfter).toBe(metrics.pageScrollBefore)
})

test('shared controls never fall back to browser-native styling', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop style contract is sufficient')
  await mockAdmin(page, { clients: [
    { id: 1, client_id: 11, first_name: 'Anna', last_name: 'Client', full_name: 'Anna Client', birth_date: '2015-01-01', email: 'anna@example.test', client_phone: '+48111111111', client_is_active: true, is_active: true, group: { id: 1, name: 'Audit Group' } },
  ] })

  await page.goto('/?role=admin&view=clients')
  await expect(page.getByRole('heading', { name: /Clients|Клиенты|Клієнти/ })).toBeVisible()
  const clientMetrics = await page.evaluate(() => {
    const metrics = (node) => {
      const style = getComputedStyle(node)
      return {
        background: style.backgroundColor,
        borderStyle: style.borderStyle,
        borderTopStyle: style.borderTopStyle,
        radius: Number.parseFloat(style.borderRadius),
        rightRadius: Number.parseFloat(style.borderTopRightRadius),
      }
    }
    return {
      globalSearch: metrics(document.querySelector('.ops-global-search input')),
      listSearch: metrics(document.querySelector('.ops-search')),
      listSelect: metrics(document.querySelector('.ops-client-filter-selects select')),
      entityLink: metrics(document.querySelector('.ops-link-button')),
    }
  })

  for (const [name, control] of Object.entries({ globalSearch: clientMetrics.globalSearch, listSearch: clientMetrics.listSearch, listSelect: clientMetrics.listSelect })) {
    expect(control.borderStyle, `${name} border`).toBe('solid')
    expect(control.radius, `${name} radius`).toBeGreaterThanOrEqual(6)
  }
  expect(clientMetrics.entityLink.borderStyle).toBe('none')
  expect(clientMetrics.entityLink.background).toBe('rgba(0, 0, 0, 0)')

  await page.goto('/?role=admin&view=groups')
  await expect(page.getByRole('heading', { name: /Groups|Группы|Групи/ })).toBeVisible()
  const listFilterMetrics = await page.locator('.ops-list-filter-toggle').evaluate((node) => {
    const style = getComputedStyle(node)
    return { background: style.backgroundColor, borderStyle: style.borderStyle, radius: Number.parseFloat(style.borderRadius) }
  })
  expect(listFilterMetrics.borderStyle).toBe('solid')
  expect(listFilterMetrics.radius).toBeGreaterThanOrEqual(4)
  expect(listFilterMetrics.background).not.toBe('rgb(240, 240, 240)')

  await page.goto('/?role=admin&view=overview')
  await expect(page.getByRole('heading', { name: /Dashboard|Рабочий стол|Робочий стіл/ })).toBeVisible()
  const emptyMetrics = await page.locator('.ops-empty-action').evaluate((node) => {
    const style = getComputedStyle(node)
    return { background: style.backgroundColor, borderStyle: style.borderStyle }
  })
  expect(emptyMetrics.borderStyle).toBe('none')
  expect(emptyMetrics.background).not.toBe('rgb(240, 240, 240)')

  await page.goto('/?role=admin&view=schedule')
  await expect(page.getByRole('heading', { name: /Schedule|Расписание|Розклад/ })).toBeVisible()
  const scheduleMetrics = await page.evaluate(() => {
    const metrics = (node) => {
      const style = getComputedStyle(node)
      return {
        background: style.backgroundColor,
        borderStyle: style.borderStyle,
        borderTopStyle: style.borderTopStyle,
        radius: Number.parseFloat(style.borderRadius),
        rightRadius: Number.parseFloat(style.borderTopRightRadius),
      }
    }
    return {
      status: metrics(document.querySelector('.ops-status')),
      filter: metrics(document.querySelector('.ops-filter-trigger')),
      today: metrics(document.querySelector('.ops-calendar-today')),
      arrow: metrics(document.querySelector('.ops-calendar-period-arrow')),
      pickerButton: metrics(document.querySelector('.ops-picker-input button')),
    }
  })
  for (const control of [scheduleMetrics.filter, scheduleMetrics.today, scheduleMetrics.arrow]) {
    expect(control.borderStyle).toBe('solid')
    expect(control.radius).toBeGreaterThanOrEqual(6)
    expect(control.background).not.toBe('rgb(240, 240, 240)')
  }
  expect(scheduleMetrics.pickerButton.borderTopStyle).toBe('solid')
  expect(scheduleMetrics.pickerButton.rightRadius).toBeGreaterThanOrEqual(6)
  expect(scheduleMetrics.pickerButton.background).not.toBe('rgb(240, 240, 240)')
  expect(scheduleMetrics.status.radius).toBeGreaterThanOrEqual(6)
  expect(scheduleMetrics.status.background).not.toBe('rgba(0, 0, 0, 0)')
})
