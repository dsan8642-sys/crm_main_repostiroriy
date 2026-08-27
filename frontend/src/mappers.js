import { normalizeScheduleColorKey } from './app/schedulePalette.js'
import { dateToIso } from './app/scheduleContracts.js'
import { participantKey, paymentMethodLabel as contractPaymentMethodLabel } from './contracts.js'
import { normalizeUiLocale, uiLocaleTag } from './localeContracts.js'

const MAPPER_LABELS = Object.freeze({
  individual: { ru: 'Индивидуально', uk: 'Індивідуально', pl: 'Indywidualnie', en: 'Individual' },
  individualLesson: { ru: 'Индивидуальное', uk: 'Індивідуальне', pl: 'Indywidualne', en: 'Individual' },
  noSubscription: { ru: 'Нет абонемента', uk: 'Немає абонемента', pl: 'Brak karnetu', en: 'No subscription' },
  client: { ru: 'Клиент', uk: 'Клієнт', pl: 'Klient', en: 'Client' },
  clientAccount: { ru: 'Аккаунт клиента', uk: 'Обліковий запис клієнта', pl: 'Konto klienta', en: 'Client account' },
  session: { ru: 'Занятие', uk: 'Заняття', pl: 'Zajęcia', en: 'Session' },
  topUpRequest: { ru: 'Запрос на пополнение', uk: 'Запит на поповнення', pl: 'Prośba o doładowanie', en: 'Top-up request' },
  adminPayment: { ru: 'Платёж администратора', uk: 'Платіж адміністратора', pl: 'Płatność administratora', en: 'Administrator payment' },
})

function currentUiLocale() {
  return normalizeUiLocale(globalThis.document?.documentElement?.lang)
}

function mapperLabel(key, locale = currentUiLocale()) {
  const normalized = normalizeUiLocale(locale)
  return MAPPER_LABELS[key]?.[normalized] || MAPPER_LABELS[key]?.ru || key
}

export function asMoneyMajor(minor) {
  return Math.round((Number(minor || 0) / 100) * 100) / 100
}

// The backend stores debt as charges minus payments. In the UI, a positive
// account balance means credit, while a negative balance means money owed.
export function asAccountBalance(minor) {
  return -asMoneyMajor(minor)
}

export function formatDate(iso, locale = uiLocaleTag(currentUiLocale())) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

export function formatShortDate(iso, locale = uiLocaleTag(currentUiLocale())) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(iso))
}

export function formatTime(iso, locale = uiLocaleTag(currentUiLocale())) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function paymentMethodLabel(method, locale = currentUiLocale()) {
  return contractPaymentMethodLabel(method, normalizeUiLocale(locale))
}

export function paymentSourceLabel(source, locale = currentUiLocale()) {
  return source === 'client_top_up' ? mapperLabel('topUpRequest', locale) : mapperLabel('adminPayment', locale)
}

function statusFromPayment(status) {
  if (status === 'confirmed') return 'paid'
  if (status === 'rejected') return 'rejected'
  return 'pending'
}

function sessionStatus(session) {
  if (session.is_cancelled) return 'cancelled'
  if (new Date(session.end_at) < new Date()) return 'done'
  return 'planned'
}

