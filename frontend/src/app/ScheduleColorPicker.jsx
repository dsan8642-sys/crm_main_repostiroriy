import React, { useId, useState } from 'react'
import { adminTranslator } from '../adminLocales.js'
import { useLocale } from '../i18n.jsx'

import {
  normalizeScheduleColorKey,
  scheduleColorOption,
  scheduleColorStyle,
  schedulePaletteOptions,
} from './schedulePalette.js'


export function ScheduleColorPicker({
  label,
  value,
  onChange,
  disabled = false,
  name,
  id,
  error,
}) {
  const { locale } = useLocale()
  const t = adminTranslator(locale)
  const generatedName = useId()
  const [expanded, setExpanded] = useState(false)
  const selectedKey = normalizeScheduleColorKey(value)
  const selectedOption = scheduleColorOption(selectedKey)
  const groupName = name || `schedule-color-${generatedName}`
  const panelId = `${groupName}-options`

  return (
    <fieldset className="ops-schedule-color-picker" disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${panelId}-error` : undefined}>
      <legend>{label || t('scheduleColor.label')}</legend>
      <button
        id={id}
        aria-controls={panelId}
        aria-expanded={expanded}
        aria-label={t('scheduleColor.choose', { color: t(`scheduleColor.${selectedOption.key}`) })}
        className="ops-schedule-color-trigger"
        onClick={() => setExpanded((current) => !current)}
        style={scheduleColorStyle(selectedKey)}
        type="button"
      >
        <span className="ops-schedule-color-swatch" aria-hidden="true"><span>✓</span></span>
        <span className="ops-schedule-color-trigger-copy">
          <small>{t('scheduleColor.selected')}</small>
          <strong>{t(`scheduleColor.${selectedOption.key}`)}</strong>
        </span>
        <span className="ops-schedule-color-chevron" aria-hidden="true">⌄</span>
      </button>
      {expanded && (
        <div className="ops-schedule-color-panel" id={panelId}>
          <span className="ops-schedule-color-hint">{t('scheduleColor.hint')}</span>
          <div className="ops-schedule-color-grid">
            {schedulePaletteOptions.map((option) => {
              const selected = option.key === selectedKey
              return (
                <label
                  className={`ops-schedule-color-option${selected ? ' is-selected' : ''}`}
                  data-color-key={option.key}
                  key={option.key}
                  style={scheduleColorStyle(option.key)}
                >
                  <input
                    type="radio"
                    name={groupName}
                    value={option.key}
                    checked={selected}
                    onChange={() => {
                      onChange?.(option.key === 'standard' ? null : option.key)
                      setExpanded(false)
                    }}
                  />
                  <span className="ops-schedule-color-swatch" aria-hidden="true">
                    {selected && <span>✓</span>}
                  </span>
                  <span>{t(`scheduleColor.${option.key}`)}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
      {error && <small id={`${panelId}-error`} className="ops-field-error" role="alert">{error}</small>}
    </fieldset>
  )
}
