import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ADMIN_FINANCE_LOCALES,
  ADMIN_FINANCE_MESSAGE_ROWS,
  adminFinanceCatalogs,
  adminFinanceT,
} from '../src/adminFinanceLocales.js'


test('every admin finance message has a non-empty RU, UK, PL and EN translation', () => {
  assert.deepEqual(ADMIN_FINANCE_LOCALES, ['ru', 'uk', 'pl', 'en'])
  assert.ok(Object.keys(ADMIN_FINANCE_MESSAGE_ROWS).length > 0)

  for (const [key, row] of Object.entries(ADMIN_FINANCE_MESSAGE_ROWS)) {
    assert.equal(row.length, ADMIN_FINANCE_LOCALES.length, `${key} must define every locale`)
    row.forEach((value, index) => {
      assert.equal(typeof value, 'string', `${key}/${ADMIN_FINANCE_LOCALES[index]} must be text`)
      assert.ok(value.trim(), `${key}/${ADMIN_FINANCE_LOCALES[index]} must not be empty`)
    })
  }
})

test('admin finance catalogs have exact key parity and interpolate named values', () => {
  const expected = Object.keys(ADMIN_FINANCE_MESSAGE_ROWS).sort()
  ADMIN_FINANCE_LOCALES.forEach((locale) => {
    assert.deepEqual(Object.keys(adminFinanceCatalogs[locale]).sort(), expected)
  })

  assert.equal(adminFinanceT('uk', 'payments.title'), 'Платежі')
  assert.equal(adminFinanceT('pl', 'finance.frozenDays', { count: 3 }), 'Karnet zamrożono na 3 dni.')
  assert.equal(adminFinanceT('en', 'common.save'), 'Save')
})

test('admin finance translator falls back to the requested key when no catalog owns it', () => {
  assert.equal(adminFinanceT('en', 'finance.unknownKey'), 'finance.unknownKey')
})
