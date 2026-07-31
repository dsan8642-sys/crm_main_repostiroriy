import React, { useEffect, useMemo, useState } from 'react'
import { api, downloadFile } from '../../api.js'
import { asAccountBalance, asMoneyMajor, formatDate, formatShortDate, formatTime, paymentMethodLabel } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'
import { DateField } from '../DateTimeField.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { AccessButtons, AccessCodeCard } from '../AccessControls.jsx'

export function createAdminClientDetailScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Avatar, Button, Banner, Tabs, Money, Badge, Dialog, Input } = components
  const I = icons

  return function ApiAdminClientDetail({ go, clientId, initialTab }) {
    const fallbackClientId = clientId || adminData.clients?.find((row) => row.clientId)?.clientId
    const [tab, setTab] = useState('participants')
    const [detail, setDetail] = useState(null)
    const [error, setError] = useState(null)
    const [message, setMessage] = useState(null)
    const [activationInfo, setActivationInfo] = useState(null)
    const [loading, setLoading] = useState(false)
    const [actionBusy, setActionBusy] = useState(null)
    const [confirmAction, setConfirmAction] = useState(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [paymentPanelOpen, setPaymentPanelOpen] = useState(false)
    const [financeAction, setFinanceAction] = useState(null)
    const [editingAccount, setEditingAccount] = useState(false)
    const [accountForm, setAccountForm] = useState({ firstName: '', lastName: '', email: '', phone: '', telegramChatId: '', preferredLanguage: 'ru' })
    const [editingParticipant, setEditingParticipant] = useState(null)
    const [participantForm, setParticipantForm] = useState({ firstName: '', lastName: '', birthDate: '', email: '', groupId: '', isActive: true })
    const [paymentForm, setPaymentForm] = useState({
      participantId: '',
      amount: '',
      paidAt: new Date().toISOString().slice(0, 10),
      method: 'cash',
      comment: '',
    })
    const [financeForm, setFinanceForm] = useState({
      participantId: '',
      subscriptionId: '',
      subscriptionTypeId: '',
      amount: '',
      description: '',
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      createCharge: true,
      freezeStart: new Date().toISOString().slice(0, 10),
      freezeEnd: '',
      freezeReason: '',
      adjustDelta: '',
      adjustNote: '',
    })

    useEffect(() => {
      if (!fallbackClientId) return
      let alive = true
      setLoading(true)
      setError(null)
      api.get(`/api/admin/clients/${fallbackClientId}/`)
        .then((payload) => {
          if (alive) setDetail(payload)
        })
        .catch((err) => {
          if (alive) setError(err.message)
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, [fallbackClientId, refreshKey])

    const account = detail?.account || {}
    const participants = detail?.participants || []
    const subscriptions = detail?.subscriptions || []
    const charges = detail?.charges || []
    const payments = detail?.payments || []
    const attendance = detail?.attendance || []
    const consents = detail?.consents || []
    const summary = detail?.summary || {}
    const accountArchived = participants.length > 0 && participants.every((item) => item.is_active === false)
    const subscriptionTypes = adminData.subscriptionTypes || []
    const groups = adminData.groups || []

    useEffect(() => {
      if (initialTab) setTab(initialTab)
    }, [initialTab])

    const participantName = (id) => participants.find((participant) => participant.id === id)?.full_name || '-'
    const money = (minor) => asMoneyMajor(minor || 0)
    const accountBalance = asAccountBalance(summary.balance_minor)
    const balanceCaption = accountBalance > 0
      ? 'Переплата: подтверждённые оплаты выше начислений'
      : accountBalance < 0
        ? 'К оплате: начисления выше подтверждённых оплат'
        : 'Баланс закрыт'
    const status = (value) => {
      if (value === 'active') return 'active'
      if (value === 'confirmed') return 'paid'
      if (value === 'pending') return 'pending'
      if (value === 'rejected') return 'rejected'
      if (value === 'rescheduled') return 'moved'
      return value
    }
    const refreshDetail = () => {
      setRefreshKey((value) => value + 1)
      reloadRoleData?.('admin')
    }
    const updatePaymentForm = (field, value) => setPaymentForm((current) => ({ ...current, [field]: value }))
    const updateFinanceForm = (field, value) => setFinanceForm((current) => ({ ...current, [field]: value }))

    async function accessAction(action) {
      setError(null)
      setActivationInfo(null)
      setActionBusy(`access-${action}`)
      try {
        const payload = await api.post(`/api/admin/clients/${fallbackClientId}/access/${action}/`)
        if (action === 'revoke') {
          setMessage('Portal-доступ клиента отозван. Профиль и участники не архивированы.')
        } else {
          setActivationInfo(payload)
        }
        refreshDetail()
      } catch (err) {
        setError(err.message)
      } finally {
        setActionBusy(null)
      }
    }

    useEffect(() => {
      if (!participants.length) return
      setPaymentForm((current) => ({
        ...current,
        participantId: current.participantId || String(participants[0].id),
      }))
      setFinanceForm((current) => ({
        ...current,
        participantId: current.participantId || String(participants[0].id),
        subscriptionId: subscriptions.some((item) => String(item.id) === String(current.subscriptionId))
          ? current.subscriptionId
          : String(subscriptions[0]?.id || ''),
        subscriptionTypeId: current.subscriptionTypeId || String(subscriptionTypes[0]?.typeId || ''),
      }))
    }, [participants, subscriptions, subscriptionTypes])

    function minorFromMajor(value) {
      return Math.round(Number(value || 0) * 100)
    }

    async function createManualPayment() {
      if (!paymentForm.participantId) {
        setError('Выберите участника для оплаты.')
        return
      }
      if (!Number(paymentForm.amount)) {
        setError('Введите сумму оплаты.')
        return
      }
      setError(null)
      setMessage(null)
      setActionBusy('manual-payment')
      try {
        await api.post('/api/admin/payments/', {
          participant_id: paymentForm.participantId,
          amount_minor: minorFromMajor(paymentForm.amount),
          currency: 'PLN',
          paid_at: paymentForm.paidAt,
          method: paymentForm.method,
          comment: paymentForm.comment,
          confirm: true,
        })
        setMessage('Оплата добавлена и подтверждена.')
        setPaymentPanelOpen(false)
        setPaymentForm((current) => ({
          ...current,
          amount: '',
          comment: '',
        }))
        refreshDetail()
      } catch (err) {
        setError(err.message)
      } finally {
        setActionBusy(null)
      }
    }

    function openParticipantEdit(participant) {
      setEditingParticipant(participant)
      setParticipantForm({ firstName: participant.first_name || '', lastName: participant.last_name || '', birthDate: participant.birth_date || '', email: participant.email || '', groupId: participant.group?.id || '', isActive: participant.is_active })
    }

    function openAccountEdit() {
      setAccountForm({
        firstName: account.first_name || '',
        lastName: account.last_name || '',
        email: account.email || '',
        phone: account.phone || '',
        telegramChatId: account.telegram_chat_id || '',
        preferredLanguage: account.preferred_language || 'ru',
      })
      setEditingAccount(true)
    }

    async function saveAccount() {
      setActionBusy('account')
      setError(null)
      try {
        await api.post(`/api/admin/clients/${fallbackClientId}/`, { account: {
          first_name: accountForm.firstName,
          last_name: accountForm.lastName,
          email: accountForm.email,
          phone: accountForm.phone,
          telegram_chat_id: accountForm.telegramChatId,
          preferred_language: accountForm.preferredLanguage,
        } })
        setMessage('Данные владельца аккаунта обновлены.')
        setEditingAccount(false)
        refreshDetail()
      } catch (err) {
        setError(err.message)
      } finally {
        setActionBusy(null)
      }
    }

    async function saveParticipant() {
      setActionBusy('participant'); setError(null)
      try {
        await api.post(`/api/admin/participants/${editingParticipant.id}/`, { participant: { first_name: participantForm.firstName, last_name: participantForm.lastName, birth_date: participantForm.birthDate || null, email: participantForm.email, group_id: participantForm.groupId || null, is_active: participantForm.isActive } })
        setMessage('Данные участника обновлены.'); setEditingParticipant(null); refreshDetail()
      } catch (err) { setError(err.message) } finally { setActionBusy(null) }
    }

    async function sendReminder() {
      setActionBusy('reminder'); setError(null)
      try {
        await api.post('/api/admin/notifications/mass-mail/', { audience: 'selected', parent_ids: [account.id], channel: 'email', subject: 'Напоминание об оплате', body: 'Здравствуйте! Напоминаем проверить оплату и состояние абонемента в SwimCRM.' })
        setMessage('Напоминание поставлено в очередь.')
      } catch (err) { setError(err.message) } finally { setActionBusy(null) }
    }

    async function executeFinanceAction() {
      const participantRequired = financeAction === 'charge' || financeAction === 'issue'
      const subscriptionRequired = financeAction === 'renew' || financeAction === 'freeze' || financeAction === 'adjust'
      const typeRequired = financeAction === 'issue' || financeAction === 'renew'
      if (participantRequired && !financeForm.participantId) {
        setError('Выберите участника.')
        return
      }
      if (subscriptionRequired && !financeForm.subscriptionId) {
        setError('Выберите абонемент.')
        return
      }
      if (typeRequired && !financeForm.subscriptionTypeId) {
        setError('Выберите тип абонемента.')
        return
      }

      setError(null)
      setMessage(null)
      setActionBusy(financeAction)
      try {
        if (financeAction === 'charge') {
          await api.post(`/api/admin/participants/${financeForm.participantId}/charges/`, {
            description: financeForm.description,
            amount_minor: minorFromMajor(financeForm.amount),
            currency: 'PLN',
            due_date: financeForm.dueDate,
          })
          setMessage('Начисление создано.')
        }
        if (financeAction === 'issue') {
          await api.post(`/api/admin/participants/${financeForm.participantId}/subscriptions/`, {
            subscription_type_id: financeForm.subscriptionTypeId,
            start_date: financeForm.startDate,
            due_date: financeForm.dueDate,
            create_charge: financeForm.createCharge,
          })
          setMessage(financeForm.createCharge ? 'Абонемент и начисление созданы.' : 'Абонемент выдан.')
        }
        if (financeAction === 'renew') {
          await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/renew/`, {
            subscription_type_id: financeForm.subscriptionTypeId,
            start_date: financeForm.startDate,
            due_date: financeForm.dueDate,
            create_charge: financeForm.createCharge,
          })
          setMessage(financeForm.createCharge ? 'Абонемент продлён с начислением.' : 'Абонемент продлён.')
        }
        if (financeAction === 'freeze') {
          const result = await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/freeze/`, {
            start_date: financeForm.freezeStart,
            end_date: financeForm.freezeEnd,
            reason: financeForm.freezeReason,
          })
          setMessage(`Абонемент заморожен на ${result.days} дней.`)
        }
        if (financeAction === 'adjust') {
          await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/adjust/`, {
            delta: Number(financeForm.adjustDelta || 0),
            note: financeForm.adjustNote,
          })
          setMessage('Остаток занятий скорректирован.')
        }
        setFinanceAction(null)
        refreshDetail()
      } catch (err) {
        setError(err.message)
      } finally {
        setActionBusy(null)
      }
    }

    async function exportClientData() {
      setError(null)
      setMessage(null)
      setActionBusy('export')
      try {
        const result = await downloadFile(`/api/admin/privacy/clients/${fallbackClientId}/export/`, `client-${fallbackClientId}-data.json`)
        setMessage(`Экспорт подготовлен: ${result.name}`)
      } catch (err) {
        setError(err.message)
      } finally {
        setActionBusy(null)
      }
    }

    async function runDangerAction() {
      if (!confirmAction) return
      setError(null)
      setMessage(null)
      setActionBusy(confirmAction.type)
      try {
        if (confirmAction.type === 'archive') {
          const payload = await api.delete(`/api/admin/clients/${fallbackClientId}/`)
          setDetail(payload)
          setMessage('Клиент архивирован. Аккаунт и участники неактивны.')
          reloadRoleData?.('admin')
        }
        if (confirmAction.type === 'restore') {
          const payload = await api.post(`/api/admin/clients/${fallbackClientId}/restore/`)
          setDetail(payload)
          setMessage('Клиент восстановлен и возвращён в рабочий список.')
          reloadRoleData?.('admin')
        }
        if (confirmAction.type === 'anonymize') {
          await api.post(`/api/admin/privacy/clients/${fallbackClientId}/anonymize/`)
          setMessage('Персональные данные клиента анонимизированы.')
          refreshDetail()
        }
        setConfirmAction(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setActionBusy(null)
      }
    }

    if (!fallbackClientId) {
      return (
        <div className="page page-wide">
          <div className="page-head">
            <div>
              <h2 className="page-title">Клиент</h2>
              <p className="page-desc">Выберите клиента из списка.</p>
            </div>
            <Button variant="secondary" iconLeft={<I.ArrowLeft size={15} />} onClick={() => go?.('clients')}>Клиенты</Button>
          </div>
          <Banner tone="warning">Клиент не выбран.</Banner>
        </div>
      )
    }

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <button onClick={() => go?.('clients')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)', padding: 0, marginBottom: 6 }}><I.ArrowLeft size={14} /> Клиенты</button>
            <h2 className="page-title">{account.full_name || account.username || 'Клиент'}</h2>
            <p className="page-desc">{account.phone || '-'} - {account.email || '-'}</p>
          </div>
          <div className="ops-button-row ops-page-actions">
            {!accountArchived && !loading && <AccessButtons Button={Button} portalAccess={account.portal_access} accessActivated={account.access_activated} busy={Boolean(actionBusy)} onAction={accessAction} />}
            {!accountArchived && <Button variant="primary" disabled={loading || actionBusy != null} onClick={openAccountEdit}>Редактировать клиента</Button>}
            {accountArchived && <Button variant="primary" disabled={loading || actionBusy != null} onClick={() => setConfirmAction({ type: 'restore' })}>Восстановить</Button>}
            <Button variant="secondary" disabled={loading} onClick={refreshDetail}>Обновить</Button>
          </div>
        </div>

        {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <ToastNotice id="admin-client-detail-result" message={message} />
        {activationInfo && <div style={{ marginBottom: 12 }}><AccessCodeCard info={activationInfo} Button={Button} onClose={() => setActivationInfo(null)} /></div>}
        <BusyBanner id="admin-client-detail-busy" show={loading}>Загружаю карточку клиента...</BusyBanner>
        {accountArchived && <Banner tone="warning" style={{ marginBottom: 12 }}><strong>Клиент находится в чёрном списке.</strong> Данные и история доступны только для просмотра. Восстановите клиента, чтобы снова выполнять действия.</Banner>}

        {editingAccount && (
          <div className="card card-pad ops-edit-panel">
            <div className="ops-section-head">
              <div>
                <div className="eyebrow">Редактирование клиента</div>
                <h3 className="section-title">Владелец аккаунта</h3>
              </div>
              <Button variant="subtle" disabled={actionBusy != null} onClick={() => setEditingAccount(false)}>Закрыть</Button>
            </div>
            <div className="ops-form-grid">
              <Input label="Имя" value={accountForm.firstName} onChange={(event) => setAccountForm({ ...accountForm, firstName: event.target.value })} />
              <Input label="Фамилия" value={accountForm.lastName} onChange={(event) => setAccountForm({ ...accountForm, lastName: event.target.value })} />
              <Input label="Email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} />
              <Input label="Телефон" value={accountForm.phone} onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value })} />
              <Input label="Telegram / соцсеть" value={accountForm.telegramChatId} onChange={(event) => setAccountForm({ ...accountForm, telegramChatId: event.target.value })} />
              <label>Язык интерфейса<select value={accountForm.preferredLanguage} onChange={(event) => setAccountForm({ ...accountForm, preferredLanguage: event.target.value })}><option value="ru">Русский</option><option value="pl">Polski</option><option value="en">English</option></select></label>
            </div>
            <div className="ops-button-row">
              <Button variant="primary" loading={actionBusy === 'account'} disabled={actionBusy != null} onClick={saveAccount}>Сохранить изменения</Button>
              <Button variant="secondary" disabled={actionBusy != null} onClick={() => setEditingAccount(false)}>Отмена</Button>
            </div>
          </div>
        )}

        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-label"><span className="kpi-ico"><I.Users size={15} /></span>Участники</div>
            <div className="kpi-value">{summary.participants_count ?? participants.length}</div>
            <div className="kpi-sub">Активны: {summary.active_participants ?? participants.filter((item) => item.is_active).length}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><span className="kpi-ico"><I.Layers size={15} /></span>Абонементы</div>
            <div className="kpi-value">{summary.active_subscriptions ?? subscriptions.filter((item) => item.status === 'active').length}</div>
            <div className="kpi-sub">Активные</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><span className="kpi-ico"><I.Cash size={15} /></span>Баланс</div>
            <div className="kpi-value">
              <Money amount={accountBalance} signed currency="zł" size="inherit" />
            </div>
            <div className="kpi-sub">{balanceCaption}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label"><span className="kpi-ico"><I.Alert size={15} /></span>Платежи</div>
            <div className="kpi-value">{summary.pending_payments ?? payments.filter((item) => item.status === 'pending').length}</div>
            <div className="kpi-sub">Ждут проверки</div>
          </div>
        </div>

        <div className="ops-action-strip" aria-label="Финансовые действия клиента">
          <button type="button" className="ops-action-card" disabled={accountArchived} onClick={() => { setTab('payments'); setPaymentPanelOpen(true); setFinanceAction(null) }}>
            <span>Добавить оплату</span>
            <small>Наличные или bank transfer / IBAN</small>
          </button>
          {[
            ['charge', 'Добавить списание', 'Сумма к оплате'],
            ['issue', 'Продать абонемент', 'Новый абонемент участнику'],
            ['renew', 'Продлить абонемент', 'Новый период и остаток'],
            ['freeze', 'Заморозить', 'Приостановить срок действия'],
            ['adjust', 'Скорректировать', 'Изменить остаток занятий'],
          ].map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              className={`ops-action-card${financeAction === value ? ' is-active' : ''}`}
              disabled={accountArchived}
              onClick={() => { setFinanceAction((current) => current === value ? null : value); setPaymentPanelOpen(false) }}
            >
              <span>{label}</span>
              <small>{hint}</small>
            </button>
          ))}
          <button type="button" className="ops-action-card" disabled={accountArchived || actionBusy != null} onClick={sendReminder}>
            <span>Напомнить</span>
            <small>Отправить финансовое уведомление</small>
          </button>
        </div>

        {financeAction && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {{ charge: 'Новое списание', issue: 'Продажа абонемента', renew: 'Продление абонемента', freeze: 'Заморозка абонемента', adjust: 'Корректировка остатка' }[financeAction]}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
              {(financeAction === 'charge' || financeAction === 'issue') && (
                <SearchableSelect
                  label="Участник"
                  value={financeForm.participantId}
                  onChange={(value) => updateFinanceForm('participantId', value)}
                  options={participants.map((participant) => clientSelectOption(participant))}
                />
              )}
              {(financeAction === 'renew' || financeAction === 'freeze' || financeAction === 'adjust') && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                  Абонемент
                  <select value={financeForm.subscriptionId} onChange={(event) => updateFinanceForm('subscriptionId', event.target.value)} style={{ minHeight: 36 }}>
                    <option value="">Выберите абонемент</option>
                    {subscriptions.map((subscription) => (
                      <option key={subscription.id} value={subscription.id}>
                        {subscription.participant?.full_name || participantName(subscription.participant_id)} · {subscription.type} · остаток {subscription.remaining_sessions ?? 'без лимита'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(financeAction === 'issue' || financeAction === 'renew') && (
                <>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                    Тип абонемента
                    <select value={financeForm.subscriptionTypeId} onChange={(event) => updateFinanceForm('subscriptionTypeId', event.target.value)} style={{ minHeight: 36 }}>
                      <option value="">Выберите тип</option>
                      {subscriptionTypes.map((type) => <option key={type.typeId} value={type.typeId}>{type.name} · {type.price} {type.currency}</option>)}
                    </select>
                  </label>
                  <DateField label="Дата начала" value={financeForm.startDate} onChange={(value) => updateFinanceForm('startDate', value)} />
                  <DateField label="Срок оплаты" value={financeForm.dueDate} onChange={(value) => updateFinanceForm('dueDate', value)} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, fontSize: 'var(--fs-sm)' }}>
                    <input type="checkbox" checked={financeForm.createCharge} onChange={(event) => updateFinanceForm('createCharge', event.target.checked)} />
                    Создать начисление
                  </label>
                </>
              )}
              {financeAction === 'charge' && (
                <>
                  <Input label="Описание" value={financeForm.description} onChange={(event) => updateFinanceForm('description', event.target.value)} />
                  <Input label="Сумма" value={financeForm.amount} onChange={(event) => updateFinanceForm('amount', event.target.value)} placeholder="240.00" />
                  <DateField label="Срок оплаты" value={financeForm.dueDate} onChange={(value) => updateFinanceForm('dueDate', value)} />
                </>
              )}
              {financeAction === 'freeze' && (
                <>
                  <DateField label="С даты" value={financeForm.freezeStart} onChange={(value) => updateFinanceForm('freezeStart', value)} />
                  <DateField label="По дату" value={financeForm.freezeEnd} onChange={(value) => updateFinanceForm('freezeEnd', value)} />
                  <Input label="Причина" value={financeForm.freezeReason} onChange={(event) => updateFinanceForm('freezeReason', event.target.value)} />
                </>
              )}
              {financeAction === 'adjust' && (
                <>
                  <Input label="Изменение занятий" value={financeForm.adjustDelta} onChange={(event) => updateFinanceForm('adjustDelta', event.target.value)} placeholder="Например, +1 или -1" />
                  <Input label="Комментарий" value={financeForm.adjustNote} onChange={(event) => updateFinanceForm('adjustNote', event.target.value)} />
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" loading={actionBusy === financeAction} disabled={actionBusy != null || loading} onClick={executeFinanceAction}>Сохранить</Button>
              <Button variant="secondary" disabled={actionBusy != null} onClick={() => setFinanceAction(null)}>Закрыть</Button>
            </div>
          </div>
        )}

        <div className="toolbar">
          <Tabs value={tab} onChange={setTab} style={{ border: 'none' }} items={[
            { value: 'participants', label: 'Участники', count: participants.length },
            { value: 'subscriptions', label: 'Абонементы', count: subscriptions.length },
            { value: 'payments', label: 'Платежи', count: payments.length + charges.length },
            { value: 'attendance', label: 'Посещения', count: attendance.length },
            { value: 'consents', label: 'Согласия', count: consents.length },
            { value: 'privacy', label: 'Данные и приватность' },
          ]} />
        </div>

        {tab === 'participants' && (
          <div>
          {editingParticipant && <div className="card card-pad" style={{ marginBottom: 12 }}><div className="eyebrow">Редактирование участника</div><div className="ops-form-grid"><Input label="Имя" value={participantForm.firstName} onChange={(event) => setParticipantForm({ ...participantForm, firstName: event.target.value })} /><Input label="Фамилия" value={participantForm.lastName} onChange={(event) => setParticipantForm({ ...participantForm, lastName: event.target.value })} /><DateField label="Дата рождения" value={participantForm.birthDate} onChange={(value) => setParticipantForm({ ...participantForm, birthDate: value })} /><Input label="Email" value={participantForm.email} onChange={(event) => setParticipantForm({ ...participantForm, email: event.target.value })} /><label>Группа<select value={participantForm.groupId} onChange={(event) => setParticipantForm({ ...participantForm, groupId: event.target.value })}><option value="">Индивидуально</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></label><label className="ops-check"><input type="checkbox" checked={participantForm.isActive} onChange={(event) => setParticipantForm({ ...participantForm, isActive: event.target.checked })} />Активен</label></div><div className="ops-button-row"><Button variant="primary" disabled={actionBusy != null} onClick={saveParticipant}>Сохранить</Button><Button variant="secondary" onClick={() => setEditingParticipant(null)}>Отмена</Button></div></div>}
          <Table
            rows={participants}
            emptyLabel="Участников нет"
            columns={[
              { key: 'full_name', header: 'Участник', render: (row) => <button type="button" className="ops-link-button" disabled={accountArchived} onClick={() => openParticipantEdit(row)}><Avatar name={row.full_name} size={28} /><span className="strong">{row.full_name}</span></button> },
              { key: 'birth_date', header: 'Дата рождения', muted: true, render: (row) => row.birth_date || '-' },
              { key: 'email', header: 'Email', muted: true, render: (row) => row.email || '-' },
              { key: 'group', header: 'Группа', render: (row) => row.group?.name || 'Индивидуально' },
              { key: 'balance', header: 'Баланс', align: 'right', width: 110, render: (row) => <Money amount={asAccountBalance(row.balance_minor)} signed /> },
              { key: 'status', header: 'Статус', width: 110, render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
            ]}
          />
          </div>
        )}

        {tab === 'subscriptions' && (
          <Table
            rows={subscriptions}
            emptyLabel="Абонементов нет"
            columns={[
              { key: 'type', header: 'Тип', render: (row) => <span className="strong">{row.type}</span> },
              { key: 'participant', header: 'Участник', render: (row) => row.participant?.full_name || participantName(row.participant_id) },
              { key: 'start_date', header: 'Начало', muted: true },
              { key: 'effective_end_date', header: 'Окончание', muted: true },
              { key: 'created_at', header: 'Оформлен', muted: true, render: (row) => row.created_at ? formatDate(row.created_at) : '-' },
              { key: 'remaining_sessions', header: 'Остаток', align: 'right', width: 90, render: (row) => row.remaining_sessions ?? 'Без лимита' },
              { key: 'status', header: 'Статус', width: 120, render: (row) => <StatusPill status={status(row.status)} size="sm" /> },
            ]}
          />
        )}

        {tab === 'payments' && (
          <div>
            {paymentPanelOpen && (
              <div className="card card-pad" style={{ marginBottom: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>Ручная оплата</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(3, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
                  <SearchableSelect
                    label="Участник"
                    value={paymentForm.participantId}
                    onChange={(value) => updatePaymentForm('participantId', value)}
                    options={participants.map((participant) => clientSelectOption(participant))}
                  />
                  <Input label="Сумма" value={paymentForm.amount} onChange={(event) => updatePaymentForm('amount', event.target.value)} placeholder="240.00" />
                  <DateField label="Дата оплаты" value={paymentForm.paidAt} onChange={(value) => updatePaymentForm('paidAt', value)} />
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--fs-sm)' }}>
                    Способ
                    <select value={paymentForm.method} onChange={(event) => updatePaymentForm('method', event.target.value)} style={{ minHeight: 36 }}>
                      <option value="cash">Наличные</option>
                      <option value="bank_transfer">Bank transfer / IBAN</option>
                      <option value="card">Карта</option>
                      <option value="other">Другое</option>
                      <option value="card">Карта</option>
                      <option value="other">Другое</option>
                    </select>
                  </label>
                  <Input label="Комментарий" value={paymentForm.comment} onChange={(event) => updatePaymentForm('comment', event.target.value)} placeholder="Опционально" />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                    <Button variant="primary" loading={actionBusy === 'manual-payment'} disabled={actionBusy != null || loading} onClick={createManualPayment}>Сохранить оплату</Button>
                    <Button variant="secondary" disabled={actionBusy != null} onClick={() => setPaymentPanelOpen(false)}>Закрыть</Button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 14 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Начисления</div>
              <Table
                rows={charges}
                emptyLabel="Начислений нет"
                columns={[
                  { key: 'description', header: 'Описание', render: (row) => <span className="strong">{row.description}</span> },
                  { key: 'participant', header: 'Участник', muted: true },
                  { key: 'due_date', header: 'Срок', muted: true },
                  { key: 'amount', header: 'Сумма', align: 'right', width: 100, render: (row) => <Money amount={money(row.amount_minor)} /> },
                ]}
              />
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Платежи</div>
              <Table
                rows={payments}
                emptyLabel="Платежей нет"
                columns={[
                  { key: 'participant', header: 'Участник', render: (row) => <span className="strong">{row.participant}</span> },
                  { key: 'method', header: 'Способ', muted: true, render: (row) => paymentMethodLabel(row.method) },
                  { key: 'paid_at', header: 'Дата', muted: true },
                  { key: 'amount', header: 'Сумма', align: 'right', width: 100, render: (row) => <Money amount={money(row.amount_minor)} /> },
                  { key: 'status', header: 'Статус', width: 110, render: (row) => <StatusPill status={status(row.status)} size="sm" /> },
                ]}
              />
            </div>
            </div>
          </div>
        )}

        {tab === 'attendance' && (
          <Table
            rows={attendance}
            emptyLabel="Посещений нет"
            columns={[
              { key: 'participant', header: 'Участник', render: (row) => <span className="strong">{row.participant}</span> },
              { key: 'session_start_at', header: 'Занятие', render: (row) => <button type="button" className="ops-link-button" onClick={() => go?.('attendance', { sessionId: row.session_id })}>{formatShortDate(row.session_start_at)} {formatTime(row.session_start_at)}-{formatTime(row.session_end_at)}</button> },
              { key: 'group', header: 'Группа', muted: true },
              { key: 'trainer', header: 'Тренер', muted: true },
              { key: 'status', header: 'Статус', width: 120, render: (row) => <StatusPill status={row.status} size="sm" /> },
              { key: 'deducts', header: 'Списание', width: 90, render: (row) => row.deducts ? <Badge tone="warning">-1</Badge> : <Badge tone="neutral">0</Badge> },
            ]}
          />
        )}

        {tab === 'consents' && (
          <Table
            rows={consents}
            emptyLabel="Согласий нет"
            columns={[
              { key: 'type_label', header: 'Согласие', render: (row) => <span className="strong">{row.type_label || row.type}</span> },
              { key: 'policy_version', header: 'Версия', muted: true, render: (row) => row.policy_version || '-' },
              { key: 'granted_at', header: 'Выдано', muted: true, render: (row) => row.granted_at ? formatDate(row.granted_at) : '-' },
              { key: 'revoked_at', header: 'Отозвано', muted: true, render: (row) => row.revoked_at ? formatDate(row.revoked_at) : '-' },
              { key: 'active', header: 'Статус', width: 110, render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
            ]}
          />
        )}

        {tab === 'privacy' && (
          <div className="card card-pad" style={{ maxWidth: 860 }}>
            <div className="page-head" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="section-title" style={{ margin: 0 }}>Данные клиента</h3>
                <p className="page-desc" style={{ marginTop: 4 }}>Экспорт, архивирование и анонимизация аккаунта.</p>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="strong">Экспорт данных клиента</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Скачивает данные аккаунта, участников, абонементов, платежей, посещений и согласий.</div>
                </div>
                <Button variant="secondary" loading={actionBusy === 'export'} disabled={actionBusy != null || loading} onClick={exportClientData}>Скачать данные</Button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="strong">Архивировать аккаунт</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Аккаунт и участники станут неактивными, история сохранится.</div>
                </div>
                <Button variant="secondary" loading={actionBusy === 'archive'} disabled={actionBusy != null || loading || account.is_active === false} onClick={() => setConfirmAction({ type: 'archive' })}>Архивировать</Button>
              </div>
              {accountArchived && <div className="ops-privacy-row">
                <div>
                  <div className="strong">Восстановить аккаунт</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Вернёт аккаунт и участников из чёрного списка в рабочий список.</div>
                </div>
                <Button variant="primary" loading={actionBusy === 'restore'} disabled={actionBusy != null || loading} onClick={() => setConfirmAction({ type: 'restore' })}>Восстановить</Button>
              </div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '12px 0' }}>
                <div>
                  <div className="strong">Анонимизировать персональные данные</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Удаляет контакты, чувствительные данные, согласия и файлы; финансовая история остаётся без персональных данных.</div>
                </div>
                <Button variant="danger" loading={actionBusy === 'anonymize'} disabled={actionBusy != null || loading} onClick={() => setConfirmAction({ type: 'anonymize' })}>Анонимизировать</Button>
              </div>
            </div>
          </div>
        )}

        {confirmAction && (
          <Dialog
            title={confirmAction.type === 'archive' ? 'Переместить клиента в чёрный список?' : confirmAction.type === 'restore' ? 'Восстановить клиента?' : 'Анонимизировать данные клиента?'}
            description={confirmAction.type === 'archive'
              ? 'Аккаунт и участники станут неактивными. Исторические данные останутся в системе.'
              : confirmAction.type === 'restore'
                ? 'Аккаунт и участники снова станут активными и появятся в рабочем списке.'
              : 'Персональные данные будут безвозвратно удалены или заменены техническими значениями. Операцию нельзя отменить.'}
            tone={confirmAction.type === 'restore' ? 'default' : 'danger'}
            irreversible={confirmAction.type === 'anonymize'}
            confirmLabel={confirmAction.type === 'archive' ? 'В чёрный список' : confirmAction.type === 'restore' ? 'Восстановить' : 'Анонимизировать'}
            onClose={() => actionBusy ? null : setConfirmAction(null)}
            onConfirm={runDangerAction}
          >
            <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              Клиент: <span className="strong">{account.full_name || account.username || fallbackClientId}</span>
            </div>
          </Dialog>
        )}
      </div>
    )
  }
}

