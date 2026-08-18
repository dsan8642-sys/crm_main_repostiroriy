import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage, fetchAllPages } from '../../api.js'
import { clearFieldError, fieldErrorsFromApi, focusFirstFieldError, formErrorMessage } from '../formErrors.js'
import { BusyBanner } from '../runtime.jsx'
import { FormModal } from '../FormModal.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'
import { ScheduleColorPicker } from '../ScheduleColorPicker.jsx'
import { scheduleColorStyle } from '../schedulePalette.js'
import { mapAdminGroupRows, mapAdminParticipantRows, mapAdminSessionRows } from '../../mappers.js'
import { ListFeedback, ListPagination, ListToolbar, useScreenList } from '../listFoundation.jsx'
import { ActionPopover, ContextBackButton, EntityMobileCard } from '../EntityListPrimitives.jsx'
import { formatEntityDate } from '../entityListContracts.js'
import { dateToIso } from '../scheduleContracts.js'

export function createAdminGroupsScreen(components, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Button, Banner, Input, Select, Checkbox, Avatar, Badge, Money } = components

  return function ApiAdminGroups({ go, groupId, currentUser }) {
    const groupList = useScreenList({
      path: '/api/admin/groups/',
      itemKey: 'groups',
      mapRows: mapAdminGroupRows,
      role: 'admin',
      route: 'groups',
      userKey: currentUser?.id || currentUser?.username,
      initialFilters: { active: '', trainer_id: '' },
      defaultOrder: 'name',
    })
    const rows = groupList.rows
    const trainers = adminData.trainers || []
    const clients = adminData.clients || []
    const initial = (adminData.groups || []).find((row) => String(row.groupId) === String(groupId)) || null
    const initialForm = initial ? { name: initial.name || '', description: initial.description || '', defaultTrainerId: initial.defaultTrainerId || '', price: initial.price == null ? '' : String(initial.price), defaultCapacity: initial.defaultCapacity == null ? '' : String(initial.defaultCapacity), colorKey: initial.colorKey === 'standard' ? '' : initial.colorKey, isActive: initial.active } : { name: '', description: '', defaultTrainerId: '', price: '', defaultCapacity: '', colorKey: '', isActive: true }
    const [selected, setSelected] = useState(initial)
    const [creating, setCreating] = useState(false)
    const [editing, setEditing] = useState(false)
    const [addingMember, setAddingMember] = useState(false)
    const [candidateId, setCandidateId] = useState('')
    const [form, setForm] = useState(initialForm)
    const [formBaseline, setFormBaseline] = useState(initial ? initialForm : null)
    const [capacityError, setCapacityError] = useState('')
    const [fieldErrors, setFieldErrors] = useState({})
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const [groupSessions, setGroupSessions] = useState([])
    const [members, setMembers] = useState([])
    const [membersLoading, setMembersLoading] = useState(false)
    const [memberRefresh, setMemberRefresh] = useState(0)

    const candidates = useMemo(() => clients.filter((client) => !(client.groupIds || []).map(String).includes(String(selected?.groupId)) && (client.groupIds || []).length < 3 && client.isActive), [clients, selected])
    const capacity = selected?.defaultCapacity ?? null

    const loadCandidateOptions = useCallback(async (query, requestOptions = {}) => {
      const payload = await api.get(`/api/admin/reference/?q=${encodeURIComponent(query)}`, requestOptions)
      return mapAdminParticipantRows(payload.participants || [])
        .filter((client) => !(client.groupIds || []).map(String).includes(String(selected?.groupId)) && (client.groupIds || []).length < 3 && client.isActive)
        .map((client) => clientSelectOption(client, { description: (row) => row.group || 'Без группы' }))
    }, [selected?.groupId])

    useEffect(() => {
      if (!selected?.groupId) {
        setGroupSessions([])
        return undefined
      }
      const controller = new AbortController()
      const now = new Date()
      const query = new URLSearchParams({
        group_id: String(selected.groupId),
        date_from: dateToIso(now),
        date_to: dateToIso(new Date(now.getTime() + 90 * 86400000)),
        page: '1',
        page_size: '200',
      })
      api.get(`/api/admin/schedule/sessions/?${query}`, { signal: controller.signal })
        .then((payload) => setGroupSessions(mapAdminSessionRows(payload.sessions || [])))
        .catch((next) => {
          if (next.name !== 'AbortError') setError(apiErrorMessage(next, 'Не удалось загрузить расписание группы.'))
        })
      return () => controller.abort()
    }, [selected?.groupId])

    useEffect(() => {
      if (!selected?.groupId) {
        setMembers([])
        setMembersLoading(false)
        return undefined
      }
      let alive = true
      setMembers([])
      setMembersLoading(true)
      fetchAllPages(`/api/admin/clients/?group_id=${encodeURIComponent(selected.groupId)}`, 'clients', 200)
        .then((payload) => {
          if (alive) setMembers(mapAdminParticipantRows(payload.clients || []))
        })
        .catch((next) => {
          if (alive) {
            setMembers([])
            setError(apiErrorMessage(next, 'Не удалось загрузить полный состав группы.'))
          }
        })
        .finally(() => {
          if (alive) setMembersLoading(false)
        })
      return () => { alive = false }
    }, [selected?.groupId, memberRefresh])

    const nextSessionLabel = (row) => row.nextSessionAt
      ? `${formatEntityDate(row.nextSessionAt)} · ${new Date(row.nextSessionAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
      : 'Нет ближайших занятий'

    function openGroup(row) {
      setSelected(row); setCreating(false); setEditing(false); setCandidateId('')
      setCapacityError('')
      setFieldErrors({})
      const next = { name: row.name || '', description: row.description || '', defaultTrainerId: row.defaultTrainerId || '', price: row.price == null ? '' : String(row.price), defaultCapacity: row.defaultCapacity == null ? '' : String(row.defaultCapacity), colorKey: row.colorKey === 'standard' ? '' : row.colorKey, isActive: row.active }
      setForm(next)
      setFormBaseline(next)
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
        setFormBaseline(null)
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

    async function changeParticipantMembership(studentId, action) {
      setBusy(true); setError(null)
      try {
        const participant = await api.get(`/api/admin/participants/${studentId}/`)
        const currentIds = (participant.groups || []).map((group) => String(group.id))
        const selectedId = String(selected?.groupId || '')
        const groupIds = action === 'add'
          ? [...new Set([...currentIds, selectedId])]
          : currentIds.filter((groupId) => groupId !== selectedId)
        await api.post(`/api/admin/participants/${studentId}/`, { participant: { group_ids: groupIds } })
        setMessage(action === 'add' ? 'Участник добавлен в группу.' : 'Участник убран из группы.')
        setCandidateId('')
        setAddingMember(false)
        await reloadRoleData?.('admin')
        setMemberRefresh((current) => current + 1)
      } catch (err) { setError(apiErrorMessage(err, 'Не удалось изменить состав группы.')) } finally { setBusy(false) }
    }

    function updateForm(field, value) {
      setFieldErrors((current) => clearFieldError(current, field))
      if (field === 'defaultCapacity') setCapacityError('')
      setForm((current) => ({ ...current, [field]: value }))
    }

    const editor = (
      <>
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <div className="ops-form-grid"><Input id="admin-group-name" label="Название" value={form.name} error={fieldErrors.name} onChange={(event) => updateForm('name', event.target.value)} /><Input id="admin-group-description" label="Описание" value={form.description} error={fieldErrors.description} onChange={(event) => updateForm('description', event.target.value)} /><Input id="admin-group-defaultCapacity" label="Вместимость" hint="Значение по умолчанию для новых групповых тренировок." inputMode="numeric" value={form.defaultCapacity} error={capacityError || fieldErrors.defaultCapacity} onChange={(event) => updateForm('defaultCapacity', event.target.value)} /><Input id="admin-group-price" label="Цена занятия" hint="Списывается за посещение без абонемента. Пусто — не списывать." inputMode="decimal" value={form.price} error={fieldErrors.price} onChange={(event) => updateForm('price', event.target.value)} /><Select id="admin-group-defaultTrainerId" label="Тренер по умолчанию" value={form.defaultTrainerId} error={fieldErrors.defaultTrainerId} onChange={(event) => updateForm('defaultTrainerId', event.target.value)}><option value="">Без тренера</option>{trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</Select><Checkbox id="admin-group-isActive" label="Активна" checked={form.isActive} error={fieldErrors.isActive} onChange={(event) => updateForm('isActive', event.target.checked)} /></div>
        <ScheduleColorPicker id="admin-group-colorKey" value={form.colorKey} error={fieldErrors.colorKey} onChange={(colorKey) => updateForm('colorKey', colorKey || '')} />
      </>
    )

    return (
      <div className="page page-wide">
        <div className="page-head"><div><h1 className="page-title">Группы</h1><p className="page-desc">Составы, тренеры, вместимость и расписание групп.</p></div><Button variant="primary" onClick={() => { const next = { name: '', description: '', defaultTrainerId: '', price: '', defaultCapacity: '', colorKey: '', isActive: true }; setCreating(true); setSelected(null); setCapacityError(''); setFieldErrors({}); setForm(next); setFormBaseline(next) }}>Новая группа</Button></div>
        <ToastNotice id="admin-groups-result" message={message} />
        {error && !creating && !editing && !addingMember && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Обновляю состав группы...</BusyBanner>
        <ListToolbar list={groupList} searchLabel="Поиск групп" searchPlaceholder="Название или описание">
          <label>Статус<select value={groupList.draftFilters.active} onChange={(event) => groupList.setDraftFilter('active', event.target.value)}><option value="">Все</option><option value="true">Активные</option><option value="false">Неактивные</option></select></label>
          <label>Тренер<select value={groupList.draftFilters.trainer_id} onChange={(event) => groupList.setDraftFilter('trainer_id', event.target.value)}><option value="">Все</option>{trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</select></label>
        </ListToolbar>
        <FormModal
          open={creating || editing}
          title={creating ? 'Новая группа' : 'Редактирование группы'}
          size="lg"
          busy={busy}
          dirty={Boolean(formBaseline) && JSON.stringify(form) !== JSON.stringify(formBaseline)}
          onRequestClose={() => { if (formBaseline) setForm(formBaseline); setCreating(false); setEditing(false); setFormBaseline(null); setFieldErrors({}); setCapacityError(''); setError(null) }}
          footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>Отмена</Button><Button variant="primary" disabled={busy || !form.name} onClick={() => saveGroup(creating)}>Сохранить</Button></>}
        >
          {editor}
        </FormModal>

        {selected && !creating && <section className="card ops-entity-card" aria-label={`Карточка группы ${selected.name}`}>
          <ContextBackButton onClick={() => setSelected(null)}>К списку групп</ContextBackButton>
          <div className="ops-entity-head"><div><div className="eyebrow">Карточка группы</div><h3>{selected.name}</h3><div className="muted">{selected.description || 'Описание не добавлено'}</div></div><div className="ops-button-row"><StatusPill status={selected.active ? 'active' : 'inactive'} /><Button variant="secondary" onClick={() => { setEditing(true); setFormBaseline({ ...form }) }}>Редактировать</Button><Button variant="subtle" onClick={() => setSelected(null)}>Закрыть</Button></div></div>
          <div className="ops-summary-grid"><div><span>Тренер</span><strong>{selected.trainer || 'Не назначен'}</strong></div><div><span>Участники</span><strong>{members.length}</strong></div><div><span>Вместимость</span><strong>{capacity ?? 'Не задана'}</strong></div><div><span>Ближайшее занятие</span><strong>{groupSessions[0] ? `${groupSessions[0].date} · ${groupSessions[0].start}` : nextSessionLabel(selected)}</strong></div></div>
          <div className="ops-detail-grid">
            <div><div className="ops-section-head"><div className="eyebrow">Состав группы</div><div className="ops-button-row"><Badge tone={capacity && members.length >= capacity ? 'warning' : 'primary'}>{membersLoading ? 'Загрузка…' : `${members.length} / ${capacity ?? 'Не задана'}`}</Badge><Button size="sm" variant="primary" disabled={busy || membersLoading} onClick={() => { setCandidateId(''); setAddingMember(true) }}>Добавить</Button></div></div>{members.map((client) => <div className="ops-member-row" key={client.studentId}><button type="button" className="ops-link-button" onClick={() => go?.('clientDetail', { clientId: client.clientId })}><Avatar name={`${client.first} ${client.last}`} size={28} /><span><strong>{client.last} {client.first}</strong><small>{client.phone || client.email || 'Контакт не указан'}</small></span></button><Button size="sm" variant="subtle" disabled={busy} onClick={() => changeParticipantMembership(client.studentId, 'remove')}>Убрать</Button></div>)}{membersLoading && <div className="empty">Загружаю полный состав группы…</div>}{!membersLoading && !members.length && <div className="empty">В группе пока нет участников.</div>}</div>
            <div><div className="eyebrow">Расписание группы</div>{groupSessions.map((session) => <button key={session.id} type="button" className={`ops-detail-row ops-schedule-detail-row${session.isCancelled ? ' is-cancelled' : ''}`} data-color-key={session.colorKey} style={scheduleColorStyle(session.colorKey)} onClick={() => go?.('attendance', { sessionId: session.sessionId })}><strong>{session.date} · {session.start}-{session.end}</strong><span>{session.trainer} · {session.location}</span></button>)}{!groupSessions.length && <button type="button" className="ops-empty-action" onClick={() => go?.('schedule')}>Занятий нет. Открыть расписание</button>}</div>
          </div>
        </section>}

        <FormModal open={addingMember} title="Добавить участника в группу" size="sm" busy={busy} dirty={Boolean(candidateId)} onRequestClose={() => { setAddingMember(false); setCandidateId(''); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>Отмена</Button><Button variant="primary" disabled={!candidateId || busy} onClick={() => changeParticipantMembership(candidateId, 'add')}>Добавить</Button></>}>
          {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
          <SearchableSelect inputAriaLabel="Добавить участника" value={candidateId} onChange={setCandidateId} options={candidates.map((client) => clientSelectOption(client, { description: (row) => row.group || 'Без группы' }))} loadOptions={loadCandidateOptions} />
        </FormModal>

        <ListFeedback list={groupList} emptyLabel="Групп пока нет" />
        <div className="ops-entity-desktop-table"><Table rows={rows} emptyLabel="Групп пока нет" columns={[
          { key: 'name', header: 'Группа', render: (row) => <button type="button" className="ops-link-button" onClick={() => openGroup(row)}><span className="strong">{row.name}</span></button> },
          { key: 'description', header: 'Описание', muted: true, render: (row) => row.description || '-' },
          { key: 'trainer', header: 'Тренер', muted: true },
          { key: 'price', header: 'Занятие', align: 'right', width: 110, render: (row) => row.price == null ? <span className="muted">-</span> : <Money amount={row.price} currency={row.currency} /> },
          { key: 'students', header: 'Участники', align: 'right', width: 110, render: (row) => <button type="button" className="ops-count-button" onClick={() => openGroup(row)}>{row.students}</button> },
          { key: 'active', header: 'Статус', width: 110, render: (row) => <StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /> },
          { key: 'act', header: '', width: 90, render: (row) => <Button size="sm" variant="subtle" onClick={() => openGroup(row)}>Карточка</Button> },
        ]} /></div>
        <div className="ops-entity-mobile-list">
          {rows.map((row) => (
            <EntityMobileCard key={row.id} className="ops-group-compact-card" labelledBy={`group-card-${row.id}`}>
              <div className="ops-compact-card-head">
                <button type="button" className="ops-compact-card-title" onClick={() => openGroup(row)}><strong id={`group-card-${row.id}`} title={row.name}>{row.name}</strong></button>
                <ActionPopover label={`Действия: ${row.name}`} actions={[
                  { key: 'profile', label: 'Профиль', onSelect: () => openGroup(row) },
                  { key: 'edit', label: 'Изменить', onSelect: () => { openGroup(row); setEditing(true) } },
                ]} />
              </div>
              <div className="ops-compact-card-line"><span>Тренер</span><strong title={row.trainer}>{row.trainer || 'Не назначен'}</strong></div>
              <div className="ops-compact-card-line"><span>Ближайшее</span><strong title={nextSessionLabel(row)}>{nextSessionLabel(row)}</strong></div>
              <div className="ops-compact-card-footer"><span>{row.students}/{row.defaultCapacity ?? '—'} участников</span><StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /></div>
            </EntityMobileCard>
          ))}
        </div>
        <ListPagination list={groupList} />
      </div>
    )
  }
}
