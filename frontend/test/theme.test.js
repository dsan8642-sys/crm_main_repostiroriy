import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTheme, readTheme, THEME_STORAGE_KEY } from '../src/app/theme.js'

test('theme persists, rejects invalid preferences and works without browser storage', (t) => {
  const values = new Map()
  const oldDocument = globalThis.document
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  t.after(() => {
    globalThis.document = oldDocument
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage)
    else delete globalThis.localStorage
  })
  globalThis.document = { documentElement: { dataset: {} } }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  } })
  assert.equal(readTheme(), 'light')
  assert.equal(applyTheme('dark'), 'dark')
  assert.equal(document.documentElement.dataset.theme, 'dark')
  assert.equal(readTheme(), 'dark')
  values.set(THEME_STORAGE_KEY, 'invalid')
  assert.equal(readTheme(), 'light')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
  assert.equal(readTheme(), 'light')
  assert.equal(applyTheme('dark'), 'dark')
  assert.equal(document.documentElement.dataset.theme, 'dark')
})
