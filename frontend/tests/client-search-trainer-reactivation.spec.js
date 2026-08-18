import { expect, test } from '@playwright/test'

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

test('remote participant search and trainer reactivation remain available', async ({ page }) => {
  const initialParticipant = {
    id: 1,
    client_id: 10,
    first_name: 'Initial',
    last_name: 'Participant',
    full_name: 'Initial Participant',
    is_active: true,
    client_is_active: true,
    group: null,
  }
  const remoteParticipant = {
    id: 101,
    client_id: 110,
    first_name: 'Remote',
    last_name: 'Participant',
    full_name: 'Remote Participant',
    is_active: true,
    client_is_active: true,
    group: null,
  }
  let trainerUpdate = null
  const trainerAccessActions = []

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/me/') return json(route, { id: 1, username: 'admin', role: 'admin', full_name: 'Admin' })
    if (path === '/api/csrf/') return json(route, { csrf_token: 'test-token' })
    if (path === '/api/admin/dashboard/') return json(route, { metrics: {} })
    if (path === '/api/admin/settings/session-types/') return json(route, { session_types: [] })
    if (path === '/api/admin/payments/') return json(route, { payments: [], pagination: { total: 0 } })
    if (path === '/api/admin/debtors/') return json(route, { debtors: [], pagination: { total: 0 } })
    if (path === '/api/admin/clients/') return json(route, { clients: [], pagination: { total: 315 } })
    if (path === '/api/admin/schedule/sessions/') return json(route, { sessions: [], pagination: { total: 0 } })
    if (path === '/api/admin/reference/') {
      const participants = url.searchParams.get('q') ? [remoteParticipant] : [initialParticipant]
      return json(route, {
        trainers: [], groups: [], subscription_types: [], locations: [],
        participants, choices: { session_types: [] },
      })
    }
    if (path === '/api/admin/trainers/' && request.method() === 'GET') {
      return json(route, {
        trainers: [{
          id: 7,
          username: 'inactive-trainer',
          full_name: 'Inactive Trainer',
          email: 'inactive@example.com',
          phone: '+48000000000',
          is_active: false,
          user_is_active: false,
          groups_count: 0,
          portal_access: 'revoked',
        }],
        pagination: { total: 1, page: 1, pages: 1, has_next: false, has_previous: false },
      })
    }
    if (path === '/api/admin/trainers/7/' && request.method() === 'POST') {
      trainerUpdate = request.postDataJSON()
      return json(route, {
        id: 7,
        username: 'inactive-trainer',
        full_name: 'Inactive Trainer',
        email: 'inactive@example.com',
        phone: '+48000000000',
        is_active: true,
        user_is_active: true,
        groups_count: 0,
        portal_access: 'revoked',
      })
    }
    if (path === '/api/admin/trainers/7/access/restore/' && request.method() === 'POST') {
      trainerAccessActions.push('restore')
      return json(route, {
        purpose: 'activation',
        login: 'inactive-trainer',
        activation_code: 'trainer-activation-code',
        expires_at: '2026-08-17T12:00:00+02:00',
      }, 201)
    }
    if (path === '/api/admin/trainers/7/access/revoke/' && request.method() === 'POST') {
      trainerAccessActions.push('revoke')
      return json(route, { portal_access: 'revoked' })
    }
    return json(route, { error: `Unhandled test endpoint: ${request.method()} ${path}` }, 404)
  })

  await page.goto('/?role=admin&view=schedule')
  await expect(page.locator('h1.page-title', { hasText: 'Расписание' })).toBeVisible()
  if ((page.viewportSize()?.width || 0) >= 960) {
    await expect(page.getByRole('button', { name: 'Клиенты 315' })).toBeVisible()
  }

  if ((page.viewportSize()?.width || 0) <= 767) {
    await page.getByRole('button', { name: 'Открыть глобальный поиск' }).click()
  }
  await page.getByRole('textbox', { name: 'Глобальный поиск', exact: true }).fill('Remote Participant')
  await expect(page.getByRole('button', { name: /Remote Participant/ })).toBeVisible()

  if ((page.viewportSize()?.width || 0) <= 767) {
    await page.getByRole('button', { name: 'Закрыть поиск' }).click()
  } else {
    await page.getByRole('textbox', { name: 'Глобальный поиск', exact: true }).fill('')
  }
  await page.getByRole('button', { name: 'Индивидуальная тренировка' }).click()
  const sessionDialog = page.getByRole('dialog', { name: 'Новое занятие' })
  await sessionDialog.getByRole('combobox', { name: 'Участник' }).fill('Remote Participant')
  await expect(sessionDialog.getByRole('option', { name: /Participant Remote/ })).toBeVisible()
  await sessionDialog.getByRole('contentinfo').getByRole('button', { name: 'Закрыть', exact: true }).click()

  if ((page.viewportSize()?.width || 0) <= 767) {
    await page.getByRole('button', { name: 'Открыть меню' }).click()
  }
  await page.getByRole('button', { name: /^Тренеры/ }).click()
  await expect(page.locator('h1.page-title', { hasText: 'Тренеры' })).toBeVisible()
  await page.getByRole('button', { name: /Inactive Trainer/ }).first().click()
  await page.getByRole('button', { name: 'Редактировать' }).click()

  const trainerDialog = page.getByRole('dialog', { name: 'Редактирование профиля' })
  const activeCheckbox = trainerDialog.getByRole('checkbox', { name: 'Активен' })
  await expect(activeCheckbox).toBeVisible()
  await expect(activeCheckbox).not.toBeChecked()
  await activeCheckbox.check()
  await trainerDialog.getByRole('button', { name: 'Сохранить' }).click()

  await expect.poll(() => trainerUpdate).not.toBeNull()
  expect(trainerUpdate.trainer.is_active).toBe(true)
  expect(trainerUpdate.trainer.user_is_active).toBe(true)

  await page.getByRole('button', { name: 'Вернуть доступ' }).click()
  await expect(page.getByText('trainer-activation-code')).toBeVisible()
  await page.getByRole('button', { name: 'Отозвать доступ' }).click()
  await expect.poll(() => trainerAccessActions).toEqual(['restore', 'revoke'])
})

