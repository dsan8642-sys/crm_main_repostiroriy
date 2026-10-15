import { expect, test } from '@playwright/test'

test('local appearance editor previews, compares and saves named variants', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'desktop and phone editor')
  await mockAdmin(page)
  const fields = [
    { key: 'primary', label: 'Основные кнопки', group: 'Кнопки', type: 'color', tokens: ['--primary'], rules: [] },
    { key: 'cardPadding', label: 'Внутренний отступ карточек', group: 'Карточки', type: 'size', min: 8, max: 32, tokens: [], rules: [{ selector: '.card-pad', property: 'padding' }], default: '16px' },
  ]
  let state = { values: {}, presets: [] }
  let revision = 'one'
  let saves = 0
  await page.route('**/api/dev/appearance/', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      expect(body.revision).toBe(revision)
      state = body.state
      revision = 'two'
      saves += 1
    }
    return json(route, { fields, state, revision })
  })
  await page.goto('/?role=admin&view=overview')
  await page.getByTestId('appearance-editor-open').click()
  const editor = page.getByRole('dialog', { name: 'Редактор оформления' })
  await expect(editor).toBeVisible()
  const frame = page.frameLocator('iframe[title="Предпросмотр CRM"]')
  await expect(frame.locator('html')).toHaveAttribute('data-appearance', 'preview')
  await editor.locator('label').filter({ hasText: 'Основные кнопки' }).locator('input[type="color"]').fill('#b10c45')
  await expect.poll(() => frame.locator('html').evaluate((node) => getComputedStyle(node).getPropertyValue('--primary').trim())).toBe('#b10c45')
  await editor.getByRole('button', { name: 'Сравнить с исходным' }).click()
  await expect(frame.locator('html')).toHaveAttribute('data-appearance', 'default')
  await editor.getByRole('button', { name: 'Показать мои изменения' }).click()
  await editor.getByRole('button', { name: 'Отменить шаг' }).click()
  await expect.poll(() => frame.locator('html').evaluate((node) => getComputedStyle(node).getPropertyValue('--primary').trim())).not.toBe('#b10c45')
  await editor.locator('label').filter({ hasText: 'Основные кнопки' }).locator('input[type="color"]').fill('#b10c45')
  await editor.getByRole('button', { name: 'Телефон' }).click()
  await expect(editor.locator('iframe')).toHaveJSProperty('clientWidth', 390)
  await editor.getByRole('button', { name: 'Компьютер' }).click()
  await expect(editor.locator('iframe')).toHaveJSProperty('clientWidth', 1440)
  await expect(editor.locator('.appearance-editor__frame-box')).toHaveClass(/is-scaled/)
  await editor.getByLabel('Ширина компьютера').selectOption('0')
  await expect.poll(() => editor.locator('iframe').evaluate((node) => node.style.width)).toBe('')
  if (page.viewportSize().width === 1440) await expect.poll(() => editor.locator('iframe').evaluate((node) => node.clientWidth)).toBeGreaterThan(600)
  await editor.getByRole('button', { name: 'Отдельный элемент' }).click()
  const target = frame.locator('#root button:visible').first()
  await expect(target).toBeVisible()
  await target.click()
  await expect(editor.getByText('admin/overview')).toBeVisible()
  await editor.locator('.appearance-editor__selection').getByText('Фон').locator('..').locator('input[type="color"]').fill('#7844aa')
  await expect.poll(() => target.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(120, 68, 170)')
  await editor.getByRole('button', { name: 'Общее оформление' }).click()
  await editor.getByRole('textbox', { name: 'Название варианта' }).fill('Мой цвет')
  await editor.getByRole('button', { name: 'Добавить' }).click()
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(editor.getByText('Сохранено в файлы проекта.')).toBeVisible()
  expect(state.presets[0].name).toBe('Мой цвет')
  expect(state.values.primary).toBe('#b10c45')
  expect(state.overrides).toHaveLength(1)
  expect(state.overrides[0]).toMatchObject({ route: 'admin/overview', properties: { backgroundColor: '#7844aa' } })
  expect(saves).toBe(1)
  await editor.getByRole('button', { name: 'Закрыть редактор' }).click()
  await expect(editor).toHaveCount(0)
})

