import React from 'react';

export type StatusKey =
  | 'present' | 'absent' | 'excused' | 'moved'
  | 'paid' | 'pending' | 'rejected' | 'overdue' | 'partial' | 'awaiting'
  | 'active' | 'frozen' | 'expired' | 'cancelled' | 'planned' | 'done' | 'inactive';

/**
 * The load-bearing status indicator for SwimCRM's critical states
 * (attendance, payments, subscriptions, sessions).
 * @startingPoint section="Data" subtitle="Status pills for every CRM state" viewport="700x150"
 */
export interface StatusPillProps {
  /** Predefined status carrying the correct Polish label + colour. */
  status?: StatusKey;
  /** Override the label (else derived from status). */
  label?: string;
  /** Override the tone (else derived from status). */
  tone?: string;
  /** For attendance statuses, append a "−1"/"0" lesson-consumption marker. */
  showConsumes?: boolean;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

/** Load-bearing status indicator for SwimCRM's critical states. */
export function StatusPill(props: StatusPillProps): JSX.Element;

/** Lookup table of status → { label, tone, consumes? }. */
export const STATUS: Record<StatusKey, { label: string; tone: string; consumes?: boolean }>;
