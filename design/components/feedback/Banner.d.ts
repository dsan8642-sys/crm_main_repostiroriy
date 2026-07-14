import React from 'react';
export interface BannerProps {
  children?: React.ReactNode;
  title?: React.ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  icon?: React.ReactNode;
  onClose?: () => void;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}
/** Inline contextual message (validation, schedule conflict, on-review, RODO). */
export function Banner(props: BannerProps): JSX.Element;
