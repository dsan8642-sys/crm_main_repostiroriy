import React, { useEffect, useMemo, useState } from 'react'
import { adminTranslator } from '../../adminLocales.js'
import { api, apiErrorMessage } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import { clearFieldError, fieldErrorsFromApi, focusFirstFieldError, formErrorMessage } from '../formErrors.js'
import { BusyBanner } from '../runtime.jsx'
import { FormModal } from '../FormModal.jsx'
import { DateField } from '../DateTimeField.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { AccessButtons, AccessCodeCard } from '../AccessControls.jsx'
import { scheduleColorStyle } from '../schedulePalette.js'
import { mapAdminTrainerRows } from '../../mappers.js'
import { ListFeedback, ListPagination, ListToolbar, useScreenList } from '../listFoundation.jsx'
import { ActionPopover, ContextBackButton, EntityMobileCard } from '../EntityListPrimitives.jsx'

const TRAINER_FIELD_IDS = {
  firstName: 'admin-trainer-firstName', lastName: 'admin-trainer-lastName',
  username: 'admin-trainer-username', email: 'admin-trainer-email',
  phone: 'admin-trainer-phone', isActive: 'admin-trainer-active',
}
const today = () => new Date().toLocaleDateString('en-CA')

export function createAdminTrainersScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Avatar, Button, Banner, Input, Badge, Select, Checkbox, Dialog } = components
  const I = icons

  return function ApiAdminTrainers({ go, currentUser }) {
    const { locale } = useLocale()
    const t = useMemo(() => adminTranslator(locale), [locale])
    const trainerList = useScreenList({
      path: '/api/admin/trainers/',
      itemKey: 'trainers',
      mapRows: mapAdminTrainerRows,
      role: 'admin',
      route: 'trainers',
      userKey: currentUser?.id || currentUser?.username,
      initialFilters: { active: '' },
      defaultOrder: 'name',
    })
    const rows = trainerList.rows
    const groups = adminData.groups || []
    const sessions = adminData.sessions || []
    const locations = (adminData.locations || []).filter((location) => location.isActive !== false && location.is_active !== false)
    const [selected, setSelected] = useState(null)
    const [tab, setTab] = useState('profile')
    const [creating, setCreating] = useState(false)
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', username: '', isActive: true })
    const [formBaseline, setFormBaseline] = useState(null)
    const [fieldErrors, setFieldErrors] = useState({})
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const [accessInfo, setAccessInfo] = useState(null)
    const [payroll, setPayroll] = useState({ rates: [], assignments: [] })
    const [rateAssignment, setRateAssignment] = useState({ rateId: '', location: '', effectiveFrom: today(), confirmed: false })
    const [payrollAction, setPayrollAction] = useState(null)
    const [deactivateConfirm, setDeactivateConfirm] = useState(false)
    const [archivePreview, setArchivePreview] = useState(null)

    const trainerGroups = useMemo(() => groups.filter((group) => String(group.defaultTrainerId) === String(selected?.trainerId)), [groups, selected])
    const trainerSessions = useMemo(() => sessions.filter((session) => String(session.trainerId) === String(selected?.trainerId)), [sessions, selected])
    const trainerAssignments = payroll.assignments.filter((item) => String(item.trainer_id) === String(selected?.trainerId))

    useEffect(() => {
      if (!selected || tab !== 'payroll') return
      let active = true
      Promise.all([
        api.get('/api/admin/payroll/rates/'),
        api.get(`/api/admin/payroll/assignments/?trainer_id=${selected.trainerId}`),
      ]).then(([rates, assignments]) => {
        if (!active) return
        setPayroll({ rates: rates.rates || [], assignments: assignments.assignments || [] })
      }).catch((err) => active && setError(apiErrorMessage(err, t('trainers.loadPayrollError'))))
      return () => { active = false }
    }, [selected, tab, t])

    function openTrainer(row) {
      const parts = String(row.name || '').trim().split(/\s+/)
      setSelected(row)
      setTab('profile')
      setEditing(false)
      setAccessInfo(null)
      setFieldErrors({})
      const next = { firstName: parts[0] || '', lastName: parts.slice(1).join(' '), email: row.email || '', phone: row.phone || '', username: row.username || '', isActive: row.active }
      setForm(next)
      setFormBaseline(next)
    }

    async function saveTrainer(isNew = false) {
      setBusy(true); setError(null)
      setFieldErrors({})
      try {
        const payload = { trainer: { first_name: form.firstName, last_name: form.lastName, email: form.email, phone: form.phone, username: form.username || form.email, is_active: form.isActive, user_is_active: form.isActive } }
        const saved = isNew
          ? await api.post('/api/admin/trainers/', payload)
          : await api.post(`/api/admin/trainers/${selected.trainerId}/`, payload)
        if (!isNew) setSelected(mapAdminTrainerRows([saved])[0])
        setMessage(isNew ? t('trainers.created') : t('trainers.updated'))
        setCreating(false); setEditing(false)
        setFormBaseline(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, {
          'trainer.first_name': 'firstName',
          'trainer.last_name': 'lastName',
          'trainer.email': 'email',
          'trainer.phone': 'phone',
          'trainer.username': 'username',
          'trainer.is_active': 'isActive',
        })
        setFieldErrors(nextErrors)
        setError(formErrorMessage(err, t('trainers.saveError')))
        focusFirstFieldError(nextErrors, TRAINER_FIELD_IDS)
      } finally { setBusy(false) }
    }

    function updateTrainerForm(field, value) {
      setFieldErrors((current) => clearFieldError(current, field))
      setForm((current) => ({ ...current, [field]: value }))
    }

    async function assignExistingRate() {
      const type = payroll.rates.find((rate) => String(rate.id) === String(rateAssignment.rateId))?.session_type
      if (!rateAssignment.confirmed && trainerAssignments.some((item) => item.session_type === type && item.location === rateAssignment.location && (!item.effective_to || item.effective_to >= rateAssignment.effectiveFrom))) {
        setRateAssignment((current) => ({ ...current, confirmed: true }))
        return
      }
      setBusy(true); setError(null)
      try {
        await api.post('/api/admin/payroll/assign-rates/', {
          rate_id: Number(rateAssignment.rateId), trainer_ids: [selected.trainerId],
          location: rateAssignment.location, effective_from: rateAssignment.effectiveFrom,
        })
        const assignments = await api.get(`/api/admin/payroll/assignments/?trainer_id=${selected.trainerId}`)
        setPayroll((current) => ({ ...current, assignments: assignments.assignments || [] }))
        setPayrollAction(null)
        setMessage(t('trainers.rateAssigned'))
      } catch (err) { setError(formErrorMessage(err, t('trainers.assignError'))) }
      finally { setBusy(false) }
    }

    async function accessAction(action) {
      if (!selected) return
      setBusy(true); setError(null); setAccessInfo(null)
      try {
        const payload = await api.post(`/api/admin/trainers/${selected.trainerId}/access/${action}/`)
        if (action === 'revoke') {
          setSelected((current) => ({ ...current, portalAccess: 'revoked' }))
          setMessage(t('trainers.accessRevoked'))
        } else {
          setAccessInfo(payload)
          setSelected((current) => ({ ...current, accessActivated: true, portalAccess: 'active' }))
        }
        await reloadRoleData?.('admin')
      } catch (err) { setError(apiErrorMessage(err, t('trainers.accessError'))) } finally { setBusy(false) }
    }

    async function deactivateTrainer() {
      if (!selected?.trainerId) return
      setBusy(true); setError(null)
      try {
        const result = await api.delete(`/api/admin/trainers/${selected.trainerId}/`)
        setSelected((current) => ({ ...current, active: false, portalAccess: 'revoked' }))
        setForm((current) => ({ ...current, isActive: false }))
        setMessage(t('trainers.archivedResult', { name: selected.name, sessions: result.future_sessions_count, groups: result.cleared_default_groups_count }))
        setDeactivateConfirm(false)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, t('trainers.deactivateError')))
      } finally {
        setBusy(false)
      }
    }

    async function openArchiveConfirm(row = selected) {
      if (!row?.trainerId) return
      setBusy(true); setError(null)
      try {
        const preview = await api.get(`/api/admin/trainers/${row.trainerId}/`)
        openTrainer(row)
        setArchivePreview(preview)
        setDeactivateConfirm(true)
      } catch (err) {
        setError(apiErrorMessage(err, t('trainers.deactivateError')))
      } finally { setBusy(false) }
    }

    async function restoreTrainer(row = selected) {
      if (!row?.trainerId) return
      setBusy(true); setError(null)
      try {
        await api.post(`/api/admin/trainers/${row.trainerId}/restore/`, {})
        setSelected((current) => current && String(current.trainerId) === String(row.trainerId) ? { ...current, active: true, portalAccess: 'active' } : current)
        setMessage(t('trainers.restored', { name: row.name }))
        window.dispatchEvent(new CustomEvent('swimcrm:list-invalidate', { detail: { role: 'admin' } }))
        await reloadRoleData?.('admin')
      } catch (err) { setError(apiErrorMessage(err, t('trainers.restoreError'))) } finally { setBusy(false) }
    }

    const editor = (
      <>
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <div className="ops-form-grid">
          <Input id={TRAINER_FIELD_IDS.firstName} label={t('trainers.firstName')} value={form.firstName} error={fieldErrors.firstName} onChange={(event) => updateTrainerForm('firstName', event.target.value)} />
          <Input id={TRAINER_FIELD_IDS.lastName} label={t('trainers.lastName')} value={form.lastName} error={fieldErrors.lastName} onChange={(event) => updateTrainerForm('lastName', event.target.value)} />
          <Input id={TRAINER_FIELD_IDS.username} label={t('trainers.login')} value={form.username} error={fieldErrors.username} onChange={(event) => updateTrainerForm('username', event.target.value)} />
          <Input id={TRAINER_FIELD_IDS.email} label="Email" value={form.email} error={fieldErrors.email} onChange={(event) => updateTrainerForm('email', event.target.value)} />
          <Input id={TRAINER_FIELD_IDS.phone} label={t('common.phone')} value={form.phone} error={fieldErrors.phone} onChange={(event) => updateTrainerForm('phone', event.target.value)} />
          <Checkbox id={TRAINER_FIELD_IDS.isActive} label={t('trainers.active')} checked={form.isActive} error={fieldErrors.isActive} onChange={(event) => updateTrainerForm('isActive', event.target.checked)} />
        </div>
      </>
    )

    return (
      <div className="page page-wide">
        <div className="page-head"><div><h1 className="page-title">{t('trainers.title')}</h1><p className="page-desc">{t('trainers.description')}</p></div><Button variant="primary" iconLeft={<I.TrainerPlus size={18} aria-hidden="true" />} onClick={() => { const next = { firstName: '', lastName: '', email: '', phone: '', username: '', isActive: true }; setCreating(true); setSelected(null); setFieldErrors({}); setForm(next); setFormBaseline(next) }}>{t('trainers.new')}</Button></div>
        <ToastNotice id="admin-trainer-result" message={message} />
        {error && !creating && !editing && !payrollAction && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>{t('trainers.busy')}</BusyBanner>
        <ListToolbar list={trainerList} searchLabel={t('trainers.search')} searchPlaceholder={t('trainers.searchPlaceholder')}>
          <label>{t('common.status')}<select value={trainerList.draftFilters.active} onChange={(event) => trainerList.setDraftFilter('active', event.target.value)}><option value="">{t('common.all')}</option><option value="true">{t('common.active')}</option><option value="false">{t('common.inactive')}</option></select></label>
        </ListToolbar>
        <FormModal open={creating || editing} title={creating ? t('trainers.new') : t('trainers.edit')} size="lg" busy={busy} dirty={Boolean(formBaseline) && JSON.stringify(form) !== JSON.stringify(formBaseline)} onRequestClose={() => { if (formBaseline) setForm(formBaseline); setCreating(false); setEditing(false); setFormBaseline(null); setFieldErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" data-testid="admin-trainer-save" disabled={busy} onClick={() => saveTrainer(creating)}>{t('common.save')}</Button></>}>
          {editor}
        </FormModal>

        {selected && !creating && (
          <section className="card ops-entity-card ops-trainer-profile-card" aria-label={t('trainers.profileAria', { name: selected.name })}>
            <ContextBackButton onClick={() => setSelected(null)}>{t('trainers.back')}</ContextBackButton>
            <div className="ops-entity-head"><div className="ops-entity-person"><Avatar name={selected.name} size={44} /><div><h3>{selected.name}</h3><div className="muted">{selected.email || t('trainers.emailMissing')} · {selected.phone || t('trainers.phoneMissing')}</div></div></div><div className="ops-button-row"><StatusPill status={selected.active ? 'active' : 'inactive'} />{selected.active && <AccessButtons Button={Button} portalAccess={selected.portalAccess} accessActivated={selected.accessActivated} busy={busy} onAction={accessAction} />}<Button variant="secondary" data-testid="admin-trainer-edit" onClick={() => { setEditing(true); setFormBaseline({ ...form }) }}>{t('groups.editAction')}</Button>{selected.active ? <Button variant="danger" disabled={busy} onClick={() => openArchiveConfirm()}>{t('trainers.archive')}</Button> : <Button variant="primary" disabled={busy} onClick={() => restoreTrainer()}>{t('trainers.restore')}</Button>}</div></div>
            <AccessCodeCard info={accessInfo} Button={Button} />
            <div className="ops-tabs" role="tablist">{[['profile', t('trainers.overview')], ['schedule', t('trainers.scheduleCount', { count: trainerSessions.length })], ['payroll', t('trainers.payrollTab')]].map(([value, label]) => <button key={value} type="button" data-testid={`admin-trainer-tab-${value}`} role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
            {tab === 'profile' && <div className="ops-detail-grid"><div><div className="eyebrow">{t('common.groups')}</div><div className="ops-trainer-group-list">{trainerGroups.map((group) => <button key={group.id} className="ops-detail-row ops-trainer-group-link" type="button" data-color-key={group.hasScheduleColor ? group.colorKey : 'uncolored'} style={group.hasScheduleColor ? scheduleColorStyle(group.colorKey) : undefined} onClick={() => go?.('groups', { groupId: group.groupId })}><strong>{group.name}</strong><span className="ops-trainer-group-count">{t('trainers.groupCount', { count: group.students })}</span></button>)}{!trainerGroups.length && <div className="empty">{t('trainers.noGroups')}</div>}</div></div><div><div className="eyebrow">{t('trainers.upcoming')}</div>{trainerSessions.slice(0, 5).map((session) => <button key={session.id} type="button" className="ops-detail-row" onClick={() => go?.('attendance', { sessionId: session.sessionId })}><strong>{session.date} · {session.start}</strong><span>{session.group} · {session.location}</span></button>)}{!trainerSessions.length && <div className="empty">{t('trainers.noSessions')}</div>}</div></div>}
            {tab === 'schedule' && <div className="ops-card-list">{trainerSessions.map((session) => <button key={session.id} type="button" className={`ops-session-tile${session.isCancelled ? ' is-cancelled' : ''}`} data-color-key={session.colorKey} style={scheduleColorStyle(session.colorKey)} onClick={() => go?.('attendance', { sessionId: session.sessionId })}><span><strong>{session.date} · {session.start}-{session.end}</strong><small>{session.group} · {session.location}</small></span><Badge tone={session.isCancelled ? 'danger' : 'primary'}>{session.isCancelled ? t('trainers.cancelled') : t('trainers.openSession')}</Badge></button>)}{!trainerSessions.length && <div className="empty">{t('trainers.scheduleEmpty')}</div>}</div>}
            {tab === 'payroll' && <div className="ops-form-stack">
              <div className="ops-section-head"><strong>{t('trainers.assignedRates')}</strong><Button size="sm" variant="primary" onClick={() => { setRateAssignment({ rateId: '', location: '', effectiveFrom: today(), confirmed: false }); setPayrollAction('assign') }}>{t('trainers.assignRate')}</Button></div>
              {trainerAssignments.map((item) => <div className="ops-detail-row" key={item.id}><strong>{item.rate} · {t(`trainers.type${item.session_type === 'group' ? 'Group' : item.session_type === 'individual' ? 'Individual' : 'Split'}`)}</strong><span>{item.location || t('trainers.allLocations')} · {item.effective_from}{item.effective_to ? ` — ${item.effective_to}` : ''}</span></div>)}
              {!trainerAssignments.length && <p className="muted">{t('trainers.noRate')}</p>}
            </div>}
          </section>
        )}

        <FormModal open={payrollAction === 'assign'} title={t('trainers.assignRate')} size="sm" busy={busy} onRequestClose={() => { setPayrollAction(null); setError(null) }} footer={<><Button variant="secondary" onClick={() => setPayrollAction(null)}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || !rateAssignment.rateId} onClick={assignExistingRate}>{t(rateAssignment.confirmed ? 'trainers.confirmReplaceRate' : 'common.save')}</Button></>}>
          {error && <Banner tone="danger" onClose={() => setError(null)}>{error}</Banner>}
          <div className="ops-form-stack">
            <Select id="trainer-payroll-rate" label={t('trainers.rateTitle')} value={rateAssignment.rateId} onChange={(event) => setRateAssignment((current) => ({ ...current, rateId: event.target.value, confirmed: false }))}><option value="">{t('trainers.selectRate')}</option>{payroll.rates.filter((rate) => rate.is_active).map((rate) => <option key={rate.id} value={rate.id}>{rate.name}</option>)}</Select>
            <Select id="trainer-payroll-location" label={t('settings.field.location')} value={rateAssignment.location} onChange={(event) => setRateAssignment((current) => ({ ...current, location: event.target.value, confirmed: false }))}><option value="">{t('trainers.allLocations')}</option>{locations.map((location) => <option key={location.id || location.name} value={location.name}>{location.name}</option>)}</Select>
            <DateField id="trainer-payroll-from" label={t('trainers.applyFrom')} value={rateAssignment.effectiveFrom} onChange={(value) => setRateAssignment((current) => ({ ...current, effectiveFrom: value, confirmed: false }))} />
            {rateAssignment.confirmed && <p role="alert">{t('trainers.replaceWarning')}</p>}
          </div>
        </FormModal>
        <ListFeedback list={trainerList} emptyLabel={t('trainers.empty')} />
        <div className="ops-entity-desktop-table ops-trainer-list-scroll"><Table rows={rows} emptyLabel={t('trainers.empty')} columns={[
          { key: 'name', header: t('common.trainer'), render: (row) => <button type="button" className="ops-link-button" onClick={() => openTrainer(row)}><Avatar name={row.name} size={28} /><span className="strong">{row.name}</span></button> },
          { key: 'email', header: 'Email', muted: true, render: (row) => row.email || '-' },
          { key: 'phone', header: t('common.phone'), muted: true, render: (row) => <span className="mono">{row.phone || '-'}</span> },
          { key: 'groups', header: t('common.groups'), align: 'right', width: 90, render: (row) => <button type="button" className="ops-count-button" onClick={() => openTrainer(row)}>{row.groups}</button> },
          { key: 'active', header: t('common.status'), width: 110, render: (row) => <StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /> },
          { key: 'act', header: '', width: 90, render: (row) => <Button size="sm" variant="subtle" onClick={() => openTrainer(row)}>{t('trainers.profile')}</Button> },
        ]} /></div>
        <div className="ops-entity-mobile-list">
          {rows.map((row) => (
            <EntityMobileCard key={row.id} className="ops-trainer-compact-card" labelledBy={`trainer-card-${row.id}`}>
              <div className="ops-compact-card-head">
                <button type="button" className="ops-compact-card-title with-avatar" onClick={() => openTrainer(row)}><Avatar name={row.name} size={34} /><strong id={`trainer-card-${row.id}`} title={row.name}>{row.name}</strong></button>
                <ActionPopover label={t('common.actionsFor', { name: row.name })} actions={[
                  { key: 'profile', label: t('trainers.profile'), onSelect: () => openTrainer(row) },
                  { key: 'edit', label: t('common.edit'), onSelect: () => { openTrainer(row); setEditing(true) } },
                  row.active
                    ? { key: 'archive', label: t('trainers.archive'), danger: true, onSelect: () => openArchiveConfirm(row) }
                    : { key: 'restore', label: t('trainers.restore'), onSelect: () => restoreTrainer(row) },
                ]} />
              </div>
              <div className="ops-compact-card-line"><span>{t('common.phone')}</span><strong className="mono" title={row.phone || ''}>{row.phone || '—'}</strong></div>
              <div className="ops-compact-card-footer"><span>{t('trainers.activeGroups', { count: row.groups ?? 0 })}</span><StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /></div>
            </EntityMobileCard>
          ))}
        </div>
        <ListPagination list={trainerList} />
        <Dialog open={Boolean(deactivateConfirm)} title={t('trainers.archiveTitle', { name: selected?.name })} description={t('trainers.archiveDescription', { sessions: archivePreview?.future_sessions_count ?? 0, groups: archivePreview?.default_groups_count ?? 0 })} tone="danger" confirmLabel={t('trainers.archive')} onClose={() => busy ? null : setDeactivateConfirm(false)} onConfirm={deactivateTrainer}><div className="strong">{selected?.name}</div></Dialog>
      </div>
    )
  }
}
