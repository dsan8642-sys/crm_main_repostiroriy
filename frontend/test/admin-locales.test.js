import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  ADMIN_LOCALES,
  ADMIN_MESSAGE_ROWS,
  adminCatalogs,
  adminLocaleTag,
  adminT,
} from '../src/adminLocales.js'
import { accessCodeClipboardText } from '../src/app/accessContracts.js'
import { validateAdminSessionForm } from '../src/app/scheduleContracts.js'

const ADMIN_SOURCES = [
  'AdminOverviewScreen.jsx',
  'AdminDebtorsScreen.jsx',
  'AdminGroupsScreen.jsx',
  'AdminAttendanceScreen.jsx',
  'AdminTrainersScreen.jsx',
  'AdminReportsPanel.jsx',
  'AdminClientsScreen.jsx',
  'AdminScheduleScreen.jsx',
  'AdminSettingsScreen.jsx',
  'AdminImportExportScreen.jsx',
].map((file) => new URL(`../src/app/screens/${file}`, import.meta.url))

const ADMIN_HELPERS = [
  new URL('../src/app/AccessControls.jsx', import.meta.url),
  new URL('../src/app/GroupMultiSelect.jsx', import.meta.url),
  new URL('../src/app/ScheduleColorPicker.jsx', import.meta.url),
  new URL('../src/app/scheduleContracts.js', import.meta.url),
]


test('every admin message has a non-empty RU, UK, PL and EN translation', () => {
  assert.deepEqual(ADMIN_LOCALES, ['ru', 'uk', 'pl', 'en'])
  assert.ok(Object.keys(ADMIN_MESSAGE_ROWS).length > 0)

  for (const [key, row] of Object.entries(ADMIN_MESSAGE_ROWS)) {
    assert.equal(row.length, ADMIN_LOCALES.length, `${key} must define every locale`)
    row.forEach((value, index) => {
      assert.equal(typeof value, 'string', `${key}/${ADMIN_LOCALES[index]} must be text`)
      assert.ok(value.trim(), `${key}/${ADMIN_LOCALES[index]} must not be empty`)
    })
  }
})

test('admin catalogs have exact key parity and interpolate named values', () => {
  const expected = Object.keys(ADMIN_MESSAGE_ROWS).sort()
  ADMIN_LOCALES.forEach((locale) => {
    assert.deepEqual(Object.keys(adminCatalogs[locale]).sort(), expected)
  })

  assert.equal(adminT('uk', 'overview.title'), 'Сьогодні')
  assert.equal(adminT('pl', 'common.save'), 'Zapisz')
  assert.equal(adminT('en', 'debtors.summary', { count: 7 }), 'Clients: 7')
})

test('admin locale selects the correct browser formatting tag', () => {
  assert.equal(adminLocaleTag('ru'), 'ru-RU')
  assert.equal(adminLocaleTag('uk'), 'uk-UA')
  assert.equal(adminLocaleTag('pl'), 'pl-PL')
  assert.equal(adminLocaleTag('en'), 'en-GB')
})

test('every literal admin translation key used by owned screens and helpers exists', () => {
  const keyPattern = /['"]((?:common|overview|debtors|groups|attendance|trainers|reports|clients|schedule|settings|import|access|scheduleColor)\.[A-Za-z0-9_.-]+)['"]/g
  const missing = []

  for (const sourceUrl of [...ADMIN_SOURCES, ...ADMIN_HELPERS]) {
    const source = readFileSync(sourceUrl, 'utf8')
    for (const match of source.matchAll(keyPattern)) {
      if (!Object.hasOwn(ADMIN_MESSAGE_ROWS, match[1])) missing.push(`${sourceUrl.pathname}: ${match[1]}`)
    }
  }

  assert.deepEqual(missing, [])
})

test('admin-specific helper messages follow the selected locale', () => {
  const pl = (key, params) => adminT('pl', key, params)
  const en = (key, params) => adminT('en', key, params)
  const form = {
    trainerId: '', date: '2026-08-20', start: '17:00', durationMinutes: '60',
    location: 'Pool A', maxParticipants: '2', sessionType: 'group', groupId: '7', price: '',
  }

  assert.equal(validateAdminSessionForm(form, pl).trainerId, 'Wybierz trenera.')
  assert.equal(
    accessCodeClipboardText({ login: 'client-1', activation_code: 'ABC', purpose: 'activation' }, en),
    'Login: client-1\nActivation code: ABC',
  )
})
