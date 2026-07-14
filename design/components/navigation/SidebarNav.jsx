import React from 'react';

/**
 * SwimCRM SidebarNav — the app's left navigation rail.
 * Renders a brand wordmark, grouped nav items with optional count badges and
 * a role footer. Active item gets a soft fill + accent left rail.
 * Items: { key, label, icon, count, section }.
 */
export function SidebarNav({ items, active, onSelect, brand = 'H2O', product = 'SwimCRM', roleLabel, footer, style }) {
  // group by section (in order of first appearance)
  const sections = [];
  const map = {};
  items.forEach((it) => {
    const s = it.section || '';
    if (!map[s]) { map[s] = []; sections.push(s); }
    map[s].push(it);
  });

  return (
    <nav
      style={{
        width: 'var(--sidebar-w)',
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-card)',
        borderRight: '1px solid var(--border-subtle)',
        ...style,
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 'var(--topbar-h)', padding: '0 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: '-0.02em' }}>
          {brand}
        </span>
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-base)', color: 'var(--text-strong)' }}>{product}</div>
          {roleLabel && <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>{roleLabel}</div>}
        </div>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {sections.map((s, si) => (
          <div key={si} style={{ marginBottom: 6 }}>
            {s && <div style={{ padding: '10px 8px 4px', fontSize: 'var(--fs-2xs)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{s}</div>}
            {map[s].map((it) => {
              const isActive = it.key === active;
              return (
                <button
                  key={it.key}
                  className="swim-nav-item"
                  onClick={() => onSelect && onSelect(it.key)}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '7px 9px',
                    marginBottom: 1,
                    background: isActive ? 'var(--primary-soft)' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--fs-sm)',
                    fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-medium)',
                    color: isActive ? 'var(--primary-hover)' : 'var(--text-body)',
                    transition: 'var(--transition-control)',
                  }}
                >
                  {isActive && <span style={{ position: 'absolute', left: -8, top: 6, bottom: 6, width: 3, borderRadius: '0 3px 3px 0', background: 'var(--primary)' }} />}
                  {it.icon && <span style={{ flexShrink: 0, display: 'inline-flex', color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}>{it.icon}</span>}
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
                  {it.count != null && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', fontWeight: 600, minWidth: 18, textAlign: 'center', padding: '1px 6px', borderRadius: 'var(--radius-pill)', background: it.countTone === 'danger' ? 'var(--red-500)' : (isActive ? 'var(--white)' : 'var(--surface-sunken)'), color: it.countTone === 'danger' ? '#fff' : (isActive ? 'var(--primary-hover)' : 'var(--text-muted)') }}>
                      {it.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {footer && <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 10 }}>{footer}</div>}
    </nav>
  );
}
