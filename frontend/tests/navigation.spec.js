import { expect, test } from '@playwright/test'

const EMPTY_PAGE = { pagination: { has_next: false } }

const adminRoutes = {
  '/api/me/': { id: 1, username: 'admin-login', role: 'admin', full_name: 'Katarzyna Admin' },
  '/api/admin/dashboard/': { metrics: { clients: 0, debtors: 0 } },
  '/api/admin/reference/': {
    trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [],
    choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
  },
  '/api/admin/clients/': { clients: [], ...EMPTY_PAGE },
  '/api/admin/trainers/': { trainers: [], ...EMPTY_PAGE },
  '/api/admin/groups/': { groups: [], ...EMPTY_PAGE },
  '/api/admin/subscription-types/': { subscription_types: [], ...EMPTY_PAGE },
  '/api/admin/settings/session-types/': { session_types: [], ...EMPTY_PAGE },
  '/api/admin/schedule/sessions/': { sessions: [], ...EMPTY_PAGE },
  '/api/admin/payments/': { payments: [], ...EMPTY_PAGE },
  '/api/admin/debtors/': { debtors: [] },
}

const trainerRoutes = {
  '/api/me/': { id: 2, username: 'trainer-login', role: 'trainer', full_name: 'Анна Тренер' },
  '/api/trainer/sessions/': { sessions: [] },
  '/api/trainer/groups/': { groups: [] },
  '/api/trainer/history/': { sessions: [] },
}

const clientRoutes = {
  '/api/me/': { id: 3, username: 'parent-login', role: 'parent', full_name: '' },
  '/api/client/overview/': { account: { id: 3 }, participants: [] },
  '/api/client/profile/': { account: { id: 3, preferred_language: 'ru' }, participants: [], subscriptions: [] },
  '/api/client/consents/': { consents: [] },
  '/api/client/schedule/': { sessions: [] },
  '/api/client/attendance/': { attendance: [] },
  '/api/client/payments/': { charges: [], payments: [] },
  '/api/client/notifications/': { notifications: [], ...EMPTY_PAGE },
}

