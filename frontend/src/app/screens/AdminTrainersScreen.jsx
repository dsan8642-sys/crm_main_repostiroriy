import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../../api.js'
import { BusyBanner } from '../runtime.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => `${today().slice(0, 8)}01`
const money = (minor = 0, currency = 'PLN') => `${(Number(minor) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ${currency}`

export function createAdminTrainersScreen(components, reloadRoleData) {
  const { Table, StatusPill, Avatar, Button, Banner, Input, Badge } = components

  return function ApiAdminTrainers({ go }) {
    const rows = globalThis.AdminData?.trainers || []
    const groups = globalThis.AdminData?.groups || []
    const sessions = globalThis.AdminData?.sessions || []
    const [selected, setSelected] = useState(null)
    const [tab, setTab] = useState('profile')
    const [creating, setCreating] = useState(false)
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', username: '', isActive: true })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const [payroll, setPayroll] = useState({ schemes: [], rules: [], assignments: [], periods: [] })
    const [period, setPeriod] = useState({ dateFrom: monthStart(), dateTo: today(), location: '' })
    const [rule, setRule] = useState({ schemeId: '', sessionType: 'group', baseAmount: '', threshold: '0', extraAmount: '' })

    const trainerGroups = useMemo(() => groups.filter((group) => String(group.defaultTrainerId) === String(selected?.trainerId)), [groups, selected])
    const trainerSessions = useMemo(() => sessions.filter((session) => String(session.trainerId) === String(selected?.trainerId)), [sessions, selected])
    const trainerAssignments = payroll.assignments.filter((item) => String(item.trainer_id) === String(selected?.trainerId))
    const trainerTotals = payroll.periods.map((item) => ({ ...item, total: item.totals_by_trainer?.find((row) => String(row.trainer_id) === String(selected?.trainerId)) }))
      .filter((item) => item.total)

    useEffect(() => {
      if (!selected || tab !== 'payroll') return
      let active = true
      Promise.all([
        api.get('/api/admin/payroll/schemes/'),
        api.get('/api/admin/payroll/rules/'),
        api.get(`/api/admin/payroll/assignments/?trainer_id=${selected.trainerId}`),
        api.get('/api/admin/payroll/periods/'),
      ]).then(([schemes, rules, assignments, periods]) => {
        if (!active) return
        setPayroll({ schemes: schemes.schemes || [], rules: rules.rules || [], assignments: assignments.assignments || [], periods: periods.periods || [] })
      }).catch((err) => active && setError(err.message))
      return () => { active = false }
    }, [selected, tab])

    function openTrainer(row) {
      const parts = String(row.name || '').trim().split(/\s+/)
      setSelected(row)
      setTab('profile')
      setEditing(false)
      setForm({ firstName: parts[0] || '', lastName: parts.slice(1).join(' '), email: row.email || '', phone: row.phone || '', username: row.username || '', isActive: row.active })
    }

    async function saveTrainer(isNew = false) {
      setBusy(true); setError(null)
      try {
        const payload = { trainer: { first_name: form.firstName, last_name: form.lastName, email: form.email, phone: form.phone, username: form.username || form.email || form.phone, is_active: form.isActive } }
        if (isNew) await api.post('/api/admin/trainers/', payload)
        else await api.post(`/api/admin/trainers/${selected.trainerId}/`, payload)
        setMessage(isNew ? 'Тренер создан.' : 'Профиль тренера обновлён.')
        setCreating(false); setEditing(false)
        await reloadRoleData?.('admin')
      } catch (err) { setError(err.message) } finally { setBusy(false) }
    }

    async function createSchemeAndRule() {
      setBusy(true); setError(null)
      try {
        let schemeId = rule.schemeId
        if (!schemeId) {
          const scheme = await api.post('/api/admin/payroll/schemes/', { name: `Ставки: ${selected.name}`, location: '' })
          schemeId = scheme.id
          await api.post('/api/admin/payroll/assignments/', { trainer_id: selected.trainerId, scheme_id: schemeId, effective_from: today() })
        }
        await api.post('/api/admin/payroll/rules/', {
          scheme_id: schemeId,
          session_type: rule.sessionType,
          rule_type: rule.sessionType,
          base_amount_minor: Math.round(Number(rule.baseAmount || 0) * 100),
          currency: 'PLN',
          min_clients_threshold: rule.sessionType === 'group' ? Number(rule.threshold || 0) : null,
          extra_client_amount_minor: rule.sessionType === 'group' ? Math.round(Number(rule.extraAmount || 0) * 100) : null,
        })
        setMessage('Ставка сохранена и назначена тренеру.')
        setRule((current) => ({ ...current, schemeId, baseAmount: '', extraAmount: '' }))
        const [rulesPayload, assignmentsPayload] = await Promise.all([
          api.get('/api/admin/payroll/rules/'),
          api.get(`/api/admin/payroll/assignments/?trainer_id=${selected.trainerId}`),
        ])
        setPayroll((current) => ({ ...current, rules: rulesPayload.rules || [], assignments: assignmentsPayload.assignments || [] }))
      } catch (err) { setError(err.message) } finally { setBusy(false) }
    }

    async function calculatePayroll() {
      setBusy(true); setError(null)
      try {
        const result = await api.post('/api/admin/payroll/periods/', { date_from: period.dateFrom, date_to: period.dateTo, location: period.location })
        setMessage(`Расчёт создан: ${money(result.summary?.total_amount_minor, result.summary?.currency)}.`)
        setPayroll((current) => ({ ...current, periods: [result, ...current.periods.filter((item) => item.id !== result.id)] }))
      } catch (err) { setError(err.message) } finally { setBusy(false) }
    }

    const editor = (
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{creating ? 'Новый тренер' : 'Редактирование профиля'}</div>
        <div className="ops-form-grid">
          <Input label="Имя" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          <Input label="Фамилия" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          <Input label="Логин" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          <Input label="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <Input label="Телефон" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          <label className="ops-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Активен</label>
        </div>
        <div className="ops-button-row"><Button variant="primary" disabled={busy} onClick={() => saveTrainer(creating)}>Сохранить</Button><Button variant="secondary" onClick={() => { setCreating(false); setEditing(false) }}>Отмена</Button></div>
      </div>
    )

    return (
      <div className="page page-wide">
        <div className="page-head"><div><h2 className="page-title">Тренеры</h2><p className="page-desc">Профили, расписание, группы и расчёт зарплаты.</p></div><Button variant="primary" onClick={() => { setCreating(true); setSelected(null); setForm({ firstName: '', lastName: '', email: '', phone: '', username: '', isActive: true }) }}>Новый тренер</Button></div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Выполняю операцию...</BusyBanner>
        {creating && editor}

        {selected && !creating && (
          <section className="card ops-entity-card" aria-label={`Профиль тренера ${selected.name}`}>
            <div className="ops-entity-head"><div className="ops-entity-person"><Avatar name={selected.name} size={44} /><div><h3>{selected.name}</h3><div className="muted">{selected.email || 'Email не указан'} · {selected.phone || 'Телефон не указан'}</div></div></div><div className="ops-button-row"><StatusPill status={selected.active ? 'active' : 'inactive'} /><Button variant="secondary" onClick={() => setEditing((value) => !value)}>Редактировать</Button><Button variant="subtle" onClick={() => setSelected(null)}>Закрыть</Button></div></div>
            <div className="ops-tabs" role="tablist">{[['profile', 'Обзор'], ['schedule', `Расписание ${trainerSessions.length}`], ['payroll', 'Зарплата и ставки']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
            {editing && editor}
            {tab === 'profile' && <div className="ops-detail-grid"><div><div className="eyebrow">Группы</div>{trainerGroups.map((group) => <button key={group.id} className="ops-detail-row" type="button" onClick={() => go?.('groups', { groupId: group.groupId })}><strong>{group.name}</strong><span>{group.students} участников</span></button>)}{!trainerGroups.length && <div className="empty">Назначенных групп нет</div>}</div><div><div className="eyebrow">Ближайшие занятия</div>{trainerSessions.slice(0, 5).map((session) => <button key={session.id} type="button" className="ops-detail-row" onClick={() => go?.('attendance', { sessionId: session.sessionId })}><strong>{session.date} · {session.start}</strong><span>{session.group} · {session.location}</span></button>)}{!trainerSessions.length && <div className="empty">Занятий нет</div>}</div></div>}
            {tab === 'schedule' && <div className="ops-card-list">{trainerSessions.map((session) => <button key={session.id} type="button" className="ops-session-tile" onClick={() => go?.('attendance', { sessionId: session.sessionId })}><span><strong>{session.date} · {session.start}-{session.end}</strong><small>{session.group} · {session.location}</small></span><Badge tone={session.isCancelled ? 'danger' : 'primary'}>{session.isCancelled ? 'Отменено' : 'Открыть занятие'}</Badge></button>)}{!trainerSessions.length && <div className="empty">В расписании тренера пока нет занятий.</div>}</div>}
            {tab === 'payroll' && <div className="ops-detail-grid">
              <div><div className="eyebrow">Ставки по типам занятий</div><div className="ops-form-stack"><label>Схема<select value={rule.schemeId} onChange={(event) => setRule({ ...rule, schemeId: event.target.value })}><option value="">Создать схему для тренера</option>{payroll.schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.name}</option>)}</select></label><label>Тип занятия<select value={rule.sessionType} onChange={(event) => setRule({ ...rule, sessionType: event.target.value })}><option value="group">Групповое</option><option value="individual">Индивидуальное</option><option value="split">Сплит для двоих</option></select></label><Input label="Базовая сумма, PLN" value={rule.baseAmount} onChange={(event) => setRule({ ...rule, baseAmount: event.target.value })} />{rule.sessionType === 'group' && <><Input label="Порог клиентов" value={rule.threshold} onChange={(event) => setRule({ ...rule, threshold: event.target.value })} /><Input label="За каждого сверх порога, PLN" value={rule.extraAmount} onChange={(event) => setRule({ ...rule, extraAmount: event.target.value })} /></>}<Button variant="primary" disabled={busy || !rule.baseAmount} onClick={createSchemeAndRule}>Сохранить ставку</Button></div>{payroll.rules.filter((item) => trainerAssignments.some((assignment) => assignment.scheme_id === item.scheme_id)).map((item) => <div className="ops-detail-row" key={item.id}><strong>{{ group: 'Групповое', individual: 'Индивидуальное', split: 'Сплит' }[item.session_type]}</strong><span>{money(item.base_amount_minor, item.currency)}{item.session_type === 'group' ? ` + ${money(item.extra_client_amount_minor, item.currency)} после ${item.min_clients_threshold}` : ''}</span></div>)}</div>
              <div><div className="eyebrow">Рассчитать зарплату</div><div className="ops-form-stack"><Input label="С даты" value={period.dateFrom} onChange={(event) => setPeriod({ ...period, dateFrom: event.target.value })} /><Input label="По дату" value={period.dateTo} onChange={(event) => setPeriod({ ...period, dateTo: event.target.value })} /><Input label="Локация (необязательно)" value={period.location} onChange={(event) => setPeriod({ ...period, location: event.target.value })} /><Button variant="primary" disabled={busy} onClick={calculatePayroll}>Рассчитать период</Button></div>{trainerTotals.map((item) => <div className="ops-detail-row" key={item.id}><strong>{item.date_from} - {item.date_to}</strong><span>{money(item.total.total_amount_minor, item.total.currency)}</span></div>)}</div>
            </div>}
          </section>
        )}

        <Table rows={rows} emptyLabel="Тренеров пока нет" columns={[
          { key: 'name', header: 'Тренер', render: (row) => <button type="button" className="ops-link-button" onClick={() => openTrainer(row)}><Avatar name={row.name} size={28} /><span className="strong">{row.name}</span></button> },
          { key: 'email', header: 'Email', muted: true, render: (row) => row.email || '-' },
          { key: 'phone', header: 'Телефон', muted: true, render: (row) => <span className="mono">{row.phone || '-'}</span> },
          { key: 'groups', header: 'Группы', align: 'right', width: 90, render: (row) => <button type="button" className="ops-count-button" onClick={() => openTrainer(row)}>{row.groups}</button> },
          { key: 'active', header: 'Статус', width: 110, render: (row) => <StatusPill status={row.active ? 'active' : 'inactive'} size="sm" /> },
          { key: 'act', header: '', width: 90, render: (row) => <Button size="sm" variant="subtle" onClick={() => openTrainer(row)}>Профиль</Button> },
        ]} />
      </div>
    )
  }
}
