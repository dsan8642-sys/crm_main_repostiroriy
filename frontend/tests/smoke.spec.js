import { expect, test } from '@playwright/test'

async function mockPortal(page, routes) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const participantMatch = url.pathname.match(/^\/api\/admin\/participants\/(\d+)\/$/)
    const participantMethod = route.request().method()
    if (participantMatch && ['GET', 'POST', 'PATCH', 'DELETE'].includes(participantMethod)) {
      const row = routes['/api/admin/clients/']?.clients?.find(
        (client) => String(client.id) === participantMatch[1],
      )
      const currentGroups = Array.isArray(row?.groups) ? row.groups : row?.group ? [row.group] : []
      if (row && participantMethod !== 'GET') {
        const submitted = route.request().postData()
          ? route.request().postDataJSON()
          : {}
        const participant = submitted.participant || submitted
        let groupIds = participant.group_ids
        if (!Array.isArray(groupIds) && participantMethod === 'DELETE') {
          const removedId = participant.group_id
          groupIds = currentGroups
            .map((group) => group.id)
            .filter((groupId) => String(groupId) !== String(removedId))
        }
        if (Array.isArray(groupIds)) {
          const knownGroups = [
            ...(routes['/api/admin/reference/']?.groups || []),
            ...(routes['/api/admin/groups/']?.groups || []),
            ...currentGroups,
          ]
          const groupsById = new Map(knownGroups.map((group) => [String(group.id), group]))
          row.groups = groupIds.map((groupId) => groupsById.get(String(groupId))).filter(Boolean)
          row.group = row.groups.length === 1 ? row.groups[0] : null
        } else if (participant.group_id == null) {
          row.groups = []
          row.group = null
        }
      }
      const responseRow = row ? {
        ...row,
        groups: Array.isArray(row.groups) ? row.groups : currentGroups,
      } : null
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(responseRow || { error: 'Participant not found' }),
        status: row ? 200 : 404,
      })
      return
    }
    const legacyClientPayments = routes['/api/client/payments/']
    const compatibilityPayload = url.pathname === '/api/client/charges/' && legacyClientPayments
      ? { charges: legacyClientPayments.charges || [] }
      : url.pathname === '/api/client/payment-history/' && legacyClientPayments
        ? { payments: legacyClientPayments.payments || [] }
        : null
    let payload = url.pathname === '/api/health/'
      ? { status: 'ok', service: 'swimcrm' }
      : routes[url.pathname] || compatibilityPayload
    if (url.pathname === '/api/admin/clients/' && payload?.clients) {
      let rows = [...payload.clients]
      const active = url.searchParams.get('active')
      const subscription = url.searchParams.get('subscription')
      const balance = url.searchParams.get('balance')
      const activity = url.searchParams.get('activity')
      const groupId = url.searchParams.get('group_id')
      const search = (url.searchParams.get('search') || url.searchParams.get('q') || '').toLocaleLowerCase('ru-RU')
      if (active === 'true') rows = rows.filter((row) => row.client_is_active !== false && row.is_active !== false)
      if (active === 'false') rows = rows.filter((row) => row.client_is_active === false || row.is_active === false)
      if (subscription) rows = rows.filter((row) => Boolean(row.has_current_subscription) === (subscription === 'with'))
      if (balance === 'positive') rows = rows.filter((row) => Number(row.balance_minor || 0) < 0)
      if (balance === 'negative') rows = rows.filter((row) => Number(row.balance_minor || 0) > 0)
      if (balance === 'zero') rows = rows.filter((row) => Number(row.balance_minor || 0) === 0)
      if (activity) rows = rows.filter((row) => Boolean(row.is_recently_active) === (activity === 'active'))
      if (groupId) rows = rows.filter((row) => (
        Array.isArray(row.groups) ? row.groups : row.group ? [row.group] : []
      ).some((group) => String(group.id) === groupId))
      if (search) rows = rows.filter((row) => [
        row.first_name, row.last_name, row.full_name, row.client_phone, row.email, row.group?.name,
      ].some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(search)))
      const total = rows.length
      const page = Math.max(1, Number(url.searchParams.get('page') || 1))
      const pageSize = Math.max(1, Number(url.searchParams.get('page_size') || total || 1))
      const start = (page - 1) * pageSize
      payload = {
        ...payload,
        clients: rows.slice(start, start + pageSize),
        pagination: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)) },
      }
    }
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
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      errors.push(`console ${message.type()}: ${message.text()} ${message.location().url}`)
    }
  })
  return errors
}

function localIsoDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

async function openShellDestination(page, label) {
  const sidebarButton = page.locator(`.ops-nav > .ops-nav-button[title="${label}"]`)
  const mobileMenuButton = page.getByRole('button', { name: 'Открыть меню' })
  await expect.poll(async () => (
    await sidebarButton.isVisible() || await mobileMenuButton.isVisible()
  )).toBe(true)
  if (await sidebarButton.isVisible()) {
    await sidebarButton.click()
    return
  }
  await mobileMenuButton.click()
  await page.locator(`.ops-mobile-drawer-nav .ops-nav-button[title="${label}"]`).click()
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
  await expect(
    page.getByRole('heading', { name: 'SwimCRM', exact: true }),
  ).toBeVisible({ timeout: 15_000 })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const motionDurations = await page.locator('.app').evaluate((element) => {
    const style = getComputedStyle(element)
    return [style.transitionDuration, style.animationDuration].map((duration) => {
      const first = duration.split(',')[0].trim()
      return first.endsWith('ms') ? Number.parseFloat(first) / 1000 : Number.parseFloat(first)
    })
  })
  expect(Math.max(...motionDurations)).toBeLessThanOrEqual(0.001)

  const bodyText = (await page.locator('body').innerText()).trim()
  expect(bodyText.length).toBeGreaterThan(20)
})

test('IBM Plex assets are local and cover RU, PL and EN samples', async ({ page }) => {
  const externalFontRequests = []
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname
    if (hostname === 'fonts.googleapis.com' || hostname === 'fonts.gstatic.com') {
      externalFontRequests.push(request.url())
    }
  })

  await page.goto('/')
  const fontState = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('16px "IBM Plex Sans"', 'Zażółć gęślą jaźń — Привет — SwimCRM'),
      document.fonts.load('16px "IBM Plex Mono"', 'PLN 12345 / ID-42'),
    ])
    await document.fonts.ready
    return {
      sans: document.fonts.check('16px "IBM Plex Sans"', 'Zażółć gęślą jaźń — Привет — SwimCRM'),
      mono: document.fonts.check('16px "IBM Plex Mono"', 'PLN 12345 / ID-42'),
    }
  })

  expect(fontState).toEqual({ sans: true, mono: true })
  expect(externalFontRequests).toEqual([])
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

