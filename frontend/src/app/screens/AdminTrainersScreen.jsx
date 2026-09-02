import React, { useEffect, useMemo, useState } from 'react'
import { adminLocaleTag, adminTranslator } from '../../adminLocales.js'
import { api, apiErrorMessage } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import { clearFieldError, fieldErrorsFromApi, focusFirstFieldError, formErrorMessage } from '../formErrors.js'
import { BusyBanner } from '../runtime.jsx'
import { FormModal } from '../FormModal.jsx'
import { DateField } from '../DateTimeField.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { AccessButtons, AccessCodeCard } from '../AccessControls.jsx'
import { scheduleColorStyle } from '../schedulePalette.js'
import { validIsoDate } from '../scheduleContracts.js'
import { mapAdminTrainerRows } from '../../mappers.js'
import { ListFeedback, ListPagination, ListToolbar, useScreenList } from '../listFoundation.jsx'
import { ActionPopover, ContextBackButton, EntityMobileCard } from '../EntityListPrimitives.jsx'

const TRAINER_FIELD_IDS = {
  firstName: 'admin-trainer-firstName', lastName: 'admin-trainer-lastName',
  username: 'admin-trainer-username', email: 'admin-trainer-email',
  phone: 'admin-trainer-phone', isActive: 'admin-trainer-active',
}
const RULE_FIELD_IDS = {
  schemeId: 'admin-trainer-payroll-scheme', sessionType: 'admin-trainer-payroll-session-type',
  baseAmount: 'admin-trainer-payroll-base', threshold: 'admin-trainer-payroll-threshold',
  extraAmount: 'admin-trainer-payroll-extra',
}
const PERIOD_FIELD_IDS = {
  dateFrom: 'admin-trainer-payroll-date-from',
  dateTo: 'admin-trainer-payroll-date-to', location: 'admin-trainer-payroll-location',
}

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => `${today().slice(0, 8)}01`
const money = (minor = 0, currency = 'PLN', localeTag = 'ru-RU') => `${(Number(minor) / 100).toLocaleString(localeTag, { minimumFractionDigits: 2 })} ${currency}`

