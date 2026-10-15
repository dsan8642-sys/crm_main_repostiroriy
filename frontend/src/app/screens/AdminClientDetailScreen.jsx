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
  subscriptionPaymentFields,
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
import { AccessCodeCard } from '../AccessControls.jsx'
import { validIsoDate } from '../scheduleContracts.js'
import { FormModal } from '../FormModal.jsx'
import { ActionPopover, ContextBackButton } from '../EntityListPrimitives.jsx'
import { GroupMultiSelect } from '../GroupMultiSelect.jsx'
import { usePresence } from '../usePresence.js'

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
  subscriptionTypeId: 'admin-client-finance-subscription-type',
  amount: 'admin-client-finance-amount', description: 'admin-client-finance-description',
  startDate: 'admin-client-finance-start-date', dueDate: 'admin-client-finance-due-date',
  paymentReceived: 'admin-client-finance-payment-received',
  paymentMethod: 'admin-client-finance-payment-method',
  paymentDate: 'admin-client-finance-payment-date',
}

const SUBSCRIPTION_EDIT_ACTIONS = ['renew']

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
    const subscriptionLabel = (subscription) => subscription?.start_date
      ? t('finance.subscriptionStarted', { name: subscription.type, date: formatLocalDate(subscription.start_date) })
      : subscription?.type || ''
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
    const [openedSubscriptionId, setOpenedSubscriptionId] = useState(null)
    const [subscriptionEditing, setSubscriptionEditing] = useState(false)
    const [subscriptionDraft, setSubscriptionDraft] = useState(null)
    const [subscriptionError, setSubscriptionError] = useState(null)
    const [attendanceEditing, setAttendanceEditing] = useState(false)
    const attendancePaymentPresence = usePresence(attendanceEditing)
    const [attendanceIds, setAttendanceIds] = useState([])
    const [attendanceSource, setAttendanceSource] = useState('subscription')
    const [attendanceSubscriptionId, setAttendanceSubscriptionId] = useState('')
    const [attendanceError, setAttendanceError] = useState(null)
    const [attendancePaymentFilter, setAttendancePaymentFilter] = useState([])
    const [attendanceStatusFilter, setAttendanceStatusFilter] = useState([])
    const [attendanceFiltersOpen, setAttendanceFiltersOpen] = useState(false)
    const attendanceFilterPresence = usePresence(attendanceFiltersOpen)
    const [mobilePaymentView, setMobilePaymentView] = useState('topups')
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
      paymentReceived: false,
      paymentMethod: 'cash',
      paymentDate: new Date().toISOString().slice(0, 10),
      chargeIdempotencyKey: createPaymentAttemptKey('admin-charge'),
      subscriptionIdempotencyKey: createPaymentAttemptKey('admin-subscription'),
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
    const openedSubscription = subscriptions.find((row) => String(row.id) === String(openedSubscriptionId))
    const selectedCharges = charges
    const selectedPayments = payments
    const selectedAttendance = useMemo(() => attendance.filter(
      (row) => String(row.participant_id ?? row.participant?.id ?? '') === selectedParticipantId,
    ), [attendance, selectedParticipantId])
    const filteredAttendance = selectedAttendance.filter((row) => (
      (!attendancePaymentFilter.length || attendancePaymentFilter.includes(row.payment_source || 'none'))
      && (!attendanceStatusFilter.length || attendanceStatusFilter.includes(
        row.status === 'excused' ? 'absent' : row.status,
      ))
    ))
    const editableAttendance = filteredAttendance.filter((row) => row.deducts)
    const selectedHistoricalAttendance = selectedAttendance.some(
      (row) => attendanceIds.includes(row.id) && row.financial_effects_enabled === false,
    )
    const paymentSubscriptions = selectedSubscriptions.filter((row) => row.can_assign_attendance)
    const paymentSubscription = paymentSubscriptions.find((row) => String(row.id) === attendanceSubscriptionId)
    const paymentRemaining = paymentSubscription?.remaining_sessions == null ? null
      : paymentSubscription.remaining_sessions - selectedAttendance.filter((row) => attendanceIds.includes(row.id)
        && String(row.payment_subscription_id || '') !== attendanceSubscriptionId).length

    useEffect(() => {
      setAttendanceEditing(false)
      setAttendanceIds([])
      setAttendanceError(null)
    }, [selectedParticipantId, fallbackClientId, tab, attendancePaymentFilter, attendanceStatusFilter])
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
        participantId: String((participants.find((item) => item.is_account_holder && item.is_active) || participants.find((item) => item.is_active) || participants[0]).id),
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
      const participantId = String((participants.find((item) => item.is_account_holder && item.is_active) || participants.find((item) => item.is_active) || participants[0]).id)
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
    const selectedPaymentBalance = accountBalance
    const chargePreviewMinor = moneyMajorToMinor(financeForm.amount) || 0
    const chargeBalanceBefore = accountBalance
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
        paymentReceived: false,
      }
      setFinanceForm(next)
      setFinanceBaseline(next)
      setFinanceFieldErrors({})
      setFinanceAction('renew')
      setPaymentPanelOpen(false)
      setPaymentBaseline(null)
      setError(null)
    }

    function openSubscriptionDetails(subscription, edit = false) {
      if (!subscription) return
      setOpenedSubscriptionId(subscription.id)
      setSubscriptionEditing(edit)
      setSubscriptionDraft({
        startDate: subscription.start_date || '',
        endDate: subscription.effective_end_date || '',
        remaining: subscription.remaining_sessions == null ? '' : String(subscription.remaining_sessions),
        freezeStart: '', freezeEnd: '', reasonPreset: '', customReason: '',
      })
      setSubscriptionError(null)
    }

    async function saveSubscriptionDetails() {
      const subscription = openedSubscription
      if (!subscription || !subscriptionDraft) return
      const draft = subscriptionDraft
      const changes = {}
      if (draft.startDate !== subscription.start_date || draft.endDate !== subscription.effective_end_date) {
        if (!validIsoDate(draft.startDate) || !validIsoDate(draft.endDate) || draft.endDate < draft.startDate) {
          setSubscriptionError(t('finance.subscriptionDatesError'))
          return
        }
      }
      if (draft.startDate !== subscription.start_date) changes.start_date = draft.startDate
      if (draft.endDate !== subscription.effective_end_date) {
        changes.effective_end_date = draft.endDate
      }
      if (subscription.remaining_sessions != null && draft.remaining !== String(subscription.remaining_sessions)) {
        const remaining = Number(draft.remaining)
        if (!draft.remaining.trim() || !Number.isInteger(remaining) || remaining < 0) {
          setSubscriptionError(t('finance.targetRemainingError'))
          return
        }
        changes.remaining_sessions = remaining
      }
      if (draft.freezeStart || draft.freezeEnd) {
        if (!validIsoDate(draft.freezeStart) || !validIsoDate(draft.freezeEnd) || draft.freezeEnd < draft.freezeStart) {
          setSubscriptionError(t('finance.freezeOrderError'))
          return
        }
        changes.freeze = { start_date: draft.freezeStart, end_date: draft.freezeEnd }
      }
      if (!Object.keys(changes).length) {
        setSubscriptionError(t('finance.noSubscriptionChanges'))
        return
      }
      const reason = draft.reasonPreset === 'other' ? draft.customReason.trim() : draft.reasonPreset
      if (!reason || reason.length > 255) {
        setSubscriptionError(t('finance.subscriptionReasonRequired'))
        return
      }
      setSubscriptionError(null)
      setActionBusy('combined-subscription')
      try {
        await api.post(`/api/admin/subscriptions/${subscription.id}/update/`, { ...changes, reason })
        setSubscriptionEditing(false)
        setMessage(t('finance.subscriptionUpdated'))
        refreshDetail()
      } catch (err) {
        setSubscriptionError(formErrorMessage(err, t('finance.operationError')))
      } finally {
        setActionBusy(null)
      }
    }

    async function saveAttendancePayment() {
      if (!attendanceIds.length || (attendanceSource === 'subscription' && !paymentSubscription)) return
      setActionBusy('attendance-payment')
      setAttendanceError(null)
      try {
        await api.post(`/api/admin/participants/${selectedParticipant.id}/attendance/payment/`, {
          attendance_ids: attendanceIds,
          source: attendanceSource,
          ...(attendanceSource === 'subscription' ? { subscription_id: paymentSubscription.id } : {}),
        })
        setAttendanceEditing(false)
        setAttendanceIds([])
        setMessage(t('finance.attendancePaymentUpdated'))
        refreshDetail()
      } catch (err) {
        setAttendanceError(formErrorMessage(err, t('finance.operationError')))
      } finally {
        setActionBusy(null)
      }
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
        paymentReceived: false,
      }
      financeRouteHandledRef.current = true
      setTab('subscriptions')
      if (['edit', 'freeze', 'adjust'].includes(initialFinanceAction)) {
        openSubscriptionDetails(selectedSubscription || subscriptions[0], true)
        return
      }
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
      const subscriptionRequired = SUBSCRIPTION_EDIT_ACTIONS.includes(financeAction)
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
        if (financeForm.paymentReceived && !financeForm.paymentMethod) nextErrors.paymentMethod = t('finance.paymentMethodError')
        if (financeForm.paymentReceived && !validIsoDate(financeForm.paymentDate)) nextErrors.paymentDate = t('finance.paymentDateError')
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
            ...subscriptionPaymentFields({ received: financeForm.paymentReceived, method: financeForm.paymentMethod, date: financeForm.paymentDate }),
          })
          setMessage(t(financeForm.paymentReceived ? 'finance.subscriptionCreatedPaid' : 'finance.subscriptionCreated'))
        }
        if (financeAction === 'renew') {
          await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/renew/`, {
            subscription_type_id: financeForm.subscriptionTypeId,
            start_date: financeForm.startDate,
            due_date: financeForm.dueDate,
            idempotency_key: financeForm.subscriptionIdempotencyKey,
            ...subscriptionPaymentFields({ received: financeForm.paymentReceived, method: financeForm.paymentMethod, date: financeForm.paymentDate }),
          })
          setMessage(t(financeForm.paymentReceived ? 'finance.subscriptionRenewedPaid' : 'finance.subscriptionRenewed'))
        }
        setFinanceAction(null)
        setFinanceBaseline(null)
        refreshDetail()
      } catch (err) {
        const nextFieldErrors = fieldErrorsFromApi(err, {
          participant_id: 'participantId', subscription_id: 'subscriptionId',
          subscription_type_id: 'subscriptionTypeId', amount_minor: 'amount',
          description: 'description', start_date: 'startDate',
          due_date: 'dueDate',
          payment_method: 'paymentMethod', payment_date: 'paymentDate',
          idempotency_key: 'subscriptionTypeId',
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
        if (confirmAction.type === 'revokeAccess') {
          await api.post(`/api/admin/clients/${fallbackClientId}/access/revoke/`)
          setMessage(t('access.revoked'))
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
    const activeSubscriptions = selectedSubscriptions.filter((row) => row.status === 'active')
    const currentSubscription = activeSubscriptions[0] || selectedSubscriptions.find((row) => row.status === 'frozen')
    const pendingPayments = summary.pending_payments ?? selectedPayments.filter((row) => row.status === 'pending').length
    const hubSections = [
      { value: 'payments', label: t('payments.title'), Icon: I.Wallet, count: selectedPayments.length + selectedCharges.length,
        valueLabel: <Money amount={accountBalance} signed currency="zł" size="inherit" />,
        detail: pendingPayments ? `${t('client.awaitingReview')}: ${pendingPayments}` : t('finance.familyBalance') },
      { value: 'subscriptions', label: t('client.subscriptions'), Icon: I.Ticket, count: selectedSubscriptions.length,
        valueLabel: currentSubscription ? currentSubscription.remaining_sessions == null ? t('field.noLimit') : t('field.remainingPrefix', { count: currentSubscription.remaining_sessions }) : '—',
        detail: currentSubscription ? `${currentSubscription.status === 'frozen' ? t('status.frozen') : t('client.activeCount', { count: activeSubscriptions.length })}${currentSubscription.effective_end_date ? ` · ${t('client.passUntil', { date: formatLocalDate(currentSubscription.effective_end_date) })}` : ''}` : t('client.noSubscriptions') },
      { value: 'participants', label: t('client.participants'), Icon: I.Users, valueLabel: participants.length,
        detail: t('client.activeCount', { count: summary.active_participants ?? participants.filter((row) => row.is_active).length }) },
      { value: 'attendance', label: t('client.attendance'), Icon: I.History, valueLabel: selectedAttendance.length,
        detail: selectedAttendance[0]?.session_start_at ? t('client.lastVisit', { date: formatLocalDate(selectedAttendance[0].session_start_at) }) : t('client.noAttendance') },
      { value: 'consents', label: t('client.consents'), Icon: I.Check, count: consents.length },
      { value: 'privacy', label: t('client.privacy'), Icon: I.File },
    ]
    const accountActions = [
      !accountArchived && { key: 'edit', testId: 'admin-client-edit-account', label: t('client.edit'), disabled: loading || actionBusy != null, onSelect: openAccountEdit },
      { key: 'refresh', label: t('client.refresh'), disabled: loading, onSelect: refreshDetail },
      !accountArchived && !loading && (account.portal_access === 'revoked'
        ? { key: 'restore-access', testId: 'client-access-restore', label: t('access.restore'), disabled: Boolean(actionBusy), onSelect: () => accessAction('restore') }
        : { key: 'issue-access', testId: 'client-access-issue', label: t(account.access_activated ? 'access.recover' : 'access.issue'), disabled: Boolean(actionBusy), onSelect: () => accessAction('issue') }),
      !accountArchived && !loading && account.portal_access !== 'revoked' && { key: 'revoke-access', testId: 'client-access-revoke', label: t('access.revoke'), disabled: Boolean(actionBusy), onSelect: () => setConfirmAction({ type: 'revokeAccess' }) },
    ]

    return (
      <div className="page page-wide ops-client-compact">
        <div className="page-head ops-client-compact-head">
          <div className="ops-client-identity">
            <ContextBackButton icon={<I.ArrowLeft size={14} />} onClick={() => back ? back('clients') : go?.('clients')}>{t('clients.title')}</ContextBackButton>
            <h1 className="page-title">{accountDisplayName}</h1>
            {selectedParticipant && <div className="ops-client-participant-context">
              {participants.length > 1
                ? <label><span>{t('common.participant')}</span><select data-testid="admin-client-participant-select" value={selectedParticipantId} onChange={(event) => selectParticipant(event.target.value)}>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.full_name}</option>)}</select></label>
                : <span>{t('common.participant')}: {selectedParticipant.full_name}</span>}
            </div>}
            <p className="page-desc ops-client-contact-summary"><span>{account.phone || '—'}</span><span>{account.email || '—'}</span></p>
            {!contactsHidden && <div className="ops-contact-links" aria-label={t('client.contactAria')}>
              <ContactLink href={contactPhoneDigits ? `https://t.me/+${contactPhoneDigits}` : null} label="Telegram" disabledHint={phoneContactHint} />
              <ContactLink href={contactPhoneDigits ? `https://wa.me/${contactPhoneDigits}` : null} label="WhatsApp" disabledHint={phoneContactHint} />
              <ContactLink href={account.instagram_username ? `https://instagram.com/${account.instagram_username}` : null} label="Instagram" disabledHint={t('client.instagramMissing')} />
            </div>}
          </div>
          <div className="ops-client-account-actions">
            {accountArchived && <Button data-testid="admin-client-restore" variant="primary" disabled={loading || actionBusy != null} onClick={() => setConfirmAction({ type: 'restore' })}>{t('clients.restore')}</Button>}
            <ActionPopover testId="admin-client-actions" label={t('common.actionsFor', { name: accountDisplayName })} actions={accountActions} />
          </div>
        </div>

        {error && !editingAccount && !editingParticipant && !financeAction && !paymentPanelOpen && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <ToastNotice id="admin-client-detail-result" message={message} />
        {activationInfo && <div style={{ marginBottom: 12 }}><AccessCodeCard info={activationInfo} Button={Button} email={account.email} emailLanguage={account.preferred_language} onClose={() => setActivationInfo(null)} /></div>}
        <BusyBanner id="admin-client-detail-busy" show={loading}>{t('client.loading')}</BusyBanner>
        {accountArchived && <div data-testid="admin-client-archived-banner"><Banner tone="warning" style={{ marginBottom: 12 }}><strong>{t('client.blacklisted')}</strong> {t('client.blacklistedDescription')}</Banner></div>}

        <section className="ops-client-hub" aria-label={t('client.statusSummary')} onClickCapture={(event) => {
          const button = event.target.closest('button[role="tab"]')
          if (!button || button.getAttribute('aria-selected') === 'true') return
          const rect = button.getBoundingClientRect()
          button.style.setProperty('--reveal-x', event.detail ? `${event.clientX - rect.left}px` : '50%')
          button.style.setProperty('--reveal-y', event.detail ? `${event.clientY - rect.top}px` : '50%')
        }}>
          <Tabs value={tab} onChange={setTab} style={{ display: 'grid', gap: 0, border: 0 }} items={hubSections.map((section) => ({
            value: section.value, testId: `admin-client-tab-${section.value}`,
            label: <span className="ops-client-hub-content"><span className="ops-client-hub-label"><section.Icon size={15} aria-hidden="true" />{section.label}{section.count != null && <span> · {section.count}</span>}</span>{section.valueLabel != null && <strong className="ops-client-hub-value">{section.valueLabel}</strong>}{section.detail && <span className="ops-client-hub-detail">{section.detail}</span>}</span>,
          }))} />
        </section>

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

        <div className="ops-client-quick-actions" aria-label={t('client.financeActionsAria')}>
          <Button data-testid="admin-client-action-payment" variant="primary" disabled={accountArchived || loading} onClick={openPaymentPanel}>{t('client.topUp')}</Button>
          <Button data-testid="admin-client-action-sell-subscription" variant="secondary" disabled={accountArchived || loading} onClick={() => { const next = { ...financeForm, subscriptionIdempotencyKey: createPaymentAttemptKey('admin-subscription'), paymentReceived: false, paymentMethod: 'cash', paymentDate: new Date().toISOString().slice(0, 10) }; setFinanceForm(next); setFinanceAction('issue'); setFinanceBaseline(next); setFinanceFieldErrors({}); setPaymentPanelOpen(false); setPaymentBaseline(null) }}>{t('client.sellPass')}</Button>
          <ActionPopover testId="admin-client-finance" label={t('client.moreFinanceActions')} disabled={accountArchived || loading} actions={[
            { key: 'edit-subscription', testId: 'admin-client-action-edit-subscription', label: t('client.editPass'), disabled: !selectedSubscriptions.length, onSelect: () => openSubscriptionDetails(selectedSubscription || selectedSubscriptions[0], true) },
            { key: 'charge', testId: 'admin-client-action-charge', label: t('client.addCharge'), onSelect: () => { const next = { ...financeForm, chargeIdempotencyKey: createPaymentAttemptKey('admin-charge') }; setFinanceForm(next); setFinanceAction('charge'); setFinanceBaseline(next); setFinanceFieldErrors({}); setPaymentPanelOpen(false); setPaymentBaseline(null) } },
            { key: 'remind', testId: 'admin-client-action-remind', label: t('client.remind'), disabled: actionBusy != null, onSelect: sendReminder },
          ]}><span>{t('common.more')}</span><I.ChevronD size={14} aria-hidden="true" /></ActionPopover>
        </div>
        <FormModal open={Boolean(financeAction)} title={subscriptionEditorOpen ? t('finance.renewPass') : ({ charge: t('client.newCharge'), issue: t('client.sellPassTitle') }[financeAction] || t('finance.operation'))} size="lg" busy={actionBusy != null} dirty={Boolean(financeBaseline) && JSON.stringify(financeForm) !== JSON.stringify(financeBaseline)} onRequestClose={() => { if (financeBaseline) setFinanceForm(financeBaseline); setFinanceAction(null); setFinanceBaseline(null); setFinanceFieldErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={actionBusy != null} onClick={() => requestClose('cancel')}>{t('common.close')}</Button><Button variant="primary" data-testid="admin-client-finance-save" loading={actionBusy === financeAction} disabled={actionBusy != null || loading} onClick={executeFinanceAction}>{t('common.save')}</Button></>}>
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
                  <Checkbox id={FINANCE_FIELD_IDS.paymentReceived} label={t('finance.subscriptionPaymentReceived')} checked={financeForm.paymentReceived} onChange={(event) => updateFinanceForm('paymentReceived', event.target.checked)} />
                  {financeForm.paymentReceived && <>
                    <Select id={FINANCE_FIELD_IDS.paymentMethod} label={t('field.paymentMethod')} value={financeForm.paymentMethod} error={financeFieldErrors.paymentMethod} onChange={(event) => updateFinanceForm('paymentMethod', event.target.value)}><option value="cash">{t('paymentMethod.cash')}</option><option value="bank_transfer">{t('paymentMethod.bankTransfer')}</option><option value="card">{t('paymentMethod.card')}</option><option value="other">{t('paymentMethod.other')}</option></Select>
                    <DateField id={FINANCE_FIELD_IDS.paymentDate} label={t('field.paymentDate')} value={financeForm.paymentDate} error={financeFieldErrors.paymentDate} onChange={(value) => updateFinanceForm('paymentDate', value)} />
                    <p className="ops-grid-full strong" style={{ margin: 0 }}>{t('finance.subscriptionPaymentAmount', { amount: subscriptionTypes.find((type) => String(type.typeId) === String(financeForm.subscriptionTypeId))?.price ?? '—', currency: subscriptionTypes.find((type) => String(type.typeId) === String(financeForm.subscriptionTypeId))?.currency ?? '' })}</p>
                    <p className="ops-grid-full ops-subscription-payment-warning">{t('finance.subscriptionPaymentWarning')}</p>
                  </>}
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
            </div>
        </FormModal>

        <FormModal open={Boolean(openedSubscription)} title={subscriptionLabel(openedSubscription)} size="lg" busy={actionBusy === 'combined-subscription'} dirty={subscriptionEditing && Boolean(subscriptionDraft) && (subscriptionDraft.startDate !== openedSubscription?.start_date || subscriptionDraft.endDate !== openedSubscription?.effective_end_date || subscriptionDraft.remaining !== String(openedSubscription?.remaining_sessions ?? '') || Boolean(subscriptionDraft.freezeStart || subscriptionDraft.freezeEnd))} onRequestClose={() => { setOpenedSubscriptionId(null); setSubscriptionEditing(false); setSubscriptionError(null) }} footer={({ requestClose }) => <>
          <Button variant="secondary" disabled={actionBusy != null} onClick={() => requestClose('close')}>{t('common.close')}</Button>
          {!accountArchived && openedSubscription && !subscriptionEditing && <><Button variant="secondary" onClick={() => { setOpenedSubscriptionId(null); openSubscriptionEditor(openedSubscription) }}>{t('finance.renewPass')}</Button><Button variant="primary" onClick={() => openSubscriptionDetails(openedSubscription, true)}>{t('finance.editPass')}</Button></>}
          {subscriptionEditing && <Button variant="primary" data-testid="admin-client-subscription-save" loading={actionBusy === 'combined-subscription'} disabled={actionBusy != null} onClick={saveSubscriptionDetails}>{t('common.save')}</Button>}
        </>}>
          {openedSubscription && <div className="ops-subscription-detail">
            <div className="ops-financial-context">
              <div><span>{t('common.participant')}</span><strong>{openedSubscription.participant?.full_name || participantName(openedSubscription.participant_id)}</strong></div>
              <div><span>{t('field.start')}</span><strong>{openedSubscription.start_date}</strong></div>
              <div><span>{t('field.end')}</span><strong>{openedSubscription.effective_end_date}</strong></div>
              <div><span>{t('field.remaining')}</span><strong>{openedSubscription.remaining_sessions ?? t('field.noLimit')}</strong></div>
            </div>
            {subscriptionError && <Banner tone="danger" onClose={() => setSubscriptionError(null)}>{subscriptionError}</Banner>}
            {subscriptionEditing && subscriptionDraft && <div className="ops-form-grid">
              <DateField id="admin-client-subscription-start-date" label={t('field.subscriptionStartDate')} value={subscriptionDraft.startDate} onChange={(value) => setSubscriptionDraft((draft) => ({ ...draft, startDate: value }))} />
              <DateField id="admin-client-subscription-end-date" label={t('field.subscriptionEndDate')} value={subscriptionDraft.endDate} onChange={(value) => setSubscriptionDraft((draft) => ({ ...draft, endDate: value }))} />
              {openedSubscription.remaining_sessions != null && <Input id="admin-client-subscription-remaining" type="number" min="0" step="1" label={t('finance.targetRemaining')} value={subscriptionDraft.remaining} onChange={(event) => setSubscriptionDraft((draft) => ({ ...draft, remaining: event.target.value }))} />}
              <div className="ops-grid-full ops-freeze-fields" role="group" aria-label={t('finance.freezePeriod')}>
                <strong>{t('finance.freezePeriod')}</strong>
                <div className="ops-form-grid">
                  <DateField id="admin-client-subscription-freeze-start" label={t('field.freezeStart')} value={subscriptionDraft.freezeStart} onChange={(value) => setSubscriptionDraft((draft) => ({ ...draft, freezeStart: value }))} />
                  <DateField id="admin-client-subscription-freeze-end" label={t('field.freezeEnd')} value={subscriptionDraft.freezeEnd} onChange={(value) => setSubscriptionDraft((draft) => ({ ...draft, freezeEnd: value }))} />
                </div>
              </div>
              <Select id="admin-client-subscription-reason" label={t('field.reason')} value={subscriptionDraft.reasonPreset} onChange={(event) => setSubscriptionDraft((draft) => ({ ...draft, reasonPreset: event.target.value }))}>
                <option value="">{t('finance.selectReason')}</option>
                <option value={t('finance.reasonMistake')}>{t('finance.reasonMistake')}</option>
                <option value={t('finance.reasonCompensation')}>{t('finance.reasonCompensation')}</option>
                <option value={t('finance.reasonBonus')}>{t('finance.reasonBonus')}</option>
                <option value="other">{t('finance.reasonOther')}</option>
              </Select>
              {subscriptionDraft.reasonPreset === 'other' && <Input id="admin-client-subscription-custom-reason" label={t('field.reason')} maxLength={255} value={subscriptionDraft.customReason} onChange={(event) => setSubscriptionDraft((draft) => ({ ...draft, customReason: event.target.value }))} />}
              <div className="ops-grid-full ops-subscription-preview" role="status">
                {subscriptionDraft.startDate !== openedSubscription.start_date && <p>{t('field.subscriptionStartDate')}: {openedSubscription.start_date} → {subscriptionDraft.startDate || '—'}</p>}
                {subscriptionDraft.endDate !== openedSubscription.effective_end_date && <p>{t('field.subscriptionEndDate')}: {openedSubscription.effective_end_date} → {subscriptionDraft.endDate || '—'}</p>}
                {openedSubscription.remaining_sessions != null && subscriptionDraft.remaining !== String(openedSubscription.remaining_sessions) && <p>{t('finance.subscriptionPreview', { before: openedSubscription.remaining_sessions, after: subscriptionDraft.remaining || '—' })}</p>}
                {(subscriptionDraft.freezeStart || subscriptionDraft.freezeEnd) && <p>{t('finance.freezePass')}: {subscriptionDraft.freezeStart || '—'} — {subscriptionDraft.freezeEnd || '—'}</p>}
              </div>
            </div>}
            <h3>{t('finance.subscriptionHistory')}</h3>
            {(openedSubscription.ledger || []).length ? <div className="ops-subscription-history">
              {[...openedSubscription.ledger].reverse().map((entry) => <div key={entry.id} className="ops-subscription-history-row">
                <div><strong>{t(`finance.ledger.${entry.reason}`)}</strong><span>{entry.session_start_at ? formatLocalDate(entry.session_start_at) : formatLocalDate(entry.created_at)}</span></div>
                {entry.session_id && <button type="button" className="ops-link-button" onClick={() => { setOpenedSubscriptionId(null); go?.('attendance', { sessionId: entry.session_id }) }}>{entry.group || t('field.session')} · {entry.trainer || '—'}</button>}
                {entry.related_subscription_id && subscriptions.some((row) => row.id === entry.related_subscription_id && row.participant_id === openedSubscription.participant_id) && <button type="button" className="ops-link-button" onClick={() => openSubscriptionDetails(subscriptions.find((row) => row.id === entry.related_subscription_id))}>{t('finance.relatedSubscription', { id: entry.related_subscription_id })}</button>}
                <div><strong>{entry.delta > 0 ? `+${entry.delta}` : entry.delta}</strong><span>{t('finance.balanceAfterSessions', { count: entry.balance_after })}</span></div>
                {entry.note && <small>{entry.note}</small>}
                {entry.created_by && <small>{t('finance.changedBy', { name: entry.created_by })}</small>}
              </div>)}
            </div> : <p className="muted">{t('finance.noSubscriptionHistory')}</p>}
            {(openedSubscription.freezes || []).length > 0 && <><h3>{t('finance.freezeHistory')}</h3><div className="ops-subscription-history">{openedSubscription.freezes.map((freeze) => <div key={freeze.id} className="ops-subscription-history-row"><strong>{freeze.start_date} — {freeze.end_date}</strong><span>{freeze.reason}</span>{freeze.created_by && <small>{t('finance.changedBy', { name: freeze.created_by })}</small>}</div>)}</div></>}
            {(openedSubscription.end_date_changes || []).length > 0 && <><h3>{t('finance.endDateHistory')}</h3><div className="ops-subscription-history">{openedSubscription.end_date_changes.map((change) => <div key={change.id} className="ops-subscription-history-row">{change.previous_start && change.previous_start !== change.current_start && <strong>{t('field.start')}: {change.previous_start} → {change.current_start}</strong>}{change.previous !== change.current && <strong>{t('field.end')}: {change.previous} → {change.current}</strong>}<span>{formatLocalDate(change.created_at)}</span>{change.reason && <small>{change.reason}</small>}{change.created_by && <small>{t('finance.changedBy', { name: change.created_by })}</small>}</div>)}</div></>}
          </div>}
        </FormModal>

        <FormModal open={Boolean(reversalTarget)} title={t('finance.reverseChargeTitle')} description={t('finance.reverseChargeDescription')} size="sm" busy={actionBusy === 'reverse-charge'} dirty={Boolean(reversalReason)} onRequestClose={() => { setReversalTarget(null); setReversalReason(''); setReversalReasonError(null); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={actionBusy === 'reverse-charge'} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="danger" loading={actionBusy === 'reverse-charge'} disabled={actionBusy === 'reverse-charge'} onClick={reverseCharge}>{t('finance.reverseCharge')}</Button></>}>
          {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
          <p className="muted" style={{ marginTop: 0 }}>{reversalTarget?.description} · <Money amount={money(reversalTarget?.amount_minor)} /></p>
          <Input id="admin-client-charge-reversal-reason" label={t('finance.reverseReason')} value={reversalReason} error={reversalReasonError} onChange={(event) => { setReversalReason(event.target.value); setReversalReasonError(null) }} />
        </FormModal>

        <div key={tab} className="ops-client-section ops-motion-fade">
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
              { key: 'status', header: t('common.status'), width: 110, render: (row) => <StatusPill status={row.is_active ? 'active' : 'inactive'} size="sm" /> },
              { key: 'training', header: t('field.training'), render: (row) => <div className="ops-button-row"><Button size="sm" variant="subtle" data-testid={`admin-client-create-individual-${row.id}`} disabled={!row.is_active || accountArchived} onClick={() => go?.('schedule', { createSession: 'individual', participantId: row.id })}>{t('field.individualSession')}</Button><Button size="sm" variant="subtle" data-testid={`admin-client-create-split-${row.id}`} disabled={!row.is_active || accountArchived} onClick={() => go?.('schedule', { createSession: 'split', participantId: row.id })}>{t('field.splitSession')}</Button></div> },
            ]}
          />
          </div>
        )}

        {tab === 'subscriptions' && (
          <Table
            rows={selectedSubscriptions}
            emptyLabel={t('client.noSubscriptions')}
            onRowClick={(subscription) => openSubscriptionDetails(subscription)}
            columns={[
              { key: 'type', header: t('common.type'), render: (row) => <span className="strong">{row.type}</span> },
              { key: 'participant', header: t('common.participant'), render: (row) => row.participant?.full_name || participantName(row.participant_id) },
              { key: 'start_date', header: t('field.start'), muted: true },
              { key: 'effective_end_date', header: t('field.end'), muted: true },
              { key: 'created_at', header: t('field.issued'), muted: true, render: (row) => row.created_at ? formatLocalDate(row.created_at) : '-' },
              { key: 'remaining_sessions', header: t('field.remaining'), align: 'right', width: 90, render: (row) => <span className="ops-client-detail-remaining">{row.remaining_sessions ?? t('field.noLimit')}</span> },
              { key: 'status', header: t('common.status'), width: 120, render: (row) => <StatusPill status={status(row.status)} size="sm" /> },
            ]}
          />
        )}

        {tab === 'payments' && (
          <div>
            <FormModal open={paymentPanelOpen} title={t('client.topUp')} description={t('client.paymentFormDescription')} size="lg" busy={actionBusy != null} dirty={Boolean(paymentBaseline) && JSON.stringify(paymentForm) !== JSON.stringify(paymentBaseline)} onRequestClose={() => { if (paymentBaseline) setPaymentForm(paymentBaseline); setPaymentPanelOpen(false); setPaymentBaseline(null); setPaymentFieldErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={actionBusy != null} onClick={() => requestClose('cancel')}>{t('common.close')}</Button><Button data-testid="admin-client-payment-confirm" variant="primary" loading={actionBusy === 'manual-payment'} disabled={actionBusy != null || loading} onClick={createManualPayment}>{t('client.confirmPayment')}</Button></>}>
                {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
                <div className="ops-financial-context" aria-label={t('finance.contextPayment')}>
                  <div><span>{t('client.title')}</span><strong>{account.full_name || account.username || '—'}</strong></div>
                  <div><span>{t('common.participant')}</span><strong>{selectedPaymentParticipant?.full_name || t('field.selectParticipant')}</strong></div>
                  <div><span>{t('finance.familyBalance')}</span><strong><Money amount={selectedPaymentBalance} signed currency="zł" /></strong></div>
                  <div><span>{t('field.method')}</span><strong>{paymentMethodLabel(paymentForm.method, locale)}</strong></div>
                </div>
                <div className="ops-form-grid">
                  <p className="muted ops-grid-full">{t('finance.familyPaymentHint')}</p>
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

            <div className="ops-mobile-payment-switch" role="tablist" aria-label={t('payments.title')} data-view={mobilePaymentView}>
              <button type="button" role="tab" aria-selected={mobilePaymentView === 'topups'} onClick={() => setMobilePaymentView('topups')}>{t('finance.topups')}</button>
              <button type="button" role="tab" aria-selected={mobilePaymentView === 'charges'} onClick={() => setMobilePaymentView('charges')}>{t('client.charges')}</button>
            </div>
            <div className="ops-client-payments-grid" data-mobile-view={mobilePaymentView}>
            <div className="ops-client-payment-charges">
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
            <div className="ops-client-payment-topups">
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
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="ops-client-attendance-toolbar">
              <div className="ops-client-attendance-actions">
              {!attendanceEditing ? <Button data-testid="admin-client-attendance-edit" variant="secondary" disabled={accountArchived || !editableAttendance.length || actionBusy != null} onClick={() => {
                setAttendanceEditing(true)
                setAttendanceIds([])
                setAttendanceSource(paymentSubscriptions.length ? 'subscription' : 'account')
                setAttendanceSubscriptionId(paymentSubscriptions.length === 1 ? String(paymentSubscriptions[0].id) : '')
                setAttendanceError(null)
              }}>{t('common.edit')}</Button> : <>
                <Button variant="secondary" disabled={actionBusy != null} onClick={() => { setAttendanceEditing(false); setAttendanceIds([]); setAttendanceError(null) }}>{t('common.cancel')}</Button>
                <Button data-testid="admin-client-attendance-save" loading={actionBusy === 'attendance-payment'} disabled={actionBusy != null || !attendanceIds.length || (attendanceSource === 'subscription' && !paymentSubscription)} onClick={saveAttendancePayment}>{t('common.save')}</Button>
              </>}
            </div>
              <Button data-testid="admin-client-attendance-filters" variant={attendanceFiltersOpen || attendancePaymentFilter.length || attendanceStatusFilter.length ? 'subtle' : 'secondary'} aria-expanded={attendanceFiltersOpen} aria-controls="admin-client-attendance-filters-panel" onClick={() => setAttendanceFiltersOpen((open) => !open)}>{t('schedule.filters')}</Button>
            </div>
            {attendanceFilterPresence.present && <section id="admin-client-attendance-filters-panel" className={`card card-pad ops-client-attendance-filters ops-motion-panel${attendanceFilterPresence.exiting ? ' is-exiting' : ''}`} aria-label={t('schedule.filters')} aria-hidden={attendanceFilterPresence.exiting || undefined} inert={attendanceFilterPresence.exiting || undefined}>
              <div className="ops-form-grid">
              {[
                { id: 'source', label: t('finance.paymentSource'), values: attendancePaymentFilter, change: setAttendancePaymentFilter,
                  options: [['account', t('finance.fromAccount')], ['subscription', t('finance.fromSubscription')], ['none', t('finance.sourceNotSpecified')]] },
                { id: 'status', label: t('common.status'), values: attendanceStatusFilter, change: setAttendanceStatusFilter,
                  options: [['present', t('attendance.present')], ['absent', t('attendance.absent')], ['rescheduled', t('attendance.rescheduled')]] },
              ].map(({ id, label, values, change, options }) => {
                const selectedLabel = options.filter(([value]) => values.includes(value)).map(([, text]) => text).join(', ') || t('finance.allVisits')
                return <div key={id} className="ops-attendance-filter">
                  <span>{label}</span>
                  <details id={`admin-client-attendance-filter-${id}`}>
                    <summary aria-label={`${label}: ${selectedLabel}`} title={selectedLabel}>{selectedLabel}</summary>
                    <div className="ops-attendance-filter-options" role="group" aria-label={label}>
                      <Button size="sm" variant="subtle" disabled={actionBusy != null} onClick={() => change([])}>{t('finance.allVisits')}</Button>
                      {options.map(([value, text]) => <Checkbox key={value} label={text} checked={values.includes(value)} disabled={actionBusy != null} onChange={() => change(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])} />)}
                    </div>
                  </details>
                </div>
              })}
            </div>
            </section>}
            {attendancePaymentPresence.present && <section id="admin-client-attendance-payment-panel" className={`card card-pad ops-client-attendance-payment ops-motion-panel${attendancePaymentPresence.exiting ? ' is-exiting' : ''}`} aria-label={t('finance.paymentSource')} aria-hidden={attendancePaymentPresence.exiting || undefined} inert={attendancePaymentPresence.exiting || undefined}>
              <span className="muted" aria-live="polite">{t('finance.attendanceSelected', { count: attendanceIds.length })}</span>
              {attendanceError && <Banner tone="danger" onClose={() => setAttendanceError(null)}>{attendanceError}</Banner>}
              <div className="ops-form-grid">
              {selectedHistoricalAttendance && <div className="ops-grid-full"><Banner tone="warning">{t('finance.attendanceHistoryWarning')}</Banner></div>}
              <Select id="admin-client-attendance-source" label={t('finance.paymentSource')} value={attendanceSource} disabled={actionBusy != null} onChange={(event) => setAttendanceSource(event.target.value)}>
                <option value="account">{t('finance.fromAccount')}</option>
                <option value="subscription" disabled={!paymentSubscriptions.length}>{t('finance.fromSubscription')}</option>
              </Select>
              {attendanceSource === 'subscription' && (paymentSubscriptions.length > 1
                ? <Select id="admin-client-attendance-subscription" label={t('clients.subscription')} value={attendanceSubscriptionId} disabled={actionBusy != null} onChange={(event) => setAttendanceSubscriptionId(event.target.value)}>
                  <option value="">{t('finance.selectSubscriptionError')}</option>
                  {paymentSubscriptions.map((row) => <option key={row.id} value={row.id}>{subscriptionLabel(row)} · {t('field.remainingPrefix', { count: row.remaining_sessions ?? t('field.noLimit') })}</option>)}
                </Select>
                : <p className="muted">{subscriptionLabel(paymentSubscription)}</p>)}
              {attendanceSource === 'subscription' && paymentRemaining < 0 && <div className="ops-grid-full"><Banner tone="warning">{t('finance.attendanceNegativeWarning', { remaining: paymentRemaining })}</Banner></div>}
              </div>
            </section>}
          <Table
            rows={filteredAttendance}
            emptyLabel={t('client.noAttendance')}
            columns={[
              ...(attendanceEditing ? [{ key: 'select', header: t('finance.attendanceSelection'), width: 60, render: (row) => row.deducts ? <Checkbox aria-label={t('finance.selectVisit', { date: formatLocalShortDate(row.session_start_at) })} checked={attendanceIds.includes(row.id)} disabled={actionBusy != null} onChange={() => setAttendanceIds((ids) => ids.includes(row.id) ? ids.filter((id) => id !== row.id) : [...ids, row.id])} /> : null }] : []),
              { key: 'participant', header: t('common.participant'), render: (row) => <span className="strong">{row.participant}</span> },
              { key: 'session_start_at', header: t('field.session'), render: (row) => <button type="button" className="ops-link-button" onClick={() => go?.('attendance', { sessionId: row.session_id })}>{formatLocalShortDate(row.session_start_at)} {formatTime(row.session_start_at)}-{formatTime(row.session_end_at)}</button> },
              { key: 'group', header: t('common.group'), muted: true },
              { key: 'trainer', header: t('common.trainer'), muted: true },
              { key: 'status', header: t('common.status'), width: 120, render: (row) => <StatusPill status={row.status} size="sm" /> },
              { key: 'payment_source', header: t('finance.paymentSource'), render: (row) => {
                if (row.payment_source !== 'subscription') return row.payment_source === 'account' ? t('finance.fromAccount') : '—'
                const label = subscriptionLabel(subscriptions.find((item) => String(item.id) === String(row.payment_subscription_id)))
                return `${t('finance.fromSubscription')}${label ? `: ${label}` : ''}`
              } },
              { key: 'deducts', header: t('finance.sessionsDeducted'), width: 90, render: (row) => {
                const delta = row.subscription_session_delta ?? (row.deducts ? -1 : 0)
                return <Badge tone={delta < 0 ? 'warning' : 'neutral'}>{delta}</Badge>
              } },
            ]}
          />
          </div>
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
                <Button data-testid="admin-client-privacy-export" variant="secondary" loading={actionBusy === 'export'} disabled={actionBusy != null || loading} onClick={exportClientData}>{t('client.downloadData')}</Button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="strong">{t('client.archiveTitle')}</div>
                  <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('client.archiveDescription')}</div>
                </div>
                <Button data-testid="admin-client-privacy-archive" variant="secondary" loading={actionBusy === 'archive'} disabled={accountArchived || actionBusy != null || loading} onClick={() => setConfirmAction({ type: 'archive' })}>{t('client.archive')}</Button>
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
                <Button data-testid="admin-client-privacy-anonymize" variant="danger" loading={actionBusy === 'anonymize'} disabled={accountArchived || actionBusy != null || loading} onClick={() => setConfirmAction({ type: 'anonymize' })}>{t('client.anonymize')}</Button>
              </div>
            </div>
          </div>
        )}

        </div>

        <Dialog
            open={Boolean(confirmAction)}
            title={confirmAction?.type === 'archive' ? t('client.archiveConfirmTitle') : confirmAction?.type === 'restore' ? t('client.restoreConfirmTitle') : confirmAction?.type === 'revokeAccess' ? t('access.revokeConfirmTitle') : t('client.anonymizeConfirmTitle')}
            description={confirmAction?.type === 'archive'
              ? t('client.archiveConfirmDescription')
              : confirmAction?.type === 'restore'
                ? t('client.restoreConfirmDescription')
                : confirmAction?.type === 'revokeAccess'
                  ? t('access.revokeConfirmDescription')
                  : t('client.anonymizeConfirmDescription')}
            tone={confirmAction?.type === 'restore' ? 'default' : 'danger'}
            irreversible={confirmAction?.type === 'anonymize'}
            confirmLabel={confirmAction?.type === 'archive' ? t('client.blacklistAction') : confirmAction?.type === 'restore' ? t('clients.restore') : confirmAction?.type === 'revokeAccess' ? t('access.revoke') : t('client.anonymize')}
            onClose={() => actionBusy ? null : setConfirmAction(null)}
            onConfirm={runDangerAction}
          >
            <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              {t('client.contextPrefix')} <span className="strong">{account.full_name || account.username || fallbackClientId}</span>
            </div>
          </Dialog>
      </div>
    )
  }
}