test('appearance editor selects nested session text with Ctrl and edits spacing by side', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'desktop and phone editor')
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0)
  const session = {
    id: 71, start_at: start.toISOString(), end_at: new Date(start.getTime() + 45 * 60_000).toISOString(),
    session_type: 'group', group: { id: 1, name: 'Audit Group' }, trainer_id: 1,
    trainer: 'Audit Trainer', location: 'Pool A', max_participants: 8,
    participants_count: 1, is_cancelled: false,
  }
  await mockAdmin(page, { sessions: [session] })
  const fields = [{ key: 'primary', label: 'Основные кнопки', group: 'Кнопки', type: 'color', tokens: ['--primary'], rules: [] }]
  let state = { values: {}, presets: [], overrides: [] }
  await page.route('**/api/dev/appearance/', (route) => {
    if (route.request().method() === 'POST') state = route.request().postDataJSON().state
    return json(route, { fields, state, revision: 'one' })
  })
  await page.goto('/?role=admin&view=overview')
  await page.getByTestId('appearance-editor-open').click()
  const editor = page.getByRole('dialog', { name: 'Редактор оформления' })
  await expect(editor.locator('iframe')).toHaveJSProperty('clientWidth', 1440)
  await editor.getByLabel('Ширина компьютера').selectOption('0')
  const frame = page.frameLocator('iframe[title="Предпросмотр CRM"]')
  const text = frame.locator('.ops-today-status-list button .ops-session-summary-column > span').first()
  await expect(text).toBeVisible()
  await editor.getByRole('button', { name: 'Отдельный элемент' }).click()
  await text.click()
  await expect(editor.locator('.appearance-editor__selection strong')).toContainText('button:')
  await text.click({ modifiers: ['Control'] })
  await expect(editor.locator('.appearance-editor__selection strong')).toContainText('span:')
  await editor.getByRole('button', { name: 'Структура' }).click()
  const outline = editor.getByRole('complementary', { name: 'Структура страницы' })
  await expect(outline).toBeVisible()
  const tree = outline.getByRole('tree', { name: 'Элементы страницы' })
  await tree.evaluate((node) => { node.style.maxHeight = '180px' })
  expect(await tree.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(0)
  const headerTop = await outline.locator('header').evaluate((node) => node.getBoundingClientRect().top)
  await tree.evaluate((node) => { node.scrollTop = node.scrollHeight })
  await expect.poll(() => tree.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
  expect(await outline.locator('header').evaluate((node) => node.getBoundingClientRect().top)).toBe(headerTop)
  const selectedRow = outline.locator('.appearance-editor__outline-node.is-selected')
  await expect(selectedRow).toContainText('Текст')
  const childPath = await selectedRow.getAttribute('data-appearance-selector')
  await selectedRow.locator('xpath=../../..').locator(':scope > .appearance-editor__outline-node .appearance-editor__outline-select').click()
  await expect(outline.locator('.appearance-editor__outline-node.is-selected')).not.toHaveAttribute('data-appearance-selector', childPath)
  await outline.locator(`[data-appearance-selector="${childPath}"] .appearance-editor__outline-select`).click()
  await expect(outline.locator('.appearance-editor__outline-node.is-selected')).toHaveAttribute('data-appearance-selector', childPath)
  await outline.getByRole('button', { name: 'Скрыть структуру' }).click()
  await expect(outline).toHaveCount(0)
  const previousRight = await text.evaluate((node) => [getComputedStyle(node).paddingRight, getComputedStyle(node).marginRight])
  await editor.locator('.appearance-editor__selection').getByText('Размер текста').locator('..').locator('input[type="number"]').fill('24')
  await expect.poll(() => text.evaluate((node) => getComputedStyle(node).fontSize)).toBe('24px')
  await editor.locator('[data-appearance-field="paddingLeft"] input').fill('15')
  await editor.locator('[data-appearance-field="marginTop"] input').fill('12')
  await expect.poll(() => text.evaluate((node) => [getComputedStyle(node).paddingLeft, getComputedStyle(node).marginTop, getComputedStyle(node).paddingRight, getComputedStyle(node).marginRight])).toEqual(['15px', '12px', ...previousRight])
  await editor.getByLabel('Текст элемента').fill('Новое название занятия')
  await expect(text).toHaveText('Новое название занятия')
  await editor.getByRole('button', { name: 'Сравнить с исходным' }).click()
  await expect(text).not.toHaveText('Новое название занятия')
  await editor.getByRole('button', { name: 'Показать мои изменения' }).click()
  await expect(text).toHaveText('Новое название занятия')
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(editor.getByText('Сохранено в файлы проекта.')).toBeVisible()
  expect(state.overrides).toHaveLength(1)
  expect(state.overrides[0].properties).toMatchObject({ fontSize: '24px', paddingLeft: '15px', marginTop: '12px' })
  expect(state.overrides[0].text).toBe('Новое название занятия')
  expect(state.overrides[0].match).toMatch(/^[0-9a-f]{64}$/)
  await editor.getByRole('button', { name: 'Закрыть редактор' }).click()
  const mainText = page.locator('.ops-today-status-list button .ops-session-summary-column > span').first()
  await expect(mainText).toBeVisible()
  await page.evaluate(async (overrides) => {
    const { mountAppearanceText } = await import('/src/app/appearanceText.js')
    window.stopAppearanceTextTest = mountAppearanceText(document, overrides)
  }, state.overrides)
  await expect(mainText).toHaveText('Новое название занятия')
  await page.evaluate(() => window.stopAppearanceTextTest())
  await expect(mainText).not.toHaveText('Новое название занятия')
})

test('appearance editor adds, copies, hides and removes local text blocks', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'desktop editor')
  await mockAdmin(page)
  let state = { values: {}, presets: [], overrides: [], blocks: [] }
  await page.route('**/api/dev/appearance/', (route) => {
    if (route.request().method() === 'POST') state = route.request().postDataJSON().state
    return json(route, { fields: [], state, revision: 'one' })
  })
  await page.goto('/?role=admin&view=overview')
  await page.getByTestId('appearance-editor-open').click()
  const editor = page.getByRole('dialog', { name: 'Редактор оформления' })
  const frame = page.frameLocator('iframe[title="Предпросмотр CRM"]')
  await editor.getByRole('button', { name: 'Отдельный элемент' }).click()
  const heading = frame.locator('#root h1').first()
  await heading.click()
  await editor.getByRole('button', { name: 'Скрыть', exact: true }).click()
  await expect(heading).toHaveCSS('visibility', 'hidden')
  await editor.getByRole('button', { name: 'Показать' }).click()
  await expect(heading).toHaveCSS('visibility', 'visible')
  await editor.getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(heading).toHaveCSS('display', 'none')
  await editor.getByRole('button', { name: 'Восстановить' }).click()
  await expect(heading).not.toHaveCSS('display', 'none')
  await editor.getByRole('button', { name: 'Добавить текст' }).click()
  const blocks = frame.locator('[data-appearance-block-id]')
  await expect(blocks).toHaveCount(1)
  await expect(blocks.first()).toHaveText('Новый текст')
  await heading.click()
  await editor.getByRole('button', { name: 'Копировать' }).click()
  await editor.getByRole('button', { name: 'Вставить' }).click()
  await expect(blocks).toHaveCount(2)
  await editor.getByRole('button', { name: 'Общее оформление' }).click()
  await frame.getByTestId('nav-admin-clients').click()
  await expect(blocks).toHaveCount(0)
  await frame.getByTestId('nav-admin-overview').click()
  await expect(blocks).toHaveCount(2)
  await editor.getByRole('button', { name: 'Отдельный элемент' }).click()
  await blocks.first().click()
  await editor.getByLabel('Текст элемента').fill('Свой текст')
  await expect(blocks.first()).toHaveText('Свой текст')
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(editor.getByText('Сохранено в файлы проекта.')).toBeVisible()
  expect(state.blocks).toHaveLength(2)
  expect(state.blocks[0].text).toBe('Свой текст')
  expect(state.blocks[1].text).toBe(await heading.textContent())
  await editor.getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(blocks).toHaveCount(1)
  await editor.getByRole('button', { name: 'Отменить шаг' }).click()
  await expect(blocks).toHaveCount(2)
  await editor.getByRole('button', { name: 'Закрыть редактор' }).click()
  await page.getByTestId('appearance-editor-open').click()
  await expect(frame.locator('[data-appearance-block-id]')).toHaveCount(2)
})


