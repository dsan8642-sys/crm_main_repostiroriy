import React, { useCallback, useMemo, useState } from 'react'

import { adminFinanceTranslator } from '../../adminFinanceLocales.js'
import { api, apiErrorMessage } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import { ActionPopover, EntityMobileCard } from '../EntityListPrimitives.jsx'
import { FormModal } from '../FormModal.jsx'
import { ListFeedback, ListPagination, ListToolbar, useScreenList } from '../listFoundation.jsx'
import { loadAdminParticipantOptions } from '../participantSearch.js'
import { SearchableSelect } from '../SearchableSelect.jsx'

const CATEGORIES = [
  ['active', 'subscriptions.active'],
  ['ending_soon', 'subscriptions.endingSoon'],
  ['depleted', 'subscriptions.depleted'],
  ['expired_remaining', 'subscriptions.expiredRemaining'],
  ['future', 'subscriptions.future'],
  ['history', 'subscriptions.history'],
]

export function createAdminSubscriptionsScreen(components, adminData = {}) {
  const { Table, Button, Badge, Tabs, Banner } = components

  return function ApiAdminSubscriptions({ go, currentUser }) {
    const { locale } = useLocale()
    const t = useMemo(() => adminFinanceTranslator(locale), [locale])
    const [category, setCategory] = useState('active')
    const [selling, setSelling] = useState(false)
    const [participantId, setParticipantId] = useState('')
    const [saleError, setSaleError] = useState(null)
    const groups = adminData.groups || []
    const subscriptionTypes = adminData.subscriptionTypes || []
    const list = useScreenList({
      path: '/api/admin/subscriptions/', itemKey: 'subscriptions', role: 'admin',
      route: `subscriptions-${category}`, userKey: currentUser?.id || currentUser?.username,
      initialFilters: { subscription_type_id: '', group_id: '', end_from: '', end_to: '' },
      fixedParams: { category },
    })
    const counts = list.payload.counts || {}
    const loadOptions = useCallback((query, options) => loadAdminParticipantOptions(query, options), [])
    const participantOptions = (adminData.clients || []).map((client) => ({
      value: client.studentId,
      label: `${client.last || ''} ${client.first || ''}`.trim(),
      description: client.phone || client.email || client.group || '',
    }))
    const dateLabel = (value) => value
      ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(`${value}T12:00:00`))
      : '—'
    const groupsLabel = (row) => (row.groups || []).map((group) => group.name).join(', ') || '—'
    const remaining = (row) => row.remaining_sessions == null ? '—' : row.remaining_sessions

    function openAction(row, action) {
      go?.('clientDetail', {
        clientId: row.client_id, participantId: row.participant_id, tab: 'subscriptions',
        financeAction: action === 'open_client' ? null : action, subscriptionId: row.id,
      })
    }

    async function continueSale() {
      if (!participantId) return
      setSaleError(null)
      try {
        const participant = await api.get(`/api/admin/participants/${participantId}/`)
        setSelling(false)
        go?.('clientDetail', {
          clientId: participant.client_id, participantId, tab: 'subscriptions', financeAction: 'issue',
        })
      } catch (error) {
        setSaleError(apiErrorMessage(error, t('subscriptions.participantLoadError')))
      }
    }

    const actionsFor = (row) => (row.allowed_actions || []).map((action) => ({
      key: action, label: t(`subscriptions.action.${action}`), onSelect: () => openAction(row, action),
    }))

    return (
      <div className="page page-wide ops-subscriptions-page">
        <div className="page-head"><div><h1 className="page-title">{t('subscriptions.title')}</h1><p className="page-desc">{t('subscriptions.description')}</p></div><Button variant="primary" onClick={() => { setParticipantId(''); setSelling(true) }}>{t('subscriptions.sell')}</Button></div>
        <Tabs value={category} onChange={setCategory} style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }} items={CATEGORIES.map(([value, key]) => ({ value, label: `${t(key)} (${counts[value] ?? 0})` }))} />
        <ListToolbar list={list} searchLabel={t('subscriptions.search')} searchPlaceholder={t('subscriptions.searchPlaceholder')}>
          <label>{t('field.subscriptionType')}<select value={list.draftFilters.subscription_type_id} onChange={(event) => list.setDraftFilter('subscription_type_id', event.target.value)}><option value="">{t('common.all')}</option>{subscriptionTypes.map((type) => <option key={type.typeId} value={type.typeId}>{type.name}</option>)}</select></label>
          <label>{t('common.group')}<select value={list.draftFilters.group_id} onChange={(event) => list.setDraftFilter('group_id', event.target.value)}><option value="">{t('common.all')}</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></label>
          <label>{t('subscriptions.endFrom')}<input type="date" value={list.draftFilters.end_from} onChange={(event) => list.setDraftFilter('end_from', event.target.value)} /></label>
          <label>{t('subscriptions.endTo')}<input type="date" value={list.draftFilters.end_to} onChange={(event) => list.setDraftFilter('end_to', event.target.value)} /></label>
        </ListToolbar>
        <ListFeedback list={list} emptyLabel={t('subscriptions.empty')} />
        <div className="ops-entity-desktop-table"><Table rows={list.rows} emptyLabel={t('subscriptions.empty')} columns={[
          { key: 'participant', header: t('common.participant'), render: (row) => <button type="button" className="ops-link-button strong" onClick={() => openAction(row, 'open_client')}>{row.participant_name}</button> },
          { key: 'phone', header: t('common.phone'), render: (row) => row.phone || '—' },
          { key: 'groups', header: t('common.groups'), render: groupsLabel },
          { key: 'type', header: t('field.subscriptionType') },
          { key: 'remaining', header: t('subscriptions.remaining'), align: 'right', render: (row) => <span className={Number(row.remaining_sessions) < 0 ? 'ops-negative-value' : ''}>{remaining(row)}</span> },
          { key: 'end', header: t('subscriptions.effectiveEnd'), render: (row) => <span className="ops-subscription-end">{dateLabel(row.effective_end_date)}{category === 'expired_remaining' && <Badge tone="warning">{t('subscriptions.graceUntil', { date: dateLabel(row.grace_end_date) })}</Badge>}</span> },
          { key: 'actions', header: '', width: 64, render: (row) => <ActionPopover label={t('common.actionsFor', { name: row.participant_name })} actions={actionsFor(row)} /> },
        ]} /></div>
        <div className="ops-entity-mobile-list">{list.rows.map((row) => <EntityMobileCard key={row.id} labelledBy={`subscription-${row.id}`} className="ops-subscription-card">
          <div className="ops-compact-card-head"><button type="button" className="ops-compact-card-title" onClick={() => openAction(row, 'open_client')}><strong id={`subscription-${row.id}`}>{row.participant_name}</strong></button><ActionPopover label={t('common.actionsFor', { name: row.participant_name })} actions={actionsFor(row)} /></div>
          <div className="ops-compact-card-line"><span>{t('common.phone')}</span><strong>{row.phone || '—'}</strong></div>
          <div className="ops-compact-card-line"><span>{t('common.groups')}</span><strong>{groupsLabel(row)}</strong></div>
          <div className="ops-compact-card-line"><span>{t('field.subscriptionType')}</span><strong>{row.type}</strong></div>
          <div className="ops-compact-card-line"><span>{t('subscriptions.remaining')}</span><strong className={Number(row.remaining_sessions) < 0 ? 'ops-negative-value' : ''}>{remaining(row)}</strong></div>
          <div className="ops-compact-card-line"><span>{t('subscriptions.effectiveEnd')}</span><strong>{dateLabel(row.effective_end_date)}</strong></div>
          {category === 'expired_remaining' && <Badge tone="warning">{t('subscriptions.graceUntil', { date: dateLabel(row.grace_end_date) })}</Badge>}
        </EntityMobileCard>)}</div>
        <ListPagination list={list} />
        <FormModal open={selling} title={t('subscriptions.sell')} size="sm" dirty={Boolean(participantId)} onRequestClose={() => { setSelling(false); setSaleError(null) }} footer={({ requestClose }) => <><Button variant="secondary" onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" disabled={!participantId} onClick={continueSale}>{t('common.continue')}</Button></>}>
          {saleError && <Banner tone="danger">{saleError}</Banner>}
          <SearchableSelect label={t('common.participant')} value={participantId} onChange={setParticipantId} options={participantOptions} loadOptions={loadOptions} placeholder={t('subscriptions.searchParticipant')} />
        </FormModal>
      </div>
    )
  }
}
