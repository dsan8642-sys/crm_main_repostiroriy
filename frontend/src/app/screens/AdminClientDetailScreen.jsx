import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminClientDetailScreen(components, icons, reloadRoleData) {
  const { Table, StatusPill, Avatar, Button, Banner, Tabs, Money, Badge, Dialog } = components
  const I = icons

  return function ApiAdminClientDetail({ go, clientId }) {
    const fallbackClientId = clientId || globalThis.AdminData?.clients?.find((row) => row.clientId)?.clientId
    const [tab, setTab] = useState('participants')
    const [detail, setDetail] = useState(null)
    const [error, setError] = useState(null)
    const [message, setMessage] = useState(null)
    const [loading, setLoading] = useState(false)
    const [actionBusy, setActionBusy] = useState(null)
    const [confirmAction, setConfirmAction] = useState(null)
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
      if (!fallbackClientId) return
      let alive = true
      setLoading(true)
      setError(null)
      api.get(`/api/admin/clients/${fallbackClientId}/`)
        .then((payload) => {
          if (alive) setDetail(payload)
        })
        .catch((err) => {
          if (alive) setError(err.message)
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, [fallbackClientId, refreshKey])

    const account = detail?.account || {}
    const participants = detail?.participants || []
    const subscriptions = detail?.subscriptions || []
    const charges = detail?.charges || []
    const payments = detail?.payments || []
    const attendance = detail?.attendance || []
    const consents = detail?.consents || []
    const summary = detail?.summary || {}

    const participantName = (id) => participants.find((participant) => participant.id === id)?.full_name || '-'
    const money = (minor) => asMoneyMajor(minor || 0)
    const status = (value) => {
      if (value === 'active') return 'active'
      if (value === 'confirmed') return 'paid'
      if (value === 'pending') return 'pending'
      if (value === 'rejected') return 'rejected'
      if (value === 'rescheduled') return 'moved'
      return value
    }
    const refreshDetail = () => {
      setRefreshKey((value) => value + 1)
      reloadRoleData?.('admin')
    }

    async function exportClientData() {
      setError(null)
      setMessage(null)
      setActionBusy('export')
      try {
        const result = await downloadFile(`/api/admin/privacy/clients/${fallbackClientId}/export/`, `client-${fallbackClientId}-data.json`)
        setMessage(`Eksport przygotowany: ${result.name}`)
      } catch (err) {
        setError(err.message)
      } finally {
        setActionBusy(null)
      }
    }

    async function runDangerAction() {
      if (!confirmAction) return
      setError(null)
      setMessage(null)
      setActionBusy(confirmAction.type)
      try {
        if (confirmAction.type === 'archive') {
          const payload = await api.delete(`/api/admin/clients/${fallbackClientId}/`)
          setDetail(payload)
          setMessage('Klient zostal zarchiwizowany. Konto i uczestnicy sa nieaktywni.')
          reloadRoleData?.('admin')
        }
        if (confirmAction.type === 'anonymize') {
          await api.post(`/api/admin/privacy/clients/${fallbackClientId}/anonymize/`)
          setMessage('Dane osobowe klienta zostaly zanonimizowane.')
          refreshDetail()
        }
        setConfirmAction(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setActionBusy(null)
      }
    }

    if (!fallbackClientId) {
      return (
        <div className="page page-wide">
          <div className="page-head">
            <div>
              <h2 className="page-title">Klient</h2>
              <p className="page-desc">Wybierz klienta z listy.</p>
            </div>
            <Button variant="secondary" iconLeft={<I.ArrowLeft size={15} />} onClick={() => go?.('clients')}>Klienci</Button>
          </div>
          <Banner tone="warning">Brak wybranego klienta.</Banner>
        </div>
      )
    }

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <button onClick={() => go?.('clients')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', padding: 0, marginBottom: 6 }}><I.ArrowLeft size={14} /> Klienci</button>
            <h2 className="page-title">{account.full_name || account.username || 'Klient'}</h2>
            <p className="page-desc">{account.phone || '-'} - {account.email || '-'}</p>
          </div>
          <Button variant="secondary" disabled={loading} onClick={refreshDetail}>Odswiez</Button>
        </div>

        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {loading && <Banner tone="info" style={{ marginBottom: 12 }}>Ladowanie szczegolow klienta...</Banner>}

        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-label"><span className="kpi-ico"><I.Users size={15} /></span>Uczestnicy</div>
            <div className="kpi-value">{summary.participants_count ?? participants.length}</div>
            <div className="kpi-sub">Aktywni: {summary.active_participants ?? participants.filter((item) => item.is_active).length}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><span className="kpi-ico"><I.Layers size={15} /></span>Abonamenty</div>
            <div className="kpi-value">{summary.active_subscriptions ?? subscriptions.filter((item) => item.status === 'active').length}</div>
            <div className="kpi-sub">Aktywne</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><span className="kpi-ico"><I.Cash size={15} /></span>Saldo</div>
            <div className="kpi-value" style={{ color: (summary.balance_minor || 0) > 0 ? 'var(--money-debt)' : 'var(--money-credit)' }}>
              {money(summary.balance_minor).toLocaleString('pl-PL')} zl
            </div>
            <div className="kpi-sub">Naliczenia minus potwierdzone platnosci</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><span className="kpi-ico"><I.Alert size={15} /></span>Platnosci</div>
            <div className="kpi-value">{summary.pending_payments ?? payments.filter((item) => item.status === 'pending').length}</div>
            <div className="kpi-sub">Do weryfikacji</div>
          </div>
        </div>

        <div className="toolbar">
          <Tabs value={tab} onChange={setTab} style={{ border: 'none' }} items={[
            { value: 'participants', label: 'Uczestnicy', count: participants.length },
            { value: 'subscriptions', label: 'Abonamenty', count: subscriptions.length },
            { value: 'payments', label: 'Platnosci', count: payments.length + charges.length },
            { value: 'attendance', label: 'Obecnosc', count: attendance.length },
            { value: 'consents', label: 'Zgody', count: consents.length },
            { value: 'privacy', label: 'RODO' },
          ]} />
        </div>

        {tab === 'participants' && (
          <Table
            rows={participants}
            emptyLabel="Brak uczestnikow"
            columns={[
              { key: 'full_name', header: 'Uczestnik', render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Avatar name={row.full_name} size={28} /><span className="strong">{row.full_name}</span></span> },
              { key: 'birth_date', header: 'Data ur.', muted: true, render: (row) => row.birth_date || '-' },
              { key: 'email', header: 'Email', muted: true, render: (row) => row.email || '-' },
              { key: 'group', header: 'Grupa', render: (row) => row.group?.name || 'Indywidualnie' },
              { key: 'balance', header: 'Saldo', align: 'right', width: 110, render: (row) => <Money amount={money(row.balance_minor)} /> },
              { key: 'status', header: 'Status', width: 110, render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
            ]}
          />
        )}

        {tab === 'subscriptions' && (
          <Table
            rows={subscriptions}
            emptyLabel="Brak abonamentow"
            columns={[
              { key: 'type', header: 'Typ', render: (row) => <span className="strong">{row.type}</span> },
              { key: 'participant', header: 'Uczestnik', render: (row) => row.participant?.full_name || participantName(row.participant_id) },
              { key: 'start_date', header: 'Start', muted: true },
              { key: 'effective_end_date', header: 'Koniec', muted: true },
              { key: 'remaining_sessions', header: 'Wejscia', align: 'right', width: 90, render: (row) => row.remaining_sessions ?? 'Bez limitu' },
              { key: 'status', header: 'Status', width: 120, render: (row) => <StatusPill status={status(row.status)} size="sm" /> },
            ]}
          />
        )}

        {tab === 'payments' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 14 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Naliczenia</div>
              <Table
                rows={charges}
                emptyLabel="Brak naliczen"
                columns={[
                  { key: 'description', header: 'Opis', render: (row) => <span className="strong">{row.description}</span> },
                  { key: 'participant', header: 'Uczestnik', muted: true },
                  { key: 'due_date', header: 'Termin', muted: true },
                  { key: 'amount', header: 'Kwota', align: 'right', width: 100, render: (row) => <Money amount={money(row.amount_minor)} /> },
                ]}
              />
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Platnosci</div>
              <Table
                rows={payments}
                emptyLabel="Brak platnosci"
                columns={[
                  { key: 'participant', header: 'Uczestnik', render: (row) => <span className="strong">{row.participant}</span> },
                  { key: 'method', header: 'Metoda', muted: true },
                  { key: 'paid_at', header: 'Data', muted: true },
                  { key: 'amount', header: 'Kwota', align: 'right', width: 100, render: (row) => <Money amount={money(row.amount_minor)} /> },
                  { key: 'status', header: 'Status', width: 110, render: (row) => <StatusPill status={status(row.status)} size="sm" /> },
                ]}
              />
            </div>
          </div>
        )}

        {tab === 'attendance' && (
          <Table
            rows={attendance}
            emptyLabel="Brak obecnosci"
            columns={[
              { key: 'participant', header: 'Uczestnik', render: (row) => <span className="strong">{row.participant}</span> },
              { key: 'session_start_at', header: 'Zajecie', muted: true, render: (row) => `${formatShortDate(row.session_start_at)} ${formatTime(row.session_start_at)}-${formatTime(row.session_end_at)}` },
              { key: 'group', header: 'Grupa', muted: true },
              { key: 'trainer', header: 'Trener', muted: true },
              { key: 'status', header: 'Status', width: 120, render: (row) => <StatusPill status={row.status} size="sm" /> },
              { key: 'deducts', header: 'Wejscie', width: 90, render: (row) => row.deducts ? <Badge tone="warning">-1</Badge> : <Badge tone="neutral">0</Badge> },
            ]}
          />
        )}

        {tab === 'consents' && (
          <Table
            rows={consents}
            emptyLabel="Brak zgod"
            columns={[
              { key: 'type_label', header: 'Zgoda', render: (row) => <span className="strong">{row.type_label || row.type}</span> },
              { key: 'policy_version', header: 'Wersja', muted: true, render: (row) => row.policy_version || '-' },
              { key: 'granted_at', header: 'Udzielona', muted: true, render: (row) => row.granted_at ? formatDate(row.granted_at) : '-' },
              { key: 'revoked_at', header: 'Cofnieta', muted: true, render: (row) => row.revoked_at ? formatDate(row.revoked_at) : '-' },
              { key: 'active', header: 'Status', width: 110, render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
            ]}
          />
        )}

        {tab === 'privacy' && (
          <div className="card card-pad" style={{ maxWidth: 860 }}>
            <div className="page-head" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="section-title" style={{ margin: 0 }}>RODO / dane klienta</h3>
                <p className="page-desc" style={{ marginTop: 4 }}>Eksport, archiwizacja i anonimizacja konta klienta.</p>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="strong">Eksport danych klienta</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Pobiera JSON z kontem, uczestnikami, abonamentami, platnosciami, obecnoscia i zgodami.</div>
                </div>
                <Button variant="secondary" loading={actionBusy === 'export'} disabled={actionBusy != null || loading} onClick={exportClientData}>Eksport JSON</Button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="strong">Archiwizuj konto</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Soft-delete: konto i uczestnicy zostana oznaczeni jako nieaktywni, historia zostaje.</div>
                </div>
                <Button variant="secondary" loading={actionBusy === 'archive'} disabled={actionBusy != null || loading || account.is_active === false} onClick={() => setConfirmAction({ type: 'archive' })}>Archiwizuj</Button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '12px 0' }}>
                <div>
                  <div className="strong">Anonimizuj dane osobowe</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Usuwa dane kontaktowe, medyczne, zgody i pliki paragonow; finanse i historia zostaja bez danych osobowych.</div>
                </div>
                <Button variant="danger" loading={actionBusy === 'anonymize'} disabled={actionBusy != null || loading} onClick={() => setConfirmAction({ type: 'anonymize' })}>Anonimizuj</Button>
              </div>
            </div>
          </div>
        )}

        {confirmAction && (
          <Dialog
            title={confirmAction.type === 'archive' ? 'Archiwizowac klienta?' : 'Anonimizowac dane klienta?'}
            description={confirmAction.type === 'archive'
              ? 'Konto i uczestnicy zostana oznaczeni jako nieaktywni. Dane historyczne pozostana w systemie.'
              : 'Dane osobowe zostana trwale usuniete lub zastapione wartosciami technicznymi. Tej operacji nie da sie cofnac.'}
            tone="danger"
            irreversible={confirmAction.type === 'anonymize'}
            confirmLabel={confirmAction.type === 'archive' ? 'Archiwizuj' : 'Anonimizuj'}
            onClose={() => actionBusy ? null : setConfirmAction(null)}
            onConfirm={runDangerAction}
          >
            <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              Klient: <span className="strong">{account.full_name || account.username || fallbackClientId}</span>
            </div>
          </Dialog>
        )}
      </div>
    )
  }
}