function json(route, payload) {
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
}

const pagination = { page: 1, page_size: 200, total: 0, pages: 0, has_next: false, has_previous: false }
const emptyCollections = {
  clients: [], trainers: [], groups: [], subscription_types: [], locations: [],
  session_types: [], payments: [], debtors: [], templates: [], rules: [], policies: [],
  translations: [], schemes: [], assignments: [], periods: [], languages: [], keys: [],
  entries: [], batches: [], users: [], logs: [], pagination,
}

async function mockAdmin(page, { clients = [], sessions = [], trainers = [], groups = [], subscriptions = [] } = {}) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/health/') return json(route, { status: 'ok' })
    if (path === '/api/me/') return json(route, { id: 1, username: 'admin', role: 'admin', full_name: 'Audit Administrator' })
    if (path === '/api/admin/dashboard/') return json(route, { metrics: { clients: clients.length, active_subscriptions: 0, debtors: 0 } })
    if (path === '/api/admin/reference/') return json(route, {
      trainers: [{ id: 1, full_name: 'Audit Trainer' }],
      groups: groups.length
        ? groups
        : [{ id: 1, name: 'Audit Group', default_capacity: 8 }],
      subscription_types: [], locations: [{ id: 1, name: 'Pool A' }],
      session_types: [], participants: clients,
      choices: { payment_methods: [], notification_channels: [] },
      notification_settings: {},
    })
    if (path === '/api/admin/clients/') {
      const pageSize = Number(new URL(route.request().url()).searchParams.get('page_size') || 50)
      return json(route, { clients, pagination: { page: 1, page_size: pageSize, total: clients.length, pages: clients.length ? 1 : 0, has_next: false, has_previous: false } })
    }
    if (path === '/api/admin/trainers/') {
      const pageSize = Number(new URL(route.request().url()).searchParams.get('page_size') || 50)
      return json(route, { trainers, pagination: { page: 1, page_size: pageSize, total: trainers.length, pages: trainers.length ? 1 : 0, has_next: false, has_previous: false } })
    }
    if (path === '/api/admin/groups/') {
      const pageSize = Number(new URL(route.request().url()).searchParams.get('page_size') || 50)
      return json(route, { groups, pagination: { page: 1, page_size: pageSize, total: groups.length, pages: groups.length ? 1 : 0, has_next: false, has_previous: false } })
    }
    if (path === '/api/admin/subscriptions/') {
      const pageSize = Number(new URL(route.request().url()).searchParams.get('page_size') || 50)
      return json(route, {
        subscriptions,
        counts: { active: subscriptions.length, ending_soon: 0, depleted: 0, expired_remaining: 0, future: 0, history: 0 },
        pagination: { page: 1, page_size: pageSize, total: subscriptions.length, pages: subscriptions.length ? 1 : 0, has_next: false, has_previous: false },
      })
    }
    if (path === '/api/admin/schedule/sessions/') return json(route, { sessions, pagination: { page: 1, page_size: 200, total: sessions.length, pages: sessions.length ? 1 : 0, has_next: false, has_previous: false } })
    return json(route, emptyCollections)
  })
}

test('dark trainer profile keeps group counts and actions readable', async ({ page }, testInfo) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'phone and desktop dark theme')
  await mockAdmin(page, {
    trainers: [{ id: 1, full_name: 'Audit Trainer', is_active: true, groups_count: 1 }],
    groups: [{ id: 1, name: 'Gold Group', is_active: true, default_trainer: { id: 1, name: 'Audit Trainer' }, color_key: 'gold-01', participants_count: 3 }],
  })
  await page.addInitScript(() => localStorage.setItem('swimcrm.theme', 'dark'))
  await page.goto('/?role=admin&view=trainers')
  await page.locator(page.viewportSize().width < 768 ? '.ops-entity-mobile-list .ops-compact-card-title' : '.ops-entity-desktop-table .ops-link-button')
    .filter({ hasText: 'Audit Trainer' }).click()

  const card = page.locator('.ops-trainer-profile-card')
  const group = card.locator('.ops-trainer-group-link')
  const count = group.locator('.ops-trainer-group-count')
  await expect(group).toBeVisible()
  expect(await page.getByRole('searchbox').evaluate((node) => getComputedStyle(node, '::placeholder').color)).toBe('rgb(172, 196, 220)')
  await expect(group).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(count).toHaveCSS('color', 'rgb(247, 251, 255)')
  expect(await count.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toContain('255, 255, 255')
  await expect(card.locator('.swim-btn--secondary').first()).toHaveCSS('background-color', 'rgb(41, 69, 96)')
  await expect(card.locator('.ops-tabs .is-active')).toHaveCSS('background-color', 'rgb(28, 70, 103)')
  await page.screenshot({ path: testInfo.outputPath('dark-trainer-profile.png'), fullPage: true, animations: 'disabled' })
  await card.screenshot({ path: testInfo.outputPath('dark-trainer-card.png'), animations: 'disabled' })
})

