import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeScheduleColorKey,
  scheduleColorStyle,
  schedulePaletteOptions,
} from '../src/app/schedulePalette.js'


test('approved schedule palette exposes Standard and exactly 30 named colors', () => {
  assert.equal(schedulePaletteOptions.length, 31)
  assert.deepEqual(schedulePaletteOptions[0], {
    key: 'standard',
    label: 'Стандартный',
    background: '#EEF6FD',
    border: '#1A7DC4',
    text: '#0F5285',
  })
  assert.equal(new Set(schedulePaletteOptions.map((option) => option.key)).size, 31)
})


test('schedule color rendering accepts palette keys and valid custom HEX, then safely falls back', () => {
  assert.equal(normalizeScheduleColorKey('forest-01'), 'forest-01')
  assert.equal(normalizeScheduleColorKey('#FF0000'), '#ff0000')
  assert.deepEqual(scheduleColorStyle('#FF0000'), {
    '--schedule-color-background': 'color-mix(in srgb, #ff0000 18%, white)',
    '--schedule-color-border': 'color-mix(in srgb, #ff0000 45%, #d6dbe0)',
    '--schedule-color-text': '#19324b',
  })
  assert.equal(normalizeScheduleColorKey('#ff00zz'), 'standard')
  assert.equal(normalizeScheduleColorKey(null), 'standard')
  assert.deepEqual(scheduleColorStyle('forest-01'), {
    '--schedule-color-background': '#E8F5E9',
    '--schedule-color-border': '#2E7D32',
    '--schedule-color-text': '#1B5E20',
  })
  assert.deepEqual(scheduleColorStyle('url(javascript:alert(1))'), {
    '--schedule-color-background': '#EEF6FD',
    '--schedule-color-border': '#1A7DC4',
    '--schedule-color-text': '#0F5285',
  })
})
