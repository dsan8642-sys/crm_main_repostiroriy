import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api, apiErrorMessage, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime, mapClientAttendanceRows, mapClientChargeRows, mapClientPaymentRows } from '../../mappers.js'
import { CalendarNavigation, ScheduleCalendar, ScheduleList, ScheduleViewSwitcher } from '../ScheduleCalendar.jsx'
import { normalizeScheduleColorKey } from '../schedulePalette.js'
import { calendarRange, dateToIso, DEFAULT_SCHEDULE_VIEW, localToday } from '../scheduleContracts.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { useUnsavedChanges } from '../uiLifecycle.jsx'
import {
  clearFieldError,
  fieldErrorsFromApi,
  focusFirstFieldError,
  formErrorMessage,
} from '../formErrors.js'
import { ListFeedback, ListPagination, ListToolbar, useScreenList } from '../listFoundation.jsx'
import { ContextRow } from '../EntityListPrimitives.jsx'
import { TodaySessionCard } from '../TodayPrimitives.jsx'
import { assertPaymentReadback, createPaymentAttemptKey, moneyMajorToMinor } from '../financialContracts.js'
import { useLocale } from '../../i18n.jsx'
import { uiLocaleTag } from '../../localeContracts.js'

const serializeClientPeriodFilters = (filters) => {
  const days = Number(filters.period || 0)
  return {
    date_from: days ? dateToIso(new Date(Date.now() - days * 86400000)) : '',
    status: filters.status || '',
  }
}

const TOP_UP_FIELD_IDS = {
  amount: 'client-top-up-amount', file: 'client-top-up-file',
}
const PROFILE_FIELD_IDS = {
  firstName: 'client-profile-first-name', lastName: 'client-profile-last-name',
  email: 'client-profile-email', phone: 'client-profile-phone',
  language: 'client-profile-language',
}
const PROFILE_FIELD_MAP = {
  'account.first_name': 'firstName', first_name: 'firstName',
  'account.last_name': 'lastName', last_name: 'lastName',
  'account.email': 'email', email: 'email',
  'account.phone': 'phone', phone: 'phone',
  'account.preferred_language': 'language', preferred_language: 'language',
}

function profileFormFromAccount(account = {}) {
  return {
    firstName: account.first_name || '',
    lastName: account.last_name || '',
    email: account.email || '',
    phone: account.phone || '',
    language: account.preferred_language || 'ru',
  }
}