test('attendance opens the selected session editor and returns after saving', async ({ page }) => {
  const session = {
    id: 71, start_at: '2026-09-08T07:45:00+02:00', end_at: '2026-09-08T08:30:00+02:00',
    duration_minutes: 45, session_type: 'group', group: { id: 1, name: 'Audit Group' },
    trainer_id: 1, trainer: 'Audit Trainer', location: 'Pool A', max_participants: 8,
    participants_count: 1, is_cancelled: false, notes: '',
  }
  const trainers = [{ id: 1, full_name: 'Audit Trainer', is_active: true }]
  const groups = [{ id: 1, name: 'Audit Group', is_active: true, default_capacity: 8 }]
  await mockAdmin(page, { sessions: [session], trainers, groups })
  let participant = { id: 5, client_id: 3, full_name: 'Long Participant Name', balance_minor: 0, currency: 'PLN', attendance: null, group: null, can_add_to_group: true, can_remove_from_session: true }
  await page.route('**/api/admin/schedule/sessions/71/attendance/', (route) => json(route, {
    session, history: [], students: [participant],
  }))
  let promotions = 0
  await page.route('**/api/admin/schedule/sessions/71/participants/5/promote/', (route) => {
    promotions += 1
    participant = { ...participant, group: { id: 1, name: 'Audit Group' }, can_add_to_group: false, can_remove_from_session: false }
    return json(route, { session, history: [], students: [participant] })
  })
  let saves = 0
  await page.route('**/api/admin/schedule/sessions/71/', async (route) => {
    if (route.request().method() === 'PATCH') {
      saves += 1
      Object.assign(session, route.request().postDataJSON())
    }
    return json(route, session)
  })
  await page.route('**/api/admin/schedule/check-conflict/', (route) => json(route, { has_conflict: false }))
  await page.goto('/?role=admin&view=attendance&session=71')
  const card = page.locator('.ops-attendance-session-card')
  await expect(page.locator('.ops-attendance-actions button')).toHaveCount(3)
  await expect(page.locator('.ops-attendance-actions button').last()).toHaveText(/Перенос|Перенесення|Przeniesienie|Rescheduled/)
  const oneOffButton = page.locator('.ops-one-off-action button')
  const oneOffPadding = await oneOffButton.evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingLeft))
  expect(oneOffPadding).toBeGreaterThanOrEqual(8)
  await oneOffButton.click()
  const promoteDialog = page.getByRole('dialog')
  await expect(promoteDialog).toContainText('Long Participant Name')
  await expect(promoteDialog).toContainText('Audit Group')
  await promoteDialog.locator('.swim-btn--primary').click()
  await expect(oneOffButton).toHaveCount(0)
  expect(promotions).toBe(1)
  if (page.viewportSize().width < 768) {
    const button = await page.locator('.ops-attendance-actions button').first().boundingBox()
    expect(button.height).toBeLessThanOrEqual(36)
    expect((await card.boundingBox()).height).toBeLessThan(340)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  }
  const toggleDetails = page.getByTestId('admin-attendance-session-toggle')
  await expect(toggleDetails).toHaveAttribute('aria-expanded', 'false')
  await expect(card.locator('#admin-attendance-session-details')).toBeHidden()
  await expect(card).toContainText('Audit Group')
  await toggleDetails.click()
  await expect(card.locator('#admin-attendance-session-details')).toBeVisible()
  await toggleDetails.click()
  await expect(card.locator('#admin-attendance-session-details')).toBeHidden()
  await toggleDetails.click()
  await expect(card.locator('#admin-attendance-session-details')).toBeVisible()
  await page.getByTestId('admin-attendance-edit-session').click()
  const dialog = page.getByTestId('form-modal')
  await expect(dialog.locator('#admin-session-edit-notes')).toHaveValue('')
  await dialog.locator('#admin-session-edit-notes').fill('Updated from attendance')
  await dialog.getByTestId('admin-schedule-edit-save').click()
  await expect(page).toHaveURL(/view=attendance.*session=71/)
  await expect(card).toContainText('Updated from attendance')
  expect(saves).toBe(1)
  await page.getByTestId('admin-attendance-edit-session').click()
  await dialog.locator('.form-modal__footer button').first().click()
  await expect(page).toHaveURL(/view=attendance.*session=71/)
  expect(saves).toBe(1)
})

test('admin clears a selected attendance mark on desktop and phone', async ({ page }) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width || 0), 'attendance layouts')
  const session = {
    id: 71, start_at: '2026-09-08T07:45:00+02:00', end_at: '2026-09-08T08:30:00+02:00',
    session_type: 'group', group: { id: 1, name: 'Audit Group' }, trainer_id: 1,
    trainer: 'Audit Trainer', location: 'Pool A', max_participants: 8,
    participants_count: 1, is_cancelled: false,
  }
  await mockAdmin(page, { sessions: [session], trainers: [{ id: 1, full_name: 'Audit Trainer' }], groups: [{ id: 1, name: 'Audit Group' }] })
  let status = null
  const methods = []
  await page.route('**/api/admin/schedule/sessions/71/attendance/', (route) => {
    const method = route.request().method()
    if (method !== 'GET') {
      methods.push(method)
      status = method === 'DELETE' ? null : route.request().postDataJSON().status
      return json(route, { id: 1, participant_id: 5, session_id: 71, status })
    }
    return json(route, { session, history: [], students: [{
      id: 5, client_id: 3, full_name: 'Jan Kowalski', balance_minor: 0, currency: 'PLN',
      attendance: status ? { status } : null,
    }] })
  })
  await page.goto('/?role=admin&view=attendance&session=71')
  const present = page.getByTestId('admin-attendance-5-present')
  await present.click()
  await expect(present).toHaveAttribute('aria-pressed', 'true')
  await present.click()
  await expect(present).toHaveAttribute('aria-pressed', 'false')
  expect(methods).toEqual(['POST', 'DELETE'])
})

test('schedule form keeps shared control sizing and vertical rhythm', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop style contract is sufficient')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=schedule')
  await page.getByTestId('admin-schedule-create-individual').click()

  const dialog = page.getByTestId('form-modal')
  await expect(dialog).toBeVisible()
  const metrics = await dialog.evaluate((node) => {
    const grid = node.querySelector('.ops-form-grid')
    const label = grid.querySelector('label')
    const select = grid.querySelector('select')
    return {
      rowGap: Number.parseFloat(getComputedStyle(grid).rowGap),
      labelGap: Number.parseFloat(getComputedStyle(label).rowGap),
      selectHeight: select.getBoundingClientRect().height,
      selectRadius: Number.parseFloat(getComputedStyle(select).borderRadius),
    }
  })

  expect(metrics.rowGap).toBeGreaterThanOrEqual(10)
  expect(metrics.labelGap).toBeGreaterThanOrEqual(5)
  expect(metrics.selectHeight).toBeGreaterThanOrEqual(40)
  expect(metrics.selectRadius).toBeGreaterThanOrEqual(6)

  await dialog.locator('#admin-session-date').locator('..').locator('button').click()
  const calendarMetrics = await dialog.locator('.ops-picker-popover').evaluate((node) => {
    const arrows = [...node.querySelectorAll('.ops-picker-head button')]
    const grid = node.querySelector('.ops-date-grid')
    const today = node.querySelector('.ops-date-grid + .ops-picker-today')
    const todayStyle = getComputedStyle(today)
    return {
      arrowRadii: arrows.map((button) => Number.parseFloat(getComputedStyle(button).borderRadius)),
      arrowBackgrounds: arrows.map((button) => getComputedStyle(button).backgroundColor),
      todayRadius: Number.parseFloat(todayStyle.borderRadius),
      todayBackground: todayStyle.backgroundColor,
      todayGap: today.getBoundingClientRect().top - grid.getBoundingClientRect().bottom,
    }
  })
  expect(calendarMetrics.arrowRadii.every((radius) => radius >= 8)).toBe(true)
  expect(calendarMetrics.arrowBackgrounds.every((color) => color !== 'rgb(255, 255, 255)')).toBe(true)
  expect(calendarMetrics.todayRadius).toBeGreaterThanOrEqual(8)
  expect(calendarMetrics.todayBackground).not.toBe('rgb(255, 255, 255)')
  expect(calendarMetrics.todayGap).toBeGreaterThanOrEqual(8)
  await dialog.locator('.ops-date-grid + .ops-picker-today').click()

  await dialog.locator('#admin-session-start').locator('..').locator('button').click()
  const doneMetrics = await dialog.locator('.ops-picker-done').evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      background: style.backgroundColor,
      color: style.color,
      fontWeight: Number.parseInt(style.fontWeight, 10),
      radius: Number.parseFloat(style.borderRadius),
    }
  })
  expect(doneMetrics.background).not.toBe('rgb(255, 255, 255)')
  expect(doneMetrics.color).toBe('rgb(255, 255, 255)')
  expect(doneMetrics.fontWeight).toBeGreaterThanOrEqual(600)
  expect(doneMetrics.radius).toBeGreaterThanOrEqual(6)
})