test('global client search retargets payments to the newly opened client', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop identity regression check is sufficient')

  const clients = [
    {
      id: 101, client_id: 10, first_name: 'Previous', last_name: 'Client',
      full_name: 'Previous Client', client_name: 'Previous Account',
      client_phone: '+48111111111', is_active: true, client_is_active: true, group: null,
    },
    {
      id: 202, client_id: 20, first_name: 'Current', last_name: 'Client',
      full_name: 'Current Client', client_name: 'Current Account',
      client_phone: '+48222222222', is_active: true, client_is_active: true, group: null,
    },
  ]
  let submittedPayment = null
  let submittedChargePath = null
  let submittedCharge = null

  const clientDetail = (clientId) => {
    const participant = clients.find((row) => row.client_id === clientId)
    return {
      account: {
        id: clientId, full_name: participant.client_name, username: `client-${clientId}`,
        phone: participant.client_phone, is_active: true,
      },
      participants: [{ ...participant, balance_minor: 0 }],
      subscriptions: [], charges: [], payments: [], attendance: [], consents: [],
      summary: { balance_minor: 0, pending_payments: 0 },
    }
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/me/') return json(route, { id: 1, username: 'admin', role: 'admin', full_name: 'Admin' })
    if (path === '/api/csrf/') return json(route, { csrf_token: 'test-token' })
    if (path === '/api/admin/dashboard/') return json(route, { metrics: {} })
    if (path === '/api/admin/reference/') {
      return json(route, {
        trainers: [], groups: [], subscription_types: [], locations: [],
        participants: clients, choices: { session_types: [] },
      })
    }
    if (path === '/api/admin/clients/') return json(route, { clients, pagination: { total: 2 } })
    if (path === '/api/admin/clients/10/') return json(route, clientDetail(10))
    if (path === '/api/admin/clients/20/') return json(route, clientDetail(20))
    if (path === '/api/admin/payments/' && request.method() === 'POST') {
      submittedPayment = request.postDataJSON()
      return json(route, { id: 501, status: 'confirmed' }, 201)
    }
    if (path === '/api/admin/payments/501/') {
      return json(route, { id: 501, status: 'confirmed', events: [{ type: 'confirmed' }] })
    }
    if (/^\/api\/admin\/participants\/\d+\/charges\/$/.test(path) && request.method() === 'POST') {
      submittedChargePath = path
      submittedCharge = request.postDataJSON()
      return json(route, { id: 601 }, 201)
    }
    if (path === '/api/admin/payments/') return json(route, { payments: [], pagination: { total: 0 } })
    if (path === '/api/admin/debtors/') return json(route, { debtors: [], pagination: { total: 0 } })
    if (path === '/api/admin/settings/session-types/') return json(route, { session_types: [] })
    if (path === '/api/admin/schedule/sessions/') return json(route, { sessions: [], pagination: { total: 0 } })
    if (path.startsWith('/api/admin/')) {
      return json(route, { trainers: [], groups: [], subscription_types: [], pagination: { total: 0 } })
    }
    return json(route, { error: `Unhandled test endpoint: ${request.method()} ${path}` }, 404)
  })

  await page.goto('/?role=admin&view=clientDetail&client=10')
  await expect(page.locator('h1.page-title', { hasText: 'Previous Account' })).toBeVisible()

  await page.getByRole('textbox', { name: 'Глобальный поиск', exact: true }).fill('Current Client')
  await page.getByRole('button', { name: /Current Client/ }).click()
  await expect(page.locator('h1.page-title', { hasText: 'Current Account' })).toBeVisible()
  await expect(page).toHaveURL(/client=20/)

  await page.getByRole('button', { name: 'Пополнить баланс' }).click()
  const dialog = page.getByRole('dialog', { name: 'Пополнить баланс' })
  await expect(dialog.getByLabel('Контекст оплаты')).toContainText('Current Account')
  await dialog.getByLabel('Сумма, zł').fill('100')
  await dialog.getByRole('button', { name: 'Подтвердить оплату' }).click()

  await expect.poll(() => submittedPayment?.participant_id).toBe('202')
  expect(submittedPayment.client_id).toBe(20)

  await page.getByRole('button', { name: 'Добавить списание' }).click()
  const chargeDialog = page.getByRole('dialog', { name: 'Новое списание' })
  await chargeDialog.getByLabel('Описание').fill('Проверка клиента')
  await chargeDialog.getByLabel('Сумма', { exact: true }).fill('25')
  await chargeDialog.getByRole('button', { name: 'Сохранить' }).click()

  await expect.poll(() => submittedChargePath).toBe('/api/admin/participants/202/charges/')
  expect(submittedCharge.client_id).toBe(20)
})