export function mapClientPortalData({ overview, profile, consents, schedule, attendance, payments, notifications, resourceStates, resolvedStudentId: requestedStudentId }) {
  const account = overview.account || {}
  const participants = overview.participants || overview.students || []
  const profileSubscriptions = profile?.subscriptions || []
  const children = participants.length
    ? participants.map((student) => ({
        id: `s${student.id}`,
        studentId: student.id,
        name: student.full_name,
        group: student.group?.name || mapperLabel('individual'),
      trainer: student.next_session?.trainer || '',
      born: student.birth_date || '-',
      email: student.email || '',
      groupId: student.group?.id || '',
      sub: student.current_subscription?.type || mapperLabel('noSubscription'),
        subLeft: student.current_subscription?.remaining_sessions ?? null,
        subEnds: student.current_subscription?.effective_end_date || '-',
        subscription: profileSubscriptions.find((subscription) => subscription.participant_id === student.id) || student.current_subscription || null,
        balance: asAccountBalance(student.balance_minor),
      }))
    : [{
        id: 'account',
        studentId: null,
        name: account.full_name || account.username || mapperLabel('client'),
        group: mapperLabel('individual'),
        trainer: '',
        born: '-',
        sub: mapperLabel('noSubscription'),
        subLeft: null,
        subEnds: '-',
        balance: 0,
      }]

  const sessions = schedule.sessions || []
  const resolvedStudentId = schedule.student_id || attendance.student_id || payments.student_id || requestedStudentId
  const byChild = Object.fromEntries(children.map((child) => [
    child.id,
    child.studentId === resolvedStudentId ? sessions
      .map((session) => ({
        id: String(session.id),
        sessionId: session.id,
        date: formatShortDate(session.start_at),
        rawDate: session.start_at?.slice(0, 10) || '',
        startAt: session.start_at,
        endAt: session.end_at,
        start: formatTime(session.start_at),
        end: formatTime(session.end_at),
        group: session.group?.name || mapperLabel('individualLesson'),
        trainer: session.trainer,
        location: session.location,
        count: session.participants_count || 0,
        limit: session.max_participants || 0,
        status: sessionStatus(session),
        sessionType: session.session_type || 'group',
        sessionTypeLabel: session.presentation_type_label || '',
        colorKey: normalizeScheduleColorKey(session.presentation_color_key),
        individualParticipant: session.individual_participant || null,
        deductsExpected: session.is_cancelled ? 0 : 1,
      })) : [],
  ]))

  const attendanceByChild = Object.fromEntries(children.map((child) => [
    child.id,
    child.studentId === resolvedStudentId ? (attendance.attendance || [])
      .filter((record) => record.student?.id === child.studentId)
      .map((record) => ({
        id: String(record.id),
        sessionId: record.session?.id,
        date: record.session?.start_at?.slice(0, 10),
        label: `${record.session?.group?.name || mapperLabel('individualLesson')} · ${formatTime(record.session?.start_at)}`,
      status: record.status,
        deducts: record.deducts,
        comment: record.comment || '',
        group: record.session?.group?.name || mapperLabel('individualLesson'),
        trainer: record.session?.trainer || '',
      })) : [],
  ]))

  return {
    account: profile?.account || account,
    profileParticipants: profile?.participants || participants,
    consents: consents?.consents || [],
    children,
    schedule: byChild,
    attendance: attendanceByChild,
    ledger: Object.fromEntries(children.map((child) => [child.id, []])),
    charges: (payments.charges || []).map((charge) => ({
      id: charge.id,
      child: charge.student,
      desc: charge.description,
      due: charge.due_date,
      amount: asMoneyMajor(charge.amount_minor),
      status: new Date(charge.due_date) < new Date() ? 'overdue' : 'awaiting',
      studentId: charge.student_id,
    })),
    payments: (payments.payments || []).map((payment) => ({
      id: payment.id,
      child: payment.student,
      date: payment.paid_at,
      amount: asMoneyMajor(payment.amount_minor),
      status: statusFromPayment(payment.status),
      method: paymentMethodLabel(payment.method),
      source: payment.source,
      sourceLabel: paymentSourceLabel(payment.source),
      affectsBalance: Boolean(payment.affects_balance),
      events: payment.events || [],
      comment: payment.comment || '',
      receipt: payment.receipt?.original_name || '',
      receiptUrl: payment.receipt?.download_url || null,
      studentId: payment.student_id,
    })),
    notifications: notifications?.notifications || [],
    resourceStates: resourceStates || {},
  }
}

export function mapTrainerSession(session) {
  return {
    id: String(session.id),
    sessionId: session.id,
    date: formatShortDate(session.start_at),
    rawDate: session.start_at?.slice(0, 10) || '',
    startAt: session.start_at,
    endAt: session.end_at,
    start: formatTime(session.start_at),
    end: formatTime(session.end_at),
    groupId: session.group?.id || '',
    group: session.group?.name || mapperLabel('individualLesson'),
    location: session.location,
    count: session.participants_count || 0,
    limit: session.max_participants || 0,
    status: sessionStatus(session),
    sessionType: session.session_type || 'group',
    sessionTypeLabel: session.presentation_type_label || '',
    colorKey: normalizeScheduleColorKey(session.presentation_color_key),
    individualParticipant: session.individual_participant || null,
    trainer: session.effective_trainer || session.trainer,
  }
}

