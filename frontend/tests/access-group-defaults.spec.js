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
    price_minor: null,
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
    price_minor: null,
    currency: 'PLN',
    color_key: null,
    is_active: true,
  },
]

async function mockAdmin(page, { onClientCreate, onGroupCreate } = {}) {
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
    if (path === '/api/admin/schedule/sessions/') return json(route, {
      sessions: [],
      pagination: { page: 1, page_size: 200, total: 0, pages: 0, has_next: false, has_previous: false },
    })
    return json(route, { error: `Unhandled endpoint: ${request.method()} ${path}` }, 404)
  })
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
  await page.getByRole('button', { name: 'У меня есть код доступа' }).click()
  await page.getByLabel('Одноразовый код доступа').fill('one-time-code')
  await page.getByLabel('Новый пароль').fill('new-password')
  await page.getByRole('button', { name: 'Установить новый пароль' }).click()

  await expect(page.getByLabel('Логин, email или телефон')).toHaveValue('canonical-login')
  await expect(page.locator('#auth-password')).toHaveValue('new-password')
  expect(loginBodies).toHaveLength(0)

  await page.getByRole('button', { name: 'Войти' }).click()
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
  await page.getByRole('button', { name: /^Новый клиент/ }).click()
  const modal = page.getByRole('dialog', { name: 'Новый клиент' })
  await modal.getByLabel('Имя владельца аккаунта').fill('Anna')
  await modal.getByLabel('Instagram').fill('@Bad Name')

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

  await modal.getByRole('button', { name: 'Создать клиента' }).click()
  await expect(modal.getByText('Недопустимое имя Instagram.', { exact: true })).toBeVisible()
  await expect(modal.getByLabel('Instagram')).toBeFocused()
  expect(createBodies[0].account.instagram_username).toBe('@Bad Name')

  await modal.getByLabel('Instagram').fill('h2o_client')
  await expect(modal.getByText('Недопустимое имя Instagram.', { exact: true })).toHaveCount(0)
  await modal.getByRole('button', { name: 'Создать клиента' }).click()
  await expect(modal).toHaveCount(0)
  expect(createBodies[1].account.instagram_username).toBe('h2o_client')
})

test('group editor saves a default location and group sessions reapply all group defaults', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop group defaults contract is sufficient')
  const groupBodies = []
  await mockAdmin(page, {
    onClientCreate: (route) => json(route, { id: 100 }, 201),
    onGroupCreate: (route, request) => {
      groupBodies.push(request.postDataJSON())
      return json(route, { id: 100 }, 201)
    },
  })

  await page.goto('/?role=admin&view=groups')
  await page.getByRole('button', { name: 'Новая группа' }).click()
  const groupModal = page.getByRole('dialog', { name: 'Новая группа' })
  await groupModal.getByLabel('Название').fill('New group')
  await groupModal.getByLabel('Тренер по умолчанию').selectOption('2')
  await groupModal.getByLabel('Локация по умолчанию').selectOption('12')
  await groupModal.getByRole('button', { name: 'Сохранить' }).click()
  await expect.poll(() => groupBodies.length).toBe(1)
  expect(groupBodies[0].default_trainer_id).toBe('2')
  expect(groupBodies[0].default_location_id).toBe('12')

  await page.goto('/?role=admin&view=schedule')
  await page.getByRole('button', { name: 'Групповая тренировка' }).click()
  const sessionModal = page.getByRole('dialog', { name: 'Новое занятие' })
  const group = sessionModal.getByLabel('Группа')
  const trainer = sessionModal.getByLabel('Тренер')
  const location = sessionModal.getByLabel('Локация')
  const capacity = sessionModal.getByLabel('Лимит участников')

  await expect(group).toHaveValue('21')
  await expect(trainer).toHaveValue('2')
  await expect(location).toHaveValue('Pool B')
  await expect(capacity).toHaveValue('8')

  await trainer.selectOption('1')
  await location.selectOption('Pool A')
  await capacity.fill('5')
  await sessionModal.getByLabel('Заметки').fill('manual values remain')
  await expect(trainer).toHaveValue('1')
  await expect(location).toHaveValue('Pool A')
  await expect(capacity).toHaveValue('5')

  await group.selectOption('22')
  await expect(trainer).toHaveValue('')
  await expect(location).toHaveValue('')
  await expect(capacity).toHaveValue('10')

  await group.selectOption('21')
  await expect(trainer).toHaveValue('2')
  await expect(location).toHaveValue('Pool B')
  await expect(capacity).toHaveValue('8')

  await sessionModal.getByLabel('Тип занятия').selectOption('individual')
  await trainer.selectOption('1')
  await location.selectOption('Pool A')
  await capacity.fill('5')
  await sessionModal.getByLabel('Тип занятия').selectOption('group')
  await expect(trainer).toHaveValue('2')
  await expect(location).toHaveValue('Pool B')
  await expect(capacity).toHaveValue('8')
})
