import test from 'node:test'
import assert from 'node:assert/strict'

import { adminTranslator } from '../src/adminLocales.js'
import { validateAdminSessionForm as rawValidateAdminSessionForm } from '../src/app/scheduleContracts.js'

const ru = adminTranslator('ru')
const validateAdminSessionForm = (form) => rawValidateAdminSessionForm(form, ru)

function validSplitForm(overrides = {}) {
  return {
    trainerId: '7',
    date: '2026-08-20',
    start: '17:00',
    durationMinutes: '60',
    location: 'Pool A',
    maxParticipants: '2',
    sessionType: 'split',
    participantId: '101',
    secondParticipantId: '',
    requireSecondParticipant: true,
    rosterCount: 1,
    extraParticipantCount: 0,
    price: '120',
    ...overrides,
  }
}

test('split opened from a client profile requires a different second client', () => {
  assert.equal(
    validateAdminSessionForm(validSplitForm()).secondParticipantId,
    'Выберите второго клиента для сплит-тренировки.',
  )
  assert.equal(
    validateAdminSessionForm(validSplitForm({ secondParticipantId: '101' })).secondParticipantId,
    'Выберите другого второго клиента.',
  )
  assert.equal(
    validateAdminSessionForm(validSplitForm({ secondParticipantId: '202' })).secondParticipantId,
    undefined,
  )
})
