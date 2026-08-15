import React from 'react';

/**
 * SwimCRM Input — labelled text field with optional prefix/suffix, helper,
 * and error state. Wrap in a fragment with <label> via the `label` prop.
 */
export function Input({
  label,
  hint,
  error,
  required = false,
  prefix = null,
  suffix = null,
  size = 'md',
  id,
  style,
  containerStyle,
  ...rest
}) {
  const heights = { sm: 'var(--control-h-sm)', md: 'var(--control-h-md)', lg: 'var(--control-h-lg)' };
  const inputId = id || (label ? `in-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const errorId = inputId ? `${inputId}-error` : undefined;
  const hasAffix = prefix || suffix;

  const field = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: heights[size],
        background: 'var(--surface-card)',
        border: `1px solid ${error ? 'var(--red-500)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '0 10px',
        gap: 7,
        transition: 'var(--transition-control)',
        boxShadow: error ? '0 0 0 3px rgba(214,63,54,0.14)' : 'none',
      }}
      className="swim-input-shell"
    >
      {prefix && <span style={{ color: 'var(--text-faint)', display: 'inline-flex', fontSize: 'var(--fs-sm)' }}>{prefix}</span>}
      <input
        id={inputId}
        className="swim-input"
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          font: 'inherit',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-sm)',
          color: 'var(--text-strong)',
          ...style,
        }}
        {...rest}
        aria-invalid={error ? true : rest['aria-invalid']}
        aria-describedby={error ? errorId : rest['aria-describedby']}
      />
      {suffix && <span style={{ color: 'var(--text-faint)', display: 'inline-flex', fontSize: 'var(--fs-sm)' }}>{suffix}</span>}
    </div>
  );

  // When affixed, focus ring lives on shell; else on input directly.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...containerStyle }}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
          {required && <span style={{ color: 'var(--red-500)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      {hasAffix ? field : (
        <input
          id={inputId}
          className="swim-input"
          style={{
            height: heights[size],
            width: '100%',
            background: 'var(--surface-card)',
            border: `1px solid ${error ? 'var(--red-500)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '0 11px',
            font: 'inherit',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--text-strong)',
            outline: 'none',
            transition: 'var(--transition-control)',
            boxShadow: error ? '0 0 0 3px rgba(214,63,54,0.14)' : 'none',
            ...style,
          }}
          {...rest}
          aria-invalid={error ? true : rest['aria-invalid']}
          aria-describedby={error ? errorId : rest['aria-describedby']}
        />
      )}
      {error ? (
        <span id={errorId} className="ops-field-error" role="alert" style={{ fontSize: 'var(--fs-xs)', color: 'var(--red-600)' }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{hint}</span>
      ) : null}
    </div>
  );
}

export const labelStyle = {
  font: 'var(--text-label)',
  color: 'var(--text-body)',
};
