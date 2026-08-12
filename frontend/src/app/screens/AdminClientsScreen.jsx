import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { updateClientIdentity } from '../clientContracts.js'
import {
  clearFieldError,
  fieldErrorsFromApi,
  focusFirstFieldError,
  formErrorMessage,
} from '../formErrors.js'
import { BusyBanner } from '../runtime.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'
import { DateField } from '../DateTimeField.jsx'
import { ToastNotice } from '../ToastProvider.jsx'

const CLIENT_FIELD_MAP = {
  'account.first_name': 'firstName',
  'account.last_name': 'lastName',
  'account.email': 'email',
  'account.username': 'username',
  'account.phone': 'phone',
  'participant.birth_date': 'birthDate',
  'participant.group_id': 'groupId',
  birth_date: 'birthDate',
  group_id: 'groupId',
}

const CLIENT_FIELD_IDS = {
  firstName: 'admin-client-firstName',
  lastName: 'admin-client-lastName',
  email: 'admin-client-email',
  username: 'admin-client-username',
  phone: 'admin-client-phone',
  birthDate: 'admin-client-birthDate',
  groupId: 'admin-client-groupId',
}

const CLIENT_EDIT_FIELD_MAP = {
  'account.first_name': 'accountFirstName',
  'account.last_name': 'accountLastName',
  'account.email': 'accountEmail',
  'account.username': 'accountUsername',
  'account.phone': 'accountPhone',
  birth_date: 'birthDate',
  group_id: 'groupId',
}

const PARTICIPANT_FIELD_MAP = {
  'participant.first_name': 'firstName',
  'participant.last_name': 'lastName',
  'participant.birth_date': 'birthDate',
  'participant.email': 'email',
  'participant.group_id': 'groupId',
  first_name: 'firstName',
  last_name: 'lastName',
  birth_date: 'birthDate',
  email: 'email',
  group_id: 'groupId',
}

