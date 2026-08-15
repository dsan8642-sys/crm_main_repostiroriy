import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage } from '../../api.js'
import { asMoneyMajor, mapAdminDebtorRows } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { ListFeedback, ListPagination, ListToolbar, useScreenList } from '../listFoundation.jsx'
import { ActionPopover, EntityMobileCard } from '../EntityListPrimitives.jsx'
import { formatEntityDate, formatEntityMoney } from '../entityListContracts.js'

const serializeDebtorFilters = (filters) => ({
  group_id: filters.group_id,
  min_amount_minor: filters.min_amount ? Math.round(Number(filters.min_amount) * 100) : '',
  days_overdue_max: filters.days_overdue_max,
})

export function createAdminDebtorsScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Table, Money, Button, Avatar, Badge, IconButton, Banner } = components
  const I = icons

  return function ApiAdminDebtors({ go, currentUser }) {
    const debtorList = useScreenList({
      path: '/api/admin/debtors/',
      itemKey: 'debtors',
      mapRows: mapAdminDebtorRows,
      role: 'admin',
      route: 'debtors',
      userKey: currentUser?.id || currentUser?.username,
      initialFilters: { group_id: '', min_amount: '', days_overdue_max: '30' },
      serializeFilters: serializeDebtorFilters,
      defaultOrder: '-balance',
    })
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [busyId, setBusyId] = useState(null)
    const [logs, setLogs] = useState([])
    const [historyClientId, setHistoryClientId] = useState(null)
    const debtors = debtorList.rows
    const total = -asMoneyMajor(debtorList.payload.summary?.balance_minor || 0)
    const groups = adminData.groups || []
    const visibleDebtors = debtors

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

    async function copyPhone(row) {
      if (!row.parent) {
        setError('Телефон клиента не указан.')
        return
      }
      try {
        await navigator.clipboard.writeText(row.parent)
        setMessage(`Телефон ${row.child} скопирован.`)
      } catch {
        setError('Браузер не дал доступ к буферу обмена.')
      }
    }

    const logsFor = (clientId) => logs.filter((log) => String(log.recipient_id) === String(clientId))
    const openBalance = (row) => go?.('clientDetail', {
      clientId: row.clientId,
      tab: 'payments',
      participantId: row.studentId,
      balanceAmount: String(Math.abs(row.balance).toFixed(2)),
    })

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h1 className="page-title">Должники</h1>
            <p className="page-desc">
              Клиентов: {debtorList.pagination.total} · общий долг{' '}
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

        <ListToolbar list={debtorList} searchLabel="Поиск должников" searchPlaceholder="Участник, контакт, группа или причина">
          <label>Период<select value={debtorList.draftFilters.days_overdue_max} onChange={(event) => debtorList.setDraftFilter('days_overdue_max', event.target.value)}><option value="1">Сегодня</option><option value="3">3 дня</option><option value="7">7 дней</option><option value="14">14 дней</option><option value="30">30 дней</option></select></label>
          <label>Группа<select value={debtorList.draftFilters.group_id} onChange={(event) => debtorList.setDraftFilter('group_id', event.target.value)}><option value="">Все</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></label>
          <label>Долг от<input aria-label="Минимальный долг" inputMode="decimal" value={debtorList.draftFilters.min_amount} onChange={(event) => debtorList.setDraftFilter('min_amount', event.target.value)} placeholder="0" /></label>
        </ListToolbar>
        <Badge tone="danger" dot>Просроченные начисления</Badge>

        <ListFeedback list={debtorList} emptyLabel="Должников нет" />
        <div className="ops-entity-desktop-table"><Table
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
            { key: 'balance', header: 'Баланс', align: 'right', width: 140, render: (row) => <button type="button" className="ops-link-button ops-debt-balance-action" onClick={() => openBalance(row)}><Money amount={row.balance} signed /></button> },
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
        /></div>
        <div className="ops-entity-mobile-list">
          {visibleDebtors.map((row) => (
            <EntityMobileCard key={row.id} className="ops-debtor-compact-card" labelledBy={`debtor-card-${row.id}`}>
              <div className="ops-compact-card-head">
                <button type="button" className="ops-compact-card-title with-avatar" onClick={() => go?.('clientDetail', { clientId: row.clientId })}><Avatar name={row.child} size={34} /><strong id={`debtor-card-${row.id}`} title={row.child}>{row.child}</strong></button>
                <span className="ops-debtor-amount">{formatEntityMoney(row.balance)}</span>
                <ActionPopover label={`Действия: ${row.child}`} actions={[
                  { key: 'profile', label: 'Профиль', onSelect: () => go?.('clientDetail', { clientId: row.clientId }) },
                  { key: 'copy', label: 'Скопировать телефон', disabled: !row.parent, onSelect: () => copyPhone(row) },
                  { key: 'balance', label: 'Внести оплату', onSelect: () => openBalance(row) },
                ]} />
              </div>
              <div className="ops-compact-card-line"><span>Долг</span><strong>{row.daysOverdue ? `${row.daysOverdue} дн. · ${formatEntityDate(row.dueDate)}` : 'Дата не указана'}</strong></div>
              <div className="ops-compact-card-footer"><span className="mono">{row.parent || 'Телефон не указан'}</span><button type="button" className="ops-inline-copy" disabled={!row.parent} onClick={() => copyPhone(row)}>Скопировать</button></div>
            </EntityMobileCard>
          ))}
        </div>
        <ListPagination list={debtorList} />
        {historyClientId && <div className="card card-pad" style={{ marginTop: 16 }}><div className="ops-section-head"><div className="eyebrow">История напоминаний</div><Button size="sm" variant="subtle" onClick={() => setHistoryClientId(null)}>Закрыть</Button></div>{logsFor(historyClientId).map((log) => <div className="ops-detail-row" key={log.id}><span><strong>{log.subject || 'Напоминание'}</strong><small>{new Date(log.created_at).toLocaleString('ru-RU')} · {log.channel}</small></span><span>{log.status === 'failed' ? <Button size="sm" variant="secondary" disabled={busyId != null} onClick={() => retryNotification(log)}>Повторить</Button> : log.status}</span></div>)}{!logsFor(historyClientId).length && <div className="empty">Напоминаний ещё не отправляли.</div>}</div>}
      </div>
    )
  }
}