async function mockPortal(page, routes) {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const payload = pathname === '/api/health/'
      ? { status: 'ok', service: 'swimcrm' }
      : routes[pathname]
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled navigation endpoint: ${pathname}` }),
    })
  })
}

async function switchTheme(page) {
  const mobile = page.viewportSize().width < 768
  if (mobile) await page.getByTestId('open-menu').click()
  else if (await page.locator('.app').evaluate((node) => node.classList.contains('is-sidebar-collapsed'))) {
    await page.getByTestId('sidebar-toggle').click()
  }
  await page.getByTestId('theme-toggle').click()
  if (mobile) await page.locator('.ops-mobile-drawer-close').click()
}

for (const [role, routes] of Object.entries({ admin: adminRoutes, trainer: trainerRoutes, client: clientRoutes })) {
  test(`navigation icons stay distinct and labeled for ${role}`, async ({ page }, testInfo) => {
    await mockPortal(page, routes)
    await page.goto(`/?role=${role}`)
    const mobile = page.viewportSize().width < 768
    if (mobile) await page.getByTestId('open-menu').click()
    else {
      await expect(page.locator('.ops-sidebar').getByTestId(`nav-${role}-${role === 'admin' ? 'overview' : role === 'trainer' ? 'sessions' : 'home'}`)).toBeVisible()
      if (await page.locator('.app').evaluate((node) => node.classList.contains('is-sidebar-collapsed'))) {
        await expect(page.locator('.ops-sidebar').getByTestId(`nav-${role}-${role === 'admin' ? 'overview' : role === 'trainer' ? 'sessions' : 'home'}`)).toHaveAttribute('title', /.+/)
        await page.getByTestId('sidebar-toggle').click()
        await expect(page.locator('.app')).not.toHaveClass(/is-sidebar-collapsed/)
      }
    }
    const menu = mobile ? page.locator('#ops-mobile-drawer') : page.locator('.ops-sidebar')
    const keys = role === 'admin'
      ? ['overview', 'clients', 'schedule', 'groups', 'trainers', 'payments', 'debtors', 'subscriptions', 'settings']
      : role === 'trainer' ? ['sessions', 'schedule', 'groups', 'history']
        : ['home', 'schedule', 'subscription', 'payments', 'history', 'profile', 'help']
    for (const key of keys) {
      const item = menu.getByTestId(`nav-${role}-${key}`)
      await expect(item).toBeVisible()
      await expect(item.locator('svg')).toHaveAttribute('width', '20')
      await expect(item.locator('span').nth(1)).toBeVisible()
    }
    const icon = (key) => menu.getByTestId(`nav-${role}-${key}`).locator('svg').innerHTML()
    if (role === 'trainer') expect(await icon('sessions')).not.toBe(await icon('schedule'))
    if (role === 'client') {
      expect(await icon('history')).not.toBe(await icon('help'))
      expect(await icon('subscription')).not.toBe(await icon('payments'))
    }
    for (const locale of ['ru', 'uk', 'pl', 'en']) {
      await menu.locator('select').selectOption(locale)
      for (const key of keys) await expect(menu.getByTestId(`nav-${role}-${key}`).locator('span').nth(1)).toBeVisible()
      expect(await menu.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    }
    await menu.locator('select').selectOption('ru')
    await expect(menu.locator('.ops-nav-button[aria-current="page"]')).toHaveCount(1)
    await page.screenshot({ path: testInfo.outputPath('icons-light.png'), fullPage: true, animations: 'disabled' })
    if (mobile) await page.locator('.ops-mobile-drawer-close').click()
    await switchTheme(page)
    if (mobile) await page.getByTestId('open-menu').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.screenshot({ path: testInfo.outputPath('icons-dark.png'), fullPage: true, animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test(`theme is available and persists for ${role}`, async ({ page }) => {
    await mockPortal(page, routes)
    const userLoaded = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/me/')
    await page.goto(`/?role=${role}`)
    await userLoaded
    const mobile = page.viewportSize().width < 768
    if (mobile) {
      await expect(page.locator('.ops-mobile-head-actions').getByTestId('theme-toggle')).toHaveCount(0)
      await page.getByTestId('open-menu').click()
      await expect(page.getByTestId('mobile-menu-dialog').getByTestId('theme-toggle')).toBeVisible()
    } else {
      await expect(page.locator('.ops-topbar').getByTestId('theme-toggle')).toHaveCount(0)
      if (await page.locator('.app').evaluate((node) => node.classList.contains('is-sidebar-collapsed'))) {
        await expect(page.locator('.ops-sidebar').getByTestId('theme-toggle')).toBeVisible()
        await page.getByTestId('sidebar-toggle').click()
      }
      await expect(page.locator('.ops-sidebar').getByTestId('theme-toggle')).toBeVisible()
    }
    const toggle = page.getByTestId('theme-toggle')
    const controls = mobile ? page.getByTestId('mobile-menu-dialog').locator('.ops-appearance-controls') : page.locator('.ops-sidebar .ops-appearance-controls')
    const language = controls.locator('select')
    await expect(toggle).toBeVisible()
    await expect(language.locator('option')).toHaveText(mobile
      ? ['Русский', 'Українська', 'Polski', 'English']
      : ['РУС', 'УКР', 'PL', 'EN'])
    const [languageBox, toggleBox] = await Promise.all([language.boundingBox(), toggle.boundingBox()])
    if (mobile) expect(languageBox.x + languageBox.width).toBeLessThanOrEqual(toggleBox.x + 1)
    else expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(languageBox.x + 1)
    expect(Math.abs(languageBox.y + languageBox.height / 2 - toggleBox.y - toggleBox.height / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(languageBox.height - toggleBox.height)).toBeLessThanOrEqual(1)
    await expect(toggle.locator('.ops-theme-label')).toHaveCount(0)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    if (mobile) await page.locator('.ops-mobile-drawer-close').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(14, 25, 40)')
    await page.reload()
    if (mobile) await page.getByTestId('open-menu').click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.click()
    if (mobile) await page.locator('.ops-mobile-drawer-close').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(234, 241, 248)')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (!mobile && role === 'admin' && page.viewportSize().width >= 1024) {
      if (!await page.locator('.app').evaluate((node) => node.classList.contains('is-sidebar-collapsed'))) {
        await page.getByTestId('sidebar-toggle').click()
      }
      await expect(toggle).toBeVisible()
      await expect(language).toBeVisible()
      await expect(language.locator('option')).toHaveText(['РУС', 'УКР', 'PL', 'EN'])
      await toggle.click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await toggle.click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    }
  })
}

test('overview theme and individual/split shortcuts retain live navigation', async ({ page }, testInfo) => {
  const now = new Date()
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const session = { id: 901, date: day, start_at: `${day}T23:00:00`, end_at: `${day}T23:45:00`, session_type: 'group', group: { id: 1, name: 'Дети · Начальная группа' }, trainer: 'Анна', trainer_id: 1, location: 'Основной бассейн', is_cancelled: false }
  await mockPortal(page, {
    ...adminRoutes,
    '/api/admin/schedule/sessions/': { sessions: [session, { ...session, id: 902, group: { id: 2, name: 'Взрослые · Masters' } }] },
    '/api/admin/payments/': { payments: [], pagination: { total: 3 } },
    '/api/admin/debtors/': { debtors: [], pagination: { total: 4 }, summary: { balance_minor: 64000 } },
  })
  await page.goto('/?role=admin&view=overview')
  await expect(page.getByTestId('overview-add-split')).toBeVisible()
  await expect(page.locator('.ops-overview .ops-quick-actions__grid button')).toHaveCount(4)
  await expect(page.locator('.ops-overview .ops-quick-actions__grid button', { hasText: 'Расписание' })).toHaveCount(0)
  await expect(page.getByTestId('overview-add-payment').locator('svg')).toHaveAttribute('width', '22')
  await expect(page.getByTestId('overview-add-split').locator('svg')).toHaveAttribute('width', '22')
  await expect(page.locator('.ops-overview .ops-today-status-list button')).toHaveCount(2)
  const individualIcon = await page.getByTestId('overview-add-individual').locator('svg').innerHTML()
  expect(await page.getByTestId('overview-add-split').locator('svg').innerHTML()).not.toBe(individualIcon)
  await page.screenshot({ path: testInfo.outputPath('overview-light.png'), fullPage: true, animations: 'disabled' })
  const boxes = await page.locator('.ops-overview .ops-today-status-list button').evaluateAll((nodes) => nodes.map((node) => ({ x: node.offsetLeft, y: node.offsetTop })))
  if (page.viewportSize().width >= 768) expect(boxes[0].y).toBe(boxes[1].y)
  else expect(boxes[1].y).toBeGreaterThan(boxes[0].y)
  await switchTheme(page)
  await expect(page.locator('.ops-overview .ops-today-session')).toHaveCSS('background-color', 'rgb(28, 70, 103)')
  await expect(page.getByTestId('overview-add-individual')).toHaveCSS('color', 'rgb(247, 251, 255)')
  await expect(page.getByTestId('overview-add-individual').locator('span').first()).toHaveCSS('color', 'rgb(102, 196, 255)')
  await page.screenshot({ path: testInfo.outputPath('overview-dark.png'), fullPage: true, animations: 'disabled' })
  for (const type of ['individual', 'split']) {
    await page.getByTestId(`overview-add-${type}`).click()
    await expect(page).toHaveURL(new RegExp(`createSession=${type}`))
    await expect(page.getByTestId('form-modal')).toBeVisible()
    await expect(page.locator('#admin-session-sessionType')).toHaveValue(type)
    await expect(page.getByTestId('form-modal')).toHaveCSS('background-color', 'rgb(33, 52, 73)')
    await page.goto('/?role=admin&view=overview')
    await expect(page.getByTestId('overview-add-split')).toBeVisible()
  }
  await page.goto('/?role=admin&view=schedule')
  const event = page.locator('.ops-schedule-event').first()
  await expect(event).toBeAttached()
  await expect(event).toHaveCSS('color', 'rgb(228, 238, 251)')
  await switchTheme(page)
  await expect(event).not.toHaveCSS('color', 'rgb(228, 238, 251)')
  await page.goto('/?role=admin&view=overview')
  await page.locator('.ops-overview .ops-today-status-list button').first().click()
  await expect(page).toHaveURL(/view=attendance.*session=901/)
})

test('client portal access is revoked only after confirmation', async ({ page }) => {
  let revokeRequests = 0
  await mockPortal(page, {
    ...adminRoutes,
    '/api/admin/clients/2/': {
      account: { id: 2, username: 'client-02', full_name: 'Test Client', is_active: true, portal_access: 'active', access_activated: true },
      participants: [], subscriptions: [], charges: [], payments: [], attendance: [], consents: [],
      summary: { participants_count: 0, active_participants: 0, balance_minor: 0, active_subscriptions: 0, pending_payments: 0 },
    },
  })
  await page.route('**/api/admin/clients/2/access/revoke/', async (route) => {
    revokeRequests += 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, portal_access: 'revoked' }) })
  })

  await page.goto('/?role=admin&view=clientDetail&client=2')
  await page.getByTestId('admin-client-actions-trigger').click()
  await page.getByTestId('client-access-revoke').click()

  const dialog = page.getByTestId('confirmation-dialog')
  await expect(dialog).toBeVisible()
  expect(revokeRequests).toBe(0)
  await dialog.getByTestId('confirmation-cancel').click()
  expect(revokeRequests).toBe(0)

  await page.getByTestId('admin-client-actions-trigger').click()
  await page.getByTestId('client-access-revoke').click()
  await page.getByTestId('confirmation-dialog').getByTestId('confirmation-confirm').click()
  await expect.poll(() => revokeRequests).toBe(1)
})

test('admin overview payment shortcut opens the add-payment form', async ({ page }) => {
  await mockPortal(page, adminRoutes)

  await page.goto('/?role=admin&view=overview')
  await page.getByTestId('overview-add-payment').click()

  await expect(page).toHaveURL(/view=payments.*financeAction=payment/)
  await expect(page.getByTestId('form-modal')).toBeVisible()
})

test('desktop sidebar items stay still at the end of a long page', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'desktop sidebar')
  await mockPortal(page, adminRoutes)
  await page.setViewportSize({ width: 1894, height: 859 })
  await page.goto('/?role=admin&view=clients')
  await expect(page.locator('#main-content')).toBeVisible()
  await page.evaluate(() => {
    const spacer = document.createElement('div')
    spacer.style.height = '3000px'
    document.querySelector('#main-content').append(spacer)
  })
  const positions = []
  for (const offset of [0, 100, 2000, 3000, 3500, 4000]) {
    positions.push(await page.evaluate((y) => {
      window.scrollTo(0, y)
      return new Promise((resolve) => requestAnimationFrame(() => resolve({ rects: ['schedule', 'groups', 'payments', 'settings'].map((key) => {
        const button = document.querySelector(`[data-testid="nav-admin-${key}"]`)
        return [button.getBoundingClientRect().top, button.firstElementChild.getBoundingClientRect().top]
      }) })))
    }, offset))
  }
  expect(positions.every((item) => item.rects.every((pair, index) => pair.every((value, part) => value === positions[0].rects[index][part] && Number.isInteger(value))))).toBe(true)
})

test('admin mobile shell exposes a sticky header and drawer without bottom navigation', async ({ page }, testInfo) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile shell contract')
  await mockPortal(page, adminRoutes)

  await page.goto('/?role=admin&view=overview')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.ops-overview-kpi-grid .kpi-value').last()).not.toHaveAttribute('style', /color/)

  await expect(page.locator('.ops-nav')).toBeHidden()
  await expect(page.getByTestId('open-menu')).toBeVisible()
  await expect(page.getByTestId('open-global-search')).toBeVisible()
  const menuLines = page.getByTestId('open-menu').locator('svg rect')
  const originalViewport = page.viewportSize()
  await page.setViewportSize({ width: 458, height: 668 })
  await expect(menuLines).toHaveCount(3)
  expect(await menuLines.evaluateAll((lines) => lines.map((line) => [line.getBoundingClientRect().width, line.getBoundingClientRect().height, line.getAttribute('rx')]))).toEqual([[26, 3, '1.5'], [26, 3, '1.5'], [26, 3, '1.5']])
  await page.getByTestId('open-menu').screenshot({ path: testInfo.outputPath('menu-button-458.png') })
  await page.getByTestId('open-global-search').screenshot({ path: testInfo.outputPath('search-button-458.png') })
  await page.setViewportSize(originalViewport)
  const searchButton = page.getByTestId('open-global-search')
  await expect(searchButton.locator('.ops-mobile-search-icon svg')).toHaveAttribute('width', '30')
  await expect(searchButton.locator('.ops-mobile-search-icon')).toHaveCSS('transition-duration', /0\.18s/)
  await expect(searchButton.locator('.ops-mobile-search-icon')).toHaveCSS('opacity', '1')
  await expect(searchButton.locator('.ops-mobile-search-close')).toHaveCSS('opacity', '0')
  await expect(page.locator('.ops-sidebar-head').getByTestId('logout')).toHaveCount(0)
  await expect(page.locator('.ops-topbar')).toHaveCount(0)

  await expect(page.locator('.ops-mobile-bottom-nav')).toHaveCount(0)

  const mobileHeader = page.locator('.ops-sidebar')
  await expect(mobileHeader).toHaveCSS('position', 'sticky')
  await page.evaluate(() => {
    const spacer = document.createElement('div')
    spacer.dataset.testid = 'mobile-scroll-spacer'
    spacer.style.height = '1600px'
    document.querySelector('#main-content')?.append(spacer)
    window.scrollTo(0, 700)
  })
  await expect.poll(() => mobileHeader.evaluate((node) => Math.round(node.getBoundingClientRect().top))).toBe(0)

  const menuButton = page.getByTestId('open-menu')
  await menuButton.click()
  const drawer = page.getByTestId('mobile-menu-dialog')
  await expect(drawer).toBeVisible()
  await expect(drawer).toHaveCSS('animation-name', 'ops-mobile-drawer-in')
  await expect(page.locator('.ops-mobile-drawer-layer')).toHaveCSS('animation-name', 'ops-mobile-backdrop-in')
  await expect(drawer.locator('.ops-mobile-drawer-close svg')).toHaveAttribute('width', '28')
  await drawer.locator('.ops-mobile-drawer-close').screenshot({ path: testInfo.outputPath('drawer-close.png') })
  await expect(drawer.getByText('Katarzyna Admin', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('navigation')).toBeVisible()
  await expect(drawer.getByTestId('logout')).toBeVisible()
  await expect(drawer.locator('[data-testid="nav-admin-attendance"]')).toHaveCount(0)
  expect(await drawer.locator('[data-testid^="nav-admin-"]').evaluateAll((buttons) => buttons.map((button) => button.dataset.testid))).toEqual([
    'nav-admin-overview', 'nav-admin-clients', 'nav-admin-schedule', 'nav-admin-groups', 'nav-admin-trainers', 'nav-admin-payments', 'nav-admin-debtors', 'nav-admin-subscriptions', 'nav-admin-settings',
  ])
  await expect(drawer.locator('.ops-nav-count')).toHaveCount(0)
  await expect(drawer.evaluate((node) => node.contains(document.activeElement))).resolves.toBe(true)
  await expect(drawer.evaluate((node) => Math.round(node.getBoundingClientRect().width / window.innerWidth * 100))).resolves.toBe(88)
  await expect(drawer).toHaveCSS('overflow-y', 'hidden')
  await expect(drawer.locator('.ops-mobile-drawer-nav')).toHaveCSS('overflow-y', 'auto')
  await expect(drawer.locator('.ops-mobile-drawer-user-wrap')).not.toHaveCSS('position', 'sticky')

  await page.keyboard.press('Shift+Tab')
  await expect(drawer.getByTestId('logout')).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.locator('.ops-mobile-drawer-layer')).toHaveClass(/is-closing/)
  await expect(drawer).toHaveCSS('animation-name', 'ops-mobile-drawer-out')
  await expect(drawer).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await menuButton.click()
  await drawer.locator('.ops-mobile-drawer-close').click()
  await expect(page.locator('.ops-mobile-drawer-layer')).toHaveClass(/is-closing/)
  await expect(drawer).toHaveCount(0)

  await searchButton.click()
  const search = page.getByTestId('global-search-dialog')
  await expect(search).toBeVisible()
  await expect(searchButton.locator('.ops-mobile-search-icon')).toHaveCSS('opacity', '0')
  await expect(searchButton.locator('.ops-mobile-search-close')).toHaveCSS('opacity', '1')
  await expect(search.getByTestId('global-search-input')).toBeFocused()
  await page.goBack()
  await expect(search).toHaveCount(0)
  await expect(searchButton.locator('.ops-mobile-search-icon')).toHaveCSS('opacity', '1')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(searchButton.locator('.ops-mobile-search-icon')).toHaveCSS('transition-duration', '0s')

  await menuButton.click()
  await expect(page.getByTestId('mobile-menu-dialog')).toHaveCSS('animation-name', 'none')
  await page.getByTestId('mobile-menu-dialog').getByTestId('nav-admin-clients').click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByTestId('mobile-menu-dialog')).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await menuButton.click()
  await page.getByTestId('mobile-menu-dialog').getByTestId('nav-admin-settings').click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await menuButton.click()
  await page.locator('.ops-mobile-drawer-layer').click({ position: { x: 4, y: 4 } })
  await expect(page.getByTestId('mobile-menu-dialog')).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await menuButton.click()
  await page.getByTestId('mobile-menu-dialog').getByTestId('nav-admin-clients').click()
  await menuButton.click()
  await page.goBack()
  await expect(page.getByTestId('mobile-menu-dialog')).toHaveCount(0)
})

test('shell switches exactly at 767/768 and applies the desktop initial sidebar states', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'one boundary contract run is sufficient')
  await mockPortal(page, adminRoutes)

  for (const [width, mobile, collapsed] of [
    [767, true, false],
    [768, false, true],
    [959, false, true],
    [960, false, false],
  ]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/?role=admin&view=overview')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('open-menu')).toHaveCount(mobile ? 1 : 0)
    if (mobile) await expect(page.locator('.ops-nav')).toBeHidden()
    else await expect(page.locator('.ops-nav')).toBeVisible()
    if (collapsed) await expect(page.locator('.app')).toHaveClass(/is-sidebar-collapsed/)
    else await expect(page.locator('.app')).not.toHaveClass(/is-sidebar-collapsed/)
    if (!mobile) await expect(page.locator('.ops-sidebar')).toHaveCSS('width', collapsed ? '76px' : '250px')
  }
})

test('desktop sidebar preference is session-scoped and survives navigation', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop persistence run is sufficient')
  await mockPortal(page, adminRoutes)
  await page.goto('/?role=admin&view=overview')

  const shell = page.locator('.app')
  const sidebar = page.locator('.ops-sidebar')
  await expect(shell).not.toHaveClass(/is-sidebar-collapsed/)
  await page.getByTestId('sidebar-toggle').click()
  await expect(shell).toHaveClass(/is-sidebar-collapsed/)
  await page.waitForTimeout(80)
  expect(await sidebar.evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThan(76)
  await expect(sidebar).toHaveCSS('width', '76px')
  await page.reload()
  await expect(shell).toHaveClass(/is-sidebar-collapsed/)
  await page.getByTestId('sidebar-toggle').click()
  await expect(shell).not.toHaveClass(/is-sidebar-collapsed/)
  await page.waitForTimeout(80)
  expect(await sidebar.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThan(250)
  await expect(sidebar).toHaveCSS('width', '250px')
  await page.getByTestId('sidebar-toggle').click()
  await expect(sidebar).toHaveCSS('width', '76px')
  await page.locator('.ops-sidebar').getByTestId('nav-admin-clients').click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(shell).toHaveClass(/is-sidebar-collapsed/)
})

test('admin desktop sidebar uses authenticated identity and keeps attendance available only by route', async ({ page }) => {
  test.skip(![1440, 1920].includes(page.viewportSize()?.width || 0), 'desktop shell contract')
  await mockPortal(page, adminRoutes)

  await page.goto('/?role=admin&view=attendance')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const sidebar = page.locator('.ops-sidebar')
  await expect(sidebar.getByText('Katarzyna Admin', { exact: true })).toBeVisible()
  await expect(sidebar.getByRole('navigation')).toBeVisible()
  await expect(sidebar.locator('[data-testid="nav-admin-attendance"]')).toHaveCount(0)
  await expect(sidebar.locator('[data-testid="nav-admin-schedule"]')).toHaveAttribute('aria-current', 'page')
  await expect(sidebar.getByTestId('logout')).toBeVisible()
  await expect(page.getByTestId('open-menu')).toHaveCount(0)
})

test('mobile logout is single-flight under repeated activation', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'one mobile single-flight contract check is sufficient')
  let logoutRequests = 0
  let releaseLogout
  const logoutGate = new Promise((resolve) => { releaseLogout = resolve })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/auth/logout/' && request.method() === 'POST') {
      logoutRequests += 1
      await logoutGate
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }
    const payload = path === '/api/health/'
      ? { status: 'ok', service: 'swimcrm' }
      : path === '/api/csrf/'
        ? { ok: true }
        : adminRoutes[path]
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled logout endpoint: ${request.method()} ${path}` }),
    })
  })

  await page.goto('/?role=admin&view=overview')
  await page.evaluate(() => window.sessionStorage.setItem('swimcrm.ui.sidebar.admin.1.collapsed', 'true'))
  await page.getByTestId('open-menu').click()
  const logout = page.getByTestId('mobile-menu-dialog').getByTestId('logout')

  try {
    await logout.evaluate((button) => {
      button.click()
      button.click()
    })
    const confirmation = page.getByTestId('navigation-discard-dialog')
    await expect(confirmation).toBeVisible()
    expect(logoutRequests).toBe(0)
    await confirmation.getByTestId('navigation-discard-confirm').click()
    await page.waitForTimeout(100)
    expect(logoutRequests).toBe(1)
  } finally {
    releaseLogout()
  }

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('textbox').first()).toBeVisible()
  expect(await page.evaluate(() => Object.keys(window.sessionStorage).filter((key) => key.startsWith('swimcrm.ui.')))).toEqual([])
})

