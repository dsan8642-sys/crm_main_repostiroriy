import React from 'react';
import { labelStyle } from './Input.jsx';

/** SwimCRM Textarea — multi-line field for notes, comments, message bodies. */
export function Textarea({ label, hint, error, required = false, rows = 3, id, style, containerStyle, ...rest }) {
  const inputId = id || (label ? `ta-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const errorId = inputId ? `${inputId}-error` : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...containerStyle }}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
          {required && <span style={{ color: 'var(--red-500)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        className="swim-textarea"
        style={{
          width: '100%',
          resize: 'vertical',
          background: 'var(--surface-card)',
          border: `1px solid ${error ? 'var(--red-500)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '8px 11px',
          font: 'inherit',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-sm)',
          lineHeight: 'var(--lh-normal)',
          color: 'var(--text-strong)',
          outline: 'none',
          transition: 'var(--transition-control)',
          ...style,
        }}
        {...rest}
        aria-invalid={error ? true : rest['aria-invalid']}
        aria-describedby={error ? errorId : rest['aria-describedby']}
      />
      {error ? (
        <span id={errorId} className="ops-field-error" role="alert" style={{ fontSize: 'var(--fs-xs)', color: 'var(--red-600)' }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{hint}</span>
      ) : null}
    </div>
  );
}
