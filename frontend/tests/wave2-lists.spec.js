import { expect, test } from '@playwright/test'


function clientRow(index) {
  return {
    id: index,
    client_id: 1000 + index,
    first_name: `Person${index}`,
    last_name: 'Wave',
    full_name: `Person${index} Wave`,
    client_phone: `+48000${String(index).padStart(4, '0')}`,
    email: `person${index}@example.test`,
    is_active: true,
    client_is_active: true,
    has_current_subscription: index % 2 === 1,
    is_recently_active: index % 3 === 0,
    balance_minor: 0,
    group: null,
  }
}

test('screen-owned clients enforce Wave 2 search, filters and page policy', async ({ page }) => {
  const width = page.viewportSize()?.width || 0
  test.skip(![390, 1440].includes(width), 'Wave 2 list contract uses one mobile and one desktop viewport')
  const allClients = Array.from({ length: 75 }, (_, index) => clientRow(index + 1))
  const clientEndpointRequests = []
  const listRequests = []
  let failNextMobilePage = false

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const staticRoutes = {
      '/api/health/': { status: 'ok', service: 'swimcrm' },
      '/api/me/': { id: 901, username: 'wave2-admin', role: 'admin', full_name: 'Wave Two Admin' },
      '/api/admin/dashboard/': { metrics: { clients: 75, active_subscriptions: 38, debtors: 0 } },
      '/api/admin/reference/': {
        trainers: [], groups: [], subscription_types: [], locations: [], session_types: [], participants: [],
        choices: { payment_methods: [], notification_channels: [] }, notification_settings: {},
      },
      '/api/admin/trainers/': { trainers: [], pagination: { page: 1, page_size: 200, total: 0, pages: 0, has_next: false, has_previous: false } },
      '/api/admin/groups/': { groups: [], pagination: { page: 1, page_size: 200, total: 0, pages: 0, has_next: false, has_previous: false } },
      '/api/admin/subscription-types/': { subscription_types: [], pagination: { page: 1, page_size: 200, total: 0, pages: 0, has_next: false, has_previous: false } },
      '/api/admin/settings/session-types/': { session_types: [], pagination: { page: 1, page_size: 200, total: 0, pages: 0, has_next: false, has_previous: false } },
      '/api/admin/payments/': { payments: [], pagination: { page: 1, page_size: 1, total: 0, pages: 0, has_next: false, has_previous: false } },
      '/api/admin/debtors/': { debtors: [], pagination: { page: 1, page_size: 1, total: 0, pages: 0, has_next: false, has_previous: false } },
    }
    if (url.pathname !== '/api/admin/clients/') {
      const payload = staticRoutes[url.pathname]
      await route.fulfill({
        status: payload ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(payload || { error: `Unhandled endpoint: ${url.pathname}` }),
      })
      return
    }

    const pageNumber = Number(url.searchParams.get('page') || 1)
    const pageSize = Number(url.searchParams.get('page_size') || 50)
    const isScreenRequest = url.searchParams.get('active') === 'true'
    clientEndpointRequests.push(url)
    if (isScreenRequest) listRequests.push(url)
    if (isScreenRequest && width === 390 && pageNumber === 2 && failNextMobilePage) {
      failNextMobilePage = false
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic next-page failure' }) })
      return
    }
    const search = (url.searchParams.get('search') || '').toLocaleLowerCase('ru-RU')
    const subscription = url.searchParams.get('subscription')
    let rows = allClients
    if (search) rows = rows.filter((row) => row.full_name.toLocaleLowerCase('ru-RU').includes(search))
    if (subscription) rows = rows.filter((row) => row.has_current_subscription === (subscription === 'with'))
    const total = rows.length
    const start = (pageNumber - 1) * pageSize
    const pageRows = rows.slice(start, start + pageSize)
    const pages = Math.ceil(total / pageSize)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        clients: pageRows,
        pagination: {
          page: pageNumber,
          page_size: pageSize,
          total,
          pages,
          has_next: pageNumber < pages,
          has_previous: pageNumber > 1,
        },
      }),
    })
  })

  await page.goto('/?role=admin&view=clients')
  const rows = width === 390
    ? page.locator('.ops-client-mobile-list article')
    : page.locator('.ops-client-desktop-table tbody tr')
  await expect(rows).toHaveCount(width === 390 ? 20 : 50)
  await expect(page.getByText('Найдено: 75')).toBeVisible()
  expect(clientEndpointRequests.every((url) => url.searchParams.get('active') === 'true')).toBe(true)
  expect(listRequests.some((url) => url.searchParams.get('page_size') === (width === 390 ? '20' : '50'))).toBe(true)

  const searchInput = page.getByLabel('Поиск клиентов')
  await searchInput.fill('P')
  await page.waitForTimeout(400)
  expect(listRequests.some((url) => url.searchParams.get('search') === 'P')).toBe(false)
  await searchInput.fill('Person7')
  await expect.poll(() => listRequests.some((url) => url.searchParams.get('search') === 'Person7')).toBe(true)
  await expect(page.getByText('Найдено: 7')).toBeVisible()

  await searchInput.fill('')
  await expect(page.getByText('Найдено: 75')).toBeVisible()
  const beforeDraft = listRequests.length
  await page.getByLabel('Абонемент').selectOption('with')
  await page.waitForTimeout(350)
  expect(listRequests.length).toBe(beforeDraft)
  await page.getByRole('button', { name: /Применить/ }).click()
  await expect.poll(() => listRequests.some((url) => url.searchParams.get('subscription') === 'with')).toBe(true)
  await expect(page.getByText('Найдено: 38')).toBeVisible()
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
  await expect(page.getByText('Найдено: 75')).toBeVisible()

  if (width === 390) {
    failNextMobilePage = true
    await page.getByRole('button', { name: 'Показать ещё' }).click()
    await expect(page.getByRole('alert')).toContainText('Synthetic next-page failure')
    await expect(rows).toHaveCount(20)
    await page.getByRole('button', { name: 'Повторить' }).click()
    await expect(rows).toHaveCount(40)
    expect(listRequests.some((url) => url.searchParams.get('page') === '2' && url.searchParams.get('page_size') === '20')).toBe(true)
  } else {
    const size500 = page.locator('.ops-list-pagination select option[value="500"]')
    expect(await size500.evaluate((option) => option.disabled)).toBe(true)
    await page.getByRole('button', { name: '2', exact: true }).click()
    await expect(rows).toHaveCount(25)
    expect(listRequests.some((url) => url.searchParams.get('page') === '2' && url.searchParams.get('page_size') === '50')).toBe(true)
  }
})
