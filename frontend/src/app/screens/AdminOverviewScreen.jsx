import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminOverviewScreen(components, icons, adminData = {}) {
  const { Money, Button, Banner, Badge } = components
  const I = icons

  function Kpi({ icon, label, value, sub, tone, onClick }) {
    return (
      <button type="button" className="kpi ops-kpi-button" onClick={onClick}>
        <div className="kpi-label"><span className="kpi-ico">{icon}</span>{label}</div>
        <div className="kpi-value" style={tone ? { color: tone } : null}>{value}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </button>
    )
  }

  return function ApiAdminOverview({ go }) {
    const data = adminData
    const sessions = data.sessions || []
    const pending = (data.payments || []).filter((payment) => payment.status === 'pending')
    const debtors = data.debtors || []
    const debtTotal = debtors.reduce((sum, row) => sum + Math.abs(row.balance || 0), 0)

    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Рабочий стол</h1>
            <p className="page-desc">Быстрый вход в ежедневные действия.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" iconLeft={<I.Calendar size={15} />} onClick={() => go('schedule')}>Расписание</Button>
            <Button variant="primary" iconLeft={<I.Cash size={15} />} onClick={() => go('payments')}>Платежи</Button>
          </div>
        </div>

        {pending.length > 0 && (
          <Banner tone="warning" title={`${pending.length} платежей ждут подтверждения`} style={{ marginBottom: 16 }}
            action={<Button size="sm" variant="subtle" onClick={() => go('payments', { tab: 'review' })}>Открыть</Button>}>
            Нажмите, чтобы подтвердить или отклонить платежи.
          </Banner>
        )}

        <div className="eyebrow" style={{ marginBottom: 10 }}>Быстрые переходы</div>
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <Kpi icon={<I.Calendar size={15} />} label="Занятия" value={sessions.length} sub="Сегодня и ближайшие" onClick={() => go('schedule', { tab: 'day' })} />
          <Kpi icon={<I.ClientFamily size={15} />} label="Клиенты" value={(data.clients || []).length} sub="Открыть базу" onClick={() => go('clients')} />
          <Kpi icon={<I.TrainerWhistle size={15} />} label="Тренеры" value={(data.trainers || []).filter((row) => row.active).length} sub="Открыть команду" onClick={() => go('trainers')} />
          <Kpi icon={<I.Alert size={15} />} label="Должники" value={debtors.length} sub={`${debtTotal.toLocaleString('pl-PL')} zl`} tone="var(--money-debt)" onClick={() => go('debtors')} />
        </div>

        <div className="eyebrow" style={{ marginBottom: 10 }}>Ближайшие занятия</div>
        <div className="card ops-upcoming-sessions">
          {sessions.slice(0, 8).map((session, index, list) => (
            <button
              key={session.id}
              type="button"
              className="ops-list-click-row ops-upcoming-session-row"
              onClick={() => go('attendance', { sessionId: session.sessionId })}
              style={{ borderBottom: index < list.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}
            >
              <span className="ops-upcoming-session-primary">
                <span className="mono ops-upcoming-session-time">{session.date} · {session.start}-{session.end}</span>
                <span className="strong ops-upcoming-session-name">{session.group}</span>
              </span>
              <span className="ops-upcoming-session-secondary">
                <span className="ops-upcoming-session-details">
                  <span className="muted ops-upcoming-session-trainer">{session.trainer}</span>
                  <span className="muted ops-upcoming-session-location">{session.location}</span>
                </span>
                <span className="ops-upcoming-session-status">
                  <Badge
                    tone={session.status === 'cancelled' ? 'danger' : 'primary'}
                    style={{ maxWidth: '100%', height: 'auto', minHeight: 20, whiteSpace: 'normal', textAlign: 'center' }}
                  >
                    {session.status === 'cancelled' ? 'Отменено' : 'Запланировано'}
                  </Badge>
                </span>
              </span>
            </button>
          ))}
          {sessions.length === 0 && (
            <button type="button" className="ops-empty-action" onClick={() => go('schedule')}>Нет занятий. Открыть расписание и создать занятие</button>
          )}
        </div>
      </div>
    )
  }
}

