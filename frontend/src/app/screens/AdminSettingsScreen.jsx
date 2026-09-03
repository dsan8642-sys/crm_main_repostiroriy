import React, { useEffect, useMemo, useState } from 'react'
import { adminTranslator } from '../../adminLocales.js'
import { api, apiErrorMessage, fetchAllPages } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import { DateField, TimeField } from '../DateTimeField.jsx'
import { FormModal } from '../FormModal.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { createAdminImportExportPanel } from './AdminImportExportScreen.jsx'
import { createAdminReportsPanel } from './AdminReportsPanel.jsx'
import { ScheduleColorPicker } from '../ScheduleColorPicker.jsx'
import { normalizeScheduleColorKey } from '../schedulePalette.js'
import { ContextBackButton } from '../EntityListPrimitives.jsx'
import {
  clearFieldError,
  fieldErrorsFromApi,
  focusFirstFieldError,
  formErrorMessage,
} from '../formErrors.js'

const CREDENTIAL_FIELD_MAP = {
  username: 'username',
  current_password: 'currentPassword',
  new_password: 'newPassword',
}
const CREDENTIAL_FIELD_IDS = {
  username: 'admin-credentials-username',
  currentPassword: 'admin-credentials-current-password',
  newPassword: 'admin-credentials-new-password',
  confirmPassword: 'admin-credentials-confirm-password',
}
const ADMINISTRATOR_FIELD_MAP = {
  full_name: 'fullName', username: 'username', email: 'email', password: 'password', current_password: 'currentPassword',
}
const ADMINISTRATOR_FIELD_IDS = {
  fullName: 'admin-access-full-name', username: 'admin-access-username', email: 'admin-access-email',
  password: 'admin-access-password', confirmPassword: 'admin-access-confirm-password', currentPassword: 'admin-access-current-password',
}

const eventTypes = [
  ['payment_reminder', 'settings.event.paymentReminder'], ['session_reminder', 'settings.event.sessionReminder'],
  ['subscription_end', 'settings.event.subscriptionEnd'], ['renewal_needed', 'settings.event.renewalNeeded'],
  ['schedule_change', 'settings.event.scheduleChange'], ['mass_mailing', 'settings.event.massMailing'],
]
const channels = [['email', 'Email'], ['telegram', 'Telegram'], ['sms', 'SMS']]
const sessionTypes = [['group', 'settings.session.group'], ['individual', 'settings.session.individual'], ['split', 'settings.session.split']]

