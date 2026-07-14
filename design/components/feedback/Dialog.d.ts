import React from 'react';
export interface DialogProps {
  open?: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  onClose?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' styles the confirm button for destructive actions. */
  tone?: 'primary' | 'danger';
  width?: number;
  hideFooter?: boolean;
  /** Shows an "irreversible action" warning header (RODO anonymise, cancel series). */
  irreversible?: boolean;
}
/** Modal for confirmations and short forms. */
export function Dialog(props: DialogProps): JSX.Element | null;