export function createAdminTrainersScreen(components, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Avatar, Button, Banner, Input, Badge, Select, Checkbox, Dialog } = components

  return function ApiAdminTrainers({ go, currentUser }) {
    const { locale } = useLocale()
    const t = useMemo(() => adminTranslator(locale), [locale])
    const localeTag = adminLocaleTag(locale)
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
    const [payroll, setPayroll] = useState({ schemes: [], rules: [], assignments: [], periods: [] })
    const [period, setPeriod] = useState({ dateFrom: monthStart(), dateTo: today(), location: '' })
    const [periodErrors, setPeriodErrors] = useState({})
    const [rule, setRule] = useState({ schemeId: '', sessionType: 'group', baseAmount: '', threshold: '0', extraAmount: '' })
    const [ruleErrors, setRuleErrors] = useState({})
    const [payrollAction, setPayrollAction] = useState(null)
    const [payrollBaseline, setPayrollBaseline] = useState(null)
    const [deactivateConfirm, setDeactivateConfirm] = useState(false)
    const [archivePreview, setArchivePreview] = useState(null)

    const trainerGroups = useMemo(() => groups.filter((group) => String(group.defaultTrainerId) === String(selected?.trainerId)), [groups, selected])
    const trainerSessions = useMemo(() => sessions.filter((session) => String(session.trainerId) === String(selected?.trainerId)), [sessions, selected])
    const trainerAssignments = payroll.assignments.filter((item) => String(item.trainer_id) === String(selected?.trainerId))
    const trainerTotals = payroll.periods.map((item) => ({ ...item, total: item.totals_by_trainer?.find((row) => String(row.trainer_id) === String(selected?.trainerId)) }))
      .filter((item) => item.total)

    useEffect(() => {
      if (!selected || tab !== 'payroll') return
      let active = true
      Promise.all([
        api.get('/api/admin/payroll/schemes/'),
        api.get('/api/admin/payroll/rules/'),
        api.get(`/api/admin/payroll/assignments/?trainer_id=${selected.trainerId}`),
        api.get('/api/admin/payroll/periods/'),
      ]).then(([schemes, rules, assignments, periods]) => {
        if (!active) return
        setPayroll({ schemes: schemes.schemes || [], rules: rules.rules || [], assignments: assignments.assignments || [], periods: periods.periods || [] })
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

    function updateRule(field, value) {
      setRule((current) => ({ ...current, [field]: value }))
      setRuleErrors((current) => clearFieldError(current, field))
    }

    function updatePeriod(field, value) {
      setPeriod((current) => ({ ...current, [field]: value }))
      setPeriodErrors((current) => clearFieldError(current, field))
    }

    async function createSchemeAndRule() {
      const nextErrors = {}
      const baseAmount = Number(String(rule.baseAmount || '').replace(',', '.'))
      const threshold = Number(rule.threshold)
      const extraAmount = Number(String(rule.extraAmount || '').replace(',', '.'))
      if (!Number.isFinite(baseAmount) || baseAmount < 0) nextErrors.baseAmount = t('trainers.baseInvalid')
      if (rule.sessionType === 'group' && (!Number.isInteger(threshold) || threshold < 0)) nextErrors.threshold = t('trainers.thresholdInvalid')
      if (rule.sessionType === 'group' && (!Number.isFinite(extraAmount) || extraAmount < 0)) nextErrors.extraAmount = t('trainers.extraInvalid')
      if (Object.keys(nextErrors).length) {
        setRuleErrors(nextErrors); setError(null)
        focusFirstFieldError(nextErrors, RULE_FIELD_IDS)
        return
      }
      setBusy(true); setError(null); setRuleErrors({})
      try {
        let schemeId = rule.schemeId
        if (!schemeId) {
          const scheme = await api.post('/api/admin/payroll/schemes/', { name: t('trainers.schemeName', { name: selected.name }), location: '' })
          schemeId = scheme.id
          await api.post('/api/admin/payroll/assignments/', { trainer_id: selected.trainerId, scheme_id: schemeId, effective_from: today() })
        }
        await api.post('/api/admin/payroll/rules/', {
          scheme_id: schemeId,
          session_type: rule.sessionType,
          rule_type: rule.sessionType,
          base_amount_minor: Math.round(baseAmount * 100),
          currency: 'PLN',
          min_clients_threshold: rule.sessionType === 'group' ? threshold : null,
          extra_client_amount_minor: rule.sessionType === 'group' ? Math.round(extraAmount * 100) : null,
        })
        setMessage(t('trainers.rateSaved'))
        setRule((current) => ({ ...current, schemeId, baseAmount: '', extraAmount: '' }))
        setPayrollAction(null)
        setPayrollBaseline(null)
        const [rulesPayload, assignmentsPayload] = await Promise.all([
          api.get('/api/admin/payroll/rules/'),
          api.get(`/api/admin/payroll/assignments/?trainer_id=${selected.trainerId}`),
        ])
        setPayroll((current) => ({ ...current, rules: rulesPayload.rules || [], assignments: assignmentsPayload.assignments || [] }))
      } catch (err) {
        const nextFieldErrors = fieldErrorsFromApi(err, {
          scheme_id: 'schemeId', session_type: 'sessionType', rule_type: 'sessionType',
          base_amount_minor: 'baseAmount', min_clients_threshold: 'threshold',
          extra_client_amount_minor: 'extraAmount',
        })
        setRuleErrors(nextFieldErrors)
        setError(formErrorMessage(err, t('trainers.rateError')))
        focusFirstFieldError(nextFieldErrors, RULE_FIELD_IDS)
      } finally { setBusy(false) }
    }

    async function calculatePayroll() {
      const nextErrors = {}
      if (!validIsoDate(period.dateFrom)) nextErrors.dateFrom = t('trainers.startDateInvalid')
      if (!validIsoDate(period.dateTo)) nextErrors.dateTo = t('trainers.endDateInvalid')
      if (validIsoDate(period.dateFrom) && validIsoDate(period.dateTo) && period.dateTo < period.dateFrom) nextErrors.dateTo = t('trainers.dateOrderInvalid')
      if (Object.keys(nextErrors).length) {
        setPeriodErrors(nextErrors); setError(null)
        focusFirstFieldError(nextErrors, PERIOD_FIELD_IDS)
        return
      }
      setBusy(true); setError(null); setPeriodErrors({})
      try {
        const result = await api.post('/api/admin/payroll/periods/', { date_from: period.dateFrom, date_to: period.dateTo, location: period.location })
        setMessage(t('trainers.payrollCreated', { amount: money(result.summary?.total_amount_minor, result.summary?.currency, localeTag) }))
        setPayroll((current) => ({ ...current, periods: [result, ...current.periods.filter((item) => item.id !== result.id)] }))
        setPayrollAction(null)
        setPayrollBaseline(null)
      } catch (err) {
        const nextFieldErrors = fieldErrorsFromApi(err, {
          date_from: 'dateFrom', date_to: 'dateTo', location: 'location',
        })
        setPeriodErrors(nextFieldErrors)
        setError(formErrorMessage(err, t('trainers.payrollError')))
        focusFirstFieldError(nextFieldErrors, PERIOD_FIELD_IDS)
      } finally { setBusy(false) }
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
        <div className="page-head"><div><h1 className="page-title">{t('trainers.title')}</h1><p className="page-desc">{t('trainers.description')}</p></div><Button variant="primary" onClick={() => { const next = { firstName: '', lastName: '', email: '', phone: '', username: '', isActive: true }; setCreating(true); setSelected(null); setFieldErrors({}); setForm(next); setFormBaseline(next) }}>{t('trainers.new')}</Button></div>
        <ToastNotice id="admin-trainer-result" message={message} />
        {error && !creating && !editing && !payrollAction && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>{t('trainers.busy')}</BusyBanner>
        <ListToolbar list={trainerList} searchLabel={t('trainers.search')} searchPlaceholder={t('trainers.searchPlaceholder')}>
          <label>{t('common.status')}<select value={trainerList.draftFilters.active} onChange={(event) => trainerList.setDraftFilter('active', event.target.value)}><option value="">{t('common.all')}</option><option value="true">{t('common.active')}</option><option value="false">{t('common.inactive')}</option></select></label>
        </ListToolbar>
        <FormModal open={creating || editing} title={creating ? t('trainers.new') : t('trainers.edit')} size="lg" busy={busy} dirty={Boolean(formBaseline) && JSON.stringify(form) !== JSON.stringify(formBaseline)} onRequestClose={() => { if (formBaseline) setForm(formBaseline); setCreating(false); setEditing(false); setFormBaseline(null); setFieldErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy} onClick={() => saveTrainer(creating)}>{t('common.save')}</Button></>}>
          {editor}
        </FormModal>

        {selected && !creating && (
          <section className="card ops-entity-card" aria-label={t('trainers.profileAria', { name: selected.name })}>
            <ContextBackButton onClick={() => setSelected(null)}>{t('trainers.back')}</ContextBackButton>
            <div className="ops-entity-head"><div className="ops-entity-person"><Avatar name={selected.name} size={44} /><div><h3>{selected.name}</h3><div className="muted">{selected.email || t('trainers.emailMissing')} · {selected.phone || t('trainers.phoneMissing')}</div></div></div><div className="ops-button-row"><StatusPill status={selected.active ? 'active' : 'inactive'} />{selected.active && <AccessButtons Button={Button} portalAccess={selected.portalAccess} accessActivated={selected.accessActivated} busy={busy} onAction={accessAction} />}<Button variant="secondary" onClick={() => { setEditing(true); setFormBaseline({ ...form }) }}>{t('groups.editAction')}</Button>{selected.active ? <Button variant="danger" disabled={busy} onClick={() => openArchiveConfirm()}>{t('trainers.archive')}</Button> : <Button variant="primary" disabled={busy} onClick={() => restoreTrainer()}>{t('trainers.restore')}</Button>}</div></div>
            <AccessCodeCard info={accessInfo} Button={Button} />
            <div className="ops-tabs" role="tablist">{[['profile', t('trainers.overview')], ['schedule', t('trainers.scheduleCount', { count: trainerSessions.length })], ['payroll', t('trainers.payrollTab')]].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
            {tab === 'profile' && <div className="ops-detail-grid"><div><div className="eyebrow">{t('common.groups')}</div>{trainerGroups.map((group) => <button key={group.id} className="ops-detail-row" type="button" onClick={() => go?.('groups', { groupId: group.groupId })}><strong>{group.name}</strong><span>{t('trainers.groupCount', { count: group.students })}</span></button>)}{!trainerGroups.length && <div className="empty">{t('trainers.noGroups')}</div>}</div><div><div className="eyebrow">{t('trainers.upcoming')}</div>{trainerSessions.slice(0, 5).map((session) => <button key={session.id} type="button" className="ops-detail-row" onClick={() => go?.('attendance', { sessionId: session.sessionId })}><strong>{session.date} · {session.start}</strong><span>{session.group} · {session.location}</span></button>)}{!trainerSessions.length && <div className="empty">{t('trainers.noSessions')}</div>}</div></div>}
            {tab === 'schedule' && <div className="ops-card-list">{trainerSessions.map((session) => <button key={session.id} type="button" className={`ops-session-tile${session.isCancelled ? ' is-cancelled' : ''}`} data-color-key={session.colorKey} style={scheduleColorStyle(session.colorKey)} onClick={() => go?.('attendance', { sessionId: session.sessionId })}><span><strong>{session.date} · {session.start}-{session.end}</strong><small>{session.group} · {session.location}</small></span><Badge tone={session.isCancelled ? 'danger' : 'primary'}>{session.isCancelled ? t('trainers.cancelled') : t('trainers.openSession')}</Badge></button>)}{!trainerSessions.length && <div className="empty">{t('trainers.scheduleEmpty')}</div>}</div>}
            {tab === 'payroll' && <div className="ops-detail-grid">
              <div><div className="ops-section-head"><div className="eyebrow">{t('trainers.rates')}</div><Button size="sm" variant="primary" onClick={() => { setPayrollAction('rule'); setPayrollBaseline({ ...rule }) }}>{t('trainers.createRate')}</Button></div>{payroll.rules.filter((item) => trainerAssignments.some((assignment) => assignment.scheme_id === item.scheme_id)).map((item) => <div className="ops-detail-row" key={item.id}><strong>{{ group: t('trainers.typeGroup'), individual: t('trainers.typeIndividual'), split: t('trainers.typeSplit') }[item.session_type]}</strong><span>{money(item.base_amount_minor, item.currency, localeTag)}{item.session_type === 'group' ? t('trainers.extraAfter', { amount: money(item.extra_client_amount_minor, item.currency, localeTag), threshold: item.min_clients_threshold }) : ''}</span></div>)}</div>
              <div><div className="ops-section-head"><div className="eyebrow">{t('trainers.payrollCalculations')}</div><Button size="sm" variant="primary" onClick={() => { setPayrollAction('period'); setPayrollBaseline({ ...period }) }}>{t('trainers.calculatePeriod')}</Button></div>{trainerTotals.map((item) => <div className="ops-detail-row" key={item.id}><strong>{item.date_from} - {item.date_to}</strong><span>{money(item.total.total_amount_minor, item.total.currency, localeTag)}</span></div>)}</div>
            </div>}
          </section>
        )}

        <FormModal open={payrollAction === 'rule'} title={t('trainers.rateTitle')} size="sm" busy={busy} dirty={Boolean(payrollBaseline) && JSON.stringify(rule) !== JSON.stringify(payrollBaseline)} onRequestClose={() => { if (payrollBaseline) setRule(payrollBaseline); setPayrollAction(null); setPayrollBaseline(null); setRuleErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy || !rule.baseAmount} onClick={createSchemeAndRule}>{t('trainers.saveRate')}</Button></>}>
          {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
          <div className="ops-form-stack">
            <Select id={RULE_FIELD_IDS.schemeId} label={t('trainers.scheme')} value={rule.schemeId} error={ruleErrors.schemeId} onChange={(event) => updateRule('schemeId', event.target.value)}><option value="">{t('trainers.createScheme')}</option>{payroll.schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.name}</option>)}</Select>
            <Select id={RULE_FIELD_IDS.sessionType} label={t('trainers.sessionType')} value={rule.sessionType} error={ruleErrors.sessionType} onChange={(event) => updateRule('sessionType', event.target.value)}><option value="group">{t('trainers.typeGroup')}</option><option value="individual">{t('trainers.typeIndividual')}</option><option value="split">{t('trainers.typeSplit')}</option></Select>
            <Input id={RULE_FIELD_IDS.baseAmount} label={t('trainers.baseAmount')} value={rule.baseAmount} error={ruleErrors.baseAmount} onChange={(event) => updateRule('baseAmount', event.target.value)} />
            {rule.sessionType === 'group' && <><Input id={RULE_FIELD_IDS.threshold} label={t('trainers.threshold')} value={rule.threshold} error={ruleErrors.threshold} onChange={(event) => updateRule('threshold', event.target.value)} /><Input id={RULE_FIELD_IDS.extraAmount} label={t('trainers.extraAmount')} value={rule.extraAmount} error={ruleErrors.extraAmount} onChange={(event) => updateRule('extraAmount', event.target.value)} /></>}
          </div>
        </FormModal>

        <FormModal open={payrollAction === 'period'} title={t('trainers.calculatePayroll')} size="sm" busy={busy} dirty={Boolean(payrollBaseline) && JSON.stringify(period) !== JSON.stringify(payrollBaseline)} onRequestClose={() => { if (payrollBaseline) setPeriod(payrollBaseline); setPayrollAction(null); setPayrollBaseline(null); setPeriodErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" disabled={busy} onClick={calculatePayroll}>{t('trainers.calculate')}</Button></>}>
          {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
          <div className="ops-form-stack">
            <DateField id={PERIOD_FIELD_IDS.dateFrom} label={t('trainers.dateFrom')} value={period.dateFrom} error={periodErrors.dateFrom} onChange={(value) => updatePeriod('dateFrom', value)} />
            <DateField id={PERIOD_FIELD_IDS.dateTo} label={t('trainers.dateTo')} value={period.dateTo} error={periodErrors.dateTo} onChange={(value) => updatePeriod('dateTo', value)} />
            <Input id={PERIOD_FIELD_IDS.location} label={t('trainers.locationOptional')} value={period.location} error={periodErrors.location} onChange={(event) => updatePeriod('location', event.target.value)} />
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
        {deactivateConfirm && <Dialog title={t('trainers.archiveTitle', { name: selected?.name })} description={t('trainers.archiveDescription', { sessions: archivePreview?.future_sessions_count ?? 0, groups: archivePreview?.default_groups_count ?? 0 })} tone="danger" confirmLabel={t('trainers.archive')} onClose={() => busy ? null : setDeactivateConfirm(false)} onConfirm={deactivateTrainer}><div className="strong">{selected?.name}</div></Dialog>}
      </div>
    )
  }
}
