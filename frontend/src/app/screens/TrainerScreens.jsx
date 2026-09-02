import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage } from '../../api.js'
import { formatDate, formatShortDate, formatTime, mapTrainerHistoryRows, mapTrainerSession } from '../../mappers.js'
import { CalendarNavigation, ScheduleCalendar, ScheduleList, ScheduleViewSwitcher } from '../ScheduleCalendar.jsx'
import { calendarRange, dateToIso, DEFAULT_SCHEDULE_VIEW, localToday } from '../scheduleContracts.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { scheduleColorStyle } from '../schedulePalette.js'
import { ListFeedback, ListPagination, ListToolbar, useScreenList } from '../listFoundation.jsx'
import { formatEntityDate, groupRowsByDate } from '../entityListContracts.js'
import { ContextBackButton } from '../EntityListPrimitives.jsx'
import { AttendanceSaveStatus, CompactStatusRow, TodaySessionCard } from '../TodayPrimitives.jsx'
import { useLocale } from '../../i18n.jsx'
import { uiLocaleTag } from '../../localeContracts.js'
import './TrainerScreens.css'

const serializeTrainerHistoryFilters = (filters) => {
  const days = Number(filters.period || 0)
  return {
    group_id: filters.group_id,
    date_from: days ? dateToIso(new Date(Date.now() - days * 86400000)) : '',
  }
}

