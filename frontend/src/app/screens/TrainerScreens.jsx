import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage } from '../../api.js'
import { formatDate, formatShortDate, formatTime, mapTrainerSession } from '../../mappers.js'
import { CalendarNavigation, ScheduleCalendar, ScheduleList, ScheduleViewSwitcher } from '../ScheduleCalendar.jsx'
import { calendarRange, DEFAULT_SCHEDULE_VIEW, localToday } from '../scheduleContracts.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { scheduleColorStyle } from '../schedulePalette.js'

export function createTrainerSessionScreen(components, icons, reloadRoleData, trainerData = {}) {
  const { Button, Avatar, Banner, Dialog, StatusPill } = components
  const I = icons
  const options = ['present', 'absent', 'excused', 'rescheduled']
  const labels = { present: 'Был', absent: 'Не был', excused: 'Уважительная', rescheduled: 'Перенос' }

  return function ApiTrainerSession({ go, trainerSessionId }) {
    const [rows, setRows] = useState(() => [...(trainerData.roster || [])])
    const [title, setTitle] = useState(trainerData.activeSessionTitle || 'Посещаемость')
    const [sessionMeta, setSessionMeta] = useState({
      date: trainerData.activeSessionDate || '',
      status: trainerData.activeSessionStatus,
      cancelled: Boolean(trainerData.activeSessionCancelled),
    })
    const [bulkPending, setBulkPending] = useState(false)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [rowErrors, setRowErrors] = useState({})
    const [busyId, setBusyId] = useState(null)
    const [loading, setLoading] = useState(false)
    const sessionId = trainerSessionId || trainerData.activeSessionId

    useEffect(() => {
      setRows([...(trainerData.roster || [])])
    }, [trainerData.roster])

    useEffect(() => {
      if (!trainerSessionId) return
      let alive = true
      setLoading(true)
      api.get(`/api/trainer/sessions/${trainerSessionId}/`)
        .then((payload) => {
          if (!alive) return
          setTitle(`${payload.session?.group?.name || 'Индивидуальное'} · ${formatTime(payload.session?.start_at)}-${formatTime(payload.session?.end_at)}`)
          setSessionMeta({
            date: formatShortDate(payload.session?.start_at),
            status: payload.session?.is_cancelled ? 'cancelled' : 'planned',
            cancelled: Boolean(payload.session?.is_cancelled),
          })
          setRows((payload.students || []).map((student) => ({
            id: String(student.id),
            studentId: student.id,
            name: student.full_name,
            emergency: student.emergency_contact_name || student.client_phone || '',
            med: '',
            status: student.attendance?.status || null,
          })))
        })
        .catch((err) => setError(apiErrorMessage(err, 'Не удалось загрузить занятие.')))
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, [trainerSessionId])

    async function mark(row, status) {
      if (!sessionId || !row.studentId || sessionMeta.cancelled) return
      setBusyId(row.id)
      setError(null)
      setRowErrors((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
      try {
        await api.post(`/api/trainer/sessions/${sessionId}/attendance/`, {
          student_id: row.studentId,
          status,
        })
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, status } : item))
        setMessage(`${row.name}: ${labels[status]}. Влияние на абонемент: ${status === 'present' || status === 'absent' ? '-1 занятие' : 'без списания'}.`)
        reloadRoleData?.('trainer')
      } catch (err) {
        const message = apiErrorMessage(err, 'Не удалось сохранить посещаемость.')
        setRowErrors((current) => ({ ...current, [row.id]: message }))
        document.querySelector(`#trainer-attendance-row-${row.id} button`)?.focus()
      } finally {
        setBusyId(null)
      }
    }

    async function markAllPresent() {
      setBusyId('all'); setError(null); setRowErrors({})
      try {
        const result = await api.post(`/api/trainer/sessions/${sessionId}/attendance/bulk/`, {
          items: rows.map((row) => ({ student_id: row.studentId, status: 'present' })),
        })
        setRows((current) => current.map((row) => ({ ...row, status: 'present' })))
        setMessage(`Отмечены присутствующими: ${result.updated_count}. Списывается по одному занятию у каждого участника.`)
      } catch (err) {
        const nextRowErrors = {}
        for (const [field, items] of Object.entries(err.fieldErrors || {})) {
          const match = field.match(/^items\.(\d+)\./)
          const row = match ? rows[Number(match[1])] : null
          const message = (Array.isArray(items) ? items : [items])
            .map((item) => typeof item === 'string' ? item : item?.message)
            .filter(Boolean).join(' ')
          if (row && message) nextRowErrors[row.id] = message
        }
        setRowErrors(nextRowErrors)
        if (Object.keys(nextRowErrors).length) {
          const firstId = Object.keys(nextRowErrors)[0]
          document.querySelector(`#trainer-attendance-row-${firstId} button`)?.focus()
        } else {
          setError(apiErrorMessage(err, 'Не удалось сохранить посещаемость.'))
        }
      } finally { setBusyId(null) }
    }

    return (
      <div className="page">
        <div className="page-head">
          <div>
            <button onClick={() => go('sessions')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', padding: 0, marginBottom: 6 }}><I.ArrowLeft size={14} /> Мои занятия</button>
            <h1 className="page-title">{title}</h1>
            <p className="page-desc">{sessionMeta.date} · <StatusPill status={sessionMeta.status || 'planned'} size="sm" /></p>
            <p className="page-desc">Отметьте посещаемость каждого ученика.</p>
          </div>
          <Button variant="primary" disabled={sessionMeta.cancelled || !rows.length || busyId != null} loading={busyId === 'all'} onClick={() => setBulkPending(true)}>Все присутствовали</Button>
        </div>

        <ToastNotice id="trainer-attendance-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 14 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={loading}>Загружаю состав занятия...</BusyBanner>
        <BusyBanner Banner={Banner} show={busyId != null}>Сохраняю посещаемость...</BusyBanner>

        {sessionMeta.cancelled && <Banner tone="warning" title="Занятие отменено" style={{ marginBottom: 14 }}>Посещаемость доступна только для чтения. История занятия сохранена.</Banner>}
        <div className="card ops-attendance-list" style={{ overflow: 'hidden' }}>
          {rows.map((row, index) => (
            <div key={row.id} className="ops-attendance-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: index < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: row.status ? 'transparent' : 'var(--amber-50)' }}>
              <Avatar name={row.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong">{row.name}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-2xs)' }}>Данные доступны только в рамках занятия</div>
              </div>
              <div id={`trainer-attendance-row-${row.id}`} className="ops-attendance-actions" role="group" aria-describedby={rowErrors[row.id] ? `trainer-attendance-row-${row.id}-error` : undefined} style={{ display: 'flex', gap: 4 }}>
                {options.map((status) => {
                  const on = row.status === status
                  const consumes = status === 'present' || status === 'absent'
                  return (
                    <Button
                      key={status}
                      size="sm"
                      variant={on ? 'primary' : 'secondary'}
                      loading={busyId === row.id}
                      disabled={sessionMeta.cancelled || busyId === row.id}
                      aria-pressed={on}
                      onClick={() => mark(row, status)}
                    >
                      {labels[status]}{consumes ? ' -1' : ''}
                    </Button>
                  )
                })}
                {rowErrors[row.id] && <small id={`trainer-attendance-row-${row.id}-error`} className="ops-field-error" role="alert">{rowErrors[row.id]}</small>}
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="muted" style={{ padding: 16 }}>На этом занятии пока нет участников.</div>}
        </div>
        <Dialog
          open={bulkPending}
          title="Отметить всех присутствующими?"
          description={`${title} · ${sessionMeta.date}. Будет обновлено участников: ${rows.length}; у каждого спишется одно занятие.`}
          confirmLabel="Подтвердить отметку"
          cancelLabel="Отмена"
          onClose={() => setBulkPending(false)}
          onConfirm={async () => { setBulkPending(false); await markAllPresent() }}
        />
      </div>
    )
  }
}

export function createTrainerSessionsScreen(components, icons, trainerData = {}) {
  const { Badge, Banner } = components
  const I = icons

  return function ApiTrainerSessions({ go }) {
    const groups = trainerData.groups || []
    const [sessions, setSessions] = useState(() => [...(trainerData.sessions || [])])
    const [displayMode, setDisplayMode] = useState('calendar')
    const [viewMode, setViewMode] = useState(DEFAULT_SCHEDULE_VIEW)
    const [focusDate, setFocusDate] = useState(localToday())
    const [error, setError] = useState(null)
    const [filters, setFilters] = useState({ groupId: '', status: 'all' })
    const range = useMemo(() => calendarRange(focusDate, viewMode), [focusDate, viewMode])

    useEffect(() => {
      let active = true
      const query = new URLSearchParams({
        date_from: range.dateFrom,
        date_to: range.dateTo,
      })
      api.get(`/api/trainer/sessions/?${query}`)
        .then((payload) => {
          if (active) setSessions((payload.sessions || []).map(mapTrainerSession))
        })
        .catch((err) => {
          if (active) setError(apiErrorMessage(err, 'Не удалось загрузить занятия.'))
        })
      return () => { active = false }
    }, [range.dateFrom, range.dateTo])

    const visibleSessions = sessions.filter((session) => {
      if (filters.groupId && String(session.groupId) !== String(filters.groupId)) return false
      if (filters.status !== 'all' && session.status !== filters.status) return false
      return true
    })
    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h1 className="page-title">Мои занятия</h1>
            <p className="page-desc">Ближайшие, завершённые и отменённые занятия.</p>
          </div>
          <ScheduleViewSwitcher displayMode={displayMode} setDisplayMode={setDisplayMode} icons={I} />
        </div>
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <CalendarNavigation focusDate={focusDate} setFocusDate={setFocusDate} viewMode={viewMode} setViewMode={setViewMode} />
          <div className="ops-form-grid" style={{ marginTop: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Группа
              <select value={filters.groupId} onChange={(event) => setFilters((current) => ({ ...current, groupId: event.target.value }))} style={{ minHeight: 36 }}>
                <option value="">Все группы</option>
                {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Статус
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} style={{ minHeight: 36 }}>
                <option value="all">Все статусы</option>
                <option value="planned">Запланировано</option>
                <option value="done">Завершено</option>
                <option value="cancelled">Отменено</option>
              </select>
            </label>
          </div>
        </div>
        {displayMode === 'calendar' && (
          <ScheduleCalendar
            sessions={visibleSessions}
            focusDate={focusDate}
            viewMode={viewMode}
            setFocusDate={setFocusDate}
            setViewMode={setViewMode}
            onOpenSession={(session) => go('session', { trainerSessionId: session.sessionId })}
            ariaLabel="Календарь моих занятий"
          />
        )}
        {displayMode === 'list' && <ScheduleList sessions={visibleSessions} testId="trainer-schedule-list" onOpenSession={(session) => go('session', { trainerSessionId: session.sessionId })} emptyLabel="Занятий по выбранным фильтрам нет." renderStatus={(session) => <Badge tone={session.status === 'cancelled' ? 'danger' : 'primary'}>{session.status === 'cancelled' ? 'Отменено' : session.status === 'done' ? 'Завершено' : 'Запланировано'}</Badge>} />}
      </div>
    )
  }
}

export function createTrainerHistoryScreen(components, icons, trainerData = {}) {
  const { Button, Badge } = components
  const I = icons
  return function ApiTrainerHistory({ go }) {
    const sessions = trainerData.history || []
    const groups = trainerData.groups || []
    const [groupId, setGroupId] = useState('')
    const [period, setPeriod] = useState('90')
    const visibleSessions = (groupId ? sessions.filter((session) => String(session.groupId) === String(groupId)) : sessions).filter((session) => !period || new Date(session.rawDate) >= new Date(Date.now() - Number(period) * 86400000))
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">История</h1>
            <p className="page-desc">Завершённые занятия и их состав.</p>
          </div>
        </div>
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="ops-form-grid"><label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
            Группа
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)} style={{ minHeight: 36 }}>
              <option value="">Все группы</option>
              {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
            </select>
          </label><label>Период<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="30">30 дней</option><option value="90">90 дней</option><option value="365">Год</option><option value="">Вся история</option></select></label></div>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          {visibleSessions.map((session, index) => (
            <div key={session.id} role="button" tabIndex={0} className={`ops-session-row${session.status === 'cancelled' ? ' is-cancelled' : ''}`} data-color-key={session.colorKey} onClick={() => go('session', { trainerSessionId: session.sessionId })} style={{ ...scheduleColorStyle(session.colorKey), display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: index < visibleSessions.length - 1 ? '1px solid var(--border-subtle)' : 'none', cursor: 'pointer' }}>
              <span className="mono" style={{ width: 120, fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{session.date}</span>
              <span className="mono" style={{ width: 104, fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{session.start}-{session.end}</span>
              <span className="strong" style={{ width: 140 }}>{session.group}</span>
              <span className="muted" style={{ flex: 1, fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><I.Location size={13} />{session.location}</span>
              <Badge tone={session.status === 'cancelled' ? 'danger' : 'primary'}>{session.status === 'cancelled' ? 'Отменено' : 'Завершено'}</Badge>
              <span className="ops-muted-chip">Состав и отметки</span>
            </div>
          ))}
          {visibleSessions.length === 0 && <div className="muted" style={{ padding: 16 }}>Истории занятий пока нет.</div>}
        </div>
      </div>
    )
  }
}

export function createTrainerGroupsScreen(components, icons, trainerData = {}) {
  const { Badge } = components
  const I = icons

  return function ApiTrainerGroups({ go }) {
    const groups = trainerData.groups || []
    const sessions = trainerData.sessions || []
    const [selectedGroupId, setSelectedGroupId] = useState(null)
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Мои группы</h1>
            <p className="page-desc">Назначено групп: {groups.length}.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {groups.map((group) => (
            <button key={group.id} type="button" className={`card card-pad ops-action-card${selectedGroupId === group.groupId ? ' is-active' : ''}`} onClick={() => setSelectedGroupId((current) => current === group.groupId ? null : group.groupId)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--primary-soft)', color: 'var(--primary)' }}><I.Waves size={18} /></span>
                <div><div className="strong" style={{ fontSize: 'var(--fs-md)' }}>{group.name}</div><div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Учеников: {group.students}</div></div>
              </div>
              <Badge tone="primary" dot>{group.next || 'Ближайшее занятие не назначено'}</Badge>
            </button>
          ))}
          {groups.length === 0 && <div className="card card-pad muted">Назначенных групп пока нет.</div>}
        </div>
        {selectedGroupId && (() => { const group = groups.find((item) => item.groupId === selectedGroupId); const upcoming = sessions.filter((session) => session.groupId === selectedGroupId).slice(0, 5); return <div className="card ops-entity-card" style={{ marginTop: 16 }}><div className="ops-entity-head"><div><div className="eyebrow">Состав группы</div><h3>{group.name}</h3></div><Badge tone="primary">{group.roster?.length || 0} участников</Badge></div><div className="ops-detail-grid"><div>{(group.roster || []).map((student) => <div className="ops-detail-row" key={student.id}><strong>{student.full_name}</strong><span>Участник группы</span></div>)}</div><div>{upcoming.map((session) => <button type="button" className="ops-detail-row" key={session.id} onClick={() => go('session', { trainerSessionId: session.sessionId })}><strong>{session.date} · {session.start}</strong><span>{session.location}</span></button>)}</div></div></div> })()}
      </div>
    )
  }
}

