import React from 'react';

/** SwimCRM Radio — single option in a group. Use with the same `name`. */
export function Radio({ label, checked = false, disabled = false, name, value, onChange, id, style, ...rest }) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: 'var(--fs-sm)',
        color: 'var(--text-body)',
        userSelect: 'none',
        ...style,
      }}
    >
      <span
        style={{
          position: 'relative',
          width: 17,
          height: 17,
          flexShrink: 0,
          borderRadius: '50%',
          border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border-strong)'}`,
          background: 'var(--surface-card)',
          transition: 'var(--transition-control)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--primary)' }} />}
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          id={id}
          style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', margin: 0, cursor: 'inherit' }}
          {...rest}
        />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
