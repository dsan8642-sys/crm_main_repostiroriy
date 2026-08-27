import React, { useMemo } from 'react'
import { DateField } from './DateTimeField.jsx'
import {
  calendarDates,
  dateFromIso,
  localToday,
  moveCalendarFocus,
  sessionIsoDate,
} from './scheduleContracts.js'
import { scheduleColorStyle } from './schedulePalette.js'
import { useLocale } from '../i18n.jsx'
import { uiLocaleTag } from '../localeContracts.js'

const VIEW_KEYS = { day: 'calendar.day', week: 'calendar.week', month: 'calendar.month' }

export function ScheduleViewSwitcher({ displayMode, setDisplayMode, icons }) {
  const { t } = useLocale()
  const CalendarIcon = icons?.Calendar
  const ListIcon = icons?.List
  return (
    <div className="seg ops-view-switcher" role="group" aria-label={t('calendar.displayMode')}>
      <button
        type="button"
        className={displayMode === 'calendar' ? 'on' : ''}
        aria-pressed={displayMode === 'calendar'}
        onClick={() => setDisplayMode('calendar')}
      >
        {CalendarIcon && <CalendarIcon size={15} />}<span>{t('calendar.calendar')}</span>
      </button>
      <button
        type="button"
        className={displayMode === 'list' ? 'on' : ''}
        aria-pressed={displayMode === 'list'}
        onClick={() => setDisplayMode('list')}
      >
        {ListIcon && <ListIcon size={15} />}<span>{t('calendar.list')}</span>
      </button>
    </div>
  )
}

