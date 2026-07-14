import React from 'react';

/** SwimCRM Checkbox — controlled box with label. Supports indeterminate. */
export function Checkbox({ label, checked = false, indeterminate = false, disabled = false, onChange, id, style, ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  const on = checked || indeterminate;
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
          borderRadius: 'var(--radius-xs)',
          border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border-strong)'}`,
          background: on ? 'var(--primary)' : 'var(--surface-card)',
          transition: 'var(--transition-control)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && !indeterminate && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.2 4.2L19 6.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {indeterminate && !checked && (
          <span style={{ width: 9, height: 2.5, background: '#fff', borderRadius: 2 }} />
        )}
        <input
          ref={ref}
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
