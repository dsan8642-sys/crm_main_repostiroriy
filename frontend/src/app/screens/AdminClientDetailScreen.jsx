import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage, downloadFile } from '../../api.js'
import { adminLocaleTag } from '../../adminLocales.js'
import { adminFinanceTranslator } from '../../adminFinanceLocales.js'
import { paymentMethodLabel } from '../../contracts.js'
import { useLocale } from '../../i18n.jsx'
import {
  assertPaymentReadback,
  assertChargeReadback,
  createPaymentAttemptKey,
  moneyMajorToMinor,
} from '../financialContracts.js'
import { asAccountBalance, asMoneyMajor, formatTime } from '../../mappers.js'
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
import { FormModal } from '../FormModal.jsx'
import { ContextBackButton } from '../EntityListPrimitives.jsx'
import { GroupMultiSelect } from '../GroupMultiSelect.jsx'

const PARTICIPANT_FIELD_IDS = {
  firstName: 'admin-client-participant-first-name',
  lastName: 'admin-client-participant-last-name',
  birthDate: 'admin-client-participant-birth-date',
  email: 'admin-client-participant-email',
  groupIds: 'admin-client-participant-groups',
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
  subscriptionAction: 'admin-client-finance-subscription-action',
  subscriptionTypeId: 'admin-client-finance-subscription-type',
  amount: 'admin-client-finance-amount', description: 'admin-client-finance-description',
  startDate: 'admin-client-finance-start-date', dueDate: 'admin-client-finance-due-date',
  freezeStart: 'admin-client-finance-freeze-start',
  freezeEnd: 'admin-client-finance-freeze-end',
  freezeReason: 'admin-client-finance-freeze-reason',
  adjustDelta: 'admin-client-finance-adjust-delta',
  adjustNote: 'admin-client-finance-adjust-note',
}

const SUBSCRIPTION_EDIT_ACTIONS = ['renew', 'freeze', 'adjust']

function internationalPhoneDigits(value) {
  const compact = String(value || '').replace(/[\s().-]/g, '')
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) return null
  return compact.slice(1)
}

function ContactLink({ href, label, disabledHint }) {
  if (!href) return <span className="ops-contact-link is-disabled" aria-disabled="true" title={disabledHint}>{label}</span>
  return <a className="ops-contact-link" href={href} target="_blank" rel="noopener noreferrer">{label}</a>
}

