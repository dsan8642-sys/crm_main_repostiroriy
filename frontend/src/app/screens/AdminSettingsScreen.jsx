import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage, fetchAllPages } from '../../api.js'
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

const eventTypes = [
  ['payment_reminder', 'Напоминание об оплате'], ['session_reminder', 'Напоминание о занятии'],
  ['subscription_end', 'Окончание абонемента'], ['renewal_needed', 'Нужно продление'],
  ['schedule_change', 'Изменение расписания'], ['mass_mailing', 'Массовая рассылка'],
]
const channels = [['email', 'Email'], ['telegram', 'Telegram'], ['sms', 'SMS']]
const sessionTypes = [['group', 'Групповое'], ['individual', 'Индивидуальное'], ['split', 'Сплит']]

const resources = [
  { tab: 'catalog', id: 'subscriptionTypes', title: 'Типы абонементов', endpoint: '/api/admin/subscription-types/', response: 'subscription_types', detail: (id) => `/api/admin/subscription-types/${id}/`, fields: [['name', 'Название'], ['price_minor', 'Цена, гроши', 'number'], ['currency', 'Валюта'], ['duration_days', 'Срок, дней', 'number'], ['sessions_count', 'Занятий', 'number'], ['is_individual', 'Индивидуальный', 'boolean'], ['is_active', 'Активен', 'boolean']] },
  { tab: 'catalog', id: 'locations', title: 'Локации', endpoint: '/api/admin/settings/locations/', response: 'locations', detail: (id) => `/api/admin/settings/locations/${id}/`, fields: [['code', 'Код'], ['name', 'Название'], ['address', 'Адрес'], ['timezone', 'Часовой пояс'], ['is_active', 'Активна', 'boolean']] },
  { tab: 'catalog', id: 'sessionTypes', title: 'Типы занятий', endpoint: '/api/admin/settings/session-types/', response: 'session_types', detail: (id) => `/api/admin/settings/session-types/${id}/`, fields: [['code', 'Тип', 'select', sessionTypes], ['label', 'Название'], ['default_capacity', 'Лимит по умолчанию', 'number'], ['default_price_minor', 'Цена по умолчанию, гроши', 'number'], ['default_currency', 'Валюта'], ['default_duration_minutes', 'Длительность, мин', 'number'], ['color_key', 'Цвет расписания', 'schedule-color'], ['is_active', 'Активен', 'boolean']] },
  { tab: 'notifications', id: 'templates', title: 'Шаблоны уведомлений', endpoint: '/api/admin/notifications/templates/', response: 'templates', detail: (id) => `/api/admin/notifications/templates/${id}/`, fields: [['event_type', 'Событие', 'select', eventTypes], ['channel', 'Канал', 'select', channels], ['subject', 'Тема'], ['body', 'Текст', 'textarea']] },
  { tab: 'notifications', id: 'rules', title: 'Правила отправки', endpoint: '/api/admin/notifications/rules/', response: 'rules', detail: (id) => `/api/admin/notifications/rules/${id}/`, fields: [['event_type', 'Событие', 'select', eventTypes], ['channel', 'Канал', 'select', channels], ['template_id', 'Шаблон', 'select-ref', 'templates'], ['offset_minutes', 'Сдвиг, минут', 'number'], ['is_active', 'Активно', 'boolean']] },
  { tab: 'notifications', id: 'quietHours', title: 'Тихие часы', endpoint: '/api/admin/notifications/quiet-hours/', response: 'policies', detail: (id) => `/api/admin/notifications/quiet-hours/${id}/`, fields: [['channel', 'Канал', 'select', channels], ['starts_at', 'С', 'time'], ['ends_at', 'До', 'time'], ['timezone', 'Часовой пояс'], ['is_active', 'Активно', 'boolean']] },
  { tab: 'notifications', id: 'notificationTranslations', title: 'Переводы шаблонов', endpoint: '/api/admin/settings/notification-template-translations/', response: 'translations', detail: (id) => `/api/admin/settings/notification-template-translations/${id}/`, fields: [['template_id', 'Шаблон', 'select-ref', 'templates'], ['language_code', 'Язык', 'select-ref', 'languages', 'code'], ['subject', 'Тема'], ['body', 'Текст', 'textarea']] },
  { tab: 'payroll', id: 'schemes', title: 'Схемы оплаты тренеров', endpoint: '/api/admin/payroll/schemes/', response: 'schemes', detail: (id) => `/api/admin/payroll/schemes/${id}/`, fields: [['name', 'Название'], ['location', 'Локация'], ['is_active', 'Активна', 'boolean']] },
  { tab: 'payroll', id: 'payrollRules', title: 'Ставки', endpoint: '/api/admin/payroll/rules/', response: 'rules', detail: (id) => `/api/admin/payroll/rules/${id}/`, fields: [['scheme_id', 'Схема', 'select-ref', 'schemes'], ['session_type', 'Тип занятия', 'select', sessionTypes], ['rule_type', 'Тип правила', 'select', sessionTypes], ['base_amount_minor', 'Базовая сумма, гроши', 'number'], ['currency', 'Валюта'], ['min_clients_threshold', 'Минимум клиентов', 'number'], ['extra_client_amount_minor', 'За доп. клиента, гроши', 'number'], ['is_active', 'Активна', 'boolean']] },
  { tab: 'payroll', id: 'assignments', title: 'Назначения ставок', endpoint: '/api/admin/payroll/assignments/', response: 'assignments', detail: (id) => `/api/admin/payroll/assignments/${id}/`, fields: [['trainer_id', 'Тренер', 'select-ref', 'trainers'], ['scheme_id', 'Схема', 'select-ref', 'schemes'], ['effective_from', 'Действует с', 'date'], ['effective_to', 'Действует по', 'date']] },
  { tab: 'payroll', id: 'periods', title: 'Расчеты зарплаты', endpoint: '/api/admin/payroll/periods/', response: 'periods', readOnly: true },
  { tab: 'localization', id: 'languages', title: 'Языки', endpoint: '/api/admin/settings/languages/', response: 'languages', detail: (id) => `/api/admin/settings/languages/${id}/`, fields: [['code', 'Код'], ['name', 'Название'], ['is_active', 'Активен', 'boolean']] },
  { tab: 'localization', id: 'dictionaryKeys', title: 'Ключи интерфейса', endpoint: '/api/admin/settings/dictionary-keys/', response: 'keys', detail: (id) => `/api/admin/settings/dictionary-keys/${id}/`, fields: [['domain', 'Раздел'], ['code', 'Ключ'], ['is_active', 'Активен', 'boolean']] },
  { tab: 'localization', id: 'dictionaryTranslations', title: 'Переводы интерфейса', endpoint: '/api/admin/settings/dictionary-translations/', response: 'translations', detail: (id) => `/api/admin/settings/dictionary-translations/${id}/`, fields: [['key_id', 'Ключ', 'select-ref', 'dictionaryKeys'], ['language_code', 'Язык', 'select-ref', 'languages', 'code'], ['value', 'Текст', 'textarea']] },
  { tab: 'control', id: 'credentials', title: 'Логин и пароль администратора', panel: true, readOnly: true },
  // `panel` opts out of the CRUD-table shape: no endpoint to load, custom body.
  { tab: 'control', id: 'importExport', title: 'Импорт и экспорт', panel: true, readOnly: true },
  { tab: 'control', id: 'audit', title: 'Журнал действий', endpoint: '/api/admin/system/audit/', response: 'entries', readOnly: true },
  { tab: 'control', id: 'imports', title: 'История импортов', endpoint: '/api/admin/system/imports/', response: 'batches', readOnly: true },
  { tab: 'control', id: 'security', title: 'Доступы и 2FA', endpoint: '/api/admin/system/security/', response: 'users', readOnly: true },
  { tab: 'control', id: 'logs', title: 'Журнал уведомлений', endpoint: '/api/admin/notifications/logs/', response: 'logs', readOnly: true },
  { tab: 'reports', id: 'reports', title: 'Отчёты', panel: true, readOnly: true },
]