test('client and schedule forms show field errors and focus the first invalid field', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop form-contract smoke is sufficient')
  const errors = collectPageErrors(page)
  const clientPosts = []
  let schedulePosts = 0
  const routes = {
    '/api/csrf/': { ok: true },
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 0, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [{ id: 1, name: 'Marek' }],
      groups: [{ id: 1, name: 'Delfiny', description: 'Grupa testowa', default_trainer: { id: 1, name: 'Marek Zielinski' }, default_capacity: 12, participants_count: 1, is_active: true }],
      subscription_types: [],
      locations: [{ id: 1, name: 'Basen A', is_active: true }],
      session_types: [],
      participants: [],
      choices: { payment_methods: [], notification_channels: [] },
      notification_settings: {},
    },
    '/api/admin/clients/': { clients: [] },
    '/api/admin/trainers/': {
      trainers: [{ id: 1, username: 'marek', full_name: 'Marek', is_active: true }],
    },
    '/api/admin/groups/': {
      groups: [{
        id: 1, name: 'Delfiny', description: '', default_capacity: 8,
        participants_count: 0, is_active: true,
      }],
    },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': {
      session_types: [{
        id: 1, code: 'group', label: 'Групповое', default_capacity: 8,
        default_duration_minutes: 60, is_active: true, configured: true,
      }],
    },
    '/api/admin/schedule/sessions/': { sessions: [] },
    '/api/admin/payments/': { payments: [] },
    '/api/admin/debtors/': { debtors: [] },
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'POST' && pathname === '/api/admin/clients/') {
      const submitted = request.postDataJSON()
      clientPosts.push(submitted)
      if (clientPosts.length === 1) {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ account: { id: 10, username: submitted.account.username }, participants: [] }),
        })
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Проверьте отмеченные поля.',
            code: 'validation_error',
            errors: {
              'account.username': [{
                code: 'duplicate',
                message: 'Этот телефон уже используется как логин. Измените контакт или логин',
              }],
              'account.phone': [{
                code: 'duplicate',
                message: 'Этот телефон уже используется как логин. Измените контакт или логин',
              }],
            },
            non_field_errors: [],
          }),
        })
      }
      return
    }
    if (request.method() === 'POST' && pathname.startsWith('/api/admin/schedule/')) {
      schedulePosts += 1
    }
    const payload = pathname === '/api/health/'
      ? { status: 'ok', service: 'swimcrm' }
      : routes[pathname]
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled smoke endpoint: ${pathname}` }),
    })
  })

  await page.goto('/?role=admin&view=clients')
  await page.getByRole('button', { name: /^Новый клиент/ }).click()
  await expect(page.getByRole('checkbox', { name: /сам является участником/i })).toHaveCount(0)
  await page.getByLabel('Имя владельца аккаунта').fill('Anna')
  await page.getByLabel('Фамилия владельца').fill('Nowak')
  await page.getByLabel('Телефон', { exact: true }).fill('+48 500-111-222')
  await expect(page.getByLabel('Логин', { exact: true })).toHaveValue('48500111222')
  await page.getByRole('button', { name: 'Создать клиента', exact: true }).click()
  await expect.poll(() => clientPosts.length).toBe(1)
  expect(clientPosts[0]).toMatchObject({
    client_type: 'adult',
    is_adult: true,
    account: { username: '48500111222', phone: '+48 500-111-222' },
    participant: { is_account_holder: true },
  })

  await page.getByRole('button', { name: /^Новый клиент/ }).click()
  await page.getByLabel('Имя владельца аккаунта').fill('Anna')
  await page.getByLabel('Фамилия владельца').fill('Nowak')
  await page.getByLabel('Телефон', { exact: true }).fill('+48 500-111-222')
  await page.getByRole('button', { name: 'Создать клиента', exact: true }).click()
  const username = page.getByLabel('Логин', { exact: true })
  const phone = page.getByLabel('Телефон', { exact: true })
  await expect(username).toBeFocused()
  await expect(username).toHaveAttribute('aria-invalid', 'true')
  await expect(phone).toHaveAttribute('aria-invalid', 'true')
  await expect(username).toHaveCSS('border-color', 'rgb(214, 63, 54)')
  await expect(page.getByText(
    'Этот телефон уже используется как логин. Измените контакт или логин',
    { exact: true },
  )).toHaveCount(2)
  await phone.fill('+48 500-111-223')
  await expect(username).not.toHaveAttribute('aria-invalid', 'true')
  await expect(phone).not.toHaveAttribute('aria-invalid', 'true')

  await page.goto('/?role=admin&view=schedule')
  await page.getByRole('button', { name: 'Групповая тренировка', exact: true }).click()
  const duration = page.getByLabel('Длительность, мин', { exact: true })
  await duration.fill('17')
  await page.getByRole('button', { name: 'Создать занятие', exact: true }).click()
  await expect(duration).toBeFocused()
  await expect(duration).toHaveAttribute('aria-invalid', 'true')
  await expect(duration).toHaveCSS('border-color', 'rgb(214, 63, 54)')
  await expect(page.getByText('От 15 до 480 минут с шагом 5 минут.', { exact: true })).toBeVisible()
  expect(schedulePosts).toBe(0)
  await duration.fill('20')
  await expect(duration).not.toHaveAttribute('aria-invalid', 'true')
  expect(errors.filter((message) => !(
    message.includes('status of 400')
      && message.includes('/api/admin/clients/')
  ))).toEqual([])
})

test('admin group roster includes inactive assigned participants', async ({ page }) => {
  await mockPortal(page, {
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 2, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [{ id: 1, name: 'Marek Zielinski' }],
      groups: [{ id: 1, name: 'Delfiny', default_capacity: 12, participants_count: 2, is_active: true }],
      subscription_types: [], locations: [], session_types: [],
      participants: [{
        id: 10, client_id: 20, first_name: 'Anna', last_name: 'Active', full_name: 'Anna Active',
        group: { id: 1, name: 'Delfiny' }, is_active: true, client_is_active: true,
      }],
      choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
    },
    '/api/admin/clients/': {
      clients: [
        {
          id: 10, client_id: 20, first_name: 'Anna', last_name: 'Active', full_name: 'Anna Active',
          group: { id: 1, name: 'Delfiny' }, is_active: true, client_is_active: true,
        },
        {
          id: 11, client_id: 21, first_name: 'Inna', last_name: 'Inactive', full_name: 'Inna Inactive',
          group: { id: 1, name: 'Delfiny' }, is_active: false, client_is_active: false,
        },
      ],
    },
    '/api/admin/groups/': {
      groups: [{ id: 1, name: 'Delfiny', default_capacity: 12, participants_count: 2, is_active: true }],
    },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': { sessions: [] },
  })

  await page.goto('/?role=admin&view=groups&group=1')
  const groupCard = page.getByRole('region', { name: 'Карточка группы Delfiny' })
  await expect(groupCard).toContainText('Active Anna')
  await expect(groupCard).toContainText('Inactive Inna')
  await expect(groupCard.getByRole('button', { name: 'Убрать' })).toHaveCount(2)
  await groupCard.getByRole('button', { name: 'Убрать' }).nth(1).click()
  await expect(groupCard).not.toContainText('Inactive Inna')
  await expect(groupCard.getByRole('button', { name: 'Убрать' })).toHaveCount(1)
})

test('shared shell and calendar keep mobile controls compact and accessible', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile calendar contract')
  const errors = collectPageErrors(page)
  await mockPortal(page, {
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 0, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [],
      choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
    },
    '/api/admin/clients/': { clients: [] },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': {
      sessions: [
        {
          id: 1, start_at: '2026-08-03T08:00:00+02:00', end_at: '2026-08-03T09:00:00+02:00',
          location: 'Basen A', session_type: 'group', trainer_id: 1, trainer: 'Marek',
          group: { id: 1, name: 'Delfiny' }, is_cancelled: false, max_participants: 8, participants_count: 1,
        },
      ],
    },
    '/api/admin/payments/': { payments: [] },
    '/api/admin/debtors/': { debtors: [] },
  })

  await page.goto('/?role=admin&view=schedule')
  await expect(page.getByTestId('schedule-calendar')).toBeVisible()

  const theme = await page.evaluate(async () => {
    await document.fonts.ready
    const root = getComputedStyle(document.documentElement)
    const body = getComputedStyle(document.body)
    const heading = getComputedStyle(document.querySelector('.page-title'))
    const sidebar = getComputedStyle(document.querySelector('.ops-sidebar'))
    const logo = getComputedStyle(document.querySelector('.ops-brand-mark'))
    return {
      primary: root.getPropertyValue('--primary').trim(),
      primaryHover: root.getPropertyValue('--primary-hover').trim(),
      bodyFamily: body.fontFamily,
      bodyWeight: body.fontWeight,
      variableFaceLoaded: document.fonts.check('450 14px "IBM Plex Sans"'),
      headingWeight: heading.fontWeight,
      sidebarBackground: sidebar.backgroundColor,
      logoBackground: logo.backgroundImage,
    }
  })
  expect(theme.primary.toLowerCase()).toBe('#1a7dc4')
  expect(theme.primaryHover.toLowerCase()).toBe('#1364a3')
  expect(theme.bodyFamily).toContain('IBM Plex Sans')
  expect(theme.bodyWeight).toBe('450')
  expect(theme.variableFaceLoaded).toBe(true)
  expect(theme.headingWeight).toBe('600')
  expect(theme.sidebarBackground).toBe('rgb(16, 24, 40)')
  expect(theme.logoBackground).not.toContain('15, 118, 110')

  const shellLayout = await page.locator('.ops-sidebar-head').evaluate((head) => {
    const brand = head.querySelector('.ops-brand')?.getBoundingClientRect()
    const menu = head.querySelector('[aria-label="Открыть меню"]')?.getBoundingClientRect()
    return {
      sameRow: Boolean(brand && menu && Math.abs(brand.top - menu.top) <= 2),
      menuSize: menu ? Math.min(menu.width, menu.height) : 0,
    }
  })
  expect(shellLayout).toEqual({ sameRow: true, menuSize: 44 })

  const strip = page.locator('.ops-mobile-week-strip')
  await expect(strip.getByRole('tab')).toHaveCount(7)
  expect(await strip.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  const visuallyHiddenBoxes = await Promise.all([
    page.getByText('Опорная дата', { exact: true }).boundingBox(),
    page.getByText(/Неделя · \d{4}-\d{2}-\d{2}/).boundingBox(),
  ])
  for (const box of visuallyHiddenBoxes) {
    expect(box?.width || 0).toBeLessThanOrEqual(1)
    expect(box?.height || 0).toBeLessThanOrEqual(1)
  }
  await expect(page.getByRole('textbox', { name: 'Опорная дата', exact: true })).toBeVisible()
  await expect(page.getByText('Занятия', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Месяц', exact: true }).click()
  const marker = page.locator('.ops-calendar-marker').first()
  if (await marker.count()) await expect(marker).not.toContainText('•')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('approved preview follow-ups define the responsive shell and calendar', async ({ page }) => {
  const errors = collectPageErrors(page)
  const sessions = [
    {
      id: 1, start_at: '2026-08-03T08:00:00+02:00', end_at: '2026-08-03T09:00:00+02:00',
      location: 'Basen A', session_type: 'group', trainer_id: 1, trainer: 'Marek',
      group: { id: 1, name: 'Delfiny' }, is_cancelled: false, max_participants: 15, participants_count: 6,
      presentation_color_key: 'forest-01',
    },
    {
      id: 2, start_at: '2026-08-03T10:00:00+02:00', end_at: '2026-08-03T11:00:00+02:00',
      location: 'Basen B', session_type: 'individual', trainer_id: 1, trainer: 'Marek',
      group: null, individual_participant: { id: 7, full_name: 'Anna Nowak' }, is_cancelled: true,
      max_participants: 1, participants_count: 1, presentation_type_label: 'Индивидуальная тренировка',
      presentation_color_key: 'coral-01',
    },
  ]
  await mockPortal(page, {
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 0, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [{ id: 1, name: 'Marek' }], groups: [{ id: 1, name: 'Delfiny' }],
      subscription_types: [], locations: [{ id: 1, name: 'Basen A' }, { id: 2, name: 'Basen B' }],
      session_types: [], participants: [], choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
    },
    '/api/admin/clients/': { clients: [] },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': { sessions },
    '/api/admin/payments/': { payments: [] },
    '/api/admin/debtors/': { debtors: [] },
  })

  await page.goto('/?role=admin&view=schedule')
  await expect(page.getByRole('heading', { level: 1, name: 'Расписание' })).toBeVisible()
  const width = page.viewportSize()?.width || 0
  if (width >= 768) {
    await expect(page.locator('.ops-topbar .ops-crumb, .ops-topbar .sub, .ops-topbar h1')).toHaveCount(0)
    await expect(page.locator('.ops-topbar')).toHaveCSS('background-color', 'rgb(238, 246, 253)')
    await expect(page.locator('.ops-global-search > input')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  } else {
    await expect(page.locator('.ops-topbar')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Открыть глобальный поиск' })).toBeVisible()
  }
  await expect(page.locator('.ops-sidebar')).toHaveCSS('background-color', 'rgb(16, 24, 40)')

  const actionCards = page.locator('.ops-action-card')
  await expect(actionCards).toHaveCount(4)
  await expect(actionCards.first()).toHaveCSS('align-items', 'center')
  await expect(actionCards.first()).toHaveCSS('text-align', 'center')
  const copyPeriodAction = page.getByRole('button', { name: 'Копировать период', exact: true })
  await expect(copyPeriodAction).toBeVisible()
  await expect(copyPeriodAction.locator('small')).toHaveCount(0)
  await expect(copyPeriodAction).not.toContainText('Предпросмотр перед записью')

  const logout = page.getByRole('button', { name: 'Выйти', exact: true })
  if (width >= 768) {
    await expect(logout).toHaveCount(1)
    await expect(page.locator('.ops-sidebar')).toHaveCSS('width', width < 960 ? '76px' : '250px')
    await expect(page.locator('.ops-user-wrap').getByRole('button', { name: 'Выйти' })).toBeVisible()
    await expect(page.locator('.ops-sidebar-head').getByRole('button', { name: 'Выйти' })).toHaveCount(0)
  } else {
    await expect(logout).toHaveCount(0)
    await expect(page.locator('.ops-sidebar-head').getByRole('button', { name: 'Открыть меню' })).toBeVisible()
  }

  await page.getByRole('textbox', { name: 'Опорная дата', exact: true }).fill('2026-08-03')
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(2)
  const individualEvent = page.locator('.ops-schedule-event:visible').filter({ hasText: 'Anna Nowak' }).first()
  await expect(individualEvent.locator('.ops-event-title')).toHaveText('Индивидуальная тренировка')
  await expect(individualEvent.locator('.ops-event-type')).toHaveText('Anna Nowak')
  await expect(individualEvent.locator('.ops-event-title')).toHaveCSS('font-size', '14px')
  await expect(individualEvent.locator('.ops-event-type')).toHaveCSS('font-size', '13px')
  await expect(individualEvent.locator('.ops-event-secondary').first()).toHaveCSS('font-size', '12px')

  const filterTrigger = page.getByRole('button', { name: /Фильтры/ })
  const viewSwitcher = page.locator('.ops-view-switcher')
  const [filterBox, switcherBox] = await Promise.all([filterTrigger.boundingBox(), viewSwitcher.boundingBox()])
  expect(
    ((filterBox?.x || 0) + (filterBox?.width || 0)) <= (switcherBox?.x || 0) + 1,
    `filter must stay left of view switcher: ${JSON.stringify({ filterBox, switcherBox })}`,
  ).toBe(true)
  await filterTrigger.click()
  const filterPanel = page.getByRole('dialog', { name: 'Фильтры расписания' })
  await expect(filterPanel).toBeVisible()
  await filterPanel.getByLabel('Статус').selectOption('cancelled')
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(2)
  await filterPanel.getByRole('button', { name: 'Применить', exact: true }).click()
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(1)
  await filterTrigger.click()
  await filterPanel.getByLabel('Статус').selectOption('planned')
  await page.keyboard.press('Escape')
  await filterTrigger.click()
  await expect(filterPanel.getByLabel('Статус')).toHaveValue('cancelled')
  await filterPanel.getByLabel('Статус').selectOption('')
  await filterPanel.getByRole('button', { name: 'Применить', exact: true }).click()

  if (width >= 768) {
    const eventWrap = page.locator('.ops-schedule-event-wrap:visible').filter({ hasText: 'Delfiny' }).first()
    const event = eventWrap.locator('.ops-schedule-event')
    await expect(event.locator('.ops-event-occupancy')).toHaveText('6/15')
    await expect(event.locator('.ops-event-occupancy')).toHaveAttribute('aria-label', 'Записано 6 из 15')
    await expect(event).toHaveAttribute('aria-label', /Записано 6 из 15/)
    await expect(event.locator('.ops-event-title')).toHaveText('Delfiny')
    await expect(event.locator('.ops-event-title')).toHaveCSS('font-size', '14px')
    await expect(event.locator('.ops-event-type')).toHaveText('Групповая тренировка')
    await expect(event.locator('.ops-event-type')).toHaveCSS('font-size', '13px')
    await expect(event.locator('.ops-event-secondary').first()).toHaveCSS('font-size', '12px')
    await expect(event.locator('.ops-event-secondary').first()).toHaveCSS('color', 'rgb(77, 89, 103)')
    await expect(event.locator('.ops-event-secondary').first()).toHaveCSS('font-weight', '500')
    await expect(event.locator('.ops-event-primary')).toHaveCSS('justify-content', 'space-between')
    await expect(event).toHaveCSS('padding-right', width < 960 ? '58px' : '46px')
    expect((await event.boundingBox())?.height || 0).toBeGreaterThanOrEqual(92)
    await expect(event).toHaveCSS('border-top-width', '0px')
    await expect(event).toHaveCSS('border-right-width', '0px')
    await expect(event).toHaveCSS('border-bottom-width', '0px')
    await expect(event).toHaveCSS('border-left-width', '0px')
    expect(await event.evaluate((node) => getComputedStyle(node).getPropertyValue('--schedule-card-fill'))).toContain('38%')
    expect(await event.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe('rgb(232, 245, 233)')
    const action = eventWrap.locator('.ops-schedule-event-edit')
    if (width < 960) {
      await expect(action).toBeVisible()
      await expect(action).toHaveCSS('width', '44px')
    } else {
      await expect(action).toBeHidden()
      await eventWrap.hover()
      await expect(action).toBeVisible()
    }

    await page.getByRole('button', { name: 'Месяц', exact: true }).click()
    const weekdayHeader = page.getByTestId('month-weekday-header')
    await expect(weekdayHeader).toBeVisible()
    await expect(weekdayHeader.locator('.ops-calendar-weekday')).toHaveCount(7)
    await expect(weekdayHeader.locator('.ops-calendar-weekday strong').first()).toHaveCSS('font-size', '16px')
    await expect(page.locator('.ops-schedule-event:visible .ops-event-type').first()).toBeVisible()
    await expect(page.locator('.ops-schedule-event:visible .ops-event-trainer').first()).toBeHidden()
    const weekdayCenters = await weekdayHeader.locator('.ops-calendar-weekday').evaluateAll((nodes) => (
      nodes.map((node) => {
        const box = node.getBoundingClientRect()
        return box.left + box.width / 2
      })
    ))
    const firstWeekCenters = await page.locator('.ops-calendar-grid > .ops-schedule-day').evaluateAll((nodes) => (
      nodes.slice(0, 7).map((node) => {
        const box = node.getBoundingClientRect()
        return box.left + box.width / 2
      })
    ))
    weekdayCenters.forEach((center, index) => expect(Math.abs(center - firstWeekCenters[index])).toBeLessThan(1.5))
    await expect(page.locator('.ops-calendar-marker')).toHaveCount(0)
    const dateButton = page.locator('.ops-schedule-day > header button').first()
    await expect(dateButton).toHaveCSS('color', 'rgb(17, 24, 39)')

    if (width === 1440) {
      await page.setViewportSize({ width: 768, height: 900 })
      await expect(page.locator('.ops-schedule-event-edit').first()).toBeVisible()
      await expect(page.locator('.ops-schedule-event-edit').first()).toHaveCSS('width', '44px')
      await expect(page.locator('.ops-sidebar')).toHaveCSS('width', '76px')
      await page.setViewportSize({ width: 960, height: 900 })
      await expect(page.locator('.ops-sidebar-head').getByRole('button', { name: 'Открыть меню' })).toHaveCount(0)
      await page.reload()
      await expect(page.locator('.ops-sidebar')).toHaveCSS('width', '250px')
      await expect(page.locator('.ops-user-wrap').getByRole('button', { name: 'Выйти' })).toBeVisible()
    }
  } else {
    const dot = page.locator('.ops-mobile-week-dot').first()
    await expect(dot).toBeVisible()
    await expect(dot).toHaveCSS('background-color', 'rgb(26, 125, 196)')
    await expect(page.locator('.ops-mobile-week-strip small')).toHaveCount(0)
    await expect(page.locator('.ops-schedule-event-edit').first()).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('attendance shows a past non-cancelled session as completed', async ({ page }) => {
  const pastSession = {
    id: 71,
    start_at: '2025-01-15T10:00:00+01:00',
    end_at: '2025-01-15T11:00:00+01:00',
    location: 'Basen A',
    session_type: 'group',
    status: 'planned',
    is_cancelled: false,
    trainer_id: 1,
    trainer: 'Marek',
    group: { id: 1, name: 'Delfiny' },
    max_participants: 15,
    participants_count: 0,
  }
  const futureSession = {
    ...pastSession,
    id: 72,
    start_at: '2099-01-15T10:00:00+01:00',
    end_at: '2099-01-15T11:00:00+01:00',
  }
  await mockPortal(page, {
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 0, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [{ id: 1, name: 'Marek' }], groups: [{ id: 1, name: 'Delfiny' }],
      subscription_types: [], locations: [{ id: 1, name: 'Basen A' }], session_types: [], participants: [],
      choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
    },
    '/api/admin/clients/': { clients: [] },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/schedule/sessions/': { sessions: [pastSession, futureSession] },
    '/api/admin/schedule/sessions/71/attendance/': { session: pastSession, history: [], students: [] },
    '/api/admin/schedule/sessions/72/attendance/': { session: futureSession, history: [], students: [] },
    '/api/admin/payments/': { payments: [] },
    '/api/admin/debtors/': { debtors: [] },
  })

  await page.goto('/?role=admin&view=attendance&session=71')
  const statusSummary = page.locator('.ops-session-summary > div').filter({ hasText: 'Статус' })
  await expect(statusSummary).toContainText('Завершено')
  await expect(statusSummary).not.toContainText('Запланировано')
  const completedPill = statusSummary.locator('span').filter({ hasText: 'Завершено' }).last()
  await expect(completedPill).toHaveCSS('background-color', 'rgb(233, 247, 238)')
  await expect(completedPill).toHaveCSS('color', 'rgb(15, 97, 20)')
  await expect(completedPill).toHaveCSS('border-color', 'rgb(205, 236, 215)')

  await page.locator('.ops-session-detail-grid select').first().selectOption('72')
  await expect(statusSummary).toContainText('Запланировано')
  await expect(statusSummary).not.toContainText('Завершено')
})

test('admin split schedule filters, shows roster summary and submits an optional second client', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'desktop and phone schedule interactions are covered')
  const errors = collectPageErrors(page)
  const submittedSessions = []
  const patchedSessions = []
  const fixtureStart = new Date()
  fixtureStart.setHours(12, 0, 0, 0)
  const startAt = localIsoDateTime(fixtureStart)
  const endAt = localIsoDateTime(new Date(fixtureStart.getTime() + 60 * 60 * 1000))
  const participants = [
    { id: 11, client_id: 101, first_name: 'Anna', last_name: 'First', full_name: 'First Anna', is_active: true, client_is_active: true },
    { id: 12, client_id: 102, first_name: 'Berta', last_name: 'Second', full_name: 'Second Berta', is_active: true, client_is_active: true },
    { id: 13, client_id: 103, first_name: 'Celina', last_name: 'Third', full_name: 'Third Celina', is_active: true, client_is_active: true },
  ]
  const sessions = [
    {
      id: 51, start_at: startAt, end_at: endAt, duration_minutes: 60,
      location: 'Pool A', session_type: 'group', trainer_id: 1, trainer: 'Marek',
      group: { id: 1, name: 'Delfiny' }, max_participants: 8,
      participants_count: 3, roster: [], is_cancelled: false,
    },
    {
      id: 52, start_at: startAt, end_at: endAt, duration_minutes: 60,
      location: 'Pool B', session_type: 'split', presentation_type_label: 'Split-тренировка',
      trainer_id: 2, trainer: 'Ewa', group: null, individual_student_id: 11,
      individual_participant: { id: 11, full_name: 'First Anna' },
      roster: participants.map((row) => ({ id: row.id, full_name: row.full_name })),
      max_participants: 4, participants_count: 3, is_cancelled: false,
    },
  ]
  const routes = {
    '/api/csrf/': { ok: true },
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Admin User' },
    '/api/admin/dashboard/': { metrics: { clients: 3, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [{ id: 1, name: 'Marek' }, { id: 2, name: 'Ewa' }],
      groups: [{ id: 1, name: 'Delfiny' }], subscription_types: [],
      locations: [{ id: 1, name: 'Pool A' }, { id: 2, name: 'Pool B' }],
      session_types: [], participants, choices: { payment_methods: [], notification_channels: [] },
      notification_settings: {},
    },
    '/api/admin/clients/': { clients: participants },
    '/api/admin/trainers/': { trainers: [{ id: 1, full_name: 'Marek', is_active: true }, { id: 2, full_name: 'Ewa', is_active: true }] },
    '/api/admin/groups/': { groups: [{ id: 1, name: 'Delfiny', default_capacity: 8, participants_count: 0, is_active: true }] },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': {
      session_types: [
        { id: 1, code: 'group', label: 'Групповое', default_capacity: 8, default_duration_minutes: 60, is_active: true, configured: true },
        { id: 2, code: 'individual', label: 'Индивидуальное', default_capacity: 1, default_duration_minutes: 60, is_active: true, configured: true },
        { id: 3, code: 'split', label: 'Сплит', default_capacity: 2, default_duration_minutes: 60, is_active: true, configured: true },
      ],
    },
    '/api/admin/schedule/sessions/': { sessions },
    '/api/admin/payments/': { payments: [] },
    '/api/admin/debtors/': { debtors: [] },
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'POST' && pathname === '/api/admin/schedule/check-conflict/') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ has_conflict: false }) })
      return
    }
    if (request.method() === 'POST' && pathname === '/api/admin/schedule/sessions/') {
      submittedSessions.push(request.postDataJSON())
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 60 }) })
      return
    }
    if (request.method() === 'PATCH' && pathname === '/api/admin/schedule/sessions/52/') {
      patchedSessions.push(request.postDataJSON())
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...sessions[1], roster: [sessions[1].roster[0], sessions[1].roster[2]] }),
      })
      return
    }
    const payload = pathname === '/api/health/'
      ? { status: 'ok', service: 'swimcrm' }
      : routes[pathname]
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled smoke endpoint: ${pathname}` }),
    })
  })

  await page.goto('/?role=admin&view=schedule')
  const splitWrap = page.locator('.ops-schedule-event-wrap:visible').filter({ hasText: 'First Anna' }).first()
  await expect(splitWrap).toContainText('Second Berta')
  await expect(splitWrap).toContainText('+1')
  await expect(splitWrap.locator('.ops-event-roster-count')).toBeVisible()

  const action = splitWrap.locator('.ops-schedule-event-edit')
  await splitWrap.hover()
  await expect(action).toBeVisible()
  const placement = await splitWrap.evaluate((wrap) => {
    const button = wrap.querySelector('.ops-schedule-event-edit')
    const outer = wrap.getBoundingClientRect()
    const inner = button.getBoundingClientRect()
    return {
      bottom: outer.bottom - inner.bottom,
      right: outer.right - inner.right,
      belowMidpoint: inner.top > outer.top + outer.height / 2,
    }
  })
  expect(placement.bottom).toBeLessThanOrEqual(8)
  expect(placement.right).toBeLessThanOrEqual(8)
  expect(placement.belowMidpoint).toBe(true)

  await page.getByRole('button', { name: /Фильтры/ }).click()
  const filters = page.getByRole('dialog', { name: 'Фильтры расписания' })
  await filters.getByLabel('Тип тренировки').selectOption('split')
  await filters.getByRole('button', { name: 'Применить' }).click()
  await expect(page.locator('.ops-schedule-event:visible')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /Фильтры · 1/ })).toBeVisible()

  await splitWrap.hover()
  await action.click()
  const editForm = page.getByRole('dialog', { name: 'Редактирование занятия' })
  await expect(editForm.getByRole('combobox', { name: 'Клиент 1' })).toHaveValue('First Anna')
  await expect(editForm.getByRole('combobox', { name: /Клиент 2/ })).toHaveValue('Second Berta')
  await expect(editForm.getByLabel('Полный состав Split')).toContainText('First Anna · Second Berta · Third Celina')
  const openDeleteDialog = editForm.getByRole('button', { name: 'Удалить занятие' })
  await openDeleteDialog.click()
  const deleteDialog = page.getByRole('dialog', { name: 'Удалить занятие?' })
  await expect(deleteDialog).toBeVisible()
  expect(await deleteDialog.evaluate((dialog) => {
    const box = dialog.getBoundingClientRect()
    const topmost = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return dialog.contains(topmost)
  })).toBe(true)
  await deleteDialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(deleteDialog).toHaveCount(0)
  await expect(editForm).toBeVisible()
  await expect(openDeleteDialog).toBeFocused()
  await openDeleteDialog.click()
  await expect(deleteDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(deleteDialog).toHaveCount(0)
  await expect(editForm).toBeVisible()
  await expect(openDeleteDialog).toBeFocused()
  await editForm.getByRole('combobox', { name: /Клиент 2/ }).fill('')
  await editForm.getByRole('button', { name: 'Сохранить занятие' }).click()
  await expect.poll(() => patchedSessions.length).toBe(1)
  expect(patchedSessions[0].second_student_id).toBeNull()

  await page.getByRole('button', { name: 'Split-тренировка', exact: true }).click()
  let createForm = page.getByRole('dialog', { name: 'Новое занятие' })
  let firstClient = createForm.getByRole('combobox', { name: 'Клиент 1' })
  await firstClient.fill('First Anna')
  await page.getByRole('option', { name: /First Anna/ }).click()
  await createForm.locator('.form-modal__footer').getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.getByRole('button', { name: 'Закрыть без сохранения' }).click()
  await page.getByRole('button', { name: 'Split-тренировка', exact: true }).click()
  createForm = page.getByRole('dialog', { name: 'Новое занятие' })
  firstClient = createForm.getByRole('combobox', { name: 'Клиент 1' })
  await expect(firstClient).toHaveValue('')
  await firstClient.fill('First Anna')
  await page.getByRole('option', { name: /First Anna/ }).click()
  const secondClient = createForm.getByRole('combobox', { name: /Клиент 2/ })
  await secondClient.fill('First Anna')
  await expect(page.getByRole('option', { name: /First Anna/ })).toHaveCount(0)
  await secondClient.fill('Second Berta')
  await page.getByRole('option', { name: /Second Berta/ }).click()
  await createForm.getByLabel('Лимит участников').fill('4')
  await createForm.getByRole('button', { name: 'Создать занятие' }).click()

  await expect.poll(() => submittedSessions.length).toBe(1)
  expect(submittedSessions[0]).toMatchObject({
    session_type: 'split',
    individual_student_id: '11',
    second_student_id: '12',
    max_participants: 4,
  })
  expect(errors).toEqual([])
})

