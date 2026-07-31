import React, { useEffect, useRef, useState } from 'react'
import {
  calendarDates,
  dateFromIso,
  dateToIso,
  localToday,
  validIsoDate,
  validTime,
} from './scheduleContracts.js'

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
    ? 'Укажите дату.'
    : value && !validIsoDate(value)
      ? 'Введите дату в формате ГГГГ-ММ-ДД.'
      : value && min && value < min
        ? `Дата не может быть раньше ${min}.`
        : null)
  const dates = calendarDates(dateToIso(shownMonth), 'month')
  const monthLabel = shownMonth.toLocaleDateString('ru-RU', {
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
      placeholder="ГГГГ-ММ-ДД"
      error={error}
      open={open}
      setOpen={setOpen}
      buttonLabel={`Открыть календарь: ${label}`}
      buttonIcon="▦"
    >
      <div className="ops-picker-head">
        <button
          type="button"
          aria-label="Предыдущий месяц"
          onClick={() => setShownMonth(new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1, 12))}
        >
          ‹
        </button>
        <strong aria-live="polite">{monthLabel}</strong>
        <button
          type="button"
          aria-label="Следующий месяц"
          onClick={() => setShownMonth(new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1, 12))}
        >
          ›
        </button>
      </div>
      <div className="ops-date-weekdays" aria-hidden="true">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <span key={day}>{day}</span>)}
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
              aria-label={parsed.toLocaleDateString('ru-RU', { dateStyle: 'long' })}
              disabled={disabled}
              onClick={() => choose(date)}
            >
              {parsed.getDate()}
            </button>
          )
        })}
      </div>
      <button type="button" className="ops-picker-today" onClick={() => choose(localToday())}>
        Сегодня
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
  const generatedId = React.useId()
  const fieldId = id || `time-${generatedId.replace(/:/g, '')}`
  const [open, setOpen] = useState(false)
  const valid = validTime(value)
  const [hour, minute] = valid ? value.split(':') : ['00', '00']
  const error = externalError || (!value && required
    ? 'Укажите время.'
    : value && !valid
      ? 'Введите время в 24-часовом формате ЧЧ:ММ.'
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
      placeholder="ЧЧ:ММ"
      error={error}
      open={open}
      setOpen={setOpen}
      buttonLabel={`Открыть выбор времени: ${label}`}
      buttonIcon="◷"
    >
      <div className="ops-time-picker" aria-label="24-часовой выбор времени">
        <div>
          <strong>Часы</strong>
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
          <strong>Минуты</strong>
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
      <button type="button" className="ops-picker-today" onClick={() => setOpen(false)}>
        Готово
      </button>
    </FieldShell>
  )
}