export function createAdminClientDetailScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Avatar, Button, Banner, Tabs, Money, Badge, Dialog, Input, Select, Checkbox } = components
  const I = icons

  return function ApiAdminClientDetail({
    go, back, clientId, initialTab, initialParticipantId, initialFinanceAction,
    initialSubscriptionId, prefillAmount,
  }) {
    const { locale } = useLocale()
    const t = useMemo(() => adminFinanceTranslator(locale), [locale])
    const localeTag = adminLocaleTag(locale)
    const formatLocalDate = (value) => new Intl.DateTimeFormat(localeTag).format(new Date(value))
    const formatLocalShortDate = (value) => new Intl.DateTimeFormat(localeTag, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value))
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
    const [accountForm, setAccountForm] = useState({ firstName: '', lastName: '', email: '', username: '', phone: '', telegramChatId: '', instagramUsername: '', preferredLanguage: 'ru' })
    const [accountBaseline, setAccountBaseline] = useState(null)
    const [accountFieldErrors, setAccountFieldErrors] = useState({})
    const [editingParticipant, setEditingParticipant] = useState(null)
    const [participantForm, setParticipantForm] = useState({ firstName: '', lastName: '', birthDate: '', email: '', groupIds: [], isActive: true })
    const [participantBaseline, setParticipantBaseline] = useState(null)
    const [participantFieldErrors, setParticipantFieldErrors] = useState({})
    const [paymentForm, setPaymentForm] = useState({
      participantId: '',
      amount: '',
      paidAt: new Date().toISOString().slice(0, 10),
      method: 'cash',
      comment: '',
      idempotencyKey: createPaymentAttemptKey('admin-payment'),
    })
    const [paymentFieldErrors, setPaymentFieldErrors] = useState({})
    const [paymentBaseline, setPaymentBaseline] = useState(null)
    const [financeForm, setFinanceForm] = useState({
      participantId: '',
      subscriptionId: '',
      subscriptionTypeId: '',
      amount: '',
      description: '',
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      chargeIdempotencyKey: createPaymentAttemptKey('admin-charge'),
      subscriptionIdempotencyKey: createPaymentAttemptKey('admin-subscription'),
      freezeStart: new Date().toISOString().slice(0, 10),
      freezeEnd: '',
      freezeReason: '',
      adjustDelta: '',
      adjustNote: '',
    })
    const [financeFieldErrors, setFinanceFieldErrors] = useState({})
    const [financeBaseline, setFinanceBaseline] = useState(null)
    const [reversalTarget, setReversalTarget] = useState(null)
    const [reversalReason, setReversalReason] = useState('')
    const [reversalIdempotencyKey, setReversalIdempotencyKey] = useState('')
    const [reversalReasonError, setReversalReasonError] = useState(null)
    const debtPrefillHandledRef = React.useRef(false)
    const financeRouteHandledRef = React.useRef(false)

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
          if (alive) setError(apiErrorMessage(err, t('client.loadError')))
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
    const accountArchived = account.is_active === false || (participants.length > 0 && participants.every((item) => item.is_active === false))
    const accountDisplayName = [account.first_name, account.last_name]
      .map((value) => String(value || '').trim().replace(/^[-–—]+|[-–—]+$/g, ''))
      .filter(Boolean)
      .join(' ') || String(account.full_name || account.username || t('client.title'))
        .replace(/\s*[-–—]+\s*$/g, '').trim()
    const subscriptionTypes = adminData.subscriptionTypes || []
    const groups = adminData.groups || []
    const contactPhoneDigits = internationalPhoneDigits(account.phone)
    const contactsHidden = Boolean(account.is_anonymized)
    const phoneContactHint = t('client.phoneHint')
    const selectedParticipant = participants.find(
      (participant) => String(participant.id) === String(initialParticipantId),
    ) || participants[0] || null
    const selectedParticipantId = String(selectedParticipant?.id || '')
    const selectedSubscriptions = useMemo(() => subscriptions.filter(
      (row) => String(row.participant_id ?? row.participant?.id ?? '') === selectedParticipantId,
    ), [selectedParticipantId, subscriptions])
    const selectedCharges = useMemo(() => charges.filter(
      (row) => String(row.participant_id ?? row.participant?.id ?? '') === selectedParticipantId,
    ), [charges, selectedParticipantId])
    const selectedPayments = useMemo(() => payments.filter(
      (row) => String(row.participant_id ?? row.participant?.id ?? '') === selectedParticipantId,
    ), [payments, selectedParticipantId])
    const selectedAttendance = useMemo(() => attendance.filter(
      (row) => String(row.participant_id ?? row.participant?.id ?? '') === selectedParticipantId,
    ), [attendance, selectedParticipantId])
    const selectedSubscription = subscriptions.find((subscription) => (
      String(subscription.participant_id) === String(selectedParticipant?.id)
        && subscription.status === 'active'
    )) || subscriptions.find((subscription) => String(subscription.participant_id) === String(selectedParticipant?.id))

    useEffect(() => {
      if (initialTab) setTab(initialTab)
    }, [initialTab])

    const participantName = (id) => participants.find((participant) => participant.id === id)?.full_name || '-'
    const money = (minor) => asMoneyMajor(minor || 0)
    const accountBalance = asAccountBalance(summary.balance_minor)
    const selectedParticipantBalance = selectedParticipant
      ? asAccountBalance(selectedParticipant.balance_minor)
      : accountBalance
    const balanceCaption = accountBalance > 0
      ? t('client.overpayment')
      : accountBalance < 0
        ? t('client.amountDue')
        : t('client.balanceSettled')
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
    const updateFinanceSubscription = (subscriptionId) => {
      const subscription = subscriptions.find((item) => String(item.id) === String(subscriptionId))
      setFinanceForm((current) => ({
        ...current,
        subscriptionId,
        subscriptionTypeId: subscription?.subscription_type_id
          ? String(subscription.subscription_type_id)
          : current.subscriptionTypeId,
      }))
      setFinanceFieldErrors((current) => clearFieldError(current, 'subscriptionId'))
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
          setMessage(t('client.accessRevoked'))
        } else {
          setActivationInfo(payload)
        }
        refreshDetail()
      } catch (err) {
        setError(apiErrorMessage(err, t('client.accessError')))
      } finally {
        setActionBusy(null)
      }
    }

    useEffect(() => {
      if (!participants.length) return
      const participantIdForClient = (currentId) => (
        participants.some((participant) => String(participant.id) === String(currentId))
          ? String(currentId)
          : String(participants[0].id)
      )
      setPaymentForm((current) => ({
        ...current,
        participantId: participantIdForClient(current.participantId),
      }))
      setFinanceForm((current) => ({
        ...current,
        participantId: participantIdForClient(current.participantId),
        subscriptionId: subscriptions.some((item) => String(item.id) === String(current.subscriptionId))
          ? current.subscriptionId
          : String(subscriptions[0]?.id || ''),
        subscriptionTypeId: current.subscriptionTypeId || String(subscriptionTypes[0]?.typeId || ''),
      }))
    }, [participants, subscriptions, subscriptionTypes])

    useEffect(() => {
      if (!selectedParticipantId) return
      setPaymentForm((current) => ({ ...current, participantId: selectedParticipantId }))
      setFinanceForm((current) => ({
        ...current,
        participantId: selectedParticipantId,
        subscriptionId: selectedSubscriptions.some((item) => String(item.id) === String(current.subscriptionId))
          ? current.subscriptionId
          : String(selectedSubscriptions[0]?.id || ''),
      }))
    }, [selectedParticipantId, selectedSubscriptions])

    useEffect(() => {
      if (debtPrefillHandledRef.current || !prefillAmount || !participants.length) return
      const participantId = participants.some((participant) => String(participant.id) === String(initialParticipantId))
        ? String(initialParticipantId)
        : String(participants[0].id)
      const next = {
        ...paymentForm,
        participantId,
        amount: String(prefillAmount),
        idempotencyKey: createPaymentAttemptKey('admin-payment'),
      }
      debtPrefillHandledRef.current = true
      setTab('payments')
      setPaymentForm(next)
      setPaymentBaseline(next)
      setPaymentFieldErrors({})
      setFinanceAction(null)
      setFinanceBaseline(null)
      setPaymentPanelOpen(true)
    }, [initialParticipantId, participants, paymentForm, prefillAmount])

    function minorFromMajor(value) {
      return Math.round(Number(String(value || 0).replace(',', '.')) * 100)
    }

    const selectedPaymentParticipant = participants.find((participant) => String(participant.id) === String(paymentForm.participantId))
    const selectedPaymentBalance = selectedPaymentParticipant
      ? asAccountBalance(selectedPaymentParticipant.balance_minor)
      : accountBalance
    const selectedChargeParticipant = participants.find(
      (participant) => String(participant.id) === String(financeForm.participantId),
    )
    const chargePreviewMinor = moneyMajorToMinor(financeForm.amount) || 0
    const chargeBalanceBefore = selectedChargeParticipant
      ? asAccountBalance(selectedChargeParticipant.balance_minor)
      : accountBalance
    const chargeBalanceAfter = chargeBalanceBefore - asMoneyMajor(chargePreviewMinor)

    function selectParticipant(participantId) {
      go?.('clientDetail', {
        clientId: fallbackClientId,
        participantId: String(participantId),
        tab,
      })
    }

    function openChargeReversal(charge) {
      setReversalTarget(charge)
      setReversalReason('')
      setReversalReasonError(null)
      setReversalIdempotencyKey(createPaymentAttemptKey('admin-charge-reversal'))
    }

    async function reverseCharge() {
      const reason = reversalReason.trim()
      if (!reason) {
        setReversalReasonError(t('finance.reverseReasonRequired'))
        return
      }
      if (!reversalTarget) return
      setActionBusy('reverse-charge')
      setError(null)
      try {
        const mutation = await api.post(`/api/admin/charges/${reversalTarget.id}/reverse/`, {
          reason,
          idempotency_key: reversalIdempotencyKey,
        })
        const clientReadback = await api.get(`/api/admin/clients/${fallbackClientId}/`)
        assertChargeReadback(mutation, clientReadback)
        setDetail(clientReadback)
        setMessage(t('finance.chargeReversed', { balance: asAccountBalance(mutation.balance_minor).toFixed(2).replace('.', ',') }))
        setReversalTarget(null)
        setReversalReason('')
      } catch (err) {
        setError(apiErrorMessage(err, t('finance.reverseChargeDescription')))
      } finally {
        setActionBusy(null)
      }
    }

    function openPaymentPanel() {
      const next = {
        ...paymentForm,
        idempotencyKey: createPaymentAttemptKey('admin-payment'),
      }
      setTab('payments')
      setPaymentForm(next)
      setPaymentBaseline(next)
      setPaymentFieldErrors({})
      setFinanceAction(null)
      setFinanceBaseline(null)
      setPaymentPanelOpen(true)
    }

    function openSubscriptionEditor(subscription = null) {
      const selectedSubscription = subscription
        || subscriptions.find((item) => item.status === 'active')
        || subscriptions[0]
      const next = {
        ...financeForm,
        subscriptionId: String(selectedSubscription?.id || ''),
        subscriptionTypeId: String(
          selectedSubscription?.subscription_type_id
          || financeForm.subscriptionTypeId
          || subscriptionTypes[0]?.typeId
          || '',
        ),
        subscriptionIdempotencyKey: createPaymentAttemptKey('admin-subscription'),
      }
      setFinanceForm(next)
      setFinanceBaseline(next)
      setFinanceFieldErrors({})
      setFinanceAction('renew')
      setPaymentPanelOpen(false)
      setPaymentBaseline(null)
      setError(null)
    }

    useEffect(() => {
      if (financeRouteHandledRef.current || !initialFinanceAction || !participants.length) return
      const selectedSubscription = subscriptions.find(
        (item) => String(item.id) === String(initialSubscriptionId)) || null
      const participantId = participants.some(
        (item) => String(item.id) === String(initialParticipantId))
        ? String(initialParticipantId)
        : String(selectedSubscription?.participant_id || participants[0].id)
      const next = {
        ...financeForm,
        participantId,
        subscriptionId: String(selectedSubscription?.id || ''),
        subscriptionTypeId: String(
          selectedSubscription?.subscription_type_id || subscriptionTypes[0]?.typeId || ''),
        subscriptionIdempotencyKey: createPaymentAttemptKey('admin-subscription'),
      }
      financeRouteHandledRef.current = true
      setTab('subscriptions')
      setFinanceForm(next)
      setFinanceBaseline(next)
      setFinanceFieldErrors({})
      setFinanceAction(initialFinanceAction)
      setPaymentPanelOpen(false)
    }, [financeForm, initialFinanceAction, initialParticipantId, initialSubscriptionId, participants, subscriptionTypes, subscriptions])

    async function createManualPayment() {
      const nextErrors = {}
      if (!paymentForm.participantId) nextErrors.participantId = t('finance.selectPaymentParticipantError')
      let amountMinor = null
      amountMinor = moneyMajorToMinor(paymentForm.amount)
      if (!amountMinor) {
        nextErrors.amount = t('finance.preciseAmountError')
      }
      if (!validIsoDate(paymentForm.paidAt)) nextErrors.paidAt = t('finance.paidAtError')
      if (!paymentForm.method) nextErrors.method = t('finance.paymentMethodError')
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
        const created = await api.post('/api/admin/payments/', {
          client_id: fallbackClientId,
          participant_id: paymentForm.participantId,
          amount_minor: amountMinor,
          currency: 'PLN',
          paid_at: paymentForm.paidAt,
          method: paymentForm.method,
          comment: paymentForm.comment,
          confirm: true,
          idempotency_key: paymentForm.idempotencyKey,
        })
        const paymentReadback = await api.get(`/api/admin/payments/${created.id}/`)
        assertPaymentReadback(created, paymentReadback, 'confirmed')
        const clientReadback = await api.get(`/api/admin/clients/${fallbackClientId}/`)
        setDetail(clientReadback)
        const checkedBalance = asAccountBalance(clientReadback?.summary?.balance_minor)
        setMessage(t('finance.paymentSaved', { balance: checkedBalance.toFixed(2).replace('.', ',') }))
        setPaymentPanelOpen(false)
        setPaymentBaseline(null)
        setPaymentForm((current) => ({
          ...current,
          amount: '',
          comment: '',
          idempotencyKey: createPaymentAttemptKey('admin-payment'),
        }))
        reloadRoleData?.('admin')
      } catch (err) {
        const nextFieldErrors = fieldErrorsFromApi(err, {
          client_id: 'participantId', participant_id: 'participantId', amount_minor: 'amount',
          paid_at: 'paidAt', method: 'method', comment: 'comment', currency: 'amount',
        })
        setPaymentFieldErrors(nextFieldErrors)
        setError(formErrorMessage(err, t('finance.savePaymentError')))
        focusFirstFieldError(nextFieldErrors, PAYMENT_FIELD_IDS)
      } finally {
        setActionBusy(null)
      }
    }

    function openParticipantEdit(participant) {
      setEditingParticipant(participant)
      setParticipantFieldErrors({})
      const next = { firstName: participant.first_name || '', lastName: participant.last_name || '', birthDate: participant.birth_date || '', email: participant.email || '', groupIds: (participant.groups || []).map((group) => String(group.id)), isActive: participant.is_active }
      setParticipantForm(next)
      setParticipantBaseline(next)
    }

    function openAccountEdit() {
      setAccountFieldErrors({})
      const next = {
        firstName: account.first_name || '',
        lastName: account.last_name || '',
        email: account.email || '',
        username: account.username || '',
        phone: account.phone || '',
        telegramChatId: account.telegram_chat_id || '',
        instagramUsername: account.instagram_username || '',
        preferredLanguage: account.preferred_language || 'ru',
      }
      setAccountForm(next)
      setAccountBaseline(next)
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
          instagram_username: accountForm.instagramUsername,
          preferred_language: accountForm.preferredLanguage,
        } })
        setMessage(t('client.ownerUpdated'))
        setEditingAccount(false)
        setAccountBaseline(null)
        refreshDetail()
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, {
          'account.first_name': 'firstName',
          'account.last_name': 'lastName',
          'account.email': 'email',
          'account.username': 'username',
          'account.phone': 'phone',
          'account.telegram_chat_id': 'telegramChatId',
          'account.instagram_username': 'instagramUsername',
          'account.preferred_language': 'preferredLanguage',
        })
        setAccountFieldErrors(nextErrors)
        setError(formErrorMessage(err, t('client.ownerSaveError')))
        setTimeout(() => focusFirstFieldError(nextErrors, {
          firstName: 'admin-client-detail-firstName',
          lastName: 'admin-client-detail-lastName',
          email: 'admin-client-detail-email',
          username: 'admin-client-detail-username',
          phone: 'admin-client-detail-phone',
          telegramChatId: 'admin-client-detail-telegram',
          instagramUsername: 'admin-client-detail-instagram',
          preferredLanguage: 'admin-client-detail-language',
        }), 0)
      } finally {
        setActionBusy(null)
      }
    }

    async function saveParticipant() {
      const nextErrors = {}
      if (!participantForm.firstName.trim() && !participantForm.lastName.trim()) {
        nextErrors.firstName = t('client.participantNameError')
        nextErrors.lastName = t('client.participantNameError')
      }
      if (participantForm.birthDate && !validIsoDate(participantForm.birthDate)) nextErrors.birthDate = t('client.birthDateError')
      if (Object.keys(nextErrors).length) {
        setParticipantFieldErrors(nextErrors)
        setError(null)
        focusFirstFieldError(nextErrors, PARTICIPANT_FIELD_IDS)
        return
      }
      setActionBusy('participant'); setError(null); setParticipantFieldErrors({})
      try {
        await api.post(`/api/admin/participants/${editingParticipant.id}/`, { participant: { first_name: participantForm.firstName, last_name: participantForm.lastName, birth_date: participantForm.birthDate || null, email: participantForm.email, group_ids: participantForm.groupIds, is_active: participantForm.isActive } })
        setMessage(t('client.participantUpdated')); setEditingParticipant(null); setParticipantBaseline(null); refreshDetail()
      } catch (err) {
        const nextFieldErrors = fieldErrorsFromApi(err, {
          'participant.first_name': 'firstName', first_name: 'firstName',
          'participant.last_name': 'lastName', last_name: 'lastName',
          'participant.birth_date': 'birthDate', birth_date: 'birthDate',
          'participant.email': 'email', email: 'email',
          'participant.group_ids': 'groupIds', group_ids: 'groupIds',
          'participant.is_active': 'isActive', is_active: 'isActive',
        })
        setParticipantFieldErrors(nextFieldErrors)
        setError(formErrorMessage(err, t('client.participantSaveError')))
        focusFirstFieldError(nextFieldErrors, PARTICIPANT_FIELD_IDS)
      } finally { setActionBusy(null) }
    }

    async function sendReminder() {
      setActionBusy('reminder'); setError(null)
      try {
        const notificationLocale = ['ru', 'pl', 'en'].includes(account.preferred_language) ? account.preferred_language : 'ru'
        const notificationT = adminFinanceTranslator(notificationLocale)
        await api.post('/api/admin/notifications/mass-mail/', { audience: 'selected', parent_ids: [account.id], channel: 'email', subject: notificationT('client.reminderSubject'), body: notificationT('client.reminderBody') })
        setMessage(t('client.reminderQueued'))
      } catch (err) { setError(apiErrorMessage(err, t('client.reminderError'))) } finally { setActionBusy(null) }
    }

    async function executeFinanceAction() {
      const participantRequired = financeAction === 'charge' || financeAction === 'issue'
      const subscriptionRequired = financeAction === 'renew' || financeAction === 'freeze' || financeAction === 'adjust'
      const typeRequired = financeAction === 'issue' || financeAction === 'renew'
      const nextErrors = {}
      if (participantRequired && !financeForm.participantId) nextErrors.participantId = t('finance.selectParticipantError')
      if (subscriptionRequired && !financeForm.subscriptionId) nextErrors.subscriptionId = t('finance.selectSubscriptionError')
      if (typeRequired && !financeForm.subscriptionTypeId) nextErrors.subscriptionTypeId = t('finance.selectTypeError')
      if (financeAction === 'charge') {
        const amount = Number(String(financeForm.amount || '').replace(',', '.'))
        if (!financeForm.description.trim()) nextErrors.description = t('finance.chargeDescriptionError')
        if (!Number.isFinite(amount) || amount <= 0) nextErrors.amount = t('finance.positiveAmountError')
        if (!validIsoDate(financeForm.dueDate)) nextErrors.dueDate = t('finance.dueDateError')
      }
      if (financeAction === 'issue' || financeAction === 'renew') {
        if (!validIsoDate(financeForm.startDate)) nextErrors.startDate = t('finance.startDateError')
        if (!validIsoDate(financeForm.dueDate)) nextErrors.dueDate = t('finance.dueDateError')
      }
      if (financeAction === 'freeze') {
        if (!validIsoDate(financeForm.freezeStart)) nextErrors.freezeStart = t('finance.freezeStartShortError')
        if (!validIsoDate(financeForm.freezeEnd)) nextErrors.freezeEnd = t('finance.freezeEndShortError')
        if (validIsoDate(financeForm.freezeStart) && validIsoDate(financeForm.freezeEnd) && financeForm.freezeEnd < financeForm.freezeStart) nextErrors.freezeEnd = t('finance.freezeOrderError')
      }
      if (financeAction === 'adjust') {
        const delta = Number(financeForm.adjustDelta)
        if (!Number.isInteger(delta) || delta === 0) nextErrors.adjustDelta = t('finance.adjustDeltaError')
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
          const charge = await api.post(`/api/admin/participants/${financeForm.participantId}/charges/`, {
            client_id: fallbackClientId,
            description: financeForm.description,
            amount_minor: minorFromMajor(financeForm.amount),
            currency: 'PLN',
            due_date: financeForm.dueDate,
            idempotency_key: financeForm.chargeIdempotencyKey,
          })
          const clientReadback = await api.get(`/api/admin/clients/${fallbackClientId}/`)
          assertChargeReadback(charge, clientReadback)
          setDetail(clientReadback)
          setMessage(`${t('finance.chargeCreated')}${t('finance.checkedBalance', { balance: asAccountBalance(charge.balance_minor).toFixed(2).replace('.', ',') })}`)
        }
        if (financeAction === 'issue') {
          await api.post(`/api/admin/participants/${financeForm.participantId}/subscriptions/`, {
            subscription_type_id: financeForm.subscriptionTypeId,
            start_date: financeForm.startDate,
            due_date: financeForm.dueDate,
            idempotency_key: financeForm.subscriptionIdempotencyKey,
          })
          setMessage(t('finance.subscriptionCreated'))
        }
        if (financeAction === 'renew') {
          await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/renew/`, {
            subscription_type_id: financeForm.subscriptionTypeId,
            start_date: financeForm.startDate,
            due_date: financeForm.dueDate,
            idempotency_key: financeForm.subscriptionIdempotencyKey,
          })
          setMessage(t('finance.subscriptionRenewed'))
        }
        if (financeAction === 'freeze') {
          const result = await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/freeze/`, {
            start_date: financeForm.freezeStart,
            end_date: financeForm.freezeEnd,
            reason: financeForm.freezeReason,
          })
          setMessage(t('finance.frozenDays', { count: result.days }))
        }
        if (financeAction === 'adjust') {
          await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/adjust/`, {
            delta: Number(financeForm.adjustDelta || 0),
            note: financeForm.adjustNote,
          })
          setMessage(t('finance.remainingAdjusted'))
        }
        setFinanceAction(null)
        setFinanceBaseline(null)
        refreshDetail()
      } catch (err) {
        const nextFieldErrors = fieldErrorsFromApi(err, {
          participant_id: 'participantId', subscription_id: 'subscriptionId',
          subscription_type_id: 'subscriptionTypeId', amount_minor: 'amount',
          description: 'description', start_date: financeAction === 'freeze' ? 'freezeStart' : 'startDate',
          due_date: 'dueDate', end_date: 'freezeEnd', reason: 'freezeReason',
          delta: 'adjustDelta', note: 'adjustNote', idempotency_key: 'subscriptionTypeId',
          currency: 'amount',
        })
        setFinanceFieldErrors(nextFieldErrors)
        setError(formErrorMessage(err, t('finance.operationError')))
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
        setMessage(t('client.exportReady', { name: result.name }))
      } catch (err) {
        setError(apiErrorMessage(err, t('client.exportError')))
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
          setMessage(t('client.archived'))
          reloadRoleData?.('admin')
        }
        if (confirmAction.type === 'restore') {
          const payload = await api.post(`/api/admin/clients/${fallbackClientId}/restore/`)
          setDetail(payload)
          setMessage(t('client.restored'))
          reloadRoleData?.('admin')
        }
        if (confirmAction.type === 'anonymize') {
          await api.post(`/api/admin/privacy/clients/${fallbackClientId}/anonymize/`)
          setMessage(t('client.anonymized'))
          refreshDetail()
        }
        setConfirmAction(null)
      } catch (err) {
        setError(apiErrorMessage(err, t('client.actionError')))
      } finally {
        setActionBusy(null)
      }
    }

    if (!fallbackClientId) {
      return (
        <div className="page page-wide">
          <div className="page-head">
            <div>
              <h1 className="page-title">{t('client.title')}</h1>
              <p className="page-desc">{t('client.chooseFromList')}</p>
            </div>
            <Button variant="secondary" iconLeft={<I.ArrowLeft size={15} />} onClick={() => back ? back('clients') : go?.('clients')}>{t('clients.title')}</Button>
          </div>
          <Banner tone="warning">{t('client.notSelected')}</Banner>
        </div>
      )
    }

    const subscriptionEditorOpen = SUBSCRIPTION_EDIT_ACTIONS.includes(financeAction)

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <ContextBackButton icon={<I.ArrowLeft size={14} />} onClick={() => back ? back('clients') : go?.('clients')}>{t('clients.title')}</ContextBackButton>
            <h1 className="page-title">{accountDisplayName}</h1>
            <p className="page-desc ops-client-contact-summary"><span>{account.phone || '—'}</span><span>{account.email || '—'}</span></p>
            {!contactsHidden && <div className="ops-contact-links" aria-label={t('client.contactAria')}>
              <ContactLink href={contactPhoneDigits ? `https://t.me/+${contactPhoneDigits}` : null} label="Telegram" disabledHint={phoneContactHint} />
              <ContactLink href={contactPhoneDigits ? `https://wa.me/${contactPhoneDigits}` : null} label="WhatsApp" disabledHint={phoneContactHint} />
              <ContactLink href={account.instagram_username ? `https://instagram.com/${account.instagram_username}` : null} label="Instagram" disabledHint={t('client.instagramMissing')} />
            </div>}
          </div>
          <div className="ops-button-row ops-page-actions">
            {!accountArchived && !loading && <AccessButtons Button={Button} portalAccess={account.portal_access} accessActivated={account.access_activated} busy={Boolean(actionBusy)} onAction={accessAction} />}
            {!accountArchived && <Button variant="primary" disabled={loading || actionBusy != null} onClick={openAccountEdit}>{t('client.edit')}</Button>}
            {accountArchived && <Button variant="primary" disabled={loading || actionBusy != null} onClick={() => setConfirmAction({ type: 'restore' })}>{t('clients.restore')}</Button>}
            <Button variant="secondary" disabled={loading} onClick={refreshDetail}>{t('client.refresh')}</Button>
          </div>
        </div>

        {error && !editingAccount && !editingParticipant && !financeAction && !paymentPanelOpen && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <ToastNotice id="admin-client-detail-result" message={message} />
        {activationInfo && <div style={{ marginBottom: 12 }}><AccessCodeCard info={activationInfo} Button={Button} onClose={() => setActivationInfo(null)} /></div>}
        <BusyBanner id="admin-client-detail-busy" show={loading}>{t('client.loading')}</BusyBanner>
        {accountArchived && <Banner tone="warning" style={{ marginBottom: 12 }}><strong>{t('client.blacklisted')}</strong> {t('client.blacklistedDescription')}</Banner>}

        {participants.length > 0 && <section className="card card-pad" style={{ display: 'grid', gap: 12, marginBottom: 16 }} aria-label={t('client.selectParticipant')}>
          <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
            <div className="eyebrow">{t('client.selectParticipant')}</div>
            <strong>{selectedParticipant?.full_name || '-'}</strong>
            <div className="muted"><Money amount={selectedParticipantBalance} signed currency="zł" /> · {selectedSubscription?.type || t('client.noSubscriptions')}</div>
          </div>
          <div style={{ display: 'grid', gap: 8 }} role="list">
            {participants.map((participant) => {
              const isSelected = String(participant.id) === selectedParticipantId
              return <Button key={participant.id} fullWidth variant={isSelected ? 'primary' : 'secondary'} aria-pressed={isSelected} style={{ justifyContent: 'space-between', gap: 8, textAlign: 'left' }} onClick={() => selectParticipant(participant.id)}><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{participant.full_name}</span>{isSelected && <span style={{ flexShrink: 0, fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-semibold)', whiteSpace: 'nowrap' }}> · {t('client.participantSelected')}</span>}</Button>
            })}
          </div>
        </section>}

        <FormModal open={editingAccount} title={t('client.editTitle')} description={t('client.accountOwner')} size="lg" busy={actionBusy != null} dirty={Boolean(accountBaseline) && JSON.stringify(accountForm) !== JSON.stringify(accountBaseline)} onRequestClose={() => { if (accountBaseline) setAccountForm(accountBaseline); setEditingAccount(false); setAccountBaseline(null); setAccountFieldErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={actionBusy != null} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" loading={actionBusy === 'account'} disabled={actionBusy != null} onClick={saveAccount}>{t('client.saveChanges')}</Button></>}>
            {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
            <div className="ops-form-grid">
              <Input id="admin-client-detail-firstName" label={t('field.firstName')} value={accountForm.firstName} error={accountFieldErrors.firstName} onChange={(event) => updateAccountForm('firstName', event.target.value)} />
              <Input id="admin-client-detail-lastName" label={t('field.lastName')} value={accountForm.lastName} error={accountFieldErrors.lastName} onChange={(event) => updateAccountForm('lastName', event.target.value)} />
              <Input id="admin-client-detail-email" label="Email" value={accountForm.email} error={accountFieldErrors.email} onChange={(event) => updateAccountForm('email', event.target.value)} />
              <Input id="admin-client-detail-username" label={t('field.username')} value={accountForm.username} error={accountFieldErrors.username} onChange={(event) => updateAccountForm('username', event.target.value)} />
              <Input id="admin-client-detail-phone" label={t('common.phone')} value={accountForm.phone} error={accountFieldErrors.phone} onChange={(event) => updateAccountForm('phone', event.target.value)} />
              <Input id="admin-client-detail-instagram" label={t('field.instagram')} value={accountForm.instagramUsername} error={accountFieldErrors.instagramUsername} hint={t('field.instagramHint')} onChange={(event) => updateAccountForm('instagramUsername', event.target.value)} />
              <Input id="admin-client-detail-telegram" label={t('field.telegramBotId')} value={accountForm.telegramChatId} error={accountFieldErrors.telegramChatId} onChange={(event) => updateAccountForm('telegramChatId', event.target.value)} />
              <Select id="admin-client-detail-language" label={t('field.notificationLanguage')} value={accountForm.preferredLanguage} error={accountFieldErrors.preferredLanguage} onChange={(event) => updateAccountForm('preferredLanguage', event.target.value)}><option value="ru">{t('language.ru')}</option><option value="pl">{t('language.pl')}</option><option value="en">{t('language.en')}</option></Select>
            </div>
        </FormModal>

        <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          <div className="kpi ops-client-balance-kpi">
            <div className="kpi-label"><span className="kpi-ico"><I.Cash size={15} /></span>{t('common.balance')}</div>
            <div className="kpi-value">
              <Money amount={selectedParticipantBalance} signed currency="zł" size="inherit" />
            </div>
            <div className="kpi-sub">{balanceCaption}</div>
          </div>
          <section className="card card-pad" aria-label={t('client.statusSummary')}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{t('client.statusSummary')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {[
                [I.Users, t('client.participants'), summary.participants_count ?? participants.length, t('client.activeCount', { count: summary.active_participants ?? participants.filter((item) => item.is_active).length })],
                [I.Layers, t('client.subscriptions'), selectedSubscriptions.filter((item) => item.status === 'active').length, t('client.active')],
                [I.Alert, t('payments.title'), selectedPayments.filter((item) => item.status === 'pending').length, t('client.awaitingReview')],
              ].map(([Icon, label, value, detail], index) => (
                <div key={label} style={{ display: 'grid', gap: 5, minWidth: 0, padding: index ? '0 0 0 10px' : '0 10px 0 0', borderLeft: index ? '1px solid var(--border-subtle)' : undefined }}>
                  <div className="kpi-label" style={{ gap: 5, marginBottom: 0, fontSize: 'calc(var(--fs-xs) - 2px)', whiteSpace: 'nowrap' }}><span className="kpi-ico" style={{ width: 16, height: 16, borderRadius: 0, background: 'transparent' }}><Icon size={15} /></span>{label}</div>
                  <div className="kpi-value" style={{ fontSize: 'calc(var(--fs-3xl) - 2px)' }}>{value}</div>
                  <div className="kpi-sub" style={{ marginTop: 0, fontSize: 'calc(var(--fs-xs) - 2px)', whiteSpace: 'nowrap' }}>{detail}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="ops-action-strip" aria-label={t('client.financeActionsAria')}>
          <button type="button" className="ops-action-card" disabled={accountArchived} onClick={openPaymentPanel}>
            <span>{t('client.topUp')}</span>
            <small>{t('client.topUpHint')}</small>
          </button>
          {[
            ['charge', t('client.addCharge'), t('client.amountPayable')],
            ['issue', t('client.sellPass'), t('client.newPassHint')],
          ].map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              className={`ops-action-card${financeAction === value ? ' is-active' : ''}`}
              disabled={accountArchived}
              onClick={() => { const next = value === 'charge' ? { ...financeForm, chargeIdempotencyKey: createPaymentAttemptKey('admin-charge') } : value === 'issue' || value === 'renew' ? { ...financeForm, subscriptionIdempotencyKey: createPaymentAttemptKey('admin-subscription') } : financeForm; setFinanceForm(next); setFinanceAction(value); setFinanceBaseline(next); setFinanceFieldErrors({}); setPaymentPanelOpen(false); setPaymentBaseline(null) }}
            >
              <span>{label}</span>
              <small>{hint}</small>
            </button>
          ))}
          <button
            type="button"
            className={`ops-action-card${subscriptionEditorOpen ? ' is-active' : ''}`}
            disabled={accountArchived || subscriptions.length === 0}
            onClick={() => openSubscriptionEditor()}
          >
            <span>{t('client.editPass')}</span>
            <small>{t('client.editPassHint')}</small>
          </button>
          <button type="button" className="ops-action-card" disabled={accountArchived || actionBusy != null} onClick={sendReminder}>
            <span>{t('client.remind')}</span>
            <small>{t('client.remindHint')}</small>
          </button>
        </div>

        <FormModal open={Boolean(financeAction)} title={subscriptionEditorOpen ? t('client.editPassTitle') : ({ charge: t('client.newCharge'), issue: t('client.sellPassTitle') }[financeAction] || t('finance.operation'))} size="lg" busy={actionBusy != null} dirty={Boolean(financeBaseline) && JSON.stringify(financeForm) !== JSON.stringify(financeBaseline)} onRequestClose={() => { if (financeBaseline) setFinanceForm(financeBaseline); setFinanceAction(null); setFinanceBaseline(null); setFinanceFieldErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={actionBusy != null} onClick={() => requestClose('cancel')}>{t('common.close')}</Button><Button variant="primary" loading={actionBusy === financeAction} disabled={actionBusy != null || loading} onClick={executeFinanceAction}>{t('common.save')}</Button></>}>
            {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
            <div className="ops-form-grid">
              {(financeAction === 'charge' || financeAction === 'issue') && (
                <SearchableSelect
                  inputId={FINANCE_FIELD_IDS.participantId}
                  label={t('common.participant')}
                  value={financeForm.participantId}
                  error={financeFieldErrors.participantId}
                  onChange={(value) => updateFinanceForm('participantId', value)}
                  options={participants.map((participant) => clientSelectOption(participant))}
                />
              )}
              {subscriptionEditorOpen && (
                <Select id={FINANCE_FIELD_IDS.subscriptionAction} label={t('field.action')} value={financeAction} onChange={(event) => { setFinanceAction(event.target.value); setFinanceFieldErrors({}); setError(null) }}>
                    <option value="renew">{t('finance.renewPass')}</option>
                    <option value="freeze">{t('finance.freezePass')}</option>
                    <option value="adjust">{t('client.adjustRemaining')}</option>
                </Select>
              )}
              {subscriptionEditorOpen && (
                <Select id={FINANCE_FIELD_IDS.subscriptionId} label={t('clients.subscription')} value={financeForm.subscriptionId} error={financeFieldErrors.subscriptionId} onChange={(event) => updateFinanceSubscription(event.target.value)}>
                    <option value="">{t('field.selectSubscription')}</option>
                    {selectedSubscriptions.map((subscription) => (
                      <option key={subscription.id} value={subscription.id}>
                        {subscription.participant?.full_name || participantName(subscription.participant_id)} · {subscription.type} · {t('field.remainingPrefix', { count: subscription.remaining_sessions ?? t('field.noLimit') })}
                      </option>
                    ))}
                </Select>
              )}
              {(financeAction === 'issue' || financeAction === 'renew') && (
                <>
                  <Select id={FINANCE_FIELD_IDS.subscriptionTypeId} label={t('field.subscriptionType')} value={financeForm.subscriptionTypeId} error={financeFieldErrors.subscriptionTypeId} onChange={(event) => updateFinanceForm('subscriptionTypeId', event.target.value)}>
                      <option value="">{t('field.selectType')}</option>
                      {subscriptionTypes.map((type) => <option key={type.typeId} value={type.typeId}>{type.name} · {type.price} {type.currency}</option>)}
                  </Select>
                  <DateField id={FINANCE_FIELD_IDS.startDate} label={t('field.startDate')} value={financeForm.startDate} error={financeFieldErrors.startDate} onChange={(value) => updateFinanceForm('startDate', value)} />
                  <DateField id={FINANCE_FIELD_IDS.dueDate} label={t('field.dueDate')} value={financeForm.dueDate} error={financeFieldErrors.dueDate} onChange={(value) => updateFinanceForm('dueDate', value)} />
                  <p className="ops-grid-full muted" style={{ margin: 0 }}>{t('finance.autoChargeHint')}</p>
                </>
              )}
              {financeAction === 'charge' && (
                <>
                  <Input id={FINANCE_FIELD_IDS.description} label={t('common.description')} value={financeForm.description} error={financeFieldErrors.description} onChange={(event) => updateFinanceForm('description', event.target.value)} />
                  <Input id={FINANCE_FIELD_IDS.amount} label={t('common.amount')} value={financeForm.amount} error={financeFieldErrors.amount} onChange={(event) => updateFinanceForm('amount', event.target.value)} placeholder="240.00" />
                  <DateField id={FINANCE_FIELD_IDS.dueDate} label={t('field.dueDate')} value={financeForm.dueDate} error={financeFieldErrors.dueDate} onChange={(value) => updateFinanceForm('dueDate', value)} />
                  <div className="ops-financial-context ops-grid-full" role="status" aria-label={t('finance.chargeReview')}><div><span>{t('finance.balanceNow')}</span><strong>{chargeBalanceBefore.toFixed(2)} zł</strong></div><div><span>{t('finance.chargePreview')}</span><strong>-{asMoneyMajor(chargePreviewMinor).toFixed(2)} zł</strong></div><div><span>{t('finance.balanceAfter')}</span><strong>{chargeBalanceAfter.toFixed(2)} zł</strong></div></div>
                </>
              )}
              {financeAction === 'freeze' && (
                <>
                  <DateField id={FINANCE_FIELD_IDS.freezeStart} label={t('field.freezeStart')} value={financeForm.freezeStart} error={financeFieldErrors.freezeStart} onChange={(value) => updateFinanceForm('freezeStart', value)} />
                  <DateField id={FINANCE_FIELD_IDS.freezeEnd} label={t('field.freezeEnd')} value={financeForm.freezeEnd} error={financeFieldErrors.freezeEnd} onChange={(value) => updateFinanceForm('freezeEnd', value)} />
                  <Input id={FINANCE_FIELD_IDS.freezeReason} label={t('field.reason')} value={financeForm.freezeReason} error={financeFieldErrors.freezeReason} onChange={(event) => updateFinanceForm('freezeReason', event.target.value)} />
                </>
              )}
              {financeAction === 'adjust' && (
                <>
                  <Input id={FINANCE_FIELD_IDS.adjustDelta} label={t('field.remainingChange')} value={financeForm.adjustDelta} error={financeFieldErrors.adjustDelta} onChange={(event) => updateFinanceForm('adjustDelta', event.target.value)} placeholder={t('field.exampleDelta')} />
                  <Input id={FINANCE_FIELD_IDS.adjustNote} label={t('field.comment')} value={financeForm.adjustNote} error={financeFieldErrors.adjustNote} onChange={(event) => updateFinanceForm('adjustNote', event.target.value)} />
                </>
              )}
            </div>
        </FormModal>

        <FormModal open={Boolean(reversalTarget)} title={t('finance.reverseChargeTitle')} description={t('finance.reverseChargeDescription')} size="sm" busy={actionBusy === 'reverse-charge'} dirty={Boolean(reversalReason)} onRequestClose={() => { setReversalTarget(null); setReversalReason(''); setReversalReasonError(null); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={actionBusy === 'reverse-charge'} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="danger" loading={actionBusy === 'reverse-charge'} disabled={actionBusy === 'reverse-charge'} onClick={reverseCharge}>{t('finance.reverseCharge')}</Button></>}>
          {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
          <p className="muted" style={{ marginTop: 0 }}>{reversalTarget?.description} · <Money amount={money(reversalTarget?.amount_minor)} /></p>
          <Input id="admin-client-charge-reversal-reason" label={t('finance.reverseReason')} value={reversalReason} error={reversalReasonError} onChange={(event) => { setReversalReason(event.target.value); setReversalReasonError(null) }} />
        </FormModal>

        <div className="toolbar">
          <Tabs value={tab} onChange={setTab} style={{ border: 'none' }} items={[
            { value: 'participants', label: t('client.participants'), count: participants.length },
            { value: 'subscriptions', label: t('client.subscriptions'), count: selectedSubscriptions.length },
            { value: 'payments', label: t('payments.title'), count: selectedPayments.length + selectedCharges.length },
            { value: 'attendance', label: t('client.attendance'), count: selectedAttendance.length },
            { value: 'consents', label: t('client.consents'), count: consents.length },
            { value: 'privacy', label: t('client.privacy') },
          ]} />
        </div>

        {tab === 'participants' && (
          <div>
          <FormModal open={Boolean(editingParticipant)} title={t('client.editParticipant')} size="lg" busy={actionBusy != null} dirty={Boolean(participantBaseline) && JSON.stringify(participantForm) !== JSON.stringify(participantBaseline)} onRequestClose={() => { if (participantBaseline) setParticipantForm(participantBaseline); setEditingParticipant(null); setParticipantBaseline(null); setParticipantFieldErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={actionBusy != null} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" disabled={actionBusy != null} onClick={saveParticipant}>{t('common.save')}</Button></>}>
            {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
            <div className="ops-form-grid">
              <Input id={PARTICIPANT_FIELD_IDS.firstName} label={t('field.firstName')} value={participantForm.firstName} error={participantFieldErrors.firstName} onChange={(event) => updateParticipantForm('firstName', event.target.value)} />
              <Input id={PARTICIPANT_FIELD_IDS.lastName} label={t('field.lastName')} value={participantForm.lastName} error={participantFieldErrors.lastName} onChange={(event) => updateParticipantForm('lastName', event.target.value)} />
              <DateField id={PARTICIPANT_FIELD_IDS.birthDate} label={t('field.birthDate')} value={participantForm.birthDate} error={participantFieldErrors.birthDate} onChange={(value) => updateParticipantForm('birthDate', value)} />
              <Input id={PARTICIPANT_FIELD_IDS.email} label="Email" value={participantForm.email} error={participantFieldErrors.email} onChange={(event) => updateParticipantForm('email', event.target.value)} />
              <GroupMultiSelect id={PARTICIPANT_FIELD_IDS.groupIds} groups={groups} value={participantForm.groupIds} error={participantFieldErrors.groupIds} onChange={(value) => updateParticipantForm('groupIds', value)} />
              <Checkbox id={PARTICIPANT_FIELD_IDS.isActive} label={t('field.accountActive')} checked={participantForm.isActive} error={participantFieldErrors.isActive} onChange={(event) => updateParticipantForm('isActive', event.target.checked)} />
            </div>
          </FormModal>
          <Table
            rows={participants}
            emptyLabel={t('client.noParticipants')}
            columns={[
              { key: 'full_name', header: t('common.participant'), render: (row) => <button type="button" className="ops-link-button" disabled={accountArchived} onClick={() => openParticipantEdit(row)}><Avatar name={row.full_name} size={28} /><span className="strong">{row.full_name}</span></button> },
              { key: 'birth_date', header: t('field.birthDate'), muted: true, render: (row) => row.birth_date || '-' },
              { key: 'email', header: 'Email', muted: true, render: (row) => row.email || '-' },
              { key: 'groups', header: t('common.groups'), render: (row) => (row.groups || []).map((group) => group.name).join(', ') || t('clients.individual') },
              { key: 'balance', header: t('common.balance'), align: 'right', width: 110, render: (row) => <Money amount={asAccountBalance(row.balance_minor)} signed /> },
              { key: 'status', header: t('common.status'), width: 110, render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
              { key: 'training', header: t('field.training'), render: (row) => <div className="ops-button-row"><Button size="sm" variant="subtle" disabled={!row.is_active || accountArchived} onClick={() => go?.('schedule', { createSession: 'individual', participantId: row.id })}>{t('field.individualSession')}</Button><Button size="sm" variant="subtle" disabled={!row.is_active || accountArchived} onClick={() => go?.('schedule', { createSession: 'split', participantId: row.id })}>{t('field.splitSession')}</Button></div> },
            ]}
          />
          </div>
        )}

        {tab === 'subscriptions' && (
          <Table
            rows={selectedSubscriptions}
            emptyLabel={t('client.noSubscriptions')}
            onRowClick={accountArchived ? undefined : openSubscriptionEditor}
            columns={[
              { key: 'type', header: t('common.type'), render: (row) => <span className="strong">{row.type}</span> },
              { key: 'participant', header: t('common.participant'), render: (row) => row.participant?.full_name || participantName(row.participant_id) },
              { key: 'start_date', header: t('field.start'), muted: true },
              { key: 'effective_end_date', header: t('field.end'), muted: true },
              { key: 'created_at', header: t('field.issued'), muted: true, render: (row) => row.created_at ? formatLocalDate(row.created_at) : '-' },
              { key: 'remaining_sessions', header: t('field.remaining'), align: 'right', width: 90, render: (row) => row.remaining_sessions ?? t('field.noLimit') },
              { key: 'status', header: t('common.status'), width: 120, render: (row) => <StatusPill status={status(row.status)} size="sm" /> },
            ]}
          />
        )}

        {tab === 'payments' && (
          <div>
            <FormModal open={paymentPanelOpen} title={t('client.topUp')} description={t('client.paymentFormDescription')} size="lg" busy={actionBusy != null} dirty={Boolean(paymentBaseline) && JSON.stringify(paymentForm) !== JSON.stringify(paymentBaseline)} onRequestClose={() => { if (paymentBaseline) setPaymentForm(paymentBaseline); setPaymentPanelOpen(false); setPaymentBaseline(null); setPaymentFieldErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={actionBusy != null} onClick={() => requestClose('cancel')}>{t('common.close')}</Button><Button variant="primary" loading={actionBusy === 'manual-payment'} disabled={actionBusy != null || loading} onClick={createManualPayment}>{t('client.confirmPayment')}</Button></>}>
                {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
                <div className="ops-financial-context" aria-label={t('finance.contextPayment')}>
                  <div><span>{t('client.title')}</span><strong>{account.full_name || account.username || '—'}</strong></div>
                  <div><span>{t('common.participant')}</span><strong>{selectedPaymentParticipant?.full_name || t('field.selectParticipant')}</strong></div>
                  <div><span>{t('field.currentBalance')}</span><strong><Money amount={selectedPaymentBalance} signed currency="zł" /></strong></div>
                  <div><span>{t('field.method')}</span><strong>{paymentMethodLabel(paymentForm.method, locale)}</strong></div>
                </div>
                <div className="ops-form-grid">
                  <SearchableSelect
                    inputId={PAYMENT_FIELD_IDS.participantId}
                    label={t('common.participant')}
                    value={paymentForm.participantId}
                    error={paymentFieldErrors.participantId}
                    onChange={(value) => updatePaymentForm('participantId', value)}
                    options={participants.map((participant) => clientSelectOption(participant))}
                  />
                  <Input id={PAYMENT_FIELD_IDS.amount} label={t('field.amountCurrency')} value={paymentForm.amount} error={paymentFieldErrors.amount} onChange={(event) => updatePaymentForm('amount', event.target.value)} placeholder="240,00" inputMode="decimal" />
                  <DateField id={PAYMENT_FIELD_IDS.paidAt} label={t('field.paidAt')} value={paymentForm.paidAt} error={paymentFieldErrors.paidAt} onChange={(value) => updatePaymentForm('paidAt', value)} />
                  <Select id={PAYMENT_FIELD_IDS.method} label={t('field.method')} value={paymentForm.method} error={paymentFieldErrors.method} onChange={(event) => updatePaymentForm('method', event.target.value)}>
                      <option value="cash">{t('paymentMethod.cash')}</option>
                      <option value="bank_transfer">{t('paymentMethod.bankTransfer')}</option>
                      <option value="card">{t('paymentMethod.card')}</option>
                      <option value="other">{t('paymentMethod.other')}</option>
                  </Select>
                  <Input id={PAYMENT_FIELD_IDS.comment} label={t('field.comment')} value={paymentForm.comment} error={paymentFieldErrors.comment} onChange={(event) => updatePaymentForm('comment', event.target.value)} placeholder={t('common.optional')} />
                </div>
            </FormModal>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 14 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>{t('client.charges')}</div>
              <Table
                rows={selectedCharges}
                emptyLabel={t('client.noCharges')}
                columns={[
                  { key: 'description', header: t('common.description'), render: (row) => <div><span className="strong">{row.description}</span>{row.reversal && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{t('finance.reversedChargeDetails', { reason: row.reversal.reason, author: row.reversal.created_by || '-', time: formatLocalDate(row.reversal.created_at), reference: row.reversal.reference_id || row.reference_id || '-' })}</small>}</div> },
                  { key: 'participant', header: t('common.participant'), muted: true },
                  { key: 'due_date', header: t('field.dueDate'), muted: true },
                  { key: 'amount', header: t('common.amount'), align: 'right', width: 100, render: (row) => <Money amount={money(row.amount_minor)} /> },
                  { key: 'status', header: t('common.status'), width: 110, render: (row) => <StatusPill status={status(row.status)} size="sm" /> },
                  { key: 'actions', header: '', width: 150, render: (row) => row.can_reverse ? <Button size="sm" variant="danger" disabled={actionBusy != null} onClick={() => openChargeReversal(row)}>{t('finance.reverseCharge')}</Button> : null },
                ]}
              />
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>{t('payments.title')}</div>
              <Table
                rows={selectedPayments}
                emptyLabel={t('client.noPayments')}
                columns={[
                  { key: 'participant', header: t('common.participant'), render: (row) => <span className="strong">{row.participant}</span> },
                  { key: 'method', header: t('field.method'), muted: true, render: (row) => paymentMethodLabel(row.method, locale) },
                  { key: 'paid_at', header: t('common.date'), muted: true },
                  { key: 'amount', header: t('common.amount'), align: 'right', width: 100, render: (row) => <Money amount={money(row.amount_minor)} /> },
                  { key: 'status', header: t('common.status'), width: 110, render: (row) => <StatusPill status={status(row.status)} size="sm" /> },
                ]}
              />
            </div>
            </div>
          </div>
        )}

        {tab === 'attendance' && (
          <Table
            rows={selectedAttendance}
            emptyLabel={t('client.noAttendance')}
            columns={[
              { key: 'participant', header: t('common.participant'), render: (row) => <span className="strong">{row.participant}</span> },
              { key: 'session_start_at', header: t('field.session'), render: (row) => <button type="button" className="ops-link-button" onClick={() => go?.('attendance', { sessionId: row.session_id })}>{formatLocalShortDate(row.session_start_at)} {formatTime(row.session_start_at)}-{formatTime(row.session_end_at)}</button> },
              { key: 'group', header: t('common.group'), muted: true },
              { key: 'trainer', header: t('common.trainer'), muted: true },
              { key: 'status', header: t('common.status'), width: 120, render: (row) => <StatusPill status={row.status} size="sm" /> },
              { key: 'deducts', header: t('field.deduction'), width: 90, render: (row) => row.deducts ? <Badge tone="warning">-1</Badge> : <Badge tone="neutral">0</Badge> },
            ]}
          />
        )}

        {tab === 'consents' && (
          <Table
            rows={consents}
            emptyLabel={t('client.noConsents')}
            columns={[
              { key: 'type_label', header: t('field.consent'), render: (row) => <span className="strong">{row.type_label || row.type}</span> },
              { key: 'policy_version', header: t('field.version'), muted: true, render: (row) => row.policy_version || '-' },
              { key: 'granted_at', header: t('field.granted'), muted: true, render: (row) => row.granted_at ? formatLocalDate(row.granted_at) : '-' },
              { key: 'revoked_at', header: t('field.revoked'), muted: true, render: (row) => row.revoked_at ? formatLocalDate(row.revoked_at) : '-' },
              { key: 'active', header: t('common.status'), width: 110, render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
            ]}
          />
        )}

        {tab === 'privacy' && (
          <div className="card card-pad" style={{ maxWidth: 860 }}>
            <div className="page-head" style={{ marginBottom: 14 }}>
              <div>
                <h3 className="section-title" style={{ margin: 0 }}>{t('client.dataTitle')}</h3>
                <p className="page-desc" style={{ marginTop: 4 }}>{t('client.dataDescription')}</p>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="strong">{t('client.exportTitle')}</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('client.exportDescription')}</div>
                </div>
                <Button variant="secondary" loading={actionBusy === 'export'} disabled={actionBusy != null || loading} onClick={exportClientData}>{t('client.downloadData')}</Button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="strong">{t('client.archiveTitle')}</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('client.archiveDescription')}</div>
                </div>
                <Button variant="secondary" loading={actionBusy === 'archive'} disabled={accountArchived || actionBusy != null || loading} onClick={() => setConfirmAction({ type: 'archive' })}>{t('client.archive')}</Button>
              </div>
              {accountArchived && <div className="ops-privacy-row">
                <div>
                  <div className="strong">{t('client.restoreTitle')}</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('client.restoreDescription')}</div>
                </div>
                <Button variant="primary" loading={actionBusy === 'restore'} disabled={actionBusy != null || loading} onClick={() => setConfirmAction({ type: 'restore' })}>{t('clients.restore')}</Button>
              </div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '12px 0' }}>
                <div>
                  <div className="strong">{t('client.anonymizeTitle')}</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('client.anonymizeDescription')}</div>
                </div>
                <Button variant="danger" loading={actionBusy === 'anonymize'} disabled={accountArchived || actionBusy != null || loading} onClick={() => setConfirmAction({ type: 'anonymize' })}>{t('client.anonymize')}</Button>
              </div>
            </div>
          </div>
        )}

        {confirmAction && (
          <Dialog
            title={confirmAction.type === 'archive' ? t('client.archiveConfirmTitle') : confirmAction.type === 'restore' ? t('client.restoreConfirmTitle') : t('client.anonymizeConfirmTitle')}
            description={confirmAction.type === 'archive'
              ? t('client.archiveConfirmDescription')
              : confirmAction.type === 'restore'
                ? t('client.restoreConfirmDescription')
              : t('client.anonymizeConfirmDescription')}
            tone={confirmAction.type === 'restore' ? 'default' : 'danger'}
            irreversible={confirmAction.type === 'anonymize'}
            confirmLabel={confirmAction.type === 'archive' ? t('client.blacklistAction') : confirmAction.type === 'restore' ? t('clients.restore') : t('client.anonymize')}
            onClose={() => actionBusy ? null : setConfirmAction(null)}
            onConfirm={runDangerAction}
          >
            <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              {t('client.contextPrefix')} <span className="strong">{account.full_name || account.username || fallbackClientId}</span>
            </div>
          </Dialog>
        )}
      </div>
    )
  }
}