const resources = [
  { tab: 'catalog', id: 'subscriptionTypes', title: 'settings.resource.subscriptionTypes', endpoint: '/api/admin/subscription-types/', response: 'subscription_types', detail: (id) => `/api/admin/subscription-types/${id}/`, fields: [['name', 'settings.field.name'], ['price_minor', 'settings.field.priceMinor', 'number'], ['currency', 'settings.field.currency'], ['duration_days', 'settings.field.durationDays', 'number'], ['sessions_count', 'settings.field.sessionsCount', 'number'], ['is_individual', 'settings.field.individual', 'boolean'], ['is_active', 'settings.field.active', 'boolean']] },
  { tab: 'catalog', id: 'locations', title: 'settings.resource.locations', endpoint: '/api/admin/settings/locations/', response: 'locations', detail: (id) => `/api/admin/settings/locations/${id}/`, fields: [['code', 'settings.field.code'], ['name', 'settings.field.name'], ['address', 'settings.field.address'], ['timezone', 'settings.field.timezone'], ['is_active', 'settings.field.active', 'boolean']] },
  { tab: 'catalog', id: 'sessionTypes', title: 'settings.resource.sessionTypes', endpoint: '/api/admin/settings/session-types/', response: 'session_types', detail: (id) => `/api/admin/settings/session-types/${id}/`, fields: [['code', 'settings.field.type', 'select', sessionTypes], ['label', 'settings.field.name'], ['default_capacity', 'settings.field.defaultCapacity', 'number'], ['default_price_minor', 'settings.field.defaultPriceMinor', 'number'], ['default_currency', 'settings.field.currency'], ['default_duration_minutes', 'settings.field.durationMinutes', 'number'], ['color_key', 'settings.field.scheduleColor', 'schedule-color'], ['is_active', 'settings.field.active', 'boolean']] },
  { tab: 'notifications', id: 'templates', title: 'settings.resource.templates', endpoint: '/api/admin/notifications/templates/', response: 'templates', detail: (id) => `/api/admin/notifications/templates/${id}/`, fields: [['event_type', 'settings.field.event', 'select', eventTypes], ['channel', 'settings.field.channel', 'select', channels], ['subject', 'settings.field.subject'], ['body', 'settings.field.body', 'textarea']] },
  { tab: 'notifications', id: 'rules', title: 'settings.resource.rules', endpoint: '/api/admin/notifications/rules/', response: 'rules', detail: (id) => `/api/admin/notifications/rules/${id}/`, fields: [['event_type', 'settings.field.event', 'select', eventTypes], ['channel', 'settings.field.channel', 'select', channels], ['template_id', 'settings.field.template', 'select-ref', 'templates'], ['offset_minutes', 'settings.field.offsetMinutes', 'number'], ['is_active', 'settings.field.active', 'boolean']] },
  { tab: 'notifications', id: 'quietHours', title: 'settings.resource.quietHours', endpoint: '/api/admin/notifications/quiet-hours/', response: 'policies', detail: (id) => `/api/admin/notifications/quiet-hours/${id}/`, fields: [['channel', 'settings.field.channel', 'select', channels], ['starts_at', 'settings.field.from', 'time'], ['ends_at', 'settings.field.to', 'time'], ['timezone', 'settings.field.timezone'], ['is_active', 'settings.field.active', 'boolean']] },
  { tab: 'notifications', id: 'notificationTranslations', title: 'settings.resource.notificationTranslations', endpoint: '/api/admin/settings/notification-template-translations/', response: 'translations', detail: (id) => `/api/admin/settings/notification-template-translations/${id}/`, fields: [['template_id', 'settings.field.template', 'select-ref', 'templates'], ['language_code', 'settings.field.language', 'select-ref', 'languages', 'code'], ['subject', 'settings.field.subject'], ['body', 'settings.field.body', 'textarea']] },
  { tab: 'payroll', id: 'schemes', title: 'settings.resource.schemes', endpoint: '/api/admin/payroll/schemes/', response: 'schemes', detail: (id) => `/api/admin/payroll/schemes/${id}/`, fields: [['name', 'settings.field.name'], ['location', 'settings.field.location'], ['is_active', 'settings.field.active', 'boolean']] },
  { tab: 'payroll', id: 'payrollRules', title: 'settings.resource.payrollRules', endpoint: '/api/admin/payroll/rules/', response: 'rules', detail: (id) => `/api/admin/payroll/rules/${id}/`, fields: [['scheme_id', 'settings.field.scheme', 'select-ref', 'schemes'], ['session_type', 'settings.field.sessionType', 'select', sessionTypes], ['rule_type', 'settings.field.ruleType', 'select', sessionTypes], ['base_amount_minor', 'settings.field.baseAmountMinor', 'number'], ['currency', 'settings.field.currency'], ['min_clients_threshold', 'settings.field.minClients', 'number'], ['extra_client_amount_minor', 'settings.field.extraClientMinor', 'number'], ['is_active', 'settings.field.active', 'boolean']] },
  { tab: 'payroll', id: 'assignments', title: 'settings.resource.assignments', endpoint: '/api/admin/payroll/assignments/', response: 'assignments', detail: (id) => `/api/admin/payroll/assignments/${id}/`, fields: [['trainer_id', 'settings.field.trainer', 'select-ref', 'trainers'], ['scheme_id', 'settings.field.scheme', 'select-ref', 'schemes'], ['effective_from', 'settings.field.effectiveFrom', 'date'], ['effective_to', 'settings.field.effectiveTo', 'date']] },
  { tab: 'payroll', id: 'periods', title: 'settings.resource.periods', endpoint: '/api/admin/payroll/periods/', response: 'periods', readOnly: true },
  { tab: 'localization', id: 'languages', title: 'settings.resource.languages', endpoint: '/api/admin/settings/languages/', response: 'languages', detail: (id) => `/api/admin/settings/languages/${id}/`, fields: [['code', 'settings.field.code'], ['name', 'settings.field.name'], ['is_active', 'settings.field.active', 'boolean']] },
  { tab: 'localization', id: 'dictionaryKeys', title: 'settings.resource.dictionaryKeys', endpoint: '/api/admin/settings/dictionary-keys/', response: 'keys', detail: (id) => `/api/admin/settings/dictionary-keys/${id}/`, fields: [['domain', 'settings.field.section'], ['code', 'settings.field.key'], ['is_active', 'settings.field.active', 'boolean']] },
  { tab: 'localization', id: 'dictionaryTranslations', title: 'settings.resource.dictionaryTranslations', endpoint: '/api/admin/settings/dictionary-translations/', response: 'translations', detail: (id) => `/api/admin/settings/dictionary-translations/${id}/`, fields: [['key_id', 'settings.field.key', 'select-ref', 'dictionaryKeys'], ['language_code', 'settings.field.language', 'select-ref', 'languages', 'code'], ['value', 'settings.field.body', 'textarea']] },
  { tab: 'control', id: 'credentials', title: 'settings.resource.credentials', panel: true, readOnly: true },
  // `panel` opts out of the CRUD-table shape: no endpoint to load, custom body.
  { tab: 'control', id: 'importExport', title: 'settings.resource.importExport', panel: true, readOnly: true },
  { tab: 'control', id: 'audit', title: 'settings.resource.audit', endpoint: '/api/admin/system/audit/', response: 'entries', readOnly: true },
  { tab: 'control', id: 'imports', title: 'settings.resource.imports', endpoint: '/api/admin/system/imports/', response: 'batches', readOnly: true },
  { tab: 'control', id: 'security', title: 'settings.resource.security', endpoint: '/api/admin/system/security/', response: 'users', panel: true, readOnly: true },
  { tab: 'control', id: 'logs', title: 'settings.resource.logs', endpoint: '/api/admin/notifications/logs/', response: 'logs', readOnly: true },
  { tab: 'reports', id: 'reports', title: 'settings.resource.reports', panel: true, readOnly: true },
]

