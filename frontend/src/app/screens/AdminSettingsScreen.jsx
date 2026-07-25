import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../../api.js'
import { createAdminImportExportPanel } from './AdminImportExportScreen.jsx'

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
  { tab: 'catalog', id: 'sessionTypes', title: 'Типы занятий', endpoint: '/api/admin/settings/session-types/', response: 'session_types', detail: (id) => `/api/admin/settings/session-types/${id}/`, fields: [['code', 'Тип', 'select', sessionTypes], ['label', 'Название'], ['default_capacity', 'Лимит по умолчанию', 'number'], ['is_active', 'Активен', 'boolean']] },
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
  // `panel` opts out of the CRUD-table shape: no endpoint to load, custom body.
  { tab: 'control', id: 'importExport', title: 'Импорт и экспорт', panel: true, readOnly: true },
  { tab: 'control', id: 'audit', title: 'Журнал действий', endpoint: '/api/admin/system/audit/', response: 'entries', readOnly: true },
  { tab: 'control', id: 'imports', title: 'История импортов', endpoint: '/api/admin/system/imports/', response: 'batches', readOnly: true },
  { tab: 'control', id: 'security', title: 'Доступы и 2FA', endpoint: '/api/admin/system/security/', response: 'users', readOnly: true },
  { tab: 'control', id: 'logs', title: 'Журнал уведомлений', endpoint: '/api/admin/notifications/logs/', response: 'logs', readOnly: true },
]

