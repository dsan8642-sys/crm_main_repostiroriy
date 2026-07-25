import React, { useMemo, useState } from 'react'
import { api } from '../../api.js'
import { BusyBanner } from '../runtime.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'

export function createAdminGroupsScreen(components, reloadRoleData) {
  const { Table, StatusPill, Button, Banner, Input, Avatar, Badge, Money } = components

  return function ApiAdminGroups({ go, groupId }) {
    const rows = globalThis.AdminData?.groups || []
    const trainers = globalThis.AdminData?.trainers || []
    const clients = globalThis.AdminData?.clients || []
    const sessions = globalThis.AdminData?.sessions || []
    const initial = rows.find((row) => String(row.groupId) === String(groupId)) || null
    const [selected, setSelected] = useState(initial)
    const [creating, setCreating] = useState(false)
    const [editing, setEditing] = useState(false)
    const [candidateId, setCandidateId] = useState('')
    const [form, setForm] = useState({ name: '', description: '', defaultTrainerId: '', price: '', isActive: true })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)

    const members = useMemo(() => clients.filter((client) => String(client.groupId) === String(selected?.groupId)), [clients, selected])
    const candidates = useMemo(() => clients.filter((client) => String(client.groupId) !== String(selected?.groupId) && client.isActive), [clients, selected])
    const groupSessions = useMemo(() => sessions.filter((session) => String(session.groupId) === String(selected?.groupId)), [sessions, selected])
    const capacity = Math.max(selected?.students || 0, ...groupSessions.map((session) => session.limit || 0), 0)

    function openGroup(row) {
      setSelected(row); setCreating(false); setEditing(false); setCandidateId('')
      setForm({ name: row.name || '', description: row.description || '', defaultTrainerId: row.defaultTrainerId || '', price: row.price == null ? '' : String(row.price), isActive: row.active })
    }

    async function saveGroup(isNew = false) {
      setBusy(true); setError(null)
      try {
        // Blank price means "never bill per visit", which is not the same as 0.
        const price = String(form.price).trim().replace(',', '.')
        const payload = {
          name: form.name,
          description: form.description,
          default_trainer_id: form.defaultTrainerId || null,
          price_minor: price === '' ? null : Math.round(Number(price) * 100),
          is_active: form.isActive,
        }
        if (price !== '' && !Number.isFinite(Number(price))) throw new Error('Некорректная цена занятия')
        if (isNew) await api.post('/api/admin/groups/', payload)
        else await api.post(`/api/admin/groups/${selected.groupId}/`, payload)
        setMessage(isNew ? 'Группа создана.' : 'Карточка группы обновлена.')
        setCreating(false); setEditing(false)
        await reloadRoleData?.('admin')
      } catch (err) { setError(err.message) } finally { setBusy(false) }
    }

    async function moveParticipant(studentId, nextGroupId) {
      setBusy(true); setError(null)
      try {
        await api.post(`/api/admin/participants/${studentId}/`, { participant: { group_id: nextGroupId || null } })
        setMessage(nextGroupId ? 'Участник добавлен в группу.' : 'Участник убран из группы.')
        setCandidateId('')
        await reloadRoleData?.('admin')
      } catch (err) { setError(err.message) } finally { setBusy(false) }
    }

    const editor = (
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{creating ? 'Новая группа' : 'Редактирование группы'}</div>
        <div className="ops-form-grid"><Input label="Название" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><Input label="Описание" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><Input label="Цена занятия" hint="Списывается за посещение без абонемента. Пусто — не списывать." inputMode="decimal" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /><label>Тренер по умолчанию<select value={form.defaultTrainerId} onChange={(event) => setForm({ ...form, defaultTrainerId: event.target.value })}><option value="">Без тренера</option>{trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</select></label><label className="ops-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Активна</label></div>
        <div className="ops-button-row"><Button variant="primary" disabled={busy || !form.name} onClick={() => saveGroup(creating)}>Сохранить</Button><Button variant="secondary" onClick={() => { setCreating(false); setEditing(false) }}>Отмена</Button></div>
      </div>
    )

    return (
      <div className="page page-wide">
        <div className="page-head"><div><h2 className="page-title">Группы</h2><p className="page-desc">Составы, тренеры, вместимость и расписание групп.</p></div><Button variant="primary" onClick={() => { setCreating(true); setSelected(null); setForm({ name: '', description: '', defaultTrainerId: '', isActive: true }) }}>Новая группа</Button></div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Обновляю состав группы...</BusyBanner>
        {creating && editor}

        {selected && !creating && <section className="card ops-entity-card" aria-label={`Карточка группы ${selected.name}`}>
          <div className="ops-entity-head"><div><div className="eyebrow">Карточка группы</div><h3>{selected.name}</h3><div className="muted">{selected.description || 'Описание не добавлено'}</div></div><div className="ops-button-row"><StatusPill status={selected.active ? 'active' : 'inactive'} /><Button variant="secondary" onClick={() => setEditing((value) => !value)}>Редактировать</Button><Button variant="subtle" onClick={() => setSelected(null)}>Закрыть</Button></div></div>
          {editing && editor}
          <div className="ops-summary-grid"><div><span>Тренер</span><strong>{selected.trainer || 'Не назначен'}</strong></div><div><span>Участники</span><strong>{members.length}</strong></div><div><span>Вместимость</span><strong>{capacity || 'Не задана'}</strong></div><div><span>Ближайшие занятия</span><strong>{groupSessions.length}</strong></div></div>
          <div className="ops-detail-grid">
            <div><div className="ops-section-head"><div className="eyebrow">Состав группы</div><Badge tone={capacity && members.length >= capacity ? 'warning' : 'primary'}>{members.length}{capacity ? ` / ${capacity}` : ''}</Badge></div><div className="ops-inline-add"><SearchableSelect inputAriaLabel="Добавить участника" value={candidateId} onChange={setCandidateId} options={candidates.map((client) => clientSelectOption(client, { description: (row) => row.group || 'Без группы' }))} /><Button size="sm" variant="primary" disabled={!candidateId || busy} onClick={() => moveParticipant(candidateId, selected.groupId)}>Добавить</Button></div>{members.map((client) => <div className="ops-member-row" key={client.studentId}><button type="button" className="ops-link-button" onClick={() => go?.('clientDetail', { clientId: client.clientId })}><Avatar name={`${client.first} ${client.last}`} size={28} /><span><strong>{client.last} {client.first}</strong><small>{client.phone || client.email || 'Контакт не указан'}</small></span></button><Button size="sm" variant="subtle" disabled={busy} onClick={() => moveParticipant(client.studentId, null)}>Убрать</Button></div>)}{!members.length && <div className="empty">В группе пока нет участников.</div>}</div>
            <div><div className="eyebrow">Расписание группы</div>{groupSessions.map((session) => <button key={session.id} type="button" className="ops-detail-row" onClick={() => go?.('attendance', { sessionId: session.sessionId })}><strong>{session.date} · {session.start}-{session.end}</strong><span>{session.trainer} · {session.location}</span></button>)}{!groupSessions.length && <button type="button" className="ops-empty-action" onClick={() => go?.('schedule')}>Занятий нет. Открыть расписание</button>}</div>
          </div>
        </section>}

        <Table rows={rows} emptyLabel="Групп пока нет" columns={[
          { key: 'name', header: 'Группа', render: (row) => <button type="button" className="ops-link-button" onClick={() => openGroup(row)}><span className="strong">{row.name}</span></button> },
          { key: 'description', header: 'Описание', muted: true, render: (row) => row.description || '-' },
          { key: 'trainer', header: 'Тренер', muted: true },
          { key: 'price', header: 'Занятие', align: 'right', width: 110, render: (row) => row.price == null ? <span className="muted">-</span> : <Money amount={row.price} currency={row.currency} /> },
          { key: 'students', header: 'Участники', align: 'right', width: 110, render: (row) => <button type="button" className="ops-count-button" onClick={() => openGroup(row)}>{row.students}</button> },
          { key: 'active', header: 'Статус', width: 110, render: (row) => <StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /> },
          { key: 'act', header: '', width: 90, render: (row) => <Button size="sm" variant="subtle" onClick={() => openGroup(row)}>Карточка</Button> },
        ]} />
      </div>
    )
  }
}