const resourceHelp = {
  locations: 'settings.help.locations',
  sessionTypes: 'settings.help.sessionTypes',
}

const tabs = [
  ['catalog', 'settings.tab.catalog'], ['notifications', 'settings.tab.notifications'], ['payroll', 'settings.tab.payroll'], ['localization', 'settings.tab.localization'], ['control', 'settings.tab.control'], ['reports', 'settings.tab.reports'],
]

function displayValue(value, t) {
  if (value === true) return t('common.yes')
  if (value === false) return t('common.none')
  if (value == null || value === '') return '-'
  if (typeof value === 'object') return value.name || value.full_name || JSON.stringify(value)
  return String(value)
}

function readOnlyDetails(row, t) {
  if (row.rows_imported != null) return t('settings.rowsCount', { imported: row.rows_imported, total: row.rows_total ?? 0 })
  return displayValue(row.entity_type || row.role || row.status || row.channel || row.method || '-', t)
}

function formPayload(resource, values) {
  return Object.fromEntries((resource.fields || []).map(([key, , type]) => {
    const value = values[key]
    if (type === 'boolean') return [key, Boolean(value)]
    if (type === 'number') return [key, value === '' || value == null ? null : Number(value)]
    if (type === 'schedule-color') {
      const normalized = normalizeScheduleColorKey(value)
      return [key, normalized === 'standard' ? null : normalized]
    }
    return [key, value ?? '']
  }))
}

function credentialValues(username = '') {
  return { username, currentPassword: '', newPassword: '', confirmPassword: '' }
}

function administratorValues() {
  return { fullName: '', username: '', email: '', password: '', confirmPassword: '', currentPassword: '' }
}

