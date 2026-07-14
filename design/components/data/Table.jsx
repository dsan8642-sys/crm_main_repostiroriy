import React from 'react';

/**
 * SwimCRM Table — dense, bordered data table for list views.
 * Column-driven: pass `columns` (key, header, width, align, render) and `rows`.
 * Supports row hover, selectable rows, a sticky header and compact density.
 * For fully custom layouts, pass children instead of columns/rows.
 */
export function Table({
  columns,
  rows,
  rowKey = (r, i) => r.id ?? i,
  onRowClick,
  selectable = false,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
  density = 'compact',
  emptyLabel = 'Brak danych',
  stickyHeader = true,
  children,
  style,
}) {
  const rowH = density === 'compact' ? 'var(--row-h-compact)' : 'var(--row-h-default)';
  const cellPad = density === 'compact' ? '0 12px' : '0 14px';

  const wrap = {
    width: '100%',
    background: 'var(--surface-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    ...style,
  };

  if (children) {
    return <div style={wrap}><table style={tableBase}>{children}</table></div>;
  }

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <div style={wrap}>
      <table style={tableBase}>
        <thead>
          <tr>
            {selectable && (
              <th style={{ ...thBase, width: 40, position: stickyHeader ? 'sticky' : 'static', top: 0 }}>
                <CheckboxCell checked={allSelected} indeterminate={someSelected} onChange={onToggleAll} />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  ...thBase,
                  width: c.width,
                  textAlign: c.align || 'left',
                  position: stickyHeader ? 'sticky' : 'static',
                  top: 0,
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                {emptyLabel}
              </td>
            </tr>
          )}
          {rows.map((r, i) => {
            const id = rowKey(r, i);
            const selected = selectedIds.includes(id);
            return (
              <tr
                key={id}
                className="swim-tr-hover"
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{
                  height: rowH,
                  cursor: onRowClick ? 'pointer' : 'default',
                  background: selected ? 'var(--primary-soft)' : 'transparent',
                  transition: 'background-color var(--dur-fast) var(--ease-standard)',
                }}
              >
                {selectable && (
                  <td style={{ ...tdBase, padding: cellPad }} onClick={(e) => e.stopPropagation()}>
                    <CheckboxCell checked={selected} onChange={() => onToggleRow && onToggleRow(id)} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} style={{ ...tdBase, padding: cellPad, textAlign: c.align || 'left', color: c.muted ? 'var(--text-muted)' : 'var(--text-body)' }}>
                    {c.render ? c.render(r, i) : r[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const tableBase = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: 'var(--font-sans)',
  fontVariantNumeric: 'tabular-nums',
};

const thBase = {
  textAlign: 'left',
  padding: '0 12px',
  height: 34,
  background: 'var(--surface-sunken)',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-muted)',
  fontSize: 'var(--fs-2xs)',
  fontWeight: 'var(--fw-semibold)',
  letterSpacing: 'var(--ls-caps)',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  zIndex: 1,
};

const tdBase = {
  borderBottom: '1px solid var(--border-subtle)',
  fontSize: 'var(--fs-sm)',
  color: 'var(--text-body)',
  verticalAlign: 'middle',
};

function CheckboxCell({ checked, indeterminate, onChange }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer', display: 'block' }}
    />
  );
}

export { thBase, tdBase };