test('client search results stay opaque and below the input', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop style contract is sufficient')
  await mockAdmin(page, { clients: [
    { id: 1, client_id: 11, first_name: 'Anna', last_name: 'Client', full_name: 'Anna Client', birth_date: '2015-01-01', email: 'anna@example.test', client_phone: '+48111111111', client_is_active: true, is_active: true, group: null },
    { id: 2, client_id: 12, first_name: 'Boris', last_name: 'Client', full_name: 'Boris Client', birth_date: '2014-01-01', email: 'boris@example.test', client_phone: '+48222222222', client_is_active: true, is_active: true, group: null },
  ] })
  await page.goto('/?role=admin&view=schedule')
  await page.getByTestId('admin-schedule-create-individual').click()
  const dialog = page.getByTestId('form-modal')
  const input = dialog.locator('#admin-session-participantId')
  await input.focus()
  const list = dialog.getByRole('listbox')
  await expect(list).toBeVisible()

  const metrics = await list.evaluate((node) => {
    const input = node.closest('.ops-search-select').querySelector('input')
    const inputRect = input.getBoundingClientRect()
    const listRect = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return {
      background: style.backgroundColor,
      shadow: style.boxShadow,
      radius: Number.parseFloat(style.borderRadius),
      startsBelowInput: listRect.top >= inputRect.bottom,
    }
  })

  expect(metrics.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(metrics.shadow).not.toBe('none')
  expect(metrics.radius).toBeGreaterThanOrEqual(6)
  expect(metrics.startsBelowInput).toBe(true)
})

test('schedule navigation and training actions keep application styling', async ({ page }, testInfo) => {
  test.skip(![390, 1440].includes(page.viewportSize()?.width), 'phone and desktop action alignment')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=schedule')
  await expect(page.locator('h1.page-title')).toBeVisible()

  const metrics = await page.evaluate(() => {
    const activeNav = document.querySelector('.ops-nav-button.is-active')
    const action = document.querySelector('.ops-action-card')
    const style = (node) => getComputedStyle(node)
    return {
      navRadius: Number.parseFloat(style(activeNav).borderRadius),
      navBackground: style(activeNav).backgroundColor,
      actionRadius: Number.parseFloat(style(action).borderRadius),
      actionBackground: style(action).backgroundColor,
      actionBorder: Number.parseFloat(style(action).borderTopWidth),
    }
  })

  expect(metrics.navRadius).toBeGreaterThanOrEqual(7)
  expect(metrics.navBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(metrics.actionRadius).toBeGreaterThanOrEqual(10)
  expect(metrics.actionBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(metrics.actionBorder).toBeGreaterThanOrEqual(1)

  const actions = page.locator('.ops-schedule-action-strip')
  await expect(actions.locator('svg')).toHaveCount(4)
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
    const iconOffsets = await actions.locator('button').evaluateAll((buttons) => buttons.map((button) => {
      const card = button.getBoundingClientRect()
      const icon = button.querySelector('svg').getBoundingClientRect()
      return { left: icon.left - card.left, center: icon.top + icon.height / 2 - card.top - card.height / 2 }
    }))
    expect(iconOffsets.every((offset) => Math.abs(offset.left - iconOffsets[0].left) < 1 && Math.abs(offset.center) < 1)).toBe(true)
    await actions.screenshot({ path: testInfo.outputPath(`schedule-actions-${theme}.png`), animations: 'disabled' })
  }
})

test('schedule calendar keeps its desktop and mobile spacing', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one responsive spacing contract is sufficient')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=schedule')

  const calendarSpacing = () => page.locator('.ops-calendar-date-controls').evaluate((node) => {
    const style = getComputedStyle(node)
    return { top: Number.parseFloat(style.marginTop), bottom: Number.parseFloat(style.marginBottom) }
  })

  await expect.poll(calendarSpacing).toEqual({ top: 8, bottom: 8 })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(calendarSpacing).toEqual({ top: 2, bottom: 0 })
  await expect(page.locator('.ops-calendar-toolbar')).toHaveCSS('margin-top', '8px')
  await expect(page.locator('.ops-calendar-date-controls input')).toHaveCSS('margin-bottom', '8px')
  await expect(page.locator('.ops-calendar-date-controls .ops-picker-input button')).toHaveCSS('margin-bottom', '8px')
  await expect(page.locator('.ops-calendar-today')).toHaveCSS('margin-bottom', '8px')
})

