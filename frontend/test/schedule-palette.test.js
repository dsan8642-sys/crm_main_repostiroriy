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


test('schedule color rendering accepts only manifest keys and safely falls back', () => {
  assert.equal(normalizeScheduleColorKey('forest-01'), 'forest-01')
  assert.equal(normalizeScheduleColorKey('#ff0000'), 'standard')
  assert.equal(normalizeScheduleColorKey(null), 'standard')
  assert.deepEqual(scheduleColorStyle('forest-01'), {
    '--schedule-color-background': 'light-dark(#E8F5E9, color-mix(in srgb, #2E7D32 22%, var(--surface-card)))',
    '--schedule-color-border': 'light-dark(#2E7D32, color-mix(in srgb, #2E7D32 65%, var(--text-strong)))',
    '--schedule-color-text': 'light-dark(#1B5E20, var(--text-strong))',
  })
  assert.deepEqual(scheduleColorStyle('url(javascript:alert(1))'), {
    '--schedule-color-background': 'light-dark(#EEF6FD, color-mix(in srgb, #1A7DC4 22%, var(--surface-card)))',
    '--schedule-color-border': 'light-dark(#1A7DC4, color-mix(in srgb, #1A7DC4 65%, var(--text-strong)))',
    '--schedule-color-text': 'light-dark(#0F5285, var(--text-strong))',
  })
})
