import React, { useEffect, useMemo, useState } from 'react'
import { adminLocaleTag, adminTranslator } from '../../adminLocales.js'
import { api, downloadFile } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import { asMoneyMajor, formatDate, formatShortDate, formatTime, mapAdminSessionRows } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { dateToIso } from '../scheduleContracts.js'

export function createAdminOverviewScreen(components, icons, adminData = {}) {
  const { Money, Button, Banner, Badge } = components
  const I = icons

  function Kpi({ icon, label, value, sub, tone, onClick }) {
    return (
      <button type="button" className="kpi ops-kpi-button" onClick={onClick}>
        <div className="kpi-label"><span className="kpi-ico">{icon}</span>{label}</div>
        <div className="kpi-value" style={tone ? { color: tone } : null}>{value}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </button>
    )
  }

  return function ApiAdminOverview({ go }) {
    const { locale } = useLocale()
    const t = useMemo(() => adminTranslator(locale), [locale])
    const localeTag = adminLocaleTag(locale)
    const data = adminData
    const [overviewLists, setOverviewLists] = useState(() => ({
      sessions: data.sessions || [],
      pendingCount: (data.payments || []).filter((payment) => payment.status === 'pending').length,
      debtorCount: (data.debtors || []).length,
      debtTotal: (data.debtors || []).reduce((sum, row) => sum + Math.abs(row.balance || 0), 0),
    }))

    useEffect(() => {
      let alive = true
      const now = new Date()
      const dateFrom = dateToIso(now)
      const dateTo = dateToIso(new Date(now.getTime() + 30 * 86400000))
      const sessionQuery = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        page: '1',
        page_size: '200',
      })
      Promise.allSettled([
        api.get(`/api/admin/schedule/sessions/?${sessionQuery}`),
        api.get('/api/admin/payments/?page=1&page_size=50&status=pending&order=-date'),
        api.get('/api/admin/debtors/?page=1&page_size=50&order=-balance'),
      ]).then(([sessionsResult, paymentsResult, debtorsResult]) => {
        if (!alive) return
        setOverviewLists((current) => {
          const sessionPayload = sessionsResult.status === 'fulfilled' ? sessionsResult.value : null
          const paymentPayload = paymentsResult.status === 'fulfilled' ? paymentsResult.value : null
          const debtorPayload = debtorsResult.status === 'fulfilled' ? debtorsResult.value : null
          const debtorRows = debtorPayload?.debtors || []
          return {
            sessions: sessionPayload ? mapAdminSessionRows(sessionPayload.sessions || []).slice(0, 5) : current.sessions,
            pendingCount: paymentPayload
              ? (paymentPayload.pagination?.total ?? (paymentPayload.payments || []).filter((payment) => payment.status === 'pending').length)
              : current.pendingCount,
            debtorCount: debtorPayload
              ? (debtorPayload.pagination?.total ?? debtorRows.length)
              : current.debtorCount,
            debtTotal: debtorPayload
              ? Math.abs(asMoneyMajor(debtorPayload.summary?.balance_minor
                ?? debtorRows.reduce((sum, row) => sum + Number(row.balance_minor || 0), 0)))
              : current.debtTotal,
          }
        })
      })
      return () => { alive = false }
    }, [])

    const sessions = overviewLists.sessions
    const pendingCount = overviewLists.pendingCount
    const debtorCount = overviewLists.debtorCount
    const debtTotal = overviewLists.debtTotal

    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">{t('overview.title')}</h1>
            <p className="page-desc">{t('overview.description')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" iconLeft={<I.Calendar size={15} />} onClick={() => go('schedule')}>{t('overview.schedule')}</Button>
            <Button variant="primary" iconLeft={<I.Cash size={15} />} onClick={() => go('payments')}>{t('overview.payments')}</Button>
          </div>
        </div>

        {pendingCount > 0 && (
          <Banner tone="warning" title={t('overview.pendingTitle', { count: pendingCount })} style={{ marginBottom: 16 }}
            action={<Button size="sm" variant="subtle" onClick={() => go('payments', { tab: 'review' })}>{t('common.open')}</Button>}>
            {t('overview.pendingHint')}
          </Banner>
        )}

        <div className="eyebrow" style={{ marginBottom: 10 }}>{t('overview.quickLinks')}</div>
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <Kpi icon={<I.Calendar size={15} />} label={t('overview.sessions')} value={sessions.length} sub={t('overview.todayUpcoming')} onClick={() => go('schedule', { tab: 'day' })} />
          <Kpi icon={<I.ClientFamily size={15} />} label={t('overview.clients')} value={(data.clients || []).length} sub={t('overview.openDatabase')} onClick={() => go('clients')} />
          <Kpi icon={<I.TrainerWhistle size={15} />} label={t('overview.trainers')} value={(data.trainers || []).filter((row) => row.active).length} sub={t('overview.openTeam')} onClick={() => go('trainers')} />
          <Kpi icon={<I.Alert size={15} />} label={t('overview.debtors')} value={debtorCount} sub={`${debtTotal.toLocaleString(localeTag)} zł`} tone="var(--money-debt)" onClick={() => go('debtors')} />
        </div>

        <div className="ops-section-head" style={{ marginBottom: 10 }}>
          <div className="eyebrow">{t('overview.upcoming')}</div>
          <Button size="sm" variant="secondary" onClick={() => go('schedule')}>{t('overview.allSessions')}</Button>
        </div>
        <div className="card ops-upcoming-sessions">
          {sessions.slice(0, 5).map((session, index, list) => (
            <button
              key={session.id}
              type="button"
              className="ops-list-click-row ops-upcoming-session-row"
              onClick={() => go('attendance', { sessionId: session.sessionId })}
              style={{ borderBottom: index < list.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
            >
              <span className="ops-upcoming-session-primary">
                <span className="mono ops-upcoming-session-time">{session.date} · {session.start}-{session.end}</span>
                <span className="strong ops-upcoming-session-name">{session.group}</span>
              </span>
              <span className="ops-upcoming-session-secondary">
                <span className="ops-upcoming-session-details">
                  <span className="muted ops-upcoming-session-trainer">{session.trainer}</span>
                  <span className="muted ops-upcoming-session-location">{session.location}</span>
                </span>
                <span className="ops-upcoming-session-status">
                  <Badge
                    tone={session.status === 'cancelled' ? 'danger' : 'primary'}
                    style={{ maxWidth: '100%', height: 'auto', minHeight: 20, whiteSpace: 'normal', textAlign: 'center' }}
                  >
                    {session.status === 'cancelled' ? t('overview.cancelled') : t('overview.scheduled')}
                  </Badge>
                </span>
              </span>
            </button>
          ))}
          {sessions.length === 0 && (
            <button type="button" className="ops-empty-action" onClick={() => go('schedule')}>{t('overview.empty')}</button>
          )}
        </div>
      </div>
    )
  }
}

