import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createClientScreens(components, icons, reloadRoleData) {
  const { Table, StatusPill, Money, Button, Banner, Avatar, Input } = components
  const I = icons

  function ChildButtons({ kid, setKid }) {
    const children = globalThis.ParentData?.children || []
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {children.map((child) => (
          <button key={child.id} type="button" className={child.id === kid ? 'on' : ''} onClick={() => setKid(child.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 6px', cursor: 'pointer', border: `1px solid ${child.id === kid ? 'var(--primary)' : 'var(--border-default)'}`, background: child.id === kid ? 'var(--primary-soft)' : 'var(--surface-card)', borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-sans)' }}>
            <Avatar name={child.name} size={26} />
            <span>{child.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>
    )
  }

  function Home({ kid, setKid, go }) {
    const data = globalThis.ParentData || {}
    const child = data.children?.find((item) => item.id === kid) || data.children?.[0]
    const next = child ? (data.schedule?.[child.id] || []).find((session) => session.status === 'planned') : null
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head">
          <div><h2 className="page-title">Главная</h2><p className="page-desc">Ближайшее занятие, абонемент и состояние оплаты.</p></div>
          <ChildButtons kid={child?.id || kid} setKid={setKid} />
        </div>
        {child?.balance < 0 && (
          <Banner tone="danger" title="Есть задолженность" style={{ marginBottom: 14 }} action={<Button size="sm" variant="subtle" onClick={() => go('payments')}>Перейти к платежам</Button>}>
            {child.name}: к оплате <strong>{Math.abs(child.balance).toLocaleString('ru-RU')} zl</strong>.
          </Banner>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <button type="button" className="card card-pad ops-action-card" onClick={() => go('schedule', { tab: next?.sessionId ? String(next.sessionId) : null })}>
            <div className="kpi-label"><span className="kpi-ico"><I.Calendar size={15} /></span>Следующее занятие</div>
            {next ? <><div className="strong" style={{ fontSize: 'var(--fs-lg)', margin: '4px 0 2px' }}>{next.date} · {next.start}</div><div className="muted">{next.group} · {next.trainer}</div></> : <div className="muted">Запланированных занятий нет.</div>}
          </button>
          <button type="button" className="card card-pad ops-action-card" onClick={() => go('subscription')}>
            <div className="kpi-label"><span className="kpi-ico"><I.Layers size={15} /></span>Абонемент</div>
            <div className="strong" style={{ fontSize: 'var(--fs-lg)', margin: '4px 0 2px' }}>{child?.sub || '-'}</div>
            <div className="muted">Осталось: {child?.subLeft == null ? '∞' : child.subLeft} · до {child?.subEnds || '-'}</div>
          </button>
          <button type="button" className="card card-pad ops-action-card" onClick={() => go('payments')}>
            <div className="kpi-label"><span className="kpi-ico"><I.Wallet size={15} /></span>Баланс</div>
            <Money amount={child?.balance || 0} signed size="var(--fs-lg)" />
          </button>
        </div>
      </div>
    )
  }

  function Schedule({ kid, setKid, initialTab }) {
    const rows = globalThis.ParentData?.schedule?.[kid] || []
    const [selectedId, setSelectedId] = useState(initialTab || null)
    useEffect(() => { if (initialTab) setSelectedId(initialTab) }, [initialTab])
    const selected = rows.find((row) => String(row.sessionId) === String(selectedId))
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><div><h2 className="page-title">Расписание</h2><p className="page-desc">Предстоящие и отменённые занятия.</p></div><ChildButtons kid={kid} setKid={setKid} /></div>
        {selected && <div className="card ops-entity-card"><div className="ops-entity-head"><div><div className="eyebrow">Детали занятия</div><h3>{selected.group}</h3></div><Button size="sm" variant="subtle" onClick={() => setSelectedId(null)}>Закрыть</Button></div><div className="ops-summary-grid"><div><span>Дата и время</span><strong>{selected.date} · {selected.start}-{selected.end}</strong></div><div><span>Тренер</span><strong>{selected.trainer}</strong></div><div><span>Место</span><strong>{selected.location}</strong></div><div><span>Списание</span><strong>{selected.deductsExpected ? '-1 занятие' : '0 занятий'}</strong></div></div><StatusPill status={selected.status} /></div>}
        <div className="ops-card-list">{rows.map((row) => <button type="button" className="ops-session-tile" key={row.id} onClick={() => setSelectedId(row.sessionId)}><span><strong>{row.date} · {row.start}-{row.end}</strong><small>{row.group} · {row.trainer} · {row.location}</small></span><span><StatusPill status={row.status} size="sm" /><small>Списание: {row.deductsExpected ? '-1' : '0'}</small></span></button>)}{!rows.length && <div className="empty">Занятий пока нет.</div>}</div>
      </div>
    )
  }

  function Payments({ kid }) {
    const [file, setFile] = useState(null)
    const [amount, setAmount] = useState('')
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const child = (globalThis.ParentData?.children || []).find((item) => item.id === kid)
    const charges = globalThis.ParentData?.charges || []
    const payments = globalThis.ParentData?.payments || []

    async function createTopUpRequest() {
      const amountNumber = Number(amount)
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        setError('Укажите сумму пополнения больше нуля.')
        return
      }
      if (!file) {
        setError('Приложите подтверждение банковского перевода: PDF, JPG или PNG.')
        return
      }
      setBusy(true)
      const formData = new FormData()
      if (child?.studentId) formData.set('student_id', child.studentId)
      formData.set('amount_minor', String(Math.round(amountNumber * 100)))
      formData.set('currency', 'PLN')
      formData.set('file', file)
      try {
        await api.postForm('/api/client/payments/top-up-requests/', formData)
        setMessage('Запрос отправлен администратору. Баланс изменится только после подтверждения.')
        setError(null)
        setFile(null)
        setAmount('')
        reloadRoleData?.('client')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><div><h2 className="page-title">Платежи</h2><p className="page-desc">Начисления, история операций и запросы на пополнение баланса.</p></div></div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Отправляю запрос на пополнение...</BusyBanner>
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow">Запрос на пополнение</div>
          <p className="muted" style={{ margin: '6px 0 14px' }}>Запрос не меняет баланс автоматически. Администратор проверит перевод, после чего сумма будет зачислена или запрос будет отклонён.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <Input label="Сумма пополнения" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="240.00" />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Файл подтверждения
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <Button variant="primary" loading={busy} disabled={busy} iconLeft={<I.Upload size={15} />} onClick={createTopUpRequest}>Отправить запрос</Button>
          </div>
        </div>
        <Table rows={charges} emptyLabel="Начислений нет" columns={[
          { key: 'desc', header: 'Начисление' },
          { key: 'child', header: 'Участник', muted: true },
          { key: 'due', header: 'Срок', muted: true },
          { key: 'amount', header: 'Сумма', align: 'right', render: (row) => <Money amount={row.amount} /> },
          { key: 'status', header: 'Статус', render: (row) => <StatusPill status={row.status} size="sm" /> },
        ]} />
        <div style={{ height: 16 }} />
        <Table rows={payments} emptyLabel="Платежей нет" columns={[
          { key: 'sourceLabel', header: 'Операция' },
          { key: 'child', header: 'Участник' },
          { key: 'date', header: 'Дата', muted: true },
          { key: 'method', header: 'Способ', muted: true },
          { key: 'amount', header: 'Сумма', align: 'right', render: (row) => <Money amount={row.amount} /> },
          { key: 'status', header: 'Статус', render: (row) => <StatusPill status={row.status} size="sm" /> },
          { key: 'effect', header: 'Баланс', muted: true, render: (row) => row.affectsBalance ? 'Зачислено' : 'Не влияет' },
        ]} />
      </div>
    )
  }

  function Subscription({ kid, setKid }) {
    const child = (globalThis.ParentData?.children || []).find((item) => item.id === kid)
    const subscription = child?.subscription
    return <div className="page" style={{ maxWidth: 900 }}><div className="page-head"><div><h2 className="page-title">Абонемент</h2><p className="page-desc">Срок действия, остаток занятий и льготный период.</p></div><ChildButtons kid={child?.id || kid} setKid={setKid} /></div>{subscription ? <><div className="card ops-entity-card"><div className="ops-entity-head"><div><div className="eyebrow">Текущий абонемент</div><h3>{subscription.type}</h3></div><StatusPill status={subscription.status} /></div><div className="ops-summary-grid"><div><span>Оформлен</span><strong>{formatDate(subscription.created_at)}</strong></div><div><span>Начало</span><strong>{formatDate(subscription.start_date)}</strong></div><div><span>Действует до</span><strong>{formatDate(subscription.effective_end_date)}</strong></div><div><span>Льготный период</span><strong>до {formatDate(subscription.grace_end_date)}</strong></div></div><div className="ops-inline-note">Осталось занятий: {subscription.remaining_sessions == null ? 'без лимита' : subscription.remaining_sessions}. После окончания доступ сохраняется только до +7 дней.</div></div><div className="card card-pad"><div className="eyebrow">История списаний и корректировок</div>{(subscription.ledger || []).map((entry) => <div className="ops-detail-row" key={entry.id}><strong>{entry.reason === 'attendance' ? 'Списание за занятие' : entry.reason}</strong><span>{entry.delta > 0 ? '+' : ''}{entry.delta} · {formatDate(entry.created_at)}{entry.note ? ` · ${entry.note}` : ''}</span></div>)}{!(subscription.ledger || []).length && <div className="empty">Списаний пока нет.</div>}</div></> : <div className="card card-pad empty">Активного абонемента нет. Обратитесь к администратору клуба.</div>}</div>
  }

  function History({ kid, setKid }) {
    const attendance = globalThis.ParentData?.attendance?.[kid] || []
    const child = (globalThis.ParentData?.children || []).find((item) => item.id === kid)
    const payments = (globalThis.ParentData?.payments || []).filter((payment) => !child?.studentId || payment.studentId === child.studentId)
    const [historyType, setHistoryType] = useState('all')
    const [days, setDays] = useState('90')
    const [selectedHistory, setSelectedHistory] = useState(null)
    const cutoff = new Date(Date.now() - Number(days || 36500) * 86400000)
    const visibleAttendance = attendance.filter((row) => new Date(row.date) >= cutoff)
    const visiblePayments = payments.filter((row) => new Date(row.date) >= cutoff)
    return (
      <div className="page page-wide">
        <div className="page-head"><div><h2 className="page-title">История</h2><p className="page-desc">Посещения и платежи выбранного участника.</p></div><ChildButtons kid={kid} setKid={setKid} /></div>
        <div className="toolbar"><div className="seg">{[['all', 'Всё'], ['attendance', 'Посещения'], ['payments', 'Платежи']].map(([value, label]) => <button key={value} type="button" className={historyType === value ? 'on' : ''} onClick={() => setHistoryType(value)}>{label}</button>)}</div><span className="spacer" /><label>Период <select value={days} onChange={(event) => setDays(event.target.value)}><option value="30">30 дней</option><option value="90">90 дней</option><option value="365">Год</option><option value="">Всё время</option></select></label></div>
        {selectedHistory && <div className="card card-pad" style={{ marginBottom: 14 }}><div className="ops-section-head"><div><div className="eyebrow">Детали операции</div><strong>{selectedHistory.label || selectedHistory.method}</strong></div><Button size="sm" variant="subtle" onClick={() => setSelectedHistory(null)}>Закрыть</Button></div><div className="muted">Дата: {selectedHistory.date} · сумма/списание и статус сохранены в истории.</div></div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 14 }}>
          {historyType !== 'payments' && <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Посещения</div>
            <Table rows={visibleAttendance} emptyLabel="Посещений пока нет" columns={[
              { key: 'date', header: 'Дата', muted: true },
              { key: 'label', header: 'Занятие', render: (row) => <button type="button" className="ops-link-button" onClick={() => setSelectedHistory(row)}><span className="strong">{row.label}</span></button> },
              { key: 'trainer', header: 'Тренер', muted: true },
              { key: 'status', header: 'Статус', render: (row) => <StatusPill status={row.status === 'rescheduled' ? 'moved' : row.status} size="sm" /> },
            ]} />
          </div>}
          {historyType !== 'attendance' && <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Платежи</div>
            <Table rows={visiblePayments} emptyLabel="Платежей пока нет" columns={[
              { key: 'date', header: 'Дата', muted: true },
              { key: 'method', header: 'Способ', render: (row) => <button type="button" className="ops-link-button" onClick={() => setSelectedHistory(row)}>{row.method}</button> },
              { key: 'amount', header: 'Сумма', align: 'right', render: (row) => <Money amount={row.amount} /> },
              { key: 'status', header: 'Статус', render: (row) => <StatusPill status={row.status} size="sm" /> },
            ]} />
          </div>}
        </div>
      </div>
    )
  }

  function Profile({ kid, setKid }) {
    const account = globalThis.ParentData?.account || {}
    const participants = globalThis.ParentData?.profileParticipants || []
    const [form, setForm] = useState({
      firstName: account.first_name || '',
      lastName: account.last_name || '',
      email: account.email || '',
      phone: account.phone || '',
      telegram: account.telegram_chat_id || '',
      language: account.preferred_language || 'ru',
    })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(false)
    const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

    useEffect(() => {
      setForm({
        firstName: account.first_name || '',
        lastName: account.last_name || '',
        email: account.email || '',
        phone: account.phone || '',
        telegram: account.telegram_chat_id || '',
        language: account.preferred_language || 'ru',
      })
    }, [account.first_name, account.last_name, account.email, account.phone, account.telegram_chat_id, account.preferred_language])

    async function saveProfile() {
      setBusy(true)
      try {
        await api.post('/api/client/profile/', {
          account: {
            first_name: form.firstName,
            last_name: form.lastName,
            email: form.email,
            phone: form.phone,
            telegram_chat_id: form.telegram,
            preferred_language: form.language,
          },
        })
        setMessage('Профиль сохранён.')
        setError(null)
        reloadRoleData?.('client')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="page page-wide">
        <div className="page-head"><div><h2 className="page-title">Профиль</h2><p className="page-desc">Контактные данные аккаунта и участники.</p></div><ChildButtons kid={kid} setKid={setKid} /></div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>Сохраняю профиль...</BusyBanner>
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: 10 }}>
            <Input label="Имя" value={form.firstName} onChange={(event) => update('firstName', event.target.value)} />
            <Input label="Фамилия" value={form.lastName} onChange={(event) => update('lastName', event.target.value)} />
            <Input label="Email" value={form.email} onChange={(event) => update('email', event.target.value)} />
            <Input label="Телефон" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
            <Input label="Telegram chat ID" value={form.telegram} onChange={(event) => update('telegram', event.target.value)} />
            <label>Язык интерфейса и уведомлений<select value={form.language} onChange={(event) => update('language', event.target.value)}><option value="ru">Русский</option><option value="pl">Polski</option><option value="en">English</option></select></label>
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="primary" loading={busy} disabled={busy} onClick={saveProfile}>Сохранить профиль</Button>
          </div>
        </div>
        <Table rows={participants} emptyLabel="Участников нет" columns={[
          { key: 'full_name', header: 'Участник', render: (row) => <button type="button" className="ops-link-button" onClick={() => { const child = (globalThis.ParentData?.children || []).find((item) => item.studentId === row.id); if (child) setKid(child.id) }}><Avatar name={row.full_name} size={28} /><span className="strong">{row.full_name}</span></button> },
          { key: 'birth_date', header: 'Дата рождения', muted: true, render: (row) => row.birth_date || '-' },
          { key: 'email', header: 'Email', muted: true, render: (row) => row.email || '-' },
          { key: 'group', header: 'Группа', render: (row) => row.group?.name || 'Индивидуально' },
          { key: 'status', header: 'Статус', render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
        ]} />
      </div>
    )
  }

  function Consents() {
    const rows = globalThis.ParentData?.consents || []
    const [localRows, setLocalRows] = useState(rows)
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busyType, setBusyType] = useState(null)
    const descriptions = {
      data: 'Разрешает хранить и обрабатывать данные, необходимые для оказания услуг клуба.',
      email: 'Разрешает получать сервисные и информационные сообщения по email.',
      sms: 'Разрешает получать уведомления и напоминания по SMS.',
      telegram: 'Разрешает получать уведомления в Telegram.',
    }

    useEffect(() => {
      setLocalRows(rows)
    }, [rows])

    async function setConsent(row, granted) {
      setBusyType(row.type)
      try {
        const saved = await api.post('/api/client/consents/', {
          type: row.type,
          granted,
          policy_version: row.policy_version || 'v1',
        })
        setLocalRows((current) => current.map((item) => item.type === row.type ? saved : item))
        setMessage('Согласие сохранено.')
        setError(null)
        reloadRoleData?.('client')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyType(null)
      }
    }

    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-head"><div><h2 className="page-title">Согласия</h2><p className="page-desc">Управление согласиями и каналами связи.</p></div></div>
        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busyType != null}>Сохраняю согласие...</BusyBanner>
        <div className="card" style={{ overflow: 'hidden' }}>
          {localRows.map((row, index) => (
            <div key={row.type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: index < localRows.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ flex: 1 }}>
                <div className="strong">{row.type_label || row.type}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{descriptions[row.type] || 'Управление согласием на выбранный канал связи.'}</div>
                <div className="muted" style={{ fontSize: 'var(--fs-2xs)', marginTop: 3 }}>Версия: {row.policy_version || 'не указана'} · выдано: {row.granted_at ? formatDate(row.granted_at) : '-'} · отозвано: {row.revoked_at ? formatDate(row.revoked_at) : '-'}</div>
              </div>
              <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" />
              <Button size="sm" loading={busyType === row.type} disabled={busyType != null} variant={row.is_active ? 'secondary' : 'primary'} onClick={() => setConsent(row, !row.is_active)}>
                {row.is_active ? 'Отозвать' : 'Подтвердить'}
              </Button>
            </div>
          ))}
          {localRows.length === 0 && <div className="muted" style={{ padding: 16 }}>Согласия пока не настроены.</div>}
        </div>
      </div>
    )
  }

  return { Home, Schedule, Payments, Subscription, History, Profile, Consents }
}
