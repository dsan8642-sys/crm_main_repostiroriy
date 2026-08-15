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

test('admin mobile shell exposes a sticky header and drawer without bottom navigation', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile shell contract')
  await mockPortal(page, adminRoutes)

  await page.goto('/?role=admin&view=overview')
  await expect(page.getByRole('heading', { level: 1, name: 'Рабочий стол' })).toBeVisible()

  await expect(page.locator('.ops-nav')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Открыть глобальный поиск' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toHaveCount(0)
  await expect(page.locator('.ops-topbar')).toHaveCount(0)

  await expect(page.getByRole('navigation', { name: 'Основная мобильная навигация' })).toHaveCount(0)

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

  const menuButton = page.getByRole('button', { name: 'Открыть меню' })
  await menuButton.click()
  const drawer = page.getByRole('dialog', { name: 'Меню' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Katarzyna Admin', { exact: true })).toBeVisible()
  await expect(drawer.getByText('Администратор', { exact: true })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: /Занятие|Посещаемость/ })).toHaveCount(0)
  expect(await drawer.locator('.ops-nav-button').evaluateAll((buttons) => buttons.map((button) => button.title))).toEqual([
    'Главная', 'Клиенты', 'Тренеры', 'Группы', 'Расписание', 'Платежи', 'Должники', 'Настройки',
  ])
  await expect(drawer.evaluate((node) => node.contains(document.activeElement))).resolves.toBe(true)
  await expect(drawer.evaluate((node) => Math.round(node.getBoundingClientRect().width / window.innerWidth * 100))).resolves.toBe(88)
  await expect(drawer).toHaveCSS('overflow-y', 'auto')
  await expect(drawer.locator('.ops-mobile-drawer-nav')).toHaveCSS('overflow-y', 'visible')
  await expect(drawer.locator('.ops-mobile-drawer-user-wrap')).not.toHaveCSS('position', 'sticky')

  await page.keyboard.press('Shift+Tab')
  await expect(drawer.getByRole('button', { name: 'Выйти', exact: true })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await page.getByRole('button', { name: 'Открыть глобальный поиск' }).click()
  const search = page.getByRole('dialog', { name: 'Поиск клиентов и групп' })
  await expect(search).toBeVisible()
  await expect(search.getByPlaceholder('Найти клиента или группу')).toBeFocused()
  await expect(search.getByPlaceholder(/занятие/i)).toHaveCount(0)
  await page.goBack()
  await expect(search).toHaveCount(0)

  await menuButton.click()
  await page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: /^Клиенты/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Клиенты' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Меню' })).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await menuButton.click()
  await page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: /^Настройки/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки и контроль' })).toBeVisible()

  await menuButton.click()
  await page.locator('.ops-mobile-drawer-layer').click({ position: { x: 4, y: 4 } })
  await expect(page.getByRole('dialog', { name: 'Меню' })).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await menuButton.click()
  await page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: /^Клиенты/ }).click()
  await menuButton.click()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Меню' })).toHaveCount(0)
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
    await expect(page.getByRole('heading', { level: 1, name: 'Рабочий стол' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Открыть меню' })).toHaveCount(mobile ? 1 : 0)
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
  await page.getByRole('button', { name: 'Свернуть меню' }).click()
  await expect(shell).toHaveClass(/is-sidebar-collapsed/)
  await page.reload()
  await expect(shell).toHaveClass(/is-sidebar-collapsed/)
  await page.locator('.ops-nav-button[title="Клиенты"]').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Клиенты' })).toBeVisible()
  await expect(shell).toHaveClass(/is-sidebar-collapsed/)
})

test('admin desktop sidebar uses authenticated identity and keeps attendance available only by route', async ({ page }) => {
  test.skip(![1440, 1920].includes(page.viewportSize()?.width || 0), 'desktop shell contract')
  await mockPortal(page, adminRoutes)

  await page.goto('/?role=admin&view=attendance')
  await expect(page.getByRole('heading', { level: 1, name: 'Занятие' })).toBeVisible()

  const sidebar = page.locator('.ops-sidebar')
  await expect(sidebar.getByText('Katarzyna Admin', { exact: true })).toBeVisible()
  await expect(sidebar.getByText('Администратор', { exact: true })).toHaveCount(0)
  await expect(sidebar.locator('.ops-nav-button[title="Занятие"]')).toHaveCount(0)
  await expect(sidebar.locator('.ops-nav-button[title="Расписание"]')).toHaveAttribute('aria-current', 'page')
  await expect(sidebar.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toHaveCount(0)
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
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  const logout = page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: 'Выйти', exact: true })

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

  await expect(page.getByRole('heading', { name: 'SwimCRM' })).toBeVisible()
  await expect(page.getByText('Вход в систему', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => Object.keys(window.sessionStorage).filter((key) => key.startsWith('swimcrm.ui.')))).toEqual([])
})

test('trainer mobile shell keeps navigation in the drawer only', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile role navigation contract')
  await mockPortal(page, trainerRoutes)

  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Основная мобильная навигация' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Открыть меню' }).click()
  const drawer = page.getByRole('dialog', { name: 'Меню' })
  await expect(drawer.getByText('Анна Тренер', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Посещаемость', exact: true })).toBeVisible()
  expect(await drawer.locator('.ops-nav-button').evaluateAll((buttons) => buttons.map((button) => button.title))).toEqual([
    'Мои занятия', 'Мои группы', 'Посещаемость', 'История',
  ])
})

test('client mobile shell uses username fallback and drawer-only navigation', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile role navigation contract')
  await mockPortal(page, clientRoutes)

  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Основная мобильная навигация' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Открыть меню' }).click()
  const drawer = page.getByRole('dialog', { name: 'Меню' })
  await expect(drawer.getByText('parent-login', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Абонемент', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Согласия', exact: true })).toHaveCount(0)
  expect(await drawer.locator('.ops-nav-button').evaluateAll((buttons) => buttons.map((button) => button.title))).toEqual([
    'Главная', 'Расписание', 'Абонемент', 'Платежи', 'История', 'Профиль',
  ])
  await drawer.getByRole('button', { name: 'Профиль', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Согласия', exact: true })).toBeVisible()
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
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  await page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: 'Профиль', exact: true }).click()
  const firstName = page.getByLabel('Имя')
  await firstName.fill('Marina')

  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(true)

  await page.getByRole('button', { name: 'Согласия', exact: true }).click()
  const guard = page.getByRole('alertdialog', { name: 'Есть несохранённые изменения' })
  await expect(guard).toBeVisible()
  await expect(guard.getByRole('button', { name: 'Остаться', exact: true })).toBeFocused()
  await guard.getByRole('button', { name: 'Остаться', exact: true }).click()
  await expect(guard).toHaveCount(0)
  await expect(firstName).toHaveValue('Marina')

  await page.evaluate(() => window.history.back())
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: 'Остаться', exact: true }).click()
  await expect(firstName).toHaveValue('Marina')

  await page.getByRole('button', { name: 'Согласия', exact: true }).click()
  await guard.getByRole('button', { name: 'Уйти без сохранения', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Согласия' })).toBeVisible()
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
  await expect(page.getByRole('heading', { level: 1, name: 'Главная' })).toBeVisible()
  await expect(page).toHaveURL(/\?role=client&view=home$/)
})
