import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createClientScreens(components, icons, reloadRoleData) {
  const { Table, StatusPill, Money, Button, Banner, Avatar, Input } = components
  const I = icons

  function ChildButtons({ kid, setKid }) {
    const children = globalThis.ParentData?.children || []
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {children.map((child) => (
          <button key={child.id} type="button" className={child.id === kid ? 'on' : ''} onClick={() => setKid(child.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 6px', cursor: 'pointer', border: `1px solid ${child.id === kid ? 'var(--primary)' : 'var(--border-default)'}`, background: child.id === kid ? 'var(--primary-soft)' : 'var(--surface-card)', borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-sans)' }}>
            <Avatar name={child.name} size={26} />
            <span>{child.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>
    )
  }

  function Home({ kid, setKid, go }) {
    const data = globalThis.ParentData || {}
    const child = data.children?.find((item) => item.id === kid) || data.children?.[0]
    const next = child ? (data.schedule?.[child.id] || []).find((session) => session.status === 'planned') : null
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head">
          <div><h2 className="page-title">Glowna</h2><p className="page-desc">Dane z /api/client/overview/.</p></div>
          <ChildButtons kid={child?.id || kid} setKid={setKid} />
        </div>
        {child?.balance < 0 && (
          <Banner tone="danger" title="Zaleglosc do oplacenia" style={{ marginBottom: 14 }} action={<Button size="sm" variant="subtle" onClick={() => go('payments')}>Przejdz do platnosci</Button>}>
            {child.name}: saldo <strong>{Math.abs(child.balance).toLocaleString('pl-PL')} zl</strong>.
          </Banner>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="card card-pad">
            <div className="kpi-label"><span className="kpi-ico"><I.Calendar size={15} /></span>Nastepny trening</div>
            {next ? <><div className="strong" style={{ fontSize: 'var(--fs-lg)', margin: '4px 0 2px' }}>{next.date} В· {next.start}</div><div className="muted">{next.group} В· {next.trainer}</div></> : <div className="muted">Brak zaplanowanych zajec.</div>}
          </div>
          <div className="card card-pad">
            <div className="kpi-label"><span className="kpi-ico"><I.Layers size={15} /></span>Abonament</div>
            <div className="strong" style={{ fontSize: 'var(--fs-lg)', margin: '4px 0 2px' }}>{child?.sub || '-'}</div>
            <div className="muted">Pozostalo: {child?.subLeft == null ? 'в€ћ' : child.subLeft} В· koniec: {child?.subEnds || '-'}</div>
          </div>
          <div className="card card-pad">
            <div className="kpi-label"><span className="kpi-ico"><I.Wallet size={15} /></span>Saldo</div>
            <Money amount={child?.balance || 0} signed size="var(--fs-lg)" />
          </div>
        </div>
      </div>
    )
  }

  function Schedule({ kid, setKid }) {
    const rows = globalThis.ParentData?.schedule?.[kid] || []
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><div><h2 className="page-title">Rozklad</h2><p className="page-desc">Dane z /api/client/schedule/.</p></div><ChildButtons kid={kid} setKid={setKid} /></div>
        <Table
          rows={rows}
          emptyLabel="Brak zajec w API"
          columns={[
            { key: 'date', header: 'Data' },
            { key: 'start', header: 'Godzina', render: (row) => <span className="mono">{row.start}-{row.end}</span> },
            { key: 'group', header: 'Grupa' },
            { key: 'trainer', header: 'Trener', muted: true },
            { key: 'location', header: 'Miejsce', muted: true },
            { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} size="sm" /> },
          ]}
        />
      </div>
    )
  }

  function Payments({ kid }) {
    const [file, setFile] = useState(null)
    const [amount, setAmount] = useState('')
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const child = (globalThis.ParentData?.children || []).find((item) => item.id === kid)
    const charges = globalThis.ParentData?.charges || []
    const payments = globalThis.ParentData?.payments || []

    async function uploadReceipt() {
      if (!file) {
        setError('Wybierz plik PDF/JPG/PNG.')
        return
      }
      setBusy(true)
      const formData = new FormData()
      if (child?.studentId) formData.set('student_id', child.studentId)
      formData.set('amount_minor', String(Math.round(Number(amount || 0) * 100)))
      formData.set('currency', 'PLN')
      formData.set('method', 'transfer')
      formData.set('file', file)
      try {
        await api.postForm('/api/client/payments/upload-receipt/', formData)
        setMessage('Czek wyslany do weryfikacji.')
        setError(null)
        setFile(null)
        setAmount('')
        reloadRoleData?.('client')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><div><h2 className="page-title">Platnosci</h2><p className="page-desc">Dane z /api/client/payments/ i upload do /api/client/payments/upload-receipt/.</p></div></div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Czek jest wysylany do weryfikacji...</BusyBanner>
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <Input label="Kwota" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="240.00" />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Plik
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <Button variant="primary" loading={busy} disabled={busy} iconLeft={<I.Upload size={15} />} onClick={uploadReceipt}>Wyslij</Button>
          </div>
        </div>
        <Table rows={charges} emptyLabel="Brak naliczen" columns={[
          { key: 'desc', header: 'Naliczenie' },
          { key: 'child', header: 'Uczestnik', muted: true },
          { key: 'due', header: 'Termin', muted: true },
          { key: 'amount', header: 'Kwota', align: 'right', render: (row) => <Money amount={row.amount} /> },
          { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} size="sm" /> },
        ]} />
        <div style={{ height: 16 }} />
        <Table rows={payments} emptyLabel="Brak platnosci" columns={[
          { key: 'child', header: 'Uczestnik' },
          { key: 'date', header: 'Data', muted: true },
          { key: 'method', header: 'Metoda', muted: true },
          { key: 'amount', header: 'Kwota', align: 'right', render: (row) => <Money amount={row.amount} /> },
          { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} size="sm" /> },
        ]} />
      </div>
    )
  }

  function Subscription({ kid, setKid }) {
    const child = (globalThis.ParentData?.children || []).find((item) => item.id === kid)
    return <Home kid={child?.id || kid} setKid={setKid} go={() => {}} />
  }

  function History({ kid, setKid }) {
    const attendance = globalThis.ParentData?.attendance?.[kid] || []
    const child = (globalThis.ParentData?.children || []).find((item) => item.id === kid)
    const payments = (globalThis.ParentData?.payments || []).filter((payment) => !child?.studentId || payment.studentId === child.studentId)
    return (
      <div className="page page-wide">
        <div className="page-head"><div><h2 className="page-title">Historia</h2><p className="page-desc">Historia obecnosci i platnosci z konta klienta.</p></div><ChildButtons kid={kid} setKid={setKid} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Obecnosc</div>
            <Table rows={attendance} emptyLabel="Brak obecnosci" columns={[
              { key: 'date', header: 'Data', muted: true },
              { key: 'label', header: 'Zajecie', render: (row) => <span className="strong">{row.label}</span> },
              { key: 'trainer', header: 'Trener', muted: true },
              { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status === 'rescheduled' ? 'moved' : row.status} size="sm" /> },
            ]} />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Platnosci</div>
            <Table rows={payments} emptyLabel="Brak platnosci" columns={[
              { key: 'date', header: 'Data', muted: true },
              { key: 'method', header: 'Metoda', muted: true },
              { key: 'amount', header: 'Kwota', align: 'right', render: (row) => <Money amount={row.amount} /> },
              { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.status} size="sm" /> },
            ]} />
          </div>
        </div>
      </div>
    )
  }

  function Profile({ kid, setKid }) {
    const account = globalThis.ParentData?.account || {}
    const participants = globalThis.ParentData?.profileParticipants || []
    const [form, setForm] = useState({
      firstName: account.first_name || '',
      lastName: account.last_name || '',
      email: account.email || '',
      phone: account.phone || '',
      telegram: account.telegram_chat_id || '',
    })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

    useEffect(() => {
      setForm({
        firstName: account.first_name || '',
        lastName: account.last_name || '',
        email: account.email || '',
        phone: account.phone || '',
        telegram: account.telegram_chat_id || '',
      })
    }, [account.first_name, account.last_name, account.email, account.phone, account.telegram_chat_id])

    async function saveProfile() {
      setBusy(true)
      try {
        await api.post('/api/client/profile/', {
          account: {
            first_name: form.firstName,
            last_name: form.lastName,
            email: form.email,
            phone: form.phone,
            telegram_chat_id: form.telegram,
          },
        })
        setMessage('Profil zapisany.')
        setError(null)
        reloadRoleData?.('client')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="page page-wide">
        <div className="page-head"><div><h2 className="page-title">Profil</h2><p className="page-desc">Dane konta klienta z /api/client/profile/.</p></div><ChildButtons kid={kid} setKid={setKid} /></div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Profil jest zapisywany...</BusyBanner>
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: 10 }}>
            <Input label="Imie" value={form.firstName} onChange={(event) => update('firstName', event.target.value)} />
            <Input label="Nazwisko" value={form.lastName} onChange={(event) => update('lastName', event.target.value)} />
            <Input label="Email" value={form.email} onChange={(event) => update('email', event.target.value)} />
            <Input label="Telefon" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
            <Input label="Telegram chat ID" value={form.telegram} onChange={(event) => update('telegram', event.target.value)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="primary" loading={busy} disabled={busy} onClick={saveProfile}>Zapisz profil</Button>
          </div>
        </div>
        <Table rows={participants} emptyLabel="Brak uczestnikow" columns={[
          { key: 'full_name', header: 'Uczestnik', render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Avatar name={row.full_name} size={28} /><span className="strong">{row.full_name}</span></span> },
          { key: 'birth_date', header: 'Data ur.', muted: true, render: (row) => row.birth_date || '-' },
          { key: 'email', header: 'Email', muted: true, render: (row) => row.email || '-' },
          { key: 'group', header: 'Grupa', render: (row) => row.group?.name || 'Indywidualnie' },
          { key: 'status', header: 'Status', render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
        ]} />
      </div>
    )
  }

  function Consents() {
    const rows = globalThis.ParentData?.consents || []
    const [localRows, setLocalRows] = useState(rows)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busyType, setBusyType] = useState(null)

    useEffect(() => {
      setLocalRows(rows)
    }, [rows])

    async function setConsent(row, granted) {
      setBusyType(row.type)
      try {
        const saved = await api.post('/api/client/consents/', {
          type: row.type,
          granted,
          policy_version: row.policy_version || 'v1',
        })
        setLocalRows((current) => current.map((item) => item.type === row.type ? saved : item))
        setMessage('Zgoda zapisana.')
        setError(null)
        reloadRoleData?.('client')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyType(null)
      }
    }

    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-head"><div><h2 className="page-title">Zgody</h2><p className="page-desc">Zapis przez /api/client/consents/.</p></div></div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busyType != null}>Zgoda jest zapisywana...</BusyBanner>
        <div className="card" style={{ overflow: 'hidden' }}>
          {localRows.map((row, index) => (
            <div key={row.type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: index < localRows.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ flex: 1 }}>
                <div className="strong">{row.type_label || row.type}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{row.policy_version || 'Brak wersji polityki'}</div>
              </div>
              <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" />
              <Button size="sm" loading={busyType === row.type} disabled={busyType != null} variant={row.is_active ? 'secondary' : 'primary'} onClick={() => setConsent(row, !row.is_active)}>
                {row.is_active ? 'Cofnij' : 'Udziel'}
              </Button>
            </div>
          ))}
          {localRows.length === 0 && <div className="muted" style={{ padding: 16 }}>Brak zgod w API.</div>}
        </div>
      </div>
    )
  }

  return { Home, Schedule, Payments, Subscription, History, Profile, Consents }
}
