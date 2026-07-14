import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminAttendanceScreen(components, icons, reloadRoleData) {
  const { Table, Button, Banner, Avatar, StatusPill } = components
  const I = icons
  const options = [
    { value: 'present', label: 'Obecny', consumes: true },
    { value: 'absent', label: 'Nieob.', consumes: true },
    { value: 'excused', label: 'Uspr.', consumes: false },
    { value: 'rescheduled', label: 'Przel.', consumes: false },
  ]

  return function ApiAdminAttendance({ sessionId }) {
    const sessions = globalThis.AdminData?.sessions || []
    const [selectedSessionId, setSelectedSessionId] = useState(sessionId || sessions.find((item) => !item.isCancelled)?.sessionId || sessions[0]?.sessionId || '')
    const [detail, setDetail] = useState(null)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busyId, setBusyId] = useState(null)
    const [loading, setLoading] = useState(false)

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

    async function mark(row, status) {
      if (!selectedSessionId) return
      setBusyId(row.id)
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
        setMessage('Frekwencja zapisana.')
        reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    const rows = detail?.students || []
    const selectedSession = detail?.session || sessions.find((item) => String(item.sessionId) === String(selectedSessionId))
    const selectedGroupName = typeof selectedSession?.group === 'object'
      ? selectedSession.group?.name
      : selectedSession?.group

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h2 className="page-title">Obecnosc</h2>
            <p className="page-desc">Roster i zapis przez /api/admin/schedule/sessions/&lt;id&gt;/attendance/.</p>
          </div>
        </div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={loading}>Roster zajecia jest ladowany...</BusyBanner>
        <BusyBanner Banner={Banner} show={busyId != null}>Frekwencja jest zapisywana...</BusyBanner>

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(260px, 1.4fr)', gap: 12, alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Zajecie
              <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} style={{ minHeight: 36 }}>
                <option value="">Wybierz zajecie</option>
                {sessions.map((session) => (
                  <option key={session.sessionId} value={session.sessionId}>
                    {session.date} {session.start}-{session.end} - {session.group} - {session.trainer}
                  </option>
                ))}
              </select>
            </label>
            <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              {selectedSession ? `${selectedGroupName || 'Zajecie'} Р’В· ${selectedSession.location || ''}` : 'Brak wybranego zajecia'}
            </div>
          </div>
        </div>

        <Table
          rows={rows}
          emptyLabel={selectedSessionId ? 'Brak uczestnikow dla wybranego zajecia' : 'Wybierz zajecie, aby zobaczyc roster'}
          columns={[
            { key: 'full_name', header: 'Uczestnik', render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Avatar name={row.full_name} size={28} /><span className="strong">{row.full_name}</span></span> },
            { key: 'phone', header: 'Telefon', muted: true, render: (row) => <span className="mono">{row.client_phone || '-'}</span> },
            { key: 'group', header: 'Grupa', muted: true, render: (row) => row.group?.name || 'Indywidualnie' },
            { key: 'status', header: 'Status', width: 130, render: (row) => <StatusPill status={row.attendance?.status === 'rescheduled' ? 'moved' : row.attendance?.status} size="sm" /> },
            {
              key: 'act',
              header: '',
              width: 330,
              render: (row) => (
                <div style={{ display: 'flex', gap: 4 }}>
                  {options.map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={row.attendance?.status === option.value ? 'primary' : 'secondary'}
                      loading={busyId === row.id}
                      disabled={busyId === row.id}
                      onClick={() => mark(row, option.value)}
                    >
                      {option.label}{option.consumes ? ' -1' : ''}
                    </Button>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </div>
    )
  }
}

