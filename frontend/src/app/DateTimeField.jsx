import React, { useEffect, useRef, useState } from 'react'
import {
  calendarDates,
  dateFromIso,
  dateToIso,
  localToday,
  validIsoDate,
  validTime,
} from './scheduleContracts.js'
import { useLocale } from '../i18n.jsx'
import { uiLocaleTag } from '../localeContracts.js'

function FieldShell({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  open,
  setOpen,
  buttonLabel,
  buttonIcon,
  children,
}) {
  const buttonRef = useRef(null)
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    popoverRef.current?.querySelector('button:not([disabled])')?.focus()
    return undefined
  }, [open])

  function closeOnEscape(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    setOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <div className="ops-picker-field">
      <label htmlFor={id}>{label}</label>
      <div className="ops-picker-input">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete="off"
        />
        <button
          ref={buttonRef}
          type="button"
          aria-label={buttonLabel}
          aria-expanded={open}
          aria-controls={`${id}-popover`}
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true">{buttonIcon}</span>
        </button>
      </div>
      {error && <small id={`${id}-error`} className="ops-field-error" role="alert">{error}</small>}
      {open && (
        <div ref={popoverRef} id={`${id}-popover`} className="ops-picker-popover" role="dialog" aria-label={buttonLabel} onKeyDown={closeOnEscape}>
          {children}
        </div>
      )}
    </div>
  )
}

export function DateField({
  id,
  label,
  value,
  onChange,
  required = false,
  min,
  error: externalError,
}) {
  const { locale, t } = useLocale()
  const localeTag = uiLocaleTag(locale)
  const generatedId = React.useId()
  const fieldId = id || `date-${generatedId.replace(/:/g, '')}`
  const [open, setOpen] = useState(false)
  const selected = dateFromIso(value)
  const [shownMonth, setShownMonth] = useState(
    () => selected || dateFromIso(localToday()),
  )
  useEffect(() => {
    if (selected) setShownMonth(selected)
  }, [value])
  const error = externalError || (!value && required
    ? t('date.required')
    : value && !validIsoDate(value)
      ? t('date.invalid')
      : value && min && value < min
        ? t('date.minimum', undefined, { date: min })
        : null)
  const dates = calendarDates(dateToIso(shownMonth), 'month')
  const monthLabel = shownMonth.toLocaleDateString(localeTag, {
    month: 'long',
    year: 'numeric',
  })

  function choose(nextValue) {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <FieldShell
      id={fieldId}
      label={label}
      value={value}
      onChange={onChange}
      placeholder={t('date.placeholder')}
      error={error}
      open={open}
      setOpen={setOpen}
      buttonLabel={t('date.openCalendar', undefined, { label })}
      buttonIcon="▦"
    >
      <div className="ops-picker-head">
        <button
          type="button"
          aria-label={t('date.previousMonth')}
          onClick={() => setShownMonth(new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1, 12))}
        >
          ‹
        </button>
        <strong aria-live="polite">{monthLabel}</strong>
        <button
          type="button"
          aria-label={t('date.nextMonth')}
          onClick={() => setShownMonth(new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1, 12))}
        >
          ›
        </button>
      </div>
      <div className="ops-date-weekdays" aria-hidden="true">
        {t('date.weekdays').split(',').map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="ops-date-grid">
        {dates.map((date) => {
          const parsed = dateFromIso(date)
          const outside = parsed.getMonth() !== shownMonth.getMonth()
          const disabled = min && date < min
          return (
            <button
              key={date}
              type="button"
              className={`${outside ? 'is-outside' : ''}${date === value ? ' is-selected' : ''}`}
              aria-pressed={date === value}
              aria-label={parsed.toLocaleDateString(localeTag, { dateStyle: 'long' })}
              disabled={disabled}
              onClick={() => choose(date)}
            >
              {parsed.getDate()}
            </button>
          )
        })}
      </div>
      <button type="button" className="ops-picker-today" onClick={() => choose(localToday())}>
        {t('calendar.today')}
      </button>
    </FieldShell>
  )
}

export function TimeField({
  id,
  label,
  value,
  onChange,
  required = false,
  error: externalError,
}) {
  const { t } = useLocale()
  const generatedId = React.useId()
  const fieldId = id || `time-${generatedId.replace(/:/g, '')}`
  const [open, setOpen] = useState(false)
  const valid = validTime(value)
  const [hour, minute] = valid ? value.split(':') : ['00', '00']
  const error = externalError || (!value && required
    ? t('time.required')
    : value && !valid
      ? t('time.invalid')
      : null)
  const minutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))

  function choose(nextHour, nextMinute) {
    onChange(`${nextHour}:${nextMinute}`)
  }

  return (
    <FieldShell
      id={fieldId}
      label={label}
      value={value}
      onChange={onChange}
      placeholder={t('time.placeholder')}
      error={error}
      open={open}
      setOpen={setOpen}
      buttonLabel={t('time.open', undefined, { label })}
      buttonIcon="◷"
    >
      <div className="ops-time-picker" aria-label={t('time.picker')}>
        <div>
          <strong>{t('time.hours')}</strong>
          <div className="ops-time-options">
            {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map((item) => (
              <button
                key={item}
                type="button"
                className={item === hour ? 'is-selected' : ''}
                aria-pressed={item === hour}
                onClick={() => choose(item, minute)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div>
          <strong>{t('time.minutes')}</strong>
          <div className="ops-time-options is-minutes">
            {minutes.map((item) => (
              <button
                key={item}
                type="button"
                className={item === minute ? 'is-selected' : ''}
                aria-pressed={item === minute}
                onClick={() => choose(hour, item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button type="button" className="ops-picker-today ops-picker-done" onClick={() => setOpen(false)}>
        {t('time.done')}
      </button>
    </FieldShell>
  )
}
