import React from 'react';
export interface CheckboxProps {
  label?: React.ReactNode;
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  id?: string;
  style?: React.CSSProperties;
}
/** Checkbox with optional indeterminate state (e.g. table "select all"). */
export function Checkbox(props: CheckboxProps): JSX.Element;