test('sidebar shows language above the user and initials only when collapsed', async ({ page }) => {
  test.skip(![768, 1440].includes(page.viewportSize()?.width || 0), 'desktop sidebar boundaries')
  await mockAdmin(page)
  await page.goto('/?role=admin&view=schedule')
  await expect(page.locator('h1.page-title')).toBeVisible()

  const sidebar = page.locator('.ops-sidebar')
  const locale = sidebar.locator('select').filter({ has: page.locator('option[value="uk"]') })
  const name = sidebar.getByText('Audit Administrator', { exact: true })
  const avatar = sidebar.locator('.ops-avatar')
  const logout = sidebar.getByTestId('logout')
  await expect(locale).toBeVisible()
  await expect(logout).toBeVisible()

  if ((page.viewportSize()?.width || 0) === 1440) {
    await expect(sidebar.getByTestId('theme-toggle')).toBeVisible()
    await expect(name).toBeVisible()
    await expect(avatar).toBeHidden()
    const [localeBox, nameBox, logoutBox] = await Promise.all([locale.boundingBox(), name.boundingBox(), logout.boundingBox()])
    expect(localeBox.y + localeBox.height).toBeLessThanOrEqual(nameBox.y)
    expect(logoutBox.x).toBeGreaterThan(nameBox.x)
  } else {
    const themeToggle = sidebar.getByTestId('theme-toggle')
    await expect(themeToggle).toBeVisible()
    await expect(locale.locator('option')).toHaveText(['РУС', 'УКР', 'PL', 'EN'])
    await expect(name).toBeHidden()
    await expect(avatar).toBeVisible()
    await expect(avatar).toHaveText('AA')
    const [sidebarBox, localeBox, themeBox, brandBox, navBox] = await Promise.all([
      sidebar.boundingBox(), locale.boundingBox(), themeToggle.boundingBox(),
      sidebar.locator('.ops-brand-mark').boundingBox(), sidebar.locator('.ops-nav-button').first().boundingBox(),
    ])
    expect(localeBox.x).toBeGreaterThanOrEqual(sidebarBox.x)
    expect(localeBox.x + localeBox.width).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width)
    expect(themeBox.y + themeBox.height).toBeLessThanOrEqual(localeBox.y)
    expect(Math.abs(brandBox.x + brandBox.width / 2 - navBox.x - navBox.width / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(themeBox.x + themeBox.width / 2 - localeBox.x - localeBox.width / 2)).toBeLessThanOrEqual(1)
  }
})

test('trainer rows scroll inside the table on a medium-height screen', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'run once with an explicit medium viewport')
  await page.setViewportSize({ width: 1024, height: 720 })
  const trainers = Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    username: `trainer-${index + 1}`,
    full_name: `Trainer ${String(index + 1).padStart(2, '0')}`,
    email: `trainer-${index + 1}@example.test`,
    phone: `+4899000${String(index + 1).padStart(4, '0')}`,
    is_active: true,
    access_activated: true,
    portal_access: true,
    groups_count: index % 4,
  }))
  await mockAdmin(page, { trainers })
  await page.goto('/?role=admin&view=trainers')
  await expect(page.locator('h1.page-title')).toBeVisible()

  const scroller = page.locator('.ops-trainer-list-scroll > .table-wrap')
  await expect(scroller).toBeVisible()
  const metrics = await scroller.evaluate((node) => {
    const pageScrollBefore = window.scrollY
    node.scrollTop = 100
    return {
      overflowX: getComputedStyle(node).overflowX,
      overflowY: getComputedStyle(node).overflowY,
      hasHorizontalScroll: node.scrollWidth > node.clientWidth,
      hasOwnScroll: node.scrollHeight > node.clientHeight,
      scrollTop: node.scrollTop,
      pageScrollBefore,
      pageScrollAfter: window.scrollY,
    }
  })

  expect(metrics.overflowX).toBe('auto')
  expect(metrics.overflowY).toBe('auto')
  expect(metrics.hasHorizontalScroll).toBe(true)
  expect(metrics.hasOwnScroll).toBe(true)
  expect(metrics.scrollTop).toBeGreaterThan(0)
  expect(metrics.pageScrollAfter).toBe(metrics.pageScrollBefore)
})

test('shared controls never fall back to browser-native styling', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop style contract is sufficient')
  await mockAdmin(page, { clients: [
    { id: 1, client_id: 11, first_name: 'Anna', last_name: 'Client', full_name: 'Anna Client', birth_date: '2015-01-01', email: 'anna@example.test', client_phone: '+48111111111', client_is_active: true, is_active: true, group: { id: 1, name: 'Audit Group' } },
  ] })

  await page.goto('/?role=admin&view=clients')
  await expect(page.locator('h1.page-title')).toBeVisible()
  await page.getByTestId('admin-clients-filter-toggle').click()
  const clientMetrics = await page.evaluate(() => {
    const metrics = (node) => {
      const style = getComputedStyle(node)
      return {
        background: style.backgroundColor,
        borderStyle: style.borderStyle,
        borderTopStyle: style.borderTopStyle,
        radius: Number.parseFloat(style.borderRadius),
        rightRadius: Number.parseFloat(style.borderTopRightRadius),
      }
    }
    return {
      globalSearch: metrics(document.querySelector('.ops-global-search input')),
      listSearch: metrics(document.querySelector('.ops-list-search input')),
      listSelect: metrics(document.querySelector('.ops-list-filter-fields select')),
      entityLink: metrics(document.querySelector('.ops-link-button')),
    }
  })

  for (const [name, control] of Object.entries({ globalSearch: clientMetrics.globalSearch, listSearch: clientMetrics.listSearch, listSelect: clientMetrics.listSelect })) {
    expect(control.borderStyle, `${name} border`).toBe('solid')
    expect(control.radius, `${name} radius`).toBeGreaterThanOrEqual(name === 'globalSearch' ? 6 : 4)
  }
  expect(clientMetrics.entityLink.borderStyle).toBe('none')
  expect(clientMetrics.entityLink.background).toBe('rgba(0, 0, 0, 0)')

  await page.goto('/?role=admin&view=groups')
  await expect(page.locator('h1.page-title')).toBeVisible()
  const listFilterMetrics = await page.locator('.ops-list-filter-toggle').evaluate((node) => {
    const style = getComputedStyle(node)
    return { background: style.backgroundColor, borderStyle: style.borderStyle, radius: Number.parseFloat(style.borderRadius) }
  })
  expect(listFilterMetrics.borderStyle).toBe('solid')
  expect(listFilterMetrics.radius).toBeGreaterThanOrEqual(4)
  expect(listFilterMetrics.background).not.toBe('rgb(240, 240, 240)')

  await page.goto('/?role=admin&view=overview')
  await expect(page.locator('h1.page-title')).toBeVisible()
  const quickActionMetrics = await page.locator('.ops-quick-actions__grid button').first().evaluate((node) => {
    const style = getComputedStyle(node)
    return { background: style.backgroundColor, borderStyle: style.borderStyle, radius: Number.parseFloat(style.borderRadius) }
  })
  expect(quickActionMetrics.borderStyle).toBe('solid')
  expect(quickActionMetrics.radius).toBeGreaterThanOrEqual(6)
  expect(quickActionMetrics.background).not.toBe('rgb(240, 240, 240)')

  await page.goto('/?role=admin&view=schedule')
  await expect(page.locator('h1.page-title')).toBeVisible()
  const scheduleMetrics = await page.evaluate(() => {
    const metrics = (node) => {
      const style = getComputedStyle(node)
      return {
        background: style.backgroundColor,
        borderStyle: style.borderStyle,
        borderTopStyle: style.borderTopStyle,
        radius: Number.parseFloat(style.borderRadius),
        rightRadius: Number.parseFloat(style.borderTopRightRadius),
      }
    }
    return {
      status: metrics(document.querySelector('.ops-status')),
      filter: metrics(document.querySelector('.ops-filter-trigger')),
      today: metrics(document.querySelector('.ops-calendar-today')),
      arrow: metrics(document.querySelector('.ops-calendar-period-arrow')),
      pickerButton: metrics(document.querySelector('.ops-picker-input button')),
    }
  })
  for (const control of [scheduleMetrics.filter, scheduleMetrics.today, scheduleMetrics.arrow]) {
    expect(control.borderStyle).toBe('solid')
    expect(control.radius).toBeGreaterThanOrEqual(6)
    expect(control.background).not.toBe('rgb(240, 240, 240)')
  }
  expect(scheduleMetrics.pickerButton.borderTopStyle).toBe('solid')
  expect(scheduleMetrics.pickerButton.rightRadius).toBeGreaterThanOrEqual(6)
  expect(scheduleMetrics.pickerButton.background).not.toBe('rgb(240, 240, 240)')
  expect(scheduleMetrics.status.radius).toBeGreaterThanOrEqual(6)
  expect(scheduleMetrics.status.background).not.toBe('rgba(0, 0, 0, 0)')
})