const tabs = [
  ['catalog', 'Справочники'], ['notifications', 'Уведомления'], ['payroll', 'Зарплата'], ['localization', 'Языки'], ['control', 'Контроль'],
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

export function createAdminSettingsScreen(components, reloadRoleData, icons) {
  const ImportExportPanel = createAdminImportExportPanel(components, icons, reloadRoleData)

  const { Button, Banner, Tabs, Table, Input, StatusPill, Dialog } = components
  return function AdminSettingsScreen() {
    const [tab, setTab] = useState('catalog')
    const [resourceId, setResourceId] = useState('subscriptionTypes')
    const [data, setData] = useState(() => ({ trainers: globalThis.AdminData?.trainers || [] }))
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [message, setMessage] = useState(null)
    const [editing, setEditing] = useState(null)
    const [pendingArchive, setPendingArchive] = useState(null)
    const [form, setForm] = useState({})

    const resource = resources.find((item) => item.id === resourceId) || resources[0]
    const tabResources = useMemo(() => resources.filter((item) => item.tab === tab), [tab])
    const rows = data[resource.id] || []

    const load = async (onlyId) => {
      const loadable = resources.filter((item) => item.endpoint)
      const needed = onlyId ? loadable.filter((item) => item.id === onlyId) : loadable
      setLoading(true)
      try {
        const responses = await Promise.all(needed.map(async (item) => [item.id, await api.get(item.endpoint)]))
        setData((current) => ({ ...current, ...Object.fromEntries(responses.map(([id, payload]) => [id, payload[resources.find((item) => item.id === id).response] || []])) }))
      } catch (err) {
        setError(err.message)
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
      setEditing(row || {})
    }

    function fieldOptions(field) {
      const [, , type, source, valueKey] = field
      if (type === 'select') return source
      if (type !== 'select-ref') return []
      return (data[source] || []).map((row) => [String(row[valueKey || 'id']), row.name || row.full_name || row.label || row.code || `#${row.id}`])
    }

    function coerce(value, type) {
      if (type === 'boolean') return Boolean(value)
      if (type === 'number') return value === '' ? null : Number(value)
      return value
    }

    async function save() {
      const payload = Object.fromEntries((resource.fields || []).map(([key, , type]) => [key, coerce(form[key], type)]))
      setLoading(true); setError(null)
      try {
        if (editing?.id) await api.post(resource.detail(editing.id), payload)
        else await api.post(resource.endpoint, payload)
        setMessage(editing?.id ? 'Изменения сохранены.' : 'Запись создана.')
        setEditing(null)
        await load(resource.id)
        reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
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
      } catch (err) { setError(err.message) } finally { setLoading(false) }
    }

    const columns = resource.readOnly
      ? [{ key: 'created_at', header: 'Когда', render: (row) => displayValue(row.created_at) }, { key: 'name', header: 'Запись', render: (row) => <span className="strong">{displayValue(row.full_name || row.source_name || row.action || row.recipient || row.date_from || row.username)}</span> }, { key: 'details', header: 'Детали', muted: true, render: readOnlyDetails }]
      : [{ key: 'name', header: resource.title, render: (row) => <span className="strong">{displayValue(row.name || row.label || row.code || row.event_type || row.trainer || row.domain)}</span> }, { key: 'details', header: 'Детали', muted: true, render: (row) => displayValue(row.address || row.scheme || row.channel || row.value || row.location || row.effective_from) }, { key: 'active', header: 'Статус', render: (row) => row.is_active == null ? '-' : <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> }, { key: 'actions', header: '', width: 180, render: (row) => <div className="ops-button-row"><Button size="sm" variant="subtle" disabled={loading} onClick={() => startEdit(row)}>Изменить</Button><Button size="sm" variant="subtle" disabled={loading} onClick={() => setPendingArchive(row)}>Убрать</Button></div> }]

    return <div className="page page-wide">
      <div className="page-head"><div><h2 className="page-title">Настройки и контроль</h2><p className="page-desc">Все служебные функции SwimCRM в одном месте. Django admin больше не нужен для ежедневной работы.</p></div>{!resource.panel && <Button variant="secondary" disabled={loading} onClick={() => load(resource.id)}>Обновить</Button>}</div>
      {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
      {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
      <Tabs value={tab} onChange={setTab} items={tabs.map(([value, label]) => ({ value, label }))} />
      <div className="ops-action-strip ops-settings-resources">{tabResources.map((item) => <button type="button" key={item.id} className={`ops-action-card${resource.id === item.id ? ' is-active' : ''}`} onClick={() => setResourceId(item.id)}><span>{item.title}</span><small>{item.readOnly ? 'Просмотр и контроль' : 'Создание и редактирование'}</small></button>)}</div>
      <div className="ops-section-head" style={{ margin: '8px 0 12px' }}><div><div className="eyebrow">{tabs.find(([value]) => value === tab)?.[1]}</div><h3 className="section-title" style={{ margin: '3px 0' }}>{resource.title}</h3></div>{!resource.readOnly && <Button variant="primary" disabled={loading} onClick={() => startEdit()}>Добавить</Button>}</div>
      {editing && <div className="card card-pad ops-edit-panel"><div className="eyebrow">{editing.id ? 'Редактирование' : 'Новая запись'}</div><div className="ops-form-grid">{(resource.fields || []).map((field) => { const [key, label, type = 'text'] = field; const value = form[key] ?? ''; if (type === 'boolean') return <label className="ops-check" key={key}><input type="checkbox" checked={Boolean(value)} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />{label}</label>; if (type === 'textarea') return <label key={key} style={{ gridColumn: '1 / -1' }}>{label}<textarea value={value} onChange={(event) => setForm({ ...form, [key]: event.target.value })} rows="4" /></label>; if (type === 'select' || type === 'select-ref') return <label key={key}>{label}<select value={value} onChange={(event) => setForm({ ...form, [key]: event.target.value })}><option value="">Выберите</option>{fieldOptions(field).map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>; return <Input key={key} label={label} value={value} onChange={(event) => setForm({ ...form, [key]: event.target.value })} type={type} /> })}</div><div className="ops-button-row"><Button variant="primary" disabled={loading} onClick={save}>Сохранить</Button><Button variant="secondary" disabled={loading} onClick={() => setEditing(null)}>Отмена</Button></div></div>}
      {resource.panel ? <ImportExportPanel /> : <Table rows={rows} emptyLabel={loading ? 'Загрузка...' : 'Записей пока нет'} columns={columns} />}
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
