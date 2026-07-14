import React from 'react';
import { labelStyle } from './Input.jsx';

/** SwimCRM Select — native select styled to match Input, with chevron. */
export function Select({ label, hint, error, required = false, size = 'md', children, id, style, containerStyle, ...rest }) {
  const heights = { sm: 'var(--control-h-sm)', md: 'var(--control-h-md)', lg: 'var(--control-h-lg)' };
  const inputId = id || (label ? `sel-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...containerStyle }}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
          {required && <span style={{ color: 'var(--red-500)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex' }}>
        <select
          id={inputId}
          className="swim-select"
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            width: '100%',
            height: heights[size],
            background: 'var(--surface-card)',
            border: `1px solid ${error ? 'var(--red-500)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '0 30px 0 11px',
            font: 'inherit',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--text-strong)',
            outline: 'none',
            cursor: 'pointer',
            transition: 'var(--transition-control)',
            ...style,
          }}
          {...rest}
        >
          {children}
        </select>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {error ? (
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--red-600)' }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{hint}</span>
      ) : null}
    </div>
  );
}
