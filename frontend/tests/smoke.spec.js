import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', service: 'swimcrm' }),
    })
  })
  await page.route('**/api/me/', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Login required' }),
    })
  })
})

test('SPA renders without a blank shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()
  await expect(page.getByText('SwimCRM').first()).toBeVisible()

  const bodyText = (await page.locator('body').innerText()).trim()
  expect(bodyText.length).toBeGreaterThan(20)
})

test('icon-only buttons have accessible names', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()

  const unnamedIconButtons = await page.locator('button').evaluateAll((buttons) => (
    buttons.filter((button) => {
      const visibleText = button.textContent?.trim()
      return !visibleText && !button.getAttribute('aria-label') && !button.getAttribute('title')
    }).length
  ))

  expect(unnamedIconButtons).toBe(0)
})
