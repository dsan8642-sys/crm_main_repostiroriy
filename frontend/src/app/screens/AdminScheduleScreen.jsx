import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api, apiErrorMessage, fetchAllPages } from '../../api.js'
import { formatTime } from '../../mappers.js'
import { DateField, TimeField } from '../DateTimeField.jsx'
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

const EMPTY_SCHEDULE_FILTERS = {
  trainerId: '',
  groupId: '',
  location: '',
  status: '',
}

function normalizeSession(session) {
  if (session.startAt) return session
  const participant = session.individual_participant || null
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
  }
}

function fieldLabelStyle() {
  return { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }
}

export function createAdminScheduleScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Button, Badge, Banner, Dialog, Input } = components
  const I = icons
  return function ApiAdminSchedule({ go, initialTab }) {
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
    const [confirmDelete, setConfirmDelete] = useState(null)
    const [sessionEditForm, setSessionEditForm] = useState({
      groupId: '',
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
    const updateSessionEditForm = (field, value) => setSessionEditForm((current) => ({ ...current, [field]: value }))
    const updateCopyForm = (field, value) => setCopyForm((current) => ({ ...current, [field]: value }))

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

    function openSessionShortcut(sessionType) {
      setError(null)
      if (sessionType === 'split' && !splitReady) {
        setError('Тип split не настроен. Восстановите системный тип в Настройки → Типы занятий.')
        return
      }
      updateSessionType(sessionType)
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
      setSessionEditForm({
        groupId: session.groupId || '',
        trainerId: session.trainerId || '',
        date: sessionIsoDate(session),
        start: session.start,
        durationMinutes: String(session.durationMinutes || 60),
        price: session.priceMinor == null ? '' : String(session.priceMinor / 100),
        location: session.location || '',
        maxParticipants: String(session.limit || 0),
        notes: session.notes || '',
      })
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
          setError(Array.isArray(conflict.error) ? conflict.error.join(', ') : conflict.error)
          return
        }
        await api.post('/api/admin/schedule/sessions/', {
          session_type: sessionForm.sessionType,
          group_id: sessionForm.sessionType === 'group' ? sessionForm.groupId : null,
          individual_student_id: sessionForm.sessionType !== 'group' ? sessionForm.participantId : null,
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
        setError(apiErrorMessage(err, 'Не удалось создать занятие.'))
      } finally {
        setBusy(false)
      }
    }

    async function saveSessionEdit() {
      if (!editingSession || !validateDateTime(sessionEditForm.date, sessionEditForm.start)) return
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
          setError(Array.isArray(conflict.error) ? conflict.error.join(', ') : conflict.error)
          return
        }
        await api.patch(`/api/admin/schedule/sessions/${editingSession.sessionId}/`, {
          group_id: sessionEditForm.groupId,
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
        setError(err.message)
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
        setError(err.message)
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
        setError(err.message)
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
      if (![copyForm.sourceFrom, copyForm.sourceTo, copyForm.targetFrom, copyForm.targetTo].every(validIsoDate)) {
        setError('Укажите все даты копирования в формате ГГГГ-ММ-ДД.')
        return
      }
      setBusy(true)
      setError(null)
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
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function commitPeriodCopy() {
      if (!copyPreview) return
      setBusy(true)
      setError(null)
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
        setError(err.message)
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
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
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
          <button type="button" className={`ops-action-card${actionPanel === 'copy' ? ' is-active' : ''}`} onClick={() => setActionPanel((current) => current === 'copy' ? null : 'copy')}><span>Копировать период</span></button>
        </div>

        {actionPanel === 'session' && (
          <div className="card card-pad ops-schedule-form-card">
            <div className="eyebrow">Новое занятие</div>
            <div className="ops-form-grid ops-schedule-form-grid">
              <label>Тип занятия<select value={sessionForm.sessionType} onChange={(event) => updateSessionType(event.target.value)}>{sessionTypeOptions.map((type) => <option key={type.code} value={type.code} disabled={type.configured === false}>{type.label || type.code}</option>)}</select></label>
              {sessionForm.sessionType !== 'group' && <SearchableSelect inputId="admin-session-participantId" label="Участник" value={sessionForm.participantId} onChange={(value) => updateSessionForm('participantId', value)} options={participants.map((participant) => clientSelectOption(participant))} error={fieldErrors.participantId} />}
              {sessionForm.sessionType === 'group' && <label>Группа<select id="admin-session-groupId" value={sessionForm.groupId} aria-invalid={Boolean(fieldErrors.groupId)} aria-describedby={fieldErrors.groupId ? 'admin-session-groupId-error' : undefined} onChange={(event) => updateNewSessionGroup(event.target.value)}><option value="">Выберите группу</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select>{fieldErrors.groupId && <small id="admin-session-groupId-error" className="ops-field-error" role="alert">{fieldErrors.groupId}</small>}</label>}
              <label>Тренер<select id="admin-session-trainerId" value={sessionForm.trainerId} aria-invalid={Boolean(fieldErrors.trainerId)} aria-describedby={fieldErrors.trainerId ? 'admin-session-trainerId-error' : undefined} onChange={(event) => updateSessionForm('trainerId', event.target.value)}><option value="">Выберите тренера</option>{activeTrainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</select>{fieldErrors.trainerId && <small id="admin-session-trainerId-error" className="ops-field-error" role="alert">{fieldErrors.trainerId}</small>}</label>
              <DateField id="admin-session-date" label="Дата" value={sessionForm.date} onChange={(value) => updateSessionForm('date', value)} required error={fieldErrors.date} />
              <TimeField id="admin-session-start" label="Начало" value={sessionForm.start} onChange={(value) => updateSessionForm('start', value)} required error={fieldErrors.start} />
              <Input id="admin-session-durationMinutes" label="Длительность, мин" value={sessionForm.durationMinutes} error={fieldErrors.durationMinutes} aria-invalid={Boolean(fieldErrors.durationMinutes)} onChange={(event) => updateSessionForm('durationMinutes', event.target.value)} />
              {locationField('Локация', sessionForm.location, (value) => updateSessionForm('location', value), { id: 'admin-session-location', error: fieldErrors.location })}
              <Input id="admin-session-maxParticipants" label="Лимит участников" value={sessionForm.maxParticipants} error={fieldErrors.maxParticipants} aria-invalid={Boolean(fieldErrors.maxParticipants)} onChange={(event) => updateSessionForm('maxParticipants', event.target.value)} />
              {sessionForm.sessionType !== 'group' && <Input id="admin-session-price" label="Цена занятия, PLN" value={sessionForm.price} error={fieldErrors.price} aria-invalid={Boolean(fieldErrors.price)} onChange={(event) => updateSessionForm('price', event.target.value)} placeholder="Пусто = тариф типа, 0 = бесплатно" />}
              <Input label="Заметки" value={sessionForm.notes} onChange={(event) => updateSessionForm('notes', event.target.value)} />
            </div>
            <div className="muted">Окончание: {endTime(sessionForm.start, sessionForm.durationMinutes)}</div>
            <div className="ops-button-row">
              <Button variant="primary" disabled={busy} onClick={createSession}>Создать занятие</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setActionPanel(null)}>Закрыть</Button>
            </div>
          </div>
        )}

        {actionPanel === 'copy' && (
          <div className="card card-pad ops-schedule-form-card">
            <div className="eyebrow">Копирование расписания за период</div>
            <div className="ops-form-grid">
              <DateField label="Источник с" value={copyForm.sourceFrom} onChange={(value) => updateCopyForm('sourceFrom', value)} required />
              <DateField label="Источник по" value={copyForm.sourceTo} onChange={(value) => updateCopyForm('sourceTo', value)} required min={copyForm.sourceFrom || undefined} />
              <DateField label="Назначение с" value={copyForm.targetFrom} onChange={(value) => updateCopyForm('targetFrom', value)} required />
              <DateField label="Назначение по" value={copyForm.targetTo} onChange={(value) => updateCopyForm('targetTo', value)} required min={copyForm.targetFrom || undefined} />
            </div>
            <div className="ops-button-row">
              {[['includeGroup', 'Групповые'], ['includeIndividual', 'Индивидуальные'], ['includeSplit', 'Сплит']].map(([field, label]) => <label key={field}><input type="checkbox" checked={copyForm[field]} onChange={(event) => updateCopyForm(field, event.target.checked)} /> {label}</label>)}
              <Button variant="primary" disabled={busy} onClick={previewPeriodCopy}>Проверить</Button>
              {copyPreview && <Button variant="secondary" disabled={busy || !copyPreview.selectedIndices.length} onClick={commitPeriodCopy}>Скопировать {copyPreview.selectedIndices.length}</Button>}
            </div>
            {copyPreview && <div className="muted">Готово: {copyPreview.selectedIndices.length}; конфликты или пропуски: {copyPreview.rows.length - copyPreview.selectedIndices.length}. Запись начнётся только после подтверждения.</div>}
          </div>
        )}

        {editingSession && (
          <div className="card card-pad ops-schedule-form-card">
            <div className="eyebrow">Редактирование занятия</div>
            <div className="ops-form-grid">
              <label>Группа<select value={sessionEditForm.groupId} onChange={(event) => updateSessionEditForm('groupId', event.target.value)}><option value="">Выберите группу</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></label>
              <label>Тренер<select value={sessionEditForm.trainerId} onChange={(event) => updateSessionEditForm('trainerId', event.target.value)}>{trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</select></label>
              <DateField label="Дата" value={sessionEditForm.date} onChange={(value) => updateSessionEditForm('date', value)} required />
              <TimeField label="Начало" value={sessionEditForm.start} onChange={(value) => updateSessionEditForm('start', value)} required />
              <Input label="Длительность, мин" value={sessionEditForm.durationMinutes} onChange={(event) => updateSessionEditForm('durationMinutes', event.target.value)} />
              {locationField('Локация', sessionEditForm.location, (value) => updateSessionEditForm('location', value))}
              <Input label="Лимит участников" value={sessionEditForm.maxParticipants} onChange={(event) => updateSessionEditForm('maxParticipants', event.target.value)} />
              <Input label="Цена, PLN" value={sessionEditForm.price} onChange={(event) => updateSessionEditForm('price', event.target.value)} />
              <Input label="Заметки" value={sessionEditForm.notes} onChange={(event) => updateSessionEditForm('notes', event.target.value)} />
            </div>
            <div className="muted">Окончание: {endTime(sessionEditForm.start, sessionEditForm.durationMinutes)}</div>
            <div className="ops-button-row">
              <Button variant="primary" disabled={busy} onClick={saveSessionEdit}>Сохранить занятие</Button>
              <Button variant="danger" disabled={busy} onClick={() => setConfirmDelete(editingSession)}>Удалить занятие</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setEditingSession(null)}>Закрыть</Button>
            </div>
          </div>
        )}

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
