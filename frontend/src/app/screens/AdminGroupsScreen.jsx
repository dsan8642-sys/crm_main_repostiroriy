import React, { useMemo, useState } from 'react'
import { api, apiErrorMessage } from '../../api.js'
import { clearFieldError, fieldErrorsFromApi, focusFirstFieldError, formErrorMessage } from '../formErrors.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'
import { ScheduleColorPicker } from '../ScheduleColorPicker.jsx'
import { scheduleColorStyle } from '../schedulePalette.js'

export function createAdminGroupsScreen(components, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Button, Banner, Input, Select, Checkbox, Avatar, Badge, Money } = components

  return function ApiAdminGroups({ go, groupId }) {
    const rows = adminData.groups || []
    const trainers = adminData.trainers || []
    const clients = adminData.clients || []
    const sessions = adminData.sessions || []
    const initial = rows.find((row) => String(row.groupId) === String(groupId)) || null
    const [selected, setSelected] = useState(initial)
    const [creating, setCreating] = useState(false)
    const [editing, setEditing] = useState(false)
    const [candidateId, setCandidateId] = useState('')
    const [form, setForm] = useState({ name: '', description: '', defaultTrainerId: '', price: '', defaultCapacity: '', colorKey: '', isActive: true })
    const [capacityError, setCapacityError] = useState('')
    const [fieldErrors, setFieldErrors] = useState({})
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)

    const members = useMemo(() => clients.filter((client) => String(client.groupId) === String(selected?.groupId)), [clients, selected])
    const candidates = useMemo(() => clients.filter((client) => String(client.groupId) !== String(selected?.groupId) && client.isActive), [clients, selected])
    const groupSessions = useMemo(() => sessions.filter((session) => String(session.groupId) === String(selected?.groupId)), [sessions, selected])
    const capacity = selected?.defaultCapacity ?? null

    function openGroup(row) {
      setSelected(row); setCreating(false); setEditing(false); setCandidateId('')
      setCapacityError('')
      setFieldErrors({})
      setForm({ name: row.name || '', description: row.description || '', defaultTrainerId: row.defaultTrainerId || '', price: row.price == null ? '' : String(row.price), defaultCapacity: row.defaultCapacity == null ? '' : String(row.defaultCapacity), colorKey: row.colorKey === 'standard' ? '' : row.colorKey, isActive: row.active })
    }

    async function saveGroup(isNew = false) {
      const capacityValue = String(form.defaultCapacity).trim()
      const parsedCapacity = Number(capacityValue)
      if (capacityValue !== '' && (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0)) {
        setCapacityError('Укажите целое число больше нуля.')
        document.getElementById('admin-group-defaultCapacity')?.focus()
        return
      }
      if (!form.name.trim()) {
        setFieldErrors({ name: 'Укажите название группы.' })
        document.getElementById('admin-group-name')?.focus()
        return
      }
      setCapacityError('')
      setBusy(true); setError(null)
      try {
        // Blank price means "never bill per visit", which is not the same as 0.
        const price = String(form.price).trim().replace(',', '.')
        const payload = {
          name: form.name,
          description: form.description,
          default_trainer_id: form.defaultTrainerId || null,
          price_minor: price === '' ? null : Math.round(Number(price) * 100),
          default_capacity: capacityValue === '' ? null : parsedCapacity,
          color_key: form.colorKey || null,
          is_active: form.isActive,
        }
        if (price !== '' && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
          setFieldErrors((current) => ({ ...current, price: 'Укажите неотрицательную цену.' }))
          document.getElementById('admin-group-price')?.focus()
          return
        }
        if (isNew) await api.post('/api/admin/groups/', payload)
        else await api.post(`/api/admin/groups/${selected.groupId}/`, payload)
        setMessage(isNew ? 'Группа создана.' : 'Карточка группы обновлена.')
        setCreating(false); setEditing(false)
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, {
          name: 'name',
          description: 'description',
          default_trainer_id: 'defaultTrainerId',
          price_minor: 'price',
          default_capacity: 'defaultCapacity',
          color_key: 'colorKey',
          is_active: 'isActive',
        })
        setFieldErrors(nextErrors)
        setCapacityError(nextErrors.defaultCapacity || '')
        setError(formErrorMessage(err, 'Не удалось сохранить группу.'))
        focusFirstFieldError(nextErrors, {
          name: 'admin-group-name', description: 'admin-group-description',
          defaultCapacity: 'admin-group-defaultCapacity', price: 'admin-group-price',
          defaultTrainerId: 'admin-group-defaultTrainerId', colorKey: 'admin-group-colorKey',
          isActive: 'admin-group-isActive',
        })
      } finally { setBusy(false) }
    }

    async function moveParticipant(studentId, nextGroupId) {
      setBusy(true); setError(null)
      try {
        await api.post(`/api/admin/participants/${studentId}/`, { participant: { group_id: nextGroupId || null } })
        setMessage(nextGroupId ? 'Участник добавлен в группу.' : 'Участник убран из группы.')
        setCandidateId('')
        await reloadRoleData?.('admin')
      } catch (err) { setError(apiErrorMessage(err, 'Не удалось изменить состав группы.')) } finally { setBusy(false) }
    }

    function updateForm(field, value) {
      setFieldErrors((current) => clearFieldError(current, field))
      if (field === 'defaultCapacity') setCapacityError('')
      setForm((current) => ({ ...current, [field]: value }))
    }

    const editor = (
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{creating ? 'Новая группа' : 'Редактирование группы'}</div>
        <div className="ops-form-grid"><Input id="admin-group-name" label="Название" value={form.name} error={fieldErrors.name} onChange={(event) => updateForm('name', event.target.value)} /><Input id="admin-group-description" label="Описание" value={form.description} error={fieldErrors.description} onChange={(event) => updateForm('description', event.target.value)} /><Input id="admin-group-defaultCapacity" label="Вместимость" hint="Значение по умолчанию для новых групповых тренировок." inputMode="numeric" value={form.defaultCapacity} error={capacityError || fieldErrors.defaultCapacity} onChange={(event) => updateForm('defaultCapacity', event.target.value)} /><Input id="admin-group-price" label="Цена занятия" hint="Списывается за посещение без абонемента. Пусто — не списывать." inputMode="decimal" value={form.price} error={fieldErrors.price} onChange={(event) => updateForm('price', event.target.value)} /><Select id="admin-group-defaultTrainerId" label="Тренер по умолчанию" value={form.defaultTrainerId} error={fieldErrors.defaultTrainerId} onChange={(event) => updateForm('defaultTrainerId', event.target.value)}><option value="">Без тренера</option>{trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</Select><Checkbox id="admin-group-isActive" label="Активна" checked={form.isActive} error={fieldErrors.isActive} onChange={(event) => updateForm('isActive', event.target.checked)} /></div>
        <ScheduleColorPicker id="admin-group-colorKey" value={form.colorKey} error={fieldErrors.colorKey} onChange={(colorKey) => updateForm('colorKey', colorKey || '')} />
        <div className="ops-button-row"><Button variant="primary" disabled={busy || !form.name} onClick={() => saveGroup(creating)}>Сохранить</Button><Button variant="secondary" onClick={() => { setCreating(false); setEditing(false) }}>Отмена</Button></div>
      </div>
    )

    return (
      <div className="page page-wide">
        <div className="page-head"><div><h1 className="page-title">Группы</h1><p className="page-desc">Составы, тренеры, вместимость и расписание групп.</p></div><Button variant="primary" onClick={() => { setCreating(true); setSelected(null); setCapacityError(''); setFieldErrors({}); setForm({ name: '', description: '', defaultTrainerId: '', price: '', defaultCapacity: '', colorKey: '', isActive: true }) }}>Новая группа</Button></div>
        <ToastNotice id="admin-groups-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Обновляю состав группы...</BusyBanner>
        {creating && editor}

        {selected && !creating && <section className="card ops-entity-card" aria-label={`Карточка группы ${selected.name}`}>
          <div className="ops-entity-head"><div><div className="eyebrow">Карточка группы</div><h3>{selected.name}</h3><div className="muted">{selected.description || 'Описание не добавлено'}</div></div><div className="ops-button-row"><StatusPill status={selected.active ? 'active' : 'inactive'} /><Button variant="secondary" onClick={() => setEditing((value) => !value)}>Редактировать</Button><Button variant="subtle" onClick={() => setSelected(null)}>Закрыть</Button></div></div>
          {editing && editor}
          <div className="ops-summary-grid"><div><span>Тренер</span><strong>{selected.trainer || 'Не назначен'}</strong></div><div><span>Участники</span><strong>{members.length}</strong></div><div><span>Вместимость</span><strong>{capacity ?? 'Не задана'}</strong></div><div><span>Ближайшие занятия</span><strong>{groupSessions.length}</strong></div></div>
          <div className="ops-detail-grid">
            <div><div className="ops-section-head"><div className="eyebrow">Состав группы</div><Badge tone={capacity && members.length >= capacity ? 'warning' : 'primary'}>{members.length} / {capacity ?? 'Не задана'}</Badge></div><div className="ops-inline-add"><SearchableSelect inputAriaLabel="Добавить участника" value={candidateId} onChange={setCandidateId} options={candidates.map((client) => clientSelectOption(client, { description: (row) => row.group || 'Без группы' }))} /><Button size="sm" variant="primary" disabled={!candidateId || busy} onClick={() => moveParticipant(candidateId, selected.groupId)}>Добавить</Button></div>{members.map((client) => <div className="ops-member-row" key={client.studentId}><button type="button" className="ops-link-button" onClick={() => go?.('clientDetail', { clientId: client.clientId })}><Avatar name={`${client.first} ${client.last}`} size={28} /><span><strong>{client.last} {client.first}</strong><small>{client.phone || client.email || 'Контакт не указан'}</small></span></button><Button size="sm" variant="subtle" disabled={busy} onClick={() => moveParticipant(client.studentId, null)}>Убрать</Button></div>)}{!members.length && <div className="empty">В группе пока нет участников.</div>}</div>
            <div><div className="eyebrow">Расписание группы</div>{groupSessions.map((session) => <button key={session.id} type="button" className={`ops-detail-row ops-schedule-detail-row${session.isCancelled ? ' is-cancelled' : ''}`} data-color-key={session.colorKey} style={scheduleColorStyle(session.colorKey)} onClick={() => go?.('attendance', { sessionId: session.sessionId })}><strong>{session.date} · {session.start}-{session.end}</strong><span>{session.trainer} · {session.location}</span></button>)}{!groupSessions.length && <button type="button" className="ops-empty-action" onClick={() => go?.('schedule')}>Занятий нет. Открыть расписание</button>}</div>
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
