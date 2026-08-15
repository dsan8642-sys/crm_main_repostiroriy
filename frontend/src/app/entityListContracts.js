const DAY_MS = 24 * 60 * 60 * 1000

function localDayNumber(value, timeZone = 'Europe/Warsaw') {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS
}

export function formatEntityDate(value, locale = 'ru-RU', timeZone = 'Europe/Warsaw') {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatEntityMoney(amount, currency = 'zł', locale = 'pl-PL') {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return '—'
  const absolute = Math.abs(numeric).toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  const sign = numeric < 0 ? '−' : numeric > 0 ? '+' : ''
  return `${sign}${absolute} ${currency}`
}

export function clientActivity(lastPresentAt, now = new Date(), timeZone = 'Europe/Warsaw') {
  const lastDay = localDayNumber(lastPresentAt, timeZone)
  const nowDay = localDayNumber(now, timeZone)
  if (lastDay == null || nowDay == null) {
    return {
      state: 'inactive',
      label: 'Неактивен · не посещал последние 6 месяцев',
      days: null,
    }
  }
  const days = Math.max(0, Math.floor(nowDay - lastDay))
  if (days <= 60) {
    return { state: 'active', label: `Активен · ${formatEntityDate(lastPresentAt, 'ru-RU', timeZone)}`, days }
  }
  if (days <= 180) {
    return { state: 'inactive', label: `Неактивен · ${formatEntityDate(lastPresentAt, 'ru-RU', timeZone)}`, days }
  }
  return {
    state: 'inactive',
    label: 'Неактивен · не посещал последние 6 месяцев',
    days,
  }
}

export function groupRowsByDate(rows, dateKey = (row) => row.date) {
  const groups = []
  const byDate = new Map()
  ;(rows || []).forEach((row) => {
    const key = dateKey(row) || 'Дата не указана'
    if (!byDate.has(key)) {
      const group = { key, rows: [] }
      byDate.set(key, group)
      groups.push(group)
    }
    byDate.get(key).rows.push(row)
  })
  return groups
}

export function clampedPopoverPosition({ anchor, menu, viewport, padding = 8, gap = 6 }) {
  const width = Math.min(menu.width, Math.max(0, viewport.width - padding * 2))
  const height = Math.min(menu.height, Math.max(0, viewport.height - padding * 2))
  const below = anchor.bottom + gap
  const above = anchor.top - gap - height
  const top = below + height <= viewport.height - padding
    ? below
    : Math.max(padding, above)
  const preferredLeft = anchor.right - width
  const left = Math.min(
    Math.max(padding, preferredLeft),
    Math.max(padding, viewport.width - padding - width),
  )
  return { top, left, width, maxHeight: viewport.height - padding - top }
}