export function createTrainerSessionScreen(components, icons, reloadRoleData, trainerData = {}) {
  const { Button, Avatar, Banner, Dialog, StatusPill } = components
  const I = icons
  const options = ['present', 'absent', 'excused', 'rescheduled']

  return function ApiTrainerSession({ go, back, trainerSessionId }) {
    const { t } = useLocale()
    const labels = {
      present: t('trainer.attendance.present'), absent: t('trainer.attendance.absent'),
      excused: t('trainer.attendance.excused'), rescheduled: t('trainer.attendance.rescheduled'),
    }
    const initialSession = (trainerData.sessions || []).find((item) => String(item.sessionId) === String(trainerSessionId || trainerData.activeSessionId))
    const [rows, setRows] = useState(() => [...(trainerData.roster || [])])
    const [title, setTitle] = useState(initialSession ? `${initialSession.group} · ${initialSession.start}-${initialSession.end}` : trainerData.activeSessionTitle || t('runtime.trainer.session.title'))
    const [sessionMeta, setSessionMeta] = useState({
      date: initialSession?.date || trainerData.activeSessionDate || '',
      start: initialSession?.start || '',
      end: initialSession?.end || '',
      group: initialSession?.group || '',
      location: initialSession?.location || '',
      status: initialSession?.status || trainerData.activeSessionStatus,
      cancelled: initialSession ? initialSession.status === 'cancelled' : Boolean(trainerData.activeSessionCancelled),
    })
    const [bulkPending, setBulkPending] = useState(false)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [rowErrors, setRowErrors] = useState({})
    const [busyId, setBusyId] = useState(null)
    const [loading, setLoading] = useState(false)
    const sessionId = trainerSessionId || trainerData.activeSessionId
    const nextSession = [...(trainerData.sessions || [])]
      .filter((session) => session.status === 'planned' && String(session.sessionId) !== String(sessionId))
      .filter((session) => new Date(session.startAt) > new Date(initialSession?.startAt || 0))
      .sort((left, right) => new Date(left.startAt) - new Date(right.startAt))[0]

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
          setTitle(`${payload.session?.group?.name || t('shared.individual')} · ${formatTime(payload.session?.start_at)}-${formatTime(payload.session?.end_at)}`)
          setSessionMeta({
            date: formatShortDate(payload.session?.start_at),
            start: formatTime(payload.session?.start_at),
            end: formatTime(payload.session?.end_at),
            group: payload.session?.group?.name || t('shared.individual'),
            location: payload.session?.location || '',
            status: payload.session?.is_cancelled
              ? 'cancelled'
              : Date.parse(payload.session?.end_at) <= Date.now() ? 'done' : 'planned',
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
        .catch((err) => setError(apiErrorMessage(err, t('trainer.attendance.loadFailed'))))
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, [trainerSessionId, t])

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
        setMessage(t('trainer.attendance.effect', undefined, { name: row.name, status: labels[status], effect: status === 'present' || status === 'absent' ? t('client.schedule.oneSession') : t('trainer.attendance.noDeduction') }))
        window.requestAnimationFrame(() => {
          document.querySelector(`#trainer-attendance-row-${row.id} button:nth-of-type(${options.indexOf(status) + 1})`)?.focus()
        })
        reloadRoleData?.('trainer')
      } catch (err) {
        const message = apiErrorMessage(err, t('trainer.attendance.saveFailed'))
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
        setMessage(t('trainer.attendance.bulkSaved', undefined, { count: result.updated_count }))
        window.requestAnimationFrame(() => {
          document.querySelector('.ops-attendance-actions button:first-of-type')?.focus()
        })
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
          setError(apiErrorMessage(err, t('trainer.attendance.saveFailed')))
        }
      } finally { setBusyId(null) }
    }

    return (
      <div className="page">
        <div className="page-head">
          <div>
            <ContextBackButton icon={<I.ArrowLeft size={14} />} onClick={() => back ? back('sessions') : go('sessions')}>{t('trainer.attendance.back')}</ContextBackButton>
            <h1 className="page-title">{title}</h1>
            <p className="page-desc">{sessionMeta.date} · {sessionMeta.start}-{sessionMeta.end} · {sessionMeta.group || t('shared.individual')} · {sessionMeta.location || t('trainer.attendance.locationMissing')} · <StatusPill status={sessionMeta.status || 'planned'} size="sm" /></p>
            <p className="page-desc">{t('trainer.attendance.instructions')}</p>
          </div>
          <div className="ops-button-row">
            {nextSession && <Button variant="secondary" disabled={busyId != null} onClick={() => go('session', { trainerSessionId: nextSession.sessionId })}>{t('trainer.attendance.nextSession')}</Button>}
            {!sessionMeta.cancelled && <Button variant="primary" disabled={!rows.length || busyId != null} loading={busyId === 'all'} onClick={() => setBulkPending(true)}>{t('trainer.attendance.allPresent')}</Button>}
          </div>
        </div>

        <ToastNotice id="trainer-attendance-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 14 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={loading}>{t('trainer.attendance.loading')}</BusyBanner>
        <BusyBanner Banner={Banner} show={busyId != null}>{t('trainer.attendance.saving')}</BusyBanner>
        <AttendanceSaveStatus busy={busyId != null} savingText={t('trainer.attendance.saving')} savedText={t('trainer.attendance.saved')} />

        {sessionMeta.cancelled && <Banner tone="warning" title={t('trainer.attendance.cancelledTitle')} style={{ marginBottom: 14 }}>{t('trainer.attendance.readOnly')}</Banner>}
        <div className="card ops-attendance-list" style={{ overflow: 'hidden' }}>
          {rows.map((row, index) => (
            <div key={row.id} className="ops-attendance-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: index < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: row.status ? 'transparent' : 'var(--amber-50)' }}>
              <Avatar name={row.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong">{row.name}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-2xs)' }}>{t('trainer.attendance.sessionScope')}</div>
              </div>
              {!sessionMeta.cancelled ? <div id={`trainer-attendance-row-${row.id}`} className="ops-attendance-actions" role="group" aria-describedby={rowErrors[row.id] ? `trainer-attendance-row-${row.id}-error` : undefined} style={{ display: 'flex', gap: 4 }}>
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
              </div> : <StatusPill status={row.status || 'planned'} size="sm" />}
            </div>
          ))}
          {rows.length === 0 && <div className="muted" style={{ padding: 16 }}>{t('trainer.attendance.empty')}</div>}
        </div>
        <Dialog
          open={bulkPending}
          title={t('trainer.attendance.confirmTitle')}
          description={t('trainer.attendance.confirmDescription', undefined, { title, date: sessionMeta.date, count: rows.length })}
          confirmLabel={t('trainer.attendance.confirm')}
          cancelLabel={t('shared.cancel')}
          onClose={() => setBulkPending(false)}
          onConfirm={async () => { setBulkPending(false); await markAllPresent() }}
        />
      </div>
    )
  }
}

