import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api, apiErrorMessage, fetchAllPages } from '../../api.js'
import { formatTime, mapAdminClientRows } from '../../mappers.js'
import { DateField, TimeField } from '../DateTimeField.jsx'
import { FormModal } from '../FormModal.jsx'
import {
  CalendarNavigation,
  eventAccessibleLabel,
  ScheduleCalendar,
  ScheduleEventContent,
  ScheduleViewSwitcher,
} from '../ScheduleCalendar.jsx'
import {
  calendarRange,
  DEFAULT_SCHEDULE_VIEW,
  localToday,
  newSessionCapacity,
  periodCountLabel,
  periodSessionCount,
  sessionIsoDate,
  validIsoDate,
  validTime,
  validateAdminSessionForm,
} from '../scheduleContracts.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'
import { normalizeScheduleColorKey, scheduleColorStyle } from '../schedulePalette.js'
import {
  clearFieldError,
  fieldErrorsFromApi,
  focusFirstFieldError,
  formErrorMessage,
} from '../formErrors.js'

const EMPTY_SCHEDULE_FILTERS = {
  sessionType: '',
  trainerId: '',
  groupId: '',
  location: '',
  status: '',
}

const SESSION_FIELD_MAP = {
  session_type: 'sessionType',
  group_id: 'groupId',
  individual_student_id: 'participantId',
  second_student_id: 'secondParticipantId',
  trainer_id: 'trainerId',
  start_at: ['date', 'start'],
  duration_minutes: 'durationMinutes',
  location: 'location',
  max_participants: 'maxParticipants',
  price_minor: 'price',
  notes: 'notes',
}

const COPY_FIELD_IDS = {
  sourceFrom: 'admin-schedule-copy-source-from',
  sourceTo: 'admin-schedule-copy-source-to',
  targetFrom: 'admin-schedule-copy-target-from',
  targetTo: 'admin-schedule-copy-target-to',
  includeGroup: 'admin-schedule-copy-include-group',
  includeIndividual: 'admin-schedule-copy-include-individual',
  includeSplit: 'admin-schedule-copy-include-split',
  selectedIndices: 'admin-schedule-copy-selected-indices',
}

const SESSION_FIELD_IDS = {
  sessionType: 'admin-session-sessionType',
  groupId: 'admin-session-groupId',
  participantId: 'admin-session-participantId',
  secondParticipantId: 'admin-session-secondParticipantId',
  trainerId: 'admin-session-trainerId',
  date: 'admin-session-date',
  start: 'admin-session-start',
  durationMinutes: 'admin-session-durationMinutes',
  location: 'admin-session-location',
  maxParticipants: 'admin-session-maxParticipants',
  price: 'admin-session-price',
  notes: 'admin-session-notes',
}

function normalizeSession(session) {
  if (session.startAt) return session
  const participant = session.individual_participant || null
  const roster = session.roster || (participant ? [participant] : [])
  return {
    id: `s${session.id}`,
    sessionId: session.id,
    date: String(session.start_at || '').slice(0, 10),
    startAt: session.start_at,
    endAt: session.end_at,
    groupId: session.group?.id || '',
    trainerId: session.trainer_id || '',
    notes: session.notes || '',
    sessionType: session.session_type || 'group',
    sessionTypeLabel: session.presentation_type_label || '',
    colorKey: normalizeScheduleColorKey(session.presentation_color_key),
    isCancelled: Boolean(session.is_cancelled),
    start: formatTime(session.start_at),
    end: formatTime(session.end_at),
    durationMinutes: session.duration_minutes || 60,
    priceMinor: session.price_minor,
    currency: session.currency,
    group: session.group?.name || 'Индивидуальное',
    trainer: session.effective_trainer || session.trainer,
    location: session.location,
    count: session.participants_count || 0,
    limit: session.max_participants || 0,
    status: session.is_cancelled ? 'cancelled' : 'planned',
    individualParticipant: participant,
    roster,
    secondStudentId: Object.prototype.hasOwnProperty.call(session, 'second_student_id')
      ? session.second_student_id || ''
      : roster[1]?.id || '',
  }
}

function fieldLabelStyle() {
  return { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }
}

async function loadParticipantOptions(query, requestOptions = {}) {
  const payload = await api.get(`/api/admin/reference/?q=${encodeURIComponent(query)}`, requestOptions)
  return mapAdminClientRows(payload.participants || []).active
    .map((participant) => clientSelectOption(participant))
}

