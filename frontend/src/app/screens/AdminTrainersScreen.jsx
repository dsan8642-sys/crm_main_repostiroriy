import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage } from '../../api.js'
import { clearFieldError, fieldErrorsFromApi, focusFirstFieldError, formErrorMessage } from '../formErrors.js'
import { BusyBanner } from '../runtime.jsx'
import { FormModal } from '../FormModal.jsx'
import { DateField } from '../DateTimeField.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { AccessButtons, AccessCodeCard } from '../AccessControls.jsx'
import { scheduleColorStyle } from '../schedulePalette.js'
import { validIsoDate } from '../scheduleContracts.js'

const TRAINER_FIELD_IDS = {
  firstName: 'admin-trainer-firstName', lastName: 'admin-trainer-lastName',
  username: 'admin-trainer-username', email: 'admin-trainer-email',
  phone: 'admin-trainer-phone', isActive: 'admin-trainer-active',
}
const RULE_FIELD_IDS = {
  schemeId: 'admin-trainer-payroll-scheme', sessionType: 'admin-trainer-payroll-session-type',
  baseAmount: 'admin-trainer-payroll-base', threshold: 'admin-trainer-payroll-threshold',
  extraAmount: 'admin-trainer-payroll-extra',
}
const PERIOD_FIELD_IDS = {
  dateFrom: 'admin-trainer-payroll-date-from',
  dateTo: 'admin-trainer-payroll-date-to', location: 'admin-trainer-payroll-location',
}

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => `${today().slice(0, 8)}01`
const money = (minor = 0, currency = 'PLN') => `${(Number(minor) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ${currency}`

