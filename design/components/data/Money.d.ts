import React from 'react';
export interface MoneyProps {
  /** Amount in PLN (major units, e.g. 240 or -80.5). */
  amount: number;
  /** Currency suffix. Default 'zł'. */
  currency?: string;
  /** Colour by sign (debt red, credit green, zero grey) and show +/−. */
  signed?: boolean;
  muted?: boolean;
  size?: string;
  style?: React.CSSProperties;
}
/** Formats a PLN amount as "240,00 zł" in tabular mono numerals. */
export function Money(props: MoneyProps): JSX.Element;
