import { expect, test } from '@playwright/test'


function json(route, payload, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
}

const trainers = [
  { id: 1, username: 'first-trainer', full_name: 'First Trainer', is_active: true },
  { id: 2, username: 'group-trainer', full_name: 'Group Trainer', is_active: true },
]

const locations = [
  { id: 11, name: 'Pool A', is_active: true },
  { id: 12, name: 'Pool B', is_active: true },
]

const groups = [
  {
    id: 21,
    name: 'Dolphins',
    description: '',
    default_trainer: { id: 2, name: 'Group Trainer' },
    default_location: { id: 12, name: 'Pool B', is_active: true },
    default_capacity: 8,
    participants_count: 0,
    price_minor: 6500,
    currency: 'PLN',
    color_key: null,
    is_active: true,
  },
  {
    id: 22,
    name: 'No defaults',
    description: '',
    default_trainer: null,
    default_location: null,
    default_capacity: null,
    participants_count: 0,
    price_minor: 7000,
    currency: 'PLN',
    color_key: null,
    is_active: true,
  },
]

async function mockAdmin(page, { onClientCreate, onGroupCreate, sessions = [] } = {}) {
  const sessionBodies = []
  const sessionPatchBodies = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/csrf/') return json(route, { csrf_token: 'test-csrf' })
    if (path === '/api/me/') return json(route, { id: 1, username: 'admin', role: 'admin', full_name: 'Admin' })
    if (path === '/api/admin/dashboard/') return json(route, { metrics: { clients: 0, active_subscriptions: 0, debtors: 0 } })
    if (path === '/api/admin/reference/') return json(route, {
      trainers,
      groups,
      subscription_types: [],
      locations,
      session_types: [],
      participants: [],
      choices: { payment_methods: [], notification_channels: [] },
      notification_settings: {},
    })
    if (path === '/api/admin/settings/session-types/') return json(route, {
      session_types: [
        { code: 'group', label: 'Групповое', default_capacity: 10, default_duration_minutes: 60 },
        { code: 'individual', label: 'Индивидуальное', default_capacity: 1, default_duration_minutes: 60 },
      ],
      pagination: { page: 1, page_size: 200, total: 2, pages: 1, has_next: false, has_previous: false },
    })
    if (path === '/api/admin/clients/' && request.method() === 'POST') return onClientCreate(route, request)
    if (path === '/api/admin/clients/') return json(route, {
      clients: [],
      pagination: { page: 1, page_size: 50, total: 0, pages: 0, has_next: false, has_previous: false },
    })
    if (path === '/api/admin/groups/' && request.method() === 'POST') return onGroupCreate(route, request)
    if (path === '/api/admin/groups/') return json(route, {
      groups,
      pagination: { page: 1, page_size: 50, total: groups.length, pages: 1, has_next: false, has_previous: false },
    })
    if (path === '/api/admin/schedule/check-conflict/' && request.method() === 'POST') {
      return json(route, { has_conflict: false, errors: {}, non_field_errors: [] })
    }
    const sessionMatch = path.match(/^\/api\/admin\/schedule\/sessions\/(\d+)\/$/)
    if (sessionMatch && request.method() === 'PATCH') {
      const body = request.postDataJSON()
      sessionPatchBodies.push(body)
      const original = sessions.find((session) => String(session.id) === sessionMatch[1]) || {}
      const selectedGroup = groups.find((group) => String(group.id) === String(body.group_id ?? original.group?.id))
      return json(route, {
        ...original,
        ...body,
        group: selectedGroup ? { id: selectedGroup.id, name: selectedGroup.name } : original.group,
        price_minor: selectedGroup?.price_minor ?? original.price_minor,
        currency: selectedGroup?.currency ?? original.currency,
      })
    }
    if (path === '/api/admin/schedule/sessions/' && request.method() === 'POST') {
      sessionBodies.push(request.postDataJSON())
      return json(route, { id: 501 }, 201)
    }
    if (path === '/api/admin/schedule/sessions/') return json(route, {
      sessions,
      pagination: { page: 1, page_size: 200, total: sessions.length, pages: sessions.length ? 1 : 0, has_next: false, has_previous: false },
    })
    return json(route, { error: `Unhandled endpoint: ${request.method()} ${path}` }, 404)
  })
  return { sessionBodies, sessionPatchBodies }
}

