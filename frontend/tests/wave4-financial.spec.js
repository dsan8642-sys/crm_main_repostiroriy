import { expect, test } from '@playwright/test'


const pagination = (total = 0, pageSize = 20) => ({
  page: 1,
  page_size: pageSize,
  total,
  pages: total ? 1 : 0,
  has_next: false,
  has_previous: false,
})

async function json(route, payload, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
}

function multipartValue(body, field) {
  const match = String(body || '').match(new RegExp(`name="${field}"\\r?\\n\\r?\\n([^\\r\\n]+)`))
  return match?.[1] || ''
}

async function mockClientFinance(page, { initialPayment = false } = {}) {
  let created = initialPayment
  let submitCount = 0
  const attemptKeys = []
  const participant = {
    id: 11,
    full_name: 'Алиса Клиент',
    birth_date: '2016-02-02',
    email: 'alice@example.test',
    group: { id: 2, name: 'Дельфины' },
    is_active: true,
    balance_minor: 5000,
  }
  const pendingPayment = {
    id: 91,
    student_id: 11,
    student: 'Алиса Клиент',
    amount_minor: 20050,
    currency: 'PLN',
    paid_at: '2026-08-15',
    method: 'bank_transfer',
    source: 'client_top_up',
    status: 'pending',
    affects_balance: false,
    events: [{ type: 'requested' }],
    receipt: { original_name: 'proof-with-a-very-long-descriptive-file-name-for-bank-transfer.pdf', download_url: '/api/documents/91/download/' },
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/me/') return json(route, { id: 3, username: 'client', role: 'parent', full_name: 'Елена Клиент' })
    if (path === '/api/client/overview/') return json(route, { account: { id: 20, username: 'client', full_name: 'Елена Клиент' }, participants: [participant] })
    if (path === '/api/client/profile/') return json(route, { account: { id: 20, username: 'client', full_name: 'Елена Клиент', first_name: 'Елена', last_name: 'Клиент' }, participants: [participant], subscriptions: [] })
    if (path === '/api/client/consents/') return json(route, { consents: [] })
    if (path === '/api/client/schedule/') return json(route, { student_id: 11, sessions: [] })
    if (path === '/api/client/notifications/') return json(route, { notifications: [], pagination: pagination(0, 200) })
    if (path === '/api/client/charges/') return json(route, {
      student_id: 11,
      summary: { unpaid_minor: 20000, overdue_count: 1, currency: 'PLN' },
      charges: [{ id: 5, student_id: 11, student: 'Алиса Клиент', description: 'Абонемент август', amount_minor: 20000, outstanding_minor: 20000, paid_minor: 0, due_date: '2026-08-01', status: 'overdue' }],
      pagination: pagination(1, Number(url.searchParams.get('page_size') || 20)),
    })
    if (path === '/api/client/payment-history/') return json(route, {
      student_id: 11,
      payments: created ? [pendingPayment] : [],
      pagination: pagination(created ? 1 : 0, Number(url.searchParams.get('page_size') || 20)),
    })
    if (path === '/api/client/payments/top-up-requests/' && request.method() === 'POST') {
      submitCount += 1
      attemptKeys.push(multipartValue(request.postData(), 'idempotency_key'))
      if (submitCount === 1) return json(route, { error: 'Синтетическая сетевая ошибка' }, 503)
      created = true
      return json(route, {
        top_up_request: { ...pendingPayment, idempotent_replay: true, balance_minor: 5000, audit_event: pendingPayment.events[0] },
        receipt: { id: 4, original_name: 'proof.pdf' },
      }, 200)
    }
    return json(route, { error: `Unhandled ${request.method()} ${path}` }, 404)
  })
  return { attemptKeys }
}

