import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage, downloadFile } from '../../api.js'
import { asAccountBalance, asMoneyMajor, formatDate, formatShortDate, formatTime, paymentMethodLabel } from '../../mappers.js'
import {
  clearFieldError,
  fieldErrorsFromApi,
  focusFirstFieldError,
  formErrorMessage,
} from '../formErrors.js'
import { BusyBanner } from '../runtime.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'
import { DateField } from '../DateTimeField.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { AccessButtons, AccessCodeCard } from '../AccessControls.jsx'
import { validIsoDate } from '../scheduleContracts.js'

const PARTICIPANT_FIELD_IDS = {
  firstName: 'admin-client-participant-first-name',
  lastName: 'admin-client-participant-last-name',
  birthDate: 'admin-client-participant-birth-date',
  email: 'admin-client-participant-email',
  groupId: 'admin-client-participant-group',
  isActive: 'admin-client-participant-active',
}
const PAYMENT_FIELD_IDS = {
  participantId: 'admin-client-payment-participant',
  amount: 'admin-client-payment-amount', paidAt: 'admin-client-payment-date',
  method: 'admin-client-payment-method', comment: 'admin-client-payment-comment',
}
const FINANCE_FIELD_IDS = {
  participantId: 'admin-client-finance-participant',
  subscriptionId: 'admin-client-finance-subscription',
  subscriptionTypeId: 'admin-client-finance-subscription-type',
  amount: 'admin-client-finance-amount', description: 'admin-client-finance-description',
  startDate: 'admin-client-finance-start-date', dueDate: 'admin-client-finance-due-date',
  createCharge: 'admin-client-finance-create-charge',
  freezeStart: 'admin-client-finance-freeze-start',
  freezeEnd: 'admin-client-finance-freeze-end',
  freezeReason: 'admin-client-finance-freeze-reason',
  adjustDelta: 'admin-client-finance-adjust-delta',
  adjustNote: 'admin-client-finance-adjust-note',
}

