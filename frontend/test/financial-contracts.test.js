import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertChargeReadback,
  assertPaymentReadback,
  createPaymentAttemptKey,
  moneyMajorToMinor,
  rebasePassiveFormUpdate,
  summarizeAttendanceCharges,
  subscriptionPaymentFields,
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

test('visit charge history shows only the current net account deduction', () => {
  const original = { id: 1, attendance_id: 7, amount_minor: 6500, currency: 'PLN' }
  const correction = { ...original, id: 2, amount_minor: -6500 }
  const restored = { ...original, id: 3 }
  const manual = { id: 4, attendance_id: null, amount_minor: 1000, currency: 'PLN' }
  const covered = summarizeAttendanceCharges([correction, original, manual])
  assert.equal(covered.totals.get('7').amount_minor, 0)
  assert.deepEqual(covered.visible, [manual])

  const account = summarizeAttendanceCharges([restored, correction, original, manual])
  assert.equal(account.totals.get('7').amount_minor, 6500)
  assert.deepEqual(account.visible, [restored, manual])
})

test('payment attempt keys are namespaced and unique', () => {
  const first = createPaymentAttemptKey('client-topup')
  const second = createPaymentAttemptKey('client-topup')
  assert.match(first, /^client-topup-[A-Za-z0-9-]+$/)
  assert.notEqual(first, second)
})

test('subscription payment fields are included only for a selected full payment', () => {
  assert.deepEqual(subscriptionPaymentFields({ received: false, method: 'cash', date: '2026-09-15' }), {
    payment_received: false,
  })
  assert.deepEqual(subscriptionPaymentFields({ received: true, method: 'card', date: '2026-09-15' }), {
    payment_received: true,
    payment_method: 'card',
    payment_date: '2026-09-15',
  })
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

test('authoritative charge read-back requires matching history and balance', () => {
  const mutation = { id: 7, status: 'active', balance_minor: 5000 }
  const detail = { summary: { balance_minor: 5000 }, charges: [{ id: 7, status: 'active' }] }
  assert.equal(assertChargeReadback(mutation, detail), detail.charges[0])
  assert.throws(
    () => assertChargeReadback(mutation, { ...detail, summary: { balance_minor: 0 } }),
    /read-back/,
  )

  const reversed = { id: 7, status: 'reversed', balance_minor: 0 }
  const reversedDetail = { summary: { balance_minor: 0 }, charges: [{ id: 7, status: 'reversed', reversal: { reason: 'Duplicate' } }] }
  assert.equal(assertChargeReadback(reversed, reversedDetail), reversedDetail.charges[0])
})

test('passive subscription defaults rebase only an untouched finance form', () => {
  const baseline = { participantId: '1', subscriptionId: '', amount: '' }
  const untouched = rebasePassiveFormUpdate(baseline, baseline, { subscriptionId: '7' })
  assert.deepEqual(untouched.form, { ...baseline, subscriptionId: '7' })
  assert.equal(untouched.baseline, untouched.form)

  const edited = { ...baseline, amount: '100' }
  const preserved = rebasePassiveFormUpdate(edited, baseline, { subscriptionId: '7' })
  assert.deepEqual(preserved.form, { ...edited, subscriptionId: '7' })
  assert.equal(preserved.baseline, baseline)
})
