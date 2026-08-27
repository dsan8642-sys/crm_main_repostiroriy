import React from 'react';

/**
 * SwimCRM StatusPill — the load-bearing status indicator for the CRM's
 * critical states. Named statuses carry the exact colour + label the brief
 * requires. Attendance statuses also expose whether they consume a lesson.
 */
export const STATUS = {
  // Attendance
  present:  { label: 'Obecny',        tone: 'present', consumes: true },
  absent:   { label: 'Nieobecny',     tone: 'absent',  consumes: true },
  excused:  { label: 'Nieob. uspr.',  tone: 'excused', consumes: false },
  moved:    { label: 'Przełożone',    tone: 'moved',   consumes: false },
  // Payments / charges
  paid:     { label: 'Zapłacone',     tone: 'paid' },
  pending:  { label: 'Na weryfikacji', tone: 'pending' },
  rejected: { label: 'Odrzucone',     tone: 'overdue' },
  overdue:  { label: 'Po terminie',   tone: 'overdue' },
  partial:  { label: 'Częściowo',     tone: 'pending' },
  awaiting: { label: 'Oczekuje',      tone: 'neutral' },
  // Subscription / session lifecycle
  active:   { label: 'Aktywny',       tone: 'paid' },
  frozen:   { label: 'Zamrożony',     tone: 'info' },
  expired:  { label: 'Wygasł',        tone: 'overdue' },
  cancelled:{ label: 'Anulowane',     tone: 'neutral' },
  planned:  { label: 'Zaplanowane',   tone: 'info' },
  done:     { label: 'Zakończone',    tone: 'neutral' },
  inactive: { label: 'Nieaktywny',    tone: 'neutral' },
};

const TONE_VARS = {
  present: ['--status-present-bg', '--status-present-fg', '--status-present-bd'],
  absent:  ['--status-absent-bg', '--status-absent-fg', '--status-absent-bd'],
  excused: ['--status-excused-bg', '--status-excused-fg', '--status-excused-bd'],
  moved:   ['--status-moved-bg', '--status-moved-fg', '--status-moved-bd'],
  paid:    ['--status-paid-bg', '--status-paid-fg', '--status-paid-bd'],
  pending: ['--status-pending-bg', '--status-pending-fg', '--status-pending-bd'],
  overdue: ['--status-overdue-bg', '--status-overdue-fg', '--status-overdue-bd'],
  info:    ['--status-info-bg', '--status-info-fg', '--status-info-bd'],
  neutral: ['--status-neutral-bg', '--status-neutral-fg', '--status-neutral-bd'],
};

/**
 * @param status  a key of STATUS, or pass tone+label directly for a custom pill.
 * @param showConsumes  for attendance statuses, append a subtle "−1"/"0" marker.
 */
export function StatusPill({
  status,
  label,
  tone,
  showConsumes = false,
  consumesLabel = 'Zajęcie zostaje spisane',
  doesNotConsumeLabel = 'Zajęcie nie jest spisane',
  size = 'md',
  style,
}) {
  const def = status ? STATUS[status] : null;
  const t = tone || (def ? def.tone : 'neutral');
  const text = label || (def ? def.label : status) || '—';
  const [bg, fg, bd] = TONE_VARS[t] || TONE_VARS.neutral;
  const h = size === 'sm' ? 18 : 22;
  const consumes = def && typeof def.consumes === 'boolean';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: h,
          padding: size === 'sm' ? '0 7px' : '0 9px',
          borderRadius: 'var(--radius-sm)',
          background: `var(${bg})`,
          color: `var(${fg})`,
          border: `1px solid var(${bd})`,
          fontSize: size === 'sm' ? 'var(--fs-2xs)' : 'var(--fs-xs)',
          fontWeight: 'var(--fw-semibold)',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: `var(${fg})` }} />
        {text}
      </span>
      {showConsumes && consumes && (
        <span
          className="swim-mono"
          title={def.consumes ? consumesLabel : doesNotConsumeLabel}
          style={{
            fontSize: 'var(--fs-2xs)',
            fontWeight: 'var(--fw-semibold)',
            color: def.consumes ? 'var(--money-debt)' : 'var(--text-faint)',
          }}
        >
          {def.consumes ? '−1' : '0'}
        </span>
      )}
    </span>
  );
}
