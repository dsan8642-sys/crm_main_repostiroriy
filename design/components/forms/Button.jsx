import React from 'react';

/**
 * SwimCRM Button — primary action control.
 * Variants: primary (filled blue), secondary (outlined), ghost (text),
 * subtle (soft fill), danger (destructive). Sizes: sm / md / lg.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft = null,
  iconRight = null,
  disabled = false,
  loading = false,
  fullWidth = false,
  type = 'button',
  onClick,
  style,
  ...rest
}) {
  const heights = {
    sm: 'var(--control-h-sm)',
    md: 'var(--control-h-md)',
    lg: 'var(--control-h-lg)',
  };
  const pads = { sm: '0 10px', md: '0 14px', lg: '0 18px' };
  const fs = { sm: 'var(--fs-xs)', md: 'var(--fs-sm)', lg: 'var(--fs-base)' };

  const variants = {
    primary: {
      background: 'var(--primary)',
      color: 'var(--text-on-solid)',
      border: '1px solid var(--primary)',
    },
    secondary: {
      background: 'var(--surface-card)',
      color: 'var(--text-body)',
      border: '1px solid var(--border-default)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-body)',
      border: '1px solid transparent',
    },
    subtle: {
      background: 'var(--primary-soft)',
      color: 'var(--primary-hover)',
      border: '1px solid var(--primary-soft-border)',
    },
    danger: {
      background: 'var(--red-500)',
      color: 'var(--text-on-solid)',
      border: '1px solid var(--red-500)',
    },
  };

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    height: heights[size],
    padding: pads[size],
    width: fullWidth ? '100%' : 'auto',
    font: 'inherit',
    fontFamily: 'var(--font-sans)',
    fontSize: fs[size],
    fontWeight: 'var(--fw-medium)',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    borderRadius: 'var(--radius-md)',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'var(--transition-control)',
    userSelect: 'none',
    ...variants[variant],
    ...style,
  };

  return (
    <button
      type={type}
      className={`swim-btn swim-btn--${variant}`}
      style={base}
      disabled={disabled || loading}
      onClick={onClick}
      {...rest}
    >
      {loading && <Spinner />}
      {!loading && iconLeft}
      {children != null && <span>{children}</span>}
      {!loading && iconRight}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 13,
        height: 13,
        borderRadius: '50%',
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        display: 'inline-block',
        animation: 'swim-spin 0.6s linear infinite',
      }}
    />
  );
}
