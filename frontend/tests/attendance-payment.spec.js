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

async function mockAttendance(page, { multiple = false, historyOnly = false, mixedAttendance = false, withOldSubscription = false, family = false } = {}) {
  const participant = { id: 11, client_id: 101, first_name: 'Anna', last_name: 'Test', full_name: 'Anna Test', is_active: true }
  const subscription = { id: 77, participant_id: 11, type: 'Test pass', status: 'active', start_date: '2026-06-10', effective_end_date: '2026-07-10', remaining_sessions: 1, can_assign_attendance: true, ledger: [], charges: [], freezes: [] }
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
  if (withOldSubscription) detail.subscriptions.push({ ...subscription, id: 79, status: 'expired', effective_end_date: '2025-05-01', remaining_sessions: 0, can_assign_attendance: false })
  if (family) {
    detail.participants.push({ ...participant, id: 12, first_name: 'Boris', full_name: 'Boris Test' })
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
    if (path === '/api/me/') payload = { id: 1, username: 'admin', role: 'admin' }
    else if (path === '/api/health/') payload = { status: 'ok' }
    else if (path === '/api/admin/reference/') payload = { trainers: [], groups: [], subscription_types: [], participants: detail.participants, choices: {} }
    else if (path === '/api/admin/clients/') payload = { clients: [participant] }
    else if (path === '/api/admin/clients/101/') payload = detail
    else if (path === '/api/admin/participants/11/attendance/payment/') {
      const data = request.postDataJSON()
      changes.push(data)
      for (const row of detail.attendance.filter((item) => data.attendance_ids.includes(item.id))) {
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

test('visit source can be changed in both directions with hidden selection and a negative warning', async ({ page }) => {
  const changes = await mockAttendance(page)
  await page.goto('/?role=admin&view=clientDetail&client=101&tab=attendance')
  const edit = page.getByTestId('admin-client-attendance-edit')
  await expect(edit).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.locator('tbody tr').first().locator('td').last()).toHaveText('0')
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
  await expect.poll(() => changes[0]).toEqual({ attendance_ids: [1, 2], source: 'subscription', subscription_id: 77 })
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByText('С абонемента: Test pass · с 10.06.2026', { exact: true })).toHaveCount(2)
  await expect(paymentPanel).toHaveCount(0)
  await page.screenshot({ path: `../.local-run/attendance-subscription-label-${test.info().project.name}.png`, fullPage: true, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await expect(page.locator('tbody tr').first().locator('td').last()).toHaveText('-1')
  await edit.click()
  await page.getByRole('checkbox', { name: /Выбрать посещение:/ }).first().check()
  await page.locator('#admin-client-attendance-source').selectOption('account')
  await page.getByTestId('admin-client-attendance-save').click()
  await expect.poll(() => changes[1]).toEqual({ attendance_ids: [1], source: 'account' })
  await expect(page.locator('tbody').getByText('Со счёта', { exact: true })).toHaveCount(1)
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
  await expect.poll(() => changes[0]).toEqual({ attendance_ids: [1], source: 'subscription', subscription_id: 77 })
  await page.getByTestId('admin-client-tab-subscriptions').click()
  await expect(page.locator('tbody tr')).toHaveCount(2)
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
  await expect.poll(() => changes[0]).toEqual({ attendance_ids: [1], source: 'subscription', subscription_id: 77 })
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
