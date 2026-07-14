import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminScheduleScreen(components, icons, reloadRoleData) {
  const { Button, Badge, Banner, Input, Table, StatusPill } = components
  const I = icons
  return function ApiAdminSchedule({ go }) {
    const sessions = globalThis.AdminData?.sessions || []
    const templates = globalThis.AdminData?.templates || []
    const groups = globalThis.AdminData?.groups || []
    const trainers = globalThis.AdminData?.trainers || []
    const [sessionForm, setSessionForm] = useState({
      groupId: groups[0]?.groupId || '',
      trainerId: trainers[0]?.trainerId || '',
      date: new Date().toISOString().slice(0, 10),
      start: '17:00',
      end: '18:00',
      location: 'Basen',
      maxParticipants: '10',
      notes: '',
    })
    const [templateForm, setTemplateForm] = useState({
      groupId: groups[0]?.groupId || '',
      trainerId: trainers[0]?.trainerId || '',
      weekday: '0',
      start: '17:00',
      end: '18:00',
      location: 'Basen',
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
    const updateSessionForm = (field, value) => setSessionForm((current) => ({ ...current, [field]: value }))
    const updateTemplateForm = (field, value) => setTemplateForm((current) => ({ ...current, [field]: value }))
    const updateGenerateForm = (field, value) => setGenerateForm((current) => ({ ...current, [field]: value }))
    const updateSessionEditForm = (field, value) => setSessionEditForm((current) => ({ ...current, [field]: value }))
    const updateTemplateEditForm = (field, value) => setTemplateEditForm((current) => ({ ...current, [field]: value }))

    function dateTime(date, time) {
      return `${date}T${time}`
    }

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
          session_type: 'group',
          group_id: sessionForm.groupId,
          trainer_id: sessionForm.trainerId,
          start_at: startAt,
          end_at: endAt,
          location: sessionForm.location,
          max_participants: Number(sessionForm.maxParticipants || 0),
          notes: sessionForm.notes,
        })
        setMessage('Zajecie utworzone w backendzie.')
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
        setMessage('Szablon grafiku utworzony w backendzie.')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function generateSessions() {
      if (!generateForm.templateId) {
        setError('Wybierz szablon grafiku.')
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
        setMessage(`Wygenerowano ${result.created_count} zajec, pominieto ${result.skipped_count}.`)
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
        setMessage('Zajecie zaktualizowane w backendzie.')
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
        setMessage('Zajecie anulowane w backendzie.')
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
        setMessage('Szablon zaktualizowany w backendzie.')
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
        setMessage(`Anulowano ${result.cancelled} przyszlych zajec z szablonu.`)
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
            <h2 className="page-title">Grafik</h2>
            <p className="page-desc">Lista, tworzenie zajec i szablony z /api/admin/schedule/*.</p>
          </div>
        </div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Operacja grafiku jest zapisywana...</BusyBanner>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(340px, 1fr)', gap: 14, marginBottom: 16 }}>
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Nowe zajecie</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Grupa
                <select value={sessionForm.groupId} onChange={(event) => updateSessionForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Wybierz grupe</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Trener
                <select value={sessionForm.trainerId} onChange={(event) => updateSessionForm('trainerId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Wybierz trenera</option>
                  {trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}
                </select>
              </label>
              <Input label="Data" value={sessionForm.date} onChange={(event) => updateSessionForm('date', event.target.value)} placeholder="YYYY-MM-DD" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input label="Start" value={sessionForm.start} onChange={(event) => updateSessionForm('start', event.target.value)} placeholder="HH:MM" />
                <Input label="Koniec" value={sessionForm.end} onChange={(event) => updateSessionForm('end', event.target.value)} placeholder="HH:MM" />
              </div>
              <Input label="Miejsce" value={sessionForm.location} onChange={(event) => updateSessionForm('location', event.target.value)} />
              <Input label="Limit" value={sessionForm.maxParticipants} onChange={(event) => updateSessionForm('maxParticipants', event.target.value)} />
              <Input label="Notatki" value={sessionForm.notes} onChange={(event) => updateSessionForm('notes', event.target.value)} />
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" loading={busy && !editingSession && !editingTemplate} disabled={busy} onClick={createSession}>Utworz zajecie</Button>
            </div>
          </div>

          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Nowy szablon</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Grupa
                <select value={templateForm.groupId} onChange={(event) => updateTemplateForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Wybierz grupe</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Trener
                <select value={templateForm.trainerId} onChange={(event) => updateTemplateForm('trainerId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Wybierz trenera</option>
                  {trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Dzien
                <select value={templateForm.weekday} onChange={(event) => updateTemplateForm('weekday', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="0">Poniedzialek</option>
                  <option value="1">Wtorek</option>
                  <option value="2">Sroda</option>
                  <option value="3">Czwartek</option>
                  <option value="4">Piatek</option>
                  <option value="5">Sobota</option>
                  <option value="6">Niedziela</option>
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input label="Start" value={templateForm.start} onChange={(event) => updateTemplateForm('start', event.target.value)} placeholder="HH:MM" />
                <Input label="Koniec" value={templateForm.end} onChange={(event) => updateTemplateForm('end', event.target.value)} placeholder="HH:MM" />
              </div>
              <Input label="Miejsce" value={templateForm.location} onChange={(event) => updateTemplateForm('location', event.target.value)} />
              <Input label="Limit" value={templateForm.maxParticipants} onChange={(event) => updateTemplateForm('maxParticipants', event.target.value)} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={templateForm.isActive} onChange={(event) => updateTemplateForm('isActive', event.target.checked)} />
              Aktywny
            </label>
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" loading={busy && !editingSession && !editingTemplate} disabled={busy} onClick={createTemplate}>Utworz szablon</Button>
            </div>
          </div>
        </div>

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Generowanie z szablonu</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.5fr) 1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Szablon
              <select value={generateForm.templateId} onChange={(event) => updateGenerateForm('templateId', event.target.value)} style={{ minHeight: 36 }}>
                <option value="">Wybierz szablon</option>
                {templates.map((template) => (
                  <option key={template.templateId} value={template.templateId}>{template.group} Р’В· {template.weekdayLabel} {template.start}</option>
                ))}
              </select>
            </label>
            <Input label="Od" value={generateForm.dateFrom} onChange={(event) => updateGenerateForm('dateFrom', event.target.value)} placeholder="YYYY-MM-DD" />
            <Input label="Do" value={generateForm.dateTo} onChange={(event) => updateGenerateForm('dateTo', event.target.value)} placeholder="YYYY-MM-DD" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={generateForm.skipConflicts} onChange={(event) => updateGenerateForm('skipConflicts', event.target.checked)} />
              Pomin konflikty
            </label>
            <Button variant="secondary" loading={busy && !editingSession && !editingTemplate} disabled={busy} onClick={generateSessions}>Generuj</Button>
          </div>
        </div>

        {editingSession && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Edycja zajecia</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Grupa
                <select value={sessionEditForm.groupId} onChange={(event) => updateSessionEditForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Wybierz grupe</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Trener
                <select value={sessionEditForm.trainerId} onChange={(event) => updateSessionEditForm('trainerId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Wybierz trenera</option>
                  {trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}
                </select>
              </label>
              <Input label="Data" value={sessionEditForm.date} onChange={(event) => updateSessionEditForm('date', event.target.value)} placeholder="YYYY-MM-DD" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input label="Start" value={sessionEditForm.start} onChange={(event) => updateSessionEditForm('start', event.target.value)} placeholder="HH:MM" />
                <Input label="Koniec" value={sessionEditForm.end} onChange={(event) => updateSessionEditForm('end', event.target.value)} placeholder="HH:MM" />
              </div>
              <Input label="Miejsce" value={sessionEditForm.location} onChange={(event) => updateSessionEditForm('location', event.target.value)} />
              <Input label="Limit" value={sessionEditForm.maxParticipants} onChange={(event) => updateSessionEditForm('maxParticipants', event.target.value)} />
              <Input label="Notatki" value={sessionEditForm.notes} onChange={(event) => updateSessionEditForm('notes', event.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" loading={busy} disabled={busy} onClick={saveSessionEdit}>Zapisz zajecie</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setEditingSession(null)}>Zamknij</Button>
            </div>
          </div>
        )}

        {editingTemplate && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Edycja szablonu</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Grupa
                <select value={templateEditForm.groupId} onChange={(event) => updateTemplateEditForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Wybierz grupe</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Trener
                <select value={templateEditForm.trainerId} onChange={(event) => updateTemplateEditForm('trainerId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Wybierz trenera</option>
                  {trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Dzien
                <select value={templateEditForm.weekday} onChange={(event) => updateTemplateEditForm('weekday', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="0">Poniedzialek</option>
                  <option value="1">Wtorek</option>
                  <option value="2">Sroda</option>
                  <option value="3">Czwartek</option>
                  <option value="4">Piatek</option>
                  <option value="5">Sobota</option>
                  <option value="6">Niedziela</option>
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Input label="Start" value={templateEditForm.start} onChange={(event) => updateTemplateEditForm('start', event.target.value)} placeholder="HH:MM" />
                <Input label="Koniec" value={templateEditForm.end} onChange={(event) => updateTemplateEditForm('end', event.target.value)} placeholder="HH:MM" />
              </div>
              <Input label="Miejsce" value={templateEditForm.location} onChange={(event) => updateTemplateEditForm('location', event.target.value)} />
              <Input label="Limit" value={templateEditForm.maxParticipants} onChange={(event) => updateTemplateEditForm('maxParticipants', event.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                <input type="checkbox" checked={templateEditForm.isActive} onChange={(event) => updateTemplateEditForm('isActive', event.target.checked)} />
                Aktywny
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" loading={busy} disabled={busy} onClick={saveTemplateEdit}>Zapisz szablon</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setEditingTemplate(null)}>Zamknij</Button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Szablony</div>
          <Table
            rows={templates}
            emptyLabel="Brak szablonow w API"
            columns={[
              { key: 'group', header: 'Grupa' },
              { key: 'trainer', header: 'Trener', muted: true },
              { key: 'weekdayLabel', header: 'Dzien', muted: true },
              { key: 'time', header: 'Godzina', render: (row) => <span className="mono">{row.start}-{row.end}</span> },
              { key: 'location', header: 'Miejsce', muted: true },
              { key: 'limit', header: 'Limit', align: 'right', width: 80 },
              { key: 'active', header: 'Status', width: 110, render: (row) => <StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /> },
              {
                key: 'actions',
                header: '',
                width: 190,
                render: (row) => (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button size="sm" variant="subtle" disabled={busy} onClick={() => openTemplateEdit(row)}>Edytuj</Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => cancelFutureTemplate(row)}>Anuluj przyszle</Button>
                  </div>
                ),
              },
            ]}
          />
        </div>

        <div className="eyebrow" style={{ marginBottom: 10 }}>Zajecia</div>
        <div className="card" style={{ overflow: 'hidden' }}>
          {sessions.map((session, index) => (
            <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: index < sessions.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <span className="mono" style={{ width: 104, fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{session.date}</span>
              <span className="mono" style={{ width: 104, fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{session.start}-{session.end}</span>
              <span className="strong" style={{ flex: 1 }}>{session.group}</span>
              <span className="muted" style={{ width: 160 }}>{session.trainer}</span>
              <span className="muted" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}><I.Location size={13} />{session.location}</span>
              <Badge tone={session.status === 'cancelled' ? 'danger' : 'primary'}>{session.status}</Badge>
              <Button size="sm" variant="subtle" onClick={() => go('attendance', { sessionId: session.sessionId })}>Frekwencja</Button>
              <Button size="sm" variant="subtle" disabled={busy || session.isCancelled} onClick={() => openSessionEdit(session)}>Edytuj</Button>
              <Button size="sm" variant="secondary" disabled={busy || session.isCancelled} onClick={() => cancelSession(session)}>Anuluj</Button>
            </div>
          ))}
          {sessions.length === 0 && <div className="muted" style={{ padding: 16 }}>Brak zajec w API.</div>}
        </div>
      </div>
    )
  }
}

