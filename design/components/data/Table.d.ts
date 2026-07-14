import React from 'react';

export interface TableColumn<Row = any> {
  key: string;
  header: React.ReactNode;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  /** Mute the cell text colour. */
  muted?: boolean;
  /** Custom cell renderer; receives the row and its index. */
  render?: (row: Row, index: number) => React.ReactNode;
}

/**
 * Dense, bordered data table — the backbone of every CRM list view.
 * @startingPoint section="Data" subtitle="Column-driven data table with selection" viewport="900x360"
 */
export interface TableProps<Row = any> {
  columns?: TableColumn<Row>[];
  rows?: Row[];
  rowKey?: (row: Row, index: number) => string | number;
  onRowClick?: (row: Row) => void;
  selectable?: boolean;
  selectedIds?: (string | number)[];
  onToggleRow?: (id: string | number) => void;
  onToggleAll?: () => void;
  density?: 'compact' | 'default';
  emptyLabel?: string;
  stickyHeader?: boolean;
  /** Raw <thead>/<tbody> markup instead of columns/rows. */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Dense, bordered data table — the backbone of every CRM list view. */
export function Table<Row = any>(props: TableProps<Row>): JSX.Element;
