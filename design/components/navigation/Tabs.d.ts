import React from 'react';
export interface TabItem {
  value: string;
  label: React.ReactNode;
  /** Optional count pill (e.g. items on review). */
  count?: number;
}
export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
/** Horizontal section switcher for detail views and filtered lists. */
export function Tabs(props: TabsProps): JSX.Element;
