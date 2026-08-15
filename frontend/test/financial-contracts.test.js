import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertPaymentReadback,
  createPaymentAttemptKey,
  moneyMajorToMinor,
} from '../src/app/financialContracts.js'

test('money conversion uses exact minor units without rounding', () => {
  assert.equal(moneyMajorToMinor('200'), 20000)
  assert.equal(moneyMajorToMinor('200,5'), 20050)
  assert.equal(moneyMajorToMinor('200.50'), 20050)
  assert.equal(moneyMajorToMinor('0'), null)
  assert.equal(moneyMajorToMinor('1.005'), null)
  assert.equal(moneyMajorToMinor('-1'), null)
  assert.equal(moneyMajorToMinor('not money'), null)
})

test('payment attempt keys are namespaced and unique', () => {
  const first = createPaymentAttemptKey('client-topup')
  const second = createPaymentAttemptKey('client-topup')
  assert.match(first, /^client-topup-[A-Za-z0-9-]+$/)
  assert.notEqual(first, second)
})

test('authoritative read-back requires matching payment, status and audit event', () => {
  const confirmed = { id: 4, status: 'confirmed', events: [{ type: 'confirmed' }] }
  assert.equal(assertPaymentReadback({ id: 4 }, confirmed, 'confirmed'), confirmed)
  assert.throws(
    () => assertPaymentReadback({ id: 4 }, { ...confirmed, id: 5 }, 'confirmed'),
    /read-back/,
  )
  assert.throws(
    () => assertPaymentReadback({ id: 4 }, { ...confirmed, events: [] }, 'confirmed'),
    /audit event/,
  )
})
