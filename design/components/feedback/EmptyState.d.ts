import React from 'react';
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  style?: React.CSSProperties;
}
/** Calm empty / no-results / no-permission placeholder with a next action. */
export function EmptyState(props: EmptyStateProps): JSX.Element;
