import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminDebtorsScreen(components, icons, reloadRoleData) {
  const { Table, Money, Button, Avatar, Badge, IconButton, Banner } = components
  const I = icons

  return function ApiAdminDebtors({ go }) {
    const [range, setRange] = useState('30')
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [busyId, setBusyId] = useState(null)
    const debtors = globalThis.AdminData?.debtors || []
    const total = debtors.reduce((sum, row) => sum + (row.balance || 0), 0)

    async function sendReminders(rows, id) {
      const parentIds = [...new Set(rows.map((row) => row.clientId).filter(Boolean))]
      if (parentIds.length === 0) {
        setError('Brak klientow do wyslania przypomnien.')
        return
      }
      setError('')
      setMessage('')
      setBusyId(id)
      try {
        const result = await api.post('/api/admin/notifications/mass-mail/', {
          audience: 'selected',
          parent_ids: parentIds,
          channel: 'email',
          subject: 'Przypomnienie o platnosci',
          body: 'Dzien dobry, przypominamy o zaleglej platnosci w SwimCRM. Aktualne saldo jest widoczne w panelu klienta.',
        })
        setMessage(`Przypomnienia dodane do kolejki: ${result.queued}. Pominiete: ${result.skipped}.`)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message || 'Nie udalo sie wyslac przypomnien.')
      } finally {
        setBusyId(null)
      }
    }

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h2 className="page-title">Dluznicy</h2>
            <p className="page-desc">
              {debtors.length} rodzin В· laczny dlug{' '}
              <span style={{ color: 'var(--money-debt)', fontWeight: 600 }}>
                {Math.abs(total).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zl
              </span>
            </p>
          </div>
          <Button
            variant="primary"
            iconLeft={<I.Bell size={15} />}
            loading={busyId === 'all'}
            disabled={busyId != null || debtors.length === 0}
            onClick={() => sendReminders(debtors, 'all')}
          >
            Wyslij przypomnienia ({debtors.length})
          </Button>
        </div>

        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage('')}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError('')}>{error}</Banner>}

        <div className="toolbar">
          <div className="seg">
            {[['today', 'Dzis'], ['3', '3 dni'], ['7', '7 dni'], ['14', '14 dni'], ['30', '30 dni']].map(([value, label]) => (
              <button key={value} className={value === range ? 'on' : ''} type="button" onClick={() => setRange(value)}>{label}</button>
            ))}
          </div>
          <span className="spacer" />
          <Badge tone="danger" dot>Przeterminowane naliczenia</Badge>
        </div>

        <Table
          rows={debtors}
          emptyLabel="Brak dluznikow"
          columns={[
            { key: 'child', header: 'Dziecko', render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={row.child} size={26} /><span className="strong">{row.child}</span></span> },
            { key: 'parent', header: 'Rodzic', muted: true },
            { key: 'group', header: 'Grupa', muted: true },
            { key: 'reason', header: 'Powod', render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--red-600)', fontSize: 'var(--fs-xs)', fontWeight: 500 }}><I.Alert size={13} />{row.reason}</span> },
            { key: 'last', header: 'Ostatnia wplata', muted: true, render: (row) => <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{row.last}</span> },
            { key: 'balance', header: 'Saldo', align: 'right', width: 120, render: (row) => <Money amount={row.balance} signed /> },
            {
              key: 'act',
              header: '',
              width: 96,
              render: (row) => (
                <div className="row-actions">
                  <IconButton label="Karta klienta" size="sm" onClick={() => go?.('clientDetail', { clientId: row.clientId })}><I.User size={16} /></IconButton>
                  <IconButton label="Wyslij przypomnienie" size="sm" disabled={busyId != null} onClick={() => sendReminders([row], row.id)}><I.Bell size={16} /></IconButton>
                </div>
              ),
            },
          ]}
        />
      </div>
    )
  }
}