export function createTrainerSessionsScreen(components, icons, trainerData = {}) {
  const { Banner, Button } = components
  const I = icons

  return function ApiTrainerSessions({ go }) {
    const { t } = useLocale()
    const [sessions, setSessions] = useState(() => [...(trainerData.sessions || [])])
    const [error, setError] = useState(null)

    useEffect(() => {
      let active = true
      const now = new Date()
      const query = new URLSearchParams({
        date_from: dateToIso(now),
        date_to: dateToIso(new Date(now.getTime() + 30 * 86400000)),
      })
      api.get(`/api/trainer/sessions/?${query}`)
        .then((payload) => {
          if (active) setSessions((payload.sessions || []).map(mapTrainerSession))
        })
        .catch((err) => {
          if (active) setError(apiErrorMessage(err, t('trainer.sessions.loadFailed')))
        })
      return () => { active = false }
    }, [t])

    const now = new Date()
    const available = sessions
      .filter((session) => session.status === 'planned')
      .sort((left, right) => new Date(left.startAt) - new Date(right.startAt))
    const current = available.find((session) => (
      new Date(session.startAt) <= now && now < new Date(session.endAt)
    ))
    const primary = current || available.find((session) => new Date(session.startAt) > now)
    const following = available.filter((session) => (
      session.sessionId !== primary?.sessionId && new Date(session.startAt) > now
    )).slice(0, 5)
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">{t('runtime.trainer.sessions.title')}</h1>
            <p className="page-desc">{t('trainer.sessions.desc')}</p>
          </div>
        </div>
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <TodaySessionCard
          Button={Button}
          eyebrow={current ? t('trainer.today.current') : t('trainer.today.nearest')}
          title={primary?.group}
          detail={primary && `${primary.date} · ${primary.start}-${primary.end}`}
          meta={primary && `${primary.location} · ${primary.count}/${primary.limit}`}
          icon={<I.Calendar size={20} />}
          actionLabel={t('trainer.today.openAttendance')}
          onOpen={() => go('session', { trainerSessionId: primary?.sessionId })}
          emptyTitle={t('trainer.today.emptyTitle')}
          emptyDetail={t('trainer.today.emptyDetail')}
        />
        <div className="ops-section-head" style={{ margin: '20px 0 10px' }}>
          <div className="eyebrow">{t('trainer.today.following')}</div>
        </div>
        <CompactStatusRow
          items={following.map((session) => ({
            id: session.id,
            primary: `${session.date} · ${session.start}-${session.end} · ${session.group}`,
            secondary: session.location,
            onClick: () => go('session', { trainerSessionId: session.sessionId }),
          }))}
          emptyLabel={t('trainer.today.noFollowing')}
        />
      </div>
    )
  }
}