export function createAdminScheduleScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Button, Badge, Banner, Dialog, Input, Checkbox } = components
  const I = icons
  return function ApiAdminSchedule({ go, initialTab, initialParticipantId, createSession: createSessionMode }) {
    const groups = adminData.groups || []
    const trainers = adminData.trainers || []
    const activeTrainers = trainers.filter((trainer) => trainer.active !== false)
    const participants = adminData.clients || []
    const sessionTypeConfigs = adminData.sessionTypeConfigs || []
    const configuredLocations = adminData.locations || []
    const [scheduleSessions, setScheduleSessions] = useState(
      () => (adminData.sessions || []).map(normalizeSession),
    )
    const [sessionForm, setSessionForm] = useState({
      groupId: groups[0]?.groupId || '',
      trainerId: activeTrainers[0]?.trainerId || '',
      date: localToday(),
      start: '17:00',
      durationMinutes: '60',
      price: '',
      location: configuredLocations[0]?.name || '',
      maxParticipants: newSessionCapacity({
        groupCapacity: groups[0]?.defaultCapacity,
        typeCapacity: sessionTypeConfigs.find((item) => item.code === 'group')?.default_capacity,
        currentCapacity: 10,
      }),
      notes: '',
      sessionType: 'group',
      participantId: '',
      secondParticipantId: '',
      requireSecondParticipant: false,
      rosterCount: 0,
      extraParticipantCount: 0,
    })
    const [copyForm, setCopyForm] = useState({
      sourceFrom: '',
      sourceTo: '',
      targetFrom: '',
      targetTo: '',
      includeGroup: true,
      includeIndividual: true,
      includeSplit: true,
    })
    const [copyPreview, setCopyPreview] = useState(null)
    const [editingSession, setEditingSession] = useState(null)
    const [sessionFormBaseline, setSessionFormBaseline] = useState(null)
    const [copyFormBaseline, setCopyFormBaseline] = useState(null)
    const [sessionEditBaseline, setSessionEditBaseline] = useState(null)
    const [confirmDelete, setConfirmDelete] = useState(null)
    const [sessionEditForm, setSessionEditForm] = useState({
      sessionType: 'group',
      groupId: '',
      participantId: '',
      secondParticipantId: '',
      rosterCount: 0,
      extraParticipantCount: 0,
      trainerId: '',
      date: '',
      start: '',
      durationMinutes: '60',
      price: '',
      location: '',
      maxParticipants: '',
      notes: '',
    })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [loadError, setLoadError] = useState(null)
    const [fieldErrors, setFieldErrors] = useState({})
    const [editFieldErrors, setEditFieldErrors] = useState({})
    const [copyFieldErrors, setCopyFieldErrors] = useState({})
    const [busy, setBusy] = useState(false)
    const [actionPanel, setActionPanel] = useState(null)
    const [displayMode, setDisplayMode] = useState('calendar')
    const [viewMode, setViewMode] = useState(DEFAULT_SCHEDULE_VIEW)
    const [focusDate, setFocusDate] = useState(localToday())
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [filters, setFilters] = useState({ ...EMPTY_SCHEDULE_FILTERS })
    const [draftFilters, setDraftFilters] = useState({ ...EMPTY_SCHEDULE_FILTERS })
    const filterPopoverRef = useRef(null)
    const [rangeRefresh, setRangeRefresh] = useState(0)
    const createRouteHandledRef = useRef(null)

    useEffect(() => {
      if (actionPanel === 'session') setSessionFormBaseline({ ...sessionForm })
      else setSessionFormBaseline(null)
      if (actionPanel === 'copy') setCopyFormBaseline({ ...copyForm })
      else setCopyFormBaseline(null)
    }, [actionPanel])

    useEffect(() => {
      if (!filtersOpen) return undefined
      const closeWithoutApplying = () => {
        setDraftFilters({ ...filters })
        setFiltersOpen(false)
      }
      const onPointerDown = (event) => {
        if (!filterPopoverRef.current?.contains(event.target)) closeWithoutApplying()
      }
      const onKeyDown = (event) => {
        if (event.key === 'Escape') closeWithoutApplying()
      }
      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
      return () => {
        document.removeEventListener('pointerdown', onPointerDown)
        document.removeEventListener('keydown', onKeyDown)
      }
    }, [filters, filtersOpen])

    useEffect(() => {
      if (['day', 'week', 'month'].includes(initialTab)) setViewMode(initialTab)
      if (['calendar', 'list'].includes(initialTab)) setDisplayMode(initialTab)
    }, [initialTab])

    useEffect(() => {
      if (!['individual', 'split'].includes(createSessionMode) || !initialParticipantId) return
      const routeKey = `${createSessionMode}:${initialParticipantId}`
      if (createRouteHandledRef.current === routeKey) return
      createRouteHandledRef.current = routeKey
      openSessionShortcut(createSessionMode, initialParticipantId, true)
    }, [createSessionMode, initialParticipantId])

    const range = useMemo(
      () => calendarRange(focusDate, viewMode),
      [focusDate, viewMode],
    )

    useEffect(() => {
      let active = true
      const query = new URLSearchParams({
        date_from: range.dateFrom,
        date_to: range.dateTo,
      })
      setLoadError(null)
      fetchAllPages(`/api/admin/schedule/sessions/?${query}`, 'sessions', 200)
        .then((payload) => {
          if (active) setScheduleSessions((payload.sessions || []).map(normalizeSession))
        })
        .catch((err) => {
          if (active) setLoadError(apiErrorMessage(err, 'Не удалось обновить календарь.'))
        })
      return () => { active = false }
    }, [range.dateFrom, range.dateTo, rangeRefresh])

    const updateSessionForm = (field, value) => {
      setSessionForm((current) => ({ ...current, [field]: value }))
      setFieldErrors((current) => {
        if (!current[field]) return current
        const next = { ...current }
        delete next[field]
        return next
      })
    }
    const updateSessionEditForm = (field, value) => {
      setSessionEditForm((current) => ({ ...current, [field]: value }))
      setEditFieldErrors((current) => clearFieldError(current, field))
    }
    const updateCopyForm = (field, value) => {
      setCopyForm((current) => ({ ...current, [field]: value }))
      setCopyFieldErrors((current) => clearFieldError(current, field))
    }

    const locations = [...new Set([
      ...configuredLocations.map((location) => location.name),
      ...scheduleSessions.map((session) => session.location),
    ].filter(Boolean))]
    const fixedTypeDefaults = [
      { code: 'group', label: 'Групповое' },
      { code: 'individual', label: 'Индивидуальное' },
      { code: 'split', label: 'Сплит для двоих' },
    ]
    const sessionTypeOptions = fixedTypeDefaults.map((fixed) => (
      sessionTypeConfigs.find((item) => item.code === fixed.code) || fixed
    ))
    const splitReady = sessionTypeConfigs.length === 0 || sessionTypeConfigs.some(
      (item) => item.code === 'split' && item.is_active !== false && item.configured !== false,
    )

    const visibleSessions = scheduleSessions.filter((session) => (
      sessionIsoDate(session) >= range.dateFrom
      && sessionIsoDate(session) <= range.dateTo
      && (!filters.sessionType || session.sessionType === filters.sessionType)
      && (!filters.trainerId || String(session.trainerId) === filters.trainerId)
      && (!filters.groupId || String(session.groupId) === filters.groupId)
      && (!filters.location || session.location === filters.location)
      && (!filters.status || (filters.status === 'cancelled') === Boolean(session.isCancelled))
    ))
    const activeFilterCount = Object.values(filters).filter(Boolean).length
    const periodCount = periodSessionCount(visibleSessions, focusDate, viewMode)

    function locationField(label, value, onChange, {
      id,
      error: fieldError,
    } = {}) {
      const hasLegacyValue = value && !locations.includes(value)
      return (
        <label style={fieldLabelStyle()}>
          {label}
          <select
            id={id}
            value={value}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError && id ? `${id}-error` : undefined}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Выберите локацию</option>
            {hasLegacyValue && <option value={value}>{value} (сохранённое значение)</option>}
            {locations.map((location) => <option key={location} value={location}>{location}</option>)}
          </select>
          {fieldError && <small id={id ? `${id}-error` : undefined} className="ops-field-error" role="alert">{fieldError}</small>}
        </label>
      )
    }

    function updateSessionType(sessionType) {
      const defaults = sessionTypeConfigs.find((item) => item.code === sessionType)
      const group = groups.find((item) => String(item.groupId) === String(sessionForm.groupId))
      const defaultPriceMinor = sessionType === 'group' ? group?.priceMinor : defaults?.default_price_minor
      setSessionForm((current) => ({
        ...current,
        sessionType,
        secondParticipantId: sessionType === 'split' ? current.secondParticipantId : '',
        rosterCount: sessionType === 'split'
          ? Math.max(current.secondParticipantId ? 2 : 1, Number(current.rosterCount || 0))
          : 0,
        durationMinutes: String(defaults?.default_duration_minutes || 60),
        maxParticipants: newSessionCapacity({
          groupCapacity: sessionType === 'group' ? group?.defaultCapacity : null,
          typeCapacity: defaults?.default_capacity || (sessionType === 'split' ? 2 : null),
          currentCapacity: current.maxParticipants,
        }),
        price: defaultPriceMinor == null ? '' : String(defaultPriceMinor / 100),
      }))
    }

    function updateNewSessionGroup(groupId) {
      const group = groups.find((item) => String(item.groupId) === String(groupId))
      const defaults = sessionTypeConfigs.find((item) => item.code === sessionForm.sessionType)
      setSessionForm((current) => ({
        ...current,
        groupId,
        maxParticipants: newSessionCapacity({
          groupCapacity: group?.defaultCapacity,
          typeCapacity: defaults?.default_capacity,
          currentCapacity: current.maxParticipants,
        }),
      }))
      setFieldErrors((current) => {
        if (!current.groupId && !current.maxParticipants) return current
        const next = { ...current }
        delete next.groupId
        delete next.maxParticipants
        return next
      })
    }

    function openSessionShortcut(sessionType, participantId = '', requireSecondParticipant = false) {
      setError(null)
      if (sessionType === 'split' && !splitReady) {
        setError('Тип split не настроен. Восстановите системный тип в Настройки → Типы занятий.')
        return
      }
      const groupId = sessionForm.groupId || groups[0]?.groupId || ''
      const group = groups.find((item) => String(item.groupId) === String(groupId))
      const defaults = sessionTypeConfigs.find((item) => item.code === sessionType)
      setSessionForm((current) => ({
        ...current,
        groupId,
        trainerId: current.trainerId || activeTrainers[0]?.trainerId || '',
        location: current.location || configuredLocations[0]?.name || '',
        sessionType,
        participantId: participantId || current.participantId,
        secondParticipantId: sessionType === 'split' ? current.secondParticipantId : '',
        requireSecondParticipant: sessionType === 'split' && requireSecondParticipant,
        rosterCount: sessionType === 'split'
          ? Math.max(current.secondParticipantId ? 2 : 1, Number(current.rosterCount || 0))
          : 0,
        durationMinutes: String(defaults?.default_duration_minutes || current.durationMinutes || 60),
        maxParticipants: newSessionCapacity({
          groupCapacity: sessionType === 'group' ? group?.defaultCapacity : null,
          typeCapacity: defaults?.default_capacity || (sessionType === 'split' ? 2 : null),
          currentCapacity: current.maxParticipants,
        }),
        price: (sessionType === 'group' ? group?.priceMinor : defaults?.default_price_minor) == null
          ? ''
          : String((sessionType === 'group' ? group?.priceMinor : defaults?.default_price_minor) / 100),
      }))
      setActionPanel('session')
    }

    function dateTime(date, time) {
      return `${date}T${time}`
    }

    function endTime(start, durationMinutes) {
      if (!validTime(start)) return '—'
      const [hours, minutes] = start.split(':').map(Number)
      const total = (hours * 60 + minutes + Number(durationMinutes || 60)) % 1440
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }

    function validateDateTime(date, time) {
      if (!validIsoDate(date)) {
        setError('Введите дату в формате ГГГГ-ММ-ДД.')
        return false
      }
      if (!validTime(time)) {
        setError('Введите время в 24-часовом формате ЧЧ:ММ.')
        return false
      }
      return true
    }

    function openSessionEdit(session) {
      setEditingSession(session)
      setEditFieldErrors({})
      const roster = session.roster || []
      const nextForm = {
        sessionType: session.sessionType || 'group',
        groupId: session.groupId || '',
        participantId: session.individualParticipant?.id || '',
        secondParticipantId: session.sessionType === 'split' ? session.secondStudentId || '' : '',
        rosterCount: roster.length || Number(session.count || 0),
        extraParticipantCount: Math.max(
          roster.length - 1 - (session.secondStudentId ? 1 : 0),
          0,
        ),
        trainerId: session.trainerId || '',
        date: sessionIsoDate(session),
        start: session.start,
        durationMinutes: String(session.durationMinutes || 60),
        price: session.priceMinor == null ? '' : String(session.priceMinor / 100),
        location: session.location || '',
        maxParticipants: String(session.limit || 0),
        notes: session.notes || '',
      }
      setSessionEditForm(nextForm)
      setSessionEditBaseline(nextForm)
    }

    function closeSessionCreate() {
      if (sessionFormBaseline) setSessionForm({ ...sessionFormBaseline })
      setActionPanel(null)
      setFieldErrors({})
      setError(null)
    }

    function closePeriodCopy() {
      if (copyFormBaseline) setCopyForm({ ...copyFormBaseline })
      setActionPanel(null)
      setCopyFieldErrors({})
      setCopyPreview(null)
      setError(null)
    }

    function closeSessionEdit() {
      if (sessionEditBaseline) setSessionEditForm({ ...sessionEditBaseline })
      setEditingSession(null)
      setSessionEditBaseline(null)
      setEditFieldErrors({})
      setError(null)
    }

    function validateNewSession() {
      const next = validateAdminSessionForm(sessionForm)
      setFieldErrors(next)
      const first = Object.keys(next)[0]
      if (first) {
        requestAnimationFrame(() => document.getElementById(`admin-session-${first}`)?.focus())
        return false
      }
      return true
    }

    function validateSessionEdit() {
      const next = validateAdminSessionForm(sessionEditForm)
      setEditFieldErrors(next)
      const first = Object.keys(next)[0]
      if (first) {
        requestAnimationFrame(() => document.getElementById(`admin-session-edit-${first}`)?.focus())
        return false
      }
      return true
    }

    async function createSession() {
      if (!validateNewSession()) return
      setBusy(true)
      setError(null)
      try {
        const startAt = dateTime(sessionForm.date, sessionForm.start)
        const conflict = await api.post('/api/admin/schedule/check-conflict/', {
          trainer_id: sessionForm.trainerId,
          start_at: startAt,
          duration_minutes: Number(sessionForm.durationMinutes || 60),
        })
        if (conflict.has_conflict) {
          const conflictError = {
            fieldErrors: conflict.errors || {},
            nonFieldErrors: conflict.non_field_errors || [],
            payload: conflict,
          }
          const nextErrors = fieldErrorsFromApi(conflictError, SESSION_FIELD_MAP)
          setFieldErrors(nextErrors)
          setError(formErrorMessage(conflictError, 'Обнаружен конфликт расписания.'))
          setTimeout(() => focusFirstFieldError(nextErrors, SESSION_FIELD_IDS), 0)
          return
        }
        await api.post('/api/admin/schedule/sessions/', {
          session_type: sessionForm.sessionType,
          group_id: sessionForm.sessionType === 'group' ? sessionForm.groupId : null,
          individual_student_id: sessionForm.sessionType !== 'group' ? sessionForm.participantId : null,
          ...(sessionForm.sessionType === 'split'
            ? { second_student_id: sessionForm.secondParticipantId || null }
            : {}),
          trainer_id: sessionForm.trainerId,
          start_at: startAt,
          duration_minutes: Number(sessionForm.durationMinutes || 60),
          location: sessionForm.location,
          max_participants: Number(sessionForm.maxParticipants || 0),
          notes: sessionForm.notes,
          ...(sessionForm.price === '' ? {} : { price_minor: Math.round(Number(sessionForm.price) * 100) }),
        })
        const context = sessionForm.sessionType === 'group'
          ? groups.find((group) => String(group.groupId) === String(sessionForm.groupId))?.name
          : participants.find((participant) => String(participant.studentId) === String(sessionForm.participantId))?.name
        setMessage(`Создано: ${sessionTypeOptions.find((item) => item.code === sessionForm.sessionType)?.label || sessionForm.sessionType}, ${sessionForm.date} ${sessionForm.start}${context ? ` · ${context}` : ''}.`)
        setActionPanel(null)
        setRangeRefresh((current) => current + 1)
        Promise.resolve(reloadRoleData?.('admin')).catch((err) => {
          setLoadError(apiErrorMessage(err, 'Занятие создано, но общие данные не обновились. Обновите страницу.'))
        })
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, SESSION_FIELD_MAP)
        setFieldErrors(nextErrors)
        setError(formErrorMessage(err, 'Не удалось создать занятие.'))
        setTimeout(() => focusFirstFieldError(nextErrors, SESSION_FIELD_IDS), 0)
      } finally {
        setBusy(false)
      }
    }

    async function saveSessionEdit() {
      if (!editingSession || !validateSessionEdit()) return
      setBusy(true)
      setError(null)
      try {
        const startAt = dateTime(sessionEditForm.date, sessionEditForm.start)
        const conflict = await api.post('/api/admin/schedule/check-conflict/', {
          trainer_id: sessionEditForm.trainerId,
          start_at: startAt,
          duration_minutes: Number(sessionEditForm.durationMinutes || 60),
          exclude_session_id: editingSession.sessionId,
        })
        if (conflict.has_conflict) {
          const conflictError = {
            fieldErrors: conflict.errors || {},
            nonFieldErrors: conflict.non_field_errors || [],
            payload: conflict,
          }
          const nextErrors = fieldErrorsFromApi(conflictError, SESSION_FIELD_MAP)
          setEditFieldErrors(nextErrors)
          setError(formErrorMessage(conflictError, 'Обнаружен конфликт расписания.'))
          setTimeout(() => focusFirstFieldError(nextErrors, Object.fromEntries(
            Object.entries(SESSION_FIELD_IDS).map(([field, id]) => [field, id.replace('admin-session-', 'admin-session-edit-')]),
          )), 0)
          return
        }
        await api.patch(`/api/admin/schedule/sessions/${editingSession.sessionId}/`, {
          ...(sessionEditForm.sessionType === 'group'
            ? { group_id: sessionEditForm.groupId }
            : {
                individual_student_id: sessionEditForm.participantId,
                ...(sessionEditForm.sessionType === 'split'
                  ? { second_student_id: sessionEditForm.secondParticipantId || null }
                  : {}),
              }),
          trainer_id: sessionEditForm.trainerId,
          start_at: startAt,
          duration_minutes: Number(sessionEditForm.durationMinutes || 60),
          price_minor: sessionEditForm.price === '' ? null : Math.round(Number(sessionEditForm.price) * 100),
          location: sessionEditForm.location,
          max_participants: Number(sessionEditForm.maxParticipants || 0),
          notes: sessionEditForm.notes,
        })
        setEditingSession(null)
        setMessage('Занятие обновлено.')
        setRangeRefresh((current) => current + 1)
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, SESSION_FIELD_MAP)
        setEditFieldErrors(nextErrors)
        setError(formErrorMessage(err, 'Не удалось сохранить занятие.'))
        setTimeout(() => focusFirstFieldError(nextErrors, Object.fromEntries(
          Object.entries(SESSION_FIELD_IDS).map(([field, id]) => [field, id.replace('admin-session-', 'admin-session-edit-')]),
        )), 0)
      } finally {
        setBusy(false)
      }
    }

    async function deleteSession(session) {
      setBusy(true)
      setError(null)
      try {
        await api.delete(`/api/admin/schedule/sessions/${session.sessionId}/`, {
          force: true,
          confirm_session_id: session.sessionId,
        })
        setMessage('Занятие удалено.')
        setConfirmDelete(null)
        setEditingSession(null)
        setRangeRefresh((current) => current + 1)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, 'Не удалось удалить занятие.'))
        setConfirmDelete(null)
      } finally {
        setBusy(false)
      }
    }

    async function cancelSession(session) {
      setBusy(true)
      setError(null)
      try {
        await api.post(`/api/admin/schedule/sessions/${session.sessionId}/cancel/`)
        setMessage('Занятие отменено.')
        setRangeRefresh((current) => current + 1)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, 'Не удалось отменить занятие.'))
      } finally {
        setBusy(false)
      }
    }

    async function restoreSession(session) {
      setBusy(true)
      setError(null)
      try {
        await api.post(`/api/admin/schedule/sessions/${session.sessionId}/restore/`)
        setMessage('Тренировка восстановлена.')
        setRangeRefresh((current) => current + 1)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, 'Не удалось восстановить тренировку.'))
      } finally {
        setBusy(false)
      }
    }


    async function previewPeriodCopy() {
      const nextErrors = {}
      if (!validIsoDate(copyForm.sourceFrom)) nextErrors.sourceFrom = 'Введите начальную дату источника.'
      if (!validIsoDate(copyForm.sourceTo)) nextErrors.sourceTo = 'Введите конечную дату источника.'
      if (!validIsoDate(copyForm.targetFrom)) nextErrors.targetFrom = 'Введите начальную дату назначения.'
      if (!validIsoDate(copyForm.targetTo)) nextErrors.targetTo = 'Введите конечную дату назначения.'
      if (validIsoDate(copyForm.sourceFrom) && validIsoDate(copyForm.sourceTo) && copyForm.sourceTo < copyForm.sourceFrom) nextErrors.sourceTo = 'Конечная дата не может быть раньше начальной.'
      if (validIsoDate(copyForm.targetFrom) && validIsoDate(copyForm.targetTo) && copyForm.targetTo < copyForm.targetFrom) nextErrors.targetTo = 'Конечная дата не может быть раньше начальной.'
      if (!copyForm.includeGroup && !copyForm.includeIndividual && !copyForm.includeSplit) nextErrors.includeGroup = 'Выберите хотя бы один тип занятия.'
      if (Object.keys(nextErrors).length) {
        setCopyFieldErrors(nextErrors)
        setError(null)
        focusFirstFieldError(nextErrors, COPY_FIELD_IDS)
        return
      }
      setBusy(true)
      setError(null)
      setCopyFieldErrors({})
      try {
        const result = await api.post('/api/admin/schedule/copy-period/preview/', {
          source_from: copyForm.sourceFrom,
          source_to: copyForm.sourceTo,
          target_from: copyForm.targetFrom,
          target_to: copyForm.targetTo,
          include_group: copyForm.includeGroup,
          include_individual: copyForm.includeIndividual,
          include_split: copyForm.includeSplit,
        })
        setCopyPreview({
          ...result,
          selectedIndices: result.rows.filter((row) => row.status === 'ready').map((row) => row.index),
        })
      } catch (err) {
        const nextFieldErrors = fieldErrorsFromApi(err, {
          source_from: 'sourceFrom', source_to: 'sourceTo',
          target_from: 'targetFrom', target_to: 'targetTo',
          include_group: 'includeGroup', include_individual: 'includeIndividual',
          include_split: 'includeSplit',
        })
        setCopyFieldErrors(nextFieldErrors)
        setError(formErrorMessage(err, 'Не удалось проверить копирование периода.'))
        focusFirstFieldError(nextFieldErrors, COPY_FIELD_IDS)
      } finally {
        setBusy(false)
      }
    }

    async function commitPeriodCopy() {
      if (!copyPreview) return
      setBusy(true)
      setError(null)
      setCopyFieldErrors((current) => clearFieldError(current, 'selectedIndices'))
      try {
        const result = await api.post('/api/admin/schedule/copy-period/commit/', {
          batch_id: copyPreview.batch_id,
          selected_indices: copyPreview.selectedIndices,
        })
        setMessage(`Скопировано занятий: ${result.created_count}. Пропущено: ${result.skipped_count}.`)
        setCopyPreview(null)
        setActionPanel(null)
        setRangeRefresh((current) => current + 1)
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, {
          selected_indices: 'selectedIndices',
        })
        delete nextErrors.batch_id
        setCopyFieldErrors((current) => ({ ...current, ...nextErrors }))
        setError(err.fieldErrors?.batch_id
          ? apiErrorMessage(err, 'Предварительная проверка устарела. Выполните её заново.')
          : formErrorMessage(err, 'Не удалось скопировать выбранные занятия.'))
        focusFirstFieldError(nextErrors, COPY_FIELD_IDS)
      } finally {
        setBusy(false)
      }
    }

    function renderCalendarEvent(session, { viewMode }) {
      return (
        <div className="ops-schedule-event-wrap" data-view-mode={viewMode}>
          <button
            type="button"
            className={`ops-schedule-event${session.isCancelled ? ' is-cancelled' : ''}`}
            aria-label={eventAccessibleLabel(session)}
            data-color-key={session.colorKey}
            onClick={() => go('attendance', { sessionId: session.sessionId })}
            style={scheduleColorStyle(session.colorKey)}
          >
            <ScheduleEventContent session={session} />
          </button>
          <button
            type="button"
            className="ops-schedule-event-edit"
            aria-label={session.isCancelled ? `Восстановить тренировку ${session.start} ${session.group}` : `Изменить занятие ${session.start} ${session.group}`}
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation()
              if (session.isCancelled) restoreSession(session)
              else openSessionEdit(session)
            }}
          >
            {session.isCancelled ? <span aria-hidden="true">↺</span> : <I.Pencil size={12} />}
          </button>
        </div>
      )
    }

    return (
      <div className="page page-wide">
        <div className="page-head ops-schedule-page-head">
          <div>
            <h1 className="page-title">Расписание</h1>
            <p className="page-desc">Занятия и копирование периодов.</p>
          </div>
          <div className="ops-schedule-head-actions" ref={filterPopoverRef}>
            <button
              type="button"
              className="ops-filter-trigger"
              aria-expanded={filtersOpen}
              aria-controls="admin-schedule-filters"
              onClick={() => {
                setDraftFilters({ ...filters })
                setFiltersOpen((current) => !current)
              }}
            >
              <span>Фильтры{activeFilterCount ? ` · ${activeFilterCount}` : ''}</span>
              <span className="ops-filter-period-count"><Badge tone={activeFilterCount ? 'primary' : 'neutral'}>{periodCountLabel(periodCount, viewMode)}</Badge></span>
            </button>
            <ScheduleViewSwitcher displayMode={displayMode} setDisplayMode={setDisplayMode} icons={I} />
            {filtersOpen && (
              <div id="admin-schedule-filters" className="ops-filter-popover" role="dialog" aria-label="Фильтры расписания">
                <div className="ops-form-grid">
                  <label>Тип тренировки<select value={draftFilters.sessionType} onChange={(event) => setDraftFilters({ ...draftFilters, sessionType: event.target.value })}><option value="">Все</option><option value="group">Групповое</option><option value="individual">Индивидуальное</option><option value="split">Сплит</option></select></label>
                  <label>Тренер<select value={draftFilters.trainerId} onChange={(event) => setDraftFilters({ ...draftFilters, trainerId: event.target.value })}><option value="">Все</option>{trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</select></label>
                  <label>Группа<select value={draftFilters.groupId} onChange={(event) => setDraftFilters({ ...draftFilters, groupId: event.target.value })}><option value="">Все</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></label>
                  <label>Локация<select value={draftFilters.location} onChange={(event) => setDraftFilters({ ...draftFilters, location: event.target.value })}><option value="">Все</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
                  <label>Статус<select value={draftFilters.status} onChange={(event) => setDraftFilters({ ...draftFilters, status: event.target.value })}><option value="">Все</option><option value="planned">Запланировано</option><option value="cancelled">Отменено</option></select></label>
                </div>
                <div className="ops-filter-actions">
                  <Button size="sm" variant="subtle" onClick={() => setDraftFilters({ ...EMPTY_SCHEDULE_FILTERS })}>Сбросить</Button>
                  <Button size="sm" variant="primary" onClick={() => { setFilters({ ...draftFilters }); setFiltersOpen(false) }}>Применить</Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <ToastNotice id="admin-schedule-result" message={message} tone="success" />
        {error && !actionPanel && !editingSession && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        {loadError && <Banner tone="warning" style={{ marginBottom: 12 }} onClose={() => setLoadError(null)}>{loadError}</Banner>}
        <BusyBanner id="admin-schedule-busy" show={busy}>Сохраняю изменения расписания...</BusyBanner>

        <div className="ops-action-strip">
          {[
            ['group', 'Групповая тренировка'],
            ['individual', 'Индивидуальная тренировка'],
            ['split', 'Split-тренировка'],
          ].map(([type, label]) => (
            <button
              key={type}
              type="button"
              className={`ops-action-card${actionPanel === 'session' && sessionForm.sessionType === type ? ' is-active' : ''}`}
              onClick={() => openSessionShortcut(type)}
            >
              <span>{label}</span>
            </button>
          ))}
          <button type="button" className={`ops-action-card${actionPanel === 'copy' ? ' is-active' : ''}`} onClick={() => { setActionPanel((current) => current === 'copy' ? null : 'copy'); setCopyFieldErrors({}) }}><span>Копировать период</span></button>
        </div>

        <FormModal
          open={actionPanel === 'session'}
          title="Новое занятие"
          size="lg"
          busy={busy}
          dirty={Boolean(sessionFormBaseline) && JSON.stringify(sessionForm) !== JSON.stringify(sessionFormBaseline)}
          onRequestClose={closeSessionCreate}
          footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>Закрыть</Button><Button variant="primary" disabled={busy} onClick={createSession}>Создать занятие</Button></>}
        >
          <div className="card card-pad ops-schedule-form-card">
            {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
            <div className="ops-form-grid ops-schedule-form-grid">
              <label>Тип занятия<select id="admin-session-sessionType" value={sessionForm.sessionType} aria-invalid={Boolean(fieldErrors.sessionType)} aria-describedby={fieldErrors.sessionType ? 'admin-session-sessionType-error' : undefined} onChange={(event) => updateSessionType(event.target.value)}>{sessionTypeOptions.map((type) => <option key={type.code} value={type.code} disabled={type.configured === false}>{type.label || type.code}</option>)}</select>{fieldErrors.sessionType && <small id="admin-session-sessionType-error" className="ops-field-error" role="alert">{fieldErrors.sessionType}</small>}</label>
              {sessionForm.sessionType !== 'group' && <SearchableSelect inputId="admin-session-participantId" label={sessionForm.sessionType === 'split' ? 'Клиент 1' : 'Участник'} value={sessionForm.participantId} onChange={(value) => { updateSessionForm('participantId', value); if (String(value) === String(sessionForm.secondParticipantId)) updateSessionForm('secondParticipantId', '') }} options={participants.map((participant) => clientSelectOption(participant))} loadOptions={loadParticipantOptions} error={fieldErrors.participantId} />}
              {sessionForm.sessionType === 'split' && <SearchableSelect inputId="admin-session-secondParticipantId" label={sessionForm.requireSecondParticipant ? 'Клиент 2' : 'Клиент 2 (необязательно)'} value={sessionForm.secondParticipantId} onChange={(value) => updateSessionForm('secondParticipantId', value)} options={participants.filter((participant) => String(participant.studentId) !== String(sessionForm.participantId)).map((participant) => clientSelectOption(participant))} loadOptions={loadParticipantOptions} error={fieldErrors.secondParticipantId} />}
              {sessionForm.sessionType === 'group' && <label>Группа<select id="admin-session-groupId" value={sessionForm.groupId} aria-invalid={Boolean(fieldErrors.groupId)} aria-describedby={fieldErrors.groupId ? 'admin-session-groupId-error' : undefined} onChange={(event) => updateNewSessionGroup(event.target.value)}><option value="">Выберите группу</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select>{fieldErrors.groupId && <small id="admin-session-groupId-error" className="ops-field-error" role="alert">{fieldErrors.groupId}</small>}</label>}
              <label>Тренер<select id="admin-session-trainerId" value={sessionForm.trainerId} aria-invalid={Boolean(fieldErrors.trainerId)} aria-describedby={fieldErrors.trainerId ? 'admin-session-trainerId-error' : undefined} onChange={(event) => updateSessionForm('trainerId', event.target.value)}><option value="">Выберите тренера</option>{activeTrainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</select>{fieldErrors.trainerId && <small id="admin-session-trainerId-error" className="ops-field-error" role="alert">{fieldErrors.trainerId}</small>}</label>
              <DateField id="admin-session-date" label="Дата" value={sessionForm.date} onChange={(value) => updateSessionForm('date', value)} required error={fieldErrors.date} />
              <TimeField id="admin-session-start" label="Начало" value={sessionForm.start} onChange={(value) => updateSessionForm('start', value)} required error={fieldErrors.start} />
              <Input id="admin-session-durationMinutes" type="number" min="15" max="480" step="5" label="Длительность, мин" value={sessionForm.durationMinutes} error={fieldErrors.durationMinutes} onChange={(event) => updateSessionForm('durationMinutes', event.target.value)} />
              {locationField('Локация', sessionForm.location, (value) => updateSessionForm('location', value), { id: 'admin-session-location', error: fieldErrors.location })}
              <Input id="admin-session-maxParticipants" type="number" min="1" step="1" label="Лимит участников" value={sessionForm.maxParticipants} error={fieldErrors.maxParticipants} onChange={(event) => updateSessionForm('maxParticipants', event.target.value)} />
              {sessionForm.sessionType !== 'group' && <Input id="admin-session-price" type="number" min="0" step="0.01" label="Цена занятия, PLN" value={sessionForm.price} error={fieldErrors.price} onChange={(event) => updateSessionForm('price', event.target.value)} placeholder="Пусто = тариф типа, 0 = бесплатно" />}
              <Input id="admin-session-notes" label="Заметки" value={sessionForm.notes} error={fieldErrors.notes} onChange={(event) => updateSessionForm('notes', event.target.value)} />
            </div>
            <div className="muted">Окончание: {endTime(sessionForm.start, sessionForm.durationMinutes)}</div>
          </div>
        </FormModal>

        <FormModal
          open={actionPanel === 'copy'}
          title="Копирование расписания за период"
          size="lg"
          busy={busy}
          dirty={Boolean(copyFormBaseline) && JSON.stringify(copyForm) !== JSON.stringify(copyFormBaseline)}
          onRequestClose={closePeriodCopy}
          footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>Закрыть</Button><Button variant="primary" disabled={busy} onClick={previewPeriodCopy}>Проверить</Button>{copyPreview && <Button id={COPY_FIELD_IDS.selectedIndices} variant="secondary" disabled={busy || !copyPreview.selectedIndices.length} aria-invalid={Boolean(copyFieldErrors.selectedIndices)} aria-describedby={copyFieldErrors.selectedIndices ? `${COPY_FIELD_IDS.selectedIndices}-error` : undefined} onClick={commitPeriodCopy}>Скопировать {copyPreview.selectedIndices.length}</Button>}</>}
        >
          <div className="card card-pad ops-schedule-form-card">
            {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
            <div className="ops-form-grid">
              <DateField id={COPY_FIELD_IDS.sourceFrom} label="Источник с" value={copyForm.sourceFrom} error={copyFieldErrors.sourceFrom} onChange={(value) => updateCopyForm('sourceFrom', value)} required />
              <DateField id={COPY_FIELD_IDS.sourceTo} label="Источник по" value={copyForm.sourceTo} error={copyFieldErrors.sourceTo} onChange={(value) => updateCopyForm('sourceTo', value)} required min={copyForm.sourceFrom || undefined} />
              <DateField id={COPY_FIELD_IDS.targetFrom} label="Назначение с" value={copyForm.targetFrom} error={copyFieldErrors.targetFrom} onChange={(value) => updateCopyForm('targetFrom', value)} required />
              <DateField id={COPY_FIELD_IDS.targetTo} label="Назначение по" value={copyForm.targetTo} error={copyFieldErrors.targetTo} onChange={(value) => updateCopyForm('targetTo', value)} required min={copyForm.targetFrom || undefined} />
            </div>
            <div className="ops-button-row">
              {[['includeGroup', 'Групповые'], ['includeIndividual', 'Индивидуальные'], ['includeSplit', 'Сплит']].map(([field, label]) => <Checkbox id={COPY_FIELD_IDS[field]} key={field} label={label} checked={copyForm[field]} error={copyFieldErrors[field]} onChange={(event) => updateCopyForm(field, event.target.checked)} />)}
            </div>
            {copyFieldErrors.selectedIndices && <small id={`${COPY_FIELD_IDS.selectedIndices}-error`} className="ops-field-error" role="alert">{copyFieldErrors.selectedIndices}</small>}
            {copyPreview && <div className="muted">Готово: {copyPreview.selectedIndices.length}; конфликты или пропуски: {copyPreview.rows.length - copyPreview.selectedIndices.length}. Запись начнётся только после подтверждения.</div>}
          </div>
        </FormModal>

        <FormModal
          open={editingSession != null}
          title="Редактирование занятия"
          size="lg"
          busy={busy}
          dirty={Boolean(sessionEditBaseline) && JSON.stringify(sessionEditForm) !== JSON.stringify(sessionEditBaseline)}
          suspended={confirmDelete != null}
          onRequestClose={closeSessionEdit}
          footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>Закрыть</Button><Button variant="danger" disabled={busy} onClick={() => setConfirmDelete(editingSession)}>Удалить занятие</Button><Button variant="primary" disabled={busy} onClick={saveSessionEdit}>Сохранить занятие</Button></>}
        >
          <div className="card card-pad ops-schedule-form-card">
            {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
            <div className="ops-form-grid">
              {sessionEditForm.sessionType === 'group'
                ? <label>Группа<select id="admin-session-edit-groupId" value={sessionEditForm.groupId} aria-invalid={Boolean(editFieldErrors.groupId)} aria-describedby={editFieldErrors.groupId ? 'admin-session-edit-groupId-error' : undefined} onChange={(event) => updateSessionEditForm('groupId', event.target.value)}><option value="">Выберите группу</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select>{editFieldErrors.groupId && <small id="admin-session-edit-groupId-error" className="ops-field-error" role="alert">{editFieldErrors.groupId}</small>}</label>
                : <SearchableSelect inputId="admin-session-edit-participantId" label={sessionEditForm.sessionType === 'split' ? 'Клиент 1' : 'Участник'} value={sessionEditForm.participantId} onChange={(value) => { updateSessionEditForm('participantId', value); if (String(value) === String(sessionEditForm.secondParticipantId)) updateSessionEditForm('secondParticipantId', '') }} options={participants.filter((participant) => !editingSession?.roster?.slice(1).filter((row) => String(row.id) !== String(editingSession?.secondStudentId)).some((row) => String(row.id) === String(participant.studentId))).map((participant) => clientSelectOption(participant))} loadOptions={loadParticipantOptions} error={editFieldErrors.participantId} />}
              {sessionEditForm.sessionType === 'split' && <SearchableSelect inputId="admin-session-edit-secondParticipantId" label="Клиент 2 (необязательно)" value={sessionEditForm.secondParticipantId} onChange={(value) => updateSessionEditForm('secondParticipantId', value)} options={participants.filter((participant) => String(participant.studentId) !== String(sessionEditForm.participantId) && !editingSession?.roster?.slice(1).filter((row) => String(row.id) !== String(editingSession?.secondStudentId)).some((row) => String(row.id) === String(participant.studentId))).map((participant) => clientSelectOption(participant))} loadOptions={loadParticipantOptions} error={editFieldErrors.secondParticipantId} />}
              {sessionEditForm.sessionType === 'split' && editingSession?.roster?.length > 0 && <div className="ops-grid-full ops-split-roster-summary" aria-label="Полный состав Split">
                <span className="muted">Текущий полный состав</span>
                <strong>{editingSession.roster.map((participant) => participant.full_name).join(' · ')}</strong>
                {editingSession.roster.length > 2 && <small className="muted">Участники после Клиента 2 сохраняются этой формой и управляются на экране посещаемости.</small>}
              </div>}
              <label>Тренер<select id="admin-session-edit-trainerId" value={sessionEditForm.trainerId} aria-invalid={Boolean(editFieldErrors.trainerId)} aria-describedby={editFieldErrors.trainerId ? 'admin-session-edit-trainerId-error' : undefined} onChange={(event) => updateSessionEditForm('trainerId', event.target.value)}>{activeTrainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</select>{editFieldErrors.trainerId && <small id="admin-session-edit-trainerId-error" className="ops-field-error" role="alert">{editFieldErrors.trainerId}</small>}</label>
              <DateField id="admin-session-edit-date" label="Дата" value={sessionEditForm.date} onChange={(value) => updateSessionEditForm('date', value)} required error={editFieldErrors.date} />
              <TimeField id="admin-session-edit-start" label="Начало" value={sessionEditForm.start} onChange={(value) => updateSessionEditForm('start', value)} required error={editFieldErrors.start} />
              <Input id="admin-session-edit-durationMinutes" type="number" min="15" max="480" step="5" label="Длительность, мин" value={sessionEditForm.durationMinutes} error={editFieldErrors.durationMinutes} onChange={(event) => updateSessionEditForm('durationMinutes', event.target.value)} />
              {locationField('Локация', sessionEditForm.location, (value) => updateSessionEditForm('location', value), { id: 'admin-session-edit-location', error: editFieldErrors.location })}
              <Input id="admin-session-edit-maxParticipants" type="number" min="1" step="1" label="Лимит участников" value={sessionEditForm.maxParticipants} error={editFieldErrors.maxParticipants} onChange={(event) => updateSessionEditForm('maxParticipants', event.target.value)} />
              <Input id="admin-session-edit-price" type="number" min="0" step="0.01" label="Цена, PLN" value={sessionEditForm.price} error={editFieldErrors.price} onChange={(event) => updateSessionEditForm('price', event.target.value)} />
              <Input id="admin-session-edit-notes" label="Заметки" value={sessionEditForm.notes} error={editFieldErrors.notes} onChange={(event) => updateSessionEditForm('notes', event.target.value)} />
            </div>
            <div className="muted">Окончание: {endTime(sessionEditForm.start, sessionEditForm.durationMinutes)}</div>
          </div>
        </FormModal>

        <div className="ops-calendar-toolbar">
          <CalendarNavigation
            focusDate={focusDate}
            setFocusDate={setFocusDate}
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        </div>
        {displayMode === 'calendar' && (
          <ScheduleCalendar
            sessions={visibleSessions}
            focusDate={focusDate}
            viewMode={viewMode}
            setFocusDate={setFocusDate}
            setViewMode={setViewMode}
            renderEvent={renderCalendarEvent}
          />
        )}
        {displayMode === 'list' && (
          <div className="card" data-testid="schedule-list" style={{ overflow: 'hidden' }}>
            {visibleSessions.map((session, index) => (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                aria-label={eventAccessibleLabel(session)}
                className={`ops-session-row${session.isCancelled ? ' is-cancelled' : ''}`}
                data-color-key={session.colorKey}
                onClick={() => go('attendance', { sessionId: session.sessionId })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    go('attendance', { sessionId: session.sessionId })
                  }
                }}
                style={{ ...scheduleColorStyle(session.colorKey), display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: index < visibleSessions.length - 1 ? '1px solid var(--border-subtle)' : 'none', cursor: 'pointer' }}
              >
                <span className="mono">{sessionIsoDate(session)}</span>
                <span className="mono">{session.start}-{session.end}</span>
                {session.limit > 0 && <span className="mono">{session.count}/{session.limit}</span>}
                <span className="strong" style={{ flex: 1 }}>{session.group}{session.individualParticipant?.full_name ? ` · ${session.individualParticipant.full_name}` : ''}</span>
                <span className="muted">{session.trainer}</span>
                <span className="muted">{session.location}</span>
                <Badge tone={session.status === 'cancelled' ? 'danger' : 'primary'}>{session.status === 'cancelled' ? 'Отменено' : 'Запланировано'}</Badge>
                {session.isCancelled
                  ? <Button size="sm" variant="secondary" disabled={busy} onClick={(event) => { event.stopPropagation(); restoreSession(session) }}>Восстановить тренировку</Button>
                  : <>
                    <Button size="sm" variant="subtle" disabled={busy} onClick={(event) => { event.stopPropagation(); openSessionEdit(session) }}>Изменить</Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={(event) => { event.stopPropagation(); cancelSession(session) }}>Отменить</Button>
                  </>}
                <Button size="sm" variant="danger" disabled={busy} onClick={(event) => { event.stopPropagation(); setConfirmDelete(session) }}>Удалить</Button>
              </div>
            ))}
            {!visibleSessions.length && <div className="muted" style={{ padding: 16 }}>В выбранном периоде занятий нет.</div>}
          </div>
        )}
        <Dialog
          open={confirmDelete != null}
          tone="danger"
          irreversible
          title="Удалить занятие?"
          description={confirmDelete ? `${sessionIsoDate(confirmDelete)} ${confirmDelete.start}-${confirmDelete.end} · ${confirmDelete.group}. Занятие с посещаемостью или зарплатой удалить нельзя — его нужно отменить.` : ''}
          confirmLabel="Удалить"
          cancelLabel="Отмена"
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => deleteSession(confirmDelete)}
        />
      </div>
    )
  }
}