test('desktop logout waits for confirmation', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop confirmation check is sufficient')
  let logoutRequests = 0
  await mockPortal(page, { ...adminRoutes, '/api/csrf/': { ok: true }, '/api/auth/logout/': { ok: true } })
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/logout/' && request.method() === 'POST') logoutRequests += 1
  })

  await page.goto('/?role=admin&view=overview')
  await page.getByTestId('logout').click()
  const confirmation = page.getByTestId('navigation-discard-dialog')
  await expect(confirmation).toBeVisible()
  expect(logoutRequests).toBe(0)
  await confirmation.getByTestId('navigation-discard-stay').click()
  await expect(confirmation).toHaveCount(0)
  expect(logoutRequests).toBe(0)

  await page.getByTestId('logout').click()
  await confirmation.getByTestId('navigation-discard-confirm').click()
  await expect.poll(() => logoutRequests).toBe(1)
})

test('trainer mobile shell keeps navigation in the drawer only', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile role navigation contract')
  await mockPortal(page, trainerRoutes)

  await page.goto('/')
  await expect(page.locator('.ops-mobile-bottom-nav')).toHaveCount(0)

  await page.getByTestId('open-menu').click()
  const drawer = page.getByTestId('mobile-menu-dialog')
  await expect(drawer.getByText('Анна Тренер', { exact: true })).toBeVisible()
  await expect(drawer.getByTestId('nav-trainer-session')).toHaveCount(0)
  expect(await drawer.locator('[data-testid^="nav-trainer-"]').evaluateAll((buttons) => buttons.map((button) => button.dataset.testid))).toEqual(['nav-trainer-sessions', 'nav-trainer-schedule', 'nav-trainer-groups', 'nav-trainer-history'])
})

