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
