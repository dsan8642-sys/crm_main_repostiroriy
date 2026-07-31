import React, { useMemo } from 'react'
import { DateField } from './DateTimeField.jsx'
import {
  calendarDates,
  dateFromIso,
  localToday,
  moveCalendarFocus,
  sessionIsoDate,
} from './scheduleContracts.js'

const VIEW_LABELS = {
  day: 'День',
  week: 'Неделя',
  month: 'Месяц',
}

export function ScheduleViewSwitcher({ displayMode, setDisplayMode, icons }) {
  const CalendarIcon = icons?.Calendar
  const ListIcon = icons?.List
  return (
    <div className="seg ops-view-switcher" role="group" aria-label="Режим отображения расписания">
      <button
        type="button"
        className={displayMode === 'calendar' ? 'on' : ''}
        aria-pressed={displayMode === 'calendar'}
        onClick={() => setDisplayMode('calendar')}
      >
        {CalendarIcon && <CalendarIcon size={15} />}<span>Календарь</span>
      </button>
      <button
        type="button"
        className={displayMode === 'list' ? 'on' : ''}
        aria-pressed={displayMode === 'list'}
        onClick={() => setDisplayMode('list')}
      >
        {ListIcon && <ListIcon size={15} />}<span>Список</span>
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
  return (
    <div className="ops-calendar-navigation">
      <div className="seg" role="group" aria-label="Период календаря">
        {Object.entries(VIEW_LABELS).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={viewMode === value ? 'on' : ''}
            aria-pressed={viewMode === value}
            onClick={() => setViewMode(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ops-calendar-arrows">
        <button
          type="button"
          aria-label={`Предыдущий период: ${VIEW_LABELS[viewMode]}`}
          onClick={() => setFocusDate(moveCalendarFocus(focusDate, viewMode, -1))}
        >
          ‹
        </button>
        <button type="button" onClick={() => setFocusDate(localToday())}>Сегодня</button>
        <button
          type="button"
          aria-label={`Следующий период: ${VIEW_LABELS[viewMode]}`}
          onClick={() => setFocusDate(moveCalendarFocus(focusDate, viewMode, 1))}
        >
          ›
        </button>
      </div>
      <DateField label="Опорная дата" value={focusDate} onChange={setFocusDate} required />
      <span className="ops-calendar-announcement" role="status" aria-live="polite">
        {VIEW_LABELS[viewMode]} · {focusDate}
      </span>
    </div>
  )
}

function DefaultEvent({ session, onOpenSession }) {
  const label = session.group || session.individualParticipant?.full_name || 'Индивидуальное занятие'
  return (
    <button
      type="button"
      className={`ops-schedule-event${session.isCancelled || session.status === 'cancelled' ? ' is-cancelled' : ''}`}
      onClick={() => onOpenSession?.(session)}
    >
      <span className="mono">{session.start}-{session.end}</span>
      <strong>{label}</strong>
      {session.individualParticipant?.full_name && <small>{session.individualParticipant.full_name}</small>}
      {session.trainer && <small>{session.trainer}</small>}
      {session.location && <small>{session.location}</small>}
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
  ariaLabel = 'Календарь занятий',
}) {
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
      ? renderEvent(session)
      : <DefaultEvent session={session} onOpenSession={onOpenSession} />
  }

  return (
    <div
      className={`ops-schedule-calendar is-${viewMode}`}
      data-testid="schedule-calendar"
      aria-label={ariaLabel}
    >
      {viewMode === 'week' && (
        <div className="ops-mobile-week">
          <div className="ops-mobile-week-strip" role="tablist" aria-label="Дни недели">
            {dates.map((date) => {
              const parsed = dateFromIso(date)
              const count = grouped[date]?.length || 0
              return (
                <button
                  type="button"
                  role="tab"
                  key={date}
                  aria-selected={date === focusDate}
                  onClick={() => setFocusDate(date)}
                >
                  <span>{parsed.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                  <strong>{parsed.getDate()}</strong>
                  {count > 0 && <small aria-label={`Занятий: ${count}`}>• {count}</small>}
                </button>
              )
            })}
          </div>
          <div className="ops-mobile-week-events">
            {(grouped[focusDate] || []).map((session) => <React.Fragment key={session.id}>{eventNode(session)}</React.Fragment>)}
            {!(grouped[focusDate] || []).length && <span className="ops-schedule-empty-day">Нет занятий</span>}
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
                <span>{parsed.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                <button
                  type="button"
                  aria-label={`${parsed.toLocaleDateString('ru-RU', { dateStyle: 'long' })}. Занятий: ${daySessions.length}`}
                  onClick={() => chooseDate(date)}
                >
                  {parsed.toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: viewMode === 'month' ? undefined : 'short',
                  })}
                </button>
                {viewMode === 'month' && daySessions.length > 0 && (
                  <small className="ops-calendar-marker" aria-label={`Занятий: ${daySessions.length}`}>
                    • {daySessions.length}
                  </small>
                )}
              </header>
              <div className="ops-schedule-day-events">
                {daySessions.map((session) => <React.Fragment key={session.id}>{eventNode(session)}</React.Fragment>)}
                {!daySessions.length && <span className="ops-schedule-empty-day">Нет занятий</span>}
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
  emptyLabel = 'Занятий пока нет.',
}) {
  return (
    <div className="ops-card-list" data-testid={testId}>
      {sessions.map((session) => (
        <button type="button" className="ops-session-tile" key={session.id} onClick={() => onOpenSession(session)}>
          <span>
            <strong>{session.date || sessionIsoDate(session)} · {session.start}-{session.end}</strong>
            <small>{session.group}{session.individualParticipant?.full_name ? ` · ${session.individualParticipant.full_name}` : ''}{session.trainer ? ` · ${session.trainer}` : ''}{session.location ? ` · ${session.location}` : ''}</small>
          </span>
          {renderStatus?.(session)}
        </button>
      ))}
      {!sessions.length && <div className="empty">{emptyLabel}</div>}
    </div>
  )
}
