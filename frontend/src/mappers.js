export function asMoneyMajor(minor) {
  return Math.round((Number(minor || 0) / 100) * 100) / 100
}

// The backend stores debt as charges minus payments. In the UI, a positive
// account balance means credit, while a negative balance means money owed.
export function asAccountBalance(minor) {
  return -asMoneyMajor(minor)
}

export function formatDate(iso) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

export function formatShortDate(iso) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(iso))
}

export function formatTime(iso) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function paymentMethodLabel(method) {
  return contractPaymentMethodLabel(method, 'ru')
}

export function paymentSourceLabel(source) {
  return source === 'client_top_up' ? 'Запрос на пополнение' : 'Платёж администратора'
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
        group: student.group?.name || 'Индивидуально',
      trainer: student.next_session?.trainer || '',
      born: student.birth_date || '-',
      email: student.email || '',
      groupId: student.group?.id || '',
      sub: student.current_subscription?.type || 'Нет абонемента',
        subLeft: student.current_subscription?.remaining_sessions ?? null,
        subEnds: student.current_subscription?.effective_end_date || '-',
        subscription: profileSubscriptions.find((subscription) => subscription.participant_id === student.id) || student.current_subscription || null,
        balance: asAccountBalance(student.balance_minor),
      }))
    : [{
        id: 'account',
        studentId: null,
        name: account.full_name || account.username || 'Клиент',
        group: 'Индивидуально',
        trainer: '',
        born: '-',
        sub: 'Нет абонемента',
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
        group: session.group?.name || 'Индивидуальное',
        trainer: session.trainer,
        location: session.location,
        status: sessionStatus(session),
        sessionType: session.session_type || 'group',
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
        label: `${record.session?.group?.name || 'Индивидуальное'} · ${formatTime(record.session?.start_at)}`,
      status: record.status,
        deducts: record.deducts,
        comment: record.comment || '',
        group: record.session?.group?.name || 'Индивидуальное',
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
      receipt: payment.receipt?.original_name || payment.comment || '',
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
    group: session.group?.name || 'Индивидуальное',
    location: session.location,
    count: session.max_participants || 0,
    status: sessionStatus(session),
    sessionType: session.session_type || 'group',
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
      ? `${detailSession.group?.name || 'Индивидуальное'} · ${formatTime(detailSession.start_at)}-${formatTime(detailSession.end_at)}`
      : 'Занятие',
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

export function mapAdminPortalData({ reference, clients, trainers, groups, subscriptionTypes, sessionTypeConfigs, sessions, payments, debtors }) {
  const groupRows = groups.groups || []
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
      students: group.participants_count,
      // null price = the group is never billed per visit
      price: group.price_minor == null ? null : asMoneyMajor(group.price_minor),
      priceMinor: group.price_minor,
      currency: group.currency,
      active: group.is_active,
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
    clients: (clients.clients || []).map((client) => ({
      id: participantKey(client.client_id, client.id),
      clientId: client.client_id,
      studentId: client.id,
      first: client.first_name,
      last: client.last_name,
      born: client.birth_date || '-',
      parent: client.is_account_holder ? client.full_name : 'Аккаунт клиента',
      phone: client.client_phone || '',
      email: client.email || '',
      groupId: client.group?.id || '',
      group: client.group?.name || 'Индивидуально',
      trainer: '',
      isActive: client.is_active,
      accountActive: client.is_active !== false,
      status: client.client_is_active === false ? 'blacklisted' : (client.is_active ? 'active' : 'inactive'),
      balance: 0,
      sub: '',
      subLeft: null,
      subEnds: '-',
      med: '',
      emergency: [client.emergency_contact_name, client.emergency_contact_phone].filter(Boolean).join(' · '),
    })),
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
      isCancelled: session.is_cancelled,
      start: formatTime(session.start_at),
      end: formatTime(session.end_at),
      durationMinutes: session.duration_minutes || 60,
      priceMinor: session.price_minor,
      currency: session.currency,
      group: session.group?.name || 'Индивидуальное',
      trainer: session.trainer,
      location: session.location,
      count: session.participants_count || 0,
      limit: session.max_participants || 0,
      status: sessionStatus(session),
      individualParticipant: session.individual_participant || null,
    })),
    roster: [],
    payments: (payments.payments || []).map((payment) => ({
      id: String(payment.id),
      paymentId: payment.id,
      studentId: payment.participant_id,
      clientId: (clients.clients || []).find((client) => client.id === payment.participant_id)?.client_id,
      child: payment.participant,
      parent: '',
      amount: asMoneyMajor(payment.amount_minor),
      method: paymentMethodLabel(payment.method),
      methodCode: payment.method,
      source: payment.source,
      sourceLabel: paymentSourceLabel(payment.source),
      affectsBalance: Boolean(payment.affects_balance),
      events: payment.events || [],
      date: payment.paid_at,
      status: statusFromPayment(payment.status),
      receipt: payment.receipt?.original_name || payment.comment || null,
      receiptUrl: payment.receipt?.download_url || null,
    })),
    debtors: (debtors.debtors || []).map((row) => ({
      id: `d${row.student.id}`,
      clientId: row.student.client_id,
      child: row.student.full_name,
      parent: row.student.client_phone || '',
      group: row.student.group?.name || 'Индивидуально',
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
import { participantKey, paymentMethodLabel as contractPaymentMethodLabel } from './contracts.js'