export function createClientScreens(components, icons, reloadRoleData, parentData = {}) {
  const { Table, StatusPill, Money, Button, Banner, Avatar, Input, Select } = components
  const I = icons

  function ReceiptAction({ payment }) {
    const { t } = useLocale()
    const [error, setError] = useState(null)
    if (!payment.receiptUrl) return <span className="muted">{t('client.receipt.none')}</span>
    return <span><button type="button" className="ops-link-button" onClick={async () => { try { setError(null); await downloadFile(payment.receiptUrl, payment.receipt) } catch (err) { setError(err.status === 403 ? t('client.receipt.forbidden') : t('client.receipt.unavailable')) } }}>{payment.receipt || t('client.receipt.download')}</button>{error && <small role="alert" className="muted">{error}</small>}</span>
  }

  function ChildButtons({ kid, setKid }) {
    const { t } = useLocale()
    const children = parentData.children || []
    const selected = children.find((child) => child.id === kid) || children[0]
    const [open, setOpen] = useState(false)
    if (!selected) return null
    return (
      <div className="ops-participant-context">
        <ContextRow value={selected.name} onChange={children.length > 1 ? () => setOpen((value) => !value) : null} changeLabel={open ? t('client.participant.hide') : t('client.participant.change')} />
        {open && <div className="ops-participant-options" role="group" aria-label={t('client.participant.choose')}>
          {children.map((child) => (
            <button key={child.id} type="button" aria-pressed={child.id === selected.id} onClick={() => { setKid(child.id); setOpen(false) }}>
              <Avatar name={child.name} size={28} /><span>{child.name}</span>
            </button>
          ))}
        </div>}
      </div>
    )
  }

  function Home({ kid, setKid, go }) {
    const { locale, t } = useLocale()
    const data = parentData
    const child = data.children?.find((item) => item.id === kid) || data.children?.[0]
    const next = child?.nextSession || (child ? (data.schedule?.[child.id] || []).find((session) => session.status === 'planned') : null)
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head">
          <div><h1 className="page-title">{t('runtime.client.home.title')}</h1><p className="page-desc">{t('client.home.desc')}</p></div>
          <ChildButtons kid={child?.id || kid} setKid={setKid} />
        </div>
        {child?.balance < 0 && (
          <Banner tone="danger" title={t('client.home.debt')} style={{ marginBottom: 14 }} action={<Button size="sm" variant="subtle" onClick={() => go('payments')}>{t('client.home.toPayments')}</Button>}>
            {t('client.home.amountDue', undefined, { name: child.name, amount: Math.abs(child.balance).toLocaleString(uiLocaleTag(locale)) })}
          </Banner>
        )}
        <TodaySessionCard
          Button={Button}
          eyebrow={t('client.home.next')}
          title={next?.group}
          detail={next && `${next.date} · ${next.start}${next.end ? `-${next.end}` : ''}`}
          meta={next && `${next.trainer}${next.location ? ` · ${next.location}` : ''}`}
          icon={<I.Calendar size={20} />}
          actionLabel={t('client.home.openDetails')}
          onOpen={() => go('schedule', { tab: next?.sessionId ? String(next.sessionId) : null })}
          emptyTitle={t('client.home.noPlanned')}
          emptyDetail={t('client.home.noPlanned')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <button type="button" className="card card-pad ops-action-card" onClick={() => go('subscription')}>
            <div className="kpi-label"><span className="kpi-ico"><I.Layers size={15} /></span>{t('runtime.client.subscription.title')}</div>
            <div className="strong" style={{ fontSize: 'var(--fs-lg)', margin: '4px 0 2px' }}>{child?.sub || '-'}</div>
            <div className="muted">{t('client.home.remaining', undefined, { count: child?.subLeft == null ? '∞' : child.subLeft, date: child?.subEnds || '-' })}</div>
          </button>
          <button type="button" className="card card-pad ops-action-card" onClick={() => go('payments', { tab: 'topup' })}>
            <div className="kpi-label"><span className="kpi-ico"><I.Wallet size={15} /></span>{t('client.home.balance')}</div>
            <Money amount={child?.balance || 0} signed size="var(--fs-lg)" />
            <div className="muted">{t('client.home.requestTopup')}</div>
          </button>
        </div>
      </div>
    )
  }

  function Schedule({ kid, setKid, initialTab }) {
    const { t } = useLocale()
    const child = (parentData.children || []).find((item) => item.id === kid)
    const normalize = (session) => session.startAt ? session : ({
      id: String(session.id),
      sessionId: session.id,
      date: formatShortDate(session.start_at),
      rawDate: session.start_at?.slice(0, 10) || '',
      startAt: session.start_at,
      endAt: session.end_at,
      start: formatTime(session.start_at),
      end: formatTime(session.end_at),
      group: session.group?.name || t('shared.individual'),
      trainer: session.effective_trainer || session.trainer,
      location: session.location,
      status: session.is_cancelled ? 'cancelled' : 'planned',
      sessionType: session.session_type || 'group',
      sessionTypeLabel: session.presentation_type_label || '',
      colorKey: normalizeScheduleColorKey(session.presentation_color_key),
      individualParticipant: session.individual_participant || null,
      deductsExpected: session.is_cancelled ? 0 : 1,
    })
    const [rows, setRows] = useState(() => (parentData.schedule?.[kid] || []).map(normalize))
    const [selectedId, setSelectedId] = useState(initialTab || null)
    const [displayMode, setDisplayMode] = useState('calendar')
    const [viewMode, setViewMode] = useState(DEFAULT_SCHEDULE_VIEW)
    const [focusDate, setFocusDate] = useState(localToday())
    const [error, setError] = useState(null)
    const range = useMemo(() => calendarRange(focusDate, viewMode), [focusDate, viewMode])
    useEffect(() => { if (initialTab) setSelectedId(initialTab) }, [initialTab])
    useEffect(() => {
      setRows((parentData.schedule?.[kid] || []).map(normalize))
    }, [kid, parentData.schedule, t])
    useEffect(() => {
      if (!child?.studentId) return undefined
      let active = true
      const query = new URLSearchParams({
        student_id: String(child.studentId),
        date_from: range.dateFrom,
        date_to: range.dateTo,
      })
      api.get(`/api/client/schedule/?${query}`)
        .then((payload) => {
          if (active) setRows((payload.sessions || []).map(normalize))
        })
        .catch((err) => {
          if (active) setError(apiErrorMessage(err, t('client.schedule.loadFailed')))
        })
      return () => { active = false }
    }, [child?.studentId, range.dateFrom, range.dateTo, t])
    const selected = rows.find((row) => String(row.sessionId) === String(selectedId))
    return (
      <div className="page page-wide">
        <div className="page-head"><div><h1 className="page-title">{t('runtime.client.schedule.title')}</h1><p className="page-desc">{t('client.schedule.desc')}</p></div><div className="ops-page-actions"><ChildButtons kid={kid} setKid={setKid} /><ScheduleViewSwitcher displayMode={displayMode} setDisplayMode={setDisplayMode} icons={I} /></div></div>
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <CalendarNavigation focusDate={focusDate} setFocusDate={setFocusDate} viewMode={viewMode} setViewMode={setViewMode} />
        </div>
        {selected && <div className="card ops-entity-card"><div className="ops-entity-head"><div><div className="eyebrow">{t('client.schedule.details')}</div><h3>{selected.group}</h3></div><Button size="sm" variant="subtle" onClick={() => setSelectedId(null)}>{t('shared.close')}</Button></div><div className="ops-summary-grid"><div><span>{t('client.schedule.dateTime')}</span><strong>{selected.date} · {selected.start}-{selected.end}</strong></div><div><span>{t('shared.trainer')}</span><strong>{selected.trainer}</strong></div><div><span>{t('client.schedule.place')}</span><strong>{selected.location}</strong></div><div><span>{t('client.schedule.deduction')}</span><strong>{selected.deductsExpected ? t('client.schedule.oneSession') : t('client.schedule.zeroSessions')}</strong></div></div><StatusPill status={selected.status} /></div>}
        {displayMode === 'calendar' && <ScheduleCalendar sessions={rows} focusDate={focusDate} viewMode={viewMode} setFocusDate={setFocusDate} setViewMode={setViewMode} onOpenSession={(row) => setSelectedId(row.sessionId)} ariaLabel={t('client.schedule.calendarLabel', undefined, { name: child?.name || t('client.schedule.fallbackParticipant') })} />}
        {displayMode === 'list' && <ScheduleList sessions={rows} testId="client-schedule-list" onOpenSession={(row) => setSelectedId(row.sessionId)} renderStatus={(row) => <span><StatusPill status={row.status} size="sm" /><small>{t('client.schedule.deductionShort', undefined, { count: row.deductsExpected ? '-1' : '0' })}</small></span>} />}
      </div>
    )
  }

  function Payments({ kid, setKid, currentUser, initialTab }) {
    const { t } = useLocale()
    const fileInputRef = useRef(null)
    const [file, setFile] = useState(null)
    const [amount, setAmount] = useState('')
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [fieldErrors, setFieldErrors] = useState({})
    const [busy, setBusy] = useState(false)
    const [mobileTab, setMobileTab] = useState('charges')
    const [idempotencyKey, setIdempotencyKey] = useState(() => createPaymentAttemptKey('client-top-up'))
    useUnsavedChanges(Boolean(amount || file), 'client-top-up-request')
    const child = (parentData.children || []).find((item) => item.id === kid)
    const participantQuery = child?.studentId ? `?student_id=${encodeURIComponent(child.studentId)}` : ''
    const chargeList = useScreenList({
      path: `/api/client/charges/${participantQuery}`,
      itemKey: 'charges',
      mapRows: mapClientChargeRows,
      role: 'client',
      route: `charges-${kid || 'account'}`,
      userKey: currentUser?.id || currentUser?.username,
      initialFilters: { status: '' },
      defaultOrder: 'date',
    })
    const paymentList = useScreenList({
      path: `/api/client/payment-history/${participantQuery}`,
      itemKey: 'payments',
      mapRows: mapClientPaymentRows,
      role: 'client',
      route: `payment-history-${kid || 'account'}`,
      userKey: currentUser?.id || currentUser?.username,
      initialFilters: { status: '', method: '' },
      defaultOrder: '-date',
    })
    const charges = chargeList.rows
    const payments = paymentList.rows

    useEffect(() => {
      if (['charges', 'history', 'topup'].includes(initialTab)) setMobileTab(initialTab)
    }, [initialTab])

    async function createTopUpRequest() {
      let amountMinor = null
      amountMinor = moneyMajorToMinor(amount)
      if (!amountMinor) {
        const nextErrors = { amount: t('client.topup.invalidAmount') }
        setFieldErrors(nextErrors)
        setError(null)
        focusFirstFieldError(nextErrors, TOP_UP_FIELD_IDS)
        return
      }
      if (!file) {
        const nextErrors = { file: t('client.topup.fileRequired') }
        setFieldErrors(nextErrors)
        setError(null)
        focusFirstFieldError(nextErrors, TOP_UP_FIELD_IDS)
        return
      }
      setBusy(true)
      setFieldErrors({})
      const formData = new FormData()
      if (child?.studentId) formData.set('student_id', child.studentId)
      formData.set('amount_minor', String(amountMinor))
      formData.set('currency', 'PLN')
      formData.set('file', file)
      formData.set('idempotency_key', idempotencyKey)
      try {
        const mutation = await api.postForm('/api/client/payments/top-up-requests/', formData)
        const created = mutation.top_up_request
        const readbackPayload = await api.get(`/api/client/payment-history/${participantQuery}`)
        const readback = (readbackPayload.payments || []).find((payment) => String(payment.id) === String(created.id))
        assertPaymentReadback(created, readback, 'pending')
        setMessage(t('client.topup.submitted'))
        setError(null)
        setFile(null)
        setAmount('')
        setIdempotencyKey(createPaymentAttemptKey('client-top-up'))
        if (fileInputRef.current) fileInputRef.current.value = ''
        await paymentList.retry()
        await reloadRoleData?.('client')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, {
          amount_minor: 'amount', file: 'file', currency: 'amount',
        })
        setFieldErrors(nextErrors)
        setError(formErrorMessage(err, t('client.topup.failed')))
        focusFirstFieldError(nextErrors, TOP_UP_FIELD_IDS)
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><div><h1 className="page-title">{t('runtime.client.payments.title')}</h1><p className="page-desc">{t('client.payments.desc')}</p></div><ChildButtons kid={kid} setKid={setKid} /></div>
        <ToastNotice id="client-payment-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>{t('client.topup.sending')}</BusyBanner>
        <div className="ops-client-finance-tabs" role="tablist" aria-label={t('client.payments.sections')}>
          {[['charges', t('client.payments.charges')], ['history', t('client.payments.history')], ['topup', t('client.payments.topup')]].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mobileTab === value} className={mobileTab === value ? 'is-active' : ''} onClick={() => setMobileTab(value)}>{label}</button>)}
        </div>
        <div className={`card card-pad ops-client-finance-section${mobileTab === 'topup' ? ' is-mobile-active' : ''}`} style={{ marginBottom: 16 }}>
          <div className="eyebrow">{t('client.topup.title')}</div>
          <div className="ops-inline-note" role="status">{t('client.topup.context', undefined, { name: child?.name || t('shared.notSelected') })} <Money amount={child?.balance || 0} signed /></div>
          <p className="muted" style={{ margin: '6px 0 14px' }}>{t('client.topup.explanation')}</p>
          <div className="ops-top-up-form">
            <Input id={TOP_UP_FIELD_IDS.amount} label={t('client.topup.amount')} inputMode="decimal" value={amount} error={fieldErrors.amount} onChange={(event) => { setAmount(event.target.value); setFieldErrors((current) => clearFieldError(current, 'amount')) }} placeholder="240,00" />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              {t('client.topup.file')}
              <input id={TOP_UP_FIELD_IDS.file} ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" aria-invalid={Boolean(fieldErrors.file)} aria-describedby={fieldErrors.file ? `${TOP_UP_FIELD_IDS.file}-error` : undefined} onChange={(event) => { setFile(event.target.files?.[0] || null); setFieldErrors((current) => clearFieldError(current, 'file')) }} />
              {fieldErrors.file && <small id={`${TOP_UP_FIELD_IDS.file}-error`} className="ops-field-error" role="alert">{fieldErrors.file}</small>}
            </label>
            <Button variant="primary" loading={busy} disabled={busy} iconLeft={<I.Upload size={15} />} onClick={createTopUpRequest}>{t('client.topup.submit')}</Button>
          </div>
        </div>
        <div className={`ops-client-finance-section${mobileTab === 'charges' ? ' is-mobile-active' : ''}`}>
        <div className="ops-financial-context" aria-label={t('client.charges.summary')}>
          <div><span>{t('client.charges.unpaid')}</span><strong>{asMoneyMajor(chargeList.payload?.summary?.unpaid_minor || 0).toFixed(2).replace('.', ',')} zł</strong></div>
          <div><span>{t('client.charges.overdue')}</span><strong>{chargeList.payload?.summary?.overdue_count || 0}</strong></div>
        </div>
        <ListToolbar list={chargeList} searchLabel={t('client.charges.search')} searchPlaceholder={t('client.charges.searchPlaceholder')}>
          <label>{t('shared.status')}<select value={chargeList.draftFilters.status} onChange={(event) => chargeList.setDraftFilter('status', event.target.value)}><option value="">{t('shared.all')}</option><option value="overdue">{t('client.charges.overdueOption')}</option><option value="upcoming">{t('client.charges.upcomingOption')}</option></select></label>
        </ListToolbar>
        <ListFeedback list={chargeList} emptyLabel={t('client.charges.empty')} />
        <Table rows={charges} emptyLabel={t('client.charges.empty')} columns={[
          { key: 'desc', header: t('client.charges.charge') },
          { key: 'child', header: t('shared.participant'), muted: true },
          { key: 'due', header: t('client.charges.due'), muted: true },
          { key: 'amount', header: t('shared.amount'), align: 'right', render: (row) => <Money amount={-Math.abs(row.amount)} signed /> },
          { key: 'status', header: t('shared.status'), render: (row) => <StatusPill status={row.status} size="sm" /> },
        ]} />
        <ListPagination list={chargeList} />
        </div>
        <div style={{ height: 16 }} />
        <div className={`ops-client-finance-section${mobileTab === 'history' ? ' is-mobile-active' : ''}`}>
        <ListToolbar list={paymentList} searchLabel={t('client.payments.search')} searchPlaceholder={t('client.payments.searchPlaceholder')}>
          <label>{t('shared.status')}<select value={paymentList.draftFilters.status} onChange={(event) => paymentList.setDraftFilter('status', event.target.value)}><option value="">{t('shared.all')}</option><option value="pending">{t('status.pending')}</option><option value="confirmed">{t('client.payments.confirmed')}</option><option value="rejected">{t('client.payments.rejected')}</option></select></label>
          <label>{t('client.payments.method')}<select value={paymentList.draftFilters.method} onChange={(event) => paymentList.setDraftFilter('method', event.target.value)}><option value="">{t('shared.all')}</option><option value="cash">{t('client.payments.cash')}</option><option value="bank_transfer">{t('client.payments.bank')}</option><option value="card">{t('client.payments.card')}</option><option value="other">{t('client.payments.other')}</option></select></label>
        </ListToolbar>
        <ListFeedback list={paymentList} emptyLabel={t('client.payments.empty')} />
        <p id="client-payment-history-scroll-hint" className="ops-client-payment-scroll-hint">{t('client.payments.scrollHint')}</p>
        <div
          className="ops-client-payment-table-region"
          role="region"
          aria-label={t('client.payments.historyLabel')}
          aria-describedby="client-payment-history-scroll-hint"
          tabIndex="0"
        >
          <Table rows={payments} emptyLabel={t('client.payments.empty')} columns={[
            { key: 'sourceLabel', header: t('client.payments.operation'), render: (row) => t(row.source === 'client_top_up' ? 'client.payments.sourceTopup' : 'client.payments.sourceAdmin') },
            { key: 'child', header: t('shared.participant') },
            { key: 'date', header: t('shared.date'), muted: true },
            { key: 'method', header: t('client.payments.method'), muted: true, render: (row) => t(`client.payments.${row.methodCode === 'bank_transfer' ? 'bank' : row.methodCode}`, row.method) },
            { key: 'amount', header: t('shared.amount'), align: 'right', render: (row) => <Money amount={Math.abs(row.amount)} signed /> },
            { key: 'status', header: t('shared.status'), render: (row) => <StatusPill status={row.status} size="sm" /> },
            { key: 'effect', header: t('client.payments.balance'), muted: true, render: (row) => row.affectsBalance ? t('client.payments.credited') : t('client.payments.noEffect') },
            { key: 'receipt', header: t('client.payments.document'), render: (row) => <ReceiptAction payment={row} /> },
          ]} />
        </div>
        <ListPagination list={paymentList} />
        </div>
      </div>
    )
  }

  function Subscription({ kid, setKid }) {
    const { t } = useLocale()
    const child = (parentData.children || []).find((item) => item.id === kid)
    const subscription = child?.subscription
    return <div className="page" style={{ maxWidth: 900 }}><div className="page-head"><div><h1 className="page-title">{t('runtime.client.subscription.title')}</h1><p className="page-desc">{t('client.subscription.desc')}</p></div><ChildButtons kid={child?.id || kid} setKid={setKid} /></div>{subscription ? <div className="card ops-entity-card"><div className="ops-entity-head"><div><div className="eyebrow">{t('client.subscription.current')}</div><h3>{subscription.type}</h3></div><StatusPill status={subscription.status} /></div><div className="ops-summary-grid"><div><span>{t('client.subscription.remaining')}</span><strong>{subscription.remaining_sessions == null ? t('client.subscription.unlimited') : subscription.remaining_sessions}</strong></div><div><span>{t('client.subscription.start')}</span><strong>{formatDate(subscription.start_date)}</strong></div><div><span>{t('client.subscription.validUntil')}</span><strong>{formatDate(subscription.effective_end_date)}</strong></div><div><span>{t('shared.status')}</span><strong>{t(`status.${subscription.status}`, subscription.status)}</strong></div></div></div> : <div className="card card-pad empty">{t('client.subscription.none')}</div>}</div>
  }

  function History({ kid, setKid, currentUser }) {
    const { t } = useLocale()
    const child = (parentData.children || []).find((item) => item.id === kid)
    const participantQuery = child?.studentId ? `?student_id=${encodeURIComponent(child.studentId)}` : ''
    const attendanceList = useScreenList({
      path: `/api/client/attendance/${participantQuery}`,
      itemKey: 'attendance',
      mapRows: mapClientAttendanceRows,
      role: 'client',
      route: `attendance-${kid || 'account'}`,
      userKey: currentUser?.id || currentUser?.username,
      initialFilters: { period: '90', status: '' },
      serializeFilters: serializeClientPeriodFilters,
      defaultOrder: '-date',
    })
    const attendance = attendanceList.rows
    const [selectedHistory, setSelectedHistory] = useState(null)
    const [historyTab, setHistoryTab] = useState('attendance')
    const visibleAttendance = attendance
    return (
      <div className="page page-wide">
        <div className="page-head"><div><h1 className="page-title">{t('runtime.client.history.title')}</h1><p className="page-desc">{t('client.history.desc')}</p></div><ChildButtons kid={kid} setKid={setKid} /></div>
        <div className="ops-tabs" role="tablist" aria-label={t('client.history.sections')}>
          <button type="button" role="tab" aria-selected={historyTab === 'attendance'} className={historyTab === 'attendance' ? 'is-active' : ''} onClick={() => setHistoryTab('attendance')}>{t('client.history.attendance')}</button>
          <button type="button" role="tab" aria-selected="false" aria-disabled="true" disabled title={t('client.history.messagesTitle')}>{t('client.history.messagesUnavailable')}</button>
        </div>
        {historyTab === 'attendance' && <ListToolbar list={attendanceList} searchLabel={t('client.history.search')} searchPlaceholder={t('client.history.searchPlaceholder')}>
          <label>{t('shared.period')}<select value={attendanceList.draftFilters.period} onChange={(event) => attendanceList.setDraftFilter('period', event.target.value)}><option value="30">{t('client.history.days30')}</option><option value="90">{t('client.history.days90')}</option><option value="365">{t('client.history.year')}</option><option value="">{t('client.history.allTime')}</option></select></label>
          <label>{t('shared.status')}<select value={attendanceList.draftFilters.status} onChange={(event) => attendanceList.setDraftFilter('status', event.target.value)}><option value="">{t('shared.all')}</option><option value="present">{t('status.present')}</option><option value="absent">{t('status.absent')}</option><option value="excused">{t('client.history.excused')}</option><option value="rescheduled">{t('status.moved')}</option></select></label>
        </ListToolbar>}
        {selectedHistory && <div className="card card-pad" style={{ marginBottom: 14 }}><div className="ops-section-head"><div><div className="eyebrow">{t('client.history.details')}</div><strong>{selectedHistory.label || selectedHistory.method}</strong></div><Button size="sm" variant="subtle" onClick={() => setSelectedHistory(null)}>{t('shared.close')}</Button></div><div className="muted">{t('client.history.detailLine', undefined, { date: selectedHistory.date })}</div></div>}
        {historyTab === 'attendance' && <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{t('client.history.attendance')}</div>
            <ListFeedback list={attendanceList} emptyLabel={t('client.history.empty')} />
            <Table rows={visibleAttendance} emptyLabel={t('client.history.empty')} columns={[
              { key: 'date', header: t('shared.date'), muted: true },
              { key: 'label', header: t('client.history.session'), render: (row) => <button type="button" className="ops-link-button" onClick={() => setSelectedHistory(row)}><span className="strong">{row.label}</span></button> },
              { key: 'trainer', header: t('shared.trainer'), muted: true },
              { key: 'status', header: t('shared.status'), render: (row) => <StatusPill status={row.status === 'rescheduled' ? 'moved' : row.status} size="sm" /> },
            ]} />
            <ListPagination list={attendanceList} />
        </div>}
      </div>
    )
  }

  function Profile({ kid, setKid, go }) {
    const { t } = useLocale()
    const account = parentData.account || {}
    const participants = parentData.profileParticipants || []
    const selectedChild = (parentData.children || []).find((item) => item.id === kid) || (parentData.children || [])[0]
    const [form, setForm] = useState(() => profileFormFromAccount(account))
    const [baseline, setBaseline] = useState(() => profileFormFromAccount(account))
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [fieldErrors, setFieldErrors] = useState({})
    const [busy, setBusy] = useState(false)
    const update = (field, value) => {
      setForm((current) => ({ ...current, [field]: value }))
      setFieldErrors((current) => clearFieldError(current, field))
    }
    useUnsavedChanges(
      Object.keys(form).some((field) => form[field] !== baseline[field]),
      'client-profile',
    )

    useEffect(() => {
      const next = profileFormFromAccount(account)
      setForm(next)
      setBaseline(next)
    }, [account.first_name, account.last_name, account.email, account.phone, account.preferred_language])

    async function saveProfile() {
      setBusy(true)
      setError(null)
      setFieldErrors({})
      try {
        await api.post('/api/client/profile/', {
          account: {
            first_name: form.firstName,
            last_name: form.lastName,
            email: form.email,
            phone: form.phone,
            preferred_language: form.language,
          },
        })
        setBaseline({ ...form })
        setMessage(t('client.profile.saved'))
        setError(null)
        reloadRoleData?.('client', { studentId: (parentData.children || []).find((item) => item.id === kid)?.studentId })
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, PROFILE_FIELD_MAP)
        setFieldErrors(nextErrors)
        setError(formErrorMessage(err, t('client.profile.saveFailed')))
        focusFirstFieldError(nextErrors, PROFILE_FIELD_IDS)
      } finally {
        setBusy(false)
      }
    }

    async function disconnectTelegram() {
      setError(null)
      try {
        await api.post('/api/client/profile/', { account: { telegram_disconnect: true } })
        await reloadRoleData?.('client')
      } catch (err) {
        setError(apiErrorMessage(err, t('client.profile.telegramFailed')))
      }
    }

    return (
      <div className="page page-wide">
        <div className="page-head"><div><h1 className="page-title">{account.full_name || t('runtime.client.profile.title')}</h1><p className="page-desc">{t('client.profile.currentBalance')} <Money amount={selectedChild?.balance || 0} signed currency="zł" /></p></div><div className="ops-page-actions"><Button variant="primary" onClick={() => go('payments')}>{t('client.profile.topup')}</Button><Button variant="secondary" onClick={() => go('consents')}>{t('runtime.client.consents.title')}</Button></div></div>
        <ChildButtons kid={kid} setKid={setKid} />
        <ToastNotice id="client-profile-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>{t('client.profile.saving')}</BusyBanner>
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="ops-profile-form-grid">
            <Input id={PROFILE_FIELD_IDS.firstName} label={t('client.profile.firstName')} value={form.firstName} error={fieldErrors.firstName} onChange={(event) => update('firstName', event.target.value)} />
            <Input id={PROFILE_FIELD_IDS.lastName} label={t('client.profile.lastName')} value={form.lastName} error={fieldErrors.lastName} onChange={(event) => update('lastName', event.target.value)} />
            <Input id={PROFILE_FIELD_IDS.email} label="Email" value={form.email} error={fieldErrors.email} onChange={(event) => update('email', event.target.value)} />
            <Input id={PROFILE_FIELD_IDS.phone} label={t('client.profile.phone')} value={form.phone} error={fieldErrors.phone} onChange={(event) => update('phone', event.target.value)} />
            <div><span className="muted">Telegram</span><strong style={{ display: 'block' }}>{account.telegram?.connected ? t('client.profile.connected') : t('client.profile.disconnected')}</strong>{account.telegram?.connected && <Button size="sm" variant="secondary" onClick={disconnectTelegram}>{t('client.profile.disconnect')}</Button>}</div>
            <Select id={PROFILE_FIELD_IDS.language} label={t('client.profile.notificationLanguage')} value={form.language} error={fieldErrors.language} hint={t('client.profile.notificationHint')} onChange={(event) => update('language', event.target.value)}><option value="ru">{t('client.profile.russian')}</option><option value="pl">Polski</option><option value="en">English</option></Select>
          </div>
        </div>
        <Table rows={participants} emptyLabel={t('client.profile.participantsEmpty')} columns={[
          { key: 'full_name', header: t('shared.participant'), render: (row) => <button type="button" className="ops-link-button" onClick={() => { const child = (parentData.children || []).find((item) => item.studentId === row.id); if (child) setKid(child.id) }}><Avatar name={row.full_name} size={28} /><span className="strong">{row.full_name}</span></button> },
          { key: 'birth_date', header: t('client.profile.birthDate'), muted: true, render: (row) => row.birth_date || '-' },
          { key: 'email', header: 'Email', muted: true, render: (row) => row.email || '-' },
          { key: 'group', header: t('shared.group'), render: (row) => row.group?.name || t('shared.individually') },
          { key: 'status', header: t('shared.status'), render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
        ]} />
        <div className="ops-profile-save-row"><Button variant="primary" loading={busy} disabled={busy} onClick={saveProfile}>{t('client.profile.save')}</Button></div>
      </div>
    )
  }

  // Sentinel for the busy flag: it holds a consent type, or this while all
  // consents are being granted in sequence.
  const ALL_CONSENTS = '__all__'

  function Consents() {
    const { t } = useLocale()
    const rows = parentData.consents || []
    const [localRows, setLocalRows] = useState(rows)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busyType, setBusyType] = useState(null)
    const descriptions = {
      data: t('client.consent.dataDesc'),
      email: t('client.consent.emailDesc'),
      sms: t('client.consent.smsDesc'),
      telegram: t('client.consent.telegramDesc'),
    }

    useEffect(() => {
      setLocalRows(rows)
    }, [rows])

    const pending = localRows.filter((row) => !row.is_active)

    async function saveConsent(row, granted) {
      const saved = await api.post('/api/client/consents/', {
        type: row.type,
        granted,
        policy_version: row.policy_version || 'v1',
      })
      setLocalRows((current) => current.map((item) => item.type === row.type ? saved : item))
    }

    async function setConsent(row, granted) {
      setBusyType(row.type)
      try {
        await saveConsent(row, granted)
        setMessage(t('client.consent.saved'))
        setError(null)
        reloadRoleData?.('client')
      } catch (err) {
        setError(apiErrorMessage(err, t('client.consent.saveFailed')))
      } finally {
        setBusyType(null)
      }
    }

    async function grantAll() {
      setBusyType(ALL_CONSENTS)
      try {
        const payload = await api.post('/api/client/consents/', {
          items: pending.map((row) => ({
            type: row.type,
            granted: true,
            policy_version: row.policy_version || 'v1',
          })),
        })
        const successful = payload.results
          .filter((result) => result.success)
          .map((result) => result.consent)
        setLocalRows((current) => current.map(
          (row) => successful.find((saved) => saved.type === row.type) || row))
        const failures = payload.results.filter((result) => !result.success)
        setMessage(t('client.consent.savedCount', undefined, { count: payload.summary.succeeded }))
        setError(failures.length
          ? failures.map((result) => `${result.type || `#${result.index + 1}`}: ${result.error}`).join('; ')
          : null)
        reloadRoleData?.('client')
      } catch (err) {
        setError(apiErrorMessage(err, t('client.consent.saveAllFailed')))
      } finally {
        setBusyType(null)
      }
    }

    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-head"><div><h1 className="page-title">{t('runtime.client.consents.title')}</h1><p className="page-desc">{t('client.consent.desc')}</p></div></div>
        <ToastNotice id="client-consent-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busyType != null}>
          {busyType === ALL_CONSENTS ? t('client.consent.savingAll') : t('client.consent.saving')}
        </BusyBanner>
        {pending.length > 1 && (
          <div className="ops-button-row" style={{ marginBottom: 12 }}>
            <Button variant="primary" loading={busyType === ALL_CONSENTS}
              disabled={busyType != null} onClick={grantAll}>
              {t('client.consent.confirmAll', undefined, { count: pending.length })}
            </Button>
          </div>
        )}
        <div className="card" style={{ overflow: 'hidden' }}>
          {localRows.map((row, index) => (
            <div key={row.type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: index < localRows.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ flex: 1 }}>
                <div className="strong">{row.type_label || row.type}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{descriptions[row.type] || t('client.consent.fallbackDesc')}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-2xs)', marginTop: 3 }}>{t('client.consent.versionLine', undefined, { version: row.policy_version || t('client.consent.notSpecified'), granted: row.granted_at ? formatDate(row.granted_at) : '-', revoked: row.revoked_at ? formatDate(row.revoked_at) : '-' })}</div>
              </div>
              <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" />
              <Button size="sm" loading={busyType === row.type} disabled={busyType != null} variant={row.is_active ? 'secondary' : 'primary'} onClick={() => setConsent(row, !row.is_active)}>
                {row.is_active ? t('client.consent.revoke') : t('client.consent.confirm')}
              </Button>
            </div>
          ))}
          {localRows.length === 0 && <div className="muted" style={{ padding: 16 }}>{t('client.consent.empty')}</div>}
        </div>
      </div>
    )
  }

  return { Home, Schedule, Payments, Subscription, History, Profile, Consents }
}
