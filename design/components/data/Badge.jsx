import React from 'react';

/**
 * SwimCRM Badge — small label / count chip.
 * Tones map to the token status families. Use `dot` for a leading status dot,
 * `count` styling via size="count" for numeric pills on nav items.
 */
const TONES = {
  neutral: ['--status-neutral-bg', '--status-neutral-fg', '--status-neutral-bd'],
  info:    ['--status-info-bg', '--status-info-fg', '--status-info-bd'],
  primary: ['--primary-soft', '--primary-hover', '--primary-soft-border'],
  success: ['--status-paid-bg', '--status-paid-fg', '--status-paid-bd'],
  warning: ['--status-pending-bg', '--status-pending-fg', '--status-pending-bd'],
  danger:  ['--status-overdue-bg', '--status-overdue-fg', '--status-overdue-bd'],
};

export function Badge({ children, tone = 'neutral', dot = false, solid = false, style }) {
  const [bg, fg, bd] = TONES[tone] || TONES.neutral;
  const base = solid
    ? { background: `var(${fg})`, color: '#fff', border: '1px solid transparent' }
    : { background: `var(${bg})`, color: `var(${fg})`, border: `1px solid var(${bd})` };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 20,
        padding: '0 8px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--fs-2xs)',
        fontWeight: 'var(--fw-semibold)',
        letterSpacing: '0.01em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...base,
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: solid ? '#fff' : `var(${fg})` }} />}
      {children}
    </span>
  );
}
