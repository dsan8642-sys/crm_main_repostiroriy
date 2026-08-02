import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage } from '../../api.js'
import { formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'

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
    { value: 'present', label: 'Был', consumes: true },
    { value: 'absent', label: 'Не был', consumes: true },
    { value: 'excused', label: 'Уваж.', consumes: false },
    { value: 'rescheduled', label: 'Перенос', consumes: false },
  ]

  return function ApiAdminAttendance({ go, sessionId }) {
    const sessions = adminData.sessions || []
    const clients = adminData.clients || []
    const today = new Date().toISOString().slice(0, 10)
    const defaultSession = sessions.find((item) => !item.isCancelled && item.startAt?.slice(0, 10) === today)
      || sessions.find((item) => !item.isCancelled && item.startAt?.slice(0, 10) > today)
    const [selectedSessionId, setSelectedSessionId] = useState(sessionId || defaultSession?.sessionId || '')
    const [selectedStudentId, setSelectedStudentId] = useState('')
    const [detail, setDetail] = useState(null)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busyId, setBusyId] = useState(null)
    const [loading, setLoading] = useState(false)
    const [cancelReason, setCancelReason] = useState('')
    const [bulkPending, setBulkPending] = useState(false)

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
          if (alive) setError(err.message)
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, [selectedSessionId])

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
        setMessage('Посещаемость сохранена.')
        reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function markAllPresent() {
      if (!selectedSessionId || !rows.length) return
      setBusyId('mark-all'); setError(null)
      try {
        const payload = await api.post(`/api/admin/schedule/sessions/${selectedSessionId}/attendance/bulk/`, {
          items: rows.map((row) => ({ student_id: row.id, status: 'present' })),
        })
        const records = payload.results || []
        const byStudent = new Map(records.map((record) => [record.participant_id, record]))
        setDetail((current) => ({ ...current, students: current.students.map((row) => ({ ...row, attendance: byStudent.get(row.id) || row.attendance })) }))
        setMessage(`Отмечены присутствующими: ${records.length}.`)
      } catch (err) { setError(err.message) } finally { setBusyId(null) }
    }

    async function addStudent() {
      if (!selectedSessionId || !selectedStudentId) return
      setBusyId('add')
      setError(null)
      try {
        const payload = await api.post(`/api/admin/schedule/sessions/${selectedSessionId}/participants/`, {
          student_id: selectedStudentId,
        })
        setDetail(payload)
        setSelectedStudentId('')
        setMessage('Участник добавлен в это занятие.')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
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
        setMessage('Участник убран из этого занятия.')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function cancelSelectedSession() {
      if (!selectedSessionId) return
      setBusyId('cancel-session')
      setError(null)
      try {
        await api.post(`/api/admin/schedule/sessions/${selectedSessionId}/cancel/`, { reason: cancelReason })
        setMessage('Занятие отменено. История не удалена.')
        setCancelReason('')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
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
        setMessage('Тренировка восстановлена.')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, 'Не удалось восстановить тренировку.'))
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
    const sessionTypeLabel = { group: 'Групповое', individual: 'Индивидуальное', split: 'Сплит для двоих' }[selectedSession?.session_type || selectedSession?.sessionType] || 'Групповое'

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h1 className="page-title">Занятие</h1>
            <p className="page-desc">Состав и посещаемость тренировки.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => go?.('schedule')}>Назад к расписанию</Button>
            <Button variant="primary" disabled={selectedStatus === 'cancelled' || !rows.length || busyId != null} loading={busyId === 'mark-all'} onClick={() => setBulkPending(true)}>Все присутствовали</Button>
          </div>
        </div>
        <ToastNotice id="admin-attendance-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        {selectedStatus === 'cancelled' && <Banner tone="warning" title="Занятие отменено" style={{ marginBottom: 12 }}>Доступно только чтение. История сохранена. <Button size="sm" variant="secondary" disabled={busyId != null} loading={busyId === 'restore-session'} onClick={restoreSelectedSession}>Восстановить тренировку</Button></Banner>}
        <BusyBanner Banner={Banner} show={loading}>Загружаю состав занятия...</BusyBanner>
        <BusyBanner Banner={Banner} show={busyId != null && !loading}>Сохраняю изменение...</BusyBanner>

        <div className="ops-session-detail-grid">
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Выбранное занятие</div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Занятие
              <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} style={{ minHeight: 38 }}>
                <option value="">Выберите занятие</option>
                {sessions.map((session) => (
                  <option key={session.sessionId} value={session.sessionId}>
                    {session.date} {session.start}-{session.end} - {session.group} - {session.trainer}
                  </option>
                ))}
              </select>
            </label>

            <div className="ops-session-summary">
              <div>
                <div className="muted">Группа / тип</div>
                <strong>{selectedGroupName || sessionTypeLabel}</strong>
              </div>
              <div>
                <div className="muted">Время</div>
                <strong>{selectedStart || '-'}-{selectedEnd || '-'}</strong>
              </div>
              <div>
                <div className="muted">Тренер</div>
                <strong>{selectedTrainer || '-'}</strong>
              </div>
              <div>
                <div className="muted">Место</div>
                <strong>{selectedSession?.location || '-'}</strong>
              </div>
              <div>
                <div className="muted">Статус</div>
                <StatusPill status={selectedDisplayStatus} tone={selectedDisplayStatus === 'done' ? 'present' : undefined} size="sm" />
              </div>
            </div>
            <div className="ops-inline-add"><Input label="Причина отмены или переноса" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Причина сохранится в истории" /><Button variant="secondary" disabled={selectedStatus === 'cancelled' || !selectedSessionId || busyId != null} loading={busyId === 'cancel-session'} onClick={cancelSelectedSession}>Отменить занятие</Button></div>
            {selectedSession?.notes && <div className="ops-inline-note">{selectedSession.notes}</div>}
          </div>

          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Добавить участника</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
              <SearchableSelect
                label="Клиент / ученик"
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                options={availableStudents.map((client) => clientSelectOption(client, {
                  description: (row) => `${row.group || 'Индивидуально'} · ${row.phone || 'без телефона'}`,
                }))}
              />
              <Button variant="primary" disabled={selectedStatus === 'cancelled' || !selectedStudentId || busyId === 'add'} loading={busyId === 'add'} onClick={addStudent}>Добавить</Button>
            </div>
            <div className="muted" style={{ marginTop: 10, fontSize: 'var(--fs-sm)' }}>
              Добавление создаёт разовое участие только в этом занятии. Основной состав группы не меняется.
            </div>
          </div>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <Table
            rows={rows}
            emptyLabel={selectedSessionId ? 'В этом занятии пока нет участников' : 'Выберите занятие, чтобы увидеть состав'}
            columns={[
              {
                key: 'full_name',
                header: 'Участник',
                render: (row) => (
                  <button type="button" className="ops-link-button" onClick={() => go?.('clientDetail', { clientId: row.client_id })}>
                    <Avatar name={row.full_name} size={28} />
                    <span>
                      <span className="strong">{row.full_name}</span>
                      {row.can_remove_from_session && <span className="ops-inline-note">разово</span>}
                    </span>
                  </button>
                ),
              },
              {
                key: 'balance',
                header: 'Задолженность',
                render: (row) => row.balance_minor > 0
                  ? <Badge tone="danger">Долг: {(row.balance_minor / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currency}</Badge>
                  : <Badge tone="success">Нет задолженности</Badge>,
              },
              { key: 'group', header: 'Группа', muted: true, render: (row) => row.group?.name || 'Индивидуально' },
              { key: 'status', header: 'Отметка', width: 120, render: (row) => <StatusPill status={row.attendance?.status === 'rescheduled' ? 'moved' : row.attendance?.status} size="sm" /> },
              {
                key: 'attendance',
                header: 'Посещаемость',
                width: 340,
                render: (row) => (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {options.map((option) => (
                      <Button
                        key={option.value}
                        size="sm"
                        variant={row.attendance?.status === option.value ? 'primary' : 'secondary'}
                        loading={busyId === `mark-${row.id}`}
                        disabled={selectedStatus === 'cancelled' || busyId === `mark-${row.id}`}
                        onClick={() => mark(row, option.value)}
                      >
                        {option.label}{option.consumes ? ' -1' : ''}
                      </Button>
                    ))}
                  </div>
                ),
              },
              {
                key: 'actions',
                header: '',
                width: 210,
                render: (row) => (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Button size="sm" variant="subtle" onClick={() => go?.('clientDetail', { clientId: row.client_id })}>Профиль</Button>
                    {row.can_remove_from_session ? (
                      <Button size="sm" variant="secondary" disabled={selectedStatus === 'cancelled' || busyId === `remove-${row.id}`} loading={busyId === `remove-${row.id}`} onClick={() => removeStudent(row)}>Убрать</Button>
                    ) : (
                      <span className="ops-muted-chip">основной состав</span>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
        <Dialog
          open={bulkPending}
          title="Отметить всех присутствующими?"
          description={`${selectedSession?.date || ''} ${selectedStart || ''}-${selectedEnd || ''} · ${selectedGroupName || sessionTypeLabel}. Будет обновлено участников: ${rows.length}; у каждого спишется одно занятие.`}
          confirmLabel="Подтвердить отметку"
          cancelLabel="Отмена"
          onClose={() => setBulkPending(false)}
          onConfirm={async () => { setBulkPending(false); await markAllPresent() }}
        />
        <div className="card card-pad" style={{ marginTop: 16 }}><div className="eyebrow">История изменений</div>{(detail?.history || []).map((entry) => <div className="ops-detail-row" key={entry.id}><strong>{({ 'session.created': 'Занятие создано', 'session.edited': 'Занятие изменено', 'session.restored': 'Тренировка восстановлена' }[entry.action] || entry.action)}</strong><span>{entry.actor} · {new Date(entry.created_at).toLocaleString('ru-RU')}</span></div>)}{!(detail?.history || []).length && <div className="empty">Изменений после создания нет.</div>}</div>
      </div>
    )
  }
}
