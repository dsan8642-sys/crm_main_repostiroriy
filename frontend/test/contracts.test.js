import test from 'node:test'
import assert from 'node:assert/strict'

import { PAYMENT_METHODS, errorCode, participantKey, paymentMethodLabel, resourceState, safeErrorMessage } from '../src/contracts.js'
import { fetchResourceMap } from '../src/api.js'

test('resource states are discriminated and reject unknown variants', () => {
  assert.deepEqual(resourceState('ok', { data: [1] }), { state: 'ok', data: [1] })
  assert.throws(() => resourceState('stale'), /Unknown resource state/)
})

test('secondary resource failure preserves successful resources', async () => {
  const result = await fetchResourceMap({
    primary: async () => ({ id: 1 }),
    secondary: async () => { const error = new Error('raw'); error.status = 500; throw error },
  })
  assert.deepEqual(result.values.primary, { id: 1 })
  assert.deepEqual(result.values.secondary, {})
  assert.equal(result.resourceStates.secondary.state, 'error')
})

test('authorization failures remain a hard boundary', async () => {
  await assert.rejects(
    fetchResourceMap({
      primary: async () => ({ id: 1 }),
      private: async () => { const error = new Error('raw'); error.status = 403; throw error },
    }),
    (error) => error.status === 403 && error.resourceStates.primary.state === 'ok',
  )
})

test('safe errors, payment methods and keys are deterministic', () => {
  assert.equal(errorCode(403), 'forbidden')
  assert.equal(safeErrorMessage(500, 'en'), 'The service is temporarily unavailable.')
  assert.deepEqual(PAYMENT_METHODS.map((item) => item.code), ['cash', 'bank_transfer', 'card', 'other'])
  assert.equal(paymentMethodLabel('card', 'pl'), 'Karta')
  assert.equal(participantKey(4, 9), 'client-4-participant-9')
  assert.throws(() => participantKey(null, 9))
})
