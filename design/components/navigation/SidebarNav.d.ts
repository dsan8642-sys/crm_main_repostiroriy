import React from 'react';
export interface NavItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  /** 'danger' renders the count as a solid red pill (e.g. debtors, errors). */
  countTone?: 'default' | 'danger';
  /** Group heading; items sharing a section are grouped in order. */
  section?: string;
}
/**
 * The app's left navigation rail with brand, grouped items and role footer.
 * @startingPoint section="Navigation" subtitle="App sidebar with grouped nav + counts" viewport="260x560"
 */
export interface SidebarNavProps {
  items: NavItem[];
  active: string;
  onSelect?: (key: string) => void;
  /** Short brand mark shown in the logo tile (default 'H2O'). */
  brand?: string;
  /** Product name (default 'SwimCRM'). */
  product?: string;
  /** Role caption under the product name (e.g. 'Administrator'). */
  roleLabel?: string;
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}
/** The app's left navigation rail with brand, grouped items and role footer. */
export function SidebarNav(props: SidebarNavProps): JSX.Element;
