import { expect, test } from '@playwright/test'

async function clickFinanceAction(page, action) {
  const desktop = page.getByTestId(`admin-client-action-${action}-desktop`)
  if ((page.viewportSize()?.width || 0) >= 1200) return desktop.click()
  await page.getByTestId('admin-client-finance-trigger').click()
  await page.getByTestId(`admin-client-action-${action}`).click()
}

async function clickAccountAction(page, testId) {
  const desktop = page.getByTestId(`${testId}-desktop`)
  if ((page.viewportSize()?.width || 0) >= 1200) return desktop.click()
  await page.getByTestId('admin-client-actions-trigger').click()
  await page.getByTestId(testId).click()
}

async function mockAttendance(page, { multiple = false, historyOnly = false, mixedAttendance = false, withOldSubscription = false, family = false, withCharges = false, expiredAndRemaining = false, wideSubscription = false, changedSubscriptionBalance = null, saleType = false, photo = false, unmarkedRows = null } = {}) {
  const participant = { id: 11, client_id: 101, first_name: 'Anna', last_name: 'Test', full_name: 'Anna Test', is_active: true }
  if (photo) participant.photo_version = 'initial'
  const subscription = { id: 77, participant_id: 11, type: 'Test pass', status: 'active', start_date: '2026-06-10', effective_end_date: '2026-07-10', remaining_sessions: 1, can_assign_attendance: true, ledger: [], charges: [], freezes: [] }
  if (wideSubscription) {
    subscription.type = 'Абонемент на индивидуальные тренировки'
    subscription.remaining_sessions = 4
    subscription.can_cancel_sale = true
    subscription.ledger = [{ id: 1, reason: 'purchase', delta: 4, balance_after: 4, created_at: '2026-10-19T12:00:00+02:00', note: 'Покупка: 4 тренировки', created_by: 'admin (Администратор)' }]
  }
  if (changedSubscriptionBalance !== null) {
    subscription.remaining_sessions = changedSubscriptionBalance
    subscription.can_cancel_sale = false
  }
  const detail = {
    account: { id: 101, full_name: 'Anna Test', username: 'anna', phone: '+48555010000', email: 'demo@example.test', preferred_language: 'ru', is_active: true },
    participants: [participant],
    subscriptions: multiple ? [subscription, { ...subscription, id: 78, start_date: '2026-06-20' }] : [subscription],
    payments: [], charges: [], consents: [], summary: { balance_minor: 10000 },
    attendance: [1, 2].map((id) => ({
      id, participant_id: 11, participant: 'Anna Test', session_id: id,
      session_start_at: `2026-06-0${id}T17:00:00+02:00`, session_end_at: `2026-06-0${id}T18:00:00+02:00`,
      group: 'Test group', trainer: 'Test trainer', status: 'present', deducts: true,
      financial_effects_enabled: !historyOnly, payment_source: historyOnly ? 'none' : 'account', payment_subscription_id: null,
      subscription_session_delta: 0,
    })),
  }
  if (wideSubscription) detail.charges = [{
    id: 500, subscription_id: 77, participant: 'Anna Test', description: 'Абонемент на индивидуальные тренировки',
    amount_minor: 28000, currency: 'PLN', due_date: '2026-10-19', status: 'active', can_reverse: false,
  }]
  if (withCharges) detail.charges = detail.attendance.map((row) => ({
    id: row.id, attendance_id: row.id, participant: row.participant, description: 'Разовое занятие',
    amount_minor: 6500, currency: 'PLN', due_date: '2026-06-01', status: 'active', can_reverse: false,
  }))
  if (withOldSubscription) detail.subscriptions.push({ ...subscription, id: 79, status: 'expired', effective_end_date: '2025-05-01', remaining_sessions: 0, can_assign_attendance: false })
  if (expiredAndRemaining) detail.subscriptions = [
    { ...subscription, id: 79, start_date: '2026-10-18', effective_end_date: '2026-10-18', status: 'expired', remaining_sessions: 0 },
    { ...subscription, id: 78, start_date: '2026-10-14', effective_end_date: '2026-11-18', remaining_sessions: 2 },
  ]
  if (family) {
    detail.participants.push({ ...participant, id: 12, first_name: 'Boris', full_name: 'Boris Test', group: { id: 8, name: 'Test group' } })
    detail.subscriptions.push({ ...subscription, id: 78, participant_id: 12, remaining_sessions: 3 })
    detail.attendance.push({ ...detail.attendance[0], id: 3, participant_id: 12, participant: 'Boris Test' })
  }
  if (mixedAttendance) {
    detail.attendance = [
      ['present', 'account'], ['absent', 'account'], ['present', 'subscription'],
      ['excused', 'none'], ['rescheduled', 'none'], ['present', 'none'],
    ].map(([status, source], index) => ({
      ...detail.attendance[0], id: index + 1, session_id: index + 1, status,
      session_start_at: `2026-06-0${index + 1}T17:00:00+02:00`,
      payment_source: source, payment_subscription_id: source === 'subscription' ? 77 : null,
      deducts: ['present', 'absent'].includes(status), financial_effects_enabled: source !== 'none',
    }))
  }
  const changes = []
  await page.addInitScript(() => localStorage.setItem('swimcrm.ui.locale.1.admin', 'ru'))
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let payload = {}
    if (path === '/api/admin/participants/11/photo/') {
      if (request.method() === 'GET') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64') })
      if (request.method() === 'POST') { participant.photo_version = 'updated'; changes.push({ photoUpload: request.headers()['content-type']?.startsWith('multipart/form-data') }); payload = { has_photo: true, photo_version: 'updated' } }
      if (request.method() === 'DELETE') { participant.photo_version = null; changes.push({ photoDelete: true }); payload = { has_photo: false, photo_version: null } }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
    }
    if (path === '/api/me/') payload = { id: 1, username: 'admin', role: 'admin' }
    else if (path === '/api/health/') payload = { status: 'ok' }
    else if (path === '/api/admin/reference/') payload = { trainers: [], groups: [], subscription_types: saleType ? [{ id: 1, name: 'Test pass', price_minor: 28000, currency: 'PLN', duration_days: 30, sessions_count: 4, is_unlimited: false, is_individual: false, is_active: true }] : [], participants: detail.participants, choices: {} }
    else if (path === '/api/admin/clients/') payload = { clients: [participant] }
    else if (path === '/api/admin/clients/101/') payload = unmarkedRows && new URL(request.url()).searchParams.get('include_unmarked') === '1'
      ? { ...detail, unmarked_attendance: unmarkedRows } : detail
    else if (path === '/api/admin/subscriptions/77/cancel-sale/' && request.method() === 'POST') {
      changes.push({ action: 'cancel-sale', subscription_id: 77 })
      subscription.status = 'cancelled'
      subscription.can_cancel_sale = false
      detail.charges.find((row) => row.subscription_id === 77).status = 'reversed'
      payload = { subscription, balance_minor: -28000 }
    }
    else if (path === '/api/admin/clients/101/participants/' && request.method() === 'POST') {
      const data = request.postDataJSON()
      changes.push(data)
      const created = { id: 13, client_id: 101, ...data.participant, full_name: `${data.participant.first_name} ${data.participant.last_name}`.trim(), is_active: true }
      detail.participants.push(created)
      payload = created
    }
    else if (path === '/api/admin/participants/11/subscriptions/' && request.method() === 'POST') {
      changes.push(request.postDataJSON())
      payload = { subscription: { id: 90 } }
    }
    else if (path === '/api/admin/participants/11/attendance/payment/') {
      const data = request.postDataJSON()
      changes.push(data)
      for (const row of detail.attendance.filter((item) => data.attendance_ids.includes(item.id))) {
        if (withCharges && row.payment_source !== data.source) detail.charges.unshift({
          ...detail.charges.find((charge) => charge.attendance_id === row.id),
          id: detail.charges.length + 1, amount_minor: data.source === 'subscription' ? -6500 : 6500,
          description: data.source === 'subscription' ? 'Сторно разового занятия' : 'Разовое занятие',
        })
        row.payment_source = data.source
        row.payment_subscription_id = data.subscription_id || null
        row.subscription_session_delta = data.source === 'subscription' ? -1 : 0
        row.financial_effects_enabled = true
      }
      payload = { attendance: detail.attendance }
    } else if (path === '/api/admin/subscriptions/77/update/') {
      const data = request.postDataJSON()
      changes.push(data)
      Object.assign(subscription, data)
      payload = subscription
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
  })
  return changes
}

