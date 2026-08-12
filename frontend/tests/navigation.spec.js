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

test('admin mobile shell exposes a drawer and the approved fixed bottom navigation', async ({ page }) => {
  test.skip(![390, 768].includes(page.viewportSize()?.width || 0), 'mobile shell contract')
  await mockPortal(page, adminRoutes)

  await page.goto('/?role=admin&view=overview')
  await expect(page.getByRole('heading', { level: 1, name: 'Рабочий стол' })).toBeVisible()

  await expect(page.locator('.ops-nav')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toHaveCount(0)

  const bottom = page.getByRole('navigation', { name: 'Основная мобильная навигация' })
  await expect(bottom.getByRole('button')).toHaveText(['Главная', 'Клиенты', 'Расписание', 'Должники', 'Ещё'])
  await expect(bottom).toHaveCSS('position', 'fixed')

  const menuButton = page.getByRole('button', { name: 'Открыть меню' })
  await menuButton.click()
  const drawer = page.getByRole('dialog', { name: 'Меню' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Katarzyna Admin', { exact: true })).toBeVisible()
  await expect(drawer.getByText('Администратор', { exact: true })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: /Занятие|Посещаемость/ })).toHaveCount(0)
  await expect(drawer.evaluate((node) => node.contains(document.activeElement))).resolves.toBe(true)

  await page.keyboard.press('Shift+Tab')
  await expect(drawer.getByRole('button', { name: 'Выйти', exact: true })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await menuButton.click()
  await page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: /^Клиенты/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Клиенты' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Меню' })).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await bottom.getByRole('button', { name: 'Ещё', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки и контроль' })).toBeVisible()
  await expect(bottom.getByRole('button', { name: 'Ещё', exact: true })).toHaveAttribute('aria-current', 'page')

  await menuButton.click()
  await page.locator('.ops-mobile-drawer-layer').click({ position: { x: 4, y: 4 } })
  await expect(page.getByRole('dialog', { name: 'Меню' })).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await bottom.getByRole('button', { name: 'Клиенты', exact: true }).click()
  await menuButton.click()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Меню' })).toHaveCount(0)

  await page.setViewportSize({ width: 960, height: 900 })
  await expect(menuButton).toBeVisible()
  await menuButton.click()
  await expect(page.getByRole('dialog', { name: 'Меню' })).toBeVisible()
  await page.setViewportSize({ width: 961, height: 900 })
  await expect(page.getByRole('dialog', { name: 'Меню' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toHaveCount(0)
  await expect(page.locator('.ops-nav')).toBeVisible()
  await expect(bottom).toBeHidden()
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
})

test('trainer mobile shell keeps four direct destinations and trainer attendance', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile role navigation contract')
  await mockPortal(page, trainerRoutes)

  await page.goto('/')
  const bottom = page.getByRole('navigation', { name: 'Основная мобильная навигация' })
  await expect(bottom.getByRole('button')).toHaveText(['Мои занятия', 'Посещаемость', 'Группы', 'История'])

  await page.getByRole('button', { name: 'Открыть меню' }).click()
  const drawer = page.getByRole('dialog', { name: 'Меню' })
  await expect(drawer.getByText('Анна Тренер', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Посещаемость', exact: true })).toBeVisible()
})

test('client mobile shell uses username fallback and the approved five destinations', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile role navigation contract')
  await mockPortal(page, clientRoutes)

  await page.goto('/')
  const bottom = page.getByRole('navigation', { name: 'Основная мобильная навигация' })
  await expect(bottom.getByRole('button')).toHaveText(['Главная', 'Расписание', 'Платежи', 'История', 'Профиль'])

  await page.getByRole('button', { name: 'Открыть меню' }).click()
  const drawer = page.getByRole('dialog', { name: 'Меню' })
  await expect(drawer.getByText('parent-login', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Абонемент', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Согласия', exact: true })).toBeVisible()
})