test('mobile shell, entity cards and subscription page stay readable at supported widths', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one project exercises every mobile boundary')
  const clients = [{
    id: 1, client_id: 11, first_name: 'Sofiia', last_name: '', full_name: 'Sofiia',
    birth_date: '2015-01-01', email: 'sofiia@example.test', client_phone: '+48111111111',
    client_is_active: true, is_active: true, group: { id: 1, name: 'Audit Group' },
  }]
  const groups = [{
    id: 1, name: 'Audit Group with a long mobile name', description: 'Detail',
    default_trainer: { id: 1, name: 'Audit Trainer' }, participants_count: 1,
    price_minor: 7000, currency: 'PLN', default_capacity: 8, color_key: 'forest-01', is_active: true,
  }]
  const subscriptions = [{
    id: 1, client_id: 11, participant_id: 1, participant_name: 'Sofiia',
    phone: '+48111111111', groups: [{ id: 1, name: 'Audit Group' }], type: '8 sessions',
    remaining_sessions: 4, effective_end_date: '2026-09-20', grace_end_date: '2026-09-27',
    allowed_actions: ['open_client', 'renew', 'freeze', 'adjust'],
  }]
  await mockAdmin(page, { clients, groups, subscriptions })

  for (const width of [320, 360, 390, 430, 767]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/?role=admin&view=clients')
    await page.locator('.ops-mobile-menu-button').click()
    const drawer = page.locator('.ops-mobile-drawer')
    await expect(drawer).toBeVisible()
    await drawer.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)))
    const shell = await drawer.evaluate((node) => {
      const box = node.getBoundingClientRect()
      const nav = node.querySelector('.ops-mobile-drawer-nav')
      return {
        left: box.left, right: box.right, width: box.width,
        background: getComputedStyle(node).backgroundColor,
        navOverflowY: getComputedStyle(nav).overflowY,
        navFits: nav.scrollHeight <= nav.clientHeight + 1,
        itemFontSize: Number.parseFloat(getComputedStyle(nav.querySelector('.ops-nav-button')).fontSize),
        sectionFontSize: Number.parseFloat(getComputedStyle(nav.querySelector('.ops-nav-section')).fontSize),
      }
    })
    expect.soft(shell.left).toBeGreaterThanOrEqual(0)
    expect.soft(shell.right).toBeLessThanOrEqual(width + 1)
    expect.soft(shell.width).toBeLessThanOrEqual(width)
    expect.soft(shell.background).not.toBe('rgba(0, 0, 0, 0)')
    expect.soft(shell.navOverflowY).toBe('auto')
    expect.soft(shell.navFits).toBeTruthy()
    expect.soft(shell.itemFontSize).toBeGreaterThanOrEqual(14)
    expect.soft(shell.sectionFontSize).toBeGreaterThanOrEqual(14)
    await page.locator('.ops-mobile-drawer-close').click()
    const card = page.locator('.ops-compact-entity-card').first()
    await expect(card).toBeVisible()
    const cardBox = await card.boundingBox()
    expect.soft(cardBox.x).toBeGreaterThanOrEqual(0)
    expect.soft(cardBox.x + cardBox.width).toBeLessThanOrEqual(width + 1)
  }

  await page.goto('/?role=admin&view=groups')
  const groupCard = page.locator('.ops-group-compact-card').first()
  await expect(groupCard).toHaveCSS('background-color', 'rgb(232, 245, 233)')
  await expect(groupCard.locator('.ops-compact-card-line strong').first()).toHaveCSS('color', 'rgb(25, 50, 75)')
  await groupCard.locator('.ops-compact-card-title').click()
  const inlineDetail = groupCard.locator('xpath=following-sibling::*[1]')
  await expect(inlineDetail).toHaveClass(/ops-inline-entity-detail/)

  await page.goto('/?role=admin&view=subscriptions')
  await expect(page.locator('.ops-subscriptions-page')).toBeVisible()
  await expect(page.locator('.ops-subscription-card')).toHaveCount(1)
  await expect(page.locator('.ops-subscription-card')).toContainText('Sofiia')
})