export function mapTrainerPortalData({ sessions, groups, history, detail }) {
  const sessionRows = (sessions.sessions || []).map(mapTrainerSession)

  const detailSession = detail?.session || sessions.sessions?.[0]
  return {
    sessions: sessionRows,
    activeSessionId: detailSession?.id || sessionRows[0]?.sessionId || null,
    activeSessionTitle: detailSession
      ? `${detailSession.group?.name || mapperLabel('individualLesson')} · ${formatTime(detailSession.start_at)}-${formatTime(detailSession.end_at)}`
      : mapperLabel('session'),
    activeSessionDate: detailSession ? formatShortDate(detailSession.start_at) : '',
    activeSessionStatus: detailSession ? sessionStatus(detailSession) : null,
    activeSessionCancelled: Boolean(detailSession?.is_cancelled),
    roster: (detail?.students || []).map((student) => ({
      id: String(student.id),
      studentId: student.id,
      name: student.full_name,
      emergency: student.emergency_contact_name || student.client_phone || '',
      med: '',
      status: student.attendance?.status || null,
    })),
    history: (history?.sessions || []).map(mapTrainerSession),
    groups: (groups?.groups || []).map((group) => ({
      id: `g${group.id}`,
      groupId: group.id,
      name: group.name,
      description: group.description || '',
      students: group.students_count || 0,
      roster: group.students || [],
      active: group.is_active,
      next: group.next_session ? `${formatShortDate(group.next_session.start_at)} ${formatTime(group.next_session.start_at)}` : '',
    })),
  }
}

function mapAdminParticipantRow(client) {
  const groups = client.groups || (client.group ? [client.group] : [])
  return {
    id: participantKey(client.client_id, client.id),
    clientId: client.client_id,
    studentId: client.id,
    first: client.first_name,
    last: client.last_name,
    born: client.birth_date || '-',
    parent: client.is_account_holder ? client.full_name : mapperLabel('clientAccount'),
    clientName: client.client_name || (client.is_account_holder ? client.full_name : mapperLabel('clientAccount')),
    isAccountHolder: Boolean(client.is_account_holder),
    phone: client.client_phone || '',
    email: client.email || '',
    groups,
    groupIds: groups.map((group) => group.id),
    groupId: groups.length === 1 ? groups[0].id : '',
    group: groups.map((group) => group.name).join(', ') || mapperLabel('individual'),
    trainer: '',
    isActive: client.is_active,
    accountActive: client.client_is_active !== false,
    balance: asAccountBalance(client.balance_minor),
    balanceMinor: client.balance_minor || 0,
    currency: client.currency || 'PLN',
    hasCurrentSubscription: Boolean(client.has_current_subscription),
    currentSubscriptionRemaining: client.current_subscription_remaining,
    currentSubscriptionTotal: client.current_subscription_total,
    currentSubscriptionIsUnlimited: Boolean(client.current_subscription_is_unlimited),
    isRecentlyActive: Boolean(client.is_recently_active),
    lastPresentAt: client.last_present_at || null,
    sub: '',
    subLeft: null,
    subEnds: '-',
    med: '',
    emergency: [client.emergency_contact_name, client.emergency_contact_phone].filter(Boolean).join(' · '),
  }
}

