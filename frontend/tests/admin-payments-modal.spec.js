import { expect, test } from '@playwright/test'

const PARTICIPANTS = [
  {
    id: 1, client_id: 101, first_name: 'Anna', last_name: 'NoSub',
    client_phone: '+48111111111', email: 'anna@example.test',
    is_active: true, client_is_active: true, group: null,
  },
  {
    id: 2, client_id: 102, first_name: 'Borys', last_name: 'HasSub',
    client_phone: '+48222222222', email: 'borys@example.test',
    is_active: true, client_is_active: true, group: null,
  },
]

function bootstrapRoutes(payments = []) {
  return {
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/health/': { status: 'ok', service: 'swimcrm' },
    '/api/csrf/': { ok: true },
    '/api/admin/dashboard/': { metrics: { clients: 2, active_subscriptions: 1, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [],
      choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
    },
    '/api/admin/clients/': { clients: PARTICIPANTS },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups: [] },
    '/api/admin/subscription-types/': {
      subscription_types: [{
        id: 7, name: '8 занятий', price_minor: 24000, currency: 'PLN',
        duration_days: 30, sessions_count: 8, is_unlimited: false,
        is_individual: false, is_active: true,
      }],
    },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': { sessions: [] },
    '/api/admin/payments/': { payments },
    '/api/admin/debtors/': { debtors: [] },
  }
}

async function mockPayments(page, {
  payments = [],
  subscriptions = { 1: [], 2: [] },
  delayParticipantId = null,
} = {}) {
  const routes = bootstrapRoutes(payments)
  let releaseDelayed
  const delayed = new Promise((resolve) => { releaseDelayed = resolve })
  const requests = []
  const paymentEdits = []

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const subscriptionMatch = path.match(/^\/api\/admin\/participants\/(\d+)\/subscriptions\/$/)

    if (subscriptionMatch && method === 'GET') {
      const participantId = Number(subscriptionMatch[1])
      if (participantId === delayParticipantId) await delayed
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ subscriptions: subscriptions[participantId] || [] }),
      })
      return
    }
    if (/^\/api\/admin\/subscriptions\/\d+\/renew\/$/.test(path) && method === 'POST') {
      requests.push({ path, body: request.postDataJSON() })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ subscription: { id: Number(path.split('/')[4]) } }),
      })
      return
    }
    if (/^\/api\/admin\/payments\/\d+\/$/.test(path) && method === 'POST') {
      paymentEdits.push({ path, body: request.postDataJSON() })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      return
    }

    const payload = routes[path]
    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled payments endpoint: ${method} ${path}` }),
    })
  })

  return { requests, paymentEdits, releaseDelayed }
}

test('subscription operations can target a client other than the first', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop finance contract check is sufficient')
  const targetSubscription = { id: 22, type: '8 занятий', status: 'active', remaining_sessions: 8 }
  const mock = await mockPayments(page, {
    subscriptions: { 1: [], 2: [targetSubscription] },
    delayParticipantId: 2,
  })

  await page.goto('/?role=admin&view=payments')
  await page.getByRole('button', { name: /Баланс клиента/ }).click()

  const renewLauncher = page.getByRole('button', { name: 'Продлить', exact: true })
  await expect(renewLauncher).toBeEnabled()
  await renewLauncher.click()

  const modal = page.getByRole('dialog', { name: 'Продлить абонемент' })
  await expect(modal).toBeVisible()
  await modal.getByRole('combobox', { name: 'Участник', exact: true }).fill('Borys')
  await modal.getByRole('option', { name: /HasSub Borys/ }).click()

  const subscriptionSelect = modal.getByLabel('Абонемент участника')
  const submit = modal.getByRole('button', { name: 'Продлить', exact: true })
  await expect(subscriptionSelect).toHaveValue('')
  await expect(subscriptionSelect).toBeDisabled()
  await expect(submit).toBeDisabled()
  expect(mock.requests).toEqual([])

  mock.releaseDelayed()
  await expect(subscriptionSelect).toHaveValue('22')
  await expect(subscriptionSelect).toBeEnabled()
  await expect(submit).toBeEnabled()
  await submit.click()

  await expect.poll(() => mock.requests).toHaveLength(1)
  expect(mock.requests[0].path).toBe('/api/admin/subscriptions/22/renew/')
})

test('switching the finance participant clears the previous subscription before the new request finishes', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop stale-subscription contract check is sufficient')
  const oldSubscription = { id: 11, type: 'Old', status: 'active', remaining_sessions: 1 }
  const targetSubscription = { id: 22, type: 'Target', status: 'active', remaining_sessions: 8 }
  const mock = await mockPayments(page, {
    subscriptions: { 1: [oldSubscription], 2: [targetSubscription] },
    delayParticipantId: 2,
  })

  await page.goto('/?role=admin&view=payments')
  await page.getByRole('button', { name: /Баланс клиента/ }).click()
  await page.getByRole('button', { name: 'Продлить', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Продлить абонемент' })
  const subscriptionSelect = modal.getByLabel('Абонемент участника')
  await expect(subscriptionSelect).toHaveValue('11')

  await modal.getByRole('combobox', { name: 'Участник', exact: true }).fill('Borys')
  await modal.getByRole('option', { name: /HasSub Borys/ }).click()
  try {
    await expect(subscriptionSelect).toHaveValue('')
    await expect(subscriptionSelect).toBeDisabled()
    await expect(modal.getByRole('button', { name: 'Продлить', exact: true })).toBeDisabled()
    expect(mock.requests).toEqual([])
  } finally {
    mock.releaseDelayed()
  }

  await expect(subscriptionSelect).toHaveValue('22')
  await modal.getByRole('button', { name: 'Продлить', exact: true }).click()
  await expect.poll(() => mock.requests).toHaveLength(1)
  expect(mock.requests[0].path).toBe('/api/admin/subscriptions/22/renew/')
})

test('payment editor keeps the comment separate from the receipt filename', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop payment-edit contract check is sufficient')
  const mock = await mockPayments(page, {
    payments: [{
      id: 55,
      participant_id: 1,
      participant: 'NoSub Anna',
      amount_minor: 12500,
      currency: 'PLN',
      method: 'cash',
      source: 'manual',
      affects_balance: true,
      paid_at: '2026-08-01',
      status: 'pending',
      comment: 'bank note',
      receipt: { original_name: 'proof.pdf', download_url: '/files/proof.pdf' },
    }],
  })

  await page.goto('/?role=admin&view=payments')
  await expect(page.getByRole('link', { name: /proof\.pdf/ })).toBeVisible()
  await page.getByRole('button', { name: 'Изменить', exact: true }).click()

  const modal = page.getByRole('dialog', { name: 'Изменить реквизиты платежа' })
  await expect(modal.getByLabel('Комментарий')).toHaveValue('bank note')
  await modal.getByLabel('Способ оплаты').selectOption('card')
  await modal.getByRole('button', { name: 'Сохранить изменение' }).click()

  await expect.poll(() => mock.paymentEdits).toHaveLength(1)
  expect(mock.paymentEdits[0]).toEqual({
    path: '/api/admin/payments/55/',
    body: { method: 'card', comment: 'bank note' },
  })
  await expect(page.getByRole('link', { name: /proof\.pdf/ })).toBeVisible()
})
