import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'

export function createAdminClientsScreen(components, reloadRoleData) {
  const { Table, StatusPill, Avatar, Button, Banner, Input, Dialog } = components
  return function ApiAdminClients({ go }) {
    const rows = globalThis.AdminData?.clients || []
    const groups = globalThis.AdminData?.groups || []
    const clientOptions = Array.from(
      new Map(rows.filter((row) => row.clientId).map((row) => [row.clientId, row])).values(),
    )
    const [clientForm, setClientForm] = useState({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      participantFirstName: '',
      participantLastName: '',
      birthDate: '',
      groupId: '',
      isAdult: false,
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
    const [busy, setBusy] = useState(false)
    const [quickAction, setQuickAction] = useState(null)
    const [query, setQuery] = useState('')
    const [scope, setScope] = useState('active')
    const [clientAction, setClientAction] = useState(null)
    const scopedRows = scope === 'blacklist'
      ? Array.from(new Map(rows.filter((row) => row.accountActive === false).map((row) => [row.clientId, row])).values())
      : rows.filter((row) => row.accountActive !== false && row.isActive)
    const filteredRows = scopedRows.filter((row) => {
      const needle = query.trim().toLocaleLowerCase('ru-RU')
      if (!needle) return true
      return [row.first, row.last, row.phone, row.email, row.group].some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(needle))
    })

    const updateClientForm = (field, value) => setClientForm((current) => ({ ...current, [field]: value }))
    const updateParticipantForm = (field, value) => setParticipantForm((current) => ({ ...current, [field]: value }))
    const updateClientEditForm = (field, value) => setClientEditForm((current) => ({ ...current, [field]: value }))

    function splitFullName(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
      return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') }
    }

    async function openClientEdit(row) {
      setEditingClient(row)
      setClientEditForm({
        accountFirstName: '',
        accountLastName: '',
        accountEmail: row.email || '',
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
          accountPhone: account.phone || row.phone || '',
        }))
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function createClient() {
      setBusy(true)
      setError(null)
      try {
        const participantFirstName = clientForm.participantFirstName || clientForm.firstName
        const participantLastName = clientForm.participantLastName || clientForm.lastName
        await api.post('/api/admin/clients/', {
          client_type: clientForm.isAdult ? 'adult' : 'family',
          is_adult: clientForm.isAdult,
          account: {
            first_name: clientForm.firstName,
            last_name: clientForm.lastName,
            email: clientForm.email,
            phone: clientForm.phone,
          },
          participant: {
            first_name: participantFirstName,
            last_name: participantLastName,
            birth_date: clientForm.birthDate || null,
            group_id: clientForm.groupId || null,
            is_account_holder: clientForm.isAdult,
          },
        })
        setMessage('Клиент создан.')
        setQuickAction(null)
        setClientForm({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          participantFirstName: '',
          participantLastName: '',
          birthDate: '',
          groupId: '',
          isAdult: false,
        })
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function addParticipant() {
      if (!participantForm.clientId) {
        setError('Выберите аккаунт клиента.')
        return
      }
      setBusy(true)
      setError(null)
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
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function saveClientEdit() {
      if (!editingClient) return
      setBusy(true)
      setError(null)
      try {
        if (editingClient.clientId) {
          await api.post(`/api/admin/clients/${editingClient.clientId}/`, {
            account: {
              first_name: clientEditForm.accountFirstName,
              last_name: clientEditForm.accountLastName,
              email: clientEditForm.accountEmail,
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
        setError(err.message)
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
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h2 className="page-title">Клиенты</h2>
            <p className="page-desc">Родители, дети, контакты и связанные группы.</p>
          </div>
        </div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
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
              <Input label="Имя владельца аккаунта" value={clientForm.firstName} onChange={(event) => updateClientForm('firstName', event.target.value)} />
              <Input label="Фамилия владельца" value={clientForm.lastName} onChange={(event) => updateClientForm('lastName', event.target.value)} />
              <Input label="Email" value={clientForm.email} onChange={(event) => updateClientForm('email', event.target.value)} />
              <Input label="Телефон" value={clientForm.phone} onChange={(event) => updateClientForm('phone', event.target.value)} />
              <Input label="Имя участника" value={clientForm.participantFirstName} onChange={(event) => updateClientForm('participantFirstName', event.target.value)} placeholder="Как у владельца" />
              <Input label="Фамилия участника" value={clientForm.participantLastName} onChange={(event) => updateClientForm('participantLastName', event.target.value)} placeholder="Как у владельца" />
              <Input label="Дата рождения" value={clientForm.birthDate} onChange={(event) => updateClientForm('birthDate', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Группа
                <select value={clientForm.groupId} onChange={(event) => updateClientForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Индивидуально</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={clientForm.isAdult} onChange={(event) => updateClientForm('isAdult', event.target.checked)} />
              Взрослый клиент сам является участником
            </label>
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
                label="Аккаунт клиента"
                value={participantForm.clientId}
                onChange={(value) => updateParticipantForm('clientId', value)}
                options={clientOptions.map((row) => clientSelectOption(row, {
                  valueKey: 'clientId',
                  description: (client) => client.phone || client.email || `ID ${client.clientId}`,
                }))}
                placeholder="Найдите аккаунт по имени или фамилии"
              />
              <Input label="Имя" value={participantForm.firstName} onChange={(event) => updateParticipantForm('firstName', event.target.value)} />
              <Input label="Фамилия" value={participantForm.lastName} onChange={(event) => updateParticipantForm('lastName', event.target.value)} />
              <Input label="Дата рождения" value={participantForm.birthDate} onChange={(event) => updateParticipantForm('birthDate', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
              <Input label="Email" value={participantForm.email} onChange={(event) => updateParticipantForm('email', event.target.value)} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)', gridColumn: '1 / -1' }}>
                Группа
                <select value={participantForm.groupId} onChange={(event) => updateParticipantForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
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
              <Input label="Имя владельца" value={clientEditForm.accountFirstName} onChange={(event) => updateClientEditForm('accountFirstName', event.target.value)} />
              <Input label="Фамилия владельца" value={clientEditForm.accountLastName} onChange={(event) => updateClientEditForm('accountLastName', event.target.value)} />
              <Input label="Email владельца" value={clientEditForm.accountEmail} onChange={(event) => updateClientEditForm('accountEmail', event.target.value)} />
              <Input label="Телефон владельца" value={clientEditForm.accountPhone} onChange={(event) => updateClientEditForm('accountPhone', event.target.value)} />
              <Input label="Имя участника" value={clientEditForm.firstName} onChange={(event) => updateClientEditForm('firstName', event.target.value)} />
              <Input label="Фамилия участника" value={clientEditForm.lastName} onChange={(event) => updateClientEditForm('lastName', event.target.value)} />
              <Input label="Дата рождения" value={clientEditForm.birthDate} onChange={(event) => updateClientEditForm('birthDate', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
              <Input label="Email участника" value={clientEditForm.email} onChange={(event) => updateClientEditForm('email', event.target.value)} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Группа
                <select value={clientEditForm.groupId} onChange={(event) => updateClientEditForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
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
          </div>
          <span className="muted">Найдено: {filteredRows.length}</span>
        </div>
        <Table
          rows={filteredRows}
          emptyLabel={scope === 'blacklist' ? 'Чёрный список пуст' : 'Активных клиентов пока нет'}
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
            { key: 'finance', header: 'Финансы', width: 110, render: (row) => <button type="button" className="ops-count-button" disabled={!row.clientId} onClick={() => go?.('clientDetail', { clientId: row.clientId, tab: 'subscriptions' })}>Открыть</button> },
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