export function createAdminSettingsScreen(components, reloadRoleData, icons, adminData = {}) {
  const ImportExportPanel = createAdminImportExportPanel(components, icons, reloadRoleData)
  const ReportsPanel = createAdminReportsPanel(components)

  const { Button, Badge, Banner, Tabs, Table, Input, Select, Textarea, Checkbox, StatusPill, Dialog } = components
  return function AdminSettingsScreen({ currentUser }) {
    const { locale } = useLocale()
    const t = useMemo(() => adminTranslator(locale), [locale])
    const [tab, setTab] = useState('catalog')
    const [resourceId, setResourceId] = useState('subscriptionTypes')
    const [data, setData] = useState(() => ({ trainers: adminData.trainers || [] }))
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [message, setMessage] = useState(null)
    const [editing, setEditing] = useState(null)
    const [formBaseline, setFormBaseline] = useState({})
    const [modalError, setModalError] = useState(null)
    const [pendingArchive, setPendingArchive] = useState(null)
    const [form, setForm] = useState({})
    const [fieldErrors, setFieldErrors] = useState({})
    const [credentialsOpen, setCredentialsOpen] = useState(false)
    const [credentials, setCredentials] = useState(() => credentialValues())
    const [credentialBaseline, setCredentialBaseline] = useState(() => credentialValues())
    const [credentialErrors, setCredentialErrors] = useState({})
    const [credentialModalError, setCredentialModalError] = useState(null)
    const [administratorOpen, setAdministratorOpen] = useState(false)
    const [administrator, setAdministrator] = useState(administratorValues)
    const [administratorErrors, setAdministratorErrors] = useState({})
    const [administratorModalError, setAdministratorModalError] = useState(null)
    const [accessAction, setAccessAction] = useState(null)
    const [mobileLevel, setMobileLevel] = useState('categories')

    const resource = resources.find((item) => item.id === resourceId) || resources[0]
    const tabResources = useMemo(() => resources.filter((item) => item.tab === tab), [tab])
    const rows = data[resource.id] || []
    const formDirty = useMemo(() => (
      Boolean(editing) && JSON.stringify(formPayload(resource, form)) !== JSON.stringify(formPayload(resource, formBaseline))
    ), [editing, form, formBaseline, resource])
    const credentialsDirty = useMemo(() => (
      credentialsOpen && JSON.stringify(credentials) !== JSON.stringify(credentialBaseline)
    ), [credentialBaseline, credentials, credentialsOpen])
    const administratorDirty = useMemo(() => administratorOpen && Object.values(administrator).some(Boolean), [administrator, administratorOpen])
    const administrators = useMemo(() => (data.security || []).filter((row) => row.role === 'admin'), [data.security])

    const load = async (onlyId) => {
      const loadable = resources.filter((item) => item.endpoint)
      const needed = onlyId ? loadable.filter((item) => item.id === onlyId) : loadable
      setLoading(true)
      try {
        const results = await Promise.allSettled(
          needed.map(async (item) => [item, await fetchAllPages(item.endpoint, item.response)]))
        const loaded = results.filter((result) => result.status === 'fulfilled').map((result) => result.value)
        setData((current) => ({ ...current, ...Object.fromEntries(loaded.map(([item, payload]) => [item.id, payload[item.response] || []])) }))
        const failed = results.filter((result) => result.status === 'rejected')
        if (failed.length) setError(t('settings.sectionsLoadError', {
          count: failed.length,
          errors: failed.map((result) => apiErrorMessage(result.reason, t('common.loadError'))).join('; '),
        }))
      } finally {
        setLoading(false)
      }
    }

    useEffect(() => { load() }, [t])
    useEffect(() => {
      if (!tabResources.some((item) => item.id === resourceId)) setResourceId(tabResources[0]?.id || 'subscriptionTypes')
    }, [tab, tabResources, resourceId])
    function startEdit(row = null) {
      const initial = {}
      ;(resource.fields || []).forEach(([key, , type]) => { initial[key] = row?.[key] ?? (type === 'boolean' ? true : '') })
      setForm(initial)
      setFormBaseline(initial)
      setFieldErrors({})
      setModalError(null)
      setCredentialsOpen(false)
      setEditing(row || {})
    }

    function closeEdit() {
      setEditing(null)
      setForm({})
      setFormBaseline({})
      setFieldErrors({})
      setModalError(null)
    }

    async function openCredentials() {
      setEditing(null)
      setCredentialsOpen(true)
      setCredentialErrors({})
      setCredentialModalError(null)
      setLoading(true)
      try {
        const payload = await api.get('/api/admin/system/credentials/')
        const initial = credentialValues(payload.username || '')
        setCredentials(initial)
        setCredentialBaseline(initial)
      } catch (err) {
        setCredentialModalError(apiErrorMessage(err, t('settings.credentialsLoadError')))
      } finally {
        setLoading(false)
      }
    }

    function closeCredentials() {
      setCredentialsOpen(false)
      setCredentials(credentialBaseline)
      setCredentialErrors({})
      setCredentialModalError(null)
    }

    function selectResource(item) {
      setResourceId(item.id)
      setMobileLevel('detail')
      if (item.id === 'credentials') openCredentials()
    }

    function updateFormField(key, value) {
      setForm((current) => ({ ...current, [key]: value }))
      setFieldErrors((current) => clearFieldError(current, key))
    }

    function updateCredentialField(key, value) {
      setCredentials((current) => ({ ...current, [key]: value }))
      setCredentialErrors((current) => clearFieldError(current, key))
    }

    function openAdministrator() {
      setAdministrator(administratorValues())
      setAdministratorErrors({})
      setAdministratorModalError(null)
      setAdministratorOpen(true)
    }

    function closeAdministrator() {
      setAdministratorOpen(false)
      setAdministratorErrors({})
      setAdministratorModalError(null)
    }

    function updateAdministratorField(key, value) {
      setAdministrator((current) => ({ ...current, [key]: value }))
      setAdministratorErrors((current) => clearFieldError(current, key))
    }

    function fieldOptions(field) {
      const [, , type, source, valueKey] = field
      if (type === 'select') return source.map(([value, label]) => [value, label.startsWith('settings.') ? t(label) : label])
      if (type !== 'select-ref') return []
      return (data[source] || []).map((row) => [String(row[valueKey || 'id']), row.name || row.full_name || row.label || row.code || `#${row.id}`])
    }

    async function save() {
      const payload = formPayload(resource, form)
      setLoading(true); setModalError(null); setFieldErrors({})
      try {
        if (editing?.id) await api.patch(resource.detail(editing.id), payload)
        else await api.post(resource.endpoint, payload)
        setMessage(t(editing?.id ? 'settings.saved' : 'settings.created'))
        closeEdit()
        await load(resource.id)
        reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err)
        setFieldErrors(nextErrors)
        setModalError(formErrorMessage(err, t('settings.saveError')))
        focusFirstFieldError(nextErrors, Object.fromEntries(
          (resource.fields || []).map(([key]) => [key, `admin-settings-${resource.id}-${key}`]),
        ))
      } finally { setLoading(false) }
    }

    async function archive(row) {
      setLoading(true); setError(null)
      try {
        await api.delete(resource.detail(row.id))
        setMessage(t('settings.archived'))
        setPendingArchive(null)
        await load(resource.id)
        reloadRoleData?.('admin')
      } catch (err) { setError(apiErrorMessage(err, t('settings.archiveError'))) } finally { setLoading(false) }
    }

    async function saveCredentials() {
      if (credentials.newPassword !== credentials.confirmPassword) {
        const nextErrors = {
          newPassword: t('settings.passwordsMismatch'),
          confirmPassword: t('settings.repeatPasswordError'),
        }
        setCredentialErrors(nextErrors)
        setCredentialModalError(null)
        focusFirstFieldError(nextErrors, CREDENTIAL_FIELD_IDS)
        return
      }
      setLoading(true); setCredentialModalError(null); setCredentialErrors({})
      try {
        const payload = await api.patch('/api/admin/system/credentials/', {
          username: credentials.username,
          current_password: credentials.currentPassword,
          new_password: credentials.newPassword,
        })
        const nextCredentials = credentialValues(payload.username)
        setCredentials(nextCredentials)
        setCredentialBaseline(nextCredentials)
        setCredentialsOpen(false)
        setMessage(t('settings.credentialsUpdated'))
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, CREDENTIAL_FIELD_MAP)
        setCredentialErrors(nextErrors)
        setCredentialModalError(formErrorMessage(err, t('settings.credentialsSaveError')))
        focusFirstFieldError(nextErrors, CREDENTIAL_FIELD_IDS)
      } finally {
        setLoading(false)
      }
    }

    async function saveAdministrator() {
      if (administrator.password !== administrator.confirmPassword) {
        const nextErrors = { password: t('settings.passwordsMismatch'), confirmPassword: t('settings.repeatPasswordError') }
        setAdministratorErrors(nextErrors)
        focusFirstFieldError(nextErrors, ADMINISTRATOR_FIELD_IDS)
        return
      }
      setLoading(true); setAdministratorModalError(null); setAdministratorErrors({})
      try {
        await api.post('/api/admin/system/administrators/', {
          full_name: administrator.fullName,
          username: administrator.username,
          email: administrator.email,
          password: administrator.password,
          current_password: administrator.currentPassword,
        })
        closeAdministrator()
        setMessage(t('settings.administratorCreated'))
        await load('security')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, ADMINISTRATOR_FIELD_MAP)
        setAdministratorErrors(nextErrors)
        setAdministratorModalError(formErrorMessage(err, t('settings.administratorCreateError')))
        focusFirstFieldError(nextErrors, ADMINISTRATOR_FIELD_IDS)
      } finally { setLoading(false) }
    }

    async function saveAccessAction() {
      if (!accessAction?.currentPassword) return
      setLoading(true)
      try {
        await api.post(`/api/admin/system/administrators/${accessAction.row.id}/${accessAction.type}/`, {
          current_password: accessAction.currentPassword,
        })
        setAccessAction(null)
        setMessage(t('settings.accessUpdated'))
        await load('security')
      } catch (err) {
        setAccessAction((current) => current && ({ ...current, error: formErrorMessage(err, t('settings.accessUpdateError')) }))
      } finally { setLoading(false) }
    }

    async function restoreSplit() {
      setLoading(true); setError(null)
      try {
        const payload = await api.post('/api/admin/settings/session-types/split/restore/')
        setMessage(t(payload.created ? 'settings.splitRestored' : 'settings.splitAlreadyConfigured'))
        await load('sessionTypes')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, t('settings.splitRestoreError')))
      } finally {
        setLoading(false)
      }
    }

    const columns = resource.id === 'sessionTypes'
      ? [
          { key: 'label', header: t('settings.systemType'), render: (row) => <span className="strong">{row.label} <small className="muted">({row.code})</small></span> },
          { key: 'details', header: t('settings.defaults'), muted: true, render: (row) => t('settings.sessionDefaults', { minutes: row.default_duration_minutes || 60, capacity: row.default_capacity ?? '—' }) },
          { key: 'active', header: t('common.status'), render: (row) => row.configured === false ? <Badge tone="warning">{t('settings.notConfigured')}</Badge> : <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
          { key: 'actions', header: '', width: 210, render: (row) => row.configured === false
            ? <Button size="sm" variant="primary" disabled={loading || row.code !== 'split'} onClick={restoreSplit}>{t('settings.restoreSystemType')}</Button>
            : <Button size="sm" variant="subtle" disabled={loading} onClick={() => startEdit(row)}>{t('common.edit')}</Button> },
        ]
      : resource.readOnly
      ? [{ key: 'created_at', header: t('settings.when'), render: (row) => displayValue(row.created_at, t) }, { key: 'name', header: t('settings.record'), render: (row) => <span className="strong">{displayValue(row.full_name || row.source_name || row.action || row.recipient || row.date_from || row.username, t)}</span> }, { key: 'details', header: t('settings.details'), muted: true, render: (row) => readOnlyDetails(row, t) }]
      : [{ key: 'name', header: t(resource.title), render: (row) => <span className="strong">{displayValue(row.name || row.label || row.code || row.event_type || row.trainer || row.domain, t)}</span> }, { key: 'details', header: t('settings.details'), muted: true, render: (row) => displayValue(row.address || row.scheme || row.channel || row.value || row.location || row.effective_from, t) }, { key: 'active', header: t('common.status'), render: (row) => row.is_active == null ? '-' : <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> }, { key: 'actions', header: '', width: 180, render: (row) => <div className="ops-button-row"><Button size="sm" variant="subtle" disabled={loading} onClick={() => startEdit(row)}>{t('common.edit')}</Button>{resource.id !== 'sessionTypes' && <Button size="sm" variant="subtle" disabled={loading} onClick={() => setPendingArchive(row)}>{t('settings.remove')}</Button>}</div> }]

    return <div className={`page page-wide ops-settings-page is-mobile-${mobileLevel}`}>
      <div className="page-head"><div><h1 className="page-title">{t('settings.title')}</h1><p className="page-desc">{t('settings.description')}</p></div>{!resource.panel && <span className="ops-settings-page-refresh"><Button variant="secondary" disabled={loading} onClick={() => load(resource.id)}>{t('settings.refresh')}</Button></span>}</div>
      {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
      <ToastNotice id="admin-settings-result" message={message} tone="success" />
      <div className="ops-settings-desktop-nav">
        <Tabs value={tab} onChange={setTab} items={tabs.map(([value, label]) => ({ value, label: t(label) }))} />
        {tab !== 'reports' && <div className="ops-action-strip ops-settings-resources">{tabResources.map((item) => <button type="button" key={item.id} className={`ops-action-card${resource.id === item.id ? ' is-active' : ''}`} onClick={() => selectResource(item)}><span>{t(item.title)}</span><small>{t(item.readOnly ? 'settings.viewControl' : 'settings.createEdit')}</small></button>)}</div>}
      </div>
      <div className="ops-settings-mobile-nav">
        {mobileLevel === 'categories' && <div className="ops-settings-mobile-list" aria-label={t('settings.categoriesAria')}>
          {tabs.map(([value, label]) => <button key={value} type="button" className="ops-settings-mobile-item ops-action-card" style={{ flexDirection: 'row', textAlign: 'left' }} onClick={() => { setTab(value); setResourceId(resources.find((item) => item.tab === value)?.id || 'subscriptionTypes'); setMobileLevel('resources') }}><strong>{t(label)}</strong><span aria-hidden="true">›</span></button>)}
        </div>}
        {mobileLevel === 'resources' && <>
          <ContextBackButton icon={<icons.ArrowLeft size={14} />} onClick={() => setMobileLevel('categories')}>{t('settings.categories')}</ContextBackButton>
          <div className="ops-settings-mobile-list" aria-label={t(tabs.find(([value]) => value === tab)?.[1])}>
            {tabResources.map((item) => <button key={item.id} type="button" className="ops-settings-mobile-item ops-action-card" style={{ flexDirection: 'row', textAlign: 'left' }} onClick={() => selectResource(item)}><span><strong>{t(item.title)}</strong><small>{t(item.readOnly ? 'settings.viewControl' : 'settings.createEdit')}</small></span><span aria-hidden="true">›</span></button>)}
          </div>
        </>}
        {mobileLevel === 'detail' && <ContextBackButton icon={<icons.ArrowLeft size={14} />} onClick={() => setMobileLevel('resources')}>{t(tabs.find(([value]) => value === tab)?.[1])}</ContextBackButton>}
      </div>
      <div className={`ops-settings-detail${mobileLevel === 'detail' ? ' is-mobile-visible' : ''}`}>
      {tab !== 'reports' && <div className="ops-section-head" style={{ margin: '8px 0 12px' }}><div><div className="eyebrow">{t(tabs.find(([value]) => value === tab)?.[1])}</div><h3 className="section-title" style={{ margin: '3px 0' }}>{t(resource.title)}</h3>{resourceHelp[resource.id] && <p className="page-desc" style={{ margin: '5px 0 0' }}>{t(resourceHelp[resource.id])}</p>}</div>{!resource.readOnly && resource.id !== 'sessionTypes' && <Button variant="primary" disabled={loading} onClick={() => startEdit()}>{t('settings.add')}</Button>}</div>}
      {resource.id === 'credentials' && <div className="card card-pad ops-edit-panel">
        <p className="page-desc">{t('settings.credentialsDescription')}</p>
        <Button variant="primary" disabled={loading} onClick={openCredentials}>{t('settings.editCredentials')}</Button>
      </div>}
      {resource.id === 'security' && <div className="card card-pad ops-edit-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <p className="page-desc" style={{ margin: 0 }}>{t('settings.administratorsDescription')}</p>
          {currentUser?.can_manage_administrators && <Button variant="primary" disabled={loading} onClick={openAdministrator}>{t('settings.addAdministrator')}</Button>}
        </div>
        <Table rows={administrators} emptyLabel={loading ? t('common.loading') : t('settings.empty')} columns={[
          { key: 'full_name', header: t('settings.administrator'), render: (row) => <span className="strong">{row.full_name}</span> },
          { key: 'username', header: t('settings.newLogin'), muted: true },
          { key: 'status', header: t('common.status'), render: (row) => row.is_superuser ? <Badge tone="info">{t('settings.primaryAdministrator')}</Badge> : <Badge tone={row.is_active ? 'success' : 'danger'}>{t(row.is_active ? 'settings.accessEnabled' : 'settings.accessRevoked')}</Badge> },
          { key: 'actions', header: '', width: 160, render: (row) => {
            if (!currentUser?.can_manage_administrators || row.is_superuser || row.id === currentUser?.id) return null
            const type = row.is_active ? 'revoke' : 'restore'
            return <Button size="sm" variant={type === 'revoke' ? 'subtle' : 'primary'} disabled={loading} onClick={() => setAccessAction({ row, type, currentPassword: '', error: null })}>{t(type === 'revoke' ? 'settings.revokeAccess' : 'settings.restoreAccess')}</Button>
          } },
        ]} />
      </div>}
      {resource.panel && resource.id === 'importExport'
        ? <ImportExportPanel />
        : resource.panel && resource.id === 'reports'
          ? <ReportsPanel />
          : !resource.panel && <Table rows={rows} emptyLabel={loading ? t('common.loading') : t('settings.empty')} columns={columns} />}
      </div>
      <FormModal
        open={Boolean(editing)}
        title={t('settings.editTitle', { action: t(editing?.id ? 'settings.editing' : 'settings.newRecord'), resource: t(resource.title) })}
        description={resourceHelp[resource.id] ? t(resourceHelp[resource.id]) : undefined}
        size={(resource.fields || []).length > 6 ? 'lg' : 'md'}
        busy={loading}
        dirty={formDirty}
        onRequestClose={closeEdit}
        footer={({ requestClose }) => <>
          <Button variant="primary" disabled={loading} onClick={save}>{t('common.save')}</Button>
          <Button variant="secondary" disabled={loading} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button>
        </>}
      >
        {modalError && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setModalError(null)}>{modalError}</Banner>}
        <fieldset disabled={loading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="ops-form-grid">{(resource.fields || []).map((field) => {
            const [key, label, type = 'text'] = field
            const value = form[key] ?? ''
            const id = `admin-settings-${resource.id}-${key}`
            const shared = { id, label: t(label), error: fieldErrors[key] }
            if (type === 'boolean') return <Checkbox key={key} {...shared} checked={Boolean(value)} onChange={(event) => updateFormField(key, event.target.checked)} />
            if (type === 'textarea') return <Textarea key={key} {...shared} value={value} onChange={(event) => updateFormField(key, event.target.value)} rows="4" containerStyle={{ gridColumn: '1 / -1' }} />
            if (type === 'select' || type === 'select-ref') return <Select key={key} {...shared} value={value} onChange={(event) => updateFormField(key, event.target.value)}><option value="">{t('settings.select')}</option>{fieldOptions(field).map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</Select>
            if (type === 'date') return <DateField key={key} {...shared} value={value} onChange={(next) => updateFormField(key, next)} />
            if (type === 'time') return <TimeField key={key} {...shared} value={value} onChange={(next) => updateFormField(key, next)} />
            if (type === 'schedule-color') return <ScheduleColorPicker key={key} {...shared} value={value} onChange={(next) => updateFormField(key, next)} disabled={loading} />
            return <Input key={key} {...shared} value={value} onChange={(event) => updateFormField(key, event.target.value)} type={type} />
          })}</div>
        </fieldset>
      </FormModal>
      <FormModal
        open={credentialsOpen}
        title={t('settings.credentialsTitle')}
        description={t('settings.credentialsConfirmHint')}
        size="md"
        busy={loading}
        dirty={credentialsDirty}
        onRequestClose={closeCredentials}
        footer={({ requestClose }) => <>
          <Button variant="primary" disabled={loading || !credentials.currentPassword} onClick={saveCredentials}>{t('settings.updateCredentials')}</Button>
          <Button variant="secondary" disabled={loading} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button>
        </>}
      >
        {credentialModalError && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setCredentialModalError(null)}>{credentialModalError}</Banner>}
        <fieldset disabled={loading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="ops-form-grid">
            <Input id={CREDENTIAL_FIELD_IDS.username} label={t('settings.newLogin')} value={credentials.username} error={credentialErrors.username} onChange={(event) => updateCredentialField('username', event.target.value)} autoComplete="username" />
            <Input id={CREDENTIAL_FIELD_IDS.currentPassword} label={t('settings.currentPassword')} type="password" value={credentials.currentPassword} error={credentialErrors.currentPassword} onChange={(event) => updateCredentialField('currentPassword', event.target.value)} autoComplete="current-password" />
            <Input id={CREDENTIAL_FIELD_IDS.newPassword} label={t('settings.newPasswordOptional')} type="password" value={credentials.newPassword} error={credentialErrors.newPassword} onChange={(event) => updateCredentialField('newPassword', event.target.value)} autoComplete="new-password" />
            <Input id={CREDENTIAL_FIELD_IDS.confirmPassword} label={t('settings.repeatNewPassword')} type="password" value={credentials.confirmPassword} error={credentialErrors.confirmPassword} onChange={(event) => updateCredentialField('confirmPassword', event.target.value)} autoComplete="new-password" />
          </div>
        </fieldset>
      </FormModal>
      <FormModal
        open={administratorOpen}
        title={t('settings.addAdministrator')}
        description={t('settings.administratorsDescription')}
        size="md"
        busy={loading}
        dirty={administratorDirty}
        onRequestClose={closeAdministrator}
        footer={({ requestClose }) => <>
          <Button variant="primary" disabled={loading || !administrator.currentPassword} onClick={saveAdministrator}>{t('settings.addAdministrator')}</Button>
          <Button variant="secondary" disabled={loading} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button>
        </>}
      >
        {administratorModalError && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setAdministratorModalError(null)}>{administratorModalError}</Banner>}
        <fieldset disabled={loading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="ops-form-grid">
          <Input id={ADMINISTRATOR_FIELD_IDS.fullName} label={t('settings.fullName')} value={administrator.fullName} error={administratorErrors.fullName} onChange={(event) => updateAdministratorField('fullName', event.target.value)} autoComplete="name" />
          <Input id={ADMINISTRATOR_FIELD_IDS.username} label={t('settings.newLogin')} value={administrator.username} error={administratorErrors.username} onChange={(event) => updateAdministratorField('username', event.target.value)} autoComplete="username" />
          <Input id={ADMINISTRATOR_FIELD_IDS.email} label={t('settings.emailOptional')} type="email" value={administrator.email} error={administratorErrors.email} onChange={(event) => updateAdministratorField('email', event.target.value)} autoComplete="email" />
          <Input id={ADMINISTRATOR_FIELD_IDS.password} label={t('settings.password')} type="password" value={administrator.password} error={administratorErrors.password} onChange={(event) => updateAdministratorField('password', event.target.value)} autoComplete="new-password" />
          <Input id={ADMINISTRATOR_FIELD_IDS.confirmPassword} label={t('settings.repeatPassword')} type="password" value={administrator.confirmPassword} error={administratorErrors.confirmPassword} onChange={(event) => updateAdministratorField('confirmPassword', event.target.value)} autoComplete="new-password" />
          <Input id={ADMINISTRATOR_FIELD_IDS.currentPassword} label={t('settings.currentPassword')} type="password" value={administrator.currentPassword} error={administratorErrors.currentPassword} onChange={(event) => updateAdministratorField('currentPassword', event.target.value)} autoComplete="current-password" />
        </div></fieldset>
      </FormModal>
      <FormModal
        open={Boolean(accessAction)}
        title={t('settings.accessActionTitle', { action: t(accessAction?.type === 'revoke' ? 'settings.revokeAccess' : 'settings.restoreAccess') })}
        description={t('settings.accessActionDescription', { name: accessAction?.row?.full_name || '' })}
        size="sm"
        busy={loading}
        dirty={Boolean(accessAction?.currentPassword)}
        onRequestClose={() => setAccessAction(null)}
        footer={({ requestClose }) => <>
          <Button variant={accessAction?.type === 'revoke' ? 'danger' : 'primary'} disabled={loading || !accessAction?.currentPassword} onClick={saveAccessAction}>{t(accessAction?.type === 'revoke' ? 'settings.revokeAccess' : 'settings.restoreAccess')}</Button>
          <Button variant="secondary" disabled={loading} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button>
        </>}
      >
        {accessAction?.error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setAccessAction((current) => current && ({ ...current, error: null }))}>{accessAction.error}</Banner>}
        <Input id="admin-access-current-password" label={t('settings.currentPassword')} type="password" value={accessAction?.currentPassword || ''} onChange={(event) => setAccessAction((current) => current && ({ ...current, currentPassword: event.target.value, error: null }))} autoComplete="current-password" />
      </FormModal>
      {pendingArchive && <Dialog
        open
        title={t('settings.archiveTitle')}
        description={t('settings.archiveDescription', { name: pendingArchive.name || pendingArchive.label || pendingArchive.code || pendingArchive.id })}
        confirmLabel={t('settings.remove')}
        cancelLabel={t('common.cancel')}
        tone="danger"
        onClose={() => loading ? null : setPendingArchive(null)}
        onConfirm={() => archive(pendingArchive)}
      />}
    </div>
  }
}
