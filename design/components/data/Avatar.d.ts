import React from 'react';
export interface AvatarProps {
  /** Full name; initials + colour are derived from it. */
  name: string;
  /** Diameter in px. Default 32. */
  size?: number;
  /** Adds a coloured ring (use to distinguish trainers/parents). */
  kind?: string;
  style?: React.CSSProperties;
}
/** Deterministic initials chip for children, parents and trainers (no photos). */
export function Avatar(props: AvatarProps): JSX.Element;
