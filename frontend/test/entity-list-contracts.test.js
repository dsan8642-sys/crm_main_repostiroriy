import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clientActivity,
  clampedPopoverPosition,
  formatEntityMoney,
  groupRowsByDate,
} from '../src/app/entityListContracts.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 7, 14, 12, 0, 0)
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY)

test('client activity uses inclusive 60 and 180 day club-local boundaries', () => {
  assert.equal(clientActivity(daysAgo(60), NOW).state, 'active')
  assert.equal(clientActivity(daysAgo(61), NOW).state, 'inactive')
  assert.match(clientActivity(daysAgo(180), NOW).label, /15\.02\.2026/)
  assert.match(clientActivity(daysAgo(181), NOW).label, /последние 6 месяцев/)
  assert.match(clientActivity(null, NOW).label, /последние 6 месяцев/)
})

test('client activity day boundaries use the club timezone, not the browser timezone', () => {
  const result = clientActivity(
    new Date('2026-06-15T21:30:00Z'),
    new Date('2026-08-14T22:30:00Z'),
  )
  assert.equal(result.days, 61)
  assert.equal(result.state, 'inactive')
})

test('entity money uses a real minus sign and preserves zero', () => {
  assert.equal(formatEntityMoney(-200), '−200 zł')
  assert.equal(formatEntityMoney(0), '0 zł')
})

test('history grouping preserves row and first-seen date order', () => {
  assert.deepEqual(groupRowsByDate([
    { id: 1, date: '2026-08-14' },
    { id: 2, date: '2026-08-14' },
    { id: 3, date: '2026-08-13' },
  ]), [
    { key: '2026-08-14', rows: [{ id: 1, date: '2026-08-14' }, { id: 2, date: '2026-08-14' }] },
    { key: '2026-08-13', rows: [{ id: 3, date: '2026-08-13' }] },
  ])
})

test('popover position is clamped and flips above a bottom-edge trigger', () => {
  const position = clampedPopoverPosition({
    anchor: { top: 730, bottom: 774, right: 386 },
    menu: { width: 220, height: 180 },
    viewport: { width: 390, height: 844 },
  })
  assert.equal(position.left, 162)
  assert.equal(position.top, 544)
  assert.ok(position.left >= 8)
  assert.ok(position.top >= 8)
})
