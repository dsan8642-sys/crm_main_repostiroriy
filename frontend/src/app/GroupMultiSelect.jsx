import React from 'react'

export function GroupMultiSelect({ id, groups, value, onChange, error, label = 'Группы' }) {
  const selected = (value || []).map(String)
  const limitReached = selected.length >= 3

  function toggle(groupId) {
    const key = String(groupId)
    if (selected.includes(key)) onChange(selected.filter((item) => item !== key))
    else if (!limitReached) onChange([...selected, key])
  }

  return <fieldset id={id} className="ops-group-multiselect" aria-invalid={Boolean(error)} tabIndex={-1}>
    <legend>{label} <span className="muted">({selected.length}/3)</span></legend>
    <div className="ops-group-multiselect-options">
      {groups.map((group) => {
        const checked = selected.includes(String(group.groupId))
        return <label key={group.groupId}>
          <input
            type="checkbox"
            checked={checked}
            disabled={!checked && limitReached}
            onChange={() => toggle(group.groupId)}
          />
          <span>{group.name}</span>
        </label>
      })}
      {!groups.length && <span className="muted">Активных групп нет</span>}
    </div>
    {error && <small className="ops-field-error" role="alert">{error}</small>}
  </fieldset>
}