test('client mobile shell uses username fallback and drawer-only navigation', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile role navigation contract')
  await mockPortal(page, clientRoutes)

  await page.goto('/')
  await expect(page.locator('.ops-mobile-bottom-nav')).toHaveCount(0)
  await expect(page.locator('.ops-today-session__action button')).toBeVisible()
  await expect(page.locator('.ops-today-session__body p')).toHaveText('Перегляньте розклад і виберіть заняття.')
  await expect(page.locator('.ops-action-card').first()).not.toContainText('∞')

  await page.getByTestId('open-menu').click()
  const drawer = page.getByTestId('mobile-menu-dialog')
  await expect(drawer.getByText('parent-login', { exact: true })).toBeVisible()
  await expect(drawer.getByTestId('nav-client-subscription')).toBeVisible()
  await expect(drawer.getByTestId('nav-client-consents')).toHaveCount(0)
  expect(await drawer.locator('[data-testid^="nav-client-"]').evaluateAll((buttons) => buttons.map((button) => button.dataset.testid))).toEqual(['nav-client-home', 'nav-client-schedule', 'nav-client-subscription', 'nav-client-payments', 'nav-client-history', 'nav-client-profile', 'nav-client-help'])
  await drawer.getByTestId('nav-client-profile').click()
  await expect(page.getByTestId('client-profile-consents')).toBeVisible()
})

