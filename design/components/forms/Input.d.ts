import React from 'react';

/**
 * Labelled single-line text field.
 * @startingPoint section="Forms" subtitle="Text fields with label, hint, error, affixes" viewport="700x150"
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: string;
  /** Helper text under the field. */
  hint?: string;
  /** Error message; also turns the border/ring red. */
  error?: string;
  required?: boolean;
  /** Static content before the value (e.g. a currency symbol or icon). */
  prefix?: React.ReactNode;
  /** Static content after the value (e.g. "zł", "min"). */
  suffix?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  containerStyle?: React.CSSProperties;
}

/** Labelled single-line text field. */
export function Input(props: InputProps): JSX.Element;
export const labelStyle: React.CSSProperties;