test('admin schedule color pickers stay compact and reveal the approved palette on demand', async ({ page }) => {
  const errors = collectPageErrors(page)
  let submittedColor = null
  const emptyPages = {
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/payroll/schemes/': { schemes: [] },
    '/api/admin/payroll/rules/': { rules: [] },
    '/api/admin/payroll/assignments/': { assignments: [] },
    '/api/admin/payroll/periods/': { periods: [] },
    '/api/admin/notifications/logs/': { logs: [] },
    '/api/admin/notifications/templates/': { templates: [] },
    '/api/admin/notifications/rules/': { rules: [] },
    '/api/admin/notifications/quiet-hours/': { policies: [] },
    '/api/admin/settings/locations/': { locations: [] },
    '/api/admin/settings/languages/': { languages: [] },
    '/api/admin/settings/dictionary-keys/': { keys: [] },
    '/api/admin/settings/dictionary-translations/': { translations: [] },
    '/api/admin/settings/notification-template-translations/': { translations: [] },
    '/api/admin/system/audit/': { entries: [] },
    '/api/admin/system/imports/': { batches: [] },
    '/api/admin/system/security/': { users: [] },
    '/api/admin/system/credentials/': { username: 'admin', role: 'admin' },
  }
  await mockPortal(page, {
    '/api/csrf/': { ok: true },
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Admin' },
    '/api/admin/dashboard/': { metrics: {} },
    '/api/admin/reference/': {
      trainers: [], groups: [{ id: 1, name: 'Delfiny' }], subscription_types: [], locations: [], participants: [],
      choices: { payment_methods: [], notification_channels: [] },
    },
    '/api/admin/clients/': { clients: [] },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': {
      groups: [{ id: 1, name: 'Delfiny', description: '', default_capacity: 10, color_key: null, participants_count: 0, is_active: true }],
    },
    '/api/admin/settings/session-types/': {
      session_types: [{ id: 1, code: 'group', label: 'Групповое', default_capacity: 10, default_duration_minutes: 60, color_key: null, is_active: true, configured: true }],
    },
    '/api/admin/schedule/sessions/': { sessions: [] },
    '/api/admin/payments/': { payments: [] },
    '/api/admin/debtors/': { debtors: [] },
    ...emptyPages,
  })
  await page.route('**/api/admin/settings/session-types/1/', async (route) => {
    submittedColor = route.request().postDataJSON()?.color_key ?? null
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 1, code: 'group', label: 'Групповое', color_key: submittedColor, is_active: true }),
    })
  })

  await page.goto('/')
  await openShellDestination(page, 'Группы')
  if ((page.viewportSize()?.width || 0) <= 767) {
    await page.locator('.ops-group-compact-card').getByRole('button', { name: 'Delfiny', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Карточка', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
  const groupEditor = page.getByRole('dialog', { name: 'Редактирование группы' })
  const groupPicker = groupEditor.getByRole('group', { name: 'Цвет расписания' })
  const groupTrigger = groupPicker.getByRole('button', { name: 'Выбрать цвет. Сейчас: Стандартный', exact: true })
  await expect(groupTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(groupPicker.getByRole('radio')).toHaveCount(0)
  await groupTrigger.click()
  await expect(groupTrigger).toHaveAttribute('aria-expanded', 'true')
  await expect(groupPicker.getByRole('radio')).toHaveCount(31)
  await groupEditor.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(groupEditor).toHaveCount(0)

  await openShellDestination(page, 'Настройки')
  if ((page.viewportSize()?.width || 0) <= 767) {
    await page.getByRole('button', { name: 'Справочники', exact: true }).click()
    await page.getByRole('button', { name: /Типы занятий/ }).click()
  } else {
    await page.getByRole('button', { name: /Типы занятий/ }).click()
  }
  await page.getByRole('button', { name: 'Изменить', exact: true }).click()
  const typeEditor = page.getByRole('dialog', { name: 'Редактирование · Типы занятий' })
  const typePicker = typeEditor.getByRole('group', { name: 'Цвет расписания' })
  const typeTrigger = typePicker.getByRole('button', { name: 'Выбрать цвет. Сейчас: Стандартный', exact: true })
  await expect(typeTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(typePicker.getByRole('radio')).toHaveCount(0)
  await typeTrigger.click()
  await expect(typeTrigger).toHaveAttribute('aria-expanded', 'true')
  await expect(typePicker.getByRole('radio')).toHaveCount(31)
  const forest = typePicker.getByRole('radio', { name: 'Лесной', exact: true })
  const pickerFits = await typePicker.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  expect(pickerFits).toBe(true)
  await forest.focus()
  await page.keyboard.press('Space')
  await expect(typePicker.getByRole('button', { name: 'Выбрать цвет. Сейчас: Лесной', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect(typePicker.getByRole('radio')).toHaveCount(0)
  await typeEditor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect.poll(() => submittedColor).toBe('forest-01')
  expect(errors).toEqual([])
})

test('shared logout stays single-shot for admin, trainer and client', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile shared-shell contract')
  let role = 'admin'
  let loggedOut = false
  const logoutPosts = []
  const emptyAdmin = {
    '/api/admin/dashboard/': { metrics: {} },
    '/api/admin/reference/': { trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [], choices: { payment_methods: [], notification_channels: [] }, notification_settings: {} },
    '/api/admin/clients/': { clients: [] }, '/api/admin/trainers/': { trainers: [] }, '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': { subscription_types: [] }, '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': { sessions: [] }, '/api/admin/payments/': { payments: [] }, '/api/admin/debtors/': { debtors: [] },
  }
  const emptyTrainer = {
    '/api/trainer/sessions/': { sessions: [] }, '/api/trainer/groups/': { groups: [] }, '/api/trainer/history/': { sessions: [] },
  }
  const emptyClient = {
    '/api/client/overview/': { account: { id: 3, full_name: 'Parent Client' }, participants: [] },
    '/api/client/profile/': { account: { id: 3, full_name: 'Parent Client', preferred_language: 'ru' }, participants: [], subscriptions: [] },
    '/api/client/consents/': { consents: [] }, '/api/client/schedule/': { sessions: [] }, '/api/client/attendance/': { attendance: [] },
    '/api/client/payments/': { payments: [] }, '/api/client/notifications/': { notifications: [] },
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname === '/api/auth/logout/' && request.method() === 'POST') {
      logoutPosts.push(role)
      loggedOut = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }
    let payload = null
    if (pathname === '/api/csrf/') payload = { ok: true }
    else if (pathname === '/api/health/') payload = { status: 'ok', service: 'swimcrm' }
    else if (pathname === '/api/me/' && !loggedOut) payload = { id: 1, username: role, role: role === 'client' ? 'parent' : role, full_name: `${role} user` }
    else if (role === 'admin') payload = emptyAdmin[pathname]
    else if (role === 'trainer') payload = emptyTrainer[pathname]
    else payload = emptyClient[pathname]
    await route.fulfill({ status: payload ? 200 : 403, contentType: 'application/json', body: JSON.stringify(payload || { error: 'Login required' }) })
  })

  const actions = {
    admin: (button) => button.click(),
    trainer: async (button) => { await button.focus(); await page.keyboard.press('Enter') },
    client: async (button) => { await button.focus(); await page.keyboard.press('Space') },
  }
  for (const nextRole of ['admin', 'trainer', 'client']) {
    role = nextRole
    loggedOut = false
    await page.goto(`/?logout-role=${nextRole}`)
    await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Открыть меню' }).click()
    const logout = page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: 'Выйти', exact: true })
    await expect(logout).toHaveCount(1)
    await expect(logout).toBeVisible()
    await actions[nextRole](logout)
    await expect(page.getByText('Вход в систему')).toBeVisible()
    expect(logoutPosts.filter((item) => item === nextRole)).toHaveLength(1)
  }
})

test('admin mobile client list separates profile navigation from client actions', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile client-card contract')
  const writeRequests = []
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writeRequests.push(`${request.method()} ${new URL(request.url()).pathname}`)
  })
  await mockPortal(page, {
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 1, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [], groups: [{ id: 3, name: 'Delfiny' }], subscription_types: [], locations: [], session_types: [], participants: [],
      choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
    },
    '/api/admin/clients/': {
      clients: [{
        id: 7, client_id: 10, first_name: 'Jan', last_name: 'Kowalski', full_name: 'Jan Kowalski',
        client_phone: '+48123456789', email: 'jan.long.address@example.test', group: { id: 3, name: 'Delfiny' },
        is_active: true, client_is_active: true,
      }],
    },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': { sessions: [] },
    '/api/admin/payments/': { payments: [] },
    '/api/admin/debtors/': { debtors: [] },
  })

  await page.goto('/?role=admin&view=clients')
  const mobileList = page.locator('.ops-client-mobile-list')
  await expect(mobileList).toBeVisible()
  await expect(mobileList.getByText('Финансы', { exact: true })).toHaveCount(0)
  await expect(mobileList.getByRole('button')).toHaveCount(2)
  const card = mobileList.getByRole('button', { name: /Открыть профиль клиента Kowalski Jan/ })
  const actionsTrigger = mobileList.getByRole('button', { name: 'Действия: Kowalski Jan' })
  await expect(card).toContainText('Kowalski Jan')
  expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await actionsTrigger.click()
  const actions = page.getByRole('menu', { name: 'Действия: Kowalski Jan' })
  await expect(actions.getByRole('menuitem')).toHaveText(['Профиль', 'Изменить', 'В чёрный список'])
  await expect(actions.getByText('Финансы', { exact: true })).toHaveCount(0)
  await actionsTrigger.click()
  await card.click()
  await expect(page).toHaveURL(/view=clientDetail.*client=10/)
  expect(writeRequests).toEqual([])
})

