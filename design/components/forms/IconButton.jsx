import React from 'react';

/**
 * SwimCRM IconButton — square, icon-only control for toolbars & table rows.
 * Sizes sm/md/lg. Variant 'default' or 'danger' (destructive hover).
 */
export function IconButton({
  children,
  label,
  size = 'md',
  variant = 'default',
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const dims = { sm: 26, md: 32, lg: 38 };
  const d = dims[size];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`swim-iconbtn${variant === 'danger' ? ' is-danger' : ''}`}
      style={{
        width: d,
        height: d,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        color: 'var(--text-muted)',
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'var(--transition-control)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
