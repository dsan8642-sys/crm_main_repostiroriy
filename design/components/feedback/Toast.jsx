import React from 'react';

/**
 * SwimCRM Toast — transient confirmation ("Zapisano", "Płatność potwierdzona")
 * or error. This is the presentational unit; render a list of them fixed to a
 * corner. Auto-dismiss is the caller's responsibility.
 */
const TONES = {
  success: ['--green-500', 'M8 12.5l2.5 2.5L16 9'],
  danger:  ['--red-500', 'M15 9l-6 6M9 9l6 6'],
  info:    ['--blue-500', 'M12 11v5M12 8h.01'],
};

export function Toast({ children, title, tone = 'success', onClose, style }) {
  const [colorVar, path] = TONES[tone] || TONES.success;
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        minWidth: 260,
        maxWidth: 380,
        padding: '11px 13px',
        background: 'var(--surface-inverse)',
        color: '#fff',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        fontSize: 'var(--fs-sm)',
        animation: 'swim-toast var(--dur-normal) var(--ease-out)',
        ...style,
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 1, color: `var(${colorVar})` }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          {tone !== 'info' && tone !== 'danger' && <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />}
          {(tone === 'danger') && <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />}
          {(tone === 'info') && <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />}
          <path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontWeight: 'var(--fw-semibold)', marginBottom: children ? 2 : 0 }}>{title}</div>}
        {children && <div style={{ color: 'rgba(255,255,255,0.82)' }}>{children}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="Zamknij" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', padding: 2, lineHeight: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      )}
    </div>
  );
}