test('overview rows, trainer tabs and searchable toggles keep integrated application styling', async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, 'one desktop style contract is sufficient')
  const sessions = [{
    id: 31,
    start_at: '2026-08-27T10:15:00+02:00',
    end_at: '2026-08-27T11:00:00+02:00',
    session_type: 'individual',
    trainer_id: 1,
    trainer: 'Ihor Sosnov',
    group: null,
    location: 'Ciao Factory',
    max_participants: 1,
    participants_count: 1,
    is_cancelled: false,
  }]
  const trainers = [{
    id: 1,
    username: 'ihor',
    full_name: 'Ihor Sosnov',
    email: 'ihor@example.test',
    phone: '+48111111111',
    is_active: true,
    access_activated: true,
    portal_access: true,
    groups_count: 0,
  }]
  const groups = [{
    id: 1,
    name: 'Audit Group',
    description: 'Styled group profile',
    default_trainer: { id: 1, name: 'Ihor Sosnov' },
    default_location: { id: 1, name: 'Pool A', is_active: true },
    participants_count: 0,
    price_minor: 7000,
    currency: 'PLN',
    default_capacity: 8,
    color_key: 'ocean',
    is_active: true,
    next_session: null,
  }]
  const clients = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    client_id: index + 11,
    first_name: `Sofiia ${index + 1}`,
    last_name: '',
    full_name: `Sofiia ${index + 1}`,
    birth_date: '2015-01-01',
    email: `sofiia-${index + 1}@example.test`,
    client_phone: `+4822222222${index}`,
    client_is_active: true,
    is_active: true,
    group: null,
  }))
  await mockAdmin(page, { sessions, trainers, groups, clients })

  await page.goto('/?role=admin&view=schedule')
  await page.getByTestId('admin-schedule-create-individual').click()
  const dialog = page.getByTestId('form-modal')
  const toggle = dialog.locator('.ops-search-select-toggle')
  const toggleMetrics = await toggle.evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      borderTopStyle: style.borderTopStyle,
      borderLeftStyle: style.borderLeftStyle,
      background: style.backgroundColor,
      rightRadius: Number.parseFloat(style.borderTopRightRadius),
      font: style.fontFamily,
    }
  })
  expect.soft(toggleMetrics.borderTopStyle).toBe('none')
  expect.soft(toggleMetrics.borderLeftStyle).toBe('solid')
  expect.soft(toggleMetrics.background).not.toBe('rgb(240, 240, 240)')
  expect.soft(toggleMetrics.rightRadius).toBeGreaterThanOrEqual(6)
  expect.soft(toggleMetrics.font).toContain('IBM Plex Sans')

  await page.goto('/?role=admin&view=overview')
  const row = page.locator('.ops-quick-actions__grid button').first()
  await expect(row).toBeVisible()
  const rowMetrics = await row.evaluate((node) => {
    const style = getComputedStyle(node)
      const parent = node.parentElement.getBoundingClientRect()
    const box = node.getBoundingClientRect()
    return {
      widthRatio: box.width / parent.width,
      borderTopStyle: style.borderTopStyle,
      background: style.backgroundColor,
      paddingLeft: Number.parseFloat(style.paddingLeft),
      font: style.fontFamily,
      cursor: style.cursor,
    }
  })
  expect.soft(rowMetrics.widthRatio).toBeGreaterThan(0.08)
  expect.soft(rowMetrics.borderTopStyle).toBe('solid')
  expect.soft(rowMetrics.background).not.toBe('rgb(240, 240, 240)')
  expect.soft(rowMetrics.paddingLeft).toBeGreaterThanOrEqual(8)
  expect.soft(rowMetrics.font).toContain('IBM Plex Sans')
  expect.soft(rowMetrics.cursor).toBe('pointer')

  await page.goto('/?role=admin&view=trainers')
  await page.locator('.ops-link-button').filter({ hasText: 'Ihor Sosnov' }).click()
  const tabs = page.getByRole('tablist')
  const tabMetrics = await tabs.evaluate((node) => {
    const tabs = [...node.querySelectorAll('[role="tab"]')]
    return tabs.map((tab) => {
      const style = getComputedStyle(tab)
      return {
        borderTopStyle: style.borderTopStyle,
        radius: Number.parseFloat(style.borderRadius),
        background: style.backgroundColor,
        font: style.fontFamily,
        paddingLeft: Number.parseFloat(style.paddingLeft),
      }
    })
  })
  expect.soft(tabMetrics.every((metric) => metric.borderTopStyle === 'none')).toBe(true)
  expect.soft(tabMetrics.every((metric) => metric.radius >= 6)).toBe(true)
  expect.soft(tabMetrics.every((metric) => metric.background !== 'rgb(240, 240, 240)')).toBe(true)
  expect.soft(tabMetrics.every((metric) => metric.font.includes('IBM Plex Sans'))).toBe(true)
  expect.soft(tabMetrics.every((metric) => metric.paddingLeft >= 10)).toBe(true)

  await page.goto('/?role=admin&view=groups')
  await page.locator('.ops-link-button').filter({ hasText: 'Audit Group' }).click()
  await page.locator('.ops-entity-card .ops-section-head button').click()
  const memberDialog = page.getByTestId('form-modal')
  const memberInput = memberDialog.getByRole('combobox')
  await memberInput.focus()
  const memberList = memberDialog.getByRole('listbox')
  await expect(memberList).toBeVisible()
  const memberModalMetrics = await memberDialog.evaluate((node) => {
    const body = node.querySelector('.form-modal__body')
    const list = node.querySelector('.ops-search-select-list')
    const bodyBox = body.getBoundingClientRect()
    const listBox = list.getBoundingClientRect()
    return {
      bodyHasOwnScroll: body.scrollHeight > body.clientHeight + 1,
      listFitsBody: listBox.bottom <= bodyBox.bottom + 1,
      listHeight: listBox.height,
    }
  })
  expect.soft(memberModalMetrics.bodyHasOwnScroll).toBe(false)
  expect.soft(memberModalMetrics.listFitsBody).toBe(true)
  expect.soft(memberModalMetrics.listHeight).toBeGreaterThan(80)
})