export function createAdminClientDetailScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Avatar, Button, Banner, Tabs, Money, Badge, Dialog, Input, Select, Checkbox } = components
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
    const [accountForm, setAccountForm] = useState({ firstName: '', lastName: '', email: '', username: '', phone: '', telegramChatId: '', preferredLanguage: 'ru' })
    const [accountFieldErrors, setAccountFieldErrors] = useState({})
    const [editingParticipant, setEditingParticipant] = useState(null)
    const [participantForm, setParticipantForm] = useState({ firstName: '', lastName: '', birthDate: '', email: '', groupId: '', isActive: true })
    const [participantFieldErrors, setParticipantFieldErrors] = useState({})
    const [paymentForm, setPaymentForm] = useState({
      participantId: '',
      amount: '',
      paidAt: new Date().toISOString().slice(0, 10),
      method: 'cash',
      comment: '',
    })
    const [paymentFieldErrors, setPaymentFieldErrors] = useState({})
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
    const [financeFieldErrors, setFinanceFieldErrors] = useState({})

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
          if (alive) setError(apiErrorMessage(err, 'Не удалось загрузить карточку клиента.'))
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
    const updatePaymentForm = (field, value) => {
      setPaymentForm((current) => ({ ...current, [field]: value }))
      setPaymentFieldErrors((current) => clearFieldError(current, field))
    }
    const updateFinanceForm = (field, value) => {
      setFinanceForm((current) => ({ ...current, [field]: value }))
      setFinanceFieldErrors((current) => clearFieldError(current, field))
    }
    const updateParticipantForm = (field, value) => {
      setParticipantForm((current) => ({ ...current, [field]: value }))
      setParticipantFieldErrors((current) => clearFieldError(current, field))
    }

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
        setError(apiErrorMessage(err, 'Не удалось изменить доступ клиента.'))
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
      return Math.round(Number(String(value || 0).replace(',', '.')) * 100)
    }

    async function createManualPayment() {
      const nextErrors = {}
      if (!paymentForm.participantId) nextErrors.participantId = 'Выберите участника для оплаты.'
      const amount = Number(String(paymentForm.amount || '').replace(',', '.'))
      if (!Number.isFinite(amount) || amount <= 0) nextErrors.amount = 'Введите сумму оплаты больше нуля.'
      if (!validIsoDate(paymentForm.paidAt)) nextErrors.paidAt = 'Введите дату оплаты в формате ГГГГ-ММ-ДД.'
      if (!paymentForm.method) nextErrors.method = 'Выберите способ оплаты.'
      if (Object.keys(nextErrors).length) {
        setPaymentFieldErrors(nextErrors)
        setError(null)
        focusFirstFieldError(nextErrors, PAYMENT_FIELD_IDS)
        return
      }
      setError(null)
      setPaymentFieldErrors({})
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
        const nextFieldErrors = fieldErrorsFromApi(err, {
          participant_id: 'participantId', amount_minor: 'amount',
          paid_at: 'paidAt', method: 'method', comment: 'comment', currency: 'amount',
        })
        setPaymentFieldErrors(nextFieldErrors)
        setError(formErrorMessage(err, 'Не удалось сохранить оплату.'))
        focusFirstFieldError(nextFieldErrors, PAYMENT_FIELD_IDS)
      } finally {
        setActionBusy(null)
      }
    }

    function openParticipantEdit(participant) {
      setEditingParticipant(participant)
      setParticipantFieldErrors({})
      setParticipantForm({ firstName: participant.first_name || '', lastName: participant.last_name || '', birthDate: participant.birth_date || '', email: participant.email || '', groupId: participant.group?.id || '', isActive: participant.is_active })
    }

    function openAccountEdit() {
      setAccountFieldErrors({})
      setAccountForm({
        firstName: account.first_name || '',
        lastName: account.last_name || '',
        email: account.email || '',
        username: account.username || '',
        phone: account.phone || '',
        telegramChatId: account.telegram_chat_id || '',
        preferredLanguage: account.preferred_language || 'ru',
      })
      setEditingAccount(true)
    }

    function updateAccountForm(field, value) {
      setAccountFieldErrors((current) => clearFieldError(current, field))
      setAccountForm((current) => ({ ...current, [field]: value }))
    }

    async function saveAccount() {
      setActionBusy('account')
      setError(null)
      setAccountFieldErrors({})
      try {
        await api.post(`/api/admin/clients/${fallbackClientId}/`, { account: {
          first_name: accountForm.firstName,
          last_name: accountForm.lastName,
          email: accountForm.email,
          username: accountForm.username,
          phone: accountForm.phone,
          telegram_chat_id: accountForm.telegramChatId,
          preferred_language: accountForm.preferredLanguage,
        } })
        setMessage('Данные владельца аккаунта обновлены.')
        setEditingAccount(false)
        refreshDetail()
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, {
          'account.first_name': 'firstName',
          'account.last_name': 'lastName',
          'account.email': 'email',
          'account.username': 'username',
          'account.phone': 'phone',
          'account.telegram_chat_id': 'telegramChatId',
          'account.preferred_language': 'preferredLanguage',
        })
        setAccountFieldErrors(nextErrors)
        setError(formErrorMessage(err, 'Не удалось сохранить данные владельца.'))
        setTimeout(() => focusFirstFieldError(nextErrors, {
          firstName: 'admin-client-detail-firstName',
          lastName: 'admin-client-detail-lastName',
          email: 'admin-client-detail-email',
          username: 'admin-client-detail-username',
          phone: 'admin-client-detail-phone',
          telegramChatId: 'admin-client-detail-telegram',
          preferredLanguage: 'admin-client-detail-language',
        }), 0)
      } finally {
        setActionBusy(null)
      }
    }

    async function saveParticipant() {
      const nextErrors = {}
      if (!participantForm.firstName.trim()) nextErrors.firstName = 'Укажите имя участника.'
      if (!participantForm.lastName.trim()) nextErrors.lastName = 'Укажите фамилию участника.'
      if (participantForm.birthDate && !validIsoDate(participantForm.birthDate)) nextErrors.birthDate = 'Введите дату рождения в формате ГГГГ-ММ-ДД.'
      if (Object.keys(nextErrors).length) {
        setParticipantFieldErrors(nextErrors)
        setError(null)
        focusFirstFieldError(nextErrors, PARTICIPANT_FIELD_IDS)
        return
      }
      setActionBusy('participant'); setError(null); setParticipantFieldErrors({})
      try {
        await api.post(`/api/admin/participants/${editingParticipant.id}/`, { participant: { first_name: participantForm.firstName, last_name: participantForm.lastName, birth_date: participantForm.birthDate || null, email: participantForm.email, group_id: participantForm.groupId || null, is_active: participantForm.isActive } })
        setMessage('Данные участника обновлены.'); setEditingParticipant(null); refreshDetail()
      } catch (err) {
        const nextFieldErrors = fieldErrorsFromApi(err, {
          'participant.first_name': 'firstName', first_name: 'firstName',
          'participant.last_name': 'lastName', last_name: 'lastName',
          'participant.birth_date': 'birthDate', birth_date: 'birthDate',
          'participant.email': 'email', email: 'email',
          'participant.group_id': 'groupId', group_id: 'groupId',
          'participant.is_active': 'isActive', is_active: 'isActive',
        })
        setParticipantFieldErrors(nextFieldErrors)
        setError(formErrorMessage(err, 'Не удалось сохранить участника.'))
        focusFirstFieldError(nextFieldErrors, PARTICIPANT_FIELD_IDS)
      } finally { setActionBusy(null) }
    }

    async function sendReminder() {
      setActionBusy('reminder'); setError(null)
      try {
        await api.post('/api/admin/notifications/mass-mail/', { audience: 'selected', parent_ids: [account.id], channel: 'email', subject: 'Напоминание об оплате', body: 'Здравствуйте! Напоминаем проверить оплату и состояние абонемента в SwimCRM.' })
        setMessage('Напоминание поставлено в очередь.')
      } catch (err) { setError(apiErrorMessage(err, 'Не удалось отправить напоминание.')) } finally { setActionBusy(null) }
    }

    async function executeFinanceAction() {
      const participantRequired = financeAction === 'charge' || financeAction === 'issue'
      const subscriptionRequired = financeAction === 'renew' || financeAction === 'freeze' || financeAction === 'adjust'
      const typeRequired = financeAction === 'issue' || financeAction === 'renew'
      const nextErrors = {}
      if (participantRequired && !financeForm.participantId) nextErrors.participantId = 'Выберите участника.'
      if (subscriptionRequired && !financeForm.subscriptionId) nextErrors.subscriptionId = 'Выберите абонемент.'
      if (typeRequired && !financeForm.subscriptionTypeId) nextErrors.subscriptionTypeId = 'Выберите тип абонемента.'
      if (financeAction === 'charge') {
        const amount = Number(String(financeForm.amount || '').replace(',', '.'))
        if (!financeForm.description.trim()) nextErrors.description = 'Укажите описание начисления.'
        if (!Number.isFinite(amount) || amount <= 0) nextErrors.amount = 'Введите сумму больше нуля.'
        if (!validIsoDate(financeForm.dueDate)) nextErrors.dueDate = 'Введите срок оплаты в формате ГГГГ-ММ-ДД.'
      }
      if (financeAction === 'issue' || financeAction === 'renew') {
        if (!validIsoDate(financeForm.startDate)) nextErrors.startDate = 'Введите дату начала в формате ГГГГ-ММ-ДД.'
        if (financeForm.createCharge && !validIsoDate(financeForm.dueDate)) nextErrors.dueDate = 'Введите срок оплаты в формате ГГГГ-ММ-ДД.'
      }
      if (financeAction === 'freeze') {
        if (!validIsoDate(financeForm.freezeStart)) nextErrors.freezeStart = 'Введите дату начала заморозки.'
        if (!validIsoDate(financeForm.freezeEnd)) nextErrors.freezeEnd = 'Введите дату окончания заморозки.'
        if (validIsoDate(financeForm.freezeStart) && validIsoDate(financeForm.freezeEnd) && financeForm.freezeEnd < financeForm.freezeStart) nextErrors.freezeEnd = 'Дата окончания не может быть раньше даты начала.'
      }
      if (financeAction === 'adjust') {
        const delta = Number(financeForm.adjustDelta)
        if (!Number.isInteger(delta) || delta === 0) nextErrors.adjustDelta = 'Введите целое число, отличное от нуля.'
      }
      if (Object.keys(nextErrors).length) {
        setFinanceFieldErrors(nextErrors)
        setError(null)
        focusFirstFieldError(nextErrors, FINANCE_FIELD_IDS)
        return
      }

      setError(null)
      setFinanceFieldErrors({})
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
        const nextFieldErrors = fieldErrorsFromApi(err, {
          participant_id: 'participantId', subscription_id: 'subscriptionId',
          subscription_type_id: 'subscriptionTypeId', amount_minor: 'amount',
          description: 'description', start_date: financeAction === 'freeze' ? 'freezeStart' : 'startDate',
          due_date: 'dueDate', end_date: 'freezeEnd', reason: 'freezeReason',
          delta: 'adjustDelta', note: 'adjustNote', create_charge: 'createCharge',
          currency: 'amount',
        })
        setFinanceFieldErrors(nextFieldErrors)
        setError(formErrorMessage(err, 'Не удалось выполнить финансовую операцию.'))
        focusFirstFieldError(nextFieldErrors, FINANCE_FIELD_IDS)
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
        setError(apiErrorMessage(err, 'Не удалось экспортировать данные клиента.'))
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
        setError(apiErrorMessage(err, 'Не удалось выполнить действие с клиентом.'))
      } finally {
        setActionBusy(null)
      }
    }

    if (!fallbackClientId) {
      return (
        <div className="page page-wide">
          <div className="page-head">
            <div>
              <h1 className="page-title">Клиент</h1>
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
            <h1 className="page-title">{account.full_name || account.username || 'Клиент'}</h1>
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
              <Input id="admin-client-detail-firstName" label="Имя" value={accountForm.firstName} error={accountFieldErrors.firstName} onChange={(event) => updateAccountForm('firstName', event.target.value)} />
              <Input id="admin-client-detail-lastName" label="Фамилия" value={accountForm.lastName} error={accountFieldErrors.lastName} onChange={(event) => updateAccountForm('lastName', event.target.value)} />
              <Input id="admin-client-detail-email" label="Email" value={accountForm.email} error={accountFieldErrors.email} onChange={(event) => updateAccountForm('email', event.target.value)} />
              <Input id="admin-client-detail-username" label="Логин" value={accountForm.username} error={accountFieldErrors.username} onChange={(event) => updateAccountForm('username', event.target.value)} />
              <Input id="admin-client-detail-phone" label="Телефон" value={accountForm.phone} error={accountFieldErrors.phone} onChange={(event) => updateAccountForm('phone', event.target.value)} />
              <Input id="admin-client-detail-telegram" label="Telegram / соцсеть" value={accountForm.telegramChatId} error={accountFieldErrors.telegramChatId} onChange={(event) => updateAccountForm('telegramChatId', event.target.value)} />
              <Select id="admin-client-detail-language" label="Язык интерфейса" value={accountForm.preferredLanguage} error={accountFieldErrors.preferredLanguage} onChange={(event) => updateAccountForm('preferredLanguage', event.target.value)}><option value="ru">Русский</option><option value="pl">Polski</option><option value="en">English</option></Select>
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
          <button type="button" className="ops-action-card" disabled={accountArchived} onClick={() => { setTab('payments'); setPaymentPanelOpen(true); setPaymentFieldErrors({}); setFinanceAction(null) }}>
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
              onClick={() => { setFinanceAction((current) => current === value ? null : value); setFinanceFieldErrors({}); setPaymentPanelOpen(false) }}
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
                  inputId={FINANCE_FIELD_IDS.participantId}
                  label="Участник"
                  value={financeForm.participantId}
                  error={financeFieldErrors.participantId}
                  onChange={(value) => updateFinanceForm('participantId', value)}
                  options={participants.map((participant) => clientSelectOption(participant))}
                />
              )}
              {(financeAction === 'renew' || financeAction === 'freeze' || financeAction === 'adjust') && (
                <Select id={FINANCE_FIELD_IDS.subscriptionId} label="Абонемент" value={financeForm.subscriptionId} error={financeFieldErrors.subscriptionId} onChange={(event) => updateFinanceForm('subscriptionId', event.target.value)}>
                    <option value="">Выберите абонемент</option>
                    {subscriptions.map((subscription) => (
                      <option key={subscription.id} value={subscription.id}>
                        {subscription.participant?.full_name || participantName(subscription.participant_id)} · {subscription.type} · остаток {subscription.remaining_sessions ?? 'без лимита'}
                      </option>
                    ))}
                </Select>
              )}
              {(financeAction === 'issue' || financeAction === 'renew') && (
                <>
                  <Select id={FINANCE_FIELD_IDS.subscriptionTypeId} label="Тип абонемента" value={financeForm.subscriptionTypeId} error={financeFieldErrors.subscriptionTypeId} onChange={(event) => updateFinanceForm('subscriptionTypeId', event.target.value)}>
                      <option value="">Выберите тип</option>
                      {subscriptionTypes.map((type) => <option key={type.typeId} value={type.typeId}>{type.name} · {type.price} {type.currency}</option>)}
                  </Select>
                  <DateField id={FINANCE_FIELD_IDS.startDate} label="Дата начала" value={financeForm.startDate} error={financeFieldErrors.startDate} onChange={(value) => updateFinanceForm('startDate', value)} />
                  <DateField id={FINANCE_FIELD_IDS.dueDate} label="Срок оплаты" value={financeForm.dueDate} error={financeFieldErrors.dueDate} onChange={(value) => updateFinanceForm('dueDate', value)} />
                  <Checkbox id={FINANCE_FIELD_IDS.createCharge} label="Создать начисление" checked={financeForm.createCharge} error={financeFieldErrors.createCharge} onChange={(event) => updateFinanceForm('createCharge', event.target.checked)} />
                </>
              )}
              {financeAction === 'charge' && (
                <>
                  <Input id={FINANCE_FIELD_IDS.description} label="Описание" value={financeForm.description} error={financeFieldErrors.description} onChange={(event) => updateFinanceForm('description', event.target.value)} />
                  <Input id={FINANCE_FIELD_IDS.amount} label="Сумма" value={financeForm.amount} error={financeFieldErrors.amount} onChange={(event) => updateFinanceForm('amount', event.target.value)} placeholder="240.00" />
                  <DateField id={FINANCE_FIELD_IDS.dueDate} label="Срок оплаты" value={financeForm.dueDate} error={financeFieldErrors.dueDate} onChange={(value) => updateFinanceForm('dueDate', value)} />
                </>
              )}
              {financeAction === 'freeze' && (
                <>
                  <DateField id={FINANCE_FIELD_IDS.freezeStart} label="С даты" value={financeForm.freezeStart} error={financeFieldErrors.freezeStart} onChange={(value) => updateFinanceForm('freezeStart', value)} />
                  <DateField id={FINANCE_FIELD_IDS.freezeEnd} label="По дату" value={financeForm.freezeEnd} error={financeFieldErrors.freezeEnd} onChange={(value) => updateFinanceForm('freezeEnd', value)} />
                  <Input id={FINANCE_FIELD_IDS.freezeReason} label="Причина" value={financeForm.freezeReason} error={financeFieldErrors.freezeReason} onChange={(event) => updateFinanceForm('freezeReason', event.target.value)} />
                </>
              )}
              {financeAction === 'adjust' && (
                <>
                  <Input id={FINANCE_FIELD_IDS.adjustDelta} label="Изменение занятий" value={financeForm.adjustDelta} error={financeFieldErrors.adjustDelta} onChange={(event) => updateFinanceForm('adjustDelta', event.target.value)} placeholder="Например, +1 или -1" />
                  <Input id={FINANCE_FIELD_IDS.adjustNote} label="Комментарий" value={financeForm.adjustNote} error={financeFieldErrors.adjustNote} onChange={(event) => updateFinanceForm('adjustNote', event.target.value)} />
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button variant="primary" loading={actionBusy === financeAction} disabled={actionBusy != null || loading} onClick={executeFinanceAction}>Сохранить</Button>
              <Button variant="secondary" disabled={actionBusy != null} onClick={() => { setFinanceAction(null); setFinanceFieldErrors({}) }}>Закрыть</Button>
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
          {editingParticipant && <div className="card card-pad" style={{ marginBottom: 12 }}>
            <div className="eyebrow">Редактирование участника</div>
            <div className="ops-form-grid">
              <Input id={PARTICIPANT_FIELD_IDS.firstName} label="Имя" value={participantForm.firstName} error={participantFieldErrors.firstName} onChange={(event) => updateParticipantForm('firstName', event.target.value)} />
              <Input id={PARTICIPANT_FIELD_IDS.lastName} label="Фамилия" value={participantForm.lastName} error={participantFieldErrors.lastName} onChange={(event) => updateParticipantForm('lastName', event.target.value)} />
              <DateField id={PARTICIPANT_FIELD_IDS.birthDate} label="Дата рождения" value={participantForm.birthDate} error={participantFieldErrors.birthDate} onChange={(value) => updateParticipantForm('birthDate', value)} />
              <Input id={PARTICIPANT_FIELD_IDS.email} label="Email" value={participantForm.email} error={participantFieldErrors.email} onChange={(event) => updateParticipantForm('email', event.target.value)} />
              <Select id={PARTICIPANT_FIELD_IDS.groupId} label="Группа" value={participantForm.groupId} error={participantFieldErrors.groupId} onChange={(event) => updateParticipantForm('groupId', event.target.value)}><option value="">Индивидуально</option>{groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</Select>
              <Checkbox id={PARTICIPANT_FIELD_IDS.isActive} label="Активен" checked={participantForm.isActive} error={participantFieldErrors.isActive} onChange={(event) => updateParticipantForm('isActive', event.target.checked)} />
            </div>
            <div className="ops-button-row"><Button variant="primary" disabled={actionBusy != null} onClick={saveParticipant}>Сохранить</Button><Button variant="secondary" onClick={() => { setEditingParticipant(null); setParticipantFieldErrors({}) }}>Отмена</Button></div>
          </div>}
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
                    inputId={PAYMENT_FIELD_IDS.participantId}
                    label="Участник"
                    value={paymentForm.participantId}
                    error={paymentFieldErrors.participantId}
                    onChange={(value) => updatePaymentForm('participantId', value)}
                    options={participants.map((participant) => clientSelectOption(participant))}
                  />
                  <Input id={PAYMENT_FIELD_IDS.amount} label="Сумма" value={paymentForm.amount} error={paymentFieldErrors.amount} onChange={(event) => updatePaymentForm('amount', event.target.value)} placeholder="240.00" />
                  <DateField id={PAYMENT_FIELD_IDS.paidAt} label="Дата оплаты" value={paymentForm.paidAt} error={paymentFieldErrors.paidAt} onChange={(value) => updatePaymentForm('paidAt', value)} />
                  <Select id={PAYMENT_FIELD_IDS.method} label="Способ" value={paymentForm.method} error={paymentFieldErrors.method} onChange={(event) => updatePaymentForm('method', event.target.value)}>
                      <option value="cash">Наличные</option>
                      <option value="bank_transfer">Bank transfer / IBAN</option>
                      <option value="card">Карта</option>
                      <option value="other">Другое</option>
                  </Select>
                  <Input id={PAYMENT_FIELD_IDS.comment} label="Комментарий" value={paymentForm.comment} error={paymentFieldErrors.comment} onChange={(event) => updatePaymentForm('comment', event.target.value)} placeholder="Опционально" />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                    <Button variant="primary" loading={actionBusy === 'manual-payment'} disabled={actionBusy != null || loading} onClick={createManualPayment}>Сохранить оплату</Button>
                    <Button variant="secondary" disabled={actionBusy != null} onClick={() => { setPaymentPanelOpen(false); setPaymentFieldErrors({}) }}>Закрыть</Button>
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