export function createAdminClientsScreen(components, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Avatar, Button, Banner, Badge, Money, Input, Dialog } = components
  return function ApiAdminClients({ go }) {
    const rows = adminData.clients || []
    const groups = adminData.groups || []
    const clientOptions = Array.from(
      new Map(rows.filter((row) => row.clientId).map((row) => [row.clientId, row])).values(),
    )
    const [clientForm, setClientForm] = useState({
      firstName: '',
      lastName: '',
      email: '',
      username: '',
      usernameManual: false,
      phone: '',
      birthDate: '',
      groupId: '',
    })
    const [participantForm, setParticipantForm] = useState({
      clientId: '',
      firstName: '',
      lastName: '',
      birthDate: '',
      email: '',
      groupId: '',
    })
    const [editingClient, setEditingClient] = useState(null)
    const [clientEditForm, setClientEditForm] = useState({
      accountFirstName: '',
      accountLastName: '',
      accountEmail: '',
      accountUsername: '',
      accountPhone: '',
      firstName: '',
      lastName: '',
      birthDate: '',
      email: '',
      groupId: '',
      isActive: true,
    })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [clientFieldErrors, setClientFieldErrors] = useState({})
    const [participantFieldErrors, setParticipantFieldErrors] = useState({})
    const [clientEditFieldErrors, setClientEditFieldErrors] = useState({})
    const [busy, setBusy] = useState(false)
    const [quickAction, setQuickAction] = useState(null)
    const [query, setQuery] = useState('')
    const [scope, setScope] = useState('active')
    const [subscriptionFilter, setSubscriptionFilter] = useState('all')
    const [balanceFilter, setBalanceFilter] = useState('all')
    const [activityFilter, setActivityFilter] = useState('all')
    const [clientAction, setClientAction] = useState(null)
    const scopedRows = scope === 'blacklist'
      ? Array.from(new Map(rows.filter((row) => row.accountActive === false).map((row) => [row.clientId, row])).values())
      : rows.filter((row) => row.accountActive !== false && row.isActive)
    const filteredRows = scopedRows.filter((row) => {
      const needle = query.trim().toLocaleLowerCase('ru-RU')
      if (needle && ![row.first, row.last, row.phone, row.email, row.group].some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(needle))) return false
      if (subscriptionFilter === 'with' && !row.hasCurrentSubscription) return false
      if (subscriptionFilter === 'without' && row.hasCurrentSubscription) return false
      if (balanceFilter === 'positive' && row.balance <= 0) return false
      if (balanceFilter === 'negative' && row.balance >= 0) return false
      if (activityFilter === 'active' && !row.isRecentlyActive) return false
      if (activityFilter === 'inactive' && row.isRecentlyActive) return false
      return true
    })
    const hasActiveFilter = Boolean(query.trim()) || subscriptionFilter !== 'all' || balanceFilter !== 'all' || activityFilter !== 'all'
    const emptyLabel = hasActiveFilter && scopedRows.length
      ? 'По заданным фильтрам ничего не найдено.'
      : scope === 'blacklist'
        ? 'Чёрный список пуст'
        : 'Активных клиентов пока нет'

    function resetFilters() {
      setQuery('')
      setSubscriptionFilter('all')
      setBalanceFilter('all')
      setActivityFilter('all')
    }

    const subscriptionUsage = (row) => {
      if (!row.hasCurrentSubscription) return 'Нет'
      if (row.currentSubscriptionIsUnlimited) return 'Безлимит'
      return `${row.currentSubscriptionRemaining} из ${row.currentSubscriptionTotal}`
    }

    const updateClientForm = (field, value) => {
      setClientFieldErrors((current) => {
        let next = clearFieldError(current, field)
        if (!clientForm.usernameManual
            && ['firstName', 'lastName', 'email', 'phone'].includes(field)) {
          next = clearFieldError(next, 'username')
        }
        return next
      })
      setClientForm((current) => updateClientIdentity(current, field, value))
    }
    const updateParticipantForm = (field, value) => {
      setParticipantFieldErrors((current) => clearFieldError(current, field))
      setParticipantForm((current) => ({ ...current, [field]: value }))
    }
    const updateClientEditForm = (field, value) => {
      setClientEditFieldErrors((current) => clearFieldError(current, field))
      setClientEditForm((current) => ({ ...current, [field]: value }))
    }

    function splitFullName(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
      return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') }
    }

    async function openClientEdit(row) {
      setEditingClient(row)
      setClientEditFieldErrors({})
      setClientEditForm({
        accountFirstName: '',
        accountLastName: '',
        accountEmail: row.email || '',
        accountUsername: '',
        accountPhone: row.phone || '',
        firstName: row.first || '',
        lastName: row.last || '',
        birthDate: row.born === '-' ? '' : row.born || '',
        email: row.email || '',
        groupId: row.groupId || '',
        isActive: row.isActive,
      })
      if (!row.clientId) return
      setBusy(true)
      setError(null)
      try {
        const detail = await api.get(`/api/admin/clients/${row.clientId}/`)
        const account = detail.account || {}
        const accountName = splitFullName(account.full_name)
        setClientEditForm((current) => ({
          ...current,
          accountFirstName: account.first_name || accountName.firstName,
          accountLastName: account.last_name || accountName.lastName,
          accountEmail: account.email || '',
          accountUsername: account.username || '',
          accountPhone: account.phone || row.phone || '',
        }))
      } catch (err) {
        setError(apiErrorMessage(err, 'Не удалось загрузить данные клиента.'))
      } finally {
        setBusy(false)
      }
    }

    async function createClient() {
      setBusy(true)
      setError(null)
      setClientFieldErrors({})
      try {
        await api.post('/api/admin/clients/', {
          client_type: 'adult',
          is_adult: true,
          account: {
            first_name: clientForm.firstName,
            last_name: clientForm.lastName,
            email: clientForm.email,
            username: clientForm.username,
            phone: clientForm.phone,
          },
          participant: {
            first_name: clientForm.firstName,
            last_name: clientForm.lastName,
            birth_date: clientForm.birthDate || null,
            group_id: clientForm.groupId || null,
            is_account_holder: true,
          },
        })
        setMessage('Клиент создан.')
        setQuickAction(null)
        setClientForm({
          firstName: '',
          lastName: '',
          email: '',
          username: '',
          usernameManual: false,
          phone: '',
          birthDate: '',
          groupId: '',
        })
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, CLIENT_FIELD_MAP)
        setClientFieldErrors(nextErrors)
        setError(formErrorMessage(err, 'Не удалось создать клиента.'))
        setTimeout(() => focusFirstFieldError(nextErrors, CLIENT_FIELD_IDS), 0)
      } finally {
        setBusy(false)
      }
    }

    async function addParticipant() {
      if (!participantForm.clientId) {
        setParticipantFieldErrors({ clientId: 'Выберите аккаунт клиента.' })
        setTimeout(() => focusFirstFieldError(
          { clientId: true }, { clientId: 'admin-participant-clientId' }), 0)
        return
      }
      setBusy(true)
      setError(null)
      setParticipantFieldErrors({})
      try {
        await api.post(`/api/admin/clients/${participantForm.clientId}/participants/`, {
          participant: {
            first_name: participantForm.firstName,
            last_name: participantForm.lastName,
            birth_date: participantForm.birthDate || null,
            email: participantForm.email,
            group_id: participantForm.groupId || null,
          },
        })
        setMessage('Участник добавлен к аккаунту клиента.')
        setQuickAction(null)
        setParticipantForm({ clientId: participantForm.clientId, firstName: '', lastName: '', birthDate: '', email: '', groupId: '' })
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, PARTICIPANT_FIELD_MAP)
        setParticipantFieldErrors(nextErrors)
        setError(formErrorMessage(err, 'Не удалось добавить участника.'))
        setTimeout(() => focusFirstFieldError(nextErrors, {
          clientId: 'admin-participant-clientId',
          firstName: 'admin-participant-firstName',
          lastName: 'admin-participant-lastName',
          birthDate: 'admin-participant-birthDate',
          email: 'admin-participant-email',
          groupId: 'admin-participant-groupId',
        }), 0)
      } finally {
        setBusy(false)
      }
    }

    async function saveClientEdit() {
      if (!editingClient) return
      setBusy(true)
      setError(null)
      setClientEditFieldErrors({})
      try {
        if (editingClient.clientId) {
          await api.post(`/api/admin/clients/${editingClient.clientId}/`, {
            account: {
              first_name: clientEditForm.accountFirstName,
              last_name: clientEditForm.accountLastName,
              email: clientEditForm.accountEmail,
              username: clientEditForm.accountUsername,
              phone: clientEditForm.accountPhone,
            },
          })
        }
        await api.post(`/api/admin/participants/${editingClient.studentId}/`, {
          participant: {
            first_name: clientEditForm.firstName,
            last_name: clientEditForm.lastName,
            birth_date: clientEditForm.birthDate || null,
            email: clientEditForm.email,
            group_id: clientEditForm.groupId || null,
            is_active: clientEditForm.isActive,
          },
        })
        setEditingClient(null)
        setMessage('Данные клиента и участника обновлены.')
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, {
          ...CLIENT_EDIT_FIELD_MAP,
          ...PARTICIPANT_FIELD_MAP,
        })
        setClientEditFieldErrors(nextErrors)
        setError(formErrorMessage(err, 'Не удалось сохранить данные клиента.'))
        setTimeout(() => focusFirstFieldError(nextErrors, {
          accountFirstName: 'admin-client-edit-accountFirstName',
          accountLastName: 'admin-client-edit-accountLastName',
          accountEmail: 'admin-client-edit-accountEmail',
          accountUsername: 'admin-client-edit-accountUsername',
          accountPhone: 'admin-client-edit-accountPhone',
          firstName: 'admin-client-edit-firstName',
          lastName: 'admin-client-edit-lastName',
          birthDate: 'admin-client-edit-birthDate',
          email: 'admin-client-edit-email',
          groupId: 'admin-client-edit-groupId',
        }), 0)
      } finally {
        setBusy(false)
      }
    }

    async function applyClientAction() {
      if (!clientAction?.row?.clientId) return
      setBusy(true)
      setError(null)
      try {
        if (clientAction.type === 'archive') {
          await api.delete(`/api/admin/clients/${clientAction.row.clientId}/`)
          setMessage('Клиент перемещён в чёрный список. Вся история сохранена.')
        } else {
          await api.post(`/api/admin/clients/${clientAction.row.clientId}/restore/`)
          setMessage('Клиент восстановлен и снова отображается в рабочем списке.')
        }
        setClientAction(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, 'Не удалось изменить статус клиента.'))
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h1 className="page-title">Клиенты</h1>
            <p className="page-desc">Родители, дети, контакты и связанные группы.</p>
          </div>
        </div>
        <ToastNotice id="admin-clients-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Сохраняю данные клиента...</BusyBanner>

        <div className="ops-action-strip">
          <button type="button" className={`ops-action-card${quickAction === 'client' ? ' is-active' : ''}`} onClick={() => setQuickAction((current) => current === 'client' ? null : 'client')}>
            <span>Новый клиент</span>
            <small>Открыть форму создания</small>
          </button>
          <button type="button" className={`ops-action-card${quickAction === 'participant' ? ' is-active' : ''}`} onClick={() => setQuickAction((current) => current === 'participant' ? null : 'participant')}>
            <span>Участник к аккаунту</span>
            <small>Добавить второго ребенка/участника</small>
          </button>
        </div>

        {quickAction && (
        <div style={{ display: 'grid', gridTemplateColumns: quickAction === 'client' ? 'minmax(320px, 1fr)' : 'minmax(320px, 1fr)', gap: 14, marginBottom: 16 }}>
          {quickAction === 'client' && (
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Новый клиент</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Input id="admin-client-firstName" label="Имя владельца аккаунта" value={clientForm.firstName} error={clientFieldErrors.firstName} onChange={(event) => updateClientForm('firstName', event.target.value)} />
              <Input id="admin-client-lastName" label="Фамилия владельца" value={clientForm.lastName} error={clientFieldErrors.lastName} onChange={(event) => updateClientForm('lastName', event.target.value)} />
              <Input id="admin-client-email" label="Email" value={clientForm.email} error={clientFieldErrors.email} onChange={(event) => updateClientForm('email', event.target.value)} />
              <Input id="admin-client-username" label="Логин" value={clientForm.username} error={clientFieldErrors.username} hint="Автоматически из email, телефона или имени; можно изменить." onChange={(event) => updateClientForm('username', event.target.value)} />
              <Input id="admin-client-phone" label="Телефон" value={clientForm.phone} error={clientFieldErrors.phone} onChange={(event) => updateClientForm('phone', event.target.value)} />
              <DateField id="admin-client-birthDate" label="Дата рождения" value={clientForm.birthDate} error={clientFieldErrors.birthDate} onChange={(value) => updateClientForm('birthDate', value)} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Группа
                <select id="admin-client-groupId" value={clientForm.groupId} aria-invalid={Boolean(clientFieldErrors.groupId)} aria-describedby={clientFieldErrors.groupId ? 'admin-client-groupId-error' : undefined} onChange={(event) => updateClientForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Индивидуально</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
                {clientFieldErrors.groupId && <small id="admin-client-groupId-error" className="ops-field-error" role="alert">{clientFieldErrors.groupId}</small>}
              </label>
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: 'var(--fs-sm)' }}>Владелец аккаунта будет создан как участник. Другого участника можно добавить отдельным действием.</p>
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" loading={busy && !editingClient} disabled={busy} onClick={createClient}>Создать клиента</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setQuickAction(null)} style={{ marginLeft: 8 }}>Закрыть</Button>
            </div>
          </div>
          )}

          {quickAction === 'participant' && (
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Новый участник аккаунта</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SearchableSelect
                className="ops-grid-full"
                inputId="admin-participant-clientId"
                label="Аккаунт клиента"
                value={participantForm.clientId}
                error={participantFieldErrors.clientId}
                onChange={(value) => updateParticipantForm('clientId', value)}
                options={clientOptions.map((row) => clientSelectOption(row, {
                  valueKey: 'clientId',
                  description: (client) => client.phone || client.email || `ID ${client.clientId}`,
                }))}
                placeholder="Найдите аккаунт по имени или фамилии"
              />
              <Input id="admin-participant-firstName" label="Имя" value={participantForm.firstName} error={participantFieldErrors.firstName} onChange={(event) => updateParticipantForm('firstName', event.target.value)} />
              <Input id="admin-participant-lastName" label="Фамилия" value={participantForm.lastName} error={participantFieldErrors.lastName} onChange={(event) => updateParticipantForm('lastName', event.target.value)} />
              <DateField id="admin-participant-birthDate" label="Дата рождения" value={participantForm.birthDate} error={participantFieldErrors.birthDate} onChange={(value) => updateParticipantForm('birthDate', value)} />
              <Input id="admin-participant-email" label="Email" value={participantForm.email} error={participantFieldErrors.email} onChange={(event) => updateParticipantForm('email', event.target.value)} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)', gridColumn: '1 / -1' }}>
                Группа
                <select id="admin-participant-groupId" value={participantForm.groupId} aria-invalid={Boolean(participantFieldErrors.groupId)} aria-describedby={participantFieldErrors.groupId ? 'admin-participant-groupId-error' : undefined} onChange={(event) => updateParticipantForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Индивидуально</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" loading={busy && !editingClient} disabled={busy} onClick={addParticipant}>Добавить участника</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setQuickAction(null)} style={{ marginLeft: 8 }}>Закрыть</Button>
            </div>
          </div>
          )}
        </div>
        )}
        {editingClient && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Редактирование клиента и участника</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10 }}>
              <Input id="admin-client-edit-accountFirstName" label="Имя владельца" value={clientEditForm.accountFirstName} error={clientEditFieldErrors.accountFirstName} onChange={(event) => updateClientEditForm('accountFirstName', event.target.value)} />
              <Input id="admin-client-edit-accountLastName" label="Фамилия владельца" value={clientEditForm.accountLastName} error={clientEditFieldErrors.accountLastName} onChange={(event) => updateClientEditForm('accountLastName', event.target.value)} />
              <Input id="admin-client-edit-accountEmail" label="Email владельца" value={clientEditForm.accountEmail} error={clientEditFieldErrors.accountEmail} onChange={(event) => updateClientEditForm('accountEmail', event.target.value)} />
              <Input id="admin-client-edit-accountUsername" label="Логин" value={clientEditForm.accountUsername} error={clientEditFieldErrors.accountUsername} onChange={(event) => updateClientEditForm('accountUsername', event.target.value)} />
              <Input id="admin-client-edit-accountPhone" label="Телефон владельца" value={clientEditForm.accountPhone} error={clientEditFieldErrors.accountPhone} onChange={(event) => updateClientEditForm('accountPhone', event.target.value)} />
              <Input id="admin-client-edit-firstName" label="Имя участника" value={clientEditForm.firstName} error={clientEditFieldErrors.firstName} onChange={(event) => updateClientEditForm('firstName', event.target.value)} />
              <Input id="admin-client-edit-lastName" label="Фамилия участника" value={clientEditForm.lastName} error={clientEditFieldErrors.lastName} onChange={(event) => updateClientEditForm('lastName', event.target.value)} />
              <DateField id="admin-client-edit-birthDate" label="Дата рождения" value={clientEditForm.birthDate} error={clientEditFieldErrors.birthDate} onChange={(value) => updateClientEditForm('birthDate', value)} />
              <Input id="admin-client-edit-email" label="Email участника" value={clientEditForm.email} error={clientEditFieldErrors.email} onChange={(event) => updateClientEditForm('email', event.target.value)} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Группа
                <select id="admin-client-edit-groupId" value={clientEditForm.groupId} aria-invalid={Boolean(clientEditFieldErrors.groupId)} aria-describedby={clientEditFieldErrors.groupId ? 'admin-client-edit-groupId-error' : undefined} onChange={(event) => updateClientEditForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Индивидуально</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                <input type="checkbox" checked={clientEditForm.isActive} onChange={(event) => updateClientEditForm('isActive', event.target.checked)} />
                Активен
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" loading={busy} disabled={busy} onClick={saveClientEdit}>Сохранить</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setEditingClient(null)}>Закрыть</Button>
            </div>
          </div>
        )}
        <div className="ops-command-row">
          <div className="ops-client-list-tools">
            <div className="seg" aria-label="Режим списка клиентов">
              <button type="button" className={scope === 'active' ? 'on' : ''} onClick={() => setScope('active')}>Клиенты</button>
              <button type="button" className={scope === 'blacklist' ? 'on' : ''} onClick={() => setScope('blacklist')}>Чёрный список</button>
            </div>
            <div className="ops-search">
              <span aria-hidden="true">⌕</span>
              <input aria-label="Поиск клиентов" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, телефон, email или группа" />
            </div>
            <div className="ops-client-filter-selects">
              <label className="ops-client-filter-field">
                <span>Абонемент</span>
                <select aria-label="Абонемент" value={subscriptionFilter} onChange={(event) => setSubscriptionFilter(event.target.value)}>
                  <option value="all">Все</option>
                  <option value="with">Есть</option>
                  <option value="without">Нет</option>
                </select>
                {clientEditFieldErrors.groupId && <small id="admin-client-edit-groupId-error" className="ops-field-error" role="alert">{clientEditFieldErrors.groupId}</small>}
                {participantFieldErrors.groupId && <small id="admin-participant-groupId-error" className="ops-field-error" role="alert">{participantFieldErrors.groupId}</small>}
              </label>
              <label className="ops-client-filter-field">
                <span>Баланс</span>
                <select aria-label="Баланс" value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value)}>
                  <option value="all">Любой</option>
                  <option value="positive">Положительный — переплата</option>
                  <option value="negative">Отрицательный — долг</option>
                </select>
              </label>
              <label className="ops-client-filter-field">
                <span>Активность</span>
                <select aria-label="Активность" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}>
                  <option value="all">Все</option>
                  <option value="active">Активные за 60 дней</option>
                  <option value="inactive">Неактивные</option>
                </select>
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="muted">Найдено: {filteredRows.length}</span>
            {hasActiveFilter && (
              <Button size="sm" variant="subtle" onClick={resetFilters}>Сбросить фильтры</Button>
            )}
          </div>
        </div>
        <div className="ops-client-desktop-table">
          <Table
            rows={filteredRows}
            emptyLabel={emptyLabel}
            columns={[
              { key: 'name', header: 'Участник', render: (row) => (
                <button type="button" className="ops-link-button" disabled={!row.clientId} onClick={() => go?.('clientDetail', { clientId: row.clientId })}>
                  <Avatar name={`${row.first} ${row.last}`} size={28} />
                  <span className="strong">{row.last} {row.first}</span>
                </button>
              ) },
              { key: 'phone', header: 'Телефон', muted: true, render: (row) => <span className="mono">{row.phone || '-'}</span> },
              { key: 'email', header: 'Email', muted: true },
              { key: 'group', header: 'Группа', render: (row) => row.groupId ? <button type="button" className="ops-link-button" onClick={() => go?.('groups', { groupId: row.groupId })}>{row.group}</button> : row.group },
              { key: 'subscription', header: 'Абонемент', width: 105, render: (row) => <Badge tone={row.hasCurrentSubscription ? 'success' : 'neutral'}>{subscriptionUsage(row)}</Badge> },
              { key: 'balance', header: 'Баланс', align: 'right', width: 105, render: (row) => <Money amount={row.balance} signed currency="zł" /> },
              { key: 'activity', header: 'Активность', width: 150, render: (row) => (
                <span className="ops-client-activity">
                  <StatusPill status={row.isRecentlyActive ? 'active' : 'inactive'} size="sm" />
                  <small>{row.lastPresentAt ? formatDate(row.lastPresentAt) : 'Не посещал'}</small>
                </span>
              ) },
              { key: 'status', header: 'Статус', width: 110, render: (row) => <StatusPill status={row.status} size="sm" /> },
              {
                key: 'act',
                header: '',
                width: 170,
                render: (row) => (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button size="sm" variant="subtle" disabled={busy || !row.clientId} onClick={() => go?.('clientDetail', { clientId: row.clientId })}>Карточка</Button>
                    {scope === 'active' ? (
                      <>
                        <Button size="sm" variant="subtle" disabled={busy} onClick={() => openClientEdit(row)}>Изменить</Button>
                        <Button size="sm" variant="subtle" disabled={busy} onClick={() => setClientAction({ type: 'archive', row })}>В чёрный список</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => setClientAction({ type: 'restore', row })}>Восстановить</Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
        <div className="ops-client-mobile-list">
          {filteredRows.map((row) => {
            const Card = row.clientId ? 'button' : 'article'
            return (
              <Card
                key={row.id}
                type={row.clientId ? 'button' : undefined}
                className={`ops-client-mobile-card${row.clientId ? ' is-linked' : ''}`}
                aria-label={row.clientId ? `Открыть профиль клиента ${row.last} ${row.first}` : undefined}
                onClick={row.clientId ? () => go?.('clientDetail', { clientId: row.clientId }) : undefined}
              >
                <span className="ops-client-mobile-person">
                  <Avatar name={`${row.first} ${row.last}`} size={32} />
                  <strong>{row.last} {row.first}</strong>
                  <StatusPill status={row.status} size="sm" />
                </span>
                <span className="ops-client-mobile-details">
                  <span><small>Телефон</small><span className="mono">{row.phone || '-'}</span></span>
                  <span><small>Email</small><span>{row.email || '-'}</span></span>
                  <span><small>Группа</small><span>{row.group || 'Индивидуально'}</span></span>
                  <span><small>Абонемент</small><span>{subscriptionUsage(row)}</span></span>
                  <span><small>Баланс</small><Money amount={row.balance} signed currency="zł" /></span>
                  <span><small>Активность</small><span>{row.isRecentlyActive ? 'Активен' : 'Неактивен'} · {row.lastPresentAt ? formatDate(row.lastPresentAt) : 'Не посещал'}</span></span>
                </span>
              </Card>
            )
          })}
          {!filteredRows.length && <div className="empty">{emptyLabel}</div>}
        </div>
        {clientAction && (
          <Dialog
            title={clientAction.type === 'archive' ? 'Переместить клиента в чёрный список?' : 'Восстановить клиента?'}
            description={clientAction.type === 'archive'
              ? 'Клиент исчезнет из рабочего списка, но платежи, посещения, абонементы и журнал действий останутся в системе.'
              : 'Аккаунт и его участники снова станут активными и появятся в рабочем списке.'}
            tone={clientAction.type === 'archive' ? 'danger' : 'default'}
            confirmLabel={clientAction.type === 'archive' ? 'В чёрный список' : 'Восстановить'}
            onClose={() => busy ? null : setClientAction(null)}
            onConfirm={applyClientAction}
          >
            <div className="strong">{clientAction.row.last} {clientAction.row.first}</div>
          </Dialog>
        )}
      </div>
    )
  }
}