test('admin upcoming sessions stay inside a narrow card', async ({ page }) => {
  const errors = collectPageErrors(page)
  const longGroup = 'Delfiny Zaawansowane Grupa Poranna'
  const longTrainer = 'Marek Zielinski-Trener-Zastepujacy'
  const longLocation = 'Basen_A_Sektor_Polnocny_Bardzo_Dluga_Nazwa'
  await mockPortal(page, {
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 0, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [],
      groups: [],
      subscription_types: [],
      locations: [],
      session_types: [],
      participants: [],
      choices: { payment_methods: [], notification_channels: [] },
      notification_settings: {},
    },
    '/api/admin/clients/': { clients: [] },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': {
      sessions: [{
        id: 1,
        start_at: '2026-08-03T08:00:00+02:00',
        end_at: '2026-08-03T09:00:00+02:00',
        location: longLocation,
        session_type: 'group',
        trainer_id: 1,
        trainer: longTrainer,
        group: { id: 1, name: longGroup },
        is_cancelled: true,
        max_participants: 8,
        participants_count: 1,
        notes: '',
      }],
    },
    '/api/admin/schedule/sessions/1/attendance/': {
      session: {
        id: 1,
        start_at: '2026-08-03T08:00:00+02:00',
        end_at: '2026-08-03T09:00:00+02:00',
        location: longLocation,
        session_type: 'group',
        trainer_id: 1,
        trainer: longTrainer,
        group: { id: 1, name: longGroup },
        is_cancelled: true,
        max_participants: 8,
        participants_count: 1,
        notes: '',
      },
      history: [],
      students: [],
    },
    '/api/admin/payments/': { payments: [] },
    '/api/admin/debtors/': { debtors: [] },
  })

  await page.goto('/')
  await expect(page.locator('h1.page-title', { hasText: 'Сегодня' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ближайших занятий нет' })).toBeVisible()
  const exception = page.getByRole('button', {
    name: /Delfiny Zaawansowane.*Отменено/,
  })
  await expect(exception).toBeVisible()
  expect(await exception.evaluate((row) => row.scrollWidth <= row.clientWidth + 1)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  await exception.click()
  await expect(page).toHaveURL(/view=schedule.*tab=list/)
  expect(errors).toEqual([])
})

test('admin critical screens render with API-backed data', async ({ page }) => {
  const errors = collectPageErrors(page)
  const fixtureStart = new Date()
  fixtureStart.setHours(12, 0, 0, 0)
  const now = localIsoDateTime(fixtureStart)
  const fixtureEnd = localIsoDateTime(new Date(fixtureStart.getTime() + 45 * 60 * 1000))
  const seenAdminEndpoints = new Set()
  const seenClientFinanceActions = new Set()
  const submittedSettings = []
  const submittedCredentials = []
  const submittedSessions = []
  const schedulePageSizes = []
  const requiredAdminScreenEndpoints = [
    '/api/admin/dashboard/',
    '/api/admin/reference/',
    '/api/admin/clients/',
    '/api/admin/trainers/',
    '/api/admin/groups/',
    '/api/admin/schedule/sessions/',
    '/api/admin/subscriptions/',
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
      groups: [{ id: 1, name: 'Delfiny', description: 'Grupa testowa', default_trainer: { id: 1, name: 'Marek Zielinski' }, default_location: { id: 1, name: 'Basen A', is_active: true }, default_capacity: 12, participants_count: 1, is_active: true }],
      subscription_types: [{ id: 1, name: '8 wejsc', price_minor: 24000, currency: 'PLN', duration_days: 30, sessions_count: 8, is_unlimited: false, is_individual: false, is_active: true }],
      locations: [{ id: 1, code: 'pool-a', name: 'Basen A' }],
      session_types: [
        { value: 'group', label: 'Grupowe' },
        { value: 'individual', label: 'Indywidualne' },
        { value: 'split', label: 'Split' },
      ],
      participants: [
        { id: 1, client_id: 10, first_name: 'Jan', last_name: 'Kowalski', full_name: 'Jan Kowalski', is_active: true, client_is_active: true, group: { id: 1, name: 'Delfiny' } },
        { id: 3, client_id: 12, first_name: 'Aleksandra', last_name: 'Żółć', full_name: 'Aleksandra Żółć', is_active: true, client_is_active: true, group: null },
      ],
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
        {
          id: 3,
          client_id: 12,
          first_name: 'Aleksandra',
          last_name: 'Żółć',
          full_name: 'Aleksandra Żółć',
          birth_date: '2015-08-20',
          email: 'aleksandra@example.com',
          client_phone: '+48777888999',
          client_is_active: true,
          is_account_holder: false,
          is_active: true,
          group: null,
        },
      ],
    },
    '/api/admin/clients/10/': {
      account: { id: 10, username: 'jan-parent', full_name: 'Anna Kowalska', email: 'anna@example.com', phone: '+48111222333', is_active: true, access_activated: true, portal_access: 'active' },
      participants: [{ id: 1, client_id: 10, first_name: 'Jan', last_name: 'Kowalski', full_name: 'Jan Kowalski', birth_date: '2016-05-10', is_active: true, group: { id: 1, name: 'Delfiny' }, balance_minor: 0 }],
      subscriptions: [
        { id: 1, participant_id: 1, participant: { id: 1, full_name: 'Jan Kowalski' }, subscription_type_id: 1, type: '8 wejsc', status: 'active', remaining_sessions: 7, start_date: '2026-07-01', effective_end_date: '2026-07-31', created_at: '2026-07-01T10:00:00+02:00' },
        { id: 2, participant_id: 1, participant: { id: 1, full_name: 'Jan Kowalski' }, subscription_type_id: 1, type: '4 wejsc', status: 'expired', remaining_sessions: 0, start_date: '2026-05-01', effective_end_date: '2026-05-31', created_at: '2026-05-01T10:00:00+02:00' },
      ],
      charges: [],
      payments: [],
      attendance: [],
      consents: [],
      summary: { participants_count: 1, active_participants: 1, balance_minor: 0, active_subscriptions: 1, pending_payments: 0 },
    },
    '/api/admin/trainers/': {
      trainers: [{ id: 1, username: 'marek', full_name: 'Marek Zielinski', email: 'm@example.com', phone: '+48000111222', is_active: true, user_is_active: true, access_activated: true, portal_access: 'active', groups_count: 1 }],
    },
    '/api/admin/groups/': {
      groups: [{ id: 1, name: 'Delfiny', description: 'Grupa testowa', default_trainer: { id: 1, name: 'Marek Zielinski' }, default_location: { id: 1, name: 'Basen A', is_active: true }, default_capacity: 12, participants_count: 1, is_active: true }],
    },
    '/api/admin/subscription-types/': {
      subscription_types: [{ id: 1, name: '8 wejsc', price_minor: 24000, currency: 'PLN', duration_days: 30, sessions_count: 8, is_unlimited: false, is_individual: false, is_active: true }],
    },
    '/api/admin/subscriptions/': {
      subscriptions: [{
        id: 1,
        client_id: 10,
        participant_id: 1,
        participant_name: 'Jan Kowalski',
        phone: '+48111222333',
        groups: [{ id: 1, name: 'Delfiny' }],
        subscription_type_id: 1,
        type: '8 wejsc',
        status: 'active',
        remaining_sessions: 7,
        start_date: '2026-07-01',
        effective_end_date: '2026-07-31',
        grace_end_date: '2026-08-07',
        allowed_actions: ['open_client', 'renew', 'freeze', 'adjust'],
      }],
      counts: { active: 1, ending_soon: 0, depleted: 0, expired_remaining: 0, future: 0, history: 0 },
      pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
    },
    '/api/admin/schedule/sessions/': {
      sessions: [
        { id: 1, start_at: now, end_at: fixtureEnd, location: 'Basen A', session_type: 'group', presentation_color_key: 'forest-01', trainer_id: 1, trainer: 'Marek Zielinski', group: { id: 1, name: 'Delfiny' }, is_cancelled: false, max_participants: 8, participants_count: 1, notes: '' },
        { id: 2, start_at: localIsoDateTime(new Date(fixtureStart.getTime() + 20 * 60 * 1000)), end_at: localIsoDateTime(new Date(fixtureStart.getTime() + 65 * 60 * 1000)), location: 'Basen A', session_type: 'group', presentation_color_key: 'coral-01', trainer_id: 1, trainer: 'Marek Zielinski', group: { id: 1, name: 'Delfiny' }, is_cancelled: true, max_participants: 8, participants_count: 1, notes: 'cancelled' },
      ],
    },
    '/api/admin/schedule/sessions/1/attendance/': {
      session: { id: 1, start_at: now, end_at: fixtureEnd, location: 'Basen A', session_type: 'group', trainer_id: 1, trainer: 'Marek Zielinski', group: { id: 1, name: 'Delfiny' }, is_cancelled: false, max_participants: 8, participants_count: 1, notes: '' },
      history: [{ id: 1, action: 'session.created', actor: 'admin', changes: {}, created_at: now }],
      students: [{
        id: 1,
        client_id: 10,
        first_name: 'Jan',
        last_name: 'Kowalski',
        full_name: 'Jan Kowalski',
        client_phone: '+48111222333',
        balance_minor: 24000,
        currency: 'PLN',
        group: { id: 1, name: 'Delfiny' },
        attendance: null,
        session_participant: null,
        can_remove_from_session: false,
      }],
    },
    '/api/admin/payments/': {
      payments: [
        { id: 1, participant_id: 1, participant: 'Jan Kowalski', amount_minor: 24000, currency: 'PLN', paid_at: '2026-07-16', method: 'bank_transfer', status: 'pending', comment: '' },
        { id: 2, participant_id: 1, participant: 'Jan Kowalski', amount_minor: 12000, currency: 'PLN', paid_at: '2026-07-15', method: 'cash', status: 'confirmed', comment: '' },
        { id: 3, participant_id: 1, participant: 'Jan Kowalski', amount_minor: 9000, currency: 'PLN', paid_at: '2026-07-14', method: 'bank_transfer', status: 'rejected', comment: '' },
      ],
    },
    '/api/admin/payments/2/': {
      id: 2,
      client_id: 10,
      client: 'Anna Kowalska',
      participant_id: 1,
      participant: 'Jan Kowalski',
      amount_minor: 12000,
      currency: 'PLN',
      paid_at: '2026-07-16',
      method: 'cash',
      status: 'confirmed',
      comment: 'manual smoke',
      events: [{ id: 1, type: 'confirmed', from_status: null, to_status: 'confirmed' }],
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
    '/api/admin/system/credentials/': { username: 'admin', role: 'admin' },
  }

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    const financeResponses = {
      '/api/admin/participants/1/subscriptions/': { subscription: { id: 2 } },
      '/api/admin/subscriptions/1/renew/': { subscription: { id: 3 } },
      '/api/admin/subscriptions/1/freeze/': { days: 7 },
      '/api/admin/subscriptions/1/adjust/': { subscription: { id: 1, remaining_sessions: 8 } },
    }
    const accessResponses = {
      '/api/admin/clients/10/access/issue/': {
        purpose: 'recovery',
        login: 'anna@example.com',
        activation_code: 'synthetic-client-recovery-code',
        expires_at: '2026-08-01T12:00:00+02:00',
      },
      '/api/admin/trainers/1/access/issue/': {
        purpose: 'recovery',
        login: 'marek',
        activation_code: 'synthetic-trainer-recovery-code',
        expires_at: '2026-08-01T12:00:00+02:00',
      },
    }
    if (method === 'POST' && accessResponses[url.pathname]) {
      seenAdminEndpoints.add(url.pathname)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(accessResponses[url.pathname]),
      })
      return
    }
    if (method === 'GET' && url.pathname === '/api/admin/schedule/sessions/') {
      schedulePageSizes.push(Number(url.searchParams.get('page_size')))
    }
    if (method === 'POST' && url.pathname === '/api/admin/schedule/check-conflict/') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ has_conflict: false }),
      })
      return
    }
    if (method === 'POST' && url.pathname === '/api/admin/schedule/sessions/') {
      const submitted = route.request().postDataJSON()
      submittedSessions.push(submitted)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 3, ...submitted, is_cancelled: false }),
      })
      return
    }
    if (method === 'POST' && url.pathname === '/api/admin/schedule/sessions/2/restore/') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...routes['/api/admin/schedule/sessions/'].sessions[1], is_cancelled: false, restored: true }),
      })
      return
    }
    if (method === 'POST' && url.pathname === '/api/admin/participants/1/charges/') {
      const charge = { id: 71, participant_id: 1, amount_minor: 8000, currency: 'PLN', due_date: '2026-07-16', description: 'Индивидуальное занятие', status: 'active', balance_minor: -8000, reference_id: 'smoke-charge-71', can_reverse: true }
      routes['/api/admin/clients/10/'] = {
        ...routes['/api/admin/clients/10/'],
        participants: [{ ...routes['/api/admin/clients/10/'].participants[0], balance_minor: -8000 }],
        charges: [charge],
        summary: { ...routes['/api/admin/clients/10/'].summary, balance_minor: -8000 },
      }
      seenAdminEndpoints.add(url.pathname)
      seenClientFinanceActions.add(url.pathname)
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(charge) })
      return
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
    if (method === 'PATCH' && url.pathname === '/api/admin/system/credentials/') {
      submittedCredentials.push(route.request().postDataJSON())
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, username: 'admin-renamed', role: 'admin' }),
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
  await expect(page.locator('h1.page-title', { hasText: 'Сегодня' })).toBeVisible()
  const adminIconSignatures = await page.evaluate(() => {
    const nav = (label) => document.querySelector(`.ops-nav-button[title="${label}"] svg`)?.innerHTML
    const kpi = (label) => [...document.querySelectorAll('.ops-kpi-button')]
      .find((button) => button.textContent?.includes(label))?.querySelector('svg')?.innerHTML
    return {
      clients: nav('Клиенты'),
      trainers: nav('Тренеры'),
      groups: nav('Группы'),
      clientsKpi: kpi('Клиенты'),
      trainersKpi: kpi('Тренеры'),
    }
  })
  expect(new Set([adminIconSignatures.clients, adminIconSignatures.trainers, adminIconSignatures.groups]).size).toBe(3)
  expect(adminIconSignatures.clientsKpi).toBe(adminIconSignatures.clients)
  expect(adminIconSignatures.trainersKpi).toBe(adminIconSignatures.trainers)
  await expect(page.getByText('Marek Zielinski').first()).toBeVisible()
  if ((page.viewportSize()?.width || 0) <= 767) {
    await page.getByRole('button', { name: 'Открыть глобальный поиск' }).click()
  }
  await page.getByRole('textbox', { name: 'Глобальный поиск', exact: true }).fill('Jan Kowalski')
  await page.getByRole('button', { name: /Jan Kowalski/ }).first().click()
  await expect(page.locator('h1.page-title', { hasText: 'Anna Kowalska' })).toBeVisible()
  await expect(page).toHaveURL(/client=10/)
  await page.reload()
  await expect(page.locator('h1.page-title', { hasText: 'Anna Kowalska' })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить доступ', exact: true }).click()
  await expect(page.getByText('Код восстановления доступа')).toBeVisible()
  await expect(page.getByText('synthetic-client-recovery-code')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать логин' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать код' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать всё' })).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.getByRole('button', { name: 'Редактировать клиента' }).click()
  await page.getByLabel('Телефон', { exact: true }).fill('+48999999999')
  await page.getByRole('button', { name: 'Сохранить изменения' }).click()
  await expect(page.getByText('Данные владельца аккаунта обновлены.')).toBeVisible()

  await openShellDestination(page, 'Клиенты')
  await expect(page.locator('h1.page-title', { hasText: 'Клиенты' })).toBeVisible()
  const compactClients = (page.viewportSize()?.width || 0) <= 767
  if (compactClients) {
    await expect(page.getByRole('button', { name: /Открыть профиль клиента Kowalski Jan/ })).toBeVisible()
  } else {
    await expect(page.getByRole('row', { name: /Kowalski Jan/ })).toBeVisible()
  }
  await expect(page.locator('.ops-nav-button[title="Платежи"] .ops-nav-count')).toHaveText('1')
  await expect(page.getByRole('button', { name: /Новый клиент/ })).toBeVisible()
  await expect(page.getByText('Piotr Nowak')).toHaveCount(0)
  await page.getByRole('button', { name: 'Чёрный список', exact: true }).click()
  if (compactClients) {
    await expect(page.getByRole('button', { name: /Открыть профиль клиента Nowak Piotr/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Восстановить' })).toHaveCount(0)
  } else {
    await expect(page.getByRole('row', { name: /Nowak Piotr/ })).toBeVisible()
    if ((page.viewportSize()?.width || 0) === 768) {
      await page.getByRole('button', { name: 'Действия: Nowak Piotr' }).click()
      await page.getByRole('menuitem', { name: 'Восстановить' }).click()
    } else {
      await page.getByRole('button', { name: 'Восстановить' }).click()
    }
    await page.getByRole('dialog').getByRole('button', { name: 'Восстановить' }).click()
    await expect(page.getByText('Клиент восстановлен и снова отображается в рабочем списке.')).toBeVisible()
    expect(seenAdminEndpoints).toContain('/api/admin/clients/11/restore/')
  }

  await openShellDestination(page, 'Тренеры')
  await expect(page.locator('h1.page-title', { hasText: 'Тренеры' })).toBeVisible()
  const trainerListSurface = compactClients ? page.locator('.ops-entity-mobile-list') : page.locator('.ops-entity-desktop-table')
  await expect(trainerListSurface.getByText('Marek Zielinski', { exact: true })).toBeVisible()
  await trainerListSurface.getByRole('button', { name: /Marek Zielinski/ }).first().click()
  await expect(page.getByRole('region', { name: /Профиль тренера/ })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить доступ', exact: true }).click()
  await expect(page.getByText('Код восстановления доступа')).toBeVisible()
  await expect(page.getByText('synthetic-trainer-recovery-code')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать логин' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать код' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Копировать всё' })).toBeVisible()
  await page.getByRole('tab', { name: 'Зарплата и ставки' }).click()
  await expect(page.getByText('Ставки по типам занятий')).toBeVisible()

  await openShellDestination(page, 'Группы')
  await expect(page.locator('h1.page-title', { hasText: 'Группы' })).toBeVisible()
  const groupListSurface = compactClients ? page.locator('.ops-entity-mobile-list') : page.locator('.ops-entity-desktop-table')
  await expect(groupListSurface.getByText('Delfiny', { exact: true })).toBeVisible()
  await groupListSurface.getByRole('button', { name: 'Delfiny', exact: true }).first().click()
  const groupCard = page.getByRole('region', { name: /Карточка группы/ })
  await expect(groupCard).toBeVisible()
  await expect(groupCard).toContainText('Вместимость12')
  await expect(page.getByText('Состав группы')).toBeVisible()
  await groupCard.getByRole('button', { name: 'Редактировать' }).click()
  const groupEditor = page.getByRole('dialog', { name: 'Редактирование группы' })
  const capacityInput = groupEditor.getByLabel('Вместимость')
  await expect(capacityInput).toHaveValue('12')
  await capacityInput.fill('0')
  await groupEditor.getByRole('button', { name: 'Сохранить' }).click()
  await expect(capacityInput).toHaveAttribute('aria-invalid', 'true')
  await capacityInput.fill('12')
  await groupEditor.getByRole('button', { name: 'Отмена' }).click()
  await expect(groupEditor).toHaveCount(0)
  await groupCard.getByRole('button', { name: 'Добавить', exact: true }).click()
  const memberEditor = page.getByRole('dialog', { name: 'Добавить участника в группу' })
  const clientCombobox = memberEditor.getByRole('combobox', { name: 'Добавить участника' })
  await clientCombobox.fill('zolc aleks')
  await expect(page.getByRole('option', { name: /Żółć Aleksandra/ })).toBeVisible()
  await clientCombobox.press('Escape')
  await memberEditor.getByRole('button', { name: 'Отмена' }).click()
  await expect(memberEditor).toHaveCount(0)

  await openShellDestination(page, 'Расписание')
  await expect(page.locator('h1.page-title', { hasText: 'Расписание' })).toBeVisible()
  await expect(page.getByTestId('schedule-calendar')).toBeVisible()
  const forestEvent = page.locator('.ops-schedule-event[data-color-key="forest-01"]:visible').first()
  const cancelledCoralEvent = page.locator('.ops-schedule-event.is-cancelled[data-color-key="coral-01"]:visible').first()
  expect(await forestEvent.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe('rgb(232, 245, 233)')
  expect(await cancelledCoralEvent.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe('rgb(255, 240, 236)')
  await expect(forestEvent).toHaveCSS('border-left-width', '0px')
  await expect(cancelledCoralEvent).toHaveCSS('border-left-width', '0px')
  await expect(cancelledCoralEvent).toHaveCSS('opacity', '0.6')
  await expect(page.getByRole('button', { name: 'Календарь', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Неделя', exact: true })).toHaveAttribute('aria-pressed', 'true')
  if ((page.viewportSize()?.width || 0) >= 769) await expect(page.getByText('За неделю: 2')).toBeVisible()
  await expect(page.getByText(/Шаблоны расписания|Создать из шаблона/)).toHaveCount(0)
  expect(schedulePageSizes.every((size) => size > 0 && size <= 200)).toBe(true)
  const filterTrigger = page.getByRole('button', { name: /Фильтры/ })
  const filterBox = await filterTrigger.boundingBox()
  const pageBox = await page.locator('.page').boundingBox()
  expect(filterBox?.height).toBeLessThanOrEqual(50)
  expect(filterBox?.width).toBeLessThan(pageBox?.width || 10000)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const referencePickerButton = page.getByRole('button', { name: 'Открыть календарь: Опорная дата' })
  const referencePickerBox = await referencePickerButton.boundingBox()
  expect(referencePickerBox?.width).toBeGreaterThanOrEqual(44)
  expect(referencePickerBox?.height).toBeGreaterThanOrEqual(44)
  await referencePickerButton.click()
  await expect(page.getByRole('dialog', { name: 'Открыть календарь: Опорная дата' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(referencePickerButton).toBeFocused()
  await page.getByRole('button', { name: 'Месяц', exact: true }).click()
  if ((page.viewportSize()?.width || 0) >= 769) await expect(page.getByText('За месяц: 2')).toBeVisible()
  await expect(page.locator('.ops-calendar-marker')).toHaveCount(0)
  await expect(page.getByTestId('month-weekday-header')).toBeVisible()
  await page.getByRole('button', { name: 'День', exact: true }).click()
  if ((page.viewportSize()?.width || 0) >= 769) await expect(page.getByText('За день: 2')).toBeVisible()
  await page.getByRole('button', { name: 'Неделя', exact: true }).click()
  if ((page.viewportSize()?.width || 0) >= 769) await expect(page.getByText('За неделю: 2')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Уведомления' })).toHaveAttribute('aria-live', 'polite')
  await expect(page.getByTestId('schedule-list')).toHaveCount(0)
  await page.locator('[aria-label="Режим отображения расписания"] button').nth(1).click()
  await expect(page.getByTestId('schedule-list')).toBeVisible()
  await expect(page.locator('.ops-session-row').first()).toContainText('Basen A')
  await expect(page.locator('.ops-session-row[data-color-key="forest-01"]')).toHaveCount(1)
  await expect(page.locator('.ops-session-row.is-cancelled[data-color-key="coral-01"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Восстановить тренировку', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить тренировку', exact: true }).click()
  await expect(page.getByText('Тренировка восстановлена.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Групповая тренировка/ })).toBeVisible()
  await page.getByRole('button', { name: /Групповая тренировка/ }).click()
  const createSessionCard = page.getByRole('dialog', { name: 'Новое занятие' })
  await createSessionCard.getByLabel('Тип занятия').selectOption('individual')
  await expect(createSessionCard.getByLabel('Цена занятия, PLN')).toBeVisible()
  await createSessionCard.getByRole('combobox', { name: 'Участник' }).fill('Jan Kowalski')
  await page.getByRole('option', { name: /Kowalski Jan/ }).click()
  await expect(createSessionCard.getByLabel('Локация').locator('option', { hasText: 'Basen A' })).toHaveCount(1)
  const timePickerButton = createSessionCard.getByRole('button', { name: 'Открыть выбор времени: Начало' })
  await timePickerButton.click()
  await expect(page.getByRole('dialog', { name: 'Открыть выбор времени: Начало' })).toBeVisible()
  await expect(page.getByLabel('24-часовой выбор времени')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(timePickerButton).toBeFocused()
  await createSessionCard.getByRole('button', { name: 'Создать занятие' }).click()
  await expect(page.getByText(/Создано:.*Индивидуальное/)).toBeVisible()
  expect(submittedSessions[0].notes).toBe('')
  expect(submittedSessions[0].individual_student_id).toBe('1')

  await page.getByRole('button', { name: /Групповая тренировка/ }).click()
  const invalidCard = page.getByRole('dialog', { name: 'Новое занятие' })
  await expect(invalidCard.getByLabel('Лимит участников')).toHaveValue('12')
  await invalidCard.getByLabel('Тренер').selectOption('')
  await invalidCard.getByRole('button', { name: 'Создать занятие' }).click()
  await expect(invalidCard.getByLabel('Тренер')).toHaveAttribute('aria-invalid', 'true')
  await expect(invalidCard.getByLabel('Тренер')).toBeFocused()
  await invalidCard.locator('.form-modal__footer').getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Закрыть без сохранения?' }).getByRole('button', { name: 'Закрыть без сохранения' }).click()

  await expect(page.getByText(/Недельный план|Weekly plan/i)).toHaveCount(0)

  await page.locator('.ops-session-row').first().click()
  await expect(page.locator('h1.page-title', { hasText: 'Занятие' })).toBeVisible()
  await expect(page.getByText('Jan Kowalski').first()).toBeVisible()
  await expect(page.getByText(/Долг:.*PLN/)).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Телефон' })).toHaveCount(0)
  await page.getByRole('button', { name: /Профиль/ }).click()
  await expect(page.getByText('Anna Kowalska').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Продлить абонемент/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Заморозить/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Скорректировать/ })).toHaveCount(0)
  await page.getByRole('tab', { name: /Абонементы/ }).click()
  await page.getByRole('row', { name: /4 wejsc.*Jan Kowalski/ }).click()
  const rowSubscriptionEditor = page.getByRole('dialog', { name: 'Редактирование абонемента' })
  await expect(rowSubscriptionEditor.getByLabel('Абонемент', { exact: true })).toHaveValue('2')
  await expect(rowSubscriptionEditor.getByLabel('Действие')).toHaveValue('renew')
  await rowSubscriptionEditor.locator('.form-modal__footer').getByRole('button', { name: 'Закрыть', exact: true }).click()

  await page.getByRole('tab', { name: /Платежи/ }).click()
  await page.getByRole('button', { name: /Пополнить баланс/ }).click()
  const paymentDialog = page.getByRole('dialog', { name: 'Пополнить баланс' })
  await paymentDialog.getByLabel('Сумма, zł').fill('120.00')
  await paymentDialog.getByLabel('Комментарий').fill('manual smoke')
  await paymentDialog.getByRole('button', { name: 'Подтвердить оплату' }).click()
  await expect(page.getByText(/Оплата подтверждена\. Проверенный баланс:/)).toBeVisible()

  await page.getByRole('button', { name: /Добавить списание/ }).click()
  await page.getByLabel('Описание').fill('Индивидуальное занятие')
  await page.getByLabel('Сумма').fill('80.00')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Начисление создано.')).toBeVisible()

  await page.getByRole('button', { name: /Продать абонемент/ }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Абонемент и начисление созданы.')).toBeVisible()

  await page.getByRole('button', { name: /Редактировать абонемент/ }).click()
  let subscriptionEditor = page.getByRole('dialog', { name: 'Редактирование абонемента' })
  await expect(subscriptionEditor.getByLabel('Абонемент', { exact: true })).toHaveValue('1')
  await subscriptionEditor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Абонемент продлён, начисление создано.')).toBeVisible()

  await page.getByRole('button', { name: /Редактировать абонемент/ }).click()
  subscriptionEditor = page.getByRole('dialog', { name: 'Редактирование абонемента' })
  await subscriptionEditor.getByLabel('Действие').selectOption('freeze')
  await subscriptionEditor.getByRole('textbox', { name: 'С даты', exact: true }).fill('2026-07-17')
  await subscriptionEditor.getByRole('textbox', { name: 'По дату', exact: true }).fill('2026-07-23')
  await subscriptionEditor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Абонемент заморожен на 7 дней.')).toBeVisible()

  await page.getByRole('button', { name: /Редактировать абонемент/ }).click()
  subscriptionEditor = page.getByRole('dialog', { name: 'Редактирование абонемента' })
  await subscriptionEditor.getByLabel('Действие').selectOption('adjust')
  await subscriptionEditor.getByLabel('Изменение занятий').fill('1')
  await subscriptionEditor.getByLabel('Комментарий').fill('Ручная корректировка')
  await subscriptionEditor.getByRole('button', { name: 'Сохранить', exact: true }).click()
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

  await openShellDestination(page, 'Абонементы')
  await expect(page.locator('h1.page-title', { hasText: 'Абонементы' })).toBeVisible()
  const subscriptionSurface = compactClients
    ? page.locator('.ops-subscription-card:visible')
    : page.locator('.ops-entity-desktop-table:visible')
  await expect(subscriptionSurface.getByText('Jan Kowalski').first()).toBeVisible()

  await openShellDestination(page, 'Платежи')
  await expect(page.locator('h1.page-title', { hasText: 'Платежи' })).toBeVisible()
  if (compactClients) await expect(page.locator('.ops-payment-compact-card').filter({ hasText: 'Банковский перевод / IBAN' }).first()).toBeVisible()
  else await expect(page.locator('td').filter({ hasText: 'Банковский перевод / IBAN' }).first()).toBeVisible()

  await openShellDestination(page, 'Должники')
  await expect(page.locator('h1.page-title', { hasText: 'Должники' })).toBeVisible()
  if (compactClients) await expect(page.locator('.ops-debtor-compact-card').first()).toBeVisible()
  else await expect(page.getByText('Przeterminowana platnosc').first()).toBeVisible()

  await openShellDestination(page, 'Настройки')
  await expect(page.locator('h1.page-title', { hasText: 'Настройки и контроль' })).toBeVisible()
  if (compactClients) {
    await page.getByRole('button', { name: 'Справочники', exact: true }).click()
  }
  await expect(page.getByRole('button', { name: /Типы абонементов/ })).toBeVisible()
  await page.getByRole('button', { name: /Локации/ }).click()
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await page.getByLabel('Код').fill('pool-b')
  await page.getByLabel('Название').fill('Бассейн B')
  await page.getByLabel('Адрес').fill('Варшава')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByText('Запись создана.')).toBeVisible()
  expect(submittedSettings).toEqual([expect.objectContaining({ code: 'pool-b', name: 'Бассейн B', address: 'Варшава' })])
  if (compactClients) {
    await page.getByRole('button', { name: 'Справочники', exact: true }).click()
    await page.getByRole('button', { name: 'Категории', exact: true }).click()
    await page.getByRole('button', { name: 'Контроль', exact: true }).click()
  } else {
    await page.getByRole('tab', { name: 'Контроль' }).click()
  }
  await page.getByRole('button', { name: /Логин и пароль администратора/ }).click()
  await page.getByLabel('Новый логин').fill('admin-renamed')
  await page.getByLabel('Текущий пароль').fill('Str0ngPass!123')
  await page.getByLabel('Новый пароль (необязательно)').fill('DifferentStrongPass!456')
  await page.getByLabel('Повторите новый пароль').fill('DifferentStrongPass!456')
  await page.getByRole('button', { name: 'Обновить данные входа' }).click()
  await expect(page.getByText('Логин и пароль администратора обновлены. Текущая сессия сохранена.')).toBeVisible()
  expect(submittedCredentials).toEqual([{
    username: 'admin-renamed',
    current_password: 'Str0ngPass!123',
    new_password: 'DifferentStrongPass!456',
  }])

  const pageHasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(pageHasHorizontalOverflow).toBe(false)
  if ((page.viewportSize()?.width || 0) <= 767) {
    await expect(page.getByRole('button', { name: 'Выйти', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Открыть меню' }).click()
    await expect(page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: 'Выйти', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('navigation', { name: 'Основная мобильная навигация' })).toHaveCount(0)
  }

  for (const endpoint of requiredAdminScreenEndpoints) {
    expect(seenAdminEndpoints, `admin workflow should request ${endpoint}`).toContain(endpoint)
  }
  expect(errors).toEqual([])
})

test('trainer can open every menu screen without runtime errors', async ({ page }) => {
  const errors = collectPageErrors(page)
  const trainerSessionStart = new Date(Date.now() + 60 * 60 * 1000)
  const session = {
    id: 41,
    start_at: localIsoDateTime(trainerSessionStart),
    end_at: localIsoDateTime(new Date(trainerSessionStart.getTime() + 45 * 60 * 1000)),
    location: 'Большой бассейн',
    max_participants: 8,
    is_cancelled: false,
    presentation_color_key: 'forest-01',
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
  await expect(page.locator('main:visible')).toHaveCount(1)
  await expect(page.locator('.ops-sidebar')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Сегодня' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Открыть посещаемость' })).toBeVisible()
  await expect(page.locator('main:visible')).toHaveCount(1)

  for (const label of ['Сегодня', 'Посещаемость', 'Мои группы', 'История']) {
    await openShellDestination(page, label)
    const pageHeading = page.locator('main:visible h1.page-title')
    await expect(pageHeading).toHaveCount(1)
    if (label !== 'Посещаемость') await expect(pageHeading).toHaveText(label)
    await expect(page.locator('.page')).toBeVisible()
  }

  await openShellDestination(page, 'Посещаемость')
  await expect(page.getByRole('button', { name: 'Все присутствовали' })).toBeVisible()
  await openShellDestination(page, 'Мои группы')
  await page.getByRole('button', { name: /Дельфины/ }).click()
  await expect(page.getByText('Иван Петров')).toBeVisible()
  await openShellDestination(page, 'История')

  await page.reload()
  await expect(page.locator('.ops-sidebar')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'История' })).toBeVisible()
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
    presentation_color_key: 'gold-01',
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
    '/api/client/notifications/': { notifications: [] },
  })

  await page.goto('/')
  await expect(page.locator('.ops-sidebar')).toBeVisible()
  await expect(page.locator('main:visible')).toHaveCount(1)

  for (const label of ['Главная', 'Расписание', 'Абонемент', 'Платежи', 'История', 'Профиль']) {
    await openShellDestination(page, label)
    await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible()
    await expect(page.locator('.page')).toBeVisible()
  }

  await openShellDestination(page, 'Расписание')
  await page.getByRole('button', { name: 'Список', exact: true }).click()
  await expect(page.locator('[data-testid="client-schedule-list"] .ops-session-tile[data-color-key="gold-01"]')).toHaveCount(1)
  await page.locator('[data-testid="client-schedule-list"] .ops-session-tile').first().click()
  await expect(page.getByText('-1 занятие')).toBeVisible()
  await openShellDestination(page, 'Абонемент')
  await expect(page.getByText('Осталось занятий')).toBeVisible()
  await expect(page.getByText('Оформлен')).toHaveCount(0)
  await expect(page.getByText('Льготный период')).toHaveCount(0)
  await expect(page.getByText(/История списаний и корректировок/)).toHaveCount(0)
  await openShellDestination(page, 'Профиль')
  await page.getByRole('button', { name: 'Согласия', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Согласия' })).toBeVisible()

  await page.reload()
  await expect(page.locator('.ops-sidebar')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Согласия' })).toBeVisible()
  expect(errors).toEqual([])
})

test('admin client filters combine with search and keep the blacklist separate', async ({ page }) => {
  const viewportWidth = page.viewportSize()?.width || 0
  test.skip(![390, 1440].includes(viewportWidth), 'desktop and mobile client-filter workflow')
  const errors = collectPageErrors(page)
  await mockPortal(page, {
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 4, active_subscriptions: 1, debtors: 1 } },
    '/api/admin/reference/': {
      trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [],
      choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
    },
    '/api/admin/clients/': {
      clients: [
        { id: 1, client_id: 11, first_name: 'Anna', last_name: 'Plus', balance_minor: -500, currency: 'PLN', has_current_subscription: true, current_subscription_remaining: 2, current_subscription_total: 4, is_recently_active: true, last_present_at: '2026-08-01T17:00:00+02:00', is_active: true, client_is_active: true, group: null },
        { id: 2, client_id: 12, first_name: 'Boris', last_name: 'Debt', balance_minor: 700, currency: 'PLN', has_current_subscription: false, is_recently_active: false, last_present_at: null, is_active: true, client_is_active: true, group: null },
        { id: 3, client_id: 13, first_name: 'Cara', last_name: 'Zero', balance_minor: 0, currency: 'PLN', has_current_subscription: false, is_recently_active: true, last_present_at: '2026-08-02T17:00:00+02:00', is_active: true, client_is_active: true, group: null },
        { id: 4, client_id: 14, first_name: 'Black', last_name: 'Archive', balance_minor: 700, currency: 'PLN', has_current_subscription: false, is_recently_active: false, last_present_at: null, is_active: false, client_is_active: false, group: null },
      ],
    },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': { sessions: [] },
    '/api/admin/payments/': { payments: [] },
    '/api/admin/debtors/': { debtors: [] },
  })

  await page.goto('/?role=admin&view=clients')
  const clientList = page.locator(viewportWidth === 390 ? '.ops-client-mobile-list' : '.ops-client-desktop-table')
  await expect(page.getByText('Найдено: 3')).toBeVisible()

  if (viewportWidth === 390) {
    const toolsGeometry = await page.locator('.ops-client-list-tools').evaluate((tools) => {
      const search = tools.querySelector('.ops-search')
      const filters = tools.querySelector('.ops-client-filter-selects')
      const selects = [...filters.querySelectorAll('select')]
      const app = document.querySelector('.app')
      return {
        toolsHeight: tools.getBoundingClientRect().height,
        searchHeight: search.getBoundingClientRect().height,
        maxSelectHeight: Math.max(...selects.map((select) => select.getBoundingClientRect().height)),
        toolsOverflow: tools.scrollWidth - tools.clientWidth,
        filtersOverflow: filters.scrollWidth - filters.clientWidth,
        appOverflow: app.scrollWidth - app.clientWidth,
      }
    })
    expect(toolsGeometry.toolsHeight).toBeLessThanOrEqual(180)
    expect(toolsGeometry.searchHeight).toBeLessThanOrEqual(56)
    expect(toolsGeometry.maxSelectHeight).toBeLessThanOrEqual(56)
    expect(toolsGeometry.toolsOverflow).toBeLessThanOrEqual(1)
    expect(toolsGeometry.filtersOverflow).toBeLessThanOrEqual(1)
    expect(toolsGeometry.appOverflow).toBeLessThanOrEqual(1)
  }

  await page.getByLabel('Абонемент').selectOption('with')
  await page.getByRole('button', { name: /Применить/ }).click()
  await expect(page.getByText('Найдено: 1')).toBeVisible()
  await expect(clientList.getByText('Plus Anna', { exact: true })).toBeVisible()
  await expect(clientList.getByText('2 из 4', { exact: true })).toBeVisible()
  if (viewportWidth === 390) {
    await expect(clientList.getByText('+5 zł', { exact: true })).toBeVisible()
    await expect(clientList.getByText(/Активен · 01\.08\.2026/)).toBeVisible()
  }

  await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
  await page.getByLabel('Баланс').selectOption('positive')
  await page.getByRole('button', { name: /Применить/ }).click()
  await expect(clientList.getByText('Plus Anna', { exact: true })).toBeVisible()
  await page.getByLabel('Баланс').selectOption('negative')
  await page.getByRole('button', { name: /Применить/ }).click()
  await expect(clientList.getByText('Debt Boris', { exact: true })).toBeVisible()

  await page.getByLabel('Абонемент').selectOption('without')
  await page.getByLabel('Активность').selectOption('inactive')
  await page.getByRole('button', { name: /Применить/ }).click()
  await expect(page.getByText('Найдено: 1')).toBeVisible()
  await expect(clientList.getByText('Debt Boris', { exact: true })).toBeVisible()

  await page.getByLabel('Поиск клиентов').fill('Plus')
  await expect(page.getByText('Найдено: 0')).toBeVisible()
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
  await expect(page.getByText('Найдено: 3')).toBeVisible()

  await page.getByRole('button', { name: 'Чёрный список', exact: true }).click()
  await expect(page.getByText('Найдено: 1')).toBeVisible()
  await expect(clientList.getByText('Archive Black', { exact: true })).toBeVisible()
  if (viewportWidth === 390) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  }
  expect(errors).toEqual([])
})

test('admin confirms and rejects pending payments and the nav counter decrements', async ({ page }) => {
  const errors = collectPageErrors(page)
  const seen = new Set()
  // Backend-side status the mocked API reports; the confirm/reject POSTs mutate it,
  // so the nav counter (driven by a refetch, not local table state) can be asserted.
  const status = { 1: 'pending', 4: 'pending' }
  const paymentsPayload = () => ({
    payments: [
      { id: 1, participant_id: 1, participant: 'Jan Kowalski', client_id: 10, client: 'Anna Kowalska', amount_minor: 24000, currency: 'PLN', paid_at: '2026-07-16', method: 'bank_transfer', status: status[1], comment: '' },
      { id: 4, participant_id: 2, participant: 'Piotr Nowak', client_id: 11, client: 'Marek Nowak', amount_minor: 15000, currency: 'PLN', paid_at: '2026-07-13', method: 'cash', status: status[4], comment: '' },
    ],
  })
  const routes = {
    '/api/csrf/': { ok: true },
    '/api/health/': { status: 'ok', service: 'swimcrm' },
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: 2, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [],
      choices: { payment_methods: [], notification_channels: [] },
      notification_settings: { quiet_hours: {} },
    },
    '/api/admin/clients/': {
      clients: [
        { id: 1, client_id: 10, first_name: 'Jan', last_name: 'Kowalski', full_name: 'Jan Kowalski', is_account_holder: false, is_active: true, client_is_active: true, group: null },
        { id: 2, client_id: 11, first_name: 'Piotr', last_name: 'Nowak', full_name: 'Piotr Nowak', is_account_holder: false, is_active: true, client_is_active: true, group: null },
      ],
    },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': { sessions: [] },
    '/api/admin/participants/1/subscriptions/': { subscriptions: [] },
    '/api/admin/debtors/': { debtors: [] },
  }

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (method === 'POST' && url.pathname === '/api/admin/payments/1/confirm/') {
      status[1] = 'confirmed'
      seen.add(url.pathname)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, status: 'confirmed', balance_minor: -24000, events: [{ type: 'confirmed' }] }) })
      return
    }
    if (method === 'POST' && url.pathname === '/api/admin/payments/4/reject/') {
      status[4] = 'rejected'
      seen.add(url.pathname)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 4, status: 'rejected', balance_minor: 0, events: [{ type: 'rejected' }] }) })
      return
    }
    if (method === 'GET' && /^\/api\/admin\/payments\/(1|4)\/$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[4])
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, status: status[id], events: [{ type: status[id] }] }) })
      return
    }
    if (method === 'GET' && /^\/api\/admin\/clients\/(10|11)\/$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: { balance_minor: url.pathname.includes('/10/') ? -24000 : 0 } }) })
      return
    }
    if (url.pathname === '/api/admin/payments/') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paymentsPayload()) })
      return
    }
    const payload = routes[url.pathname]
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled smoke endpoint: ${url.pathname}` }),
    })
  })

  await page.goto('/')
  await expect(page.locator('main:visible')).toHaveCount(1)
  await expect(page.locator('h1.page-title', { hasText: 'Сегодня' })).toBeVisible()

  const counter = page.locator('.ops-nav-button[title="Платежи"] .ops-nav-count')
  await expect(counter).toHaveText('2')

  await openShellDestination(page, 'Платежи')
  await expect(page.locator('h1.page-title', { hasText: 'Платежи' })).toBeVisible()

  // Confirm is explicit on the pending card and requires no redundant second dialog.
  const compactPayments = (page.viewportSize()?.width || 0) <= 767
  const confirmSurface = compactPayments
    ? page.locator('.ops-payment-compact-card').filter({ hasText: 'Kowalski' })
    : page.getByRole('row', { name: /Kowalski/ })
  const confirmTrigger = confirmSurface.getByRole('button', { name: 'Подтвердить' })
  await confirmTrigger.click()
  await expect(page.getByText('Платёж подтверждён.')).toBeVisible()
  await expect(counter).toHaveText('1')

  // Reject requires a persisted audit reason: counter 1 -> 0.
  const rejectSurface = compactPayments
    ? page.locator('.ops-payment-compact-card').filter({ hasText: 'Nowak' })
    : page.getByRole('row', { name: /Nowak/ })
  await rejectSurface.getByRole('button', { name: 'Отклонить' }).click()
  const rejectDialog = page.getByRole('dialog', { name: 'Отклонить платёж' })
  await rejectDialog.getByLabel('Причина отклонения').fill('Перевод не найден')
  await rejectDialog.getByRole('button', { name: 'Отклонить' }).click()
  await expect(page.getByText('Платёж отклонён.')).toBeVisible()
  await expect(counter).toHaveText('0')

  expect(seen, 'confirm endpoint should be hit').toContain('/api/admin/payments/1/confirm/')
  expect(seen, 'reject endpoint should be hit').toContain('/api/admin/payments/4/reject/')
  expect(errors).toEqual([])
})