export function CalendarNavigation({
  focusDate,
  setFocusDate,
  viewMode,
  setViewMode,
}) {
  const { t } = useLocale()
  return (
    <div className="ops-calendar-navigation">
      <div className="seg" role="group" aria-label={t('calendar.period')}>
        {Object.entries(VIEW_KEYS).map(([value, key]) => (
          <button
            key={value}
            type="button"
            className={viewMode === value ? 'on' : ''}
            aria-pressed={viewMode === value}
            onClick={() => setViewMode(value)}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div className="ops-calendar-date-controls">
        <DateField label={t('calendar.focusDate')} value={focusDate} onChange={setFocusDate} required />
        <button className="ops-calendar-today" type="button" onClick={() => setFocusDate(localToday())}>{t('calendar.today')}</button>
      </div>
      <span className="ops-calendar-announcement" role="status" aria-live="polite">
        {t(VIEW_KEYS[viewMode])} · {focusDate}
      </span>
    </div>
  )
}

export function scheduleEventTitle(session, t = (_key, fallback) => fallback) {
  if (session.sessionType !== 'group' && session.individualParticipant?.full_name) {
    return session.individualParticipant.full_name
  }
  if (session.group && !['Индивидуальное', 'Индивидуальная'].includes(session.group)) return session.group
  if (session.sessionType === 'split') return t('calendar.split', 'Split-тренировка')
  return t('calendar.individual', 'Индивидуальная тренировка')
}

export function scheduleEventTypeLabel(session, t = (_key, fallback) => fallback) {
  if (session.sessionTypeLabel) return session.sessionTypeLabel
  if (session.sessionType === 'group') return t('calendar.group', 'Групповая тренировка')
  if (session.sessionType === 'split') return t('calendar.split', 'Split-тренировка')
  return t('calendar.individual', 'Индивидуальная тренировка')
}

export function scheduleEventHeading(session, t) {
  return session.sessionType === 'group' ? scheduleEventTitle(session, t) : scheduleEventTypeLabel(session, t)
}

export function scheduleEventSupportingLabel(session, t) {
  if (session.sessionType === 'split' && session.roster?.length) {
    const visible = session.roster.slice(0, 2).map((participant) => participant.full_name)
    const hiddenCount = session.roster.length - visible.length
    return `${visible.join(' · ')}${hiddenCount > 0 ? ` · +${hiddenCount}` : ''}`
  }
  return session.sessionType === 'group'
    ? scheduleEventTypeLabel(session, t)
    : session.individualParticipant?.full_name || null
}

export function scheduleOccupancy(session) {
  const limit = Number(session.limit)
  if (!Number.isFinite(limit) || limit < 1) return null
  const count = Number(session.count)
  return `${Number.isFinite(count) && count >= 0 ? count : 0}/${limit}`
}

export function scheduleOccupancyLabel(session, t = (_key, fallback) => fallback) {
  const occupancy = scheduleOccupancy(session)
  if (!occupancy) return null
  const [count, limit] = occupancy.split('/')
  return t('calendar.occupancy', `Записано ${count} из ${limit}`, { count, limit })
}

export function ScheduleEventContent({ session }) {
  const { t } = useLocale()
  const occupancy = scheduleOccupancy(session)
  const supportingLabel = scheduleEventSupportingLabel(session, t)
  const splitRosterNames = session.sessionType === 'split'
    ? session.roster?.slice(0, 2).map((participant) => participant.full_name).join(' · ')
    : null
  const hiddenSplitCount = session.sessionType === 'split'
    ? Math.max((session.roster?.length || 0) - 2, 0)
    : 0
  return (
    <>
      <span className="ops-event-primary">
        <span className="mono">{session.start}-{session.end}</span>
        {occupancy && <span className="ops-event-occupancy" aria-label={scheduleOccupancyLabel(session)}>{occupancy}</span>}
      </span>
      <strong className="ops-event-title">{scheduleEventHeading(session, t)}</strong>
      {supportingLabel && (splitRosterNames
        ? <span className="ops-event-type is-split-roster"><span className="ops-event-roster-names">{splitRosterNames}</span>{hiddenSplitCount > 0 && <span className="ops-event-roster-count">· +{hiddenSplitCount}</span>}</span>
        : <span className="ops-event-type">{supportingLabel}</span>)}
      {session.trainer && <small className="ops-event-secondary ops-event-trainer">{session.trainer}</small>}
      {session.location && <small className="ops-event-secondary ops-event-location">{session.location}</small>}
    </>
  )
}

export function eventAccessibleLabel(session, t = (_key, fallback) => fallback) {
  const title = scheduleEventTitle(session, t)
  return [
    `${session.start}-${session.end}`,
    title,
    session.group && session.group !== title ? session.group : null,
    session.sessionType === 'split'
      ? session.roster?.map((participant) => participant.full_name).join(', ')
      : null,
    scheduleOccupancyLabel(session, t),
    session.trainer,
    session.location,
  ].filter(Boolean).join('. ')
}

function DefaultEvent({ session, onOpenSession }) {
  const { t } = useLocale()
  return (
    <button
      type="button"
      className={`ops-schedule-event${session.isCancelled || session.status === 'cancelled' ? ' is-cancelled' : ''}`}
      aria-label={eventAccessibleLabel(session, t)}
      data-color-key={session.colorKey || 'standard'}
      style={scheduleColorStyle(session.colorKey)}
      onClick={() => onOpenSession?.(session)}
    >
      <ScheduleEventContent session={session} />
    </button>
  )
}

function PeriodArrow({ direction, focusDate, setFocusDate, viewMode }) {
  const { t } = useLocale()
  const previous = direction === 'previous'
  return (
    <button
      className={`ops-calendar-period-arrow is-${direction}`}
      type="button"
      aria-label={t(previous ? 'calendar.previousPeriod' : 'calendar.nextPeriod', undefined, { period: t(VIEW_KEYS[viewMode]) })}
      onClick={() => setFocusDate(moveCalendarFocus(focusDate, viewMode, previous ? -1 : 1))}
    >
      {previous ? '‹' : '›'}
    </button>
  )
}

export function ScheduleCalendar({
  sessions,
  focusDate,
  viewMode,
  setFocusDate,
  setViewMode,
  onOpenSession,
  renderEvent,
  ariaLabel,
}) {
  const { locale, t } = useLocale()
  const localeTag = uiLocaleTag(locale)
  const dates = useMemo(() => calendarDates(focusDate, viewMode), [focusDate, viewMode])
  const grouped = useMemo(() => {
    const next = {}
    ;(sessions || []).forEach((session) => {
      const date = sessionIsoDate(session)
      next[date] = [...(next[date] || []), session]
    })
    Object.values(next).forEach((rows) => rows.sort(
      (left, right) => String(left.startAt || left.start_at).localeCompare(
        String(right.startAt || right.start_at),
      ),
    ))
    return next
  }, [sessions])
  const today = localToday()

  function chooseDate(date) {
    setFocusDate(date)
    setViewMode('day')
  }

  function eventNode(session) {
    return renderEvent
      ? renderEvent(session, { viewMode })
      : <DefaultEvent session={session} onOpenSession={onOpenSession} />
  }

  const periodDates = viewMode === 'day' ? dates : dates.slice(0, 7)

  return (
    <div
      className={`ops-schedule-calendar is-${viewMode}`}
      data-testid="schedule-calendar"
      aria-label={ariaLabel || t('calendar.sessions')}
    >
      <div className={`ops-calendar-period-header is-${viewMode}`} data-testid={viewMode === 'month' ? 'month-weekday-header' : undefined}>
        <PeriodArrow direction="previous" focusDate={focusDate} setFocusDate={setFocusDate} viewMode={viewMode} />
        {viewMode === 'day' ? (
          <div className="ops-calendar-day-heading">
            {dateFromIso(focusDate).toLocaleDateString(localeTag, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        ) : (
          <div className="ops-calendar-weekday-row">
            {periodDates.map((date) => {
              const parsed = dateFromIso(date)
              return (
                <div className="ops-calendar-weekday" key={`weekday-${date}`}>
                  <strong>{parsed.toLocaleDateString(localeTag, { weekday: 'short' })}</strong>
                  {viewMode === 'week' && <span>{parsed.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' })}</span>}
                </div>
              )
            })}
          </div>
        )}
        <PeriodArrow direction="next" focusDate={focusDate} setFocusDate={setFocusDate} viewMode={viewMode} />
      </div>
      {viewMode === 'week' && (
        <div className="ops-mobile-week">
          <div className="ops-mobile-week-nav">
            <PeriodArrow direction="previous" focusDate={focusDate} setFocusDate={setFocusDate} viewMode={viewMode} />
            <div className="ops-mobile-week-strip" role="tablist" aria-label={t('calendar.weekdays')}>
              {dates.map((date) => {
                const parsed = dateFromIso(date)
                const count = grouped[date]?.length || 0
                return (
                  <button
                    type="button"
                    role="tab"
                    key={date}
                    aria-selected={date === focusDate}
                    aria-label={`${parsed.toLocaleDateString(localeTag, { dateStyle: 'long' })}. ${t('calendar.sessionCount', undefined, { count })}`}
                    onClick={() => setFocusDate(date)}
                  >
                    <span>{parsed.toLocaleDateString(localeTag, { weekday: 'short' })}</span>
                    <strong>{parsed.getDate()}</strong>
                    {count > 0 && <span className="ops-mobile-week-dot" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            <PeriodArrow direction="next" focusDate={focusDate} setFocusDate={setFocusDate} viewMode={viewMode} />
          </div>
          <div className="ops-mobile-week-events">
            {(grouped[focusDate] || []).map((session) => <React.Fragment key={session.id}>{eventNode(session)}</React.Fragment>)}
            {!(grouped[focusDate] || []).length && <span className="ops-schedule-empty-day">{t('calendar.noSessions')}</span>}
          </div>
        </div>
      )}
      <div className="ops-calendar-grid">
        {dates.map((date) => {
          const daySessions = grouped[date] || []
          const parsed = dateFromIso(date)
          const outside = viewMode === 'month' && date.slice(0, 7) !== focusDate.slice(0, 7)
          return (
            <section
              key={date}
              className={`ops-schedule-day${outside ? ' is-outside' : ''}${date === today ? ' is-today' : ''}`}
            >
              <header>
                {viewMode === 'month' && (
                  <button
                    type="button"
                    aria-label={`${parsed.toLocaleDateString(localeTag, { dateStyle: 'long' })}. ${t('calendar.sessionCount', undefined, { count: daySessions.length })}`}
                    onClick={() => chooseDate(date)}
                  >
                    {parsed.getDate()}
                  </button>
                )}
              </header>
              <div className="ops-schedule-day-events">
                {daySessions.map((session) => <React.Fragment key={session.id}>{eventNode(session)}</React.Fragment>)}
                {!daySessions.length && <span className="ops-schedule-empty-day">{t('calendar.noSessions')}</span>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function ScheduleList({
  sessions,
  onOpenSession,
  renderStatus,
  testId,
  emptyLabel,
}) {
  const { t } = useLocale()
  return (
    <div className="ops-card-list" data-testid={testId}>
      {sessions.map((session) => (
        <button
          type="button"
          className={`ops-session-tile${session.isCancelled || session.status === 'cancelled' ? ' is-cancelled' : ''}`}
          aria-label={eventAccessibleLabel(session, t)}
          data-color-key={session.colorKey || 'standard'}
          key={session.id}
          onClick={() => onOpenSession(session)}
          style={scheduleColorStyle(session.colorKey)}
        >
          <span>
            <strong>{session.date || sessionIsoDate(session)} · {session.start}-{session.end}{scheduleOccupancy(session) ? ` · ${scheduleOccupancy(session)}` : ''}</strong>
            <small>{session.group}{session.individualParticipant?.full_name ? ` · ${session.individualParticipant.full_name}` : ''}{session.trainer ? ` · ${session.trainer}` : ''}{session.location ? ` · ${session.location}` : ''}</small>
          </span>
          {renderStatus?.(session)}
        </button>
      ))}
      {!sessions.length && <div className="empty">{emptyLabel || t('calendar.empty')}</div>}
    </div>
  )
}
