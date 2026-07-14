import React from 'react';
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  size?: 'sm' | 'md' | 'lg';
  containerStyle?: React.CSSProperties;
}
/** Native select styled to match Input, with a chevron affordance. */
export function Select(props: SelectProps): JSX.Element;