test('client profile dirty guard covers links, browser Back and beforeunload', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'one mobile dirty-guard workflow is sufficient')
  await mockPortal(page, {
    ...clientRoutes,
    '/api/client/profile/': {
      account: { id: 3, first_name: 'Maria', last_name: 'Nowak', email: 'maria@example.test', preferred_language: 'ru' },
      participants: [], subscriptions: [],
    },
  })

  await page.goto('/?role=client&view=home')
  await page.getByTestId('open-menu').click()
  await page.getByTestId('mobile-menu-dialog').getByTestId('nav-client-profile').click()
  await expect(page.locator('#client-profile-first-name')).toHaveCount(0)
  await page.getByTestId('client-profile-edit').click()
  const firstName = page.locator('#client-profile-first-name')
  await firstName.fill('Marina')

  await page.getByTestId('open-menu').click()
  await page.getByTestId('mobile-menu-dialog').getByTestId('logout').click()
  const logoutConfirmation = page.getByTestId('navigation-discard-dialog')
  await expect(logoutConfirmation).toContainText(/Несохранённые изменения будут потеряны|Незбережені зміни буде втрачено/)
  await logoutConfirmation.getByTestId('navigation-discard-stay').click()
  await expect(firstName).toHaveValue('Marina')

  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(true)

  await page.getByTestId('client-profile-consents').click()
  const guard = page.getByTestId('navigation-discard-dialog')
  await expect(guard).toBeVisible()
  await expect(guard.getByTestId('navigation-discard-stay')).toBeFocused()
  await guard.getByTestId('navigation-discard-stay').click()
  await expect(guard).toHaveCount(0)
  await expect(firstName).toHaveValue('Marina')

  await page.evaluate(() => window.history.back())
  await expect(guard).toBeVisible()
  await guard.getByTestId('navigation-discard-stay').click()
  await expect(firstName).toHaveValue('Marina')

  await page.getByTestId('client-profile-consents').click()
  await guard.getByTestId('navigation-discard-confirm').click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(false)
})

test('authenticated role canonicalizes a stale foreign-role URL and clears entity context', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one auth transition contract run is sufficient')
  await mockPortal(page, clientRoutes)

  await page.goto('/?role=admin&view=clientDetail&client=999&session=444')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\?role=client&view=home$/)
})
