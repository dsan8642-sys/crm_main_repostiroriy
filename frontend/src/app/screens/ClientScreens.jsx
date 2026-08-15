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
import { assertPaymentReadback, createPaymentAttemptKey, moneyMajorToMinor } from '../financialContracts.js'

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
    const [error, setError] = useState(null)
    if (!payment.receiptUrl) return <span className="muted">Нет файла</span>
    return <span><button type="button" className="ops-link-button" onClick={async () => { try { setError(null); await downloadFile(payment.receiptUrl, payment.receipt) } catch (err) { setError(err.status === 403 ? 'Нет доступа к документу.' : 'Документ больше недоступен.') } }}>{payment.receipt || 'Скачать подтверждение'}</button>{error && <small role="alert" className="muted">{error}</small>}</span>
  }

  function ChildButtons({ kid, setKid }) {
    const children = parentData.children || []
    const selected = children.find((child) => child.id === kid) || children[0]
    const [open, setOpen] = useState(false)
    if (!selected) return null
    return (
      <div className="ops-participant-context">
        <ContextRow value={selected.name} onChange={children.length > 1 ? () => setOpen((value) => !value) : null} changeLabel={open ? 'Скрыть' : 'Сменить'} />
        {open && <div className="ops-participant-options" role="group" aria-label="Выбор участника">
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
    const data = parentData
    const child = data.children?.find((item) => item.id === kid) || data.children?.[0]
    const next = child ? (data.schedule?.[child.id] || []).find((session) => session.status === 'planned') : null
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head">
          <div><h1 className="page-title">Главная</h1><p className="page-desc">Ближайшее занятие, абонемент и состояние оплаты.</p></div>
          <ChildButtons kid={child?.id || kid} setKid={setKid} />
        </div>
        {child?.balance < 0 && (
          <Banner tone="danger" title="Есть задолженность" style={{ marginBottom: 14 }} action={<Button size="sm" variant="subtle" onClick={() => go('payments')}>Перейти к платежам</Button>}>
            {child.name}: к оплате <strong>{Math.abs(child.balance).toLocaleString('ru-RU')} zl</strong>.
          </Banner>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <button type="button" className="card card-pad ops-action-card" onClick={() => go('schedule', { tab: next?.sessionId ? String(next.sessionId) : null })}>
            <div className="kpi-label"><span className="kpi-ico"><I.Calendar size={15} /></span>Следующее занятие</div>
            {next ? <><div className="strong" style={{ fontSize: 'var(--fs-lg)', margin: '4px 0 2px' }}>{next.date} · {next.start}</div><div className="muted">{next.group} · {next.trainer}</div></> : <div className="muted">Запланированных занятий нет.</div>}
          </button>
          <button type="button" className="card card-pad ops-action-card" onClick={() => go('subscription')}>
            <div className="kpi-label"><span className="kpi-ico"><I.Layers size={15} /></span>Абонемент</div>
            <div className="strong" style={{ fontSize: 'var(--fs-lg)', margin: '4px 0 2px' }}>{child?.sub || '-'}</div>
            <div className="muted">Осталось: {child?.subLeft == null ? '∞' : child.subLeft} · до {child?.subEnds || '-'}</div>
          </button>
          <button type="button" className="card card-pad ops-action-card" onClick={() => go('payments')}>
            <div className="kpi-label"><span className="kpi-ico"><I.Wallet size={15} /></span>Баланс</div>
            <Money amount={child?.balance || 0} signed size="var(--fs-lg)" />
          </button>
        </div>
      </div>
    )
  }

  function Schedule({ kid, setKid, initialTab }) {
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
      group: session.group?.name || 'Индивидуальное',
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
    }, [kid, parentData.schedule])
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
          if (active) setError(apiErrorMessage(err, 'Не удалось загрузить расписание.'))
        })
      return () => { active = false }
    }, [child?.studentId, range.dateFrom, range.dateTo])
    const selected = rows.find((row) => String(row.sessionId) === String(selectedId))
    return (
      <div className="page page-wide">
        <div className="page-head"><div><h1 className="page-title">Расписание</h1><p className="page-desc">Календарь занятий выбранного участника.</p></div><div className="ops-page-actions"><ChildButtons kid={kid} setKid={setKid} /><ScheduleViewSwitcher displayMode={displayMode} setDisplayMode={setDisplayMode} icons={I} /></div></div>
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <CalendarNavigation focusDate={focusDate} setFocusDate={setFocusDate} viewMode={viewMode} setViewMode={setViewMode} />
        </div>
        {selected && <div className="card ops-entity-card"><div className="ops-entity-head"><div><div className="eyebrow">Детали занятия</div><h3>{selected.group}</h3></div><Button size="sm" variant="subtle" onClick={() => setSelectedId(null)}>Закрыть</Button></div><div className="ops-summary-grid"><div><span>Дата и время</span><strong>{selected.date} · {selected.start}-{selected.end}</strong></div><div><span>Тренер</span><strong>{selected.trainer}</strong></div><div><span>Место</span><strong>{selected.location}</strong></div><div><span>Списание</span><strong>{selected.deductsExpected ? '-1 занятие' : '0 занятий'}</strong></div></div><StatusPill status={selected.status} /></div>}
        {displayMode === 'calendar' && <ScheduleCalendar sessions={rows} focusDate={focusDate} viewMode={viewMode} setFocusDate={setFocusDate} setViewMode={setViewMode} onOpenSession={(row) => setSelectedId(row.sessionId)} ariaLabel={`Календарь занятий: ${child?.name || 'участник'}`} />}
        {displayMode === 'list' && <ScheduleList sessions={rows} testId="client-schedule-list" onOpenSession={(row) => setSelectedId(row.sessionId)} renderStatus={(row) => <span><StatusPill status={row.status} size="sm" /><small>Списание: {row.deductsExpected ? '-1' : '0'}</small></span>} />}
      </div>
    )
  }

  function Payments({ kid, setKid, currentUser }) {
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

    async function createTopUpRequest() {
      let amountMinor = null
      amountMinor = moneyMajorToMinor(amount)
      if (!amountMinor) {
        const nextErrors = { amount: 'Введите положительную сумму, не более двух знаков после запятой.' }
        setFieldErrors(nextErrors)
        setError(null)
        focusFirstFieldError(nextErrors, TOP_UP_FIELD_IDS)
        return
      }
      if (!file) {
        const nextErrors = { file: 'Приложите подтверждение банковского перевода: PDF, JPG или PNG.' }
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
        setMessage('Запрос проверен сервером и находится на проверке. Баланс изменится только после подтверждения администратором.')
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
        setError(formErrorMessage(err, 'Не удалось отправить запрос на пополнение.'))
        focusFirstFieldError(nextErrors, TOP_UP_FIELD_IDS)
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><div><h1 className="page-title">Платежи</h1><p className="page-desc">Начисления, история операций и запросы на пополнение баланса.</p></div><ChildButtons kid={kid} setKid={setKid} /></div>
        <ToastNotice id="client-payment-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Отправляю запрос на пополнение...</BusyBanner>
        <div className="ops-client-finance-tabs" role="tablist" aria-label="Разделы платежей">
          {[['charges', 'Начисления'], ['history', 'История'], ['topup', 'Пополнить']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mobileTab === value} className={mobileTab === value ? 'is-active' : ''} onClick={() => setMobileTab(value)}>{label}</button>)}
        </div>
        <div className={`card card-pad ops-client-finance-section${mobileTab === 'topup' ? ' is-mobile-active' : ''}`} style={{ marginBottom: 16 }}>
          <div className="eyebrow">Запрос на пополнение</div>
          <div className="ops-inline-note" role="status">Участник: <strong>{child?.name || 'не выбран'}</strong> · текущий баланс: <Money amount={child?.balance || 0} signed /></div>
          <p className="muted" style={{ margin: '6px 0 14px' }}>Запрос не меняет баланс автоматически. Администратор проверит перевод, после чего сумма будет зачислена или запрос будет отклонён.</p>
          <div className="ops-top-up-form">
            <Input id={TOP_UP_FIELD_IDS.amount} label="Сумма пополнения, zł" inputMode="decimal" value={amount} error={fieldErrors.amount} onChange={(event) => { setAmount(event.target.value); setFieldErrors((current) => clearFieldError(current, 'amount')) }} placeholder="240,00" />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Файл подтверждения
              <input id={TOP_UP_FIELD_IDS.file} ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" aria-invalid={Boolean(fieldErrors.file)} aria-describedby={fieldErrors.file ? `${TOP_UP_FIELD_IDS.file}-error` : undefined} onChange={(event) => { setFile(event.target.files?.[0] || null); setFieldErrors((current) => clearFieldError(current, 'file')) }} />
              {fieldErrors.file && <small id={`${TOP_UP_FIELD_IDS.file}-error`} className="ops-field-error" role="alert">{fieldErrors.file}</small>}
            </label>
            <Button variant="primary" loading={busy} disabled={busy} iconLeft={<I.Upload size={15} />} onClick={createTopUpRequest}>Отправить запрос</Button>
          </div>
        </div>
        <div className={`ops-client-finance-section${mobileTab === 'charges' ? ' is-mobile-active' : ''}`}>
        <div className="ops-financial-context" aria-label="Сводка начислений">
          <div><span>Не оплачено</span><strong>{asMoneyMajor(chargeList.payload?.summary?.unpaid_minor || 0).toFixed(2).replace('.', ',')} zł</strong></div>
          <div><span>Просрочено</span><strong>{chargeList.payload?.summary?.overdue_count || 0}</strong></div>
        </div>
        <ListToolbar list={chargeList} searchLabel="Поиск начислений" searchPlaceholder="Описание начисления">
          <label>Статус<select value={chargeList.draftFilters.status} onChange={(event) => chargeList.setDraftFilter('status', event.target.value)}><option value="">Все</option><option value="overdue">Просроченные</option><option value="upcoming">Предстоящие</option></select></label>
        </ListToolbar>
        <ListFeedback list={chargeList} emptyLabel="Начислений нет" />
        <Table rows={charges} emptyLabel="Начислений нет" columns={[
          { key: 'desc', header: 'Начисление' },
          { key: 'child', header: 'Участник', muted: true },
          { key: 'due', header: 'Срок', muted: true },
          { key: 'amount', header: 'Сумма', align: 'right', render: (row) => <Money amount={-Math.abs(row.amount)} signed /> },
          { key: 'status', header: 'Статус', render: (row) => <StatusPill status={row.status} size="sm" /> },
        ]} />
        <ListPagination list={chargeList} />
        </div>
        <div style={{ height: 16 }} />
        <div className={`ops-client-finance-section${mobileTab === 'history' ? ' is-mobile-active' : ''}`}>
        <ListToolbar list={paymentList} searchLabel="Поиск платежей" searchPlaceholder="Комментарий к операции">
          <label>Статус<select value={paymentList.draftFilters.status} onChange={(event) => paymentList.setDraftFilter('status', event.target.value)}><option value="">Все</option><option value="pending">На проверке</option><option value="confirmed">Подтверждённые</option><option value="rejected">Отклонённые</option></select></label>
          <label>Способ<select value={paymentList.draftFilters.method} onChange={(event) => paymentList.setDraftFilter('method', event.target.value)}><option value="">Все</option><option value="cash">Наличные</option><option value="bank_transfer">Банковский перевод</option><option value="card">Карта</option><option value="other">Другое</option></select></label>
        </ListToolbar>
        <ListFeedback list={paymentList} emptyLabel="Платежей нет" />
        <Table rows={payments} emptyLabel="Платежей нет" columns={[
          { key: 'sourceLabel', header: 'Операция' },
          { key: 'child', header: 'Участник' },
          { key: 'date', header: 'Дата', muted: true },
          { key: 'method', header: 'Способ', muted: true },
          { key: 'amount', header: 'Сумма', align: 'right', render: (row) => <Money amount={Math.abs(row.amount)} signed /> },
          { key: 'status', header: 'Статус', render: (row) => <StatusPill status={row.status} size="sm" /> },
          { key: 'effect', header: 'Баланс', muted: true, render: (row) => row.affectsBalance ? 'Зачислено' : 'Не влияет' },
          { key: 'receipt', header: 'Документ', render: (row) => <ReceiptAction payment={row} /> },
        ]} />
        <ListPagination list={paymentList} />
        </div>
      </div>
    )
  }

  function Subscription({ kid, setKid }) {
    const child = (parentData.children || []).find((item) => item.id === kid)
    const subscription = child?.subscription
    return <div className="page" style={{ maxWidth: 900 }}><div className="page-head"><div><h1 className="page-title">Абонемент</h1><p className="page-desc">Срок действия, статус и остаток занятий.</p></div><ChildButtons kid={child?.id || kid} setKid={setKid} /></div>{subscription ? <div className="card ops-entity-card"><div className="ops-entity-head"><div><div className="eyebrow">Текущий абонемент</div><h3>{subscription.type}</h3></div><StatusPill status={subscription.status} /></div><div className="ops-summary-grid"><div><span>Осталось занятий</span><strong>{subscription.remaining_sessions == null ? 'Без лимита' : subscription.remaining_sessions}</strong></div><div><span>Начало</span><strong>{formatDate(subscription.start_date)}</strong></div><div><span>Действует до</span><strong>{formatDate(subscription.effective_end_date)}</strong></div><div><span>Статус</span><strong>{subscription.status}</strong></div></div></div> : <div className="card card-pad empty">Активного абонемента нет. Обратитесь к администратору клуба.</div>}</div>
  }

  function History({ kid, setKid, currentUser }) {
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
        <div className="page-head"><div><h1 className="page-title">История</h1><p className="page-desc">Посещения выбранного участника. Раздел сообщений временно недоступен.</p></div><ChildButtons kid={kid} setKid={setKid} /></div>
        <div className="ops-tabs" role="tablist" aria-label="Разделы истории">
          <button type="button" role="tab" aria-selected={historyTab === 'attendance'} className={historyTab === 'attendance' ? 'is-active' : ''} onClick={() => setHistoryTab('attendance')}>Посещения</button>
          <button type="button" role="tab" aria-selected="false" aria-disabled="true" disabled title="Не определён authoritative source сообщений">Сообщения · недоступно</button>
        </div>
        {historyTab === 'attendance' && <ListToolbar list={attendanceList} searchLabel="Поиск посещений" searchPlaceholder="Группа, тренер или локация">
          <label>Период<select value={attendanceList.draftFilters.period} onChange={(event) => attendanceList.setDraftFilter('period', event.target.value)}><option value="30">30 дней</option><option value="90">90 дней</option><option value="365">Год</option><option value="">Всё время</option></select></label>
          <label>Статус<select value={attendanceList.draftFilters.status} onChange={(event) => attendanceList.setDraftFilter('status', event.target.value)}><option value="">Все</option><option value="present">Был</option><option value="absent">Не был</option><option value="excused">Уважительная причина</option><option value="rescheduled">Перенос</option></select></label>
        </ListToolbar>}
        {selectedHistory && <div className="card card-pad" style={{ marginBottom: 14 }}><div className="ops-section-head"><div><div className="eyebrow">Детали операции</div><strong>{selectedHistory.label || selectedHistory.method}</strong></div><Button size="sm" variant="subtle" onClick={() => setSelectedHistory(null)}>Закрыть</Button></div><div className="muted">Дата: {selectedHistory.date} · сумма/списание и статус сохранены в истории.</div></div>}
        {historyTab === 'attendance' && <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Посещения</div>
            <ListFeedback list={attendanceList} emptyLabel="Посещений пока нет" />
            <Table rows={visibleAttendance} emptyLabel="Посещений пока нет" columns={[
              { key: 'date', header: 'Дата', muted: true },
              { key: 'label', header: 'Занятие', render: (row) => <button type="button" className="ops-link-button" onClick={() => setSelectedHistory(row)}><span className="strong">{row.label}</span></button> },
              { key: 'trainer', header: 'Тренер', muted: true },
              { key: 'status', header: 'Статус', render: (row) => <StatusPill status={row.status === 'rescheduled' ? 'moved' : row.status} size="sm" /> },
            ]} />
            <ListPagination list={attendanceList} />
        </div>}
      </div>
    )
  }

  function Profile({ kid, setKid, go }) {
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
        setMessage('Профиль сохранён.')
        setError(null)
        reloadRoleData?.('client', { studentId: (parentData.children || []).find((item) => item.id === kid)?.studentId })
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, PROFILE_FIELD_MAP)
        setFieldErrors(nextErrors)
        setError(formErrorMessage(err, 'Не удалось сохранить профиль.'))
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
        setError(apiErrorMessage(err, 'Не удалось отключить Telegram.'))
      }
    }

    return (
      <div className="page page-wide">
        <div className="page-head"><div><h1 className="page-title">{account.full_name || 'Профиль'}</h1><p className="page-desc">Текущий баланс: <Money amount={selectedChild?.balance || 0} signed currency="zł" /></p></div><div className="ops-page-actions"><Button variant="primary" onClick={() => go('payments')}>Пополнить баланс</Button><Button variant="secondary" onClick={() => go('consents')}>Согласия</Button></div></div>
        <ChildButtons kid={kid} setKid={setKid} />
        <ToastNotice id="client-profile-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Сохраняю профиль...</BusyBanner>
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="ops-profile-form-grid">
            <Input id={PROFILE_FIELD_IDS.firstName} label="Имя" value={form.firstName} error={fieldErrors.firstName} onChange={(event) => update('firstName', event.target.value)} />
            <Input id={PROFILE_FIELD_IDS.lastName} label="Фамилия" value={form.lastName} error={fieldErrors.lastName} onChange={(event) => update('lastName', event.target.value)} />
            <Input id={PROFILE_FIELD_IDS.email} label="Email" value={form.email} error={fieldErrors.email} onChange={(event) => update('email', event.target.value)} />
            <Input id={PROFILE_FIELD_IDS.phone} label="Телефон" value={form.phone} error={fieldErrors.phone} onChange={(event) => update('phone', event.target.value)} />
            <div><span className="muted">Telegram</span><strong style={{ display: 'block' }}>{account.telegram?.connected ? 'Подключён' : 'Не подключён'}</strong>{account.telegram?.connected && <Button size="sm" variant="secondary" onClick={disconnectTelegram}>Отключить</Button>}</div>
            <Select id={PROFILE_FIELD_IDS.language} label="Язык интерфейса" value={form.language} error={fieldErrors.language} hint="Язык доставки указан в истории сообщений." onChange={(event) => update('language', event.target.value)}><option value="ru">Русский</option><option value="pl">Polski</option><option value="en">English</option></Select>
          </div>
        </div>
        <Table rows={participants} emptyLabel="Участников нет" columns={[
          { key: 'full_name', header: 'Участник', render: (row) => <button type="button" className="ops-link-button" onClick={() => { const child = (parentData.children || []).find((item) => item.studentId === row.id); if (child) setKid(child.id) }}><Avatar name={row.full_name} size={28} /><span className="strong">{row.full_name}</span></button> },
          { key: 'birth_date', header: 'Дата рождения', muted: true, render: (row) => row.birth_date || '-' },
          { key: 'email', header: 'Email', muted: true, render: (row) => row.email || '-' },
          { key: 'group', header: 'Группа', render: (row) => row.group?.name || 'Индивидуально' },
          { key: 'status', header: 'Статус', render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
        ]} />
        <div className="ops-profile-save-row"><Button variant="primary" loading={busy} disabled={busy} onClick={saveProfile}>Сохранить профиль</Button></div>
      </div>
    )
  }

  // Sentinel for the busy flag: it holds a consent type, or this while all
  // consents are being granted in sequence.
  const ALL_CONSENTS = '__all__'

  function Consents() {
    const rows = parentData.consents || []
    const [localRows, setLocalRows] = useState(rows)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busyType, setBusyType] = useState(null)
    const descriptions = {
      data: 'Разрешает хранить и обрабатывать данные, необходимые для оказания услуг клуба.',
      email: 'Разрешает получать сервисные и информационные сообщения по email.',
      sms: 'Разрешает получать уведомления и напоминания по SMS.',
      telegram: 'Разрешает получать уведомления в Telegram.',
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
        setMessage('Согласие сохранено.')
        setError(null)
        reloadRoleData?.('client')
      } catch (err) {
        setError(apiErrorMessage(err, 'Не удалось сохранить согласие.'))
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
        setMessage(`Сохранено согласий: ${payload.summary.succeeded}.`)
        setError(failures.length
          ? failures.map((result) => `${result.type || `#${result.index + 1}`}: ${result.error}`).join('; ')
          : null)
        reloadRoleData?.('client', { studentId: child?.studentId })
      } catch (err) {
        setError(apiErrorMessage(err, 'Не удалось сохранить согласия.'))
      } finally {
        setBusyType(null)
      }
    }

    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-head"><div><h1 className="page-title">Согласия</h1><p className="page-desc">Управление согласиями и каналами связи.</p></div></div>
        <ToastNotice id="client-consent-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busyType != null}>
          {busyType === ALL_CONSENTS ? 'Сохраняю согласия...' : 'Сохраняю согласие...'}
        </BusyBanner>
        {pending.length > 1 && (
          <div className="ops-button-row" style={{ marginBottom: 12 }}>
            <Button variant="primary" loading={busyType === ALL_CONSENTS}
              disabled={busyType != null} onClick={grantAll}>
              Подтвердить все ({pending.length})
            </Button>
          </div>
        )}
        <div className="card" style={{ overflow: 'hidden' }}>
          {localRows.map((row, index) => (
            <div key={row.type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: index < localRows.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ flex: 1 }}>
                <div className="strong">{row.type_label || row.type}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{descriptions[row.type] || 'Управление согласием на выбранный канал связи.'}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-2xs)', marginTop: 3 }}>Версия: {row.policy_version || 'не указана'} · выдано: {row.granted_at ? formatDate(row.granted_at) : '-'} · отозвано: {row.revoked_at ? formatDate(row.revoked_at) : '-'}</div>
              </div>
              <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" />
              <Button size="sm" loading={busyType === row.type} disabled={busyType != null} variant={row.is_active ? 'secondary' : 'primary'} onClick={() => setConsent(row, !row.is_active)}>
                {row.is_active ? 'Отозвать' : 'Подтвердить'}
              </Button>
            </div>
          ))}
          {localRows.length === 0 && <div className="muted" style={{ padding: 16 }}>Согласия пока не настроены.</div>}
        </div>
      </div>
    )
  }

  return { Home, Schedule, Payments, Subscription, History, Profile, Consents }
}