test('Wave 4 client mobile tabs preserve a failed form and reuse one safe-attempt key', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile financial tabs contract')
  const state = await mockClientFinance(page)
  await page.goto('/?role=client&view=payments')

  await expect(page.getByRole('tab', { name: 'Начисления' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('Сводка начислений')).toContainText('200,00 zł')
  await page.getByRole('tab', { name: 'Пополнить' }).click()
  await expect(page.getByText(/текущий баланс/)).toContainText('Алиса Клиент')

  await page.getByLabel('Сумма пополнения, zł').fill('200,505')
  await page.getByLabel('Файл подтверждения').setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') })
  await page.getByRole('button', { name: 'Отправить запрос' }).click()
  await expect(page.getByText(/не более двух знаков/)).toBeVisible()
  expect(state.attemptKeys).toHaveLength(0)

  await page.getByLabel('Сумма пополнения, zł').fill('200,50')
  await page.getByRole('button', { name: 'Отправить запрос' }).click()
  await expect(page.getByText('Синтетическая сетевая ошибка')).toBeVisible()
  await expect(page.getByLabel('Сумма пополнения, zł')).toHaveValue('200,50')
  await expect(page.getByLabel('Файл подтверждения')).toHaveValue(/proof\.pdf/)

  await page.getByRole('button', { name: 'Отправить запрос' }).click()
  await expect(page.getByText(/находится на проверке/)).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Пополнить' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('Сумма пополнения, zł')).toHaveValue('')
  expect(state.attemptKeys).toHaveLength(2)
  expect(state.attemptKeys[0]).toBeTruthy()
  expect(state.attemptKeys[1]).toBe(state.attemptKeys[0])
})

test('client payment history stays complete and horizontally reachable on tablet', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 768, 'tablet payment-history contract')
  await mockClientFinance(page, { initialPayment: true })
  await page.goto('/?role=client&view=payments')

  const region = page.getByRole('region', { name: 'История платежей' })
  await expect(region).toBeVisible()
  await expect(page.getByText('Прокрутите таблицу вправо, чтобы увидеть все столбцы.')).toBeVisible()

  const initialGeometry = await region.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect(initialGeometry.scrollWidth).toBeGreaterThan(initialGeometry.clientWidth)
  expect(initialGeometry.documentWidth).toBeLessThanOrEqual(initialGeometry.viewportWidth)

  await region.evaluate((node) => { node.scrollLeft = node.scrollWidth })
  const receipt = region.getByRole('button', { name: 'proof-with-a-very-long-descriptive-file-name-for-bank-transfer.pdf' })
  await receipt.focus()
  await expect(receipt).toBeFocused()
  const finalGeometry = await region.evaluate((node) => {
    const regionBox = node.getBoundingClientRect()
    const receiptBox = node.querySelector('button')?.getBoundingClientRect()
    return {
      receiptLeft: receiptBox?.left,
      receiptRight: receiptBox?.right,
      regionLeft: regionBox.left,
      regionRight: regionBox.right,
    }
  })
  expect(finalGeometry.receiptLeft).toBeGreaterThanOrEqual(finalGeometry.regionLeft)
  expect(finalGeometry.receiptRight).toBeLessThanOrEqual(finalGeometry.regionRight)
})

async function mockAdminDebt(page) {
  const participant = {
    id: 7, client_id: 10, client_name: 'Елена Клиент', first_name: 'Алиса', last_name: 'Клиент',
    full_name: 'Алиса Клиент', is_active: true, client_is_active: true, balance_minor: 12000, group: null,
  }
  const debtor = {
    student: { id: 7, client_id: 10, full_name: 'Алиса Клиент', client_phone: '+48111222333', group: null },
    reasons: ['Просроченное начисление'], balance_minor: 12000, days_overdue: 14,
    oldest_due_date: '2026-08-01', last_payment_at: '2026-07-01',
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/me/') return json(route, { id: 1, username: 'admin', role: 'admin', full_name: 'Администратор Wave 4' })
    if (path === '/api/admin/dashboard/') return json(route, { metrics: { clients: 1, active_subscriptions: 0, debtors: 1 } })
    if (path === '/api/admin/reference/') return json(route, { trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [participant], choices: { payment_methods: [] }, notification_settings: {} })
    if (path === '/api/admin/clients/') return json(route, { clients: [participant], pagination: pagination(1, 200) })
    if (path === '/api/admin/clients/10/') return json(route, {
      account: { id: 10, full_name: 'Елена Клиент', username: 'client', is_active: true },
      participants: [{ id: 7, full_name: 'Алиса Клиент', is_active: true, balance_minor: 12000 }],
      subscriptions: [], charges: [], payments: [], attendance: [], consents: [], summary: { balance_minor: 12000 },
    })
    if (path === '/api/admin/debtors/') return json(route, { debtors: [debtor], summary: { balance_minor: 12000 }, pagination: pagination(1, Number(url.searchParams.get('page_size') || 20)) })
    if (path === '/api/admin/settings/session-types/') return json(route, { session_types: [], pagination: pagination(0, 200) })
    if (path === '/api/admin/schedule/sessions/') return json(route, { sessions: [], pagination: pagination(0, 200) })
    if (path === '/api/admin/payments/') return json(route, { payments: [], pagination: pagination(0, 20) })
    if (path.startsWith('/api/admin/')) return json(route, { trainers: [], groups: [], subscription_types: [], sessions: [], debtors: [], logs: [], pagination: pagination(0, 200) })
    return json(route, { error: `Unhandled ${request.method()} ${path}` }, 404)
  })
}

test('Wave 4 debtor action opens an editable debt-prefilled balance form with full context', async ({ page }) => {
  await mockAdminDebt(page)
  await page.goto('/?role=admin&view=debtors')
  if ((page.viewportSize()?.width || 0) <= 767) {
    await page.getByRole('button', { name: 'Действия: Алиса Клиент' }).click()
    await page.getByRole('menuitem', { name: 'Внести оплату' }).click()
  } else {
    await page.locator('.ops-debt-balance-action').click()
  }
  const dialog = page.getByRole('dialog', { name: 'Пополнить баланс' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Контекст оплаты')).toContainText('Елена Клиент')
  await expect(dialog.getByLabel('Контекст оплаты')).toContainText('Алиса Клиент')
  await expect(dialog.getByLabel('Контекст оплаты')).toContainText(/−120,00\s*zł/)
  await expect(dialog.getByLabel('Сумма, zł')).toHaveValue('120.00')
  await dialog.getByLabel('Сумма, zł').fill('50,00')
  await expect(dialog.getByLabel('Сумма, zł')).toHaveValue('50,00')
  await page.locator('.form-modal-layer').click({ position: { x: 5, y: 5 } })
  await expect(dialog).toBeVisible()
})
