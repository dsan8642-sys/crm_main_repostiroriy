import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../../api.js'
import { formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createTrainerSessionScreen(components, icons, reloadRoleData) {
  const { Button, Avatar, Banner } = components
  const I = icons
  const options = ['present', 'absent', 'excused', 'rescheduled']
  const labels = { present: 'Obecny', absent: 'Nieobecny', excused: 'Uspr.', rescheduled: 'Przel.' }

  return function ApiTrainerSession({ go, trainerSessionId }) {
    const [rows, setRows] = useState(() => [...(globalThis.TrainerData?.roster || [])])
    const [title, setTitle] = useState(globalThis.TrainerData?.activeSessionTitle || 'Frekwencja')
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busyId, setBusyId] = useState(null)
    const sessionId = trainerSessionId || globalThis.TrainerData?.activeSessionId

    useEffect(() => {
      setRows([...(globalThis.TrainerData?.roster || [])])
    }, [globalThis.TrainerData?.roster])

    useEffect(() => {
      if (!trainerSessionId) return
      let alive = true
      setLoading(true)
      api.get(`/api/trainer/sessions/${trainerSessionId}/`)
        .then((payload) => {
          if (!alive) return
          setTitle(`${payload.session?.group?.name || 'Indywidualne'} В· ${formatTime(payload.session?.start_at)}-${formatTime(payload.session?.end_at)}`)
          setRows((payload.students || []).map((student) => ({
            id: String(student.id),
            studentId: student.id,
            name: student.full_name,
            emergency: student.emergency_contact_name || student.client_phone || '',
            med: '',
            status: student.attendance?.status || null,
          })))
        })
        .catch((err) => setError(err.message))
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, [trainerSessionId])

    async function mark(row, status) {
      if (!sessionId || !row.studentId) return
      setBusyId(row.id)
      setError(null)
      try {
        await api.post(`/api/trainer/sessions/${sessionId}/attendance/`, {
          student_id: row.studentId,
          status,
        })
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, status } : item))
        setMessage('Frekwencja zapisana.')
        reloadRoleData?.('trainer')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    return (
      <div className="page">
        <div className="page-head">
          <div>
            <button onClick={() => go('sessions')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', padding: 0, marginBottom: 6 }}><I.ArrowLeft size={14} /> Moje zajecia</button>
            <h2 className="page-title">{title}</h2>
            <p className="page-desc">Dane i zapis z /api/trainer/sessions/.</p>
          </div>
        </div>

        {message && <Banner tone="success" style={{ marginBottom: 14 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 14 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={loading}>Roster zajecia jest ladowany...</BusyBanner>
        <BusyBanner Banner={Banner} show={busyId != null}>Frekwencja jest zapisywana...</BusyBanner>

        <div className="card" style={{ overflow: 'hidden' }}>
          {rows.map((row, index) => (
            <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: index < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: row.status ? 'transparent' : 'var(--amber-50)' }}>
              <Avatar name={row.name} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong">{row.name}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-2xs)' }}>{row.emergency || '-'}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {options.map((status) => {
                  const on = row.status === status
                  const consumes = status === 'present' || status === 'absent'
                  return (
                    <Button
                      key={status}
                      size="sm"
                      variant={on ? 'primary' : 'secondary'}
                      loading={busyId === row.id}
                      disabled={busyId === row.id}
                      onClick={() => mark(row, status)}
                    >
                      {labels[status]}{consumes ? ' -1' : ''}
                    </Button>
                  )
                })}
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="muted" style={{ padding: 16 }}>Brak uczestnikow dla tego zajecia.</div>}
        </div>
      </div>
    )
  }
}

export function createTrainerSessionsScreen(components, icons) {
  const { Button, Badge } = components
  const I = icons

  return function ApiTrainerSessions({ go }) {
    const sessions = globalThis.TrainerData?.sessions || []
    const groups = globalThis.TrainerData?.groups || []
    const [filters, setFilters] = useState({ groupId: '', status: 'all' })
    const visibleSessions = sessions.filter((session) => {
      if (filters.groupId && String(session.groupId) !== String(filters.groupId)) return false
      if (filters.status !== 'all' && session.status !== filters.status) return false
      return true
    })
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h2 className="page-title">Moje zajecia</h2>
            <p className="page-desc">Dane z /api/trainer/sessions/.</p>
          </div>
        </div>

        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(160px, 1fr)', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Grupa
              <select value={filters.groupId} onChange={(event) => setFilters((current) => ({ ...current, groupId: event.target.value }))} style={{ minHeight: 36 }}>
                <option value="">Wszystkie</option>
                {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Status
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} style={{ minHeight: 36 }}>
                <option value="all">Wszystkie</option>
                <option value="planned">Zaplanowane</option>
                <option value="done">Zakonczone</option>
                <option value="cancelled">Anulowane</option>
              </select>
            </label>
          </div>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          {visibleSessions.map((session, index) => (
            <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: index < visibleSessions.length - 1 ? '1px solid var(--border-subtle)' : 'none', opacity: session.status === 'cancelled' ? 0.65 : 1 }}>
              <span className="mono" style={{ width: 120, fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{session.date}</span>
              <span className="mono" style={{ width: 104, fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{session.start}-{session.end}</span>
              <span className="strong" style={{ width: 140 }}>{session.group}</span>
              <span className="muted" style={{ flex: 1, fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><I.Location size={13} />{session.location}</span>
              <Badge tone={session.status === 'cancelled' ? 'danger' : 'primary'}>{session.status}</Badge>
              {session.status !== 'cancelled' && <Button size="sm" variant="subtle" onClick={() => go('session', { trainerSessionId: session.sessionId })}>Frekwencja</Button>}
            </div>
          ))}
          {visibleSessions.length === 0 && <div className="muted" style={{ padding: 16 }}>Brak zajec w API.</div>}
        </div>
      </div>
    )
  }
}

export function createTrainerHistoryScreen(components, icons) {
  const { Button, Badge } = components
  const I = icons
  return function ApiTrainerHistory({ go }) {
    const sessions = globalThis.TrainerData?.history || []
    const groups = globalThis.TrainerData?.groups || []
    const [groupId, setGroupId] = useState('')
    const visibleSessions = groupId ? sessions.filter((session) => String(session.groupId) === String(groupId)) : sessions
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h2 className="page-title">Historia</h2>
            <p className="page-desc">Zakonczone zajecia z /api/trainer/history/.</p>
          </div>
        </div>
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)', maxWidth: 320 }}>
            Grupa
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)} style={{ minHeight: 36 }}>
              <option value="">Wszystkie</option>
              {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
            </select>
          </label>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          {visibleSessions.map((session, index) => (
            <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: index < visibleSessions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <span className="mono" style={{ width: 120, fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>{session.date}</span>
              <span className="mono" style={{ width: 104, fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{session.start}-{session.end}</span>
              <span className="strong" style={{ width: 140 }}>{session.group}</span>
              <span className="muted" style={{ flex: 1, fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><I.Location size={13} />{session.location}</span>
              <Badge tone={session.status === 'cancelled' ? 'danger' : 'primary'}>{session.status}</Badge>
              <Button size="sm" variant="subtle" onClick={() => go('session', { trainerSessionId: session.sessionId })}>Roster</Button>
            </div>
          ))}
          {visibleSessions.length === 0 && <div className="muted" style={{ padding: 16 }}>Brak historii w API.</div>}
        </div>
      </div>
    )
  }
}

export function createTrainerGroupsScreen(components, icons) {
  const { Badge } = components
  const I = icons

  return function ApiTrainerGroups() {
    const groups = globalThis.TrainerData?.groups || []
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h2 className="page-title">Moje grupy</h2>
            <p className="page-desc">{groups.length} grup przypisanych do trenera.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {groups.map((group) => (
            <div key={group.id} className="card card-pad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--primary-soft)', color: 'var(--primary)' }}><I.Waves size={18} /></span>
                <div><div className="strong" style={{ fontSize: 'var(--fs-md)' }}>{group.name}</div><div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{group.students} uczniow</div></div>
              </div>
              <Badge tone="primary" dot>{group.next || 'Brak terminu'}</Badge>
            </div>
          ))}
          {groups.length === 0 && <div className="card card-pad muted">Brak grup w API.</div>}
        </div>
      </div>
    )
  }
}

