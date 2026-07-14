import React from 'react';

/** SwimCRM Switch — on/off toggle for settings & consents (RODO channels). */
export function Switch({ checked = false, disabled = false, onChange, label, id, style, ...rest }) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
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
          width: 34,
          height: 20,
          flexShrink: 0,
          borderRadius: 'var(--radius-pill)',
          background: checked ? 'var(--primary)' : 'var(--slate-300)',
          transition: 'background-color var(--dur-normal) var(--ease-standard)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: 'var(--shadow-sm)',
            transition: 'left var(--dur-normal) var(--ease-out)',
          }}
        />
        <input
          type="checkbox"
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