test('admin crops, replaces, previews and removes participant photo', async ({ page }, testInfo) => {
  const changes = await mockAttendance(page, { photo: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=participants')
  await page.getByRole('button', { name: 'Anna Test', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Фотография пловца' })
  await expect(editor.getByRole('button', { name: /Увеличить фото/ })).toBeVisible()
  await editor.getByRole('button', { name: /Увеличить фото/ }).click()
  await expect(page.getByRole('dialog', { name: 'Anna Test' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Anna Test' }).getByRole('button', { name: 'Закрыть' }).click()
  await editor.locator('input[type=file]').setInputFiles({ name: 'source.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64') })
  await expect(editor.getByLabel('Предпросмотр обрезанного фото')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('participant-photo-crop.png'), animations: 'disabled' })
  await editor.getByLabel('Увеличение').fill('1.5')
  await editor.getByRole('button', { name: 'Сохранить фото' }).click()
  await expect.poll(() => changes.find((item) => item.photoUpload)?.photoUpload).toBe(true)
  await editor.getByRole('button', { name: 'Удалить фото' }).click()
  await expect.poll(() => changes.some((item) => item.photoDelete)).toBe(true)
  await expect(editor.getByRole('button', { name: /Увеличить фото/ })).toHaveCount(0)
})

test('visit source can be changed in both directions with hidden selection and a negative warning', async ({ page }) => {
  const changes = await mockAttendance(page, { withCharges: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  const edit = page.getByTestId('admin-client-attendance-edit')
  await expect(edit).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.locator('tbody tr').first().locator('td').last()).toContainText('−65,00')
  await edit.click()
  const paymentPanel = page.locator('#admin-client-attendance-payment-panel')
  await expect(paymentPanel).toBeVisible()
  await expect(paymentPanel).toContainText('Выбрано: 0')
  await expect(paymentPanel).toHaveCSS('animation-name', 'ops-popup-in')
  await expect(page.locator('#admin-client-attendance-subscription')).toHaveCount(0)
  const checkboxes = page.getByRole('checkbox', { name: /Выбрать посещение:/ })
  await checkboxes.nth(0).check()
  await checkboxes.nth(1).check()
  await expect(page.getByText('После сохранения остаток абонемента станет -1.', { exact: false })).toBeVisible()
  await expect(page.getByTestId('admin-client-attendance-save')).toBeEnabled()
  await page.screenshot({ path: `../.local-run/attendance-payment-${test.info().project.name}.png`, fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.getByTestId('admin-client-attendance-save').click()
  await expect.poll(() => changes[0]).toEqual({ attendance_ids: [2, 1], source: 'subscription', subscription_id: 77 })
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByText('С абонемента: Test pass · с 10.06.2026', { exact: true })).toHaveCount(2)
  await expect(paymentPanel).toHaveCount(0)
  await page.screenshot({ path: `../.local-run/attendance-subscription-label-${test.info().project.name}.png`, fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await expect(page.locator('tbody tr').first().locator('td').last()).toHaveText('-1')
  await page.getByTestId('admin-client-tab-payments').click()
  if (await page.locator('.ops-mobile-payment-switch').isVisible()) await page.getByRole('tab', { name: 'Начисления' }).click()
  await expect(page.locator('.ops-client-payment-charges tbody')).toContainText('Начислений нет')
  await page.getByTestId('admin-client-tab-attendance').click()
  await edit.click()
  await page.getByRole('checkbox', { name: /Выбрать посещение:/ }).first().check()
  await page.locator('#admin-client-attendance-source').selectOption('account')
  await page.getByTestId('admin-client-attendance-save').click()
  await expect.poll(() => changes[1]).toEqual({ attendance_ids: [2], source: 'account' })
  await expect(page.locator('tbody').getByText('Со счёта', { exact: true })).toHaveCount(1)
  await expect(page.locator('tbody tr').first().locator('td').last()).toContainText('−65,00')
  await page.getByTestId('admin-client-tab-payments').click()
  if (await page.locator('.ops-mobile-payment-switch').isVisible()) await page.getByRole('tab', { name: 'Начисления' }).click()
  await expect(page.locator('.ops-client-payment-charges tbody tr')).toHaveCount(1)
  await expect(page.locator('.ops-client-payment-charges tbody tr').first()).toContainText('65,00')
})

test('multiple subscriptions require a choice and cancellation does not submit', async ({ page }) => {
  const changes = await mockAttendance(page, { multiple: true, withOldSubscription: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  await page.getByTestId('admin-client-attendance-edit').click()
  await page.getByRole('checkbox', { name: /Выбрать посещение:/ }).first().check()
  await expect(page.getByTestId('admin-client-attendance-save')).toBeDisabled()
  await expect(page.locator('#admin-client-attendance-subscription option[value="79"]')).toHaveCount(0)
  await expect(page.locator('#admin-client-attendance-subscription option[value="77"]')).toHaveText('Test pass · с 10.06.2026 · остаток 1')
  await expect(page.locator('#admin-client-attendance-subscription option[value="78"]')).toHaveText('Test pass · с 20.06.2026 · остаток 1')
  await page.locator('#admin-client-attendance-subscription').selectOption('78')
  await expect(page.getByTestId('admin-client-attendance-save')).toBeEnabled()
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  expect(changes).toEqual([])
})

test('the sole eligible subscription is automatic while old empty ones remain in history', async ({ page }) => {
  const changes = await mockAttendance(page, { withOldSubscription: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  await page.getByTestId('admin-client-attendance-edit').click()
  await expect(page.locator('#admin-client-attendance-subscription')).toHaveCount(0)
  await expect(page.getByText('Test pass · с 10.06.2026', { exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: /Выбрать посещение:/ }).first().check()
  await page.getByTestId('admin-client-attendance-save').click()
  await expect.poll(() => changes[0]).toEqual({ attendance_ids: [2], source: 'subscription', subscription_id: 77 })
  await page.getByTestId('admin-client-tab-subscriptions').click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
})

test('client navigation shows sessions from the current pass', async ({ page }) => {
  await mockAttendance(page, { expiredAndRemaining: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=subscriptions')
  const tab = page.getByTestId('admin-client-tab-subscriptions')
  await expect(tab).toContainText('остаток 2')
  await expect(tab).toContainText('Активны: 1')
  await expect(page.locator('tbody tr').first()).toContainText('Истёк')
})

test('historical visits remain selectable and warn before enabling billing', async ({ page }) => {
  const changes = await mockAttendance(page, { historyOnly: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  const edit = page.getByTestId('admin-client-attendance-edit')
  await expect(edit).toBeEnabled()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await edit.click()
  const checkboxes = page.getByRole('checkbox', { name: /Выбрать посещение:/ })
  await expect(checkboxes).toHaveCount(2)
  await checkboxes.first().check()
  await expect(page.getByText('У выбранных посещений отключён финансовый учёт.', { exact: false })).toBeVisible()
  await expect(page.getByTestId('admin-client-attendance-save')).toBeEnabled()
  await page.getByTestId('admin-client-attendance-save').click()
  await expect.poll(() => changes[0]).toEqual({ attendance_ids: [2], source: 'subscription', subscription_id: 77 })
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByText('С абонемента: Test pass · с 10.06.2026', { exact: true })).toHaveCount(1)
})

test('visit source and status filters combine and clear selection before changing the visible set', async ({ page }) => {
  const changes = await mockAttendance(page, { mixedAttendance: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  const rows = page.locator('tbody tr').filter({ hasText: 'Anna Test' })
  const source = page.locator('#admin-client-attendance-filter-source')
  const status = page.locator('#admin-client-attendance-filter-status')
  const filters = page.getByTestId('admin-client-attendance-filters')
  const panel = page.locator('#admin-client-attendance-filters-panel')
  await expect(filters).toHaveAttribute('aria-expanded', 'false')
  await expect(panel).toHaveCount(0)
  const [editBox, filtersBox] = await Promise.all([page.getByTestId('admin-client-attendance-edit').boundingBox(), filters.boundingBox()])
  expect(Math.abs(editBox.y - filtersBox.y)).toBeLessThanOrEqual(1)
  await filters.click()
  await expect(filters).toHaveAttribute('aria-expanded', 'true')
  await expect(panel).toBeVisible()
  await expect(panel).toHaveCSS('animation-name', 'ops-popup-in')
  async function choose(filter, labels) {
    await filter.locator('summary').click()
    await filter.getByRole('button', { name: 'Все посещения', exact: true }).click()
    for (const name of labels) await filter.getByRole('checkbox', { name, exact: true }).check()
    await filter.locator('summary').click()
  }
  await expect(rows).toHaveCount(6)
  await choose(source, ['Со счёта'])
  await expect(rows).toHaveCount(2)
  await filters.click()
  await expect(panel).toHaveCount(0)
  await expect(rows).toHaveCount(2)
  await filters.click()
  await expect(source.locator('summary')).toHaveText('Со счёта')
  await choose(source, ['Со счёта', 'С абонемента'])
  await expect(rows).toHaveCount(3)
  await expect(source.locator('summary')).toHaveText('Со счёта, С абонемента')
  await source.locator('summary').click()
  await source.getByRole('checkbox', { name: 'Со счёта', exact: true }).uncheck()
  await source.locator('summary').click()
  await expect(rows).toHaveCount(1)
  await choose(source, ['Со счёта', 'Не указан'])
  await choose(status, ['Был', 'Не был'])
  await expect(rows).toHaveCount(4)
  await expect(status.locator('summary')).toHaveText('Был, Не был')
  await choose(source, ['Со счёта'])
  await choose(status, ['Не был'])
  await expect(rows).toHaveCount(1)
  await choose(source, ['Не указан'])
  await expect(rows).toHaveCount(1) // Excused absence belongs to "Не был".
  await choose(status, ['Не был', 'Перенос'])
  await expect(rows).toHaveCount(2)
  await choose(status, ['Перенос'])
  await expect(rows).toHaveCount(1)
  await choose(source, ['С абонемента'])
  await expect(rows).toHaveCount(0)
  await expect(page.getByTestId('admin-client-attendance-edit')).toBeDisabled()
  await choose(status, [])
  await expect(rows).toHaveCount(1)
  await choose(source, ['Не указан'])
  await expect(rows).toHaveCount(3)
  await choose(status, ['Был'])
  await expect(rows).toHaveCount(1)
  await page.getByTestId('admin-client-attendance-edit').click()
  await page.getByRole('checkbox', { name: /Выбрать посещение:/ }).check()
  await expect(page.getByTestId('admin-client-attendance-save')).toBeEnabled()
  await filters.click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByTestId('admin-client-attendance-save')).toBeEnabled()
  await filters.click()
  await choose(source, ['Со счёта'])
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await page.getByTestId('admin-client-attendance-edit').click()
  await expect(page.getByTestId('admin-client-attendance-save')).toBeDisabled()
  await page.getByRole('checkbox', { name: /Выбрать посещение:/ }).check()
  await page.getByTestId('admin-client-attendance-save').click()
  await expect.poll(() => changes).toEqual([{ attendance_ids: [1], source: 'subscription', subscription_id: 77 }])
  await expect(rows).toHaveCount(0)
  await choose(source, [])
  await choose(status, [])
  await expect(rows).toHaveCount(6)
  await choose(source, ['Со счёта', 'С абонемента'])
  await source.locator('summary').click()
  await page.screenshot({ path: `../.local-run/attendance-filters-${test.info().project.name}.png`, fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(panel).toHaveCSS('animation-name', 'none')
  await filters.click()
  await expect(panel).toHaveCount(0)
})

test('unmarked visits appear only with the explicit status and open the attendance screen', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0))
  const unmarkedRows = [7, 8].map((day, index) => ({
    id: index ? 99 : null, participant_id: 11, participant: 'Anna Test', session_id: 30 + index,
    session_start_at: `2026-06-0${day}T17:00:00+02:00`, session_end_at: `2026-06-0${day}T18:00:00+02:00`,
    group: 'Test group', trainer: 'Test trainer', status: null, deducts: false,
    payment_source: 'none', payment_subscription_id: null, subscription_session_delta: 0,
  }))
  await mockAttendance(page, { unmarkedRows })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  const rows = page.locator('tbody tr').filter({ hasText: 'Anna Test' })
  await expect(rows).toHaveCount(2)
  await expect(page.getByText('Без отметки')).toHaveCount(0)

  await page.getByTestId('admin-client-attendance-filters').click()
  const status = page.locator('#admin-client-attendance-filter-status')
  const source = page.locator('#admin-client-attendance-filter-source')
  await status.locator('summary').click()
  await status.getByRole('checkbox', { name: 'Без отметки' }).check()
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Без отметки')
  await expect(page.getByTestId('admin-client-attendance-edit')).toBeDisabled()
  await status.getByRole('checkbox', { name: 'Был', exact: true }).check()
  await expect(rows).toHaveCount(4)

  await source.locator('summary').click()
  await source.getByRole('checkbox', { name: 'Со счёта', exact: true }).check()
  await expect(rows).toHaveCount(2)
  await source.getByRole('checkbox', { name: 'Со счёта', exact: true }).uncheck()
  await source.getByRole('checkbox', { name: 'Не указан', exact: true }).check()
  await expect(rows).toHaveCount(2)
  await source.getByRole('checkbox', { name: 'Не указан', exact: true }).uncheck()
  await expect(rows).toHaveCount(4)

  await source.locator('summary').click()
  await page.getByTestId('admin-client-attendance-filters').click()
  await rows.filter({ hasText: 'Без отметки' }).first().locator('.ops-link-button').click()
  await expect(page).toHaveURL(/view=attendance.*session=3[01]/)
  unmarkedRows.pop()
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  await expect(rows).toHaveCount(3)
  await expect(rows.filter({ hasText: 'Без отметки' })).toHaveCount(1)
})

test('client attendance filters survive leaving and reopening the client card', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0))
  await mockAttendance(page, { mixedAttendance: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  await page.getByTestId('admin-client-attendance-filters').click()
  const source = page.locator('#admin-client-attendance-filter-source')
  await source.locator('summary').click()
  await source.getByRole('checkbox', { name: 'Со счёта', exact: true }).check()
  await expect(page.locator('tbody tr').filter({ hasText: 'Anna Test' })).toHaveCount(2)
  if ((page.viewportSize()?.width || 0) === 1440) {
    await page.getByTestId('nav-admin-clients').first().click()
    await page.goBack()
  } else {
    await page.goto('/?role=admin&view=clients')
    await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  }
  await expect(page.locator('tbody tr').filter({ hasText: 'Anna Test' })).toHaveCount(2)
  await page.getByTestId('admin-client-attendance-filters').click()
  await expect(source.locator('summary')).toHaveText('Со счёта')
})

test('subscription start and end can be edited independently', async ({ page }) => {
  const changes = await mockAttendance(page)
  await page.goto('/?role=admin&view=clientDetail&client=101')
  await clickFinanceAction(page, 'edit-subscription')
  const dialog = page.getByTestId('form-modal')
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Test pass · с 10.06.2026')
  await dialog.locator('#admin-client-subscription-start-date').fill('2026-06-01')
  await expect(dialog.locator('#admin-client-subscription-end-date')).toHaveValue('2026-07-10')
  await dialog.locator('#admin-client-subscription-reason').selectOption({ index: 1 })
  const reason = await dialog.locator('#admin-client-subscription-reason').inputValue()
  await expect(dialog).toBeInViewport()
  await page.screenshot({ path: `../.local-run/subscription-start-${test.info().project.name}.png`, animations: 'disabled' })
  await dialog.getByTestId('admin-client-subscription-save').click()
  await expect.poll(() => changes[0]).toEqual({ start_date: '2026-06-01', reason })
})

test('client summary is the navigation and keeps contacts and finance actions available', async ({ page }) => {
  const changes = await mockAttendance(page)
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  const hub = page.locator('.ops-client-hub')
  await expect(hub.getByRole('tab')).toHaveCount(6)
  await expect(page.locator('.ops-client-balance-kpi,.ops-client-detail-tabs')).toHaveCount(0)
  await expect(page.getByTestId('admin-client-tab-payments')).toContainText('100,00')
  await expect(page.getByTestId('admin-client-tab-subscriptions')).toContainText('остаток 1')
  await expect(page.getByTestId('admin-client-tab-attendance')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('link', { name: 'Telegram' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toBeVisible()
  await expect(page.getByTestId('admin-client-participant-select')).toHaveCount(0)
  for (const section of ['participants', 'subscriptions', 'payments', 'consents', 'privacy', 'attendance']) {
    await page.getByTestId(`admin-client-tab-${section}`).click()
    await expect(page.getByTestId(`admin-client-tab-${section}`)).toHaveAttribute('aria-selected', 'true')
    await expect(hub.locator('[aria-selected="true"]')).toHaveCount(1)
  }
  const subscriptionsTab = page.getByTestId('admin-client-tab-subscriptions')
  await subscriptionsTab.click({ position: { x: 18, y: 20 } })
  expect(Math.abs(await subscriptionsTab.evaluate(node => parseFloat(node.style.getPropertyValue('--reveal-x'))) - 18)).toBeLessThan(1)
  expect(Math.abs(await subscriptionsTab.evaluate(node => parseFloat(node.style.getPropertyValue('--reveal-y'))) - 20)).toBeLessThan(1)
  expect(await subscriptionsTab.evaluate(node => getComputedStyle(node, '::before').animationName)).toBe('ops-client-hub-reveal')
  const paymentsTab = page.getByTestId('admin-client-tab-payments')
  await paymentsTab.focus()
  await paymentsTab.press('Enter')
  await expect(paymentsTab).toHaveAttribute('aria-selected', 'true')
  expect(await paymentsTab.evaluate(node => node.style.getPropertyValue('--reveal-x'))).toBe('50%')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await subscriptionsTab.click()
  expect(await subscriptionsTab.evaluate(node => getComputedStyle(node, '::before').animationName)).toBe('none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByTestId('admin-client-tab-attendance').click()
  await expect(page.getByTestId('admin-client-action-payment')).toBeVisible()
  await expect(page.getByTestId('admin-client-action-sell-subscription')).toBeVisible()
  if ((page.viewportSize()?.width || 0) >= 1200) {
    const buttons = page.locator('.ops-client-quick-actions button:visible')
    await expect(buttons).toHaveCount(5)
    const tops = await buttons.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top))
    expect(new Set(tops).size).toBe(1)
    await expect(page.getByTestId('admin-client-finance-trigger')).toBeHidden()
  } else {
    await expect(page.getByTestId('admin-client-finance-trigger')).toHaveText('Ещё')
  }
  await clickFinanceAction(page, 'edit-subscription')
  await expect(page.getByTestId('form-modal')).toContainText('Test pass · с 10.06.2026')
  await page.getByTestId('form-modal').locator('.form-modal__footer button').first().click()
  if ((page.viewportSize()?.width || 0) >= 1200) {
    const accountButtons = page.locator('.ops-client-desktop-account-actions > button')
    await expect(accountButtons).toHaveCount(4)
    const tops = await accountButtons.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top))
    expect(tops[0]).toBe(tops[1])
    expect(tops[2]).toBe(tops[3])
    expect(tops[2]).toBeGreaterThan(tops[0])
    await expect(page.getByTestId('admin-client-actions-trigger')).toBeHidden()
  }
  await clickAccountAction(page, 'admin-client-edit-account')
  await expect(page.locator('#admin-client-detail-phone')).toHaveValue('+48555010000')
  await page.getByTestId('form-modal').locator('.form-modal__footer button').first().click()
  await page.screenshot({ path: `../.local-run/client-compact-${test.info().project.name}.png`, fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  expect(changes).toEqual([])
})

test('family participant selection updates the summary and history without losing the section', async ({ page }) => {
  await mockAttendance(page, { family: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&participant=11&tab=attendance')
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByTestId('admin-client-participant-select').selectOption('12')
  await expect(page).toHaveURL(/participant=12/)
  await expect(page).toHaveURL(/tab=attendance/)
  await expect(page.getByTestId('admin-client-tab-subscriptions')).toContainText('остаток 3')
  await expect(page.getByTestId('admin-client-tab-attendance')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody')).toContainText('Boris Test')
  await expect(page.getByTestId('admin-client-tab-payments')).toContainText('100,00')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})

test('subscription details fit a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await mockAttendance(page, { wideSubscription: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=subscriptions')
  await page.locator('tbody tr').first().click()
  const modal = page.getByTestId('form-modal')
  await expect(modal).toBeVisible()
  const bounds = await modal.boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(361)
  const footerFits = await modal.locator('.form-modal__footer').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  expect(footerFits).toBe(true)
  const buttonsFit = await modal.locator('.form-modal__footer button').evaluateAll((nodes) => nodes.every((node) => {
    const bounds = node.getBoundingClientRect()
    return bounds.left >= 0 && bounds.right <= window.innerWidth && node.scrollWidth <= node.clientWidth + 1
  }))
  expect(buttonsFit).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '../.local-run/subscription-details-mobile.png', animations: 'disabled' })
})

test('eligible sale charge can be cancelled from payment history', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  const changes = await mockAttendance(page, { wideSubscription: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=payments')
  await page.getByRole('tab', { name: 'Начисления' }).click()
  const charge = page.locator('.ops-client-payment-charges tbody tr').first()
  await charge.getByRole('button', { name: 'Отменить продажу' }).click()
  await page.getByRole('button', { name: 'Отменить продажу' }).last().click()
  await expect.poll(() => changes).toContainEqual({ action: 'cancel-sale', subscription_id: 77 })
  await expect(charge).toContainText('Отменено')
  await expect(charge.getByRole('button', { name: 'Отменить продажу' })).toHaveCount(0)
})

for (const remaining of [3, 5]) {
  test(`subscription sale cancellation is hidden when ${remaining} of 4 sessions remain`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await mockAttendance(page, { wideSubscription: true, changedSubscriptionBalance: remaining })
    await page.goto('/?role=admin&view=clientDetail&client=101&tab=subscriptions')
    await page.locator('tbody tr').first().click()
    const modal = page.getByTestId('form-modal')
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('button', { name: 'Отменить продажу' })).toHaveCount(0)
    await page.getByTestId('form-modal-close').click()
    await page.getByTestId('admin-client-tab-payments').click()
    await page.getByRole('tab', { name: 'Начисления' }).click()
    await expect(page.locator('.ops-client-payment-charges tbody').getByRole('button', { name: 'Отменить продажу' })).toHaveCount(0)
  })
}

test('selling a pass can select another family member with a group', async ({ page }) => {
  await mockAttendance(page, { family: true })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/?role=admin&view=clientDetail&client=101&participant=11')
  await page.getByTestId('admin-client-action-sell-subscription').click()
  await expect(page.locator('#admin-client-finance-due-date')).toHaveCount(0)
  await page.locator('#admin-client-finance-participant').click()
  await page.locator('.ops-search-select-list').getByRole('option', { name: /Boris Test/ }).click()
  await expect(page.getByTestId('form-modal')).toBeVisible()
  await expect(page.locator('#admin-client-finance-participant')).toHaveValue('Boris Test')
  expect(pageErrors).toEqual([])
})

test('sale price on a narrow screen is capped at catalog price and sent in minor units', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const changes = await mockAttendance(page, { saleType: true })
  await page.goto('/?role=admin&view=clientDetail&client=101&participant=11')
  await page.getByTestId('admin-client-action-sell-subscription').click()
  const price = page.locator('#admin-client-finance-sale-price')
  await expect(price).toHaveValue('280')
  await price.fill('281')
  await page.getByTestId('admin-client-finance-save').click()
  await expect(price).toHaveAttribute('aria-invalid', 'true')
  expect(changes).toHaveLength(0)
  await price.fill('200,50')
  await page.getByTestId('admin-client-finance-save').click()
  await expect.poll(() => changes[0]?.price_minor).toBe(20050)
  expect(changes[0]).not.toHaveProperty('due_date')
})

test('client page adds a family member from the account actions', async ({ page }) => {
  const changes = await mockAttendance(page)
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=payments')
  if (page.viewportSize().width >= 1200) await page.getByTestId('admin-client-add-family-member-desktop').click()
  else {
    await page.getByTestId('admin-client-actions-trigger').click()
    await page.getByTestId('admin-client-add-family-member').click()
  }
  const dialog = page.getByTestId('form-modal')
  await expect(dialog).toContainText('Добавить члена семьи')
  await dialog.locator('#admin-client-participant-first-name').fill('Boris')
  await dialog.locator('#admin-client-participant-last-name').fill('Test')
  await dialog.getByRole('button', { name: 'Добавить члена семьи' }).click()
  await expect.poll(() => changes[0]?.participant?.first_name).toBe('Boris')
  await expect(page.locator('tbody').getByText('Boris Test')).toBeVisible()
})
