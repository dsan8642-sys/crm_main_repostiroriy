import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminScheduleScreen(components, icons, reloadRoleData) {
  const { Button, Badge, Banner, Input, Table, StatusPill } = components
  const I = icons
  return function ApiAdminSchedule({ go, initialTab }) {
    const sessions = globalThis.AdminData?.sessions || []
    const templates = globalThis.AdminData?.templates || []
    const groups = globalThis.AdminData?.groups || []
    const trainers = globalThis.AdminData?.trainers || []
    const participants = globalThis.AdminData?.clients || []
    const [sessionForm, setSessionForm] = useState({
      groupId: groups[0]?.groupId || '',
      trainerId: trainers[0]?.trainerId || '',
      date: new Date().toISOString().slice(0, 10),
      start: '17:00',
      end: '18:00',
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
    const [editingSession, setEditingSession] = useState(null)
    const [sessionEditForm, setSessionEditForm] = useState({
      groupId: '',
      trainerId: '',
      date: '',
      start: '',
      end: '',
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
    const [viewMode, setViewMode] = useState('week')
    const [focusDate, setFocusDate] = useState(new Date().toISOString().slice(0, 10))
    const [filters, setFilters] = useState({ trainerId: '', groupId: '', location: '', status: '' })
    useEffect(() => {
      if (['day', 'week', 'month'].includes(initialTab)) setViewMode(initialTab)
    }, [initialTab])
    const updateSessionForm = (field, value) => setSessionForm((current) => ({ ...current, [field]: value }))
    const updateTemplateForm = (field, value) => setTemplateForm((current) => ({ ...current, [field]: value }))
    const updateGenerateForm = (field, value) => setGenerateForm((current) => ({ ...current, [field]: value }))
    const updateSessionEditForm = (field, value) => setSessionEditForm((current) => ({ ...current, [field]: value }))
    const updateTemplateEditForm = (field, value) => setTemplateEditForm((current) => ({ ...current, [field]: value }))

    function dateTime(date, time) {
      return `${date}T${time}`
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

    function openSessionEdit(session) {
      setEditingSession(session)
      setSessionEditForm({
        groupId: session.groupId || '',
        trainerId: session.trainerId || '',
        date: isoDate(session.startAt),
        start: session.start,
        end: session.end,
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
        const endAt = dateTime(sessionForm.date, sessionForm.end)
        const conflict = await api.post('/api/admin/schedule/check-conflict/', {
          trainer_id: sessionForm.trainerId,
          start_at: startAt,
          end_at: endAt,
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
          end_at: endAt,
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
        const endAt = dateTime(sessionEditForm.date, sessionEditForm.end)
        const conflict = await api.post('/api/admin/schedule/check-conflict/', {
          trainer_id: sessionEditForm.trainerId,
          start_at: startAt,
          end_at: endAt,
          exclude_session_id: editingSession.sessionId,
        })
        if (conflict.has_conflict) {
          setError(Array.isArray(conflict.error) ? conflict.error.join(', ') : conflict.error)
          return
        }
        await api.post(`/api/admin/schedule/sessions/${editingSession.sessionId}/`, {
          group_id: sessionEditForm.groupId,
          trainer_id: sessionEditForm.trainerId,
          start_at: startAt,
          end_at: endAt,
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

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h2 className="page-title">Расписание</h2>
            <p className="page-desc">Занятия, регулярные шаблоны и генерация расписания.</p>
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
          <button type="button" className={`ops-action-card${actionPanel === 'template' ? ' is-active' : ''}`} onClick={() => setActionPanel((current) => current === 'template' ? null : 'template')}>
            <span>Новый шаблон</span>
            <small>Регулярное расписание</small>
          </button>
          <button type="button" className={`ops-action-card${actionPanel === 'generate' ? ' is-active' : ''}`} onClick={() => setActionPanel((current) => current === 'generate' ? null : 'generate')}>
            <span>Сгенерировать</span>
            <small>Создать занятия из шаблона</small>
          </button>
        </div>

        {actionPanel && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(340px, 1fr)', gap: 14, marginBottom: 16 }}>
          {actionPanel === 'session' && (
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Новое занятие</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>Тип занятия<select value={sessionForm.sessionType} onChange={(event) => updateSessionForm('sessionType', event.target.value)}><option value="group">Групповое</option><option value="individual">Индивидуальное</option><option value="split">Сплит для двоих</option></select></label>
              {sessionForm.sessionType !== 'group' && <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>Участник<select value={sessionForm.participantId} onChange={(event) => updateSessionForm('participantId', event.target.value)}><option value="">Выберите участника</option>{participants.map((participant) => <option key={participant.studentId} value={participant.studentId}>{participant.last} {participant.first}</option>)}</select></label>}
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
                <Input label="Окончание" value={sessionForm.end} onChange={(event) => updateSessionForm('end', event.target.value)} placeholder="ЧЧ:ММ" />
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
                <Input label="Окончание" value={sessionEditForm.end} onChange={(event) => updateSessionEditForm('end', event.target.value)} placeholder="ЧЧ:ММ" />
              </div>
              <Input label="Место" value={sessionEditForm.location} onChange={(event) => updateSessionEditForm('location', event.target.value)} />
              <Input label="Лимит участников" value={sessionEditForm.maxParticipants} onChange={(event) => updateSessionEditForm('maxParticipants', event.target.value)} />
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
          <div className="eyebrow" style={{ marginBottom: 10 }}>Шаблоны</div>
          <Table
            rows={templates}
            emptyLabel="Шаблонов пока нет"
            columns={[
              { key: 'group', header: 'Группа' },
              { key: 'trainer', header: 'Тренер', muted: true },
              { key: 'weekdayLabel', header: 'День', muted: true },
              { key: 'time', header: 'Время', render: (row) => <span className="mono">{row.start}-{row.end}</span> },
              { key: 'location', header: 'Место', muted: true },
              { key: 'limit', header: 'Лимит', align: 'right', width: 80 },
              { key: 'active', header: 'Статус', width: 110, render: (row) => <StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /> },
              {
                key: 'actions',
                header: '',
                width: 190,
                render: (row) => (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button size="sm" variant="subtle" disabled={busy} onClick={() => openTemplateEdit(row)}>Изменить</Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => cancelFutureTemplate(row)}>Отменить будущие</Button>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="eyebrow" style={{ marginBottom: 10 }}>Занятия</div>
        <div className="card" style={{ overflow: 'hidden' }}>
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
            </div>
          ))}
          {visibleSessions.length === 0 && <div className="muted" style={{ padding: 16 }}>В выбранном периоде занятий нет.</div>}
        </div>
      </div>
    )
  }
}

