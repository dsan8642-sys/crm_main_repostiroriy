import React, { useId, useState } from 'react'

import {
  normalizeScheduleColorKey,
  scheduleColorOption,
  scheduleColorStyle,
  schedulePaletteOptions,
} from './schedulePalette.js'


export function ScheduleColorPicker({
  label = 'Цвет расписания',
  value,
  onChange,
  disabled = false,
  name,
}) {
  const generatedName = useId()
  const [expanded, setExpanded] = useState(false)
  const selectedKey = normalizeScheduleColorKey(value)
  const selectedOption = scheduleColorOption(selectedKey)
  const groupName = name || `schedule-color-${generatedName}`
  const panelId = `${groupName}-options`

  return (
    <fieldset className="ops-schedule-color-picker" disabled={disabled}>
      <legend>{label}</legend>
      <button
        aria-controls={panelId}
        aria-expanded={expanded}
        aria-label={`Выбрать цвет. Сейчас: ${selectedOption.label}`}
        className="ops-schedule-color-trigger"
        onClick={() => setExpanded((current) => !current)}
        style={scheduleColorStyle(selectedKey)}
        type="button"
      >
        <span className="ops-schedule-color-swatch" aria-hidden="true"><span>✓</span></span>
        <span className="ops-schedule-color-trigger-copy">
          <small>Выбранный цвет</small>
          <strong>{selectedOption.label}</strong>
        </span>
        <span className="ops-schedule-color-chevron" aria-hidden="true">⌄</span>
      </button>
      {expanded && (
        <div className="ops-schedule-color-panel" id={panelId}>
          <span className="ops-schedule-color-hint">Стандартный цвет или один из 30 утверждённых вариантов.</span>
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
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </fieldset>
  )
}
