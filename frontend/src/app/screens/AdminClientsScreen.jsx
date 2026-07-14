import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminClientsScreen(components, reloadRoleData) {
  const { Table, StatusPill, Avatar, Button, Banner, Input } = components
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
        setMessage('Klient utworzony w backendzie.')
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
        setError('Wybierz konto klienta.')
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
        setMessage('Uczestnik dodany do konta klienta.')
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
        setMessage('Klient i uczestnik zaktualizowani w backendzie.')
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
            <h2 className="page-title">Klienci</h2>
            <p className="page-desc">Tabela z /api/admin/clients/.</p>
          </div>
        </div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Trwa zapis danych klienta...</BusyBanner>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 14, marginBottom: 16 }}>
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Nowy klient</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Input label="Imie konta" value={clientForm.firstName} onChange={(event) => updateClientForm('firstName', event.target.value)} />
              <Input label="Nazwisko konta" value={clientForm.lastName} onChange={(event) => updateClientForm('lastName', event.target.value)} />
              <Input label="Email" value={clientForm.email} onChange={(event) => updateClientForm('email', event.target.value)} />
              <Input label="Telefon" value={clientForm.phone} onChange={(event) => updateClientForm('phone', event.target.value)} />
              <Input label="Imie uczestnika" value={clientForm.participantFirstName} onChange={(event) => updateClientForm('participantFirstName', event.target.value)} placeholder="Jak konto" />
              <Input label="Nazwisko uczestnika" value={clientForm.participantLastName} onChange={(event) => updateClientForm('participantLastName', event.target.value)} placeholder="Jak konto" />
              <Input label="Data ur." value={clientForm.birthDate} onChange={(event) => updateClientForm('birthDate', event.target.value)} placeholder="YYYY-MM-DD" />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Grupa
                <select value={clientForm.groupId} onChange={(event) => updateClientForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Indywidualnie</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={clientForm.isAdult} onChange={(event) => updateClientForm('isAdult', event.target.checked)} />
              Dorosly klient jest uczestnikiem
            </label>
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" loading={busy && !editingClient} disabled={busy} onClick={createClient}>Utworz klienta</Button>
            </div>
          </div>

          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Uczestnik do konta</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)', gridColumn: '1 / -1' }}>
                Konto klienta
                <select value={participantForm.clientId} onChange={(event) => updateParticipantForm('clientId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Wybierz konto</option>
                  {clientOptions.map((row) => (
                    <option key={row.clientId} value={row.clientId}>{row.last} {row.first} Р’В· {row.phone || row.email || row.clientId}</option>
                  ))}
                </select>
              </label>
              <Input label="Imie" value={participantForm.firstName} onChange={(event) => updateParticipantForm('firstName', event.target.value)} />
              <Input label="Nazwisko" value={participantForm.lastName} onChange={(event) => updateParticipantForm('lastName', event.target.value)} />
              <Input label="Data ur." value={participantForm.birthDate} onChange={(event) => updateParticipantForm('birthDate', event.target.value)} placeholder="YYYY-MM-DD" />
              <Input label="Email" value={participantForm.email} onChange={(event) => updateParticipantForm('email', event.target.value)} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)', gridColumn: '1 / -1' }}>
                Grupa
                <select value={participantForm.groupId} onChange={(event) => updateParticipantForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Indywidualnie</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
            </div>
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" loading={busy && !editingClient} disabled={busy} onClick={addParticipant}>Dodaj uczestnika</Button>
            </div>
          </div>
        </div>
        {editingClient && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Edycja klienta i uczestnika</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10 }}>
              <Input label="Imie konta" value={clientEditForm.accountFirstName} onChange={(event) => updateClientEditForm('accountFirstName', event.target.value)} />
              <Input label="Nazwisko konta" value={clientEditForm.accountLastName} onChange={(event) => updateClientEditForm('accountLastName', event.target.value)} />
              <Input label="Email konta" value={clientEditForm.accountEmail} onChange={(event) => updateClientEditForm('accountEmail', event.target.value)} />
              <Input label="Telefon konta" value={clientEditForm.accountPhone} onChange={(event) => updateClientEditForm('accountPhone', event.target.value)} />
              <Input label="Imie uczestnika" value={clientEditForm.firstName} onChange={(event) => updateClientEditForm('firstName', event.target.value)} />
              <Input label="Nazwisko uczestnika" value={clientEditForm.lastName} onChange={(event) => updateClientEditForm('lastName', event.target.value)} />
              <Input label="Data ur." value={clientEditForm.birthDate} onChange={(event) => updateClientEditForm('birthDate', event.target.value)} placeholder="YYYY-MM-DD" />
              <Input label="Email uczestnika" value={clientEditForm.email} onChange={(event) => updateClientEditForm('email', event.target.value)} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Grupa
                <select value={clientEditForm.groupId} onChange={(event) => updateClientEditForm('groupId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Indywidualnie</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                <input type="checkbox" checked={clientEditForm.isActive} onChange={(event) => updateClientEditForm('isActive', event.target.checked)} />
                Aktywny
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" loading={busy} disabled={busy} onClick={saveClientEdit}>Zapisz klienta</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setEditingClient(null)}>Zamknij</Button>
            </div>
          </div>
        )}
        <Table
          rows={rows}
          emptyLabel="Brak klientow w API"
          columns={[
            { key: 'name', header: 'Uczestnik', render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Avatar name={`${row.first} ${row.last}`} size={28} /><span className="strong">{row.last} {row.first}</span></span> },
            { key: 'phone', header: 'Telefon', muted: true, render: (row) => <span className="mono">{row.phone || '-'}</span> },
            { key: 'email', header: 'Email', muted: true },
            { key: 'group', header: 'Grupa' },
            { key: 'status', header: 'Status', width: 110, render: (row) => <StatusPill status={row.status} size="sm" /> },
            {
              key: 'act',
              header: '',
              width: 170,
              render: (row) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button size="sm" variant="subtle" disabled={busy || !row.clientId} onClick={() => go?.('clientDetail', { clientId: row.clientId })}>Szczegoly</Button>
                  <Button size="sm" variant="subtle" disabled={busy} onClick={() => openClientEdit(row)}>Edytuj</Button>
                </div>
              ),
            },
          ]}
        />
      </div>
    )
  }
}

