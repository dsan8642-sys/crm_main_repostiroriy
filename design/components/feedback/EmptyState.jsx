import React from 'react';

/**
 * SwimCRM EmptyState — for empty lists, "no results", empty day on schedule,
 * no permission. Keeps the tone calm and offers the primary next action.
 */
export function EmptyState({ icon, title, description, action, compact = false, style }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '28px 20px' : '48px 24px',
        color: 'var(--text-muted)',
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            width: compact ? 40 : 52,
            height: compact ? 40 : 52,
            borderRadius: '50%',
            background: 'var(--primary-soft)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ font: 'var(--text-card-title)', color: 'var(--text-strong)', marginBottom: 5 }}>{title}</div>
      {description && (
        <div style={{ fontSize: 'var(--fs-sm)', maxWidth: 340, lineHeight: 'var(--lh-normal)', marginBottom: action ? 16 : 0 }}>
          {description}
        </div>
      )}
      {action}
    </div>
  );
}
