import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'


const liveAuditEnabled = process.env.SWIMCRM_WAVE6_LIVE === '1'
let credentials

test.skip(!liveAuditEnabled, 'Requires the isolated Wave 6 audit environment.')

async function login(page, role) {
  if (!credentials) {
    const credentialsUrl = new URL('../../audit/00-environment/runtime/2026-08-12-192945-2bdf/credentials.json', import.meta.url)
    credentials = JSON.parse((await readFile(credentialsUrl, 'utf8')).replace(/^\uFEFF/, ''))
  }
  const account = credentials[role]
  await page.goto('/')
  await page.getByLabel('Логин, email или телефон').fill(account.username)
  await page.locator('#auth-password').fill(account.password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.locator('main')).toBeVisible()
  await page.waitForLoadState('networkidle')
}

function collectRuntimeFailures(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console:${message.text()}`)
  })
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || ''
    if (!/net::ERR_ABORTED|Load request cancelled/i.test(failure)) errors.push(`request:${request.method()} ${request.url()} ${failure}`)
  })
  return errors
}

async function expectStableGeometry(page) {
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('main')
    const nested = [...document.querySelectorAll('.ops-entity-mobile-list,.ops-client-mobile-list,.ops-settings-mobile-list,.ops-action-strip,.table-wrap')]
      .filter((node) => {
        const style = getComputedStyle(node)
        const horizontal = ['auto', 'scroll'].includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1
        const vertical = ['auto', 'scroll'].includes(style.overflowY) && node.scrollHeight > node.clientHeight + 1
        return horizontal || vertical
      })
      .map((node) => ({ className: node.className, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }))
    return {
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      mainOverflow: main ? main.scrollWidth > main.clientWidth + 1 : true,
      nested,
    }
  })
  expect(geometry, JSON.stringify(geometry)).toEqual({ documentOverflow: false, mainOverflow: false, nested: [] })
}

test('Wave 6 Admin cross-browser navigation, filters, geometry and keyboard contract', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page, 'admin')
  const errors = collectRuntimeFailures(page)
  await page.goto('/?role=admin&view=schedule')
  await expect(page.getByRole('heading', { level: 1, name: 'Расписание' })).toBeVisible()
  const trigger = page.getByRole('button', { name: /Фильтры/ })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Фильтры расписания' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expectStableGeometry(page)
  if ((page.viewportSize()?.width || 0) >= 768) {
    await page.setViewportSize({ width: 720, height: 900 })
    await expectStableGeometry(page)
    await page.setViewportSize({ width: 360, height: 800 })
    await expectStableGeometry(page)
  }
  expect(errors).toEqual([])
})

test('Wave 6 Trainer cross-browser role boundary, drawer keyboard and geometry contract', async ({ page }) => {
  await login(page, 'trainer')
  const errors = collectRuntimeFailures(page)
  await page.goto('/?role=trainer&view=history')
  await expect(page.getByRole('heading', { level: 1, name: 'История' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Фильтры расписания' })).toHaveCount(0)
  await expect(page.getByLabel('Тип тренировки')).toHaveCount(0)
  if ((page.viewportSize()?.width || 0) <= 767) {
    const menu = page.getByRole('button', { name: 'Открыть меню' })
    await menu.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Меню' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()
  }
  await expectStableGeometry(page)
  expect(errors).toEqual([])
})

test('Wave 6 Client cross-browser tabs, role boundary and geometry contract', async ({ page }) => {
  await login(page, 'client')
  const errors = collectRuntimeFailures(page)
  await page.goto('/?role=client&view=payments')
  await expect(page.getByRole('heading', { level: 1, name: 'Платежи' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Фильтры расписания' })).toHaveCount(0)
  await expect(page.getByLabel('Тип тренировки')).toHaveCount(0)
  if ((page.viewportSize()?.width || 0) <= 767) {
    const historyTab = page.getByRole('tab', { name: 'История' })
    await historyTab.focus()
    await page.keyboard.press('Space')
    await expect(historyTab).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Начисления' }).click()
  }
  await expectStableGeometry(page)
  expect(errors).toEqual([])
})
