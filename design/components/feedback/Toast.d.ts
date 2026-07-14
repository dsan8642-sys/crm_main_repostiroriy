import React from 'react';
export interface ToastProps {
  children?: React.ReactNode;
  title?: React.ReactNode;
  tone?: 'success' | 'danger' | 'info';
  onClose?: () => void;
  style?: React.CSSProperties;
}
/** Transient confirmation/error toast (presentational; caller manages queue). */
export function Toast(props: ToastProps): JSX.Element;
