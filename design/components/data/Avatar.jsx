import React from 'react';

/**
 * SwimCRM Avatar — initials chip for children, parents and trainers.
 * No photos in the product; colour is derived deterministically from the name
 * so the same person keeps the same hue. `kind` tints the ring.
 */
const PALETTE = [
  ['#d6ecfb', '#0f5285'], // blue
  ['#eef6fd', '#1364a3'], // pool blue
  ['#e0d5f6', '#6238a8'], // violet
  ['#f9e6bd', '#855708'], // amber
  ['#cdecd7', '#116a38'], // green
  ['#f9d5d2', '#93231d'], // red
];

function hueFor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % PALETTE.length;
  return PALETTE[h];
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name = '', size = 32, kind, style }) {
  const [bg, fg] = hueFor(name);
  return (
    <span
      title={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: bg,
        color: fg,
        border: kind ? `1.5px solid ${fg}` : '1px solid rgba(0,0,0,0.04)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--fw-semibold)',
        fontSize: Math.round(size * 0.4),
        lineHeight: 1,
        letterSpacing: '0.01em',
        userSelect: 'none',
        ...style,
      }}
    >
      {initials(name)}
    </span>
  );
}
