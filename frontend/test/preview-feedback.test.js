import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calendarDates,
  calendarRange,
  DEFAULT_SCHEDULE_VIEW,
  moveCalendarFocus,
  newSessionCapacity,
  periodCountLabel,
  periodSessionCount,
  validateAdminSessionForm,
  validIsoDate,
  validTime,
} from '../src/app/scheduleContracts.js'
import { mapAdminPortalData, mapClientPortalData, mapTrainerSession } from '../src/mappers.js'
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

test('new group sessions prefer the group capacity without changing saved sessions', () => {
  assert.equal(newSessionCapacity({ groupCapacity: 12, typeCapacity: 8, currentCapacity: 4 }), '12')
  assert.equal(newSessionCapacity({ groupCapacity: null, typeCapacity: 8, currentCapacity: 4 }), '8')
  assert.equal(newSessionCapacity({ groupCapacity: null, typeCapacity: null, currentCapacity: 4 }), '4')
})

test('admin group mapper preserves nullable default capacity', () => {
  const common = {
    reference: {}, clients: {}, trainers: {}, subscriptionTypes: {}, sessionTypeConfigs: {},
    sessions: {}, payments: {}, debtors: {},
  }
  const withCapacity = mapAdminPortalData({
    ...common,
    groups: { groups: [{ id: 1, name: 'Delfiny', participants_count: 3, default_capacity: 12, color_key: 'forest-01' }] },
  }).groups[0]
  const withoutCapacity = mapAdminPortalData({
    ...common,
    groups: { groups: [{ id: 2, name: 'Foki', participants_count: 1, default_capacity: null }] },
  }).groups[0]

  assert.equal(withCapacity.defaultCapacity, 12)
  assert.equal(withCapacity.colorKey, 'forest-01')
  assert.equal(withoutCapacity.defaultCapacity, null)
  assert.equal(withoutCapacity.colorKey, 'standard')
})

test('admin client mapper exposes balance subscription and recent activity metadata', () => {
  const common = {
    reference: {}, trainers: {}, groups: {}, subscriptionTypes: {}, sessionTypeConfigs: {},
    sessions: {}, payments: {}, debtors: {},
  }
  const client = mapAdminPortalData({
    ...common,
    clients: { clients: [{
      id: 7,
      client_id: 3,
      first_name: 'Anna',
      last_name: 'Nowak',
      balance_minor: -500,
      currency: 'PLN',
      has_current_subscription: true,
      current_subscription_remaining: 2,
      current_subscription_total: 4,
      is_recently_active: true,
      last_present_at: '2026-08-01T17:00:00+02:00',
      is_active: true,
      client_is_active: true,
    }] },
  }).clients[0]

  assert.equal(client.balance, 5)
  assert.equal(client.currency, 'PLN')
  assert.equal(client.hasCurrentSubscription, true)
  assert.equal(client.currentSubscriptionRemaining, 2)
  assert.equal(client.currentSubscriptionTotal, 4)
  assert.equal(client.isRecentlyActive, true)
  assert.equal(client.lastPresentAt, '2026-08-01T17:00:00+02:00')
})

test('schedule mappers normalize the server presentation key for every role', () => {
  const trainer = mapTrainerSession({
    id: 1,
    start_at: '2026-08-02T10:00:00+02:00',
    end_at: '2026-08-02T11:00:00+02:00',
    presentation_color_key: 'coral-01',
    presentation_type_label: 'Персональная тренировка',
    participants_count: 6,
    max_participants: 15,
  })
  assert.equal(trainer.colorKey, 'coral-01')
  assert.equal(trainer.sessionTypeLabel, 'Персональная тренировка')
  assert.equal(trainer.count, 6)
  assert.equal(trainer.limit, 15)

  const common = {
    reference: {}, clients: {}, trainers: {}, groups: {}, subscriptionTypes: {}, sessionTypeConfigs: {},
    payments: {}, debtors: {},
  }
  const admin = mapAdminPortalData({
    ...common,
    sessions: { sessions: [{
      id: 2,
      start_at: '2026-08-02T12:00:00+02:00',
      end_at: '2026-08-02T13:00:00+02:00',
      presentation_color_key: 'not-approved',
      presentation_type_label: 'Групповая тренировка',
    }] },
  }).sessions[0]
  assert.equal(admin.colorKey, 'standard')
  assert.equal(admin.sessionTypeLabel, 'Групповая тренировка')

  const client = mapClientPortalData({
    overview: { account: {}, participants: [{ id: 7, full_name: 'Client', group: null }] },
    profile: {}, consents: {}, attendance: {}, payments: {}, notifications: {},
    schedule: {
      student_id: 7,
      sessions: [{
        id: 3,
        start_at: '2026-08-02T14:00:00+02:00',
        end_at: '2026-08-02T15:00:00+02:00',
        presentation_color_key: 'gold-01',
        presentation_type_label: 'Split для двоих',
        participants_count: 1,
        max_participants: 2,
      }],
    },
  }).schedule.s7[0]
  assert.equal(client.colorKey, 'gold-01')
  assert.equal(client.sessionTypeLabel, 'Split для двоих')
  assert.equal(client.count, 1)
  assert.equal(client.limit, 2)
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

test('session duration must use five-minute increments for create and edit forms', () => {
  const base = {
    trainerId: '2',
    date: '2026-08-12',
    start: '17:00',
    location: 'Pool A',
    maxParticipants: '8',
    sessionType: 'group',
    groupId: '3',
    participantId: '',
    price: '',
    notes: '',
  }

  assert.equal(validateAdminSessionForm({ ...base, durationMinutes: '15' }).durationMinutes, undefined)
  assert.equal(validateAdminSessionForm({ ...base, durationMinutes: '480' }).durationMinutes, undefined)
  assert.match(validateAdminSessionForm({ ...base, durationMinutes: '17' }).durationMinutes, /5/)
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
