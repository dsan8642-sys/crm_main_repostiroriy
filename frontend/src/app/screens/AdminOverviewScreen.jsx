import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminOverviewScreen(components, icons) {
  const { Money, Button, Banner, Badge } = components
  const I = icons

  function Kpi({ icon, label, value, sub, tone }) {
    return (
      <div className="kpi">
        <div className="kpi-label"><span className="kpi-ico">{icon}</span>{label}</div>
        <div className="kpi-value" style={tone ? { color: tone } : null}>{value}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    )
  }

  return function ApiAdminOverview({ go }) {
    const data = globalThis.AdminData || {}
    const sessions = data.sessions || []
    const pending = (data.payments || []).filter((payment) => payment.status === 'pending')
    const debtors = data.debtors || []
    const debtTotal = debtors.reduce((sum, row) => sum + Math.abs(row.balance || 0), 0)

    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h2 className="page-title">Przeglad</h2>
            <p className="page-desc">Dane z /api/admin/dashboard/, /api/admin/payments/ i /api/admin/schedule/sessions/.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" iconLeft={<I.Calendar size={15} />} onClick={() => go('schedule')}>Grafik</Button>
            <Button variant="primary" iconLeft={<I.Cash size={15} />} onClick={() => go('payments')}>Platnosci</Button>
          </div>
        </div>

        {pending.length > 0 && (
          <Banner tone="warning" title={`${pending.length} platnosci czeka na weryfikacje`} style={{ marginBottom: 16 }}
            action={<Button size="sm" variant="subtle" onClick={() => go('payments')}>Otworz</Button>}>
            Potwierdzenie lub odrzucenie zapisuje status przez backend API.
          </Banner>
        )}

        <div className="eyebrow" style={{ marginBottom: 10 }}>Operacje</div>
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <Kpi icon={<I.Calendar size={15} />} label="Zajecia" value={sessions.length} sub="Widok od dzisiaj" />
          <Kpi icon={<I.Users size={15} />} label="Klienci" value={(data.clients || []).length} sub="Pierwsze 200 rekordow" />
          <Kpi icon={<I.Whistle size={15} />} label="Trenerzy" value={(data.trainers || []).filter((row) => row.active).length} sub="Aktywni" />
          <Kpi icon={<I.Alert size={15} />} label="Dluznicy" value={debtors.length} sub={`${debtTotal.toLocaleString('pl-PL')} zl`} tone="var(--money-debt)" />
        </div>

        <div className="eyebrow" style={{ marginBottom: 10 }}>Najblizsze zajecia</div>
        <div className="card">
          {sessions.slice(0, 8).map((session, index, list) => (
            <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px', borderBottom: index < list.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <span className="mono" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-strong)', width: 96 }}>{session.start}-{session.end}</span>
              <span className="strong" style={{ flex: 1 }}>{session.group}</span>
              <span className="muted" style={{ fontSize: 'var(--fs-sm)', width: 150 }}>{session.trainer}</span>
              <span className="muted" style={{ fontSize: 'var(--fs-xs)', width: 150 }}>{session.location}</span>
              <Badge tone={session.status === 'cancelled' ? 'danger' : 'primary'}>{session.status}</Badge>
            </div>
          ))}
          {sessions.length === 0 && <div className="muted" style={{ padding: 16 }}>Brak zajec w API.</div>}
        </div>
      </div>
    )
  }
}

