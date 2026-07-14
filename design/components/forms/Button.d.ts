import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Primary action control for SwimCRM.
 * @startingPoint section="Forms" subtitle="Buttons — 5 variants, 3 sizes" viewport="700x150"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. Default 'primary'. */
  variant?: ButtonVariant;
  /** Control height. Default 'md'. */
  size?: ButtonSize;
  /** Icon element rendered before the label. */
  iconLeft?: React.ReactNode;
  /** Icon element rendered after the label. */
  iconRight?: React.ReactNode;
  /** Show a spinner and block interaction. */
  loading?: boolean;
  /** Stretch to fill the container width. */
  fullWidth?: boolean;
}

/** Primary action control for SwimCRM. */
export function Button(props: ButtonProps): JSX.Element;