test('client profile exposes contact links and opens routed individual and split forms', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'desktop and mobile profile flows are sufficient')

  const participant = {
    id: 202,
    client_id: 20,
    first_name: 'Current',
    last_name: 'Swimmer',
    full_name: 'Swimmer Current',
    client_name: 'Current Account',
    client_phone: '+48 222 333 444',
    is_active: true,
    client_is_active: true,
    groups: [
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Beta' },
      { id: 3, name: 'Gamma' },
    ],
    group: null,
  }
  let contactMode = 'valid'

  const detail = () => ({
    account: {
      id: 20,
      full_name: 'Current Account',
      username: 'current-account',
      phone: contactMode === 'invalid' ? '222333444' : '+48 222 333 444',
      email: 'current@example.test',
      instagram_username: ['valid', 'archived'].includes(contactMode) ? 'h2o_client' : '',
      telegram_chat_id: 'bot-link-id',
      is_active: !['archived', 'anonymized'].includes(contactMode),
      is_anonymized: contactMode === 'anonymized',
      portal_access: 'active',
      access_activated: true,
    },
    participants: [{
      ...participant,
      is_active: !['archived', 'anonymized'].includes(contactMode),
      balance_minor: 0,
    }],
    subscriptions: [], charges: [], payments: [], attendance: [], consents: [],
    summary: { participants_count: 1, active_participants: 1, balance_minor: 0, pending_payments: 0 },
  })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/me/') return json(route, { id: 1, username: 'admin', role: 'admin', full_name: 'Admin' })
    if (path === '/api/csrf/') return json(route, { csrf_token: 'test-token' })
    if (path === '/api/admin/dashboard/') return json(route, { metrics: {} })
    if (path === '/api/admin/reference/') {
      return json(route, {
        trainers: [{ id: 7, full_name: 'Coach Test', is_active: true, user_is_active: true }],
        groups: [
          { id: 1, name: 'Alpha', is_active: true },
          { id: 2, name: 'Beta', is_active: true },
          { id: 3, name: 'Gamma', is_active: true },
        ],
        subscription_types: [],
        locations: [{ id: 1, code: 'pool', name: 'Pool A' }],
        participants: [participant],
        choices: {
          session_types: [
            { value: 'group', label: 'Групповое', default_capacity: 10 },
            { value: 'individual', label: 'Индивидуальное', default_capacity: 1 },
            { value: 'split', label: 'Сплит', default_capacity: 2 },
          ],
        },
      })
    }
    if (path === '/api/admin/clients/') {
      return json(route, { clients: [participant], pagination: { total: 1 } })
    }
    if (path === '/api/admin/clients/20/') return json(route, detail())
    if (path === '/api/admin/schedule/sessions/') {
      return json(route, { sessions: [], pagination: { total: 0 } })
    }
    if (path === '/api/admin/settings/session-types/') return json(route, { session_types: [] })
    if (path === '/api/admin/payments/') return json(route, { payments: [], pagination: { total: 0 } })
    if (path === '/api/admin/debtors/') return json(route, { debtors: [], pagination: { total: 0 } })
    if (path.startsWith('/api/admin/')) {
      return json(route, { trainers: [], groups: [], subscription_types: [], pagination: { total: 0 } })
    }
    return json(route, { error: `Unhandled test endpoint: ${request.method()} ${path}` }, 404)
  })

  await page.goto('/?role=admin&view=clientDetail&client=20')
  await expect(page.getByRole('link', { name: 'Telegram' })).toHaveAttribute('href', 'https://t.me/+48222333444')
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/48222333444')
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://instagram.com/h2o_client')
  await expect(page.getByRole('cell', { name: 'Alpha, Beta, Gamma' })).toBeVisible()

  await page.getByRole('button', { name: 'Индивидуальная', exact: true }).click()
  await expect(page).toHaveURL(/view=schedule.*participant=202.*createSession=individual/)
  let sessionDialog = page.getByRole('dialog', { name: 'Новое занятие' })
  await expect(sessionDialog.getByRole('combobox', { name: 'Участник' })).toHaveValue('Swimmer Current')

  await page.goto('/?role=admin&view=clientDetail&client=20')
  await page.getByRole('button', { name: 'Сплит', exact: true }).click()
  await expect(page).toHaveURL(/view=schedule.*participant=202.*createSession=split/)
  sessionDialog = page.getByRole('dialog', { name: 'Новое занятие' })
  await expect(sessionDialog.getByRole('combobox', { name: 'Клиент 1' })).toHaveValue('Swimmer Current')
  await expect(sessionDialog.getByRole('combobox', { name: 'Клиент 2', exact: true })).toBeVisible()

  contactMode = 'invalid'
  await page.goto('/?role=admin&view=clientDetail&client=20')
  await expect(page.getByText('Telegram', { exact: true })).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('WhatsApp', { exact: true })).toHaveAttribute('title', 'Добавьте номер телефона в международном формате')
  await expect(page.getByText('Instagram', { exact: true })).toHaveAttribute('aria-disabled', 'true')

  contactMode = 'archived'
  await page.goto('/?role=admin&view=clientDetail&client=20')
  await expect(page.getByRole('link', { name: 'Telegram' })).toHaveAttribute('href', 'https://t.me/+48222333444')
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://instagram.com/h2o_client')

  contactMode = 'anonymized'
  await page.goto('/?role=admin&view=clientDetail&client=20')
  await expect(page.getByLabel('Связаться с клиентом')).toHaveCount(0)
})
