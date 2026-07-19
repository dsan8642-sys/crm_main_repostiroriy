import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'

export function createAdminPaymentsScreen(components, icons, reloadRoleData) {
  const { Table, StatusPill, Money, Button, IconButton, Tabs, Banner, Dialog, Avatar, Input } = components
  const I = icons

  return function ApiAdminPayments() {
    const participants = globalThis.AdminData?.clients || []
    const subscriptionTypes = globalThis.AdminData?.subscriptionTypes || []
    const [tab, setTab] = useState('review')
    const [reject, setReject] = useState(null)
    const [rows, setRows] = useState(() => [...(globalThis.AdminData?.payments || [])])
    const [subscriptions, setSubscriptions] = useState([])
    const [financeForm, setFinanceForm] = useState({
      participantId: participants[0]?.studentId || '',
      subscriptionTypeId: subscriptionTypes[0]?.typeId || '',
      subscriptionId: '',
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      chargeDescription: 'Manual charge',
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
      setRows([...(globalThis.AdminData?.payments || [])])
    }, [globalThis.AdminData?.payments])

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
      rejected: rows.filter((payment) => payment.status === 'rejected').length,
    }
    const visibleRows = rows.filter((payment) => {
      if (tab === 'review') return payment.status === 'pending'
      if (tab === 'rejected') return payment.status === 'rejected'
      return true
    })

    async function updatePayment(payment, action) {
      setBusyId(payment.id)
      setError(null)
      try {
        const path = action === 'confirm'
          ? `/api/admin/payments/${payment.paymentId || payment.id}/confirm/`
          : `/api/admin/payments/${payment.paymentId || payment.id}/reject/`
        await api.post(path, action === 'reject' ? { reason: 'Rejected from CRM frontend' } : {})
        setRows((current) => current.map((item) => item.id === payment.id
          ? { ...item, status: action === 'confirm' ? 'paid' : 'rejected' }
          : item))
        setReject(null)
        setMessage(action === 'confirm' ? 'Platnosc potwierdzona.' : 'Platnosc odrzucona.')
        reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
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
        setError('Podaj nazwe typu abonamentu.')
        return
      }
      setBusyId('subscription-type')
      setError(null)
      try {
        await api.post('/api/admin/subscription-types/', subscriptionTypePayload(subscriptionTypeForm))
        setMessage('Typ abonamentu utworzony.')
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
        setMessage('Typ abonamentu zaktualizowany.')
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
        setError('Wybierz uczestnika i typ abonamentu.')
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
        setMessage(financeForm.createCharge ? 'Abonament i naliczenie utworzone.' : 'Abonament utworzony.')
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
        setError('Wybierz uczestnika.')
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
        setMessage('Naliczenie utworzone.')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function createPayment() {
      if (!financeForm.participantId) {
        setError('Wybierz uczestnika.')
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
        setMessage('Platnosc dodana.')
        await reloadRoleData?.('admin')
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function freezeSubscription() {
      if (!financeForm.subscriptionId) {
        setError('Wybierz abonament.')
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
        setMessage(`Abonament zamrozony na ${result.days} dni.`)
        await reloadSubscriptions()
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function adjustSubscription() {
      if (!financeForm.subscriptionId) {
        setError('Wybierz abonament.')
        return
      }
      setBusyId('adjust')
      setError(null)
      try {
        await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/adjust/`, {
          delta: Number(financeForm.adjustDelta || 0),
          note: financeForm.adjustNote,
        })
        setMessage('Korekta abonamentu zapisana.')
        await reloadSubscriptions()
      } catch (err) {
        setError(err.message)
      } finally {
        setBusyId(null)
      }
    }

    async function renewSubscription() {
      if (!financeForm.subscriptionId || !financeForm.subscriptionTypeId) {
        setError('Wybierz abonament i typ odnowienia.')
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
        setMessage(financeForm.createCharge ? 'Abonament odnowiony z naliczeniem.' : 'Abonament odnowiony.')
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
            <h2 className="page-title">Platnosci</h2>
            <p className="page-desc">Dane z /api/admin/payments/. Akcje zapisuja status w backendzie.</p>
          </div>
        </div>

        {message && <Banner tone="success" style={{ marginBottom: 12 }} onClose={() => setMessage(null)}>{message}</Banner>}
        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busyId != null}>Operacja jest zapisywana w backendzie...</BusyBanner>
        {participants.length === 0 && <Banner tone="warning" style={{ marginBottom: 12 }}>Brak uczestnikow w API. Najpierw dodaj klienta lub uczestnika.</Banner>}
        {subscriptionTypes.length === 0 && <Banner tone="warning" style={{ marginBottom: 12 }}>Brak typow abonamentow. Utworz typ abonamentu przed nadaniem abonamentu.</Banner>}

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Typy abonamentow</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) repeat(3, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Input label="Nazwa" value={subscriptionTypeForm.name} onChange={(event) => updateSubscriptionTypeForm('name', event.target.value)} />
            <Input label="Cena" value={subscriptionTypeForm.price} onChange={(event) => updateSubscriptionTypeForm('price', event.target.value)} placeholder="240.00" />
            <Input label="Waluta" value={subscriptionTypeForm.currency} onChange={(event) => updateSubscriptionTypeForm('currency', event.target.value)} />
            <Input label="Dni" value={subscriptionTypeForm.durationDays} onChange={(event) => updateSubscriptionTypeForm('durationDays', event.target.value)} />
            <Input label="Wejscia" value={subscriptionTypeForm.sessionsCount} onChange={(event) => updateSubscriptionTypeForm('sessionsCount', event.target.value)} placeholder="Puste dla bez limitu" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={subscriptionTypeForm.isUnlimited} onChange={(event) => updateSubscriptionTypeForm('isUnlimited', event.target.checked)} />
              Bez limitu
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={subscriptionTypeForm.isIndividual} onChange={(event) => updateSubscriptionTypeForm('isIndividual', event.target.checked)} />
              Indywidualny
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={subscriptionTypeForm.isActive} onChange={(event) => updateSubscriptionTypeForm('isActive', event.target.checked)} />
              Aktywny
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: editingSubscriptionType ? 14 : 0 }}>
            <Button variant="primary" loading={busyId === 'subscription-type'} disabled={busyId != null} onClick={createSubscriptionType}>Utworz typ</Button>
          </div>

          {editingSubscriptionType && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Edycja typu abonamentu</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) repeat(3, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
                <Input label="Nazwa" value={subscriptionTypeEditForm.name} onChange={(event) => updateSubscriptionTypeEditForm('name', event.target.value)} />
                <Input label="Cena" value={subscriptionTypeEditForm.price} onChange={(event) => updateSubscriptionTypeEditForm('price', event.target.value)} />
                <Input label="Waluta" value={subscriptionTypeEditForm.currency} onChange={(event) => updateSubscriptionTypeEditForm('currency', event.target.value)} />
                <Input label="Dni" value={subscriptionTypeEditForm.durationDays} onChange={(event) => updateSubscriptionTypeEditForm('durationDays', event.target.value)} />
                <Input label="Wejscia" value={subscriptionTypeEditForm.sessionsCount} onChange={(event) => updateSubscriptionTypeEditForm('sessionsCount', event.target.value)} placeholder="Puste dla bez limitu" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                  <input type="checkbox" checked={subscriptionTypeEditForm.isUnlimited} onChange={(event) => updateSubscriptionTypeEditForm('isUnlimited', event.target.checked)} />
                  Bez limitu
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                  <input type="checkbox" checked={subscriptionTypeEditForm.isIndividual} onChange={(event) => updateSubscriptionTypeEditForm('isIndividual', event.target.checked)} />
                  Indywidualny
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                  <input type="checkbox" checked={subscriptionTypeEditForm.isActive} onChange={(event) => updateSubscriptionTypeEditForm('isActive', event.target.checked)} />
                  Aktywny
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" loading={busyId === 'subscription-type-edit'} disabled={busyId != null} onClick={saveSubscriptionTypeEdit}>Zapisz typ</Button>
                <Button variant="secondary" disabled={busyId != null} onClick={() => setEditingSubscriptionType(null)}>Zamknij</Button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <Table
              rows={subscriptionTypes}
              emptyLabel="Brak typow abonamentow w API"
              columns={[
                { key: 'name', header: 'Typ', render: (type) => <span className="strong">{type.name}</span> },
                { key: 'price', header: 'Cena', align: 'right', width: 110, render: (type) => <Money amount={type.price} /> },
                { key: 'sessions', header: 'Wejscia', align: 'right', width: 100, render: (type) => type.isUnlimited ? 'Bez limitu' : type.sessions },
                { key: 'days', header: 'Dni', align: 'right', width: 80 },
                { key: 'isIndividual', header: 'Rodzaj', width: 120, render: (type) => type.isIndividual ? 'Indywidualny' : 'Grupowy' },
                { key: 'active', header: 'Status', width: 110, render: (type) => <StatusPill status={type.active ? 'active' : 'inactive'} size="sm" /> },
                {
                  key: 'act',
                  header: '',
                  width: 90,
                  render: (type) => <Button size="sm" variant="subtle" disabled={busyId != null} onClick={() => openSubscriptionTypeEdit(type)}>Edytuj</Button>,
                },
              ]}
            />
          </div>
        </div>

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Abonamenty i rozliczenia</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.3fr) minmax(220px, 1.3fr) minmax(180px, 1fr)', gap: 10, marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Uczestnik
              <select value={financeForm.participantId} onChange={(event) => updateFinanceForm('participantId', event.target.value)} style={{ minHeight: 36 }}>
                <option value="">Wybierz uczestnika</option>
                {participants.map((participant) => (
                  <option key={participant.studentId} value={participant.studentId}>
                    {participant.last} {participant.first} Р’В· {participant.phone || participant.email || participant.group}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Typ abonamentu
              <select value={financeForm.subscriptionTypeId} onChange={(event) => updateFinanceForm('subscriptionTypeId', event.target.value)} style={{ minHeight: 36 }}>
                <option value="">Wybierz typ</option>
                {subscriptionTypes.map((type) => (
                  <option key={type.typeId} value={type.typeId}>
                    {type.name} Р’В· {type.price.toLocaleString('pl-PL')} {type.currency}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Abonament uczestnika
              <select value={financeForm.subscriptionId} onChange={(event) => updateFinanceForm('subscriptionId', event.target.value)} style={{ minHeight: 36 }}>
                <option value="">Wybierz abonament</option>
                {subscriptions.map((subscription) => (
                  <option key={subscription.id} value={subscription.id}>
                    #{subscription.id} Р’В· {subscription.type} Р’В· {subscription.status} Р’В· {subscription.remaining_sessions ?? 'bez limitu'}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Input label="Start abonamentu" value={financeForm.startDate} onChange={(event) => updateFinanceForm('startDate', event.target.value)} placeholder="YYYY-MM-DD" />
            <Input label="Termin platnosci" value={financeForm.dueDate} onChange={(event) => updateFinanceForm('dueDate', event.target.value)} placeholder="YYYY-MM-DD" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
              <input type="checkbox" checked={financeForm.createCharge} onChange={(event) => updateFinanceForm('createCharge', event.target.checked)} />
              Utworz naliczenie
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <Button variant="primary" loading={busyId === 'subscription'} disabled={busyId != null} onClick={createSubscription}>Dodaj abonament</Button>
              <Button variant="secondary" loading={busyId === 'renew'} disabled={busyId != null} onClick={renewSubscription}>Przedluz</Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Input label="Opis naliczenia" value={financeForm.chargeDescription} onChange={(event) => updateFinanceForm('chargeDescription', event.target.value)} />
            <Input label="Kwota naliczenia" value={financeForm.chargeAmount} onChange={(event) => updateFinanceForm('chargeAmount', event.target.value)} placeholder={selectedType ? String(selectedType.price) : '240.00'} />
            <Input label="Kwota platnosci" value={financeForm.paymentAmount} onChange={(event) => updateFinanceForm('paymentAmount', event.target.value)} placeholder={selectedType ? String(selectedType.price) : '240.00'} />
            <Input label="Data platnosci" value={financeForm.paymentDate} onChange={(event) => updateFinanceForm('paymentDate', event.target.value)} placeholder="YYYY-MM-DD" />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
              Metoda platnosci
              <select value={financeForm.paymentMethod} onChange={(event) => updateFinanceForm('paymentMethod', event.target.value)} style={{ minHeight: 36 }}>
                <option value="cash">Gotowka</option>
                <option value="bank_transfer">Przelew</option>
                <option value="card">Karta</option>
                <option value="other">Inne</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <Button variant="secondary" loading={busyId === 'charge'} disabled={busyId != null} onClick={createCharge}>Dodaj naliczenie</Button>
              <Button variant="secondary" loading={busyId === 'payment'} disabled={busyId != null} onClick={createPayment}>Dodaj platnosc</Button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10 }}>
            <Input label="Freeze od" value={financeForm.freezeStart} onChange={(event) => updateFinanceForm('freezeStart', event.target.value)} placeholder="YYYY-MM-DD" />
            <Input label="Freeze do" value={financeForm.freezeEnd} onChange={(event) => updateFinanceForm('freezeEnd', event.target.value)} placeholder="YYYY-MM-DD" />
            <Input label="Powod freeze" value={financeForm.freezeReason} onChange={(event) => updateFinanceForm('freezeReason', event.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <Button variant="secondary" loading={busyId === 'freeze'} disabled={busyId != null} onClick={freezeSubscription}>Zamroz</Button>
            </div>
            <Input label="Korekta wejsc" value={financeForm.adjustDelta} onChange={(event) => updateFinanceForm('adjustDelta', event.target.value)} />
            <Input label="Notatka korekty" value={financeForm.adjustNote} onChange={(event) => updateFinanceForm('adjustNote', event.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <Button variant="secondary" loading={busyId === 'adjust'} disabled={busyId != null} onClick={adjustSubscription}>Zapisz korekte</Button>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <Tabs value={tab} onChange={setTab} style={{ border: 'none' }} items={[
            { value: 'all', label: 'Wszystkie', count: counts.all },
            { value: 'review', label: 'Na weryfikacji', count: counts.review },
            { value: 'rejected', label: 'Odrzucone', count: counts.rejected },
          ]} />
        </div>

        <Table
          rows={visibleRows}
          emptyLabel="Brak platnosci w tej kategorii"
          columns={[
            { key: 'child', header: 'Uczestnik', render: (payment) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={payment.child} size={26} /><span className="strong">{payment.child}</span></span> },
            { key: 'method', header: 'Sposob', muted: true },
            { key: 'date', header: 'Data', muted: true, render: (payment) => <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{payment.date}</span> },
            { key: 'receipt', header: 'Komentarz', render: (payment) => payment.receipt ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-link)', fontSize: 'var(--fs-xs)' }}><I.File size={14} /> {payment.receipt}</span> : <span className="muted">-</span> },
            { key: 'amount', header: 'Kwota', align: 'right', width: 110, render: (payment) => <Money amount={payment.amount} /> },
            { key: 'status', header: 'Status', width: 130, render: (payment) => <StatusPill status={payment.status} size="sm" /> },
            {
              key: 'act',
              header: '',
              width: 100,
              render: (payment) => payment.status === 'pending' ? (
                <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                  <IconButton label="Potwierdz" size="sm" disabled={busyId === payment.id} onClick={() => updatePayment(payment, 'confirm')}><I.Check size={16} /></IconButton>
                  <IconButton label="Odrzuc" size="sm" variant="danger" disabled={busyId === payment.id} onClick={() => setReject(payment)}><I.X size={16} /></IconButton>
                </div>
              ) : null,
            },
          ]}
        />

        {reject && (
          <Dialog
            open
            tone="danger"
            title="Odrzucic platnosc?"
            confirmLabel="Odrzuc"
            cancelLabel="Anuluj"
            onClose={() => setReject(null)}
            onConfirm={() => updatePayment(reject, 'reject')}
            description={`Platnosc ${reject.child} na ${reject.amount} zostanie odrzucona w backendzie.`}
          />
        )}
      </div>
    )
  }
}

