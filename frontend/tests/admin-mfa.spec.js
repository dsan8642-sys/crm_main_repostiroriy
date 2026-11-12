import { expect, test } from '@playwright/test'

test('pending admin MFA keeps private APIs closed until the code is verified', async ({ page }) => {
  let authenticated = false
  let verified = false
  let privateRequests = 0
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/health/') return json({ status: 'ok' })
    if (path === '/api/csrf/') return json({ csrf_token: 'test-csrf' })
    if (path === '/api/me/') return authenticated
      ? json({ id: 1, username: 'admin', role: 'admin', mfa_required: !verified })
      : json({ error: 'Authentication required' }, 403)
    if (path === '/api/auth/login/') {
      authenticated = true
      return json({ ok: true, user: { id: 1, username: 'admin', role: 'admin' }, mfa_required: true })
    }
    if (path === '/api/auth/mfa/status/') return json({ required: true, verified, configured: true })
    if (path === '/api/auth/mfa/verify/') {
      if (request.postDataJSON().code !== '123456') return json({ error: 'Invalid code' }, 400)
      verified = true
      return json({ ok: true, user: { id: 1, username: 'admin', role: 'admin' } })
    }
    if (path.startsWith('/api/admin/')) privateRequests += 1
    return json({ error: 'No fixture' }, 404)
  })

  await page.goto('/')
  await page.locator('#auth-login').fill('admin')
  await page.locator('#auth-password').fill('password')
  await page.getByTestId('auth-submit').click()
  await expect(page.locator('#mfa-login-code')).toBeVisible()
  expect(privateRequests).toBe(0)
  await page.locator('#mfa-login-code').fill('000000')
  await page.locator('#mfa-login-code').press('Enter')
  await expect(page.getByRole('alert')).toContainText('Invalid code')
  expect(privateRequests).toBe(0)
  await page.locator('#mfa-login-code').fill('123456')
  await page.locator('#mfa-login-code').press('Enter')
  await expect(page.locator('#mfa-login-code')).toHaveCount(0)
  await expect.poll(() => privateRequests).toBeGreaterThan(0)
})

test('new administrator can defer the first-login MFA offer', async ({ page }) => {
  let authenticated = false
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/health/') return json({ status: 'ok' })
    if (path === '/api/csrf/') return json({ csrf_token: 'test-csrf' })
    if (path === '/api/me/') return authenticated
      ? json({ id: 2, username: 'invited', role: 'admin', mfa_required: false })
      : json({ error: 'Authentication required' }, 403)
    if (path === '/api/auth/login/') {
      authenticated = true
      return json({ ok: true, user: { id: 2, username: 'invited', role: 'admin' }, offer_mfa_setup: true })
    }
    if (path === '/api/admin/dashboard/') return json({ metrics: {} })
    return json({ error: 'No fixture' }, 404)
  })
  await page.goto('/')
  await page.locator('#auth-login').fill('invited')
  await page.locator('#auth-password').fill('password')
  await page.getByTestId('auth-submit').click()
  const offer = page.getByRole('dialog')
  await expect(offer.locator('#mfa-current-password')).toBeVisible()
  await offer.getByRole('button', { name: /Настроить позже|Налаштувати пізніше|Skonfiguruj później|Set up later/ }).click()
  await expect(offer).toHaveCount(0)
  await expect(page.locator('h1.page-title')).toBeVisible()
})
