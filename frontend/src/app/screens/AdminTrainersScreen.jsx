import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminTrainersScreen(components, reloadRoleData) {
  const { Table, StatusPill, Avatar, Button, Banner, Input } = components
  return function ApiAdminTrainers() {
    const rows = globalThis.AdminData?.trainers || []
    const [form, setForm] = useState({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      username: '',
      isActive: true,
    })
    const [editingTrainer, setEditingTrainer] = useState(null)
    const [editForm, setEditForm] = useState({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      username: '',
      isActive: true,
    })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }))
    const updateEditForm = (field, value) => setEditForm((current) => ({ ...current, [field]: value }))

    function splitName(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
      return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') }
    }

    function openTrainerEdit(row) {
      const name = splitName(row.name)
      setEditingTrainer(row)
      setEditForm({
        firstName: name.firstName,
        lastName: name.lastName,
        email: row.email || '',
        phone: row.phone || '',
        username: row.username || '',
        isActive: row.active,
      })
    }

    async function createTrainer() {
      setBusy(true)
      setError(null)
      try {
        await api.post('/api/admin/trainers/', {
          trainer: {
            first_name: form.firstName,
            last_name: form.lastName,
            email: form.email,
            phone: form.phone,
            username: form.username || form.email || form.phone,
            is_active: form.isActive,
          },
        })
        setMessage('Trener utworzony w backendzie.')
        setForm({ firstName: '', lastName: '', email: '', phone: '', username: '', isActive: true })
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function saveTrainerEdit() {
      if (!editingTrainer) return
      setBusy(true)
      setError(null)
      try {
        await api.post(`/api/admin/trainers/${editingTrainer.trainerId}/`, {
          trainer: {
            first_name: editForm.firstName,
            last_name: editForm.lastName,
            email: editForm.email,
            phone: editForm.phone,
            username: editForm.username,
            is_active: editForm.isActive,
          },
        })
        setEditingTrainer(null)
        setMessage('Trener zaktualizowany w backendzie.')
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
            <h2 className="page-title">Trenerzy</h2>
            <p className="page-desc">Tabela z /api/admin/trainers/ i zapis przez /api/admin/trainers/.</p>
          </div>
        </div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Trwa zapis danych trenera...</BusyBanner>

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Nowy trener</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 10 }}>
            <Input label="Imie" value={form.firstName} onChange={(event) => updateForm('firstName', event.target.value)} />
            <Input label="Nazwisko" value={form.lastName} onChange={(event) => updateForm('lastName', event.target.value)} />
            <Input label="Login" value={form.username} onChange={(event) => updateForm('username', event.target.value)} placeholder="Opcjonalnie" />
            <Input label="Email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} />
            <Input label="Telefon" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={form.isActive} onChange={(event) => updateForm('isActive', event.target.checked)} />
              Aktywny
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="primary" loading={busy && !editingTrainer} disabled={busy} onClick={createTrainer}>Utworz trenera</Button>
          </div>
        </div>

        {editingTrainer && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Edycja trenera</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 10 }}>
              <Input label="Imie" value={editForm.firstName} onChange={(event) => updateEditForm('firstName', event.target.value)} />
              <Input label="Nazwisko" value={editForm.lastName} onChange={(event) => updateEditForm('lastName', event.target.value)} />
              <Input label="Login" value={editForm.username} onChange={(event) => updateEditForm('username', event.target.value)} />
              <Input label="Email" value={editForm.email} onChange={(event) => updateEditForm('email', event.target.value)} />
              <Input label="Telefon" value={editForm.phone} onChange={(event) => updateEditForm('phone', event.target.value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                <input type="checkbox" checked={editForm.isActive} onChange={(event) => updateEditForm('isActive', event.target.checked)} />
                Aktywny
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" loading={busy} disabled={busy} onClick={saveTrainerEdit}>Zapisz trenera</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setEditingTrainer(null)}>Zamknij</Button>
            </div>
          </div>
        )}

        <Table
          rows={rows}
          emptyLabel="Brak trenerow w API"
          columns={[
            { key: 'name', header: 'Trener', render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Avatar name={row.name} size={28} /><span className="strong">{row.name}</span></span> },
            { key: 'email', header: 'Email', muted: true, render: (row) => row.email || '-' },
            { key: 'phone', header: 'Telefon', muted: true, render: (row) => <span className="mono">{row.phone || '-'}</span> },
            { key: 'groups', header: 'Grupy', align: 'right', width: 90 },
            { key: 'active', header: 'Status', width: 110, render: (row) => <StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /> },
            {
              key: 'act',
              header: '',
              width: 90,
              render: (row) => <Button size="sm" variant="subtle" disabled={busy} onClick={() => openTrainerEdit(row)}>Edytuj</Button>,
            },
          ]}
        />
      </div>
    )
  }
}

