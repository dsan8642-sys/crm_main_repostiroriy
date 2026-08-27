import { expect, test } from '@playwright/test'


test.beforeEach(async ({ page }) => {
  await page.route('**/api/health/', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ status: 'ok' }),
  }))
  await page.route('**/api/me/', (route) => route.fulfill({
    status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Login required' }),
  }))
})

test('login language selector cycles RU to UK, PL and EN without mixing auth labels', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) !== 1440, 'one desktop locale contract')
  await page.goto('/')

  const selector = page.locator('form select').first()
  await expect(selector).toHaveAccessibleName('Язык интерфейса')
  await expect(selector).toHaveValue('ru')
  await expect(page.getByText('Вход в систему')).toBeVisible()

  await selector.selectOption('uk')
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk')
  await expect(page.getByText('Вхід до системи')).toBeVisible()
  await expect(page.getByText('Вход в систему')).toHaveCount(0)

  await selector.selectOption('pl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
  await expect(page.getByText('Logowanie')).toBeVisible()

  await selector.selectOption('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})
