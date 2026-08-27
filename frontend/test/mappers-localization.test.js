import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatShortDate,
  mapAdminParticipantRows,
  paymentMethodLabel,
  paymentSourceLabel,
} from '../src/mappers.js'

test('mapper formatting accepts the active UI locale', () => {
  assert.match(formatShortDate('2026-08-26T12:00:00Z', 'en-GB'), /Wed/i)
  assert.match(formatShortDate('2026-08-26T12:00:00Z', 'pl-PL'), /śr/i)
  assert.equal(paymentMethodLabel('card', 'en'), 'Card')
  assert.equal(paymentSourceLabel('client_top_up', 'uk'), 'Запит на поповнення')
})

test('mapped fallback labels follow document language instead of leaking Russian', () => {
  const previousDocument = globalThis.document
  globalThis.document = { documentElement: { lang: 'en' } }
  try {
    const [participant] = mapAdminParticipantRows([{
      id: 7,
      client_id: 3,
      first_name: 'Test',
      last_name: 'Person',
      full_name: 'Test Person',
      is_account_holder: true,
      is_active: true,
    }])
    assert.equal(participant.group, 'Individual')
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})
