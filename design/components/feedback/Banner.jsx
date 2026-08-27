import React from 'react';

/**
 * SwimCRM Banner — inline contextual message inside a page or panel.
 * Tones: info, success, warning, danger. Use for validation errors, schedule
 * conflicts, "payment on review", server errors, RODO notices.
 */
const TONES = {
  info:    ['--status-info-bg', '--status-info-fg', '--status-info-bd'],
  success: ['--status-paid-bg', '--status-paid-fg', '--status-paid-bd'],
  warning: ['--status-pending-bg', '--status-pending-fg', '--status-pending-bd'],
  danger:  ['--status-overdue-bg', '--status-overdue-fg', '--status-overdue-bd'],
};

const ICONS = {
  info: 'M12 8h.01M11 12h1v4h1', // rendered below via paths
};

export function Banner({ children, title, tone = 'info', icon, onClose, closeLabel = 'Zamknij', action, style }) {
  const [bg, fg, bd] = TONES[tone] || TONES.info;
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        background: `var(${bg})`,
        border: `1px solid var(${bd})`,
        borderRadius: 'var(--radius-md)',
        color: `var(${fg})`,
        fontSize: 'var(--fs-sm)',
        lineHeight: 'var(--lh-normal)',
        ...style,
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 1, color: `var(${fg})` }}>{icon || <BannerIcon tone={tone} />}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontWeight: 'var(--fw-semibold)', marginBottom: children ? 2 : 0 }}>{title}</div>}
        {children && <div style={{ color: 'var(--text-body)' }}>{children}</div>}
      </div>
      {action}
      {onClose && (
        <button onClick={onClose} aria-label={closeLabel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: `var(${fg})`, opacity: 0.7, padding: 2, lineHeight: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      )}
    </div>
  );
}

function BannerIcon({ tone }) {
  if (tone === 'success') {
    return <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  if (tone === 'danger' || tone === 'warning') {
    return <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 3l9 16H3L12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M12 10v4M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
  }
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
