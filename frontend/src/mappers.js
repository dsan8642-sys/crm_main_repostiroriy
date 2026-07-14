export function asMoneyMajor(minor) {
  return Math.round((Number(minor || 0) / 100) * 100) / 100
}

export function formatDate(iso) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

export function formatShortDate(iso) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(iso))
}

export function formatTime(iso) {
  if (!iso) return '-'
  return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
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

export function mapClientPortalData({ overview, profile, consents, schedule, attendance, payments }) {
  const account = overview.account || {}
  const participants = overview.participants || overview.students || []
  const children = participants.length
    ? participants.map((student) => ({
        id: `s${student.id}`,
        studentId: student.id,
        name: student.full_name,
        group: student.group?.name || 'Indywidualnie',
      trainer: student.next_session?.trainer || '',
      born: student.birth_date || '-',
      email: student.email || '',
      groupId: student.group?.id || '',
      sub: student.current_subscription?.type || 'Brak abonamentu',
        subLeft: student.current_subscription?.remaining_sessions ?? null,
        subEnds: student.current_subscription?.effective_end_date || '-',
        balance: -asMoneyMajor(student.balance_minor),
      }))
    : [{
        id: 'account',
        studentId: null,
        name: account.full_name || account.username || 'Klient',
        group: 'Indywidualnie',
        trainer: '',
        born: '-',
        sub: 'Brak abonamentu',
        subLeft: null,
        subEnds: '-',
        balance: 0,
      }]

  const sessions = schedule.sessions || []
  const byChild = Object.fromEntries(children.map((child) => [
    child.id,
    sessions
      .filter((session) => !session.individual_student_id || session.individual_student_id === child.studentId)
      .map((session) => ({
        date: formatShortDate(session.start_at),
        start: formatTime(session.start_at),
        end: formatTime(session.end_at),
        group: session.group?.name || 'Indywidualne',
        trainer: session.trainer,
        location: session.location,
        status: sessionStatus(session),
      })),
  ]))

  const attendanceByChild = Object.fromEntries(children.map((child) => [
    child.id,
    (attendance.attendance || [])
      .filter((record) => record.student?.id === child.studentId)
      .map((record) => ({
        date: record.session?.start_at?.slice(0, 10),
        label: `${record.session?.group?.name || 'Indywidualne'} · ${formatTime(record.session?.start_at)}`,
      status: record.status,
        deducts: record.deducts,
        comment: record.comment || '',
        group: record.session?.group?.name || 'Indywidualne',
        trainer: record.session?.trainer || '',
      })),
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
      method: payment.method,
      receipt: payment.comment || '',
      studentId: payment.student_id,
    })),
  }
}

function mapTrainerSession(session) {
  return {
    id: String(session.id),
    sessionId: session.id,
    date: formatShortDate(session.start_at),
    rawDate: session.start_at?.slice(0, 10) || '',
    start: formatTime(session.start_at),
    end: formatTime(session.end_at),
    groupId: session.group?.id || '',
    group: session.group?.name || 'Indywidualne',
    location: session.location,
    count: session.max_participants || 0,
    status: sessionStatus(session),
  }
}

export function mapTrainerPortalData({ sessions, groups, history, detail }) {
  const sessionRows = (sessions.sessions || []).map(mapTrainerSession)

  const detailSession = detail?.session || sessions.sessions?.[0]
  return {
    sessions: sessionRows,
    activeSessionId: detailSession?.id || sessionRows[0]?.sessionId || null,
    activeSessionTitle: detailSession
      ? `${detailSession.group?.name || 'Indywidualne'} · ${formatTime(detailSession.start_at)}-${formatTime(detailSession.end_at)}`
      : 'Zajecia',
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
      active: group.is_active,
      next: group.next_session ? `${formatShortDate(group.next_session.start_at)} ${formatTime(group.next_session.start_at)}` : '',
    })),
  }
}

export function mapAdminPortalData({ clients, trainers, groups, subscriptionTypes, templates, sessions, payments, debtors }) {
  const groupRows = groups.groups || []
  return {
    trainers: (trainers.trainers || []).map((trainer) => ({
      id: `t${trainer.id}`,
      trainerId: trainer.id,
      username: trainer.username,
      name: trainer.full_name,
      email: trainer.email || '',
      phone: trainer.phone,
      active: trainer.is_active,
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
      id: `c${client.id}`,
      clientId: client.client_id,
      studentId: client.id,
      first: client.first_name,
      last: client.last_name,
      born: client.birth_date || '-',
      parent: client.is_account_holder ? client.full_name : 'Konto klienta',
      phone: client.client_phone || '',
      email: client.email || '',
      groupId: client.group?.id || '',
      group: client.group?.name || 'Indywidualnie',
      trainer: '',
      isActive: client.is_active,
      status: client.is_active ? 'active' : 'inactive',
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
      isCancelled: session.is_cancelled,
      start: formatTime(session.start_at),
      end: formatTime(session.end_at),
      group: session.group?.name || 'Indywidualne',
      trainer: session.trainer,
      location: session.location,
      count: 0,
      limit: session.max_participants || 0,
      status: sessionStatus(session),
    })),
    templates: (templates?.templates || []).map((template) => ({
      id: `tpl${template.id}`,
      templateId: template.id,
      groupId: template.group?.id || '',
      trainerId: template.trainer?.id || '',
      group: template.group?.name || '-',
      trainer: template.trainer?.name || '-',
      weekday: template.weekday,
      weekdayLabel: template.weekday_label,
      start: template.start_time,
      end: template.end_time,
      location: template.location,
      limit: template.max_participants,
      active: template.is_active,
    })),
    roster: [],
    payments: (payments.payments || []).map((payment) => ({
      id: String(payment.id),
      paymentId: payment.id,
      child: payment.participant,
      parent: '',
      amount: asMoneyMajor(payment.amount_minor),
      method: payment.method,
      date: payment.paid_at,
      status: statusFromPayment(payment.status),
      receipt: payment.comment || null,
    })),
    debtors: (debtors.debtors || []).map((row) => ({
      id: `d${row.student.id}`,
      clientId: row.student.client_id,
      child: row.student.full_name,
      parent: row.student.client_phone || '',
      group: row.student.group?.name || 'Indywidualnie',
      trainer: '',
      reason: row.reasons.join(', '),
      balance: -asMoneyMajor(row.balance_minor),
      last: '-',
    })),
  }
}
