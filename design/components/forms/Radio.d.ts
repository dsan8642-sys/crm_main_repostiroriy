import React from 'react';
export interface RadioProps {
  label?: React.ReactNode;
  checked?: boolean;
  disabled?: boolean;
  name?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  id?: string;
  style?: React.CSSProperties;
}
/** Single radio option; group by sharing `name`. */
export function Radio(props: RadioProps): JSX.Element;
