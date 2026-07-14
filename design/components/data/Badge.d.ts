import React from 'react';
export type BadgeTone = 'neutral' | 'info' | 'primary' | 'success' | 'warning' | 'danger';
export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  /** Leading status dot. */
  dot?: boolean;
  /** Solid fill instead of soft tint (use for nav counts). */
  solid?: boolean;
  style?: React.CSSProperties;
}
/** Small label / count chip. */
export function Badge(props: BadgeProps): JSX.Element;
