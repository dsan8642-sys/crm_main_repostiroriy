import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminGroupsScreen(components, reloadRoleData) {
  const { Table, StatusPill, Button, Banner, Input } = components
  return function ApiAdminGroups() {
    const rows = globalThis.AdminData?.groups || []
    const trainers = globalThis.AdminData?.trainers || []
    const [form, setForm] = useState({
      name: '',
      description: '',
      defaultTrainerId: '',
      isActive: true,
    })
    const [editingGroup, setEditingGroup] = useState(null)
    const [editForm, setEditForm] = useState({
      name: '',
      description: '',
      defaultTrainerId: '',
      isActive: true,
    })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }))
    const updateEditForm = (field, value) => setEditForm((current) => ({ ...current, [field]: value }))

    function openGroupEdit(row) {
      setEditingGroup(row)
      setEditForm({
        name: row.name || '',
        description: row.description || '',
        defaultTrainerId: row.defaultTrainerId || '',
        isActive: row.active,
      })
    }

    async function createGroup() {
      setBusy(true)
      setError(null)
      try {
        await api.post('/api/admin/groups/', {
          name: form.name,
          description: form.description,
          default_trainer_id: form.defaultTrainerId || null,
          is_active: form.isActive,
        })
        setMessage('Grupa utworzona w backendzie.')
        setForm({ name: '', description: '', defaultTrainerId: '', isActive: true })
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    async function saveGroupEdit() {
      if (!editingGroup) return
      setBusy(true)
      setError(null)
      try {
        await api.post(`/api/admin/groups/${editingGroup.groupId}/`, {
          name: editForm.name,
          description: editForm.description,
          default_trainer_id: editForm.defaultTrainerId || null,
          is_active: editForm.isActive,
        })
        setEditingGroup(null)
        setMessage('Grupa zaktualizowana w backendzie.')
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
            <h2 className="page-title">Grupy</h2>
            <p className="page-desc">Tabela z /api/admin/groups/ i zapis przez /api/admin/groups/.</p>
          </div>
        </div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Trwa zapis grupy...</BusyBanner>

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Nowa grupa</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 1.5fr) minmax(180px, 1fr) auto', gap: 10, alignItems: 'end' }}>
            <Input label="Nazwa" value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
            <Input label="Opis" value={form.description} onChange={(event) => updateForm('description', event.target.value)} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Trener domyslny
              <select value={form.defaultTrainerId} onChange={(event) => updateForm('defaultTrainerId', event.target.value)} style={{ minHeight: 36 }}>
                <option value="">Bez trenera</option>
                {trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={form.isActive} onChange={(event) => updateForm('isActive', event.target.checked)} />
              Aktywna
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="primary" loading={busy && !editingGroup} disabled={busy} onClick={createGroup}>Utworz grupe</Button>
          </div>
        </div>

        {editingGroup && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Edycja grupy</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 1.5fr) minmax(180px, 1fr) auto', gap: 10, alignItems: 'end' }}>
              <Input label="Nazwa" value={editForm.name} onChange={(event) => updateEditForm('name', event.target.value)} />
              <Input label="Opis" value={editForm.description} onChange={(event) => updateEditForm('description', event.target.value)} />
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                Trener domyslny
                <select value={editForm.defaultTrainerId} onChange={(event) => updateEditForm('defaultTrainerId', event.target.value)} style={{ minHeight: 36 }}>
                  <option value="">Bez trenera</option>
                  {trainers.map((trainer) => <option key={trainer.trainerId} value={trainer.trainerId}>{trainer.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, fontSize: 'var(--fs-sm)' }}>
                <input type="checkbox" checked={editForm.isActive} onChange={(event) => updateEditForm('isActive', event.target.checked)} />
                Aktywna
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" loading={busy} disabled={busy} onClick={saveGroupEdit}>Zapisz grupe</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setEditingGroup(null)}>Zamknij</Button>
            </div>
          </div>
        )}

        <Table
          rows={rows}
          emptyLabel="Brak grup w API"
          columns={[
            { key: 'name', header: 'Grupa', render: (row) => <span className="strong">{row.name}</span> },
            { key: 'description', header: 'Opis', muted: true, render: (row) => row.description || '-' },
            { key: 'trainer', header: 'Trener', muted: true },
            { key: 'students', header: 'Uczestnicy', align: 'right', width: 110 },
            { key: 'active', header: 'Status', width: 110, render: (row) => <StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /> },
            {
              key: 'act',
              header: '',
              width: 90,
              render: (row) => <Button size="sm" variant="subtle" disabled={busy} onClick={() => openGroupEdit(row)}>Edytuj</Button>,
            },
          ]}
        />
      </div>
    )
  }
}

