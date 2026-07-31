import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calendarDates,
  calendarRange,
  DEFAULT_SCHEDULE_VIEW,
  moveCalendarFocus,
  periodCountLabel,
  periodSessionCount,
  validateAdminSessionForm,
  validIsoDate,
  validTime,
} from '../src/app/scheduleContracts.js'
import { accessCodeClipboardText } from '../src/app/accessContracts.js'
import { toastReducer } from '../src/app/toastContracts.js'

test('date and time contracts accept only real ISO and 24-hour values', () => {
  assert.equal(validIsoDate('2026-07-29'), true)
  assert.equal(validIsoDate('2026-02-30'), false)
  assert.equal(validIsoDate('29.07.2026'), false)
  assert.equal(validTime('00:00'), true)
  assert.equal(validTime('23:59'), true)
  assert.equal(validTime('24:00'), false)
  assert.equal(validTime('8:30'), false)
})

test('month range contains visible adjacent-month dates', () => {
  const dates = calendarDates('2026-08-15', 'month')
  assert.equal(dates[0], '2026-07-27')
  assert.equal(dates[4], '2026-07-31')
  assert.deepEqual(calendarRange('2026-08-15', 'month'), {
    dateFrom: '2026-07-27',
    dateTo: '2026-09-06',
  })
})

test('calendar navigation moves exactly one selected period', () => {
  assert.equal(moveCalendarFocus('2026-07-29', 'day', 1), '2026-07-30')
  assert.equal(moveCalendarFocus('2026-07-29', 'week', -1), '2026-07-22')
  assert.equal(moveCalendarFocus('2026-01-31', 'month', 1), '2026-02-28')
})

test('new session validation identifies fields while notes stay optional', () => {
  const errors = validateAdminSessionForm({
    trainerId: '',
    date: 'not-a-date',
    start: '',
    durationMinutes: '5',
    location: '',
    maxParticipants: '0',
    sessionType: 'individual',
    participantId: '',
    price: '-1',
    notes: '',
  })
  assert.deepEqual(Object.keys(errors), [
    'trainerId', 'date', 'start', 'durationMinutes', 'location',
    'maxParticipants', 'participantId', 'price',
  ])
  assert.equal(errors.notes, undefined)
})

test('period count excludes adjacent month cells and labels the active period', () => {
  const sessions = [
    { startAt: '2026-07-31T17:00:00+02:00' },
    { startAt: '2026-08-01T17:00:00+02:00' },
    { startAt: '2026-08-31T17:00:00+02:00' },
    { startAt: '2026-09-01T17:00:00+02:00' },
  ]
  assert.equal(periodSessionCount(sessions, '2026-08-15', 'month'), 2)
  assert.equal(periodSessionCount(sessions, '2026-08-15', 'week'), 4)
  assert.equal(periodCountLabel(2, 'month'), 'За месяц: 2')
  assert.equal(DEFAULT_SCHEDULE_VIEW, 'week')
})

test('combined access code clipboard text follows activation purpose', () => {
  assert.equal(
    accessCodeClipboardText({ login: 'client-1', activation_code: 'ABC', purpose: 'activation' }),
    'Логин: client-1\nКод активации: ABC',
  )
  assert.equal(
    accessCodeClipboardText({ login: 'client-1', activation_code: 'XYZ', purpose: 'recovery' }),
    'Логин: client-1\nКод восстановления: XYZ',
  )
})

test('toast stable IDs replace loading state and keep a bounded stack', () => {
  const loading = toastReducer([], {
    type: 'show',
    toast: { id: 'schedule-save', tone: 'loading', message: 'Сохраняю' },
  })
  const success = toastReducer(loading, {
    type: 'show',
    toast: { id: 'schedule-save', tone: 'success', message: 'Сохранено' },
  })
  assert.equal(success.length, 1)
  assert.equal(success[0].tone, 'success')
  assert.deepEqual(toastReducer(success, { type: 'dismiss', id: 'schedule-save' }), [])
})