const resourceHelp = {
  locations: 'Активные локации доступны для выбора в занятиях, шаблонах и слотах недельных планов. Новая локация не меняет старые записи автоматически.',
  sessionTypes: 'Поддерживаются только системные типы group, individual и split. Название используется в интерфейсе, а цена, длительность и лимит подставляются только в новые занятия; существующие занятия сохраняют snapshot.',
}

const tabs = [
  ['catalog', 'Справочники'], ['notifications', 'Уведомления'], ['payroll', 'Зарплата'], ['localization', 'Языки'], ['control', 'Контроль'], ['reports', 'Отчёты'],
]

function displayValue(value) {
  if (value === true) return 'Да'
  if (value === false) return 'Нет'
  if (value == null || value === '') return '-'
  if (typeof value === 'object') return value.name || value.full_name || JSON.stringify(value)
  return String(value)
}

function readOnlyDetails(row) {
  if (row.rows_imported != null) return `${row.rows_imported}/${row.rows_total ?? 0} строк`
  return displayValue(row.entity_type || row.role || row.status || row.channel || row.method || '-')
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

export function createAdminSettingsScreen(components, reloadRoleData, icons, adminData = {}) {
  const ImportExportPanel = createAdminImportExportPanel(components, icons, reloadRoleData)
  const ReportsPanel = createAdminReportsPanel(components)

  const { Button, Badge, Banner, Tabs, Table, Input, Select, Textarea, Checkbox, StatusPill, Dialog } = components
  return function AdminSettingsScreen() {
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
        if (failed.length) setError(`Не удалось загрузить ${failed.length} раздел(а): ${failed.map((result) => apiErrorMessage(result.reason, 'Ошибка загрузки.')).join('; ')}`)
      } finally {
        setLoading(false)
      }
    }

    useEffect(() => { load() }, [])
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
        setCredentialModalError(apiErrorMessage(err, 'Не удалось загрузить данные входа.'))
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

    function fieldOptions(field) {
      const [, , type, source, valueKey] = field
      if (type === 'select') return source
      if (type !== 'select-ref') return []
      return (data[source] || []).map((row) => [String(row[valueKey || 'id']), row.name || row.full_name || row.label || row.code || `#${row.id}`])
    }

    async function save() {
      const payload = formPayload(resource, form)
      setLoading(true); setModalError(null); setFieldErrors({})
      try {
        if (editing?.id) await api.patch(resource.detail(editing.id), payload)
        else await api.post(resource.endpoint, payload)
        setMessage(editing?.id ? 'Изменения сохранены.' : 'Запись создана.')
        closeEdit()
        await load(resource.id)
        reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err)
        setFieldErrors(nextErrors)
        setModalError(formErrorMessage(err, 'Не удалось сохранить запись.'))
        focusFirstFieldError(nextErrors, Object.fromEntries(
          (resource.fields || []).map(([key]) => [key, `admin-settings-${resource.id}-${key}`]),
        ))
      } finally { setLoading(false) }
    }

    async function archive(row) {
      setLoading(true); setError(null)
      try {
        await api.delete(resource.detail(row.id))
        setMessage('Запись убрана из рабочего списка. История сохранена там, где это предусмотрено правилами.')
        setPendingArchive(null)
        await load(resource.id)
        reloadRoleData?.('admin')
      } catch (err) { setError(apiErrorMessage(err, 'Не удалось убрать запись.')) } finally { setLoading(false) }
    }

    async function saveCredentials() {
      if (credentials.newPassword !== credentials.confirmPassword) {
        const nextErrors = {
          newPassword: 'Новые пароли не совпадают.',
          confirmPassword: 'Повторите новый пароль точно так же.',
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
        setMessage('Логин и пароль администратора обновлены. Текущая сессия сохранена.')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, CREDENTIAL_FIELD_MAP)
        setCredentialErrors(nextErrors)
        setCredentialModalError(formErrorMessage(err, 'Не удалось обновить данные входа.'))
        focusFirstFieldError(nextErrors, CREDENTIAL_FIELD_IDS)
      } finally {
        setLoading(false)
      }
    }

    async function restoreSplit() {
      setLoading(true); setError(null)
      try {
        const payload = await api.post('/api/admin/settings/session-types/split/restore/')
        setMessage(payload.created ? 'Системный тип split восстановлен.' : 'Системный тип split уже настроен.')
        await load('sessionTypes')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, 'Не удалось восстановить системный тип split.'))
      } finally {
        setLoading(false)
      }
    }

    const columns = resource.id === 'sessionTypes'
      ? [
          { key: 'label', header: 'Системный тип', render: (row) => <span className="strong">{row.label} <small className="muted">({row.code})</small></span> },
          { key: 'details', header: 'Значения по умолчанию', muted: true, render: (row) => `${row.default_duration_minutes || 60} мин · лимит ${row.default_capacity ?? '—'}` },
          { key: 'active', header: 'Статус', render: (row) => row.configured === false ? <Badge tone="warning">Не настроен</Badge> : <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
          { key: 'actions', header: '', width: 210, render: (row) => row.configured === false
            ? <Button size="sm" variant="primary" disabled={loading || row.code !== 'split'} onClick={restoreSplit}>Восстановить системный тип</Button>
            : <Button size="sm" variant="subtle" disabled={loading} onClick={() => startEdit(row)}>Изменить</Button> },
        ]
      : resource.readOnly
      ? [{ key: 'created_at', header: 'Когда', render: (row) => displayValue(row.created_at) }, { key: 'name', header: 'Запись', render: (row) => <span className="strong">{displayValue(row.full_name || row.source_name || row.action || row.recipient || row.date_from || row.username)}</span> }, { key: 'details', header: 'Детали', muted: true, render: readOnlyDetails }]
      : [{ key: 'name', header: resource.title, render: (row) => <span className="strong">{displayValue(row.name || row.label || row.code || row.event_type || row.trainer || row.domain)}</span> }, { key: 'details', header: 'Детали', muted: true, render: (row) => displayValue(row.address || row.scheme || row.channel || row.value || row.location || row.effective_from) }, { key: 'active', header: 'Статус', render: (row) => row.is_active == null ? '-' : <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> }, { key: 'actions', header: '', width: 180, render: (row) => <div className="ops-button-row"><Button size="sm" variant="subtle" disabled={loading} onClick={() => startEdit(row)}>Изменить</Button>{resource.id !== 'sessionTypes' && <Button size="sm" variant="subtle" disabled={loading} onClick={() => setPendingArchive(row)}>Убрать</Button>}</div> }]

    return <div className={`page page-wide ops-settings-page is-mobile-${mobileLevel}`}>
      <div className="page-head"><div><h1 className="page-title">Настройки и контроль</h1><p className="page-desc">Все служебные функции SwimCRM в одном месте. Django admin больше не нужен для ежедневной работы.</p></div>{!resource.panel && <span className="ops-settings-page-refresh"><Button variant="secondary" disabled={loading} onClick={() => load(resource.id)}>Обновить</Button></span>}</div>
      {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
      <ToastNotice id="admin-settings-result" message={message} tone="success" />
      <div className="ops-settings-desktop-nav">
        <Tabs value={tab} onChange={setTab} items={tabs.map(([value, label]) => ({ value, label }))} />
        {tab !== 'reports' && <div className="ops-action-strip ops-settings-resources">{tabResources.map((item) => <button type="button" key={item.id} className={`ops-action-card${resource.id === item.id ? ' is-active' : ''}`} onClick={() => selectResource(item)}><span>{item.title}</span><small>{item.readOnly ? 'Просмотр и контроль' : 'Создание и редактирование'}</small></button>)}</div>}
      </div>
      <div className="ops-settings-mobile-nav">
        {mobileLevel === 'categories' && <div className="ops-settings-mobile-list" aria-label="Категории настроек">
          {tabs.map(([value, label]) => <button key={value} type="button" className="ops-settings-mobile-item" onClick={() => { setTab(value); setResourceId(resources.find((item) => item.tab === value)?.id || 'subscriptionTypes'); setMobileLevel('resources') }}><strong>{label}</strong><span aria-hidden="true">›</span></button>)}
        </div>}
        {mobileLevel === 'resources' && <>
          <ContextBackButton icon={<icons.ArrowLeft size={14} />} onClick={() => setMobileLevel('categories')}>Категории</ContextBackButton>
          <div className="ops-settings-mobile-list" aria-label={tabs.find(([value]) => value === tab)?.[1]}>
            {tabResources.map((item) => <button key={item.id} type="button" className="ops-settings-mobile-item" onClick={() => selectResource(item)}><span><strong>{item.title}</strong><small>{item.readOnly ? 'Просмотр и контроль' : 'Создание и редактирование'}</small></span><span aria-hidden="true">›</span></button>)}
          </div>
        </>}
        {mobileLevel === 'detail' && <ContextBackButton icon={<icons.ArrowLeft size={14} />} onClick={() => setMobileLevel('resources')}>{tabs.find(([value]) => value === tab)?.[1]}</ContextBackButton>}
      </div>
      <div className={`ops-settings-detail${mobileLevel === 'detail' ? ' is-mobile-visible' : ''}`}>
      {tab !== 'reports' && <div className="ops-section-head" style={{ margin: '8px 0 12px' }}><div><div className="eyebrow">{tabs.find(([value]) => value === tab)?.[1]}</div><h3 className="section-title" style={{ margin: '3px 0' }}>{resource.title}</h3>{resourceHelp[resource.id] && <p className="page-desc" style={{ margin: '5px 0 0' }}>{resourceHelp[resource.id]}</p>}</div>{!resource.readOnly && resource.id !== 'sessionTypes' && <Button variant="primary" disabled={loading} onClick={() => startEdit()}>Добавить</Button>}</div>}
      {resource.id === 'credentials' && <div className="card card-pad ops-edit-panel">
        <p className="page-desc">Изменяются данные текущего администратора. Для подтверждения обязательно введите действующий пароль. Пароль хранится только как Django hash и не выводится в журнал.</p>
        <Button variant="primary" disabled={loading} onClick={openCredentials}>Изменить данные входа</Button>
      </div>}
      {resource.panel && resource.id === 'importExport'
        ? <ImportExportPanel />
        : resource.panel && resource.id === 'reports'
          ? <ReportsPanel />
          : !resource.panel && <Table rows={rows} emptyLabel={loading ? 'Загрузка...' : 'Записей пока нет'} columns={columns} />}
      </div>
      <FormModal
        open={Boolean(editing)}
        title={`${editing?.id ? 'Редактирование' : 'Новая запись'} · ${resource.title}`}
        description={resourceHelp[resource.id]}
        size={(resource.fields || []).length > 6 ? 'lg' : 'md'}
        busy={loading}
        dirty={formDirty}
        onRequestClose={closeEdit}
        footer={({ requestClose }) => <>
          <Button variant="primary" disabled={loading} onClick={save}>Сохранить</Button>
          <Button variant="secondary" disabled={loading} onClick={() => requestClose('cancel')}>Отмена</Button>
        </>}
      >
        {modalError && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setModalError(null)}>{modalError}</Banner>}
        <fieldset disabled={loading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="ops-form-grid">{(resource.fields || []).map((field) => {
            const [key, label, type = 'text'] = field
            const value = form[key] ?? ''
            const id = `admin-settings-${resource.id}-${key}`
            const shared = { id, label, error: fieldErrors[key] }
            if (type === 'boolean') return <Checkbox key={key} {...shared} checked={Boolean(value)} onChange={(event) => updateFormField(key, event.target.checked)} />
            if (type === 'textarea') return <Textarea key={key} {...shared} value={value} onChange={(event) => updateFormField(key, event.target.value)} rows="4" containerStyle={{ gridColumn: '1 / -1' }} />
            if (type === 'select' || type === 'select-ref') return <Select key={key} {...shared} value={value} onChange={(event) => updateFormField(key, event.target.value)}><option value="">Выберите</option>{fieldOptions(field).map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</Select>
            if (type === 'date') return <DateField key={key} {...shared} value={value} onChange={(next) => updateFormField(key, next)} />
            if (type === 'time') return <TimeField key={key} {...shared} value={value} onChange={(next) => updateFormField(key, next)} />
            if (type === 'schedule-color') return <ScheduleColorPicker key={key} {...shared} value={value} onChange={(next) => updateFormField(key, next)} disabled={loading} />
            return <Input key={key} {...shared} value={value} onChange={(event) => updateFormField(key, event.target.value)} type={type} />
          })}</div>
        </fieldset>
      </FormModal>
      <FormModal
        open={credentialsOpen}
        title="Данные входа администратора"
        description="Для подтверждения изменений введите текущий пароль."
        size="md"
        busy={loading}
        dirty={credentialsDirty}
        onRequestClose={closeCredentials}
        footer={({ requestClose }) => <>
          <Button variant="primary" disabled={loading || !credentials.currentPassword} onClick={saveCredentials}>Обновить данные входа</Button>
          <Button variant="secondary" disabled={loading} onClick={() => requestClose('cancel')}>Отмена</Button>
        </>}
      >
        {credentialModalError && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setCredentialModalError(null)}>{credentialModalError}</Banner>}
        <fieldset disabled={loading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="ops-form-grid">
            <Input id={CREDENTIAL_FIELD_IDS.username} label="Новый логин" value={credentials.username} error={credentialErrors.username} onChange={(event) => updateCredentialField('username', event.target.value)} autoComplete="username" />
            <Input id={CREDENTIAL_FIELD_IDS.currentPassword} label="Текущий пароль" type="password" value={credentials.currentPassword} error={credentialErrors.currentPassword} onChange={(event) => updateCredentialField('currentPassword', event.target.value)} autoComplete="current-password" />
            <Input id={CREDENTIAL_FIELD_IDS.newPassword} label="Новый пароль (необязательно)" type="password" value={credentials.newPassword} error={credentialErrors.newPassword} onChange={(event) => updateCredentialField('newPassword', event.target.value)} autoComplete="new-password" />
            <Input id={CREDENTIAL_FIELD_IDS.confirmPassword} label="Повторите новый пароль" type="password" value={credentials.confirmPassword} error={credentialErrors.confirmPassword} onChange={(event) => updateCredentialField('confirmPassword', event.target.value)} autoComplete="new-password" />
          </div>
        </fieldset>
      </FormModal>
      {pendingArchive && <Dialog
        open
        title="Убрать запись из рабочего списка?"
        description={`«${pendingArchive.name || pendingArchive.label || pendingArchive.code || pendingArchive.id}» перестанет отображаться в активном справочнике.`}
        confirmLabel="Убрать"
        cancelLabel="Отмена"
        tone="danger"
        onClose={() => loading ? null : setPendingArchive(null)}
        onConfirm={() => archive(pendingArchive)}
      />}
    </div>
  }
}
