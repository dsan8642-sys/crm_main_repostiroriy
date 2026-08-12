const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
export const DEFAULT_SCHEDULE_VIEW = 'week'

export function localToday() {
  return dateToIso(new Date())
}

export function dateFromIso(value) {
  if (!ISO_DATE.test(String(value || ''))) return null
  const [year, month, day] = value.split('-').map(Number)
  const result = new Date(year, month - 1, day, 12)
  if (
    result.getFullYear() !== year
    || result.getMonth() !== month - 1
    || result.getDate() !== day
  ) return null
  return result
}

export function dateToIso(value) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function validIsoDate(value) {
  return dateFromIso(value) != null
}

export function validTime(value) {
  return ISO_TIME.test(String(value || ''))
}

export function addDays(value, amount) {
  const result = new Date(value)
  result.setDate(result.getDate() + amount)
  return result
}

export function calendarDates(focusDate, viewMode) {
  const anchor = dateFromIso(focusDate) || dateFromIso(localToday())
  if (viewMode === 'day') return [dateToIso(anchor)]
  if (viewMode === 'week') {
    const monday = addDays(anchor, -((anchor.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, index) => dateToIso(addDays(monday, index)))
  }
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)
  const gridStart = addDays(monthStart, -((monthStart.getDay() + 6) % 7))
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12)
  const gridEnd = addDays(monthEnd, 6 - ((monthEnd.getDay() + 6) % 7))
  const days = Math.round((gridEnd - gridStart) / 86400000) + 1
  return Array.from({ length: days }, (_, index) => dateToIso(addDays(gridStart, index)))
}

export function calendarRange(focusDate, viewMode) {
  const dates = calendarDates(focusDate, viewMode)
  return { dateFrom: dates[0], dateTo: dates[dates.length - 1] }
}

export function moveCalendarFocus(focusDate, viewMode, direction) {
  const anchor = dateFromIso(focusDate) || dateFromIso(localToday())
  if (viewMode === 'day') return dateToIso(addDays(anchor, direction))
  if (viewMode === 'week') return dateToIso(addDays(anchor, direction * 7))
  const day = anchor.getDate()
  const target = new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1, 12)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate()
  target.setDate(Math.min(day, lastDay))
  return dateToIso(target)
}

export function sessionIsoDate(session) {
  return String(session.startAt || session.start_at || session.rawDate || '').slice(0, 10)
}

export function periodSessionCount(sessions, focusDate, viewMode) {
  if (viewMode !== 'month') return (sessions || []).length
  const month = String(focusDate || '').slice(0, 7)
  return (sessions || []).filter((session) => sessionIsoDate(session).slice(0, 7) === month).length
}

export function periodCountLabel(count, viewMode) {
  const period = viewMode === 'day' ? 'день' : viewMode === 'month' ? 'месяц' : 'неделю'
  return `За ${period}: ${count}`
}

export function newSessionCapacity({ groupCapacity, typeCapacity, currentCapacity }) {
  const preferred = groupCapacity ?? typeCapacity ?? currentCapacity
  return preferred == null ? '' : String(preferred)
}

export function validateAdminSessionForm(form) {
  const errors = {}
  if (!form.trainerId) errors.trainerId = 'Выберите тренера.'
  if (!validIsoDate(form.date)) errors.date = 'Укажите дату.'
  if (!validTime(form.start)) errors.start = 'Укажите время в формате ЧЧ:ММ.'
  const duration = Number(form.durationMinutes)
  if (!Number.isInteger(duration) || duration < 15 || duration > 480 || duration % 5 !== 0) {
    errors.durationMinutes = 'От 15 до 480 минут с шагом 5 минут.'
  }
  if (!form.location) errors.location = 'Выберите локацию.'
  const capacity = Number(form.maxParticipants)
  if (!Number.isInteger(capacity) || capacity < 1) errors.maxParticipants = 'Укажите число больше нуля.'
  if (form.sessionType === 'group' && !form.groupId) errors.groupId = 'Выберите группу.'
  if (form.sessionType !== 'group' && !form.participantId) errors.participantId = 'Выберите участника.'
  if (form.price !== '' && (!Number.isFinite(Number(form.price)) || Number(form.price) < 0)) {
    errors.price = 'Цена не может быть отрицательной.'
  }
  return errors
}

export function sessionsForCalendar(sessions, focusDate, viewMode) {
  const allowed = new Set(calendarDates(focusDate, viewMode))
  return (sessions || [])
    .filter((session) => allowed.has(sessionIsoDate(session)))
    .sort((left, right) => String(left.startAt || left.start_at).localeCompare(
      String(right.startAt || right.start_at),
    ))
}
