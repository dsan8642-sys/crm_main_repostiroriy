import React, { useEffect, useMemo, useState } from 'react'
import { adminLocaleTag, adminTranslator } from '../../adminLocales.js'
import { api, downloadFile } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import { asMoneyMajor, formatDate, formatShortDate, formatTime, mapAdminSessionRows } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { dateToIso } from '../scheduleContracts.js'
import { CompactStatusRow, QuickActions, TodaySessionCard } from '../TodayPrimitives.jsx'

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
            sessions: sessionPayload ? mapAdminSessionRows(sessionPayload.sessions || []) : current.sessions,
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
    const now = new Date()
    const activeSessions = sessions
      .filter((session) => !session.isCancelled)
      .sort((left, right) => new Date(left.startAt) - new Date(right.startAt))
    const currentSession = activeSessions.find((session) => (
      new Date(session.startAt) <= now && now < new Date(session.endAt)
    ))
    const primarySession = currentSession || activeSessions.find(
      (session) => new Date(session.startAt) > now,
    )
    const todayIso = dateToIso(now)
    const todaySessions = activeSessions.filter(
      (session) => session.startAt?.slice(0, 10) === todayIso,
    ).slice(0, 5)
    const exceptions = sessions.filter((session) => session.isCancelled).slice(0, 3)

    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">{t('overview.title')}</h1>
            <p className="page-desc">{t('overview.description')}</p>
          </div>
        </div>

        <TodaySessionCard
          Button={Button}
          eyebrow={currentSession ? t('overview.currentSession') : t('overview.nearestSession')}
          title={primarySession?.group}
          detail={primarySession && `${primarySession.date} · ${primarySession.start}-${primarySession.end}`}
          meta={primarySession && `${primarySession.trainer} · ${primarySession.location}`}
          icon={<I.Calendar size={20} />}
          actionLabel={t('overview.openAttendance')}
          onOpen={() => go('attendance', { sessionId: primarySession?.sessionId })}
          emptyTitle={t('overview.noUpcomingTitle')}
          emptyDetail={t('overview.noUpcomingDetail')}
        />

        <QuickActions
          label={t('overview.quickLinks')}
          actions={[
            { label: t('overview.findClient'), icon: <I.ClientFamily size={18} />, onClick: () => go('clients') },
            { label: t('overview.createClient'), icon: <I.User size={18} />, onClick: () => go('clients', { createClient: '1' }) },
            { label: t('overview.schedule'), icon: <I.Calendar size={18} />, onClick: () => go('schedule') },
            { label: t('overview.individualSession'), icon: <I.Waves size={18} />, onClick: () => go('schedule', { createSession: 'individual' }) },
          ]}
        />

        {pendingCount > 0 && (
          <Banner tone="warning" title={t('overview.pendingTitle', { count: pendingCount })} style={{ marginTop: 18 }}
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

        <div className="ops-section-head" style={{ margin: '20px 0 10px' }}>
          <div className="eyebrow">{t('overview.todaySessions')}</div>
          <Button size="sm" variant="secondary" onClick={() => go('schedule')}>{t('overview.allSessions')}</Button>
        </div>
        <CompactStatusRow
          items={todaySessions.map((session) => ({
            id: session.id,
            primary: `${session.start}-${session.end} · ${session.group}`,
            secondary: `${session.trainer} · ${session.location}`,
            onClick: () => go('attendance', { sessionId: session.sessionId }),
          }))}
          emptyLabel={t('overview.empty')}
        />

        <div className="ops-section-head" style={{ margin: '20px 0 10px' }}>
          <div className="eyebrow">{t('overview.exceptions')}</div>
        </div>
        <CompactStatusRow
          items={exceptions.map((session) => ({
            id: session.id,
            primary: `${session.date} · ${session.group}`,
            secondary: t('overview.cancelled'),
            onClick: () => go('schedule', { tab: 'list' }),
          }))}
          emptyLabel={t('overview.noExceptions')}
        />
      </div>
    )
  }
}

