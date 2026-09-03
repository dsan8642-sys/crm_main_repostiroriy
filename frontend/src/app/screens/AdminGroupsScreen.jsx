import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { adminLocaleTag, adminTranslator } from '../../adminLocales.js'
import { api, apiErrorMessage, fetchAllPages } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
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
  const { Table, StatusPill, Button, Banner, Input, Select, Checkbox, Avatar, Badge, Money, Dialog } = components

  return function ApiAdminGroups({ go, groupId, currentUser }) {
    const { locale } = useLocale()
    const t = useMemo(() => adminTranslator(locale), [locale])
    const localeTag = adminLocaleTag(locale)
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
    const locations = (adminData.locations || []).filter(
      (location) => location.is_active !== false && location.active !== false,
    )
    const clients = adminData.clients || []
    const initial = (adminData.groups || []).find((row) => String(row.groupId) === String(groupId)) || null
    const initialForm = initial ? { name: initial.name || '', description: initial.description || '', defaultTrainerId: initial.defaultTrainerId || '', defaultLocationId: initial.defaultLocationActive !== false ? initial.defaultLocationId || '' : '', price: initial.price == null ? '' : String(initial.price), defaultCapacity: initial.defaultCapacity == null ? '' : String(initial.defaultCapacity), colorKey: initial.colorKey === 'standard' ? '' : initial.colorKey, isActive: initial.active } : { name: '', description: '', defaultTrainerId: '', defaultLocationId: '', price: '', defaultCapacity: '', colorKey: '', isActive: true }
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
    const [archiveConfirm, setArchiveConfirm] = useState(false)
    const [archivePreview, setArchivePreview] = useState(null)
    const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)

    useEffect(() => {
      const media = window.matchMedia('(max-width: 767px)')
      const update = () => setIsMobile(media.matches)
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }, [])

    const candidates = useMemo(() => clients.filter((client) => !(client.groupIds || []).map(String).includes(String(selected?.groupId)) && (client.groupIds || []).length < 3 && client.isActive), [clients, selected])
    const capacity = selected?.defaultCapacity ?? null

    const loadCandidateOptions = useCallback(async (query, requestOptions = {}) => {
      const payload = await api.get(`/api/admin/reference/?q=${encodeURIComponent(query)}`, requestOptions)
      return mapAdminParticipantRows(payload.participants || [])
        .filter((client) => !(client.groupIds || []).map(String).includes(String(selected?.groupId)) && (client.groupIds || []).length < 3 && client.isActive)
        .map((client) => clientSelectOption(client, { description: (row) => row.group || t('groups.noGroup') }))
    }, [selected?.groupId, t])

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
          if (next.name !== 'AbortError') setError(apiErrorMessage(next, t('groups.scheduleError')))
        })
      return () => controller.abort()
    }, [selected?.groupId, t])

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
            setError(apiErrorMessage(next, t('groups.rosterError')))
          }
        })
        .finally(() => {
          if (alive) setMembersLoading(false)
        })
      return () => { alive = false }
    }, [selected?.groupId, memberRefresh, t])

    const nextSessionLabel = (row) => row.nextSessionAt
      ? `${formatEntityDate(row.nextSessionAt)} · ${new Date(row.nextSessionAt).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })}`
      : t('groups.noUpcoming')

    function openGroup(row) {
      setSelected(row); setCreating(false); setEditing(false); setCandidateId('')
      setCapacityError('')
      setFieldErrors({})
      const next = { name: row.name || '', description: row.description || '', defaultTrainerId: row.defaultTrainerId || '', defaultLocationId: row.defaultLocationActive !== false ? row.defaultLocationId || '' : '', price: row.price == null ? '' : String(row.price), defaultCapacity: row.defaultCapacity == null ? '' : String(row.defaultCapacity), colorKey: row.colorKey === 'standard' ? '' : row.colorKey, isActive: row.active }
      setForm(next)
      setFormBaseline(next)
    }

    async function saveGroup(isNew = false) {
      const capacityValue = String(form.defaultCapacity).trim()
      const parsedCapacity = Number(capacityValue)
      if (capacityValue !== '' && (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0)) {
        setCapacityError(t('groups.capacityInvalid'))
        document.getElementById('admin-group-defaultCapacity')?.focus()
        return
      }
      if (!form.name.trim()) {
        setFieldErrors({ name: t('groups.nameRequired') })
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
          default_location_id: form.defaultLocationId || null,
          price_minor: price === '' ? null : Math.round(Number(price) * 100),
          default_capacity: capacityValue === '' ? null : parsedCapacity,
          color_key: form.colorKey || null,
          is_active: form.isActive,
        }
        if (price !== '' && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
          setFieldErrors((current) => ({ ...current, price: t('groups.priceInvalid') }))
          document.getElementById('admin-group-price')?.focus()
          return
        }
        if (isNew) await api.post('/api/admin/groups/', payload)
        else await api.post(`/api/admin/groups/${selected.groupId}/`, payload)
        setMessage(isNew ? t('groups.created') : t('groups.updated'))
        setCreating(false); setEditing(false)
        setFormBaseline(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, {
          name: 'name',
          description: 'description',
          default_trainer_id: 'defaultTrainerId',
          default_location_id: 'defaultLocationId',
          price_minor: 'price',
          default_capacity: 'defaultCapacity',
          color_key: 'colorKey',
          is_active: 'isActive',
        })
        setFieldErrors(nextErrors)
        setCapacityError(nextErrors.defaultCapacity || '')
        setError(formErrorMessage(err, t('groups.saveError')))
        focusFirstFieldError(nextErrors, {
          name: 'admin-group-name', description: 'admin-group-description',
          defaultCapacity: 'admin-group-defaultCapacity', price: 'admin-group-price',
          defaultTrainerId: 'admin-group-defaultTrainerId', defaultLocationId: 'admin-group-defaultLocationId', colorKey: 'admin-group-colorKey',
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
        setMessage(action === 'add' ? t('groups.memberAdded') : t('groups.memberRemoved'))
        setCandidateId('')
        setAddingMember(false)
        await reloadRoleData?.('admin')
        setMemberRefresh((current) => current + 1)
      } catch (err) { setError(apiErrorMessage(err, t('groups.membershipError'))) } finally { setBusy(false) }
    }

    function updateForm(field, value) {
      setFieldErrors((current) => clearFieldError(current, field))
      if (field === 'defaultCapacity') setCapacityError('')
      setForm((current) => ({ ...current, [field]: value }))
    }

    async function openArchiveConfirm(row = selected) {
      if (!row?.groupId) return
      setBusy(true); setError(null)
      try {
        const preview = await api.get(`/api/admin/groups/${row.groupId}/`)
        openGroup(row)
        setArchivePreview(preview)
        setArchiveConfirm(true)
      } catch (err) { setError(apiErrorMessage(err, t('groups.archiveError'))) } finally { setBusy(false) }
    }

    async function archiveGroup() {
      if (!selected?.groupId) return
      setBusy(true); setError(null)
      try {
        const result = await api.delete(`/api/admin/groups/${selected.groupId}/`)
        setSelected((current) => ({ ...current, active: false }))
        setArchiveConfirm(false)
        setMessage(t('groups.archivedResult', { name: selected.name, sessions: result.future_sessions_count, participants: result.preserved_participants_count }))
        window.dispatchEvent(new CustomEvent('swimcrm:list-invalidate', { detail: { role: 'admin' } }))
        await reloadRoleData?.('admin')
      } catch (err) { setError(apiErrorMessage(err, t('groups.archiveError'))) } finally { setBusy(false) }
    }

    async function restoreGroup(row = selected) {
      if (!row?.groupId) return
      setBusy(true); setError(null)
      try {
        await api.post(`/api/admin/groups/${row.groupId}/restore/`, {})
        setSelected((current) => current && String(current.groupId) === String(row.groupId) ? { ...current, active: true } : current)
        setMessage(t('groups.restored', { name: row.name }))
        window.dispatchEvent(new CustomEvent('swimcrm:list-invalidate', { detail: { role: 'admin' } }))
        await reloadRoleData?.('admin')
      } catch (err) { setError(apiErrorMessage(err, t('groups.restoreError'))) } finally { setBusy(false) }
    }

    const editor = (
      <>
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <div className="ops-form-grid"><Input id="admin-group-name" label={t('groups.name')} value={form.name} error={fieldErrors.name} onChange={(event) => updateForm('name', event.target.value)} /><Input id="admin-group-description" label={t('common.description')} value={form.description} error={fieldErrors.description} onChange={(event) => updateForm('description', event.target.value)} /><Input id="admin-group-defaultCapacity" label={t('groups.capacity')} hint={t('groups.capacityHint')} inputMode="numeric" value={form.defaultCapacity} error={capacityError || fieldErrors.defaultCapacity} onChange={(event) => updateForm('defaultCapacity', event.target.value)} /><Input id="admin-group-price" label={t('groups.price')} hint={t('groups.priceHint')} inputMode="decimal" value={form.price} error={fieldErrors.price} onChange={(event) => updateForm('price', event.target.value)} /><Select id="admin-group-defaultTrainerId" label={t('groups.defaultTrainer')} value={form.defaultTrainerId} error={fieldErrors.defaultTrainerId} onChange={(event) => updateForm('defaultTrainerId', event.target.value)}><option value="">{t('groups.noTrainer')}</option>{trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</Select><Select id="admin-group-defaultLocationId" label={t('groups.defaultLocation')} value={form.defaultLocationId} error={fieldErrors.defaultLocationId} onChange={(event) => updateForm('defaultLocationId', event.target.value)}><option value="">{t('groups.noLocation')}</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Checkbox id="admin-group-isActive" label={t('groups.isActive')} checked={form.isActive} error={fieldErrors.isActive} onChange={(event) => updateForm('isActive', event.target.checked)} /></div>
        <ScheduleColorPicker id="admin-group-colorKey" value={form.colorKey} error={fieldErrors.colorKey} onChange={(colorKey) => updateForm('colorKey', colorKey || '')} />
      </>
    )

    const groupDetail = selected && !creating ? <section className="card ops-entity-card ops-inline-entity-detail" aria-label={t('groups.cardAria', { name: selected.name })} style={{ marginTop: 16, padding: '20px 22px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', boxSizing: 'border-box' }}>
      <ContextBackButton onClick={() => setSelected(null)}>{t('groups.back')}</ContextBackButton>
      <div className="ops-entity-head" style={{ gap: 16, marginTop: 18 }}><div style={{ minWidth: 0 }}><div className="eyebrow">{t('groups.card')}</div><h3>{selected.name}</h3><div className="muted">{selected.description || t('groups.noDescription')}</div></div><div className="ops-button-row"><StatusPill status={selected.active ? 'active' : 'inactive'} /><Button variant="secondary" onClick={() => { setEditing(true); setFormBaseline({ ...form }) }}>{t('groups.editAction')}</Button>{selected.active ? <Button variant="danger" disabled={busy} onClick={() => openArchiveConfirm()}>{t('groups.archive')}</Button> : <Button variant="primary" disabled={busy} onClick={() => restoreGroup()}>{t('groups.restore')}</Button>}<Button variant="subtle" onClick={() => setSelected(null)}>{t('common.close')}</Button></div></div>
      <div className="ops-summary-grid" style={{ gap: 16, marginTop: 20 }}><div><span>{t('common.trainer')}</span><strong>{selected.trainer || t('groups.notAssigned')}</strong></div><div><span>{t('groups.participants')}</span><strong>{members.length}</strong></div><div><span>{t('groups.capacity')}</span><strong>{capacity ?? t('groups.notSet')}</strong></div><div><span>{t('groups.nextSession')}</span><strong>{groupSessions[0] ? `${groupSessions[0].date} · ${groupSessions[0].start}` : nextSessionLabel(selected)}</strong></div></div>
      <div className="ops-detail-grid" style={{ gap: 24, marginTop: 22 }}>
        <div><div className="ops-section-head"><div className="eyebrow">{t('groups.roster')}</div><div className="ops-button-row"><Badge tone={capacity && members.length >= capacity ? 'warning' : 'primary'}>{membersLoading ? t('common.loading') : `${members.length} / ${capacity ?? t('groups.notSet')}`}</Badge><Button size="sm" variant="primary" disabled={busy || membersLoading || !selected.active} onClick={() => { setCandidateId(''); setAddingMember(true) }}>{t('groups.add')}</Button></div></div>{members.map((client) => <div className="ops-member-row" key={client.studentId}><button type="button" className="ops-link-button" onClick={() => go?.('clientDetail', { clientId: client.clientId })}><Avatar name={`${client.first} ${client.last}`} size={28} /><span><strong>{client.last} {client.first}</strong><small>{client.phone || client.email || t('groups.contactMissing')}</small></span></button><Button size="sm" variant="subtle" disabled={busy} onClick={() => changeParticipantMembership(client.studentId, 'remove')}>{t('groups.remove')}</Button></div>)}{membersLoading && <div className="empty">{t('groups.loadingRoster')}</div>}{!membersLoading && !members.length && <div className="empty">{t('groups.emptyRoster')}</div>}</div>
        <div><div className="eyebrow" style={{ marginBottom: 10 }}>{t('groups.schedule')}</div>{groupSessions.map((session) => <button key={session.id} type="button" className={`ops-detail-row ops-schedule-detail-row${session.isCancelled ? ' is-cancelled' : ''}`} data-color-key={session.colorKey} style={{ ...scheduleColorStyle(session.colorKey), display: 'grid', justifyItems: 'start', gap: 5, width: '100%', minHeight: 54, padding: '11px 14px', border: '1px solid var(--schedule-color-border)', borderRadius: 'var(--radius-md)', background: 'var(--schedule-color-background)', color: 'var(--schedule-color-text)', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box' }} onClick={() => go?.('attendance', { sessionId: session.sessionId })}><strong>{session.date} · {session.start}-{session.end}</strong><span>{session.trainer} · {session.location}</span></button>)}{!groupSessions.length && <button type="button" className="ops-empty-action" onClick={() => go?.('schedule')}>{t('groups.noSessions')}</button>}</div>
      </div>
    </section> : null

    return (
      <div className="page page-wide" style={{ paddingInline: 'clamp(12px, 3vw, 26px)' }}>
        <div className="page-head"><div><h1 className="page-title">{t('groups.title')}</h1><p className="page-desc">{t('groups.description')}</p></div><Button variant="primary" onClick={() => { const next = { name: '', description: '', defaultTrainerId: '', defaultLocationId: '', price: '', defaultCapacity: '', colorKey: '', isActive: true }; setCreating(true); setSelected(null); setCapacityError(''); setFieldErrors({}); setForm(next); setFormBaseline(next) }}>{t('groups.new')}</Button></div>
        <ToastNotice id="admin-groups-result" message={message} />
        {error && !creating && !editing && !addingMember && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>{t('groups.updatingRoster')}</BusyBanner>
        <ListToolbar list={groupList} searchLabel={t('groups.search')} searchPlaceholder={t('groups.searchPlaceholder')}>
          <label>{t('common.status')}<select value={groupList.draftFilters.active} onChange={(event) => groupList.setDraftFilter('active', event.target.value)}><option value="">{t('common.all')}</option><option value="true">{t('common.active')}</option><option value="false">{t('common.inactive')}</option></select></label>
          <label>{t('common.trainer')}<select value={groupList.draftFilters.trainer_id} onChange={(event) => groupList.setDraftFilter('trainer_id', event.target.value)}><option value="">{t('common.all')}</option>{trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}</select></label>
        </ListToolbar>
        <FormModal
          open={creating || editing}
          title={creating ? t('groups.new') : t('groups.edit')}
          size="lg"
          busy={busy}
          dirty={Boolean(formBaseline) && JSON.stringify(form) !== JSON.stringify(formBaseline)}
          onRequestClose={() => { if (formBaseline) setForm(formBaseline); setCreating(false); setEditing(false); setFormBaseline(null); setFieldErrors({}); setCapacityError(''); setError(null) }}
          footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || !form.name} onClick={() => saveGroup(creating)}>{t('common.save')}</Button></>}
        >
          {editor}
        </FormModal>

        <FormModal open={addingMember} title={t('groups.addParticipantTitle')} size="sm" busy={busy} dirty={Boolean(candidateId)} onRequestClose={() => { setAddingMember(false); setCandidateId(''); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" disabled={!candidateId || busy} onClick={() => changeParticipantMembership(candidateId, 'add')}>{t('groups.add')}</Button></>}>
          {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
          <SearchableSelect inputAriaLabel={t('groups.addParticipant')} value={candidateId} onChange={setCandidateId} options={candidates.map((client) => clientSelectOption(client, { description: (row) => row.group || t('groups.noGroup') }))} loadOptions={loadCandidateOptions} />
        </FormModal>

        <ListFeedback list={groupList} emptyLabel={t('groups.empty')} />
        <div className="ops-entity-desktop-table"><Table rows={rows} emptyLabel={t('groups.empty')} renderAfterRow={(row) => !isMobile && String(selected?.groupId) === String(row.groupId) ? React.cloneElement(groupDetail, { id: `group-detail-desktop-${row.groupId}` }) : null} columns={[
          { key: 'name', header: t('common.group'), render: (row) => <button type="button" className="ops-link-button" aria-expanded={String(selected?.groupId) === String(row.groupId)} aria-controls={`group-detail-desktop-${row.groupId}`} onClick={() => String(selected?.groupId) === String(row.groupId) ? setSelected(null) : openGroup(row)}><span className="strong">{row.name}</span></button> },
          { key: 'description', header: t('common.description'), muted: true, render: (row) => row.description || '-' },
          { key: 'trainer', header: t('common.trainer'), muted: true },
          { key: 'price', header: t('groups.session'), align: 'right', width: 110, render: (row) => row.price == null ? <span className="muted">-</span> : <Money amount={row.price} currency={row.currency} /> },
          { key: 'students', header: t('groups.participants'), align: 'right', width: 110, render: (row) => <button type="button" className="ops-count-button" onClick={() => openGroup(row)}>{row.students}</button> },
          { key: 'active', header: t('common.status'), width: 110, render: (row) => <StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /> },
          { key: 'act', header: '', width: 90, render: (row) => <Button size="sm" variant="subtle" onClick={() => openGroup(row)}>{t('groups.profile')}</Button> },
        ]} /></div>
        <div className="ops-entity-mobile-list">
          {rows.map((row) => (
            <React.Fragment key={row.id}><EntityMobileCard className="ops-group-compact-card" labelledBy={`group-card-${row.id}`}>
              <div className="ops-compact-card-head">
                <button type="button" className="ops-compact-card-title" aria-expanded={String(selected?.groupId) === String(row.groupId)} aria-controls={`group-detail-mobile-${row.groupId}`} onClick={() => String(selected?.groupId) === String(row.groupId) ? setSelected(null) : openGroup(row)}><strong id={`group-card-${row.id}`} title={row.name}>{row.name}</strong></button>
                <ActionPopover label={t('common.actionsFor', { name: row.name })} actions={[
                  { key: 'profile', label: t('debtors.profile'), onSelect: () => openGroup(row) },
                  { key: 'edit', label: t('common.edit'), onSelect: () => { openGroup(row); setEditing(true) } },
                  row.active ? { key: 'archive', label: t('groups.archive'), danger: true, onSelect: () => openArchiveConfirm(row) } : { key: 'restore', label: t('groups.restore'), onSelect: () => restoreGroup(row) },
                ]} />
              </div>
              <div className="ops-compact-card-line"><span>{t('common.trainer')}</span><strong title={row.trainer}>{row.trainer || t('groups.notAssigned')}</strong></div>
              <div className="ops-compact-card-line"><span>{t('groups.nextShort')}</span><strong title={nextSessionLabel(row)}>{nextSessionLabel(row)}</strong></div>
              <div className="ops-compact-card-footer"><span>{t('groups.participantCount', { current: row.students, capacity: row.defaultCapacity ?? '—' })}</span><StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /></div>
            </EntityMobileCard>{isMobile && String(selected?.groupId) === String(row.groupId) && React.cloneElement(groupDetail, { id: `group-detail-mobile-${row.groupId}` })}</React.Fragment>
          ))}
        </div>
        <ListPagination list={groupList} />
        {archiveConfirm && <Dialog title={t('groups.archiveTitle', { name: selected?.name })} description={t('groups.archiveDescription', { sessions: archivePreview?.future_sessions_count ?? 0, participants: archivePreview?.preserved_participants_count ?? 0 })} tone="danger" confirmLabel={t('groups.archive')} onClose={() => busy ? null : setArchiveConfirm(false)} onConfirm={archiveGroup}><div className="strong">{selected?.name}</div></Dialog>}
      </div>
    )
  }
}
