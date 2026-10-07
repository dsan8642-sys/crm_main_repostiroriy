import { expect, test } from '@playwright/test'


const EMPTY_ADMIN = {
  '/api/admin/dashboard/': {},
  '/api/admin/reference/': { trainers: [], groups: [], subscription_types: [], locations: [], participants: [], choices: {} },
  '/api/admin/clients/': { clients: [] },
  '/api/admin/trainers/': { trainers: [] },
  '/api/admin/groups/': { groups: [] },
  '/api/admin/subscription-types/': { subscription_types: [] },
  '/api/admin/settings/session-types/': { session_types: [] },
  '/api/admin/schedule/sessions/': { sessions: [] },
  '/api/admin/payments/': { payments: [] },
  '/api/admin/debtors/': { debtors: [] },
  '/api/admin/notifications/templates/': { templates: [] },
  '/api/admin/notifications/rules/': { rules: [] },
  '/api/admin/notifications/quiet-hours/': { policies: [] },
  '/api/admin/settings/notification-template-translations/': { translations: [] },
  '/api/admin/payroll/schemes/': { schemes: [] },
  '/api/admin/payroll/rules/': { rules: [] },
  '/api/admin/payroll/assignments/': { assignments: [] },
  '/api/admin/payroll/periods/': { periods: [] },
  '/api/admin/settings/locations/': { locations: [] },
  '/api/admin/settings/languages/': { languages: [] },
  '/api/admin/settings/dictionary-keys/': { keys: [] },
  '/api/admin/settings/dictionary-translations/': { translations: [] },
  '/api/admin/system/audit/': { entries: [] },
  '/api/admin/system/imports/': { batches: [] },
  '/api/admin/system/security/': { users: [] },
  '/api/admin/notifications/logs/': { logs: [] },
}


test('admin settings editors use dirty-aware form modals and keep errors inside', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop contract check is sufficient')
  let locationAttempts = 0
  let credentialsPayload = null

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    let status = 200
    let payload = EMPTY_ADMIN[path]

    if (path === '/api/me/') payload = { id: 1, username: 'admin', full_name: 'Admin User', role: 'admin' }
    else if (path === '/api/csrf/') payload = { ok: true }
    else if (path === '/api/admin/system/credentials/' && method === 'GET') payload = { username: 'admin', role: 'admin' }
    else if (path === '/api/admin/settings/locations/' && method === 'POST') {
      locationAttempts += 1
      if (locationAttempts === 1) {
        status = 400
        payload = {
          error: 'Проверьте поля формы.',
          errors: { address: [{ message: 'Адрес отклонён.', code: 'invalid' }] },
        }
      } else {
        status = 201
        payload = { id: 2, ...request.postDataJSON() }
      }
    } else if (path === '/api/admin/system/credentials/' && method === 'PATCH') {
      credentialsPayload = request.postDataJSON()
      payload = { ok: true, username: credentialsPayload.username, role: 'admin' }
    }
    if (!payload) {
      status = 404
      payload = { error: `Unhandled test endpoint: ${method} ${path}` }
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
  })

  await page.goto('/')
  await page.getByTestId('nav-admin-settings').first().click()
  await expect(page.locator('h1.page-title')).toBeVisible()

  await page.getByTestId('admin-settings-resource-locations').first().click()
  await page.locator('.ops-settings-detail .ops-section-head button').click()
  const editor = page.getByTestId('form-modal')
  await expect(editor).toBeVisible()
  await editor.locator('#admin-settings-locations-code').fill('pool-modal')
  await editor.getByTestId('form-modal-close').click()
  await expect(page.getByTestId('discard-dialog')).toBeVisible()
  await page.getByTestId('discard-keep-editing').click()
  await expect(editor.locator('#admin-settings-locations-code')).toHaveValue('pool-modal')

  await editor.locator('#admin-settings-locations-name').fill('Modal Pool')
  await editor.locator('#admin-settings-locations-address').fill('Warsaw')
  await editor.locator('.form-modal__footer button').first().click()
  await expect(editor).toBeVisible()
  await expect(editor.getByText('Адрес отклонён.')).toBeVisible()
  await editor.locator('#admin-settings-locations-address').fill('Krakow')
  await editor.locator('.form-modal__footer button').first().click()
  await expect(editor).toHaveCount(0)
  await expect.poll(() => locationAttempts).toBe(2)

  await page.getByTestId('admin-settings-category-control').first().click()
  await page.getByTestId('admin-settings-resource-credentials').first().click()
  const credentials = page.getByTestId('form-modal')
  await expect(credentials.locator('#admin-credentials-username')).toHaveValue('admin')
  await credentials.locator('#admin-credentials-username').fill('admin-modal')
  await credentials.locator('#admin-credentials-current-password').fill('CurrentPass!123')
  await credentials.locator('.form-modal__footer button').first().click()
  await expect(credentials).toHaveCount(0)
  expect(credentialsPayload).toEqual({
    username: 'admin-modal',
    current_password: 'CurrentPass!123',
    new_password: '',
  })
})

test('an initially busy form modal owns focus until its fields finish loading', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop focus contract check is sufficient')
  let releaseCredentials
  const credentialsGate = new Promise((resolve) => { releaseCredentials = resolve })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let payload = EMPTY_ADMIN[path]

    if (path === '/api/me/') payload = { id: 1, username: 'admin', full_name: 'Admin User', role: 'admin' }
    else if (path === '/api/csrf/') payload = { ok: true }
    else if (path === '/api/admin/system/credentials/' && request.method() === 'GET') {
      await credentialsGate
      payload = { username: 'admin', role: 'admin' }
    }

    await route.fulfill({
      status: payload ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: `Unhandled busy-modal endpoint: ${request.method()} ${path}` }),
    })
  })

  await page.goto('/')
  await page.getByTestId('nav-admin-settings').first().click()
  await page.getByTestId('admin-settings-category-control').first().click()
  await page.getByTestId('admin-settings-resource-credentials').first().click()

  const modal = page.getByTestId('form-modal')
  try {
    await expect(modal).toBeVisible()
    await expect(modal.evaluate((node) => node.contains(document.activeElement))).resolves.toBe(true)
    await page.keyboard.press('Tab')
    await expect(modal.evaluate((node) => node.contains(document.activeElement))).resolves.toBe(true)
  } finally {
    releaseCredentials()
  }

  await expect(modal.locator('#admin-credentials-username')).toHaveValue('admin')
})