test('activation returns to login with canonical username and the new password without auto-login', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop activation contract is sufficient')
  const loginBodies = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/csrf/') return json(route, { csrf_token: 'test-csrf' })
    if (path === '/api/me/') return json(route, { error: 'Требуется вход' }, 403)
    if (path === '/api/auth/activate/') {
      expect(request.postDataJSON()).toEqual({ activation_token: 'one-time-code', password: 'new-password' })
      return json(route, { ok: true, login: 'canonical-login' })
    }
    if (path === '/api/auth/login/') {
      loginBodies.push(request.postDataJSON())
      return json(route, { error: 'Stop after request capture' }, 400)
    }
    return json(route, { error: `Unhandled endpoint: ${request.method()} ${path}` }, 404)
  })

  await page.goto('/')
  await page.getByTestId('auth-toggle-activation').click()
  await page.locator('#auth-activation-token').fill('one-time-code')
  await page.locator('#auth-password').fill('new-password')
  await page.getByTestId('auth-submit').click()

  await expect(page.locator('#auth-login')).toHaveValue('canonical-login')
  await expect(page.locator('#auth-password')).toHaveValue('new-password')
  expect(loginBodies).toHaveLength(0)

  await page.getByTestId('auth-submit').click()
  await expect.poll(() => loginBodies).toEqual([{ login: 'canonical-login', password: 'new-password' }])
})

test('new client keeps Instagram beside groups on desktop and below them on mobile', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'desktop and mobile form contracts')
  const createBodies = []
  await mockAdmin(page, {
    onClientCreate: async (route, request) => {
      createBodies.push(request.postDataJSON())
      if (createBodies.length === 1) return json(route, {
        error: 'Проверьте поля формы.',
        errors: {
          'account.instagram_username': [{ code: 'invalid', message: 'Недопустимое имя Instagram.' }],
        },
      }, 400)
      return json(route, { id: 100 }, 201)
    },
    onGroupCreate: (route) => json(route, { id: 100 }, 201),
  })

  await page.goto('/?role=admin&view=clients')
  await page.getByTestId('admin-clients-new-client').click()
  const modal = page.getByTestId('form-modal')
  await modal.locator('#admin-client-firstName').fill('Anna')
  await modal.locator('#admin-client-instagramUsername').fill('@Bad Name')

  const [groupBox, instagramBox] = await Promise.all([
    modal.locator('#admin-client-groupIds').boundingBox(),
    modal.locator('#admin-client-instagramUsername').locator('xpath=..').boundingBox(),
  ])
  if (page.viewportSize()?.width === 1440) {
    expect(Math.abs(groupBox.y - instagramBox.y)).toBeLessThan(4)
    expect(instagramBox.x).toBeGreaterThan(groupBox.x)
  } else {
    expect(instagramBox.y).toBeGreaterThanOrEqual(groupBox.y + groupBox.height)
  }

  await modal.getByTestId('admin-client-create-submit').click()
  await expect(modal.locator('#admin-client-instagramUsername')).toHaveAttribute('aria-invalid', 'true')
  await expect(modal.locator('#admin-client-instagramUsername')).toBeFocused()
  expect(createBodies[0].account.instagram_username).toBe('@Bad Name')

  await modal.locator('#admin-client-instagramUsername').fill('h2o_client')
  await expect(modal.locator('#admin-client-instagramUsername')).not.toHaveAttribute('aria-invalid', 'true')
  await modal.getByTestId('admin-client-create-submit').click()
  await expect(modal).toHaveCount(0)
  expect(createBodies[1].account.instagram_username).toBe('h2o_client')
})

