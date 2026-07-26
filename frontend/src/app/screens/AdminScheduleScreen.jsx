import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'

export function createAdminScheduleScreen(components, icons, reloadRoleData) {
  const { Button, Badge, Banner, Dialog, Input, Table, StatusPill } = components
  const I = icons
  return function ApiAdminSchedule({ go, initialTab }) {
    const sessions = globalThis.AdminData?.sessions || []
    const templates = globalThis.AdminData?.templates || []
    const weeklyPlans = globalThis.AdminData?.weeklyPlans || []
    const groups = globalThis.AdminData?.groups || []
    const trainers = globalThis.AdminData?.trainers || []
    const participants = globalThis.AdminData?.clients || []
    const sessionTypeConfigs = globalThis.AdminData?.sessionTypeConfigs || []
    const [sessionForm, setSessionForm] = useState({
      groupId: groups[0]?.groupId || '',
      trainerId: trainers[0]?.trainerId || '',
      date: new Date().toISOString().slice(0, 10),
      start: '17:00',
      durationMinutes: '60',
      price: '',
      location: 'Бассейн',
      maxParticipants: '10',
      notes: '',
      sessionType: 'group',
      participantId: '',
    })
    const [templateForm, setTemplateForm] = useState({
      groupId: groups[0]?.groupId || '',
      trainerId: trainers[0]?.trainerId || '',
      weekday: '0',
      start: '17:00',
      end: '18:00',
      location: 'Бассейн',
      maxParticipants: '10',
      isActive: true,
    })
    const [generateForm, setGenerateForm] = useState({
      templateId: '',
      dateFrom: new Date().toISOString().slice(0, 10),
      dateTo: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      skipConflicts: true,
    })
    const [planForm, setPlanForm] = useState({ name: 'Основное расписание', groupId: groups[0]?.groupId || '' })
    const [slotForm, setSlotForm] = useState({
      planId: '', trainerId: trainers[0]?.trainerId || '', weekday: '0',
      start: '17:00', durationMinutes: '60', location: 'Бассейн', maxParticipants: '10',
    })
    const [planGenerateForm, setPlanGenerateForm] = useState({
      planId: '', dateFrom: new Date().toISOString().slice(0, 10),
      dateTo: new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10), skipConflicts: true,
    })
    const [copyForm, setCopyForm] = useState({
      sourceFrom: '', sourceTo: '', targetFrom: '', targetTo: '',
      includeGroup: true, includeIndividual: true, includeSplit: true,
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
      location: '',
      maxParticipants: '',
      notes: '',
    })
    const [editingTemplate, setEditingTemplate] = useState(null)
    const [templateEditForm, setTemplateEditForm] = useState({
      groupId: '',
      trainerId: '',
      weekday: '0',
      start: '',
      end: '',
      location: '',
      maxParticipants: '',
      isActive: true,
    })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const [actionPanel, setActionPanel] = useState(null)
    const [displayMode, setDisplayMode] = useState('calendar')
    const [viewMode, setViewMode] = useState('week')
    const [focusDate, setFocusDate] = useState(new Date().toISOString().slice(0, 10))
    const [filters, setFilters] = useState({ trainerId: '', groupId: '', location: '', status: '' })
    useEffect(() => {
      if (['day', 'week', 'month'].includes(initialTab)) setViewMode(initialTab)
      if (['calendar', 'list'].includes(initialTab)) setDisplayMode(initialTab)
    }, [initialTab])
    const updateSessionForm = (field, value) => setSessionForm((current) => ({ ...current, [field]: value }))
    const updateTemplateForm = (field, value) => setTemplateForm((current) => ({ ...current, [field]: value }))
    const updateGenerateForm = (field, value) => setGenerateForm((current) => ({ ...current, [field]: value }))
    const updateSessionEditForm = (field, value) => setSessionEditForm((current) => ({ ...current, [field]: value }))
    const updateTemplateEditForm = (field, value) => setTemplateEditForm((current) => ({ ...current, [field]: value }))
    const updatePlanForm = (field, value) => setPlanForm((current) => ({ ...current, [field]: value }))
    const updateSlotForm = (field, value) => setSlotForm((current) => ({ ...current, [field]: value }))
    const updatePlanGenerateForm = (field, value) => setPlanGenerateForm((current) => ({ ...current, [field]: value }))
    const updateCopyForm = (field, value) => setCopyForm((current) => ({ ...current, [field]: value }))

    function dateTime(date, time) {
      return `${date}T${time}`
    }

    function endTime(start, durationMinutes) {
      const [hours, minutes] = String(start || '00:00').split(':').map(Number)
      const total = (hours * 60 + minutes + Number(durationMinutes || 60)) % (24 * 60)
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }

    function updateSessionType(sessionType) {
      const defaults = sessionTypeConfigs.find((item) => item.code === sessionType)
      setSessionForm((current) => ({
        ...current,
        sessionType,
        durationMinutes: String(defaults?.default_duration_minutes || 60),
        maxParticipants: String(defaults?.default_capacity || (sessionType === 'split' ? 2 : current.maxParticipants)),
      }))
    }

    const locations = [...new Set(sessions.map((session) => session.location).filter(Boolean))]
    const visibleSessions = sessions.filter((session) => {
      const date = String(session.startAt || '').slice(0, 10)
      const anchor = new Date(`${focusDate}T12:00:00`)
      const current = new Date(`${date}T12:00:00`)
      const monday = new Date(anchor); monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7))
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
      const inPeriod = viewMode === 'day' ? date === focusDate : viewMode === 'month' ? date.slice(0, 7) === focusDate.slice(0, 7) : current >= monday && current <= sunday
      return inPeriod && (!filters.trainerId || String(session.trainerId) === filters.trainerId) && (!filters.groupId || String(session.groupId) === filters.groupId) && (!filters.location || session.location === filters.location) && (!filters.status || (filters.status === 'cancelled') === Boolean(session.isCancelled))
    })

    function isoDate(iso) {
      return String(iso || '').slice(0, 10)
    }

    function dateFromIso(value) {
      return new Date(`${value}T12:00:00`)
    }

    function dateToIso(value) {
      const year = value.getFullYear()
      const month = String(value.getMonth() + 1).padStart(2, '0')
      const day = String(value.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    function addDays(value, amount) {
      const result = new Date(value)
      result.setDate(result.getDate() + amount)
      return result
    }

    const calendarDates = useMemo(() => {
      const anchor = dateFromIso(focusDate)
      if (viewMode === 'day') return [focusDate]
      if (viewMode === 'week') {
        const monday = addDays(anchor, -((anchor.getDay() + 6) % 7))
        return Array.from({ length: 7 }, (_, index) => dateToIso(addDays(monday, index)))
      }
      const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)
      const gridStart = addDays(monthStart, -((monthStart.getDay() + 6) % 7))
      const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12)
      const gridEnd = addDays(monthEnd, 6 - ((monthEnd.getDay() + 6) % 7))
      const days = Math.round((gridEnd - gridStart) / 86400000) + 1
      return Array.from({ length: days }, (_, index) => dateToIso(addDays(gridStart, index)))
    }, [focusDate, viewMode])

    const sessionsByDate = useMemo(() => {
      const grouped = {}
      visibleSessions.forEach((session) => {
        const date = isoDate(session.startAt)
        grouped[date] = [...(grouped[date] || []), session]
      })
      Object.values(grouped).forEach((items) => items.sort((left, right) => String(left.startAt).localeCompare(String(right.startAt))))
      return grouped
    }, [visibleSessions])

    function openSessionEdit(session) {
      setEditingSession(session)
      setSessionEditForm({
        groupId: session.groupId || '',
        trainerId: session.trainerId || '',
        date: isoDate(session.startAt),
        start: session.start,
        durationMinutes: String(session.durationMinutes || 60),
        price: session.priceMinor == null ? '' : String(session.priceMinor / 100),
        location: session.location || '',
        maxParticipants: String(session.limit || 0),
        notes: session.notes || '',
      })
    }

    function openTemplateEdit(template) {
      setEditingTemplate(template)
      setTemplateEditForm({
        groupId: template.groupId || '',
        trainerId: template.trainerId || '',
        weekday: String(template.weekday ?? 0),
        start: template.start,
        end: template.end,
        location: template.location || '',
        maxParticipants: String(template.limit || 0),
        isActive: template.active,
      })
    }

    async function createSession() {
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
        })
        setMessage('Занятие создано.')
        setActionPanel(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function createTemplate() {
      setBusy(true)
      setError(null)
      try {
        await api.post('/api/admin/schedule/templates/', {
          group_id: templateForm.groupId,
          trainer_id: templateForm.trainerId,
          weekday: Number(templateForm.weekday),
          start_time: templateForm.start,
          end_time: templateForm.end,
          location: templateForm.location,
          max_participants: Number(templateForm.maxParticipants || 0),
          is_active: templateForm.isActive,
        })
        setMessage('Шаблон расписания создан.')
        setActionPanel(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function generateSessions() {
      if (!generateForm.templateId) {
        setError('Выберите шаблон расписания.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        const result = await api.post(`/api/admin/schedule/templates/${generateForm.templateId}/generate/`, {
          date_from: generateForm.dateFrom,
          date_to: generateForm.dateTo,
          skip_conflicts: generateForm.skipConflicts,
        })
        setMessage(`Создано занятий: ${result.created_count}. Пропущено: ${result.skipped_count}.`)
        setActionPanel(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function saveSessionEdit() {
      if (!editingSession) return
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
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
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
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    // The backend only allows this for a session with no attendance and no
    // payroll; anything that already happened must be cancelled instead, and
    // it answers with an explanatory error we surface as-is.
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
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
        setConfirmDelete(null)
      } finally {
        setBusy(false)
      }
    }

    async function saveTemplateEdit() {
      if (!editingTemplate) return
      setBusy(true)
      setError(null)
      try {
        await api.post(`/api/admin/schedule/templates/${editingTemplate.templateId}/`, {
          group_id: templateEditForm.groupId,
          trainer_id: templateEditForm.trainerId,
          weekday: Number(templateEditForm.weekday),
          start_time: templateEditForm.start,
          end_time: templateEditForm.end,
          location: templateEditForm.location,
          max_participants: Number(templateEditForm.maxParticipants || 0),
          is_active: templateEditForm.isActive,
        })
        setEditingTemplate(null)
        setMessage('Шаблон обновлён.')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function cancelFutureTemplate(template) {
      setBusy(true)
      setError(null)
      try {
        const result = await api.post(`/api/admin/schedule/templates/${template.templateId}/cancel-future/`, {
          date_from: new Date().toISOString().slice(0, 10),
        })
        setMessage(`Отменено будущих занятий: ${result.cancelled}.`)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function createWeeklyPlan() {
      setBusy(true); setError(null)
      try {
        await api.post('/api/admin/schedule/plans/', { name: planForm.name, group_id: planForm.groupId })
        setMessage('Недельный план создан.')
        setActionPanel(null)
        await reloadRoleData?.('admin')
      } catch (err) { setError(err.message) } finally { setBusy(false) }
    }

    async function createWeeklyPlanSlot() {
      if (!slotForm.planId) return setError('Выберите недельный план.')
      setBusy(true); setError(null)
      try {
        await api.post(`/api/admin/schedule/plans/${slotForm.planId}/slots/`, {
          trainer_id: slotForm.trainerId,
          weekday: Number(slotForm.weekday),
          start_time: slotForm.start,
          duration_minutes: Number(slotForm.durationMinutes),
          location: slotForm.location,
          max_participants: Number(slotForm.maxParticipants),
        })
        setMessage('Слот добавлен в недельный план.')
        setActionPanel(null)
        await reloadRoleData?.('admin')
      } catch (err) { setError(err.message) } finally { setBusy(false) }
    }

    async function generateWeeklyPlan() {
      if (!planGenerateForm.planId) return setError('Выберите недельный план.')
      setBusy(true); setError(null)
      try {
        const result = await api.post(`/api/admin/schedule/plans/${planGenerateForm.planId}/generate/`, {
          date_from: planGenerateForm.dateFrom,
          date_to: planGenerateForm.dateTo,
          skip_conflicts: planGenerateForm.skipConflicts,
        })
        setMessage(`Создано занятий: ${result.created_count}. Пропущено: ${result.skipped_count}.`)
        setActionPanel(null)
        await reloadRoleData?.('admin')
      } catch (err) { setError(err.message) } finally { setBusy(false) }
    }

    async function previewPeriodCopy() {
      setBusy(true); setError(null)
      try {
        const result = await api.post('/api/admin/schedule/copy/preview/', {
          source_from: copyForm.sourceFrom, source_to: copyForm.sourceTo,
          target_from: copyForm.targetFrom, target_to: copyForm.targetTo,
          include_group: copyForm.includeGroup,
          include_individual: copyForm.includeIndividual,
          include_split: copyForm.includeSplit,
        })
        setCopyPreview({ ...result, selectedIndices: result.rows.filter((row) => row.status === 'ready').map((row) => row.index) })
      } catch (err) { setError(err.message) } finally { setBusy(false) }
    }

    async function commitPeriodCopy() {
      if (!copyPreview) return
      setBusy(true); setError(null)
      try {
        const result = await api.post('/api/admin/schedule/copy/commit/', {
          batch_id: copyPreview.batch_id,
          selected_indices: copyPreview.selectedIndices,
        })
        setMessage(`Скопировано занятий: ${result.created_count}. Пропущено: ${result.skipped_count}.`)
        setCopyPreview(null); setActionPanel(null)
        await reloadRoleData?.('admin')
      } catch (err) { setError(err.message) } finally { setBusy(false) }
    }

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h2 className="page-title">Расписание</h2>
            <p className="page-desc">Занятия, недельные планы групп и безопасное копирование периодов.</p>
          </div>
          <div className="seg" role="group" aria-label="Режим отображения расписания">
            <button type="button" className={displayMode === 'calendar' ? 'on' : ''} aria-pressed={displayMode === 'calendar'} onClick={() => setDisplayMode('calendar')}>
              <I.Calendar size={15} /> Календарь
            </button>
            <button type="button" className={displayMode === 'list' ? 'on' : ''} aria-pressed={displayMode === 'list'} onClick={() => setDisplayMode('list')}>
              <I.List size={15} /> Список
            </button>
          </div>
        </div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Сохраняю изменения расписания...</BusyBanner>

        <div className="card card-pad ops-calendar-toolbar">
          <div className="seg">{[['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц']].map(([value, label]) => <button key={value} type="button" className={viewMode === value ? 'on' : ''} onClick={() => setViewMode(value)}>{label}</button>)}</div>
          <Input label="Опорная дата" value={focusDate} onChange={(event) => setFocusDate(event.target.value)} />
          <label>Тренер<select value={filters.trainerId} onChange={(event) => setFilters({ ...filters, trainerId: event.target.value })}><option value="">Все</option>{trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</select></label>
          <label>Группа<select value={filters.groupId} onChange={(event) => setFilters({ ...filters, groupId: event.target.value })}><option value="">Все</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></label>
          <label>Локация<select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">Все</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
          <label>Статус<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Все</option><option value="planned">Запланировано</option><option value="cancelled">Отменено</option></select></label>
          <Badge tone="primary">{visibleSessions.length} занятий</Badge>
        </div>

        <div className="ops-action-strip">
          <button type="button" className={`ops-action-card${actionPanel === 'session' ? ' is-active' : ''}`} onClick={() => setActionPanel((current) => current === 'session' ? null : 'session')}>
            <span>Новое занятие</span>
            <small>Разовое занятие</small>
          </button>
          <button type="button" className={`ops-action-card${actionPanel === 'plan' ? ' is-active' : ''}`} onClick={() => setActionPanel((current) => current === 'plan' ? null : 'plan')}>
            <span>Недельный план</span>
            <small>План для целой группы</small>
          </button>
          <button type="button" className={`ops-action-card${actionPanel === 'slot' ? ' is-active' : ''}`} onClick={() => setActionPanel((current) => current === 'slot' ? null : 'slot')}>
            <span>Добавить слот</span>
            <small>День и время в плане</small>
          </button>
          <button type="button" className={`ops-action-card${actionPanel === 'plan-generate' ? ' is-active' : ''}`} onClick={() => setActionPanel((current) => current === 'plan-generate' ? null : 'plan-generate')}>
            <span>Создать по плану</span>
            <small>Заполнить выбранный период</small>
          </button>
          <button type="button" className={`ops-action-card${actionPanel === 'copy' ? ' is-active' : ''}`} onClick={() => setActionPanel((current) => current === 'copy' ? null : 'copy')}>
            <span>Копировать период</span>
            <small>Предпросмотр перед записью</small>
          </button>
        </div>

        {actionPanel && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(340px, 1fr)', gap: 14, marginBottom: 16 }}>
          {actionPanel === 'session' && (
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Новое занятие</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>Тип занятия<select value={sessionForm.sessionType} onChange={(event) => updateSessionType(event.target.value)}><option value="group">Групповое</option><option value="individual">Индивидуальное</option><option value="split">Сплит для двоих</option></select></label>
              {sessionForm.sessionType !== 'group' && <SearchableSelect label="Участник" value={sessionForm.participantId} onChange={(value) => updateSessionForm('participantId', value)} options={participants.map((participant) => clientSelectOption(participant))} />}
              {sessionForm.sessionType === 'group' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Группа
                <select value={sessionForm.groupId} onChange={(event) => updateSessionForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Выберите группу</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Тренер
                <select value={sessionForm.trainerId} onChange={(event) => updateSessionForm('trainerId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Выберите тренера</option>
                  {trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}
                </select>
              </label>
              <Input label="Дата" value={sessionForm.date} onChange={(event) => updateSessionForm('date', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input label="Начало" value={sessionForm.start} onChange={(event) => updateSessionForm('start', event.target.value)} placeholder="ЧЧ:ММ" />
                <Input label="Длительность, мин" value={sessionForm.durationMinutes} onChange={(event) => updateSessionForm('durationMinutes', event.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: 6 }}>
                  Окончание: {endTime(sessionForm.start, sessionForm.durationMinutes)}
                </div>
                <div className="ops-button-row">
                  {[30, 45, 60, 90, 120].map((minutes) => (
                    <Button key={minutes} size="sm" variant={Number(sessionForm.durationMinutes) === minutes ? 'primary' : 'subtle'}
                      onClick={() => updateSessionForm('durationMinutes', String(minutes))}>{minutes} мин</Button>
                  ))}
                </div>
              </div>
              <Input label="Место" value={sessionForm.location} onChange={(event) => updateSessionForm('location', event.target.value)} />
              <Input label="Лимит участников" value={sessionForm.maxParticipants} onChange={(event) => updateSessionForm('maxParticipants', event.target.value)} />
              <Input label="Заметки" value={sessionForm.notes} onChange={(event) => updateSessionForm('notes', event.target.value)} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" loading={busy && !editingSession && !editingTemplate} disabled={busy} onClick={createSession}>Создать занятие</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setActionPanel(null)} style={{ marginLeft: 8 }}>Закрыть</Button>
            </div>
          </div>
          )}

          {actionPanel === 'template' && (
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Новый шаблон</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Группа
                <select value={templateForm.groupId} onChange={(event) => updateTemplateForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Выберите группу</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Тренер
                <select value={templateForm.trainerId} onChange={(event) => updateTemplateForm('trainerId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Выберите тренера</option>
                  {trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                День недели
                <select value={templateForm.weekday} onChange={(event) => updateTemplateForm('weekday', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="0">Понедельник</option>
                  <option value="1">Вторник</option>
                  <option value="2">Среда</option>
                  <option value="3">Четверг</option>
                  <option value="4">Пятница</option>
                  <option value="5">Суббота</option>
                  <option value="6">Воскресенье</option>
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input label="Начало" value={templateForm.start} onChange={(event) => updateTemplateForm('start', event.target.value)} placeholder="ЧЧ:ММ" />
                <Input label="Окончание" value={templateForm.end} onChange={(event) => updateTemplateForm('end', event.target.value)} placeholder="ЧЧ:ММ" />
              </div>
              <Input label="Место" value={templateForm.location} onChange={(event) => updateTemplateForm('location', event.target.value)} />
              <Input label="Лимит участников" value={templateForm.maxParticipants} onChange={(event) => updateTemplateForm('maxParticipants', event.target.value)} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={templateForm.isActive} onChange={(event) => updateTemplateForm('isActive', event.target.checked)} />
              Активен
            </label>
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" loading={busy && !editingSession && !editingTemplate} disabled={busy} onClick={createTemplate}>Создать шаблон</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setActionPanel(null)} style={{ marginLeft: 8 }}>Закрыть</Button>
            </div>
          </div>
          )}
        </div>
        )}

        {actionPanel === 'generate' && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Генерация из шаблона</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.5fr) 1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Шаблон
              <select value={generateForm.templateId} onChange={(event) => updateGenerateForm('templateId', event.target.value)} style={{ minHeight: 36 }}>
                <option value="">Выберите шаблон</option>
                {templates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>{template.group} · {template.weekdayLabel} {template.start}</option>
                ))}
              </select>
            </label>
            <Input label="С даты" value={generateForm.dateFrom} onChange={(event) => updateGenerateForm('dateFrom', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
            <Input label="По дату" value={generateForm.dateTo} onChange={(event) => updateGenerateForm('dateTo', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={generateForm.skipConflicts} onChange={(event) => updateGenerateForm('skipConflicts', event.target.checked)} />
              Пропускать конфликты
            </label>
            <Button variant="primary" loading={busy && !editingSession && !editingTemplate} disabled={busy} onClick={generateSessions}>Сгенерировать</Button>
            <Button variant="secondary" disabled={busy} onClick={() => setActionPanel(null)}>Закрыть</Button>
          </div>
        </div>
        )}

        {actionPanel === 'plan' && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Новый недельный план</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
              <Input label="Название" value={planForm.name} onChange={(event) => updatePlanForm('name', event.target.value)} />
              <label>Группа<select value={planForm.groupId} onChange={(event) => updatePlanForm('groupId', event.target.value)}><option value="">Выберите группу</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></label>
              <Button variant="primary" disabled={busy} onClick={createWeeklyPlan}>Создать план</Button>
            </div>
          </div>
        )}

        {actionPanel === 'slot' && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Новый слот плана</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <label>План<select value={slotForm.planId} onChange={(event) => updateSlotForm('planId', event.target.value)}><option value="">Выберите план</option>{weeklyPlans.filter((plan) => plan.active).map((plan) => <option key={plan.planId} value={plan.planId}>{plan.group} · {plan.name}</option>)}</select></label>
              <label>Тренер<select value={slotForm.trainerId} onChange={(event) => updateSlotForm('trainerId', event.target.value)}>{trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</select></label>
              <label>День<select value={slotForm.weekday} onChange={(event) => updateSlotForm('weekday', event.target.value)}>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
              <Input label="Начало" value={slotForm.start} onChange={(event) => updateSlotForm('start', event.target.value)} />
              <Input label="Длительность, мин" value={slotForm.durationMinutes} onChange={(event) => updateSlotForm('durationMinutes', event.target.value)} />
              <Input label="Место" value={slotForm.location} onChange={(event) => updateSlotForm('location', event.target.value)} />
              <Input label="Лимит" value={slotForm.maxParticipants} onChange={(event) => updateSlotForm('maxParticipants', event.target.value)} />
              <Button variant="primary" disabled={busy} onClick={createWeeklyPlanSlot}>Добавить слот</Button>
            </div>
          </div>
        )}

        {actionPanel === 'plan-generate' && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Создать занятия по недельному плану</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
              <label>План<select value={planGenerateForm.planId} onChange={(event) => updatePlanGenerateForm('planId', event.target.value)}><option value="">Выберите план</option>{weeklyPlans.filter((plan) => plan.active).map((plan) => <option key={plan.planId} value={plan.planId}>{plan.group} · {plan.name}</option>)}</select></label>
              <Input label="С даты" value={planGenerateForm.dateFrom} onChange={(event) => updatePlanGenerateForm('dateFrom', event.target.value)} />
              <Input label="По дату" value={planGenerateForm.dateTo} onChange={(event) => updatePlanGenerateForm('dateTo', event.target.value)} />
              <label><input type="checkbox" checked={planGenerateForm.skipConflicts} onChange={(event) => updatePlanGenerateForm('skipConflicts', event.target.checked)} /> Пропускать конфликты</label>
              <Button variant="primary" disabled={busy} onClick={generateWeeklyPlan}>Создать занятия</Button>
            </div>
          </div>
        )}

        {actionPanel === 'copy' && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Копирование расписания за период</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Input label="Источник с" value={copyForm.sourceFrom} onChange={(event) => updateCopyForm('sourceFrom', event.target.value)} />
              <Input label="Источник по" value={copyForm.sourceTo} onChange={(event) => updateCopyForm('sourceTo', event.target.value)} />
              <Input label="Назначение с" value={copyForm.targetFrom} onChange={(event) => updateCopyForm('targetFrom', event.target.value)} />
              <Input label="Назначение по" value={copyForm.targetTo} onChange={(event) => updateCopyForm('targetTo', event.target.value)} />
            </div>
            <div className="ops-button-row" style={{ marginTop: 10 }}>
              {[['includeGroup', 'Групповые'], ['includeIndividual', 'Индивидуальные'], ['includeSplit', 'Сплит']].map(([field, label]) => <label key={field}><input type="checkbox" checked={copyForm[field]} onChange={(event) => updateCopyForm(field, event.target.checked)} /> {label}</label>)}
              <Button variant="primary" disabled={busy} onClick={previewPeriodCopy}>Проверить</Button>
              {copyPreview && <Button variant="secondary" disabled={busy || !copyPreview.selectedIndices.length} onClick={commitPeriodCopy}>Скопировать {copyPreview.selectedIndices.length}</Button>}
            </div>
            {copyPreview && <div className="muted" style={{ marginTop: 10 }}>Готово: {copyPreview.selectedIndices.length}; конфликты или пропуски: {copyPreview.rows.length - copyPreview.selectedIndices.length}. Запись начнётся только после подтверждения.</div>}
          </div>
        )}

        {editingSession && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Редактирование занятия</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Группа
                <select value={sessionEditForm.groupId} onChange={(event) => updateSessionEditForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Выберите группу</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Тренер
                <select value={sessionEditForm.trainerId} onChange={(event) => updateSessionEditForm('trainerId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Выберите тренера</option>
                  {trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}
                </select>
              </label>
              <Input label="Дата" value={sessionEditForm.date} onChange={(event) => updateSessionEditForm('date', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input label="Начало" value={sessionEditForm.start} onChange={(event) => updateSessionEditForm('start', event.target.value)} placeholder="ЧЧ:ММ" />
                <Input label="Длительность, мин" value={sessionEditForm.durationMinutes} onChange={(event) => updateSessionEditForm('durationMinutes', event.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div className="muted" style={{ fontSize: 'var(--fs-xs)', marginBottom: 6 }}>
                  Окончание: {endTime(sessionEditForm.start, sessionEditForm.durationMinutes)}
                </div>
                <div className="ops-button-row">
                  {[30, 45, 60, 90, 120].map((minutes) => (
                    <Button key={minutes} size="sm" variant={Number(sessionEditForm.durationMinutes) === minutes ? 'primary' : 'subtle'}
                      onClick={() => updateSessionEditForm('durationMinutes', String(minutes))}>{minutes} мин</Button>
                  ))}
                </div>
              </div>
              <Input label="Место" value={sessionEditForm.location} onChange={(event) => updateSessionEditForm('location', event.target.value)} />
              <Input label="Лимит участников" value={sessionEditForm.maxParticipants} onChange={(event) => updateSessionEditForm('maxParticipants', event.target.value)} />
              <Input label="Цена, PLN" value={sessionEditForm.price} onChange={(event) => updateSessionEditForm('price', event.target.value)} placeholder="Например, 80" />
              <Input label="Заметки" value={sessionEditForm.notes} onChange={(event) => updateSessionEditForm('notes', event.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" loading={busy} disabled={busy} onClick={saveSessionEdit}>Сохранить занятие</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setEditingSession(null)}>Закрыть</Button>
            </div>
          </div>
        )}

        {editingTemplate && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Редактирование шаблона</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Группа
                <select value={templateEditForm.groupId} onChange={(event) => updateTemplateEditForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Выберите группу</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Тренер
                <select value={templateEditForm.trainerId} onChange={(event) => updateTemplateEditForm('trainerId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Выберите тренера</option>
                  {trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                День недели
                <select value={templateEditForm.weekday} onChange={(event) => updateTemplateEditForm('weekday', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="0">Понедельник</option>
                  <option value="1">Вторник</option>
                  <option value="2">Среда</option>
                  <option value="3">Четверг</option>
                  <option value="4">Пятница</option>
                  <option value="5">Суббота</option>
                  <option value="6">Воскресенье</option>
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input label="Начало" value={templateEditForm.start} onChange={(event) => updateTemplateEditForm('start', event.target.value)} placeholder="ЧЧ:ММ" />
                <Input label="Окончание" value={templateEditForm.end} onChange={(event) => updateTemplateEditForm('end', event.target.value)} placeholder="ЧЧ:ММ" />
              </div>
              <Input label="Место" value={templateEditForm.location} onChange={(event) => updateTemplateEditForm('location', event.target.value)} />
              <Input label="Лимит участников" value={templateEditForm.maxParticipants} onChange={(event) => updateTemplateEditForm('maxParticipants', event.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                <input type="checkbox" checked={templateEditForm.isActive} onChange={(event) => updateTemplateEditForm('isActive', event.target.checked)} />
                Активен
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" loading={busy} disabled={busy} onClick={saveTemplateEdit}>Сохранить шаблон</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setEditingTemplate(null)}>Закрыть</Button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Недельные планы</div>
          <Table
            rows={weeklyPlans}
            emptyLabel="Недельных планов пока нет"
            columns={[
              { key: 'group', header: 'Группа' },
              { key: 'name', header: 'Название' },
              { key: 'slots', header: 'Слоты', render: (row) => row.slots.length ? row.slots.map((slot) => `${slot.weekday_label} ${slot.start_time} · ${slot.trainer}`).join(', ') : 'Нет слотов' },
              { key: 'active', header: 'Статус', width: 110, render: (row) => <StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /> },
            ]}
          />
        </div>

        <div className="eyebrow" style={{ marginBottom: 10 }}>Занятия</div>
        {displayMode === 'calendar' && (
          <div
            className={`ops-schedule-calendar is-${viewMode}`}
            data-testid="schedule-calendar"
            aria-label="Календарь занятий"
          >
            {calendarDates.map((date) => {
              const daySessions = sessionsByDate[date] || []
              const dateValue = dateFromIso(date)
              const outsideMonth = viewMode === 'month' && date.slice(0, 7) !== focusDate.slice(0, 7)
              return (
                <section key={date} className={`ops-schedule-day${outsideMonth ? ' is-outside' : ''}${date === new Date().toISOString().slice(0, 10) ? ' is-today' : ''}`}>
                  <header>
                    <span>{dateValue.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                    <strong>{dateValue.toLocaleDateString('ru-RU', { day: 'numeric', month: viewMode === 'month' ? undefined : 'short' })}</strong>
                  </header>
                  <div className="ops-schedule-day-events">
                    {daySessions.map((session) => (
                      <div key={session.id} className="ops-schedule-event-wrap">
                        <button
                          type="button"
                          className={`ops-schedule-event${session.isCancelled ? ' is-cancelled' : ''}`}
                          onClick={() => go('attendance', { sessionId: session.sessionId })}
                          title={`${session.start}-${session.end} · ${session.group} · ${session.trainer}`}
                        >
                          <span className="mono">{session.start}-{session.end}</span>
                          <strong>{session.group}</strong>
                          <small>{session.trainer}</small>
                          <small><I.Location size={11} /> {session.location}</small>
                        </button>
                        {/* Editing used to be reachable only from list mode, so
                            the trainer of a scheduled class looked unchangeable. */}
                        <button
                          type="button"
                          className="ops-schedule-event-edit"
                          title="Изменить занятие"
                          aria-label={`Изменить занятие ${session.start} ${session.group}`}
                          disabled={busy || session.isCancelled}
                          onClick={(event) => { event.stopPropagation(); openSessionEdit(session) }}
                        >
                          <I.Pencil size={12} />
                        </button>
                      </div>
                    ))}
                    {!daySessions.length && <span className="ops-schedule-empty-day">Нет занятий</span>}
                  </div>
                </section>
              )
            })}
          </div>
        )}
        {displayMode === 'list' && <div className="card" data-testid="schedule-list" style={{ overflow: 'hidden' }}>
          {visibleSessions.map((session, index) => (
            <div
              key={session.id}
              role="button"
              tabIndex={0}
              className="ops-session-row"
              onClick={() => go('attendance', { sessionId: session.sessionId })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  go('attendance', { sessionId: session.sessionId })
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: index < sessions.length - 1 ? '1px solid var(--border-subtle)' : 'none', cursor: 'pointer' }}
            >
              <span className="mono" style={{ width: 104, fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{session.date}</span>
              <span className="mono" style={{ width: 104, fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{session.start}-{session.end}</span>
              <span className="strong" style={{ flex: 1 }}>{session.group}</span>
              <span className="muted" style={{ width: 160 }}>{session.trainer}</span>
              <span className="muted" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}><I.Location size={13} />{session.location}</span>
              <button type="button" className="ops-count-button" onClick={(event) => { event.stopPropagation(); go('attendance', { sessionId: session.sessionId }) }}>{session.count}/{session.limit}</button>
              <Badge tone={session.status === 'cancelled' ? 'danger' : 'primary'}>{session.status === 'cancelled' ? 'Отменено' : 'Запланировано'}</Badge>
              <Button size="sm" variant="subtle" onClick={(event) => { event.stopPropagation(); go('attendance', { sessionId: session.sessionId }) }}>Открыть</Button>
              <Button size="sm" variant="subtle" disabled={busy || session.isCancelled} onClick={(event) => { event.stopPropagation(); openSessionEdit(session) }}>Изменить</Button>
              <Button size="sm" variant="secondary" disabled={busy || session.isCancelled} onClick={(event) => { event.stopPropagation(); cancelSession(session) }}>Отменить</Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={(event) => { event.stopPropagation(); setConfirmDelete(session) }}>Удалить</Button>
            </div>
          ))}
          {visibleSessions.length === 0 && <div className="muted" style={{ padding: 16 }}>В выбранном периоде занятий нет.</div>}
        </div>}
        <Dialog
          open={confirmDelete != null}
          tone="danger"
          irreversible
          title="Удалить занятие?"
          description={confirmDelete
            ? `${confirmDelete.date} ${confirmDelete.start}-${confirmDelete.end} · ${confirmDelete.group}. Занятие с отметками посещаемости удалить нельзя — его нужно отменить.`
            : ''}
          confirmLabel="Удалить"
          cancelLabel="Отмена"
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => deleteSession(confirmDelete)}
        />
      </div>
    )
  }
}

