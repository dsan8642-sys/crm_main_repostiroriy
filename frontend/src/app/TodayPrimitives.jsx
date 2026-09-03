import React from 'react'

export function TodaySessionCard({
  Button,
  eyebrow,
  title,
  detail,
  meta,
  icon,
  actionLabel,
  onOpen,
  emptyTitle,
  emptyDetail,
}) {
  const hasSession = Boolean(title)
  return (
    <section className={`ops-today-session${hasSession ? '' : ' is-empty'}`}>
      <div className="ops-today-session__icon" aria-hidden="true">{icon}</div>
      <div className="ops-today-session__body">
        <div className="eyebrow">{eyebrow}</div>
        <h2>{hasSession ? title : emptyTitle}</h2>
        <p>{hasSession ? detail : emptyDetail}</p>
        {hasSession && meta && <div className="ops-today-session__meta">{meta}</div>}
      </div>
      {hasSession && (
        <div className="ops-today-session__action">
          <Button variant="primary" onClick={onOpen}>{actionLabel}</Button>
        </div>
      )}
    </section>
  )
}

export function QuickActions({ label, actions }) {
  return (
    <section className="ops-quick-actions" aria-label={label}>
      <div className="eyebrow" aria-hidden="true">&nbsp;</div>
      <div className="ops-quick-actions__grid">
        {actions.map((action) => (
          <button key={action.label} type="button" onClick={action.onClick}>
            <span aria-hidden="true">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function CompactStatusRow({ items, emptyLabel }) {
  if (!items.length) return <p className="ops-today-empty">{emptyLabel}</p>
  return (
    <div className="ops-today-status-list">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={item.onClick}>
          <span>{item.primary}</span>
          <small>{item.secondary}</small>
        </button>
      ))}
    </div>
  )
}

export function AttendanceSaveStatus({ busy, savingText, savedText }) {
  return <p className={`ops-attendance-save-status${busy ? ' is-saving' : ''}`} role="status" aria-live="polite"><span aria-hidden="true">{busy ? '…' : '✓'}</span>{busy ? savingText : savedText}</p>
}
