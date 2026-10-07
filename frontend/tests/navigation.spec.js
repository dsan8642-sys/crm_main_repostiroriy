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
  await page.getByTestId('client-access-revoke').click()

  const dialog = page.getByTestId('confirmation-dialog')
  await expect(dialog).toBeVisible()
  expect(revokeRequests).toBe(0)
  await dialog.getByTestId('confirmation-cancel').click()
  expect(revokeRequests).toBe(0)

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

test('admin mobile shell exposes a sticky header and drawer without bottom navigation', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile shell contract')
  await mockPortal(page, adminRoutes)

  await page.goto('/?role=admin&view=overview')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await expect(page.locator('.ops-nav')).toBeHidden()
  await expect(page.getByTestId('open-menu')).toBeVisible()
  await expect(page.getByTestId('open-global-search')).toBeVisible()
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
  await expect(drawer.getByText('Katarzyna Admin', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('navigation')).toBeVisible()
  await expect(drawer.getByTestId('logout')).toBeVisible()
  await expect(drawer.locator('[data-testid="nav-admin-attendance"]')).toHaveCount(0)
  expect(await drawer.locator('[data-testid^="nav-admin-"]').evaluateAll((buttons) => buttons.map((button) => button.dataset.testid))).toEqual([
    'nav-admin-overview', 'nav-admin-clients', 'nav-admin-schedule', 'nav-admin-groups', 'nav-admin-trainers', 'nav-admin-payments', 'nav-admin-debtors', 'nav-admin-subscriptions', 'nav-admin-settings',
  ])
  await expect(drawer.evaluate((node) => node.contains(document.activeElement))).resolves.toBe(true)
  await expect(drawer.evaluate((node) => Math.round(node.getBoundingClientRect().width / window.innerWidth * 100))).resolves.toBe(88)
  await expect(drawer).toHaveCSS('overflow-y', 'hidden')
  await expect(drawer.locator('.ops-mobile-drawer-nav')).toHaveCSS('overflow-y', 'auto')
  await expect(drawer.locator('.ops-mobile-drawer-user-wrap')).not.toHaveCSS('position', 'sticky')

  await page.keyboard.press('Shift+Tab')
  await expect(drawer.getByTestId('logout')).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await page.getByTestId('open-global-search').click()
  const search = page.getByTestId('global-search-dialog')
  await expect(search).toBeVisible()
  await expect(search.getByTestId('global-search-input')).toBeFocused()
  await page.goBack()
  await expect(search).toHaveCount(0)

  await menuButton.click()
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
  await expect(shell).not.toHaveClass(/is-sidebar-collapsed/)
  await page.getByTestId('sidebar-toggle').click()
  await expect(shell).toHaveClass(/is-sidebar-collapsed/)
  await page.reload()
  await expect(shell).toHaveClass(/is-sidebar-collapsed/)
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
    await page.waitForTimeout(100)
    expect(logoutRequests).toBe(1)
  } finally {
    releaseLogout()
  }

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('textbox').first()).toBeVisible()
  expect(await page.evaluate(() => Object.keys(window.sessionStorage).filter((key) => key.startsWith('swimcrm.ui.')))).toEqual([])
})

test('trainer mobile shell keeps navigation in the drawer only', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile role navigation contract')
  await mockPortal(page, trainerRoutes)

  await page.goto('/')
  await expect(page.locator('.ops-mobile-bottom-nav')).toHaveCount(0)

  await page.getByTestId('open-menu').click()
  const drawer = page.getByTestId('mobile-menu-dialog')
  await expect(drawer.getByText('Анна Тренер', { exact: true })).toBeVisible()
  await expect(drawer.getByTestId('nav-trainer-session')).toBeVisible()
  expect(await drawer.locator('[data-testid^="nav-trainer-"]').evaluateAll((buttons) => buttons.map((button) => button.dataset.testid))).toEqual(['nav-trainer-sessions', 'nav-trainer-schedule', 'nav-trainer-session', 'nav-trainer-groups', 'nav-trainer-history'])
})

test('client mobile shell uses username fallback and drawer-only navigation', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile role navigation contract')
  await mockPortal(page, clientRoutes)

  await page.goto('/')
  await expect(page.locator('.ops-mobile-bottom-nav')).toHaveCount(0)

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