export function mapAdminPortalData({ reference, clients, trainers, groups, subscriptionTypes, sessionTypeConfigs, sessions, payments, debtors }) {
  const groupRows = groups.groups || []
  const clientRows = (clients.clients || []).map(mapAdminParticipantRow)
  const blacklistedByAccount = new Map()
  clientRows.filter((row) => !row.accountActive).forEach((row) => {
    const current = blacklistedByAccount.get(row.clientId)
    if (!current || (row.isAccountHolder && !current.isAccountHolder)) {
      blacklistedByAccount.set(row.clientId, {
        ...row,
        blacklistSearchText: current?.blacklistSearchText || '',
      })
    }
    const representative = blacklistedByAccount.get(row.clientId)
    representative.blacklistSearchText += ` ${row.first} ${row.last} ${row.phone} ${row.email} ${row.group}`
  })
  return {
    sessionTypeConfigs: sessionTypeConfigs?.session_types || [],
    locations: (reference?.locations || []).filter((location) => location.is_active !== false),
    trainers: (trainers.trainers || []).map((trainer) => ({
      id: `t${trainer.id}`,
      trainerId: trainer.id,
      username: trainer.username,
      name: trainer.full_name,
      email: trainer.email || '',
      phone: trainer.phone,
      active: trainer.is_active,
      accessActivated: trainer.access_activated,
      portalAccess: trainer.portal_access,
      groups: trainer.groups_count,
    })),
    groups: groupRows.map((group) => ({
      id: `g${group.id}`,
      groupId: group.id,
      name: group.name,
      description: group.description || '',
      defaultTrainerId: group.default_trainer?.id || '',
      trainer: group.default_trainer?.name || '-',
      defaultLocationId: group.default_location?.id || '',
      defaultLocation: group.default_location?.name || '',
      defaultLocationActive: Boolean(group.default_location && group.default_location.is_active !== false),
      students: group.participants_count,
      // null price = the group is never billed per visit
      price: group.price_minor == null ? null : asMoneyMajor(group.price_minor),
      priceMinor: group.price_minor,
      currency: group.currency,
      defaultCapacity: group.default_capacity ?? null,
      colorKey: normalizeScheduleColorKey(group.color_key),
      active: group.is_active,
      nextSessionAt: group.next_session?.start_at || null,
      nextSessionLocation: group.next_session?.location || '',
    })),
    subscriptionTypes: (subscriptionTypes?.subscription_types || []).map((type) => ({
      id: `st${type.id}`,
      typeId: type.id,
      name: type.name,
      price: asMoneyMajor(type.price_minor),
      priceMinor: type.price_minor,
      currency: type.currency,
      sessions: type.sessions_count,
      days: type.duration_days,
      isUnlimited: type.is_unlimited,
      isIndividual: type.is_individual,
      active: type.is_active,
    })),
    clients: clientRows.filter((row) => row.accountActive && row.isActive),
    blacklistedClients: Array.from(blacklistedByAccount.values()),
    sessions: (sessions.sessions || []).map((session) => ({
      id: `s${session.id}`,
      sessionId: session.id,
      date: formatShortDate(session.start_at),
      startAt: session.start_at,
      endAt: session.end_at,
      groupId: session.group?.id || '',
      trainerId: session.trainer_id || '',
      notes: session.notes || '',
      sessionType: session.session_type || 'group',
      sessionTypeLabel: session.presentation_type_label || '',
      colorKey: normalizeScheduleColorKey(session.presentation_color_key),
      isCancelled: session.is_cancelled,
      start: formatTime(session.start_at),
      end: formatTime(session.end_at),
      durationMinutes: session.duration_minutes || 60,
      priceMinor: session.price_minor,
      currency: session.currency,
      group: session.group?.name || mapperLabel('individualLesson'),
      trainer: session.trainer,
      location: session.location,
      count: session.participants_count || 0,
      limit: session.max_participants || 0,
      status: sessionStatus(session),
      individualParticipant: session.individual_participant || null,
      roster: session.roster || [],
      secondStudentId: Object.prototype.hasOwnProperty.call(session, 'second_student_id')
        ? session.second_student_id || ''
        : session.roster?.[1]?.id || '',
    })),
    roster: [],
    payments: (payments.payments || []).map((payment) => ({
      id: String(payment.id),
      paymentId: payment.id,
      studentId: payment.participant_id,
      clientId: payment.client_id || (clients.clients || []).find((client) => client.id === payment.participant_id)?.client_id,
      client: payment.client || payment.participant,
      child: payment.participant,
      parent: '',
      amount: asMoneyMajor(payment.amount_minor),
      method: paymentMethodLabel(payment.method),
      methodCode: payment.method,
      source: payment.source,
      sourceLabel: paymentSourceLabel(payment.source),
      affectsBalance: Boolean(payment.affects_balance),
      events: payment.events || [],
      balanceMinor: payment.balance_minor,
      auditEvent: payment.audit_event || null,
      date: payment.paid_at,
      status: statusFromPayment(payment.status),
      comment: payment.comment || '',
      receipt: payment.receipt?.original_name || null,
      receiptUrl: payment.receipt?.download_url || null,
    })),
    debtors: (debtors.debtors || []).map((row) => ({
      id: `d${row.student.id}`,
      studentId: row.student.id,
      clientId: row.student.client_id,
      child: row.student.full_name,
      parent: row.student.client_phone || '',
      group: row.student.group?.name || mapperLabel('individual'),
      groupId: row.student.group?.id || '',
      trainer: '',
      reason: row.reasons.join(', '),
      balance: asAccountBalance(row.balance_minor),
      balanceMinor: row.balance_minor,
      daysOverdue: row.days_overdue || 0,
      dueDate: row.oldest_due_date || '-',
      last: row.last_payment_at || '-',
    })),
  }
}

