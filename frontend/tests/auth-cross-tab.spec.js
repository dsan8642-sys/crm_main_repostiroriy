import { expect, test } from '@playwright/test'

const EMPTY_PAGE = { pagination: { total: 0, has_next: false } }

function json(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  })
}

function adminPayload(path) {
  if (path === '/api/admin/dashboard/') return { metrics: {} }
  if (path === '/api/admin/reference/') return {
    trainers: [], groups: [], subscription_types: [], locations: [], session_types: [],
    participants: [{ id: 11, client_id: 7, first_name: 'Private', last_name: 'Student', full_name: 'Private Student', is_active: true, client_is_active: true, groups: [] }],
    choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
  }
  if (path === '/api/admin/settings/session-types/') return { session_types: [], ...EMPTY_PAGE }
  if (path === '/api/admin/clients/') return { clients: [], ...EMPTY_PAGE }
  if (path === '/api/admin/payments/') return { payments: [], ...EMPTY_PAGE }
  if (path === '/api/admin/debtors/') return { debtors: [], ...EMPTY_PAGE }
  return null
}

function trainerPayload(path) {
  if (path === '/api/trainer/sessions/') return { sessions: [] }
  if (path === '/api/trainer/groups/') return { groups: [] }
  return null
}

async function installAuthRoutes(context, state) {
  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/csrf/') return json(route, { csrf_token: 'test-csrf' })
    if (path === '/api/auth/login/' && request.method() === 'POST') {
      state.authenticated = true
      state.role = 'admin'
      return json(route, { user: { id: 1, username: 'admin', role: 'admin', full_name: 'Private Admin' } })
    }
    if (path === '/api/auth/logout/' && request.method() === 'POST') {
      state.authenticated = false
      state.role = null
      return json(route, { ok: true })
    }
    if (path === '/api/me/') {
      state.meRequests += 1
      if (!state.authenticated) return json(route, { error: 'Требуется вход' }, 403)
      return json(route, state.role === 'trainer'
        ? { id: 2, username: 'trainer', role: 'trainer', full_name: 'Trainer User' }
        : { id: 1, username: 'admin', role: 'admin', full_name: 'Private Admin' })
    }
    if (path === '/api/admin/reference/' && state.holdReferenceForPage === request.frame().page()) {
      state.holdReferenceForPage = null
      state.referenceStarted?.()
      await state.referenceGate
    }

    const payload = state.role === 'trainer' ? trainerPayload(path) : adminPayload(path)
    return json(route, payload || { error: `Unhandled ${request.method()} ${path}` }, payload ? 200 : 404)
  })
}

test('the tab that logs in ignores its own auth broadcast and loads once', async ({ page, context }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'single desktop login contract')
  const state = { authenticated: false, role: null, meRequests: 0 }
  await installAuthRoutes(context, state)
  await page.goto('/')
  await expect(page.getByText('Вход в систему')).toBeVisible()
  const initialMeRequests = state.meRequests

  await page.getByLabel('Логин, email или телефон').fill('admin')
  await page.getByLabel('Пароль', { exact: true }).fill('secret-password')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Рабочий стол' })).toBeVisible()
  await page.waitForTimeout(100)
  expect(state.meRequests).toBe(initialMeRequests)
})

test('logout broadcasts an auth generation and clears private data in another tab', async ({ page, context }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'single desktop cross-tab contract')
  const state = { authenticated: true, role: 'admin', meRequests: 0 }
  await installAuthRoutes(context, state)
  const secondPage = await context.newPage()

  await Promise.all([
    page.goto('/?role=admin&view=overview'),
    secondPage.goto('/?role=admin&view=overview'),
  ])
  await expect(secondPage.getByText('Private Admin', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Выйти', exact: true }).click()

  await expect(secondPage.getByText('Вход в систему')).toBeVisible()
  await expect(secondPage.getByText('Private Admin', { exact: true })).toHaveCount(0)
  await secondPage.close()
})

test('focus revalidates /api/me and replaces data after an out-of-band role switch', async ({ page, context }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'single desktop focus contract')
  const state = { authenticated: true, role: 'admin', meRequests: 0 }
  await installAuthRoutes(context, state)
  await page.addInitScript(() => {
    localStorage.setItem('swimcrm.ui.locale.1.admin', 'en')
    localStorage.setItem('swimcrm.ui.locale.2.trainer', 'pl')
  })
  await page.goto('/?role=admin&view=overview')
  await expect(page.getByText('Private Admin', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  const initialMeRequests = state.meRequests

  const otherPage = await context.newPage()
  await otherPage.goto('about:blank')
  state.role = 'trainer'
  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))

  await expect(page.getByRole('heading', { level: 1, name: 'Moje zajęcia' })).toBeVisible()
  await expect(page.getByText('Private Admin', { exact: true })).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
  expect(state.meRequests).toBeGreaterThan(initialMeRequests)
  await otherPage.close()
})

test('a late private bootstrap response cannot restore data after cross-tab logout', async ({ page, context }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'single desktop stale-response contract')
  let releaseReference
  let markReferenceStarted
  const referenceGate = new Promise((resolve) => { releaseReference = resolve })
  const referenceStarted = new Promise((resolve) => { markReferenceStarted = resolve })
  const state = {
    authenticated: true,
    role: 'admin',
    meRequests: 0,
    referenceGate,
    referenceStarted: markReferenceStarted,
    holdReferenceForPage: null,
  }
  await installAuthRoutes(context, state)
  await page.goto('/?role=admin&view=overview')
  await expect(page.getByText('Private Admin', { exact: true })).toBeVisible()

  const secondPage = await context.newPage()
  state.holdReferenceForPage = secondPage
  await secondPage.goto('/?role=admin&view=overview')
  await referenceStarted

  await page.getByRole('button', { name: 'Выйти', exact: true }).click()
  await expect(secondPage.getByText('Вход в систему')).toBeVisible()
  releaseReference()

  await expect(secondPage.getByText('Private Admin', { exact: true })).toHaveCount(0)
  await secondPage.waitForTimeout(100)
  await expect(secondPage.getByText('Вход в систему')).toBeVisible()
  await secondPage.close()
})
