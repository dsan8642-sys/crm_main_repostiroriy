import React, { useEffect, useMemo, useState } from 'react'
import { adminLocaleTag, adminTranslator } from '../../adminLocales.js'
import { api, apiErrorMessage } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
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
    const { locale } = useLocale()
    const t = useMemo(() => adminTranslator(locale), [locale])
    const localeTag = adminLocaleTag(locale)
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
      try { setLogs((await api.get('/api/admin/notifications/logs/?event_type=mass_mailing')).logs || []) } catch (err) { setError(apiErrorMessage(err, t('debtors.loadHistoryError'))) }
    }

    useEffect(() => { loadLogs() }, [])

    async function sendReminders(rows, id) {
      const parentIds = [...new Set(rows.map((row) => row.clientId).filter(Boolean))]
      if (parentIds.length === 0) {
        setError(t('debtors.noRecipients'))
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
        setMessage(t('debtors.queued', { queued: result.queued, skipped: result.skipped }))
        await loadLogs()
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, t('debtors.sendError')))
      } finally {
        setBusyId(null)
      }
    }

    async function retryNotification(log) {
      setBusyId(`retry-${log.id}`); setError('')
      try { await api.post(`/api/admin/notifications/logs/${log.id}/retry/`); setMessage(t('debtors.retryQueued')); await loadLogs() } catch (err) { setError(apiErrorMessage(err, t('debtors.retryError'))) } finally { setBusyId(null) }
    }

    async function copyPhone(row) {
      if (!row.parent) {
        setError(t('debtors.noPhone'))
        return
      }
      try {
        await navigator.clipboard.writeText(row.parent)
        setMessage(t('debtors.phoneCopied', { name: row.child }))
      } catch {
        setError(t('debtors.clipboardError'))
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
            <h1 className="page-title">{t('debtors.title')}</h1>
            <p className="page-desc">
              {t('debtors.summary', { count: debtorList.pagination.total })} · {t('debtors.totalDebt')}{' '}
              <span style={{ color: 'var(--money-debt)', fontWeight: 600 }}>
                {Math.abs(total).toLocaleString(localeTag, { minimumFractionDigits: 2 })} zł
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
            {t('debtors.sendAll', { count: visibleDebtors.length })}
          </Button>
        </div>

        <ToastNotice id="admin-debtors-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError('')}>{error}</Banner>}

        <ListToolbar list={debtorList} searchLabel={t('debtors.search')} searchPlaceholder={t('debtors.searchPlaceholder')}>
          <label>{t('debtors.period')}<select value={debtorList.draftFilters.days_overdue_max} onChange={(event) => debtorList.setDraftFilter('days_overdue_max', event.target.value)}><option value="1">{t('debtors.today')}</option><option value="3">{t('debtors.days3')}</option><option value="7">{t('debtors.days7')}</option><option value="14">{t('debtors.days14')}</option><option value="30">{t('debtors.days30')}</option></select></label>
          <label>{t('common.group')}<select value={debtorList.draftFilters.group_id} onChange={(event) => debtorList.setDraftFilter('group_id', event.target.value)}><option value="">{t('common.all')}</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></label>
          <label>{t('debtors.minDebt')}<input aria-label={t('debtors.minDebtAria')} inputMode="decimal" value={debtorList.draftFilters.min_amount} onChange={(event) => debtorList.setDraftFilter('min_amount', event.target.value)} placeholder="0" /></label>
        </ListToolbar>
        <Badge tone="danger" dot>{t('debtors.overdueCharges')}</Badge>

        <ListFeedback list={debtorList} emptyLabel={t('debtors.empty')} />
        <div className="ops-entity-desktop-table"><Table
          rows={visibleDebtors}
          emptyLabel={t('debtors.empty')}
          columns={[
            { key: 'child', header: t('common.participant'), render: (row) => <button type="button" className="ops-link-button" onClick={() => go?.('clientDetail', { clientId: row.clientId })}><Avatar name={row.child} size={26} /><span className="strong">{row.child}</span></button> },
            { key: 'parent', header: t('debtors.contact'), muted: true },
            { key: 'group', header: t('common.group'), muted: true },
            { key: 'reason', header: t('debtors.reason'), render: (row) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--red-600)', fontSize: 'var(--fs-xs)', fontWeight: 500 }}><I.Alert size={13} />{row.reason}</span> },
            { key: 'dueDate', header: t('debtors.overdue'), muted: true, render: (row) => row.daysOverdue ? `${t('common.days', { count: row.daysOverdue })} · ${row.dueDate}` : '-' },
            { key: 'last', header: t('debtors.lastPayment'), muted: true, render: (row) => <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{row.last}</span> },
            { key: 'contact', header: t('debtors.contact'), render: (row) => { const latest = logsFor(row.clientId)[0]; return latest ? <button type="button" className="ops-count-button" onClick={() => setHistoryClientId(row.clientId)}>{latest.status === 'failed' ? t('debtors.retryNeeded') : t('debtors.contacted')}</button> : <span className="muted">{t('debtors.notContacted')}</span> } },
            { key: 'balance', header: t('common.balance'), align: 'right', width: 140, render: (row) => <button type="button" className="ops-link-button ops-debt-balance-action" onClick={() => openBalance(row)}><Money amount={row.balance} signed /></button> },
            {
              key: 'act',
              header: '',
              width: 96,
              render: (row) => (
                <div className="row-actions">
                  <IconButton label={t('debtors.clientCard')} size="sm" onClick={() => go?.('clientDetail', { clientId: row.clientId })}><I.User size={16} /></IconButton>
                  <IconButton label={t('debtors.sendOne')} size="sm" disabled={busyId != null} onClick={() => sendReminders([row], row.id)}><I.Bell size={16} /></IconButton>
                  <IconButton label={t('debtors.reminderHistory')} size="sm" onClick={() => setHistoryClientId(row.clientId)}><I.File size={16} /></IconButton>
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
                <ActionPopover label={t('common.actionsFor', { name: row.child })} actions={[
                  { key: 'profile', label: t('debtors.profile'), onSelect: () => go?.('clientDetail', { clientId: row.clientId }) },
                  { key: 'copy', label: t('debtors.copyPhone'), disabled: !row.parent, onSelect: () => copyPhone(row) },
                  { key: 'balance', label: t('debtors.recordPayment'), onSelect: () => openBalance(row) },
                ]} />
              </div>
              <div className="ops-compact-card-line"><span>{t('debtors.debt')}</span><strong>{row.daysOverdue ? `${t('common.days', { count: row.daysOverdue })} · ${formatEntityDate(row.dueDate)}` : t('debtors.dateMissing')}</strong></div>
              <div className="ops-compact-card-footer"><span className="mono">{row.parent || t('debtors.phoneMissing')}</span><button type="button" className="ops-inline-copy" disabled={!row.parent} onClick={() => copyPhone(row)}>{t('debtors.copy')}</button></div>
            </EntityMobileCard>
          ))}
        </div>
        <ListPagination list={debtorList} />
        {historyClientId && <div className="card card-pad" style={{ marginTop: 16 }}><div className="ops-section-head"><div className="eyebrow">{t('debtors.reminderHistory')}</div><Button size="sm" variant="subtle" onClick={() => setHistoryClientId(null)}>{t('common.close')}</Button></div>{logsFor(historyClientId).map((log) => <div className="ops-detail-row" key={log.id}><span><strong>{log.subject || t('debtors.reminder')}</strong><small>{new Date(log.created_at).toLocaleString(localeTag)} · {log.channel}</small></span><span>{log.status === 'failed' ? <Button size="sm" variant="secondary" disabled={busyId != null} onClick={() => retryNotification(log)}>{t('debtors.retry')}</Button> : log.status}</span></div>)}{!logsFor(historyClientId).length && <div className="empty">{t('debtors.noReminders')}</div>}</div>}
      </div>
    )
  }
}