export function createAdminTrainersScreen(components, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Avatar, Button, Banner, Input, Badge, Select, Checkbox } = components

  return function ApiAdminTrainers({ go }) {
    const rows = adminData.trainers || []
    const groups = adminData.groups || []
    const sessions = adminData.sessions || []
    const [selected, setSelected] = useState(null)
    const [tab, setTab] = useState('profile')
    const [creating, setCreating] = useState(false)
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', username: '', isActive: true })
    const [formBaseline, setFormBaseline] = useState(null)
    const [fieldErrors, setFieldErrors] = useState({})
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const [accessInfo, setAccessInfo] = useState(null)
    const [payroll, setPayroll] = useState({ schemes: [], rules: [], assignments: [], periods: [] })
    const [period, setPeriod] = useState({ dateFrom: monthStart(), dateTo: today(), location: '' })
    const [periodErrors, setPeriodErrors] = useState({})
    const [rule, setRule] = useState({ schemeId: '', sessionType: 'group', baseAmount: '', threshold: '0', extraAmount: '' })
    const [ruleErrors, setRuleErrors] = useState({})
    const [payrollAction, setPayrollAction] = useState(null)
    const [payrollBaseline, setPayrollBaseline] = useState(null)

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
      }).catch((err) => active && setError(apiErrorMessage(err, 'Не удалось загрузить расчёты тренера.')))
      return () => { active = false }
    }, [selected, tab])

    function openTrainer(row) {
      const parts = String(row.name || '').trim().split(/\s+/)
      setSelected(row)
      setTab('profile')
      setEditing(false)
      setAccessInfo(null)
      setFieldErrors({})
      const next = { firstName: parts[0] || '', lastName: parts.slice(1).join(' '), email: row.email || '', phone: row.phone || '', username: row.username || '', isActive: row.active }
      setForm(next)
      setFormBaseline(next)
    }

    async function saveTrainer(isNew = false) {
      setBusy(true); setError(null)
      setFieldErrors({})
      try {
        const payload = { trainer: { first_name: form.firstName, last_name: form.lastName, email: form.email, phone: form.phone, username: form.username || form.email, is_active: form.isActive } }
        if (isNew) await api.post('/api/admin/trainers/', payload)
        else await api.post(`/api/admin/trainers/${selected.trainerId}/`, payload)
        setMessage(isNew ? 'Тренер создан.' : 'Профиль тренера обновлён.')
        setCreating(false); setEditing(false)
        setFormBaseline(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, {
          'trainer.first_name': 'firstName',
          'trainer.last_name': 'lastName',
          'trainer.email': 'email',
          'trainer.phone': 'phone',
          'trainer.username': 'username',
          'trainer.is_active': 'isActive',
        })
        setFieldErrors(nextErrors)
        setError(formErrorMessage(err, 'Не удалось сохранить тренера.'))
        focusFirstFieldError(nextErrors, TRAINER_FIELD_IDS)
      } finally { setBusy(false) }
    }

    function updateTrainerForm(field, value) {
      setFieldErrors((current) => clearFieldError(current, field))
      setForm((current) => ({ ...current, [field]: value }))
    }

    function updateRule(field, value) {
      setRule((current) => ({ ...current, [field]: value }))
      setRuleErrors((current) => clearFieldError(current, field))
    }

    function updatePeriod(field, value) {
      setPeriod((current) => ({ ...current, [field]: value }))
      setPeriodErrors((current) => clearFieldError(current, field))
    }

    async function createSchemeAndRule() {
      const nextErrors = {}
      const baseAmount = Number(String(rule.baseAmount || '').replace(',', '.'))
      const threshold = Number(rule.threshold)
      const extraAmount = Number(String(rule.extraAmount || '').replace(',', '.'))
      if (!Number.isFinite(baseAmount) || baseAmount < 0) nextErrors.baseAmount = 'Введите неотрицательную базовую сумму.'
      if (rule.sessionType === 'group' && (!Number.isInteger(threshold) || threshold < 0)) nextErrors.threshold = 'Введите целое число не меньше нуля.'
      if (rule.sessionType === 'group' && (!Number.isFinite(extraAmount) || extraAmount < 0)) nextErrors.extraAmount = 'Введите неотрицательную доплату.'
      if (Object.keys(nextErrors).length) {
        setRuleErrors(nextErrors); setError(null)
        focusFirstFieldError(nextErrors, RULE_FIELD_IDS)
        return
      }
      setBusy(true); setError(null); setRuleErrors({})
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
          base_amount_minor: Math.round(baseAmount * 100),
          currency: 'PLN',
          min_clients_threshold: rule.sessionType === 'group' ? threshold : null,
          extra_client_amount_minor: rule.sessionType === 'group' ? Math.round(extraAmount * 100) : null,
        })
        setMessage('Ставка сохранена и назначена тренеру.')
        setRule((current) => ({ ...current, schemeId, baseAmount: '', extraAmount: '' }))
        setPayrollAction(null)
        setPayrollBaseline(null)
        const [rulesPayload, assignmentsPayload] = await Promise.all([
          api.get('/api/admin/payroll/rules/'),
          api.get(`/api/admin/payroll/assignments/?trainer_id=${selected.trainerId}`),
        ])
        setPayroll((current) => ({ ...current, rules: rulesPayload.rules || [], assignments: assignmentsPayload.assignments || [] }))
      } catch (err) {
        const nextFieldErrors = fieldErrorsFromApi(err, {
          scheme_id: 'schemeId', session_type: 'sessionType', rule_type: 'sessionType',
          base_amount_minor: 'baseAmount', min_clients_threshold: 'threshold',
          extra_client_amount_minor: 'extraAmount',
        })
        setRuleErrors(nextFieldErrors)
        setError(formErrorMessage(err, 'Не удалось сохранить ставку.'))
        focusFirstFieldError(nextFieldErrors, RULE_FIELD_IDS)
      } finally { setBusy(false) }
    }

    async function calculatePayroll() {
      const nextErrors = {}
      if (!validIsoDate(period.dateFrom)) nextErrors.dateFrom = 'Введите начальную дату.'
      if (!validIsoDate(period.dateTo)) nextErrors.dateTo = 'Введите конечную дату.'
      if (validIsoDate(period.dateFrom) && validIsoDate(period.dateTo) && period.dateTo < period.dateFrom) nextErrors.dateTo = 'Конечная дата не может быть раньше начальной.'
      if (Object.keys(nextErrors).length) {
        setPeriodErrors(nextErrors); setError(null)
        focusFirstFieldError(nextErrors, PERIOD_FIELD_IDS)
        return
      }
      setBusy(true); setError(null); setPeriodErrors({})
      try {
        const result = await api.post('/api/admin/payroll/periods/', { date_from: period.dateFrom, date_to: period.dateTo, location: period.location })
        setMessage(`Расчёт создан: ${money(result.summary?.total_amount_minor, result.summary?.currency)}.`)
        setPayroll((current) => ({ ...current, periods: [result, ...current.periods.filter((item) => item.id !== result.id)] }))
        setPayrollAction(null)
        setPayrollBaseline(null)
      } catch (err) {
        const nextFieldErrors = fieldErrorsFromApi(err, {
          date_from: 'dateFrom', date_to: 'dateTo', location: 'location',
        })
        setPeriodErrors(nextFieldErrors)
        setError(formErrorMessage(err, 'Не удалось рассчитать зарплату.'))
        focusFirstFieldError(nextFieldErrors, PERIOD_FIELD_IDS)
      } finally { setBusy(false) }
    }

    async function accessAction(action) {
      if (!selected) return
      setBusy(true); setError(null); setAccessInfo(null)
      try {
        const payload = await api.post(`/api/admin/trainers/${selected.trainerId}/access/${action}/`)
        if (action === 'revoke') {
          setSelected((current) => ({ ...current, portalAccess: 'revoked' }))
          setMessage('Portal-доступ тренера отозван. Рабочий профиль остался активным.')
        } else {
          setAccessInfo(payload)
          setSelected((current) => ({ ...current, accessActivated: true, portalAccess: 'active' }))
        }
        await reloadRoleData?.('admin')
      } catch (err) { setError(apiErrorMessage(err, 'Не удалось изменить доступ тренера.')) } finally { setBusy(false) }
    }

    const editor = (
      <>
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <div className="ops-form-grid">
          <Input id={TRAINER_FIELD_IDS.firstName} label="Имя" value={form.firstName} error={fieldErrors.firstName} onChange={(event) => updateTrainerForm('firstName', event.target.value)} />
          <Input id={TRAINER_FIELD_IDS.lastName} label="Фамилия" value={form.lastName} error={fieldErrors.lastName} onChange={(event) => updateTrainerForm('lastName', event.target.value)} />
          <Input id={TRAINER_FIELD_IDS.username} label="Логин" value={form.username} error={fieldErrors.username} onChange={(event) => updateTrainerForm('username', event.target.value)} />
          <Input id={TRAINER_FIELD_IDS.email} label="Email" value={form.email} error={fieldErrors.email} onChange={(event) => updateTrainerForm('email', event.target.value)} />
          <Input id={TRAINER_FIELD_IDS.phone} label="Телефон" value={form.phone} error={fieldErrors.phone} onChange={(event) => updateTrainerForm('phone', event.target.value)} />
          <Checkbox id={TRAINER_FIELD_IDS.isActive} label="Активен" checked={form.isActive} error={fieldErrors.isActive} onChange={(event) => updateTrainerForm('isActive', event.target.checked)} />
        </div>
      </>
    )

    return (
      <div className="page page-wide">
        <div className="page-head"><div><h1 className="page-title">Тренеры</h1><p className="page-desc">Профили, расписание, группы и расчёт зарплаты.</p></div><Button variant="primary" onClick={() => { const next = { firstName: '', lastName: '', email: '', phone: '', username: '', isActive: true }; setCreating(true); setSelected(null); setFieldErrors({}); setForm(next); setFormBaseline(next) }}>Новый тренер</Button></div>
        <ToastNotice id="admin-trainer-result" message={message} />
        {error && !creating && !editing && !payrollAction && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Выполняю операцию...</BusyBanner>
        <FormModal open={creating || editing} title={creating ? 'Новый тренер' : 'Редактирование профиля'} size="lg" busy={busy} dirty={Boolean(formBaseline) && JSON.stringify(form) !== JSON.stringify(formBaseline)} onRequestClose={() => { if (formBaseline) setForm(formBaseline); setCreating(false); setEditing(false); setFormBaseline(null); setFieldErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>Отмена</Button><Button variant="primary" disabled={busy} onClick={() => saveTrainer(creating)}>Сохранить</Button></>}>
          {editor}
        </FormModal>

        {selected && !creating && (
          <section className="card ops-entity-card" aria-label={`Профиль тренера ${selected.name}`}>
            <div className="ops-entity-head"><div className="ops-entity-person"><Avatar name={selected.name} size={44} /><div><h3>{selected.name}</h3><div className="muted">{selected.email || 'Email не указан'} · {selected.phone || 'Телефон не указан'}</div></div></div><div className="ops-button-row"><StatusPill status={selected.active ? 'active' : 'inactive'} />{selected.active && <AccessButtons Button={Button} portalAccess={selected.portalAccess} accessActivated={selected.accessActivated} busy={busy} onAction={accessAction} />}<Button variant="secondary" onClick={() => { setEditing(true); setFormBaseline({ ...form }) }}>Редактировать</Button><Button variant="subtle" onClick={() => setSelected(null)}>Закрыть</Button></div></div>
            <AccessCodeCard info={accessInfo} Button={Button} />
            <div className="ops-tabs" role="tablist">{[['profile', 'Обзор'], ['schedule', `Расписание ${trainerSessions.length}`], ['payroll', 'Зарплата и ставки']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
            {tab === 'profile' && <div className="ops-detail-grid"><div><div className="eyebrow">Группы</div>{trainerGroups.map((group) => <button key={group.id} className="ops-detail-row" type="button" onClick={() => go?.('groups', { groupId: group.groupId })}><strong>{group.name}</strong><span>{group.students} участников</span></button>)}{!trainerGroups.length && <div className="empty">Назначенных групп нет</div>}</div><div><div className="eyebrow">Ближайшие занятия</div>{trainerSessions.slice(0, 5).map((session) => <button key={session.id} type="button" className="ops-detail-row" onClick={() => go?.('attendance', { sessionId: session.sessionId })}><strong>{session.date} · {session.start}</strong><span>{session.group} · {session.location}</span></button>)}{!trainerSessions.length && <div className="empty">Занятий нет</div>}</div></div>}
            {tab === 'schedule' && <div className="ops-card-list">{trainerSessions.map((session) => <button key={session.id} type="button" className={`ops-session-tile${session.isCancelled ? ' is-cancelled' : ''}`} data-color-key={session.colorKey} style={scheduleColorStyle(session.colorKey)} onClick={() => go?.('attendance', { sessionId: session.sessionId })}><span><strong>{session.date} · {session.start}-{session.end}</strong><small>{session.group} · {session.location}</small></span><Badge tone={session.isCancelled ? 'danger' : 'primary'}>{session.isCancelled ? 'Отменено' : 'Открыть занятие'}</Badge></button>)}{!trainerSessions.length && <div className="empty">В расписании тренера пока нет занятий.</div>}</div>}
            {tab === 'payroll' && <div className="ops-detail-grid">
              <div><div className="ops-section-head"><div className="eyebrow">Ставки по типам занятий</div><Button size="sm" variant="primary" onClick={() => { setPayrollAction('rule'); setPayrollBaseline({ ...rule }) }}>Создать ставку</Button></div>{payroll.rules.filter((item) => trainerAssignments.some((assignment) => assignment.scheme_id === item.scheme_id)).map((item) => <div className="ops-detail-row" key={item.id}><strong>{{ group: 'Групповое', individual: 'Индивидуальное', split: 'Сплит' }[item.session_type]}</strong><span>{money(item.base_amount_minor, item.currency)}{item.session_type === 'group' ? ` + ${money(item.extra_client_amount_minor, item.currency)} после ${item.min_clients_threshold}` : ''}</span></div>)}</div>
              <div><div className="ops-section-head"><div className="eyebrow">Расчёты зарплаты</div><Button size="sm" variant="primary" onClick={() => { setPayrollAction('period'); setPayrollBaseline({ ...period }) }}>Рассчитать период</Button></div>{trainerTotals.map((item) => <div className="ops-detail-row" key={item.id}><strong>{item.date_from} - {item.date_to}</strong><span>{money(item.total.total_amount_minor, item.total.currency)}</span></div>)}</div>
            </div>}
          </section>
        )}

        <FormModal open={payrollAction === 'rule'} title="Ставка тренера" size="sm" busy={busy} dirty={Boolean(payrollBaseline) && JSON.stringify(rule) !== JSON.stringify(payrollBaseline)} onRequestClose={() => { if (payrollBaseline) setRule(payrollBaseline); setPayrollAction(null); setPayrollBaseline(null); setRuleErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>Отмена</Button><Button variant="primary" disabled={busy || !rule.baseAmount} onClick={createSchemeAndRule}>Сохранить ставку</Button></>}>
          {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
          <div className="ops-form-stack">
            <Select id={RULE_FIELD_IDS.schemeId} label="Схема" value={rule.schemeId} error={ruleErrors.schemeId} onChange={(event) => updateRule('schemeId', event.target.value)}><option value="">Создать схему для тренера</option>{payroll.schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.name}</option>)}</Select>
            <Select id={RULE_FIELD_IDS.sessionType} label="Тип занятия" value={rule.sessionType} error={ruleErrors.sessionType} onChange={(event) => updateRule('sessionType', event.target.value)}><option value="group">Групповое</option><option value="individual">Индивидуальное</option><option value="split">Сплит</option></Select>
            <Input id={RULE_FIELD_IDS.baseAmount} label="Базовая сумма, PLN" value={rule.baseAmount} error={ruleErrors.baseAmount} onChange={(event) => updateRule('baseAmount', event.target.value)} />
            {rule.sessionType === 'group' && <><Input id={RULE_FIELD_IDS.threshold} label="Порог клиентов" value={rule.threshold} error={ruleErrors.threshold} onChange={(event) => updateRule('threshold', event.target.value)} /><Input id={RULE_FIELD_IDS.extraAmount} label="За каждого сверх порога, PLN" value={rule.extraAmount} error={ruleErrors.extraAmount} onChange={(event) => updateRule('extraAmount', event.target.value)} /></>}
          </div>
        </FormModal>

        <FormModal open={payrollAction === 'period'} title="Рассчитать зарплату" size="sm" busy={busy} dirty={Boolean(payrollBaseline) && JSON.stringify(period) !== JSON.stringify(payrollBaseline)} onRequestClose={() => { if (payrollBaseline) setPeriod(payrollBaseline); setPayrollAction(null); setPayrollBaseline(null); setPeriodErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>Отмена</Button><Button variant="primary" disabled={busy} onClick={calculatePayroll}>Рассчитать</Button></>}>
          {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
          <div className="ops-form-stack">
            <DateField id={PERIOD_FIELD_IDS.dateFrom} label="С даты" value={period.dateFrom} error={periodErrors.dateFrom} onChange={(value) => updatePeriod('dateFrom', value)} />
            <DateField id={PERIOD_FIELD_IDS.dateTo} label="По дату" value={period.dateTo} error={periodErrors.dateTo} onChange={(value) => updatePeriod('dateTo', value)} />
            <Input id={PERIOD_FIELD_IDS.location} label="Локация (необязательно)" value={period.location} error={periodErrors.location} onChange={(event) => updatePeriod('location', event.target.value)} />
          </div>
        </FormModal>

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
