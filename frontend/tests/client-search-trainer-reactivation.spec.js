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
  const scaleParticipants = Array.from({ length: 400 }, (_, index) => ({
    id: 1000 + index,
    client_id: 2000 + index,
    first_name: `Client${String(index).padStart(3, '0')}`,
    last_name: 'ScaleSearch',
    full_name: `ScaleSearch Client${String(index).padStart(3, '0')}`,
    is_active: true,
    client_is_active: true,
    group: null,
  }))
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
      const query = url.searchParams.get('q')
      const participants = query === 'ScaleSearch'
        ? scaleParticipants
        : query ? [remoteParticipant] : [initialParticipant]
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
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  if ((page.viewportSize()?.width || 0) >= 960) {
    await expect(page.getByTestId('nav-admin-clients')).toBeVisible()
  }

  if ((page.viewportSize()?.width || 0) <= 767) {
    await page.getByTestId('open-global-search').click()
  }
  const globalSearch = page.getByTestId('global-search-input')
  await globalSearch.fill('ScaleSearch')
  const globalResults = (page.viewportSize()?.width || 0) <= 767
    ? page.locator('.ops-mobile-search-results button')
    : page.locator('.ops-search-results button')
  await expect(globalResults).toHaveCount(400)
  await globalSearch.fill('Remote Participant')
  await expect(page.getByRole('button', { name: /Remote Participant/ })).toBeVisible()
  await globalSearch.fill('Account Owner')
  await expect(page.getByRole('button', { name: /Remote Participant/ })).toBeVisible()

  if ((page.viewportSize()?.width || 0) <= 767) {
    await page.getByTestId('open-global-search').click()
  } else {
    await page.getByTestId('global-search-input').fill('')
  }
  await page.getByTestId('admin-schedule-create-individual').click()
  const sessionDialog = page.getByTestId('form-modal')
  const participantInput = sessionDialog.locator('#admin-session-participantId')
  if ((page.viewportSize()?.width || 0) >= 960) {
    await participantInput.fill('ScaleSearch')
    const resultList = sessionDialog.locator('.ops-search-select-list')
    await expect(resultList.getByRole('option')).toHaveCount(400)
    const inputBox = await participantInput.boundingBox()
    const listBox = await resultList.boundingBox()
    expect(inputBox).not.toBeNull()
    expect(listBox).not.toBeNull()
    expect(listBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height)
  }
  await participantInput.fill('Remote Participant')
  await expect(sessionDialog.getByRole('option', { name: /Participant Remote/ })).toBeVisible()
  await participantInput.fill('Account Owner')
  await expect(sessionDialog.getByRole('option', { name: /Participant Remote/ })).toBeVisible()
  await sessionDialog.getByTestId('form-modal-close').click()

  if ((page.viewportSize()?.width || 0) <= 767) {
    await page.getByTestId('open-menu').click()
  }
  const trainerNav = (page.viewportSize()?.width || 0) <= 767
    ? page.getByTestId('mobile-menu-dialog').getByTestId('nav-admin-trainers')
    : page.locator('.ops-sidebar').getByTestId('nav-admin-trainers')
  await trainerNav.click()
  await expect(page).toHaveURL(/view=trainers/)
  await page.getByRole('button', { name: /Inactive Trainer/ }).first().click()
  await page.getByTestId('admin-trainer-edit').click()

  const trainerDialog = page.getByTestId('form-modal')
  const activeCheckbox = trainerDialog.locator('#admin-trainer-active')
  await expect(activeCheckbox).toBeVisible()
  await expect(activeCheckbox).not.toBeChecked()
  await activeCheckbox.check()
  await trainerDialog.getByTestId('admin-trainer-save').click()

  await expect.poll(() => trainerUpdate).not.toBeNull()
  expect(trainerUpdate.trainer.is_active).toBe(true)
  expect(trainerUpdate.trainer.user_is_active).toBe(true)

  await page.getByTestId('client-access-restore').click()
  await expect(page.getByText('trainer-activation-code')).toBeVisible()
  await page.getByTestId('client-access-revoke').click()
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

  await page.getByTestId('global-search-input').fill('Current Client')
  await page.getByRole('button', { name: /Current Client/ }).click()
  await expect(page.locator('h1.page-title', { hasText: 'Current Account' })).toBeVisible()
  await expect(page).toHaveURL(/client=20/)

  await page.getByTestId('admin-client-action-payment').click()
  const dialog = page.getByTestId('form-modal')
  await expect(dialog.locator('.ops-financial-context')).toContainText('Current Account')
  await dialog.locator('#admin-client-payment-amount').fill('100')
  await dialog.getByTestId('admin-client-payment-confirm').click()

  await expect.poll(() => submittedPayment?.participant_id).toBe('202')
  expect(submittedPayment.client_id).toBe(20)

  await page.getByTestId('admin-client-action-charge').click()
  const chargeDialog = page.getByTestId('form-modal')
  await chargeDialog.locator('#admin-client-finance-description').fill('Проверка клиента')
  await chargeDialog.locator('#admin-client-finance-amount').fill('25')
  await chargeDialog.getByTestId('admin-client-finance-save').click()

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
  const referenceParticipants = [
    ...Array.from({ length: 399 }, (_, index) => ({
      id: 1000 + index,
      client_id: 2000 + index,
      first_name: `Scale${String(index).padStart(3, '0')}`,
      last_name: 'Participant',
      full_name: `Participant Scale${String(index).padStart(3, '0')}`,
      is_active: true,
      client_is_active: true,
      group: null,
    })),
    participant,
  ]
  let contactMode = 'valid'
  let subscriptionEndDate = '2026-09-26'
  let subscriptionEditPayload = null

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
      balance_minor: 5000,
    }],
    subscriptions: [{
      id: 77,
      participant_id: 202,
      subscription_type_id: 9,
      type: 'Demo Безлимит',
      start_date: '2026-08-26',
      effective_end_date: subscriptionEndDate,
      created_at: '2026-09-15T10:00:00+02:00',
      remaining_sessions: null,
      status: 'active',
    }], charges: [], payments: [], attendance: [], consents: [],
    summary: { participants_count: 1, active_participants: 1, balance_minor: 5000, pending_payments: 0 },
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
        participants: referenceParticipants,
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
    if (path === '/api/admin/subscriptions/77/' && request.method() === 'POST') {
      subscriptionEditPayload = request.postDataJSON()
      subscriptionEndDate = subscriptionEditPayload.effective_end_date
      return json(route, {
        ...detail().subscriptions[0],
        base_end_date: subscriptionEndDate,
        effective_end_date: subscriptionEndDate,
        freezes: [], ledger: [], charges: [],
      })
    }
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

  if ((page.viewportSize()?.width || 0) === 390) {
    const balanceKpi = page.locator('.ops-client-balance-kpi')
    await expect(balanceKpi).toHaveCSS('height', '100px')
    await expect(balanceKpi.locator('.kpi-value')).toHaveCSS('font-size', '27px')
    await expect(balanceKpi).not.toContainText('Переплата')

    const financeActions = page.locator('.ops-client-finance-actions')
    const financeGeometry = await financeActions.evaluate((node) => {
      const buttons = [...node.querySelectorAll('.ops-action-card')].map((button) => button.getBoundingClientRect())
      return {
        height: node.getBoundingClientRect().height,
        columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
        firstRowTops: buttons.slice(0, 3).map((button) => Math.round(button.top)),
        secondRowTops: buttons.slice(3).map((button) => Math.round(button.top)),
      }
    })
    expect(financeGeometry.height).toBeLessThanOrEqual(130)
    expect(financeGeometry.columns).toBe(6)
    expect(new Set(financeGeometry.firstRowTops).size).toBe(1)
    expect(new Set(financeGeometry.secondRowTops).size).toBe(1)
    expect(await financeActions.locator('[data-testid^="admin-client-action-"]').evaluateAll(
      (nodes) => nodes.map((node) => node.dataset.testid),
    )).toEqual([
      'admin-client-action-payment', 'admin-client-action-charge', 'admin-client-action-remind',
      'admin-client-action-edit-subscription', 'admin-client-action-sell-subscription',
    ])
    expect(await financeActions.locator('small').evaluateAll(
      (nodes) => nodes.every((node) => getComputedStyle(node).display === 'none'),
    )).toBeTruthy()

    const tabList = page.locator('.ops-client-detail-tabs [role="tablist"]')
    await expect(tabList).toHaveCSS('justify-content', 'center')
    await expect(page.locator('.ops-client-detail-tabs')).toHaveCSS('justify-content', 'center')
    const consentsTab = tabList.getByTestId('admin-client-tab-consents')
    await expect(consentsTab).toHaveCSS('border-top-width', '1px')
    await expect(consentsTab).toHaveCSS('border-top-color', 'rgb(174, 215, 245)')
    const [actionsBox, tabsBox] = await Promise.all([financeActions.boundingBox(), tabList.boundingBox()])
    expect(Math.abs(actionsBox.width - tabsBox.width)).toBeLessThanOrEqual(1)

    await expect(page.locator('.ops-client-balance-kpi .kpi-value')).toBeVisible()

    await tabList.getByTestId('admin-client-tab-subscriptions').click()
    const remainingCell = page.locator('td:has(> .ops-client-detail-remaining)')
    await expect(remainingCell).toHaveCSS('text-align', 'left')
    await expect(remainingCell.locator('.ops-client-detail-remaining')).toHaveCSS('justify-self', 'start')
    await tabList.getByTestId('admin-client-tab-participants').click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  }

  await page.getByTestId('admin-client-action-edit-subscription').click()
  const subscriptionDialog = page.getByTestId('form-modal')
  await expect(subscriptionDialog.locator('#admin-client-finance-subscription-action')).toHaveValue('edit')
  const subscriptionEndDateInput = subscriptionDialog.locator('#admin-client-finance-subscription-end-date')
  await expect(subscriptionEndDateInput).toHaveValue('2026-09-26')
  await subscriptionEndDateInput.fill('2026-10-15')
  await subscriptionDialog.getByTestId('admin-client-finance-save').click()
  await expect.poll(() => subscriptionEditPayload).toEqual({ effective_end_date: '2026-10-15' })

  await page.getByTestId('admin-client-create-individual-202').click()
  await expect(page).toHaveURL(/view=schedule.*participant=202.*createSession=individual/)
  let sessionDialog = page.getByTestId('form-modal')
  await expect(sessionDialog.locator('#admin-session-participantId')).toHaveValue('Swimmer Current')

  await page.goto('/?role=admin&view=clientDetail&client=20')
  await page.getByTestId('admin-client-create-split-202').click()
  await expect(page).toHaveURL(/view=schedule.*participant=202.*createSession=split/)
  sessionDialog = page.getByTestId('form-modal')
  await expect(sessionDialog.locator('#admin-session-participantId')).toHaveValue('Swimmer Current')
  await expect(sessionDialog.locator('#admin-session-secondParticipantId')).toBeVisible()

  contactMode = 'invalid'
  await page.goto('/?role=admin&view=clientDetail&client=20')
  await expect(page.getByText('Telegram', { exact: true })).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('WhatsApp', { exact: true })).toHaveAttribute('title', /.+/)
  await expect(page.getByText('Instagram', { exact: true })).toHaveAttribute('aria-disabled', 'true')

  contactMode = 'archived'
  await page.goto('/?role=admin&view=clientDetail&client=20')
  await expect(page.getByRole('link', { name: 'Telegram' })).toHaveAttribute('href', 'https://t.me/+48222333444')
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://instagram.com/h2o_client')

  contactMode = 'anonymized'
  await page.goto('/?role=admin&view=clientDetail&client=20')
  await expect(page.locator('.ops-contact-links')).toHaveCount(0)
})
