import React from 'react';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Accessible label (also used as tooltip title). Required. */
  label: string;
  /** Icon glyph (e.g. a Lucide <svg>). */
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'danger';
}

/** Square icon-only button for toolbars and table row actions. */
export function IconButton(props: IconButtonProps): JSX.Element;