function emptyAdminListPayload(overrides = {}) {
  return {
    reference: {},
    clients: {},
    trainers: {},
    groups: {},
    subscriptionTypes: {},
    sessionTypeConfigs: {},
    sessions: {},
    payments: {},
    debtors: {},
    ...overrides,
  }
}

export function mapAdminClientRows(rows) {
  const mapped = mapAdminPortalData(emptyAdminListPayload({ clients: { clients: rows } }))
  return { active: mapped.clients, blacklisted: mapped.blacklistedClients }
}

export function mapAdminParticipantRows(rows) {
  return rows.map(mapAdminParticipantRow)
}

export function mapAdminTrainerRows(rows) {
  return mapAdminPortalData(emptyAdminListPayload({ trainers: { trainers: rows } })).trainers
}

export function mapAdminGroupRows(rows) {
  return mapAdminPortalData(emptyAdminListPayload({ groups: { groups: rows } })).groups
}

export function mapAdminPaymentRows(rows) {
  return mapAdminPortalData(emptyAdminListPayload({ payments: { payments: rows } })).payments
}

export function mapAdminDebtorRows(rows) {
  return mapAdminPortalData(emptyAdminListPayload({ debtors: { debtors: rows } })).debtors
}

export function mapAdminSessionRows(rows) {
  return mapAdminPortalData(emptyAdminListPayload({ sessions: { sessions: rows } })).sessions
}

export function mapTrainerHistoryRows(rows) {
  return rows.map(mapTrainerSession)
}

export function mapClientAttendanceRows(rows) {
  return rows.map((record) => ({
    id: String(record.id),
    sessionId: record.session?.id,
    date: record.session?.start_at?.slice(0, 10),
    label: `${record.session?.group?.name || mapperLabel('individualLesson')} · ${formatTime(record.session?.start_at)}`,
    status: record.status,
    deducts: record.deducts,
    comment: record.comment || '',
    group: record.session?.group?.name || mapperLabel('individualLesson'),
    trainer: record.session?.trainer || '',
  }))
}

export function mapClientChargeRows(rows) {
  return rows.map((charge) => ({
    id: charge.id,
    child: charge.student,
    desc: charge.description,
    due: charge.due_date,
    amount: asMoneyMajor(charge.outstanding_minor ?? charge.amount_minor),
    originalAmount: asMoneyMajor(charge.amount_minor),
    paidAmount: asMoneyMajor(charge.paid_minor),
    status: charge.status === 'paid' ? 'paid' : charge.status === 'overdue' ? 'overdue' : 'awaiting',
    studentId: charge.student_id,
  }))
}

export function mapClientPaymentRows(rows) {
  return rows.map((payment) => ({
    id: payment.id,
    child: payment.student,
    date: payment.paid_at,
    amount: asMoneyMajor(payment.amount_minor),
    status: statusFromPayment(payment.status),
    method: paymentMethodLabel(payment.method),
    methodCode: payment.method,
    source: payment.source,
    sourceLabel: paymentSourceLabel(payment.source),
    affectsBalance: Boolean(payment.affects_balance),
    events: payment.events || [],
    balanceMinor: payment.balance_minor,
    auditEvent: payment.audit_event || null,
    comment: payment.comment || '',
    receipt: payment.receipt?.original_name || '',
    receiptUrl: payment.receipt?.download_url || null,
    studentId: payment.student_id,
  }))
}
