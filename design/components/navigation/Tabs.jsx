import React from 'react';

/**
 * SwimCRM Tabs — horizontal section switcher for detail views
 * (client card sections, report types, list filters like "Płatności /
 * Na weryfikacji / Odrzucone"). Controlled via value/onChange.
 */
export function Tabs({ items, value, onChange, style }) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        gap: 2,
        borderBottom: '1px solid var(--border-subtle)',
        ...style,
      }}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            className="swim-tab"
            onClick={() => onChange && onChange(it.value)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '9px 12px 11px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              fontWeight: active ? 'var(--fw-semibold)' : 'var(--fw-medium)',
              color: active ? 'var(--text-strong)' : 'var(--text-muted)',
              transition: 'var(--transition-control)',
            }}
          >
            {it.label}
            {it.count != null && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--fs-2xs)',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-pill)',
                  background: active ? 'var(--primary-soft)' : 'var(--surface-sunken)',
                  color: active ? 'var(--primary-hover)' : 'var(--text-muted)',
                }}
              >
                {it.count}
              </span>
            )}
            <span
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: -1,
                height: 2,
                borderRadius: '2px 2px 0 0',
                background: active ? 'var(--primary)' : 'transparent',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
