import { expect, test } from '@playwright/test'

const recentVisit = new Date().toISOString()
const clients = [
  { id: 1, client_id: 11, first_name: 'Ada', last_name: 'Able', client_phone: '', email: 'ada@example.test', groups: [], balance_minor: 300, has_current_subscription: false, last_present_at: null, is_active: true, client_is_active: true },
  { id: 2, client_id: 12, first_name: 'Ben', last_name: 'Baker', client_phone: '+48111111111', email: 'ben@example.test', groups: [{ id: 4, name: 'Masters' }], balance_minor: 0, has_current_subscription: false, last_present_at: null, is_active: true, client_is_active: true },
  { id: 3, client_id: 13, first_name: 'Cal', last_name: 'Cooper', client_phone: '', email: '', groups: [], balance_minor: -200, has_current_subscription: true, last_present_at: recentVisit, is_active: true, client_is_active: true },
  { id: 4, client_id: 14, first_name: 'Zoe', last_name: 'Zimmer', client_phone: '+48222222222', email: '', groups: [{ id: 5, name: 'Advanced' }], balance_minor: -500, has_current_subscription: true, last_present_at: recentVisit, is_active: true, client_is_active: true },
]

async function mockClients(page) {
  await page.addInitScript(() => localStorage.setItem('swimcrm.ui.locale.1.admin', 'ru'))
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const payload = url.pathname === '/api/me/'
      ? { id: 1, username: 'admin', role: 'admin' }
      : url.pathname === '/api/admin/clients/'
        ? { clients: url.searchParams.get('subscription') === 'with' ? clients.filter((row) => row.has_current_subscription) : clients }
        : url.pathname === '/api/admin/reference/'
          ? { trainers: [], groups: [], subscription_types: [], participants: [], choices: {} }
          : {}
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) })
  })
  await page.goto('/?role=admin&view=clients')
}

test('client table sorts every requested column in both directions and keeps filters', async ({ page }) => {
  test.skip(page.viewportSize().width < 960)
  await mockClients(page)
  const first = () => page.locator('.ops-client-desktop-table tbody tr').first().locator('td:first-child .ops-ellipsis-text').innerText()
  await expect.poll(first).toBe('Able Ada')
  const expected = {
    name: ['Able Ada', 'Zimmer Zoe'],
    phone: ['Baker Ben', 'Able Ada'],
    email: ['Able Ada', 'Cooper Cal'],
    group: ['Baker Ben', 'Able Ada'],
    subscription: ['Cooper Cal', 'Able Ada'],
    balance: ['Zimmer Zoe', 'Able Ada'],
    activity: ['Cooper Cal', 'Able Ada'],
  }
  for (const [key, [forward, reverse]] of Object.entries(expected)) {
    const header = page.getByTestId(`admin-clients-sort-${key}`)
    await header.click()
    await expect.poll(first).toBe(forward)
    await header.click()
    await expect.poll(first).toBe(reverse)
  }
  await page.getByTestId('admin-clients-sort-name').click()
  await expect.poll(first).toBe('Able Ada')
  await page.getByTestId('admin-clients-filter-toggle').click()
  await page.getByTestId('admin-clients-filter-subscription').selectOption('with')
  await page.getByTestId('admin-clients-filter-apply').click()
  await expect(page.locator('.ops-client-desktop-table tbody tr')).toHaveCount(2)
  await page.getByTestId('admin-clients-sort-balance').click()
  await expect.poll(first).toBe('Zimmer Zoe')
})

test('client sorting is available on mobile without changing its default order', async ({ page }) => {
  test.skip(page.viewportSize().width >= 960)
  await mockClients(page)
  const first = () => page.viewportSize().width < 768
    ? page.locator('.ops-client-mobile-list .ops-compact-card-title strong').first().innerText()
    : page.locator('.ops-client-tablet-table tbody tr').first().locator('td:first-child button').innerText()
  await expect.poll(first).toBe('Able Ada')
  const sort = page.getByTestId('admin-clients-sort')
  await sort.selectOption('balance:forward')
  await expect.poll(first).toBe('Zimmer Zoe')
  await sort.selectOption('balance:reverse')
  await expect.poll(first).toBe('Able Ada')
  await sort.selectOption('')
  await expect.poll(first).toBe('Able Ada')
  await sort.selectOption('balance:forward')
  await page.goto('/?role=admin&view=settings')
  await page.goto('/?role=admin&view=clients')
  await expect(page.getByTestId('admin-clients-sort')).toHaveValue('balance:forward')
  await expect.poll(first).toBe('Zimmer Zoe')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})

test('client list keeps its sort and scope after visiting another screen', async ({ page }) => {
  test.skip(page.viewportSize().width !== 1440)
  await mockClients(page)
  const first = page.locator('.ops-client-desktop-table tbody tr').first().locator('td:first-child button')
  await page.getByTestId('admin-clients-sort-balance').click()
  await expect(first).toContainText('Zoe')
  await first.click()
  await expect(page).toHaveURL(/view=clientDetail/)
  await page.locator('.ops-context-back').first().click()
  await expect(first).toContainText('Zoe')
  await page.getByTestId('admin-clients-scope-blacklist').click()
  await page.getByTestId('nav-admin-settings').first().click()
  await page.getByTestId('nav-admin-clients').first().click()
  await expect(page.getByTestId('admin-clients-scope-blacklist')).toHaveClass(/on/)
  await page.getByTestId('admin-clients-scope-active').click()
  await expect(first).toContainText('Zoe')
})
