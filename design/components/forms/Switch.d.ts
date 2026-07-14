import React from 'react';
export interface SwitchProps {
  checked?: boolean;
  disabled?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  label?: React.ReactNode;
  id?: string;
  style?: React.CSSProperties;
}
/** On/off toggle for settings and RODO consent channels. */
export function Switch(props: SwitchProps): JSX.Element;
