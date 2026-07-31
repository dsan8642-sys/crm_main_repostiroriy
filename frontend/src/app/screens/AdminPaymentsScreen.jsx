import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'

export function createAdminPaymentsScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Money, Button, IconButton, Tabs, Banner, Dialog, Avatar, Input } = components
  const I = icons

  return function ApiAdminPayments({ go, initialTab }) {
    const participants = adminData.clients || []
    const subscriptionTypes = adminData.subscriptionTypes || []
    const [tab, setTab] = useState('review')
    const [methodFilter, setMethodFilter] = useState('')
    const [reject, setReject] = useState(null)
    const [confirm, setConfirm] = useState(null)
    const [editingPayment, setEditingPayment] = useState(null)
    const [paymentEditForm, setPaymentEditForm] = useState({ method: 'cash', comment: '' })
    const [rows, setRows] = useState(() => [...(adminData.payments || [])])
    const [subscriptions, setSubscriptions] = useState([])
    const [financeForm, setFinanceForm] = useState({
      participantId: participants[0]?.studentId || '',
      subscriptionTypeId: subscriptionTypes[0]?.typeId || '',
      subscriptionId: '',
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      chargeDescription: 'Ручное начисление',
      chargeAmount: '',
      paymentAmount: '',
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'cash',
      freezeStart: new Date().toISOString().slice(0, 10),
      freezeEnd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      freezeReason: '',
      adjustDelta: '1',
      adjustNote: '',
      createCharge: true,
    })
    const [subscriptionTypeForm, setSubscriptionTypeForm] = useState({
      name: '',
      price: '',
      currency: 'PLN',
      durationDays: '30',
      sessionsCount: '8',
      isUnlimited: false,
      isIndividual: false,
      isActive: true,
    })
    const [editingSubscriptionType, setEditingSubscriptionType] = useState(null)
    const [subscriptionTypeEditForm, setSubscriptionTypeEditForm] = useState({
      name: '',
      price: '',
      currency: 'PLN',
      durationDays: '30',
      sessionsCount: '8',
      isUnlimited: false,
      isIndividual: false,
      isActive: true,
    })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busyId, setBusyId] = useState(null)
    const [toolPanel, setToolPanel] = useState(null)
    const selectedType = subscriptionTypes.find((type) => String(type.typeId) === String(financeForm.subscriptionTypeId))

    const updateFinanceForm = (field, value) => setFinanceForm((current) => {
      if (field === 'subscriptionTypeId') {
        const nextType = subscriptionTypes.find((type) => String(type.typeId) === String(value))
        const nextAmount = nextType ? String(nextType.price) : ''
        return {
          ...current,
          subscriptionTypeId: value,
          chargeAmount: current.chargeAmount || nextAmount,
          paymentAmount: current.paymentAmount || nextAmount,
        }
      }
      return { ...current, [field]: value }
    })
    const updateSubscriptionTypeForm = (field, value) => setSubscriptionTypeForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'isUnlimited' && value ? { sessionsCount: '' } : {}),
    }))
    const updateSubscriptionTypeEditForm = (field, value) => setSubscriptionTypeEditForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'isUnlimited' && value ? { sessionsCount: '' } : {}),
    }))

    useEffect(() => {
      setRows([...(adminData.payments || [])])
    }, [adminData.payments])

    useEffect(() => {
      if (initialTab) setTab(initialTab)
    }, [initialTab])

    useEffect(() => {
      if (!financeForm.participantId) return
      let alive = true
      api.get(`/api/admin/participants/${financeForm.participantId}/subscriptions/`)
        .then((payload) => {
          if (!alive) return
          const list = payload.subscriptions || []
          setSubscriptions(list)
          setFinanceForm((current) => ({
            ...current,
            subscriptionId: list.some((item) => String(item.id) === String(current.subscriptionId))
              ? current.subscriptionId
              : list[0]?.id || '',
          }))
        })
        .catch((err) => {
          if (alive) setError(err.message)
        })
      return () => {
        alive = false
      }
    }, [financeForm.participantId])

    const counts = {
      all: rows.length,
      review: rows.filter((payment) => payment.status === 'pending').length,
      confirmed: rows.filter((payment) => payment.status === 'paid').length,
      rejected: rows.filter((payment) => payment.status === 'rejected').length,
    }
    const visibleRows = rows.filter((payment) => {
      if (tab === 'review') return payment.status === 'pending'
      if (tab === 'confirmed') return payment.status === 'paid'
      if (tab === 'rejected') return payment.status === 'rejected'
      return true
    }).filter((payment) => !methodFilter || payment.methodCode === methodFilter)

    async function updatePayment(payment, action) {
      setBusyId(payment.id)
      setError(null)
      try {
        const path = action === 'confirm'
          ? `/api/admin/payments/${payment.paymentId || payment.id}/confirm/`
          : `/api/admin/payments/${payment.paymentId || payment.id}/reject/`
        await api.post(path, action === 'reject' ? { reason: 'Отклонено администратором в CRM' } : {})
        setRows((current) => current.map((item) => item.id === payment.id
          ? { ...item, status: action === 'confirm' ? 'paid' : 'rejected' }
          : item))
        setReject(null)
        setConfirm(null)
        setMessage(action === 'confirm' ? 'Платёж подтверждён.' : 'Платёж отклонён.')
        reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    function openPaymentEdit(payment) {
      setEditingPayment(payment)
      setPaymentEditForm({ method: payment.methodCode || 'cash', comment: payment.receipt || '' })
    }

    async function savePaymentEdit() {
      setBusyId(`edit-${editingPayment.id}`); setError(null)
      try {
        await api.post(`/api/admin/payments/${editingPayment.paymentId || editingPayment.id}/`, { method: paymentEditForm.method, comment: paymentEditForm.comment })
        setRows((current) => current.map((item) => item.id === editingPayment.id ? { ...item, methodCode: paymentEditForm.method, method: { cash: 'Наличные', bank_transfer: 'Bank transfer / IBAN', card: 'Карта', other: 'Другое' }[paymentEditForm.method], receipt: paymentEditForm.comment } : item))
        setEditingPayment(null); setMessage('Реквизиты платежа обновлены, изменение записано в журнал.')
      } catch (err) { setError(err.message) } finally { setBusyId(null) }
    }

    function minorFromMajor(value) {
      return Math.round(Number(value || 0) * 100)
    }

    function subscriptionTypePayload(form) {
      return {
        name: form.name,
        price_minor: minorFromMajor(form.price),
        currency: form.currency || 'PLN',
        duration_days: Number(form.durationDays || 0),
        sessions_count: form.isUnlimited ? null : Number(form.sessionsCount || 0),
        is_individual: form.isIndividual,
        is_active: form.isActive,
      }
    }

    function openSubscriptionTypeEdit(type) {
      setEditingSubscriptionType(type)
      setSubscriptionTypeEditForm({
        name: type.name || '',
        price: String(type.price ?? ''),
        currency: type.currency || 'PLN',
        durationDays: String(type.days || 30),
        sessionsCount: type.isUnlimited ? '' : String(type.sessions ?? ''),
        isUnlimited: type.isUnlimited,
        isIndividual: type.isIndividual,
        isActive: type.active,
      })
    }

    async function createSubscriptionType() {
      if (!subscriptionTypeForm.name) {
        setError('Укажите название типа абонемента.')
        return
      }
      setBusyId('subscription-type')
      setError(null)
      try {
        await api.post('/api/admin/subscription-types/', subscriptionTypePayload(subscriptionTypeForm))
        setMessage('Тип абонемента создан.')
        setToolPanel(null)
        setSubscriptionTypeForm({
          name: '',
          price: '',
          currency: 'PLN',
          durationDays: '30',
          sessionsCount: '8',
          isUnlimited: false,
          isIndividual: false,
          isActive: true,
        })
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function saveSubscriptionTypeEdit() {
      if (!editingSubscriptionType) return
      setBusyId('subscription-type-edit')
      setError(null)
      try {
        await api.post(
          `/api/admin/subscription-types/${editingSubscriptionType.typeId}/`,
          subscriptionTypePayload(subscriptionTypeEditForm),
        )
        setEditingSubscriptionType(null)
        setMessage('Тип абонемента обновлён.')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function reloadSubscriptions(participantId = financeForm.participantId) {
      if (!participantId) return
      const payload = await api.get(`/api/admin/participants/${participantId}/subscriptions/`)
      const list = payload.subscriptions || []
      setSubscriptions(list)
      setFinanceForm((current) => ({
        ...current,
        subscriptionId: list.some((item) => String(item.id) === String(current.subscriptionId))
          ? current.subscriptionId
          : list[0]?.id || '',
      }))
    }

    async function createSubscription() {
      if (!financeForm.participantId || !financeForm.subscriptionTypeId) {
        setError('Выберите участника и тип абонемента.')
        return
      }
      setBusyId('subscription')
      setError(null)
      try {
        const result = await api.post(`/api/admin/participants/${financeForm.participantId}/subscriptions/`, {
          subscription_type_id: financeForm.subscriptionTypeId,
          start_date: financeForm.startDate,
          due_date: financeForm.dueDate,
          create_charge: financeForm.createCharge,
        })
        setMessage(financeForm.createCharge ? 'Абонемент и начисление созданы.' : 'Абонемент создан.')
        setToolPanel(null)
        setFinanceForm((current) => ({ ...current, subscriptionId: result.subscription?.id || current.subscriptionId }))
        await reloadSubscriptions()
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function createCharge() {
      if (!financeForm.participantId) {
        setError('Выберите участника.')
        return
      }
      setBusyId('charge')
      setError(null)
      try {
        await api.post(`/api/admin/participants/${financeForm.participantId}/charges/`, {
          description: financeForm.chargeDescription,
          amount_minor: minorFromMajor(financeForm.chargeAmount),
          currency: 'PLN',
          due_date: financeForm.dueDate,
        })
        setMessage('Начисление создано.')
        setToolPanel(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function createPayment() {
      if (!financeForm.participantId) {
        setError('Выберите участника.')
        return
      }
      setBusyId('payment')
      setError(null)
      try {
        await api.post('/api/admin/payments/', {
          participant_id: financeForm.participantId,
          amount_minor: minorFromMajor(financeForm.paymentAmount),
          currency: 'PLN',
          paid_at: financeForm.paymentDate,
          method: financeForm.paymentMethod,
        })
        setMessage('Платёж добавлен.')
        setToolPanel(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function freezeSubscription() {
      if (!financeForm.subscriptionId) {
        setError('Выберите абонемент.')
        return
      }
      setBusyId('freeze')
      setError(null)
      try {
        const result = await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/freeze/`, {
          start_date: financeForm.freezeStart,
          end_date: financeForm.freezeEnd,
          reason: financeForm.freezeReason,
        })
        setMessage(`Абонемент заморожен на ${result.days} дней.`)
        await reloadSubscriptions()
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function adjustSubscription() {
      if (!financeForm.subscriptionId) {
        setError('Выберите абонемент.')
        return
      }
      setBusyId('adjust')
      setError(null)
      try {
        await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/adjust/`, {
          delta: Number(financeForm.adjustDelta || 0),
          note: financeForm.adjustNote,
        })
        setMessage('Корректировка абонемента сохранена.')
        await reloadSubscriptions()
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function renewSubscription() {
      if (!financeForm.subscriptionId || !financeForm.subscriptionTypeId) {
        setError('Выберите абонемент и тип продления.')
        return
      }
      setBusyId('renew')
      setError(null)
      try {
        const result = await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/renew/`, {
          subscription_type_id: financeForm.subscriptionTypeId,
          start_date: financeForm.startDate,
          due_date: financeForm.dueDate,
          create_charge: financeForm.createCharge,
        })
        setMessage(financeForm.createCharge ? 'Абонемент продлён с начислением.' : 'Абонемент продлён.')
        setFinanceForm((current) => ({ ...current, subscriptionId: result.subscription?.id || current.subscriptionId }))
        await reloadSubscriptions()
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h2 className="page-title">Платежи</h2>
            <p className="page-desc">Подтверждение оплат, абонементы, начисления и корректировки.</p>
          </div>
        </div>

        <ToastNotice id="admin-payments-result" message={message} />
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busyId != null}>Сохраняю операцию...</BusyBanner>
        {participants.length === 0 && <Banner tone="warning" style={{ marginBottom: 12 }}>Сначала добавьте клиента или участника.</Banner>}
        {subscriptionTypes.length === 0 && <Banner tone="warning" style={{ marginBottom: 12 }}>Создайте тип абонемента перед выдачей абонемента.</Banner>}

        <div className="ops-action-strip">
          <button type="button" className={`ops-action-card${toolPanel === 'subscriptions' ? ' is-active' : ''}`} onClick={() => setToolPanel((current) => current === 'subscriptions' ? null : 'subscriptions')}>
            <span>Типы абонементов</span>
            <small>Цены и количество занятий</small>
          </button>
          <button type="button" className={`ops-action-card${toolPanel === 'finance' ? ' is-active' : ''}`} onClick={() => setToolPanel((current) => current === 'finance' ? null : 'finance')}>
            <span>Баланс клиента</span>
            <small>Абонемент, начисление, платеж</small>
          </button>
        </div>

        {toolPanel === 'subscriptions' && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Типы абонементов</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) repeat(3, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Input label="Название" value={subscriptionTypeForm.name} onChange={(event) => updateSubscriptionTypeForm('name', event.target.value)} />
            <Input label="Цена" value={subscriptionTypeForm.price} onChange={(event) => updateSubscriptionTypeForm('price', event.target.value)} placeholder="240.00" />
            <Input label="Валюта" value={subscriptionTypeForm.currency} onChange={(event) => updateSubscriptionTypeForm('currency', event.target.value)} />
            <Input label="Дней" value={subscriptionTypeForm.durationDays} onChange={(event) => updateSubscriptionTypeForm('durationDays', event.target.value)} />
            <Input label="Занятий" value={subscriptionTypeForm.sessionsCount} onChange={(event) => updateSubscriptionTypeForm('sessionsCount', event.target.value)} placeholder="Пусто для безлимитного" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={subscriptionTypeForm.isUnlimited} onChange={(event) => updateSubscriptionTypeForm('isUnlimited', event.target.checked)} />
              Безлимитный
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={subscriptionTypeForm.isIndividual} onChange={(event) => updateSubscriptionTypeForm('isIndividual', event.target.checked)} />
              Индивидуальный
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={subscriptionTypeForm.isActive} onChange={(event) => updateSubscriptionTypeForm('isActive', event.target.checked)} />
              Активен
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: editingSubscriptionType ? 14 : 0 }}>
            <Button variant="primary" loading={busyId === 'subscription-type'} disabled={busyId != null} onClick={createSubscriptionType}>Создать тип</Button>
          </div>

          {editingSubscriptionType && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Редактирование типа абонемента</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) repeat(3, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
                <Input label="Название" value={subscriptionTypeEditForm.name} onChange={(event) => updateSubscriptionTypeEditForm('name', event.target.value)} />
                <Input label="Цена" value={subscriptionTypeEditForm.price} onChange={(event) => updateSubscriptionTypeEditForm('price', event.target.value)} />
                <Input label="Валюта" value={subscriptionTypeEditForm.currency} onChange={(event) => updateSubscriptionTypeEditForm('currency', event.target.value)} />
                <Input label="Дней" value={subscriptionTypeEditForm.durationDays} onChange={(event) => updateSubscriptionTypeEditForm('durationDays', event.target.value)} />
                <Input label="Занятий" value={subscriptionTypeEditForm.sessionsCount} onChange={(event) => updateSubscriptionTypeEditForm('sessionsCount', event.target.value)} placeholder="Пусто для безлимитного" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                  <input type="checkbox" checked={subscriptionTypeEditForm.isUnlimited} onChange={(event) => updateSubscriptionTypeEditForm('isUnlimited', event.target.checked)} />
                  Безлимитный
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                  <input type="checkbox" checked={subscriptionTypeEditForm.isIndividual} onChange={(event) => updateSubscriptionTypeEditForm('isIndividual', event.target.checked)} />
                  Индивидуальный
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                  <input type="checkbox" checked={subscriptionTypeEditForm.isActive} onChange={(event) => updateSubscriptionTypeEditForm('isActive', event.target.checked)} />
                  Активен
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" loading={busyId === 'subscription-type-edit'} disabled={busyId != null} onClick={saveSubscriptionTypeEdit}>Сохранить тип</Button>
                <Button variant="secondary" disabled={busyId != null} onClick={() => setEditingSubscriptionType(null)}>Закрыть</Button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <Table
              rows={subscriptionTypes}
              emptyLabel="Типов абонементов пока нет"
              columns={[
                { key: 'name', header: 'Тип', render: (type) => <span className="strong">{type.name}</span> },
                { key: 'price', header: 'Цена', align: 'right', width: 110, render: (type) => <Money amount={type.price} /> },
                { key: 'sessions', header: 'Занятий', align: 'right', width: 100, render: (type) => type.isUnlimited ? 'Безлимитный' : type.sessions },
                { key: 'days', header: 'Дней', align: 'right', width: 80 },
                { key: 'isIndividual', header: 'Вид', width: 120, render: (type) => type.isIndividual ? 'Индивидуальный' : 'Групповой' },
                { key: 'active', header: 'Статус', width: 110, render: (type) => <StatusPill status={type.active ? 'active' : 'inactive'} size="sm" /> },
                {
                  key: 'act',
                  header: '',
                  width: 90,
                  render: (type) => <Button size="sm" variant="subtle" disabled={busyId != null} onClick={() => openSubscriptionTypeEdit(type)}>Изменить</Button>,
                },
              ]}
            />
          </div>
        </div>
        )}

        {toolPanel === 'finance' && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Абонементы и расчёты</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.3fr) minmax(220px, 1.3fr) minmax(180px, 1fr)', gap: 10, marginBottom: 12 }}>
            <SearchableSelect
              label="Участник"
              value={financeForm.participantId}
              onChange={(value) => updateFinanceForm('participantId', value)}
              options={participants.map((participant) => clientSelectOption(participant, {
                description: (row) => row.phone || row.email || row.group,
              }))}
            />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Тип абонемента
              <select value={financeForm.subscriptionTypeId} onChange={(event) => updateFinanceForm('subscriptionTypeId', event.target.value)} style={{ minHeight: 36 }}>
                <option value="">Выберите тип</option>
                {subscriptionTypes.map((type) => (
                  <option key={type.typeId} value={type.typeId}>
                    {type.name} · {type.price.toLocaleString('ru-RU')} {type.currency}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Абонемент участника
              <select value={financeForm.subscriptionId} onChange={(event) => updateFinanceForm('subscriptionId', event.target.value)} style={{ minHeight: 36 }}>
                <option value="">Выберите абонемент</option>
                {subscriptions.map((subscription) => (
                  <option key={subscription.id} value={subscription.id}>
                    #{subscription.id} · {subscription.type} · {subscription.status} · {subscription.remaining_sessions ?? 'безлимитный'}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Input label="Начало абонемента" value={financeForm.startDate} onChange={(event) => updateFinanceForm('startDate', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
            <Input label="Срок оплаты" value={financeForm.dueDate} onChange={(event) => updateFinanceForm('dueDate', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={financeForm.createCharge} onChange={(event) => updateFinanceForm('createCharge', event.target.checked)} />
              Создать начисление
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <Button variant="primary" loading={busyId === 'subscription'} disabled={busyId != null} onClick={createSubscription}>Выдать абонемент</Button>
              <Button variant="secondary" loading={busyId === 'renew'} disabled={busyId != null} onClick={renewSubscription}>Продлить</Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Input label="Описание начисления" value={financeForm.chargeDescription} onChange={(event) => updateFinanceForm('chargeDescription', event.target.value)} />
            <Input label="Сумма начисления" value={financeForm.chargeAmount} onChange={(event) => updateFinanceForm('chargeAmount', event.target.value)} placeholder={selectedType ? String(selectedType.price) : '240.00'} />
            <Input label="Сумма платежа" value={financeForm.paymentAmount} onChange={(event) => updateFinanceForm('paymentAmount', event.target.value)} placeholder={selectedType ? String(selectedType.price) : '240.00'} />
            <Input label="Дата платежа" value={financeForm.paymentDate} onChange={(event) => updateFinanceForm('paymentDate', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Способ оплаты
              <select value={financeForm.paymentMethod} onChange={(event) => updateFinanceForm('paymentMethod', event.target.value)} style={{ minHeight: 36 }}>
                <option value="cash">Наличные</option>
                <option value="bank_transfer">Bank transfer / IBAN</option>
                <option value="card">Карта</option>
                <option value="other">Другое</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <Button variant="secondary" loading={busyId === 'charge'} disabled={busyId != null} onClick={createCharge}>Добавить начисление</Button>
              <Button variant="secondary" loading={busyId === 'payment'} disabled={busyId != null} onClick={createPayment}>Добавить платёж</Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10 }}>
            <Input label="Заморозить с" value={financeForm.freezeStart} onChange={(event) => updateFinanceForm('freezeStart', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
            <Input label="Заморозить до" value={financeForm.freezeEnd} onChange={(event) => updateFinanceForm('freezeEnd', event.target.value)} placeholder="ГГГГ-ММ-ДД" />
            <Input label="Причина заморозки" value={financeForm.freezeReason} onChange={(event) => updateFinanceForm('freezeReason', event.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <Button variant="secondary" loading={busyId === 'freeze'} disabled={busyId != null} onClick={freezeSubscription}>Заморозить</Button>
            </div>
            <Input label="Корректировка занятий" value={financeForm.adjustDelta} onChange={(event) => updateFinanceForm('adjustDelta', event.target.value)} />
            <Input label="Комментарий к корректировке" value={financeForm.adjustNote} onChange={(event) => updateFinanceForm('adjustNote', event.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <Button variant="secondary" loading={busyId === 'adjust'} disabled={busyId != null} onClick={adjustSubscription}>Сохранить корректировку</Button>
            </div>
          </div>
        </div>
        )}

        <div className="toolbar">
          <Tabs value={tab} onChange={setTab} style={{ border: 'none' }} items={[
            { value: 'all', label: 'Все', count: counts.all },
            { value: 'review', label: 'На проверке', count: counts.review },
            { value: 'confirmed', label: 'Подтверждённые', count: counts.confirmed },
            { value: 'rejected', label: 'Отклонённые', count: counts.rejected },
          ]} />
          <span className="spacer" />
          <label>Способ оплаты <select aria-label="Способ оплаты" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}><option value="">Все</option><option value="cash">Наличные</option><option value="bank_transfer">Bank transfer / IBAN</option><option value="card">Карта</option><option value="other">Другое</option></select></label>
        </div>

        {editingPayment && <div className="card card-pad" style={{ marginBottom: 14 }}><div className="eyebrow">Чувствительное действие: реквизиты платежа</div><p className="muted">Сумма, время и сама запись не удаляются. Изменение способа и комментария попадёт в журнал действий.</p><div className="ops-form-grid"><label>Способ оплаты<select value={paymentEditForm.method} onChange={(event) => setPaymentEditForm({ ...paymentEditForm, method: event.target.value })}><option value="cash">Наличные</option><option value="bank_transfer">Bank transfer / IBAN</option><option value="card">Карта</option><option value="other">Другое</option></select></label><Input label="Комментарий" value={paymentEditForm.comment} onChange={(event) => setPaymentEditForm({ ...paymentEditForm, comment: event.target.value })} /></div><div className="ops-button-row"><Button variant="primary" disabled={busyId != null} onClick={savePaymentEdit}>Сохранить изменение</Button><Button variant="secondary" onClick={() => setEditingPayment(null)}>Отмена</Button></div></div>}

        <Table
          rows={visibleRows}
          emptyLabel="В этой категории платежей нет"
          columns={[
            { key: 'sourceLabel', header: 'Тип', muted: true },
            { key: 'child', header: 'Участник', render: (payment) => <button type="button" className="ops-link-button" disabled={!payment.clientId} onClick={() => go?.('clientDetail', { clientId: payment.clientId, tab: 'payments' })}><Avatar name={payment.child} size={26} /><span className="strong">{payment.child}</span></button> },
            { key: 'method', header: 'Способ', muted: true },
            { key: 'date', header: 'Дата', muted: true, render: (payment) => <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{payment.date}</span> },
            { key: 'receipt', header: 'Документ', render: (payment) => payment.receipt ? <a href={payment.receiptUrl || '#'} target={payment.receiptUrl ? '_blank' : undefined} rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-link)', fontSize: 'var(--fs-xs)' }}><I.File size={14} /> {payment.receipt}</a> : <span className="muted">-</span> },
            { key: 'amount', header: 'Сумма', align: 'right', width: 110, render: (payment) => <Money amount={payment.amount} /> },
            { key: 'status', header: 'Статус', width: 130, render: (payment) => <StatusPill status={payment.status} size="sm" /> },
            {
              key: 'act',
              header: '',
              width: 190,
              render: (payment) => (
                <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                  <Button size="sm" variant="subtle" disabled={busyId != null} onClick={() => openPaymentEdit(payment)}>Изменить</Button>
                  {payment.status === 'pending' && <>
                  <IconButton label="Подтвердить" size="sm" disabled={busyId === payment.id} onClick={() => setConfirm(payment)}><I.Check size={16} /></IconButton>
                  <IconButton label="Отклонить" size="sm" variant="danger" disabled={busyId === payment.id} onClick={() => setReject(payment)}><I.X size={16} /></IconButton>
                  </>}
                </div>
              ),
            },
          ]}
        />

        {confirm && (
          <Dialog
            open
            title="Подтвердить платёж?"
            confirmLabel="Подтвердить"
            cancelLabel="Отмена"
            onClose={() => setConfirm(null)}
            onConfirm={() => updatePayment(confirm, 'confirm')}
            description={`${confirm.source === 'client_top_up' ? 'Запрос на пополнение' : 'Платёж'} · участник ${confirm.child} · сумма ${confirm.amount}. После подтверждения платёж повлияет на баланс.`}
          />
        )}

        {reject && (
          <Dialog
            open
            tone="danger"
            title="Отклонить платёж?"
            confirmLabel="Отклонить"
            cancelLabel="Отмена"
            onClose={() => setReject(null)}
            onConfirm={() => updatePayment(reject, 'reject')}
            description={`${reject.source === 'client_top_up' ? 'Запрос на пополнение' : 'Платёж'} ${reject.child} на сумму ${reject.amount} будет отклонён.`}
          />
        )}
      </div>
    )
  }
}