export function createTrainerHistoryScreen(components, icons, trainerData = {}) {
  const { Button, Badge } = components
  const I = icons
  return function ApiTrainerHistory({ go, currentUser }) {
    const { locale, t } = useLocale()
    const groups = trainerData.groups || []
    const historyList = useScreenList({
      path: '/api/trainer/history/',
      itemKey: 'sessions',
      mapRows: mapTrainerHistoryRows,
      role: 'trainer',
      route: 'history',
      userKey: currentUser?.id || currentUser?.username,
      initialFilters: { group_id: '', period: '90' },
      serializeFilters: serializeTrainerHistoryFilters,
      defaultOrder: '-date',
    })
    const visibleSessions = historyList.rows
    const dateGroups = useMemo(
      () => groupRowsByDate(visibleSessions, (session) => session.rawDate),
      [visibleSessions],
    )
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">{t('runtime.trainer.history.title')}</h1>
            <p className="page-desc">{t('trainer.history.desc')}</p>
          </div>
        </div>
        <ListToolbar list={historyList} searchLabel={t('trainer.history.search')} searchPlaceholder={t('trainer.history.searchPlaceholder')}>
          <label>
            {t('shared.group')}
            <select value={historyList.draftFilters.group_id} onChange={(event) => historyList.setDraftFilter('group_id', event.target.value)}>
              <option value="">{t('trainer.sessions.allGroups')}</option>
              {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
            </select>
          </label>
          <label>{t('shared.period')}<select value={historyList.draftFilters.period} onChange={(event) => historyList.setDraftFilter('period', event.target.value)}><option value="30">{t('client.history.days30')}</option><option value="90">{t('client.history.days90')}</option><option value="365">{t('client.history.year')}</option><option value="">{t('trainer.history.allHistory')}</option></select></label>
        </ListToolbar>
        <ListFeedback list={historyList} emptyLabel={t('trainer.history.empty')} />
        <div className="ops-history-groups">
          {dateGroups.map((dateGroup) => (
            <section key={dateGroup.key} className="card ops-history-date-group" aria-labelledby={`history-date-${dateGroup.key}`}>
              <h2 id={`history-date-${dateGroup.key}`}>{formatEntityDate(dateGroup.key, uiLocaleTag(locale))}</h2>
              {dateGroup.rows.map((session) => (
                <button key={session.id} type="button" className={`ops-history-session${session.status === 'cancelled' ? ' is-cancelled' : ''}`} data-color-key={session.colorKey} onClick={() => go('session', { trainerSessionId: session.sessionId })} style={scheduleColorStyle(session.colorKey)}>
                  <span className="mono ops-history-session-time">{session.start}-{session.end}</span>
                  <span className="ops-history-session-main"><strong title={session.group}>{session.group}</strong><small><I.Location size={13} />{session.location || t('trainer.attendance.locationMissing')}</small></span>
                  <Badge tone={session.status === 'cancelled' ? 'danger' : 'primary'}>{t(session.status === 'cancelled' ? 'status.cancelled' : 'status.done')}</Badge>
                </button>
              ))}
            </section>
          ))}
        </div>
        <ListPagination list={historyList} />
      </div>
    )
  }
}

export function createTrainerGroupsScreen(components, icons, trainerData = {}) {
  const { Badge } = components
  const I = icons

  return function ApiTrainerGroups({ go }) {
    const { t } = useLocale()
    const groups = trainerData.groups || []
    const sessions = trainerData.sessions || []
    const [selectedGroupId, setSelectedGroupId] = useState(null)
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">{t('runtime.trainer.groups.title')}</h1>
            <p className="page-desc">{t('trainer.groups.assigned', undefined, { count: groups.length })}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {groups.map((group) => (
            <button key={group.id} type="button" className={`card card-pad ops-action-card${selectedGroupId === group.groupId ? ' is-active' : ''}`} onClick={() => setSelectedGroupId((current) => current === group.groupId ? null : group.groupId)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--primary-soft)', color: 'var(--primary)' }}><I.Waves size={18} /></span>
                <div><div className="strong" style={{ fontSize: 'var(--fs-md)' }}>{group.name}</div><div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('trainer.groups.students', undefined, { count: group.students })}</div></div>
              </div>
              <Badge tone="primary" dot>{group.next || t('trainer.groups.nextMissing')}</Badge>
            </button>
          ))}
          {groups.length === 0 && <div className="card card-pad muted">{t('trainer.groups.empty')}</div>}
        </div>
        {selectedGroupId && (() => { const group = groups.find((item) => item.groupId === selectedGroupId); const upcoming = sessions.filter((session) => session.groupId === selectedGroupId).slice(0, 5); return <div className="card ops-entity-card" style={{ marginTop: 16 }}><div className="ops-entity-head"><div><div className="eyebrow">{t('trainer.groups.roster')}</div><h3>{group.name}</h3></div><Badge tone="primary">{t('trainer.groups.participantCount', undefined, { count: group.roster?.length || 0 })}</Badge></div><div className="ops-detail-grid"><div>{(group.roster || []).map((student) => <div className="ops-detail-row" key={student.id}><strong>{student.full_name}</strong><span>{t('trainer.groups.member')}</span></div>)}</div><div>{upcoming.map((session) => <button type="button" className="ops-detail-row" key={session.id} onClick={() => go('session', { trainerSessionId: session.sessionId })}><strong>{session.date} · {session.start}</strong><span>{session.location}</span></button>)}</div></div></div> })()}
      </div>
    )
  }
}

