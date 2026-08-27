import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_UI_LOCALE,
  SUPPORTED_UI_LOCALES,
  applyUiLocale,
  localeStorageKey,
  normalizeUiLocale,
  readScopedUiLocale,
  uiLocaleTag,
} from '../src/localeContracts.js'


test('web UI supports Russian, Ukrainian, Polish and English', () => {
  assert.deepEqual(SUPPORTED_UI_LOCALES, ['ru', 'uk', 'pl', 'en'])
  assert.equal(DEFAULT_UI_LOCALE, 'ru')
  assert.equal(normalizeUiLocale('UA'), 'uk')
  assert.equal(normalizeUiLocale('uk-UA'), 'uk')
  assert.equal(normalizeUiLocale('de'), 'ru')
  assert.equal(uiLocaleTag('ua'), 'uk-UA')
  assert.equal(uiLocaleTag('pl'), 'pl-PL')
})

test('locale storage is scoped to the authenticated user and role', () => {
  assert.equal(localeStorageKey({ userId: 17, role: 'admin' }), 'swimcrm.ui.locale.17.admin')
  assert.equal(localeStorageKey({ userId: 17, role: 'trainer' }), 'swimcrm.ui.locale.17.trainer')
  assert.equal(localeStorageKey({ userId: 18, role: 'admin' }), 'swimcrm.ui.locale.18.admin')

  const values = new Map([
    ['swimcrm.ui.locale.17.admin', 'pl'],
    ['swimcrm.ui.locale.18.admin', 'en'],
  ])
  const storage = { getItem: (key) => values.get(key) || null }
  assert.equal(readScopedUiLocale(storage, { userId: 17, role: 'admin' }), 'pl')
  assert.equal(readScopedUiLocale(storage, { userId: 18, role: 'admin' }), 'en')
  assert.equal(readScopedUiLocale(storage, { userId: 19, role: 'admin' }), 'ru')
  assert.equal(readScopedUiLocale(storage, null), 'ru')
})

test('active document language is updated synchronously before locale-sensitive mapping', () => {
  const documentLike = { documentElement: { lang: 'ru' } }
  assert.equal(applyUiLocale(documentLike, 'ua'), 'uk')
  assert.equal(documentLike.documentElement.lang, 'uk')
})
