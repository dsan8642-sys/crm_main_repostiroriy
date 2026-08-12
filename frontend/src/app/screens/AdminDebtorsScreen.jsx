import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'

export function createAdminDebtorsScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Table, Money, Button, Avatar, Badge, IconButton, Banner } = components
  const I = icons

  return function ApiAdminDebtors({ go }) {
    const [range, setRange] = useState('30')
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [busyId, setBusyId] = useState(null)
    const [logs, setLogs] = useState([])
    const [groupFilter, setGroupFilter] = useState('')
    const [minAmount, setMinAmount] = useState('')
    const [historyClientId, setHistoryClientId] = useState(null)
    const debtors = adminData.debtors || []
    const total = debtors.reduce((sum, row) => sum + (row.balance || 0), 0)
    const groups = [...new Set(debtors.map((row) => row.group).filter(Boolean))]
    const visibleDebtors = debtors.filter((row) => {
      const dayLimit = range === 'today' ? 0 : Number(range)
      return (!groupFilter || row.group === groupFilter) && (!minAmount || Math.abs(row.balance) >= Number(minAmount)) && (range === '30' || row.daysOverdue <= dayLimit)
    })

    async function loadLogs() {
      try { setLogs((await api.get('/api/admin/notifications/logs/?event_type=mass_mailing')).logs || []) } catch (err) { setError(apiErrorMessage(err, 'Не удалось загрузить историю уведомлений.')) }
    }

    useEffect(() => { loadLogs() }, [])

    async function sendReminders(rows, id) {
      const parentIds = [...new Set(rows.map((row) => row.clientId).filter(Boolean))]
      if (parentIds.length === 0) {
        setError('Нет клиентов для отправки напоминаний.')
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
          subject: 'Напоминание об оплате',
          body: 'Здравствуйте! Напоминаем о задолженности в SwimCRM. Актуальный баланс доступен в личном кабинете.',
        })
        setMessage(`Добавлено в очередь: ${result.queued}. Пропущено: ${result.skipped}.`)
        await loadLogs()
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, 'Не удалось отправить напоминания.'))
      } finally {
        setBusyId(null)
      }
    }

    async function retryNotification(log) {
      setBusyId(`retry-${log.id}`); setError('')
      try { await api.post(`/api/admin/notifications/logs/${log.id}/retry/`); setMessage('Уведомление повторно поставлено в очередь.'); await loadLogs() } catch (err) { setError(apiErrorMessage(err, 'Не удалось повторить отправку.')) } finally { setBusyId(null) }
    }

    const logsFor = (clientId) => logs.filter((log) => String(log.recipient_id) === String(clientId))

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h1 className="page-title">Должники</h1>
            <p className="page-desc">
              Клиентов: {debtors.length} · общий долг{' '}
              <span style={{ color: 'var(--money-debt)', fontWeight: 600 }}>
                {Math.abs(total).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zl
              </span>
            </p>
          </div>
          <Button
            variant="primary"
            iconLeft={<I.Bell size={15} />}
            loading={busyId === 'all'}
            disabled={busyId != null || visibleDebtors.length === 0}
            onClick={() => sendReminders(visibleDebtors, 'all')}
          >
            Отправить напоминания ({visibleDebtors.length})
          </Button>
        </div>

        <ToastNotice id="admin-debtors-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError('')}>{error}</Banner>}

        <div className="toolbar">
          <div className="seg">
            {[['today', 'Сегодня'], ['3', '3 дня'], ['7', '7 дней'], ['14', '14 дней'], ['30', '30 дней']].map(([value, label]) => (
              <button key={value} className={value === range ? 'on' : ''} type="button" onClick={() => setRange(value)}>{label}</button>
            ))}
          </div>
          <span className="spacer" />
          <label>Группа <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="">Все</option>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
          <label>Долг от <input aria-label="Минимальный долг" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} placeholder="0" /></label>
          <Badge tone="danger" dot>Просроченные начисления</Badge>
        </div>

        <Table
          rows={visibleDebtors}
          emptyLabel="Должников нет"
          columns={[
            { key: 'child', header: 'Участник', render: (row) => <button type="button" className="ops-link-button" onClick={() => go?.('clientDetail', { clientId: row.clientId })}><Avatar name={row.child} size={26} /><span className="strong">{row.child}</span></button> },
            { key: 'parent', header: 'Контакт', muted: true },
            { key: 'group', header: 'Группа', muted: true },
            { key: 'reason', header: 'Причина', render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--red-600)', fontSize: 'var(--fs-xs)', fontWeight: 500 }}><I.Alert size={13} />{row.reason}</span> },
            { key: 'dueDate', header: 'Просрочка', muted: true, render: (row) => row.daysOverdue ? `${row.daysOverdue} дн. · ${row.dueDate}` : '-' },
            { key: 'last', header: 'Последняя оплата', muted: true, render: (row) => <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{row.last}</span> },
            { key: 'contact', header: 'Контакт', render: (row) => { const latest = logsFor(row.clientId)[0]; return latest ? <button type="button" className="ops-count-button" onClick={() => setHistoryClientId(row.clientId)}>{latest.status === 'failed' ? 'Нужно повторить' : 'Связались'}</button> : <span className="muted">Не связывались</span> } },
            { key: 'balance', header: 'Баланс', align: 'right', width: 120, render: (row) => <Money amount={row.balance} signed /> },
            {
              key: 'act',
              header: '',
              width: 96,
              render: (row) => (
                <div className="row-actions">
                  <IconButton label="Карточка клиента" size="sm" onClick={() => go?.('clientDetail', { clientId: row.clientId })}><I.User size={16} /></IconButton>
                  <IconButton label="Отправить напоминание" size="sm" disabled={busyId != null} onClick={() => sendReminders([row], row.id)}><I.Bell size={16} /></IconButton>
                  <IconButton label="История напоминаний" size="sm" onClick={() => setHistoryClientId(row.clientId)}><I.File size={16} /></IconButton>
                </div>
              ),
            },
          ]}
        />
        {historyClientId && <div className="card card-pad" style={{ marginTop: 16 }}><div className="ops-section-head"><div className="eyebrow">История напоминаний</div><Button size="sm" variant="subtle" onClick={() => setHistoryClientId(null)}>Закрыть</Button></div>{logsFor(historyClientId).map((log) => <div className="ops-detail-row" key={log.id}><span><strong>{log.subject || 'Напоминание'}</strong><small>{new Date(log.created_at).toLocaleString('ru-RU')} · {log.channel}</small></span><span>{log.status === 'failed' ? <Button size="sm" variant="secondary" disabled={busyId != null} onClick={() => retryNotification(log)}>Повторить</Button> : log.status}</span></div>)}{!logsFor(historyClientId).length && <div className="empty">Напоминаний ещё не отправляли.</div>}</div>}
      </div>
    )
  }
}

