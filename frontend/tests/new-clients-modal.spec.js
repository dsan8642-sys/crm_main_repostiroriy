import { expect, test } from '@playwright/test'

function adminRoutes(clients, groups = []) {
  return {
    '/api/me/': { id: 1, username: 'admin', role: 'admin', full_name: 'Katarzyna Admin' },
    '/api/admin/dashboard/': { metrics: { clients: clients.length, active_subscriptions: 0, debtors: 0 } },
    '/api/admin/reference/': {
      trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [],
      choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
    },
    '/api/admin/clients/': { clients },
    '/api/admin/trainers/': { trainers: [] },
    '/api/admin/groups/': { groups },
    '/api/admin/subscription-types/': { subscription_types: [] },
    '/api/admin/settings/session-types/': { session_types: [] },
    '/api/admin/schedule/sessions/': { sessions: [] },
    '/api/admin/payments/': { payments: [] },
    '/api/admin/debtors/': { debtors: [] },
  }
}

async function mockAdmin(page, clients, { groups = [], participantEditError = null } = {}) {
  const routes = adminRoutes(clients, groups)
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    let payload = routes[url.pathname]
    let status = 200
    if (/^\/api\/admin\/participants\/\d+\/$/.test(url.pathname) && request.method() === 'POST') {
      if (participantEditError) {
        status = 400
        payload = participantEditError
      } else payload = { ok: true }
    } else if (/^\/api\/admin\/clients\/\d+\/$/.test(url.pathname) && request.method() === 'POST') {
      payload = { ok: true }
    } else if (/^\/api\/admin\/clients\/\d+\/$/.test(url.pathname)) {
      const clientId = Number(url.pathname.split('/').at(-2))
      const row = clients.find((client) => client.client_id === clientId)
      payload = {
        account: {
          id: clientId,
          first_name: row?.first_name || '',
          last_name: row?.last_name || '',
          full_name: `${row?.first_name || ''} ${row?.last_name || ''}`.trim(),
          email: row?.email || '',
          username: `client-${clientId}`,
          phone: row?.client_phone || '',
          is_active: row?.client_is_active !== false,
        },
        participants: row ? [row] : [],
        subscriptions: [], charges: [], payments: [], attendance: [], consents: [],
        summary: { participants_count: row ? 1 : 0, active_participants: row?.is_active ? 1 : 0, balance_minor: 0, active_subscriptions: 0, pending_payments: 0 },
      }
    }
    await route.fulfill({
      status: payload ? status : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled endpoint: ${url.pathname}` }),
    })
  })
}

test('archived accounts stay only in blacklist and client editing opens in a modal', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'desktop client contract')
  const activeClients = Array.from({ length: 24 }, (_, index) => ({
    id: index + 1,
    client_id: index + 1,
    first_name: `Active${index + 1}`,
    last_name: 'Client',
    client_phone: `+48000${String(index + 1).padStart(4, '0')}`,
    email: `active${index + 1}@example.test`,
    is_active: true,
    client_is_active: true,
    group: null,
  }))
  const archivedOwner = {
    id: 101, client_id: 99, first_name: 'Archived', last_name: 'Owner',
    client_phone: '+48990000000', email: 'owner@example.test',
    is_active: true, client_is_active: false, is_account_holder: true, group: null,
  }
  const archivedChild = {
    id: 102, client_id: 99, first_name: 'Searchable', last_name: 'Child',
    client_phone: '', email: '', is_active: true, client_is_active: false, group: null,
  }
  await mockAdmin(page, [...activeClients, archivedOwner, archivedChild])

  await page.goto('/?role=admin&view=clients')
  await expect(page.getByText('Найдено: 24')).toBeVisible()
  await expect(page.locator('.ops-client-desktop-table').getByText('Owner Archived', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Статус' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Чёрный список', exact: true }).click()
  await expect(page.getByText('Найдено: 1')).toBeVisible()
  await page.getByLabel('Поиск клиентов').fill('Searchable Child')
  await expect(page.getByText('Найдено: 1')).toBeVisible()

  await page.getByRole('button', { name: 'Клиенты', exact: true }).click()
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
  const editButtons = page.getByRole('button', { name: 'Изменить', exact: true })
  await editButtons.last().scrollIntoViewIfNeeded()
  const before = await page.locator('main').evaluate((node) => node.scrollTop)
  await editButtons.last().click()
  let editor = page.getByRole('dialog', { name: 'Редактирование клиента и участника' })
  await expect(editor).toBeVisible()
  expect(await page.locator('main').evaluate((node) => node.scrollTop)).toBe(before)
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden')

  const closeButton = editor.locator('.form-modal__close')
  await closeButton.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(editor.getByRole('button', { name: 'Сохранить' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
  await expect(editButtons.last()).toBeFocused()
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('')

  await editButtons.last().click()
  editor = page.getByRole('dialog', { name: 'Редактирование клиента и участника' })
  const ownerFirstName = editor.getByLabel('Имя владельца')
  await expect(ownerFirstName).toHaveValue('Active24')
  const originalName = await ownerFirstName.inputValue()
  await ownerFirstName.fill('Несохранённое имя')
  await ownerFirstName.press('Escape')
  const discard = page.getByRole('alertdialog', { name: 'Закрыть без сохранения?' })
  await expect(discard).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(discard).toHaveCount(0)
  await expect(ownerFirstName).toBeFocused()
  await editor.locator('.form-modal__footer').getByRole('button', { name: 'Закрыть' }).click()
  await page.getByRole('button', { name: 'Закрыть без сохранения' }).click()
  await editButtons.last().click()
  editor = page.getByRole('dialog', { name: 'Редактирование клиента и участника' })
  await expect(editor.getByLabel('Имя владельца')).toHaveValue(originalName)
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 961, height: 900 })
  await expect(page.getByRole('columnheader', { name: 'Участник' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Телефон' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Группа' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Баланс' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Email' })).toBeHidden()
  await expect(page.getByRole('columnheader', { name: 'Активность' })).toBeHidden()
  await expect(page.getByRole('columnheader', { name: 'Абонемент' })).toBeHidden()
  await expect(editButtons.last()).toBeVisible()
  const actionBounds = await editButtons.last().locator('xpath=..').evaluate((node) => {
    const box = node.getBoundingClientRect()
    return { left: box.left, right: box.right, viewport: window.innerWidth, pageWidth: document.documentElement.scrollWidth }
  })
  expect(actionBounds.left).toBeGreaterThanOrEqual(0)
  expect(actionBounds.right).toBeLessThanOrEqual(actionBounds.viewport)
  expect(actionBounds.pageWidth).toBeLessThanOrEqual(actionBounds.viewport)
})

test('client group API errors stay beside the modal field and disappear when the modal closes', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop client-error contract check is sufficient')
  const client = {
    id: 7, client_id: 10, first_name: 'Jan', last_name: 'Kowalski',
    client_phone: '+48123456789', email: 'jan@example.test',
    is_active: true, client_is_active: true, group: null,
  }
  await mockAdmin(page, [client], {
    groups: [{
      id: 3, name: 'Masters', description: '', default_trainer: null,
      participants_count: 1, price_minor: null, currency: 'PLN',
      default_capacity: 12, color_key: 'blue', is_active: true,
    }],
    participantEditError: {
      error: 'Проверьте поля формы.',
      errors: { group_id: [{ message: 'Группа недоступна.', code: 'invalid' }] },
    },
  })

  await page.goto('/?role=admin&view=clients')
  await page.getByRole('button', { name: 'Изменить', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Редактирование клиента и участника' })
  const group = modal.locator('#admin-client-edit-groupId')
  await group.selectOption('3')
  await modal.getByRole('button', { name: 'Сохранить' }).click()

  await expect(modal.getByText('Группа недоступна.', { exact: true })).toBeVisible()
  await expect(group).toBeFocused()
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(modal.getByRole('alert')).toHaveCount(1)

  await modal.locator('.form-modal__footer').getByRole('button', { name: 'Закрыть', exact: true }).click()
  await page.getByRole('button', { name: 'Закрыть без сохранения' }).click()
  await expect(modal).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('Группа недоступна.', { exact: true })).toHaveCount(0)
})

test('mobile client card exposes actions without a status pill', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile client contract')
  await mockAdmin(page, [{
    id: 7, client_id: 10, first_name: 'Jan', last_name: 'Kowalski',
    client_phone: '+48123456789', email: 'jan@example.test',
    is_active: true, client_is_active: true, group: null,
  }])

  await page.goto('/?role=admin&view=clients')
  const card = page.locator('.ops-client-mobile-card')
  await expect(card).toBeVisible()
  await expect(card.getByText('Активен', { exact: true })).toHaveCount(0)
  await card.getByRole('button', { name: 'Действия клиента' }).click()
  await expect(page.getByRole('button', { name: 'Изменить', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'В чёрный список', exact: true })).toBeVisible()
})

test('an archived client detail is read-only except for restoration', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'desktop archived-detail contract')
  await mockAdmin(page, [{
    id: 101, client_id: 99, first_name: 'Archived', last_name: 'Owner',
    client_phone: '+48990000000', email: 'owner@example.test',
    is_active: false, client_is_active: false, is_account_holder: true, group: null,
  }])

  await page.goto('/?role=admin&view=clientDetail&client=99')
  await expect(page.getByText('Клиент находится в чёрном списке.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Редактировать клиента' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Восстановить', exact: true })).toBeVisible()
  await expect(page.locator('.ops-action-card:not([disabled])')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Данные и приватность' }).click()
  await expect(page.getByRole('button', { name: 'Скачать данные' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Архивировать' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Анонимизировать' })).toBeDisabled()
})
