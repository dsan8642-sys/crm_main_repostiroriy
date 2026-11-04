import assert from 'node:assert/strict'
import test from 'node:test'
import { ageToday } from './participantNotesContracts.js'

test('participant age changes on the birthday and handles a missing date', () => {
  assert.equal(ageToday('2015-05-10', new Date(2026, 4, 9)), 10)
  assert.equal(ageToday('2015-05-10', new Date(2026, 4, 10)), 11)
  assert.equal(ageToday(null, new Date(2026, 4, 10)), null)
})
