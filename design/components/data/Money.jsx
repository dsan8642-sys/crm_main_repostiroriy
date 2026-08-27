import React from 'react';

/**
 * SwimCRM Money — formats a PLN amount as "240,00 zł" (Polish locale) with
 * tabular mono numerals. Colours debt (negative) red and credit (positive)
 * green when `signed` is set — matches balance semantics in the brief.
 */
export function Money({ amount, currency = 'zł', locale = 'pl-PL', signed = false, muted = false, size = 'inherit', style }) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let color = 'inherit';
  if (muted) color = 'var(--text-muted)';
  if (signed) {
    if (n < 0) color = 'var(--money-debt)';
    else if (n > 0) color = 'var(--money-credit)';
    else color = 'var(--money-zero)';
  }
  const sign = signed && n > 0 ? '+' : signed && n < 0 ? '−' : '';
  const fontSize = size === 'inherit' ? 'inherit' : size;
  return (
    <span
      className="swim-mono"
      style={{ color, fontSize, fontWeight: 'var(--fw-medium)', whiteSpace: 'nowrap', ...style }}
    >
      {sign}{abs}&nbsp;{currency}
    </span>
  );
}
