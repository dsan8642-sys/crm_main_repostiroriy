import React, { useEffect, useMemo, useState } from 'react'
import { adminLocaleTag, adminTranslator } from '../../adminLocales.js'
import { api, apiErrorMessage } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import { formatTime, mapAdminSessionRows } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { dateToIso } from '../scheduleContracts.js'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'
import { loadAdminParticipantOptions } from '../participantSearch.js'
import { fieldErrorsFromApi, formErrorMessage } from '../formErrors.js'
import { FormModal } from '../FormModal.jsx'
import { ContextBackButton } from '../EntityListPrimitives.jsx'
import { AttendanceSaveStatus } from '../TodayPrimitives.jsx'

export function attendanceSessionDisplayStatus(session, now = Date.now()) {
  if (session?.is_cancelled || session?.isCancelled || session?.status === 'cancelled') return 'cancelled'
  if (session?.status === 'done') return 'done'
  const endAt = session?.end_at || session?.endAt
  const endTimestamp = endAt ? Date.parse(endAt) : Number.NaN
  return Number.isFinite(endTimestamp) && endTimestamp <= now ? 'done' : 'planned'
}

export function createAdminAttendanceScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Table, Button, Banner, Avatar, StatusPill, Input, Badge, Dialog } = components
  const I = icons
  const options = [
    { value: 'present', labelKey: 'attendance.present', consumes: true },
    { value: 'absent', labelKey: 'attendance.absent', consumes: true },
    { value: 'excused', labelKey: 'attendance.excused', consumes: false },
    { value: 'rescheduled', labelKey: 'attendance.rescheduled', consumes: false },
  ]

  return function ApiAdminAttendance({ go, back, sessionId }) {
    const { locale } = useLocale()
    const t = useMemo(() => adminTranslator(locale), [locale])
    const localeTag = adminLocaleTag(locale)
    const [sessions, setSessions] = useState(() => adminData.sessions || [])
    const clients = adminData.clients || []
    const today = dateToIso(new Date())
    const defaultSession = sessions.find((item) => !item.isCancelled && item.startAt?.slice(0, 10) === today)
      || sessions.find((item) => !item.isCancelled && item.startAt?.slice(0, 10) > today)
    const [selectedSessionId, setSelectedSessionId] = useState(sessionId || defaultSession?.sessionId || '')
    const [selectedStudentId, setSelectedStudentId] = useState('')
    const [detail, setDetail] = useState(null)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [rowErrors, setRowErrors] = useState({})
    const [studentError, setStudentError] = useState(null)
    const [cancelReasonError, setCancelReasonError] = useState(null)
    const [busyId, setBusyId] = useState(null)
    const [loading, setLoading] = useState(false)
    const [cancelReason, setCancelReason] = useState('')
    const [bulkPending, setBulkPending] = useState(false)
    const [formAction, setFormAction] = useState(null)
    const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)

    useEffect(() => {
      const media = window.matchMedia('(max-width: 767px)')
      const update = () => setIsMobile(media.matches)
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }, [])

    useEffect(() => {
      let alive = true
      const now = new Date()
      const dateFrom = dateToIso(new Date(now.getTime() - 30 * 86400000))
      const dateTo = dateToIso(new Date(now.getTime() + 60 * 86400000))
      const query = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        page: '1',
        page_size: '200',
      })
      api.get(`/api/admin/schedule/sessions/?${query}`)
        .then((payload) => {
          if (alive) setSessions(mapAdminSessionRows(payload.sessions || []))
        })
        .catch((err) => {
          if (alive) setError(apiErrorMessage(err, t('attendance.loadSessionsError')))
        })
      return () => { alive = false }
    }, [t])

    useEffect(() => {
      if (sessionId) setSelectedSessionId(sessionId)
    }, [sessionId])

    useEffect(() => {
      if (!selectedSessionId) return
      let alive = true
      setError(null)
      setLoading(true)
      api.get(`/api/admin/schedule/sessions/${selectedSessionId}/attendance/`)
        .then((payload) => {
          if (alive) setDetail(payload)
        })
        .catch((err) => {
          if (alive) setError(apiErrorMessage(err, t('attendance.loadRosterError')))
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, [selectedSessionId, t])

    const rows = detail?.students || []
    const rosterIds = useMemo(() => new Set(rows.map((row) => Number(row.id))), [rows])
    const availableStudents = useMemo(() => clients
      .filter((client) => client.isActive !== false)
      .filter((client) => client.studentId && !rosterIds.has(Number(client.studentId)))
      .sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`)), [clients, rosterIds])

    async function mark(row, status) {
      if (!selectedSessionId) return
      setBusyId(`mark-${row.id}`)
      setError(null)
      setRowErrors((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
      try {
        const record = await api.post(`/api/admin/schedule/sessions/${selectedSessionId}/attendance/`, {
          student_id: row.id,
          status,
        })
        setDetail((current) => ({
          ...current,
          students: (current?.students || []).map((student) => student.id === row.id
            ? { ...student, attendance: record }
            : student),
        }))
        setMessage(t('attendance.saved'))
        reloadRoleData?.('admin')
      } catch (err) {
        const message = apiErrorMessage(err, t('attendance.saveError'))
        setRowErrors((current) => ({ ...current, [row.id]: message }))
        document.querySelector(`#admin-attendance-row-${row.id} button`)?.focus()
      } finally {
        setBusyId(null)
      }
    }

    function attendanceActions(row, compact = false) {
      return <div id={`admin-attendance-row-${row.id}`} className="ops-attendance-actions" role="group" aria-describedby={rowErrors[row.id] ? `admin-attendance-row-${row.id}-error` : undefined} style={{ display: 'flex', gap: compact ? 6 : 8, flexWrap: 'wrap' }}>
        {options.map((option) => (
          <Button key={option.value} size="sm" variant={row.attendance?.status === option.value ? 'primary' : 'secondary'} loading={busyId === `mark-${row.id}`} disabled={selectedStatus === 'cancelled' || busyId === `mark-${row.id}`} aria-pressed={row.attendance?.status === option.value} onClick={() => mark(row, option.value)} style={compact ? { minHeight: 40, padding: '0 8px' } : undefined}>
            {t(option.labelKey)}{option.consumes ? ' -1' : ''}
          </Button>
        ))}
        {rowErrors[row.id] && <small id={`admin-attendance-row-${row.id}-error`} className="ops-field-error" role="alert">{rowErrors[row.id]}</small>}
      </div>
    }

    async function markAllPresent() {
      if (!selectedSessionId || !rows.length) return
      setBusyId('mark-all'); setError(null); setRowErrors({})
      try {
        const payload = await api.post(`/api/admin/schedule/sessions/${selectedSessionId}/attendance/bulk/`, {
          items: rows.map((row) => ({ student_id: row.id, status: 'present' })),
        })
        const records = payload.results || []
        const byStudent = new Map(records.map((record) => [record.participant_id, record]))
        setDetail((current) => ({ ...current, students: current.students.map((row) => ({ ...row, attendance: byStudent.get(row.id) || row.attendance })) }))
        setMessage(t('attendance.markedCount', { count: records.length }))
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
          document.querySelector(`#admin-attendance-row-${firstId} button`)?.focus()
        } else setError(apiErrorMessage(err, t('attendance.saveError')))
      } finally { setBusyId(null) }
    }

    async function addStudent() {
      if (!selectedSessionId || !selectedStudentId) return
      setBusyId('add')
      setError(null)
      setStudentError(null)
      try {
        const payload = await api.post(`/api/admin/schedule/sessions/${selectedSessionId}/participants/`, {
          student_id: selectedStudentId,
        })
        setDetail(payload)
        setSelectedStudentId('')
        setFormAction(null)
        setMessage(t('attendance.memberAdded'))
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, { student_id: 'studentId' })
        setStudentError(nextErrors.studentId || null)
        setError(formErrorMessage(err, t('attendance.addError')))
        if (nextErrors.studentId) document.getElementById('admin-attendance-add-student')?.focus()
      } finally {
        setBusyId(null)
      }
    }

    async function removeStudent(row) {
      if (!selectedSessionId) return
      setBusyId(`remove-${row.id}`)
      setError(null)
      try {
        const payload = await api.delete(`/api/admin/schedule/sessions/${selectedSessionId}/participants/${row.id}/`)
        setDetail(payload)
        setMessage(t('attendance.memberRemoved'))
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, t('attendance.removeError')))
      } finally {
        setBusyId(null)
      }
    }

    async function cancelSelectedSession() {
      if (!selectedSessionId) return
      setBusyId('cancel-session')
      setError(null)
      setCancelReasonError(null)
      try {
        await api.post(`/api/admin/schedule/sessions/${selectedSessionId}/cancel/`, { reason: cancelReason })
        setMessage(t('attendance.cancelledSaved'))
        setCancelReason('')
        setFormAction(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, { reason: 'reason' })
        setCancelReasonError(nextErrors.reason || null)
        setError(formErrorMessage(err, t('attendance.cancelError')))
        if (nextErrors.reason) document.getElementById('admin-attendance-cancel-reason')?.focus()
      } finally {
        setBusyId(null)
      }
    }

    async function restoreSelectedSession() {
      if (!selectedSessionId) return
      setBusyId('restore-session')
      setError(null)
      try {
        const session = await api.post(`/api/admin/schedule/sessions/${selectedSessionId}/restore/`)
        setDetail((current) => ({ ...current, session }))
        setMessage(t('attendance.restored'))
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, t('attendance.restoreError')))
      } finally {
        setBusyId(null)
      }
    }

    const selectedSession = detail?.session || sessions.find((item) => String(item.sessionId) === String(selectedSessionId))
    const selectedGroupName = typeof selectedSession?.group === 'object'
      ? selectedSession.group?.name
      : selectedSession?.group
    const selectedTrainer = selectedSession?.effective_trainer || selectedSession?.trainer || ''
    const selectedStart = selectedSession?.start_at ? formatTime(selectedSession.start_at) : selectedSession?.start
    const selectedEnd = selectedSession?.end_at ? formatTime(selectedSession.end_at) : selectedSession?.end
    const selectedStatus = selectedSession?.is_cancelled || selectedSession?.isCancelled ? 'cancelled' : selectedSession?.status
    const selectedDisplayStatus = attendanceSessionDisplayStatus(selectedSession)
    const sessionTypeLabel = { group: t('attendance.sessionTypeGroup'), individual: t('attendance.sessionTypeIndividual'), split: t('attendance.sessionTypeSplit') }[selectedSession?.session_type || selectedSession?.sessionType] || t('attendance.sessionTypeGroup')
    const nextSession = sessions
      .filter((session) => !session.isCancelled && String(session.sessionId) !== String(selectedSessionId))
      .filter((session) => new Date(session.startAt) > new Date(selectedSession?.start_at || selectedSession?.startAt || 0))
      .sort((left, right) => new Date(left.startAt) - new Date(right.startAt))[0]

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <ContextBackButton icon={<I.ArrowLeft size={14} />} onClick={() => back ? back('schedule') : go?.('schedule')}>{t('attendance.schedule')}</ContextBackButton>
            <h1 className="page-title">{t('attendance.title')}</h1>
            <p className="page-desc">{t('attendance.description')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {nextSession && <Button variant="secondary" disabled={busyId != null} onClick={() => go?.('attendance', { sessionId: nextSession.sessionId })}>{t('attendance.nextSession')}</Button>}
            <Button variant="primary" disabled={selectedStatus === 'cancelled' || !rows.length || busyId != null} loading={busyId === 'mark-all'} onClick={() => setBulkPending(true)}>{t('attendance.allPresent')}</Button>
          </div>
        </div>
        <ToastNotice id="admin-attendance-result" message={message} />
        {error && !formAction && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        {selectedStatus === 'cancelled' && <Banner tone="warning" title={t('attendance.cancelled')} style={{ marginBottom: 12 }}>{t('attendance.readOnly')} <Button size="sm" variant="secondary" disabled={busyId != null} loading={busyId === 'restore-session'} onClick={restoreSelectedSession}>{t('attendance.restore')}</Button></Banner>}
        <BusyBanner Banner={Banner} show={loading}>{t('attendance.loadingRoster')}</BusyBanner>
        <BusyBanner Banner={Banner} show={busyId != null && !loading}>{t('attendance.saving')}</BusyBanner>
        <AttendanceSaveStatus busy={busyId != null} savingText={t('attendance.saving')} savedText={t('attendance.saved')} />

        <div className="ops-session-detail-grid">
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>{t('attendance.selected')}</div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              {t('attendance.title')}
              <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} style={{ minHeight: 38 }}>
                <option value="">{t('attendance.choose')}</option>
                {sessions.map((session) => (
                  <option key={session.sessionId} value={session.sessionId}>
                    {session.date} {session.start}-{session.end} - {session.group} - {session.trainer}
                  </option>
                ))}
              </select>
            </label>

            <div className="ops-session-summary">
              <div>
                <div className="muted">{t('attendance.groupType')}</div>
                <strong>{selectedGroupName || sessionTypeLabel}</strong>
              </div>
              <div>
                <div className="muted">{t('attendance.time')}</div>
                <strong>{selectedStart || '-'}-{selectedEnd || '-'}</strong>
              </div>
              <div>
                <div className="muted">{t('common.trainer')}</div>
                <strong>{selectedTrainer || '-'}</strong>
              </div>
              <div>
                <div className="muted">{t('attendance.place')}</div>
                <strong>{selectedSession?.location || '-'}</strong>
              </div>
              <div>
                <div className="muted">{t('common.status')}</div>
                <StatusPill status={selectedDisplayStatus} tone={selectedDisplayStatus === 'done' ? 'present' : undefined} size="sm" />
              </div>
            </div>
            <div className="ops-button-row" style={{ marginTop: 12 }}><Button variant="primary" disabled={selectedStatus === 'cancelled' || !selectedSessionId || busyId != null} onClick={() => { setSelectedStudentId(''); setStudentError(null); setFormAction('add') }}>{t('attendance.addParticipant')}</Button><Button variant="secondary" disabled={selectedStatus === 'cancelled' || !selectedSessionId || busyId != null} onClick={() => { setCancelReason(''); setCancelReasonError(null); setFormAction('cancel') }}>{t('attendance.cancelSession')}</Button></div>
            {selectedSession?.notes && <div className="ops-inline-note">{selectedSession.notes}</div>}
          </div>
        </div>

        <FormModal open={formAction === 'add'} title={t('attendance.addParticipant')} description={t('attendance.addDescription')} size="sm" busy={busyId === 'add'} dirty={Boolean(selectedStudentId)} onRequestClose={() => { setFormAction(null); setSelectedStudentId(''); setStudentError(null); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId === 'add'} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" disabled={selectedStatus === 'cancelled' || !selectedStudentId || busyId === 'add'} loading={busyId === 'add'} onClick={addStudent}>{t('groups.add')}</Button></>}>
          {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
          <SearchableSelect inputId="admin-attendance-add-student" label={t('attendance.clientStudent')} value={selectedStudentId} error={studentError} onChange={(value) => { setSelectedStudentId(value); setStudentError(null) }} options={availableStudents.map((client) => clientSelectOption(client, { description: (row) => `${row.group || t('attendance.individual')} · ${row.phone || t('attendance.noPhone')}` }))} loadOptions={loadAdminParticipantOptions} />
        </FormModal>

        <FormModal open={formAction === 'cancel'} title={t('attendance.cancelSession')} description={t('attendance.cancelDescription')} size="sm" busy={busyId === 'cancel-session'} dirty={Boolean(cancelReason)} onRequestClose={() => { setFormAction(null); setCancelReason(''); setCancelReasonError(null); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId === 'cancel-session'} onClick={() => requestClose('cancel')}>{t('attendance.back')}</Button><Button variant="primary" disabled={selectedStatus === 'cancelled' || !selectedSessionId || busyId != null} loading={busyId === 'cancel-session'} onClick={cancelSelectedSession}>{t('attendance.cancelSession')}</Button></>}>
          {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
          <Input id="admin-attendance-cancel-reason" label={t('attendance.reason')} value={cancelReason} error={cancelReasonError} onChange={(event) => { setCancelReason(event.target.value); setCancelReasonError(null) }} placeholder={t('attendance.reasonHint')} />
        </FormModal>

        {isMobile ? (
          <div className="card" style={{ overflow: 'hidden' }}>
            {rows.length ? rows.map((row, index) => (
              <article key={row.id} style={{ display: 'grid', gap: 12, padding: 14, borderBottom: index < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}><Avatar name={row.full_name} size={28} /><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.full_name}</strong></div>
                  {row.balance_minor > 0 ? <Badge tone="danger">{t('attendance.debtAmount', { amount: (row.balance_minor / 100).toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currency: row.currency })}</Badge> : <Badge tone="success">{t('attendance.noDebt')}</Badge>}
                </div>
                <Button size="sm" variant="subtle" onClick={() => go?.('clientDetail', { clientId: row.client_id })}>{t('attendance.profile')}</Button>
                {attendanceActions(row, true)}
              </article>
            )) : <div className="muted" style={{ padding: 16 }}>{selectedSessionId ? t('attendance.emptySession') : t('attendance.chooseForRoster')}</div>}
          </div>
        ) : <div className="card" style={{ overflow: 'hidden' }}>
          <Table
            rows={rows}
            emptyLabel={selectedSessionId ? t('attendance.emptySession') : t('attendance.chooseForRoster')}
            columns={[
              {
                key: 'full_name',
                header: t('common.participant'),
                render: (row) => (
                  <button type="button" className="ops-link-button" onClick={() => go?.('clientDetail', { clientId: row.client_id })}>
                    <Avatar name={row.full_name} size={28} />
                    <span>
                      <span className="strong">{row.full_name}</span>
                      {row.can_remove_from_session && <span className="ops-inline-note">{t('attendance.oneOff')}</span>}
                    </span>
                  </button>
                ),
              },
              {
                key: 'balance',
                header: t('attendance.debt'),
                render: (row) => row.balance_minor > 0
                  ? <Badge tone="danger">{t('attendance.debtAmount', { amount: (row.balance_minor / 100).toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currency: row.currency })}</Badge>
                  : <Badge tone="success">{t('attendance.noDebt')}</Badge>,
              },
              { key: 'group', header: t('common.group'), muted: true, render: (row) => row.group?.name || t('attendance.individual') },
              { key: 'status', header: t('attendance.mark'), width: 120, render: (row) => <StatusPill status={row.attendance?.status === 'rescheduled' ? 'moved' : row.attendance?.status} size="sm" /> },
              {
                key: 'attendance',
                header: t('attendance.titleColumn'),
                width: 340,
                render: (row) => attendanceActions(row),
              },
              {
                key: 'actions',
                header: '',
                width: 210,
                render: (row) => (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Button size="sm" variant="subtle" onClick={() => go?.('clientDetail', { clientId: row.client_id })}>{t('attendance.profile')}</Button>
                    {row.can_remove_from_session ? (
                      <Button size="sm" variant="secondary" disabled={selectedStatus === 'cancelled' || busyId === `remove-${row.id}`} loading={busyId === `remove-${row.id}`} onClick={() => removeStudent(row)}>{t('groups.remove')}</Button>
                    ) : (
                      <span className="ops-muted-chip">{t('attendance.regularRoster')}</span>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>}
        <Dialog
          open={bulkPending}
          title={t('attendance.bulkTitle')}
          description={t('attendance.bulkDescription', { session: `${selectedSession?.date || ''} ${selectedStart || ''}-${selectedEnd || ''} · ${selectedGroupName || sessionTypeLabel}`, count: rows.length })}
          confirmLabel={t('attendance.confirmMark')}
          cancelLabel={t('common.cancel')}
          onClose={() => setBulkPending(false)}
          onConfirm={async () => { setBulkPending(false); await markAllPresent() }}
        />
        <div className="card card-pad" style={{ marginTop: 16 }}><div className="eyebrow">{t('attendance.history')}</div>{(detail?.history || []).map((entry) => <div className="ops-detail-row" key={entry.id}><strong>{({ 'session.created': t('attendance.historyCreated'), 'session.edited': t('attendance.historyEdited'), 'session.restored': t('attendance.historyRestored') }[entry.action] || entry.action)}</strong><span>{entry.actor} · {new Date(entry.created_at).toLocaleString(localeTag)}</span></div>)}{!(detail?.history || []).length && <div className="empty">{t('attendance.noHistory')}</div>}</div>
      </div>
    )
  }
}