test('group editor saves a default location and group sessions reapply all group defaults', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop group defaults contract is sufficient')
  const groupBodies = []
  const state = await mockAdmin(page, {
    onClientCreate: (route) => json(route, { id: 100 }, 201),
    onGroupCreate: (route, request) => {
      groupBodies.push(request.postDataJSON())
      return json(route, { id: 100 }, 201)
    },
  })

  await page.goto('/?role=admin&view=groups')
  await page.getByTestId('admin-group-create').click()
  const groupModal = page.getByTestId('form-modal')
  await groupModal.locator('#admin-group-name').fill('New group')
  await groupModal.locator('#admin-group-defaultTrainerId').selectOption('2')
  await groupModal.locator('#admin-group-defaultLocationId').selectOption('12')
  await groupModal.locator('.form-modal__footer button').last().click()
  await expect.poll(() => groupBodies.length).toBe(1)
  expect(groupBodies[0].default_trainer_id).toBe('2')
  expect(groupBodies[0].default_location_id).toBe('12')

  await page.goto('/?role=admin&view=schedule')
  await page.getByTestId('admin-schedule-create-group').click()
  const sessionModal = page.getByTestId('form-modal')
  const group = sessionModal.locator('#admin-session-groupId')
  const trainer = sessionModal.locator('#admin-session-trainerId')
  const location = sessionModal.locator('#admin-session-location')
  const capacity = sessionModal.locator('#admin-session-maxParticipants')

  await expect(group).toHaveValue('21')
  await expect(trainer).toHaveValue('2')
  await expect(location).toHaveValue('Pool B')
  await expect(capacity).toHaveValue('8')
  await expect(sessionModal.locator('.ops-session-price-hint')).toContainText('65 PLN')

  await trainer.selectOption('1')
  await location.selectOption('Pool A')
  await capacity.fill('5')
  await sessionModal.locator('#admin-session-notes').fill('manual values remain')
  await expect(trainer).toHaveValue('1')
  await expect(location).toHaveValue('Pool A')
  await expect(capacity).toHaveValue('5')

  await group.selectOption('22')
  await expect(trainer).toHaveValue('')
  await expect(location).toHaveValue('')
  await expect(capacity).toHaveValue('10')
  await expect(sessionModal.locator('.ops-session-price-hint')).toContainText('70 PLN')

  await group.selectOption('21')
  await expect(trainer).toHaveValue('2')
  await expect(location).toHaveValue('Pool B')
  await expect(capacity).toHaveValue('8')

  await sessionModal.locator('#admin-session-sessionType').selectOption('individual')
  await trainer.selectOption('1')
  await location.selectOption('Pool A')
  await capacity.fill('5')
  await sessionModal.locator('#admin-session-sessionType').selectOption('group')
  await expect(trainer).toHaveValue('2')
  await expect(location).toHaveValue('Pool B')
  await expect(capacity).toHaveValue('8')
  await expect(sessionModal.locator('.ops-session-price-hint')).toContainText('65 PLN')

  await group.selectOption('22')
  await trainer.selectOption('1')
  await location.selectOption('Pool A')
  await sessionModal.getByTestId('admin-schedule-create-submit').click()
  await expect.poll(() => state.sessionBodies).toHaveLength(1)
  expect(state.sessionBodies[0].group_id).toBe('22')
  expect(state.sessionBodies[0]).not.toHaveProperty('price_minor')
})

test('group session edit shows the selected group tariff as read-only and never posts a stale price', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop tariff edit contract is sufficient')
  const start = new Date(Date.now() + 60 * 60 * 1000)
  const end = new Date(start.getTime() + 45 * 60 * 1000)
  const state = await mockAdmin(page, {
    sessions: [{
      id: 901,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      session_type: 'group',
      trainer_id: 1,
      trainer: 'First Trainer',
      group: { id: 22, name: 'No defaults' },
      location: 'Pool A',
      max_participants: 10,
      participants_count: 0,
      price_minor: 6500,
      currency: 'PLN',
      is_cancelled: false,
      notes: '',
    }],
  })

  await page.goto('/?role=admin&view=schedule')
  const event = page.locator('.ops-schedule-event-wrap:visible').filter({ hasText: 'No defaults' }).first()
  await event.hover()
  await event.locator('.ops-schedule-event-edit').click()
  const editor = page.getByTestId('form-modal')
  const price = editor.locator('#admin-session-edit-price')
  await expect(price).toHaveValue('70')
  await expect(price).toHaveAttribute('readonly', '')
  await expect(editor.locator('.muted').filter({ hasText: '70 PLN' }).first()).toBeVisible()
  await editor.getByTestId('admin-schedule-edit-save').click()

  await expect.poll(() => state.sessionPatchBodies).toHaveLength(1)
  expect(state.sessionPatchBodies[0]).not.toHaveProperty('price_minor')
  expect(String(state.sessionPatchBodies[0].group_id)).toBe('22')
})
