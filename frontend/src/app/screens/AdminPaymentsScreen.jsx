import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage, downloadFile } from '../../api.js'
import { adminLocaleTag } from '../../adminLocales.js'
import { adminFinanceTranslator } from '../../adminFinanceLocales.js'
import { paymentMethodLabel } from '../../contracts.js'
import { useLocale } from '../../i18n.jsx'
import { asAccountBalance, mapAdminPaymentRows, paymentSourceLabel } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'
import { loadAdminParticipantOptions } from '../participantSearch.js'
import {
  clearFieldError,
  fieldErrorsFromApi,
  focusFirstFieldError,
  formErrorMessage,
} from '../formErrors.js'
import { validIsoDate } from '../scheduleContracts.js'
import { FormModal } from '../FormModal.jsx'
import { ListFeedback, ListPagination, ListToolbar, useScreenList } from '../listFoundation.jsx'
import { ActionPopover, EntityMobileCard } from '../EntityListPrimitives.jsx'
import { assertPaymentReadback, createPaymentAttemptKey, moneyMajorToMinor, rebasePassiveFormUpdate } from '../financialContracts.js'

const TYPE_FIELD_MAP = {
  name: 'name', price_minor: 'price', currency: 'currency',
  duration_days: 'durationDays', sessions_count: 'sessionsCount',
  is_individual: 'isIndividual', is_active: 'isActive',
}
const TYPE_FIELD_IDS = {
  name: 'subscription-type-name', price: 'subscription-type-price',
  currency: 'subscription-type-currency', durationDays: 'subscription-type-duration',
  sessionsCount: 'subscription-type-sessions', isUnlimited: 'subscription-type-unlimited',
  isIndividual: 'subscription-type-individual', isActive: 'subscription-type-active',
}
const TYPE_EDIT_FIELD_IDS = Object.fromEntries(
  Object.entries(TYPE_FIELD_IDS).map(([key, value]) => [key, `${value}-edit`]),
)
const FINANCE_FIELD_IDS = {
  participantId: 'admin-finance-participant',
  subscriptionTypeId: 'admin-finance-subscription-type',
  subscriptionId: 'admin-finance-subscription',
  startDate: 'admin-finance-start-date', dueDate: 'admin-finance-due-date',
  chargeDescription: 'admin-finance-charge-description',
  chargeAmount: 'admin-finance-charge-amount',
  paymentAmount: 'admin-finance-payment-amount',
  paymentDate: 'admin-finance-payment-date',
  paymentMethod: 'admin-finance-payment-method',
  paymentComment: 'admin-finance-payment-comment',
  freezeStart: 'admin-finance-freeze-start', freezeEnd: 'admin-finance-freeze-end',
  freezeReason: 'admin-finance-freeze-reason',
  adjustDelta: 'admin-finance-adjust-delta', adjustNote: 'admin-finance-adjust-note',
}
const PAYMENT_EDIT_FIELD_IDS = {
  method: 'admin-payment-edit-method', comment: 'admin-payment-edit-comment',
}
const REJECT_FIELD_IDS = { reason: 'admin-payment-reject-reason' }

function validPositiveMoney(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0
}

function validNonnegativeMoney(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return String(value ?? '').trim() !== '' && Number.isFinite(parsed) && parsed >= 0
}

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0
}

export function createAdminPaymentsScreen(components, icons, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Money, Button, IconButton, Tabs, Banner, Avatar, Input, Select, Checkbox } = components
  const I = icons

  return function ApiAdminPayments({ go, initialTab, currentUser }) {
    const { locale } = useLocale()
    const t = useMemo(() => adminFinanceTranslator(locale), [locale])
    const localeTag = adminLocaleTag(locale)
    const participants = adminData.clients || []
    const subscriptionTypes = adminData.subscriptionTypes || []
    const [tab, setTab] = useState('review')
    const paymentList = useScreenList({
      path: '/api/admin/payments/',
      itemKey: 'payments',
      mapRows: mapAdminPaymentRows,
      role: 'admin',
      route: `payments-${tab}`,
      userKey: currentUser?.id || currentUser?.username,
      initialFilters: { method: '', source: '' },
      fixedParams: { status: ({ review: 'pending', confirmed: 'confirmed', rejected: 'rejected' })[tab] || '' },
      defaultOrder: '-date',
    })
    const [reject, setReject] = useState(null)
    const [rejectReason, setRejectReason] = useState('')
    const [rejectErrors, setRejectErrors] = useState({})
    const [editingPayment, setEditingPayment] = useState(null)
    const [paymentEditForm, setPaymentEditForm] = useState({ method: 'cash', comment: '' })
    const [paymentEditBaseline, setPaymentEditBaseline] = useState(null)
    const [paymentEditErrors, setPaymentEditErrors] = useState({})
    const [rows, setRows] = useState([])
    const [subscriptions, setSubscriptions] = useState([])
    const [subscriptionsLoading, setSubscriptionsLoading] = useState(false)
    const [financeForm, setFinanceForm] = useState({
      participantId: participants[0]?.studentId || '',
      subscriptionTypeId: subscriptionTypes[0]?.typeId || '',
      subscriptionId: '',
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      chargeDescription: '',
      chargeAmount: '',
      paymentAmount: '',
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'cash',
      paymentComment: '',
      paymentIdempotencyKey: createPaymentAttemptKey('admin-payment'),
      subscriptionIdempotencyKey: createPaymentAttemptKey('admin-subscription'),
      freezeStart: new Date().toISOString().slice(0, 10),
      freezeEnd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      freezeReason: '',
      adjustDelta: '1',
      adjustNote: '',
    })
    const [financeErrors, setFinanceErrors] = useState({})
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
    const [subscriptionTypeErrors, setSubscriptionTypeErrors] = useState({})
    const [creatingSubscriptionType, setCreatingSubscriptionType] = useState(false)
    const [subscriptionTypeBaseline, setSubscriptionTypeBaseline] = useState(null)
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
    const [subscriptionTypeEditErrors, setSubscriptionTypeEditErrors] = useState({})
    const [subscriptionTypeEditBaseline, setSubscriptionTypeEditBaseline] = useState(null)
    const [financeAction, setFinanceAction] = useState(null)
    const [financeBaseline, setFinanceBaseline] = useState(null)
    const financeFormRef = React.useRef(financeForm)
    const financeBaselineRef = React.useRef(financeBaseline)
    financeFormRef.current = financeForm
    financeBaselineRef.current = financeBaseline
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busyId, setBusyId] = useState(null)
    const [toolPanel, setToolPanel] = useState(null)
    const selectedType = subscriptionTypes.find((type) => String(type.typeId) === String(financeForm.subscriptionTypeId))
    const selectedParticipant = participants.find((participant) => String(participant.studentId) === String(financeForm.participantId))
    const subscriptionStatusLabel = (value) => (
      ['active', 'frozen', 'expired', 'inactive'].includes(value) ? t(`status.${value}`) : value || '—'
    )

    const updateFinanceForm = (field, value) => {
      setFinanceErrors((current) => clearFieldError(current, field))
      if (field === 'participantId') {
        setSubscriptions([])
        setSubscriptionsLoading(Boolean(value))
      }
      setFinanceForm((current) => {
      if (field === 'participantId') {
        return { ...current, participantId: value, subscriptionId: '' }
      }
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
    }
    const applyPassiveFinanceUpdate = (patch) => {
      const previousBaseline = financeBaselineRef.current
      const rebased = rebasePassiveFormUpdate(
        financeFormRef.current,
        previousBaseline,
        patch,
      )
      financeFormRef.current = rebased.form
      financeBaselineRef.current = rebased.baseline
      setFinanceForm(rebased.form)
      if (rebased.baseline !== previousBaseline) setFinanceBaseline(rebased.baseline)
    }
    const updateSubscriptionTypeForm = (field, value) => {
      setSubscriptionTypeErrors((current) => clearFieldError(current, field))
      setSubscriptionTypeForm((current) => ({
        ...current,
        [field]: value,
        ...(field === 'isUnlimited' && value ? { sessionsCount: '' } : {}),
      }))
    }
    const updateSubscriptionTypeEditForm = (field, value) => {
      setSubscriptionTypeEditErrors((current) => clearFieldError(current, field))
      setSubscriptionTypeEditForm((current) => ({
        ...current,
        [field]: value,
        ...(field === 'isUnlimited' && value ? { sessionsCount: '' } : {}),
      }))
    }

    function showFinanceErrors(nextErrors) {
      setFinanceErrors(nextErrors)
      setError(null)
      focusFirstFieldError(nextErrors, FINANCE_FIELD_IDS)
      return false
    }

    function showApiFieldErrors(err, fieldMap, setErrors, fieldIds, fallback) {
      const nextErrors = fieldErrorsFromApi(err, fieldMap)
      setErrors(nextErrors)
      setError(formErrorMessage(err, fallback))
      focusFirstFieldError(nextErrors, fieldIds)
    }

    useEffect(() => {
      setRows([...(adminData.payments || [])])
    }, [adminData.payments])

    useEffect(() => {
      if (initialTab) setTab(initialTab)
    }, [initialTab])

    useEffect(() => {
      setRows(paymentList.rows.map((payment) => ({
        ...payment,
        clientId: participants.find((client) => client.studentId === payment.studentId)?.clientId,
      })))
    }, [paymentList.rows, participants])

    useEffect(() => {
      if (!financeForm.participantId) {
        setSubscriptions([])
        setSubscriptionsLoading(false)
        return undefined
      }
      let alive = true
      setSubscriptions([])
      setSubscriptionsLoading(true)
      applyPassiveFinanceUpdate({ subscriptionId: '' })
      api.get(`/api/admin/participants/${financeForm.participantId}/subscriptions/`)
        .then((payload) => {
          if (!alive) return
          const list = payload.subscriptions || []
          setSubscriptions(list)
          const currentSubscriptionId = financeFormRef.current.subscriptionId
          applyPassiveFinanceUpdate({
            subscriptionId: list.some((item) => String(item.id) === String(currentSubscriptionId))
              ? currentSubscriptionId
              : list[0]?.id || '',
          })
        })
        .catch((err) => {
          if (alive) setError(apiErrorMessage(err, t('finance.loadSubscriptionsError')))
        })
        .finally(() => {
          if (alive) setSubscriptionsLoading(false)
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
    const visibleRows = rows

    async function updatePayment(payment, action, reason = '') {
      if (action === 'reject' && !reason.trim()) {
        const nextErrors = { reason: t('finance.rejectReasonRequired') }
        setRejectErrors(nextErrors)
        focusFirstFieldError(nextErrors, REJECT_FIELD_IDS)
        return
      }
      setBusyId(payment.id)
      setError(null)
      try {
        const path = action === 'confirm'
          ? `/api/admin/payments/${payment.paymentId || payment.id}/confirm/`
          : `/api/admin/payments/${payment.paymentId || payment.id}/reject/`
        const mutation = await api.post(path, action === 'reject' ? { reason: reason.trim() } : {})
        const readback = await api.get(`/api/admin/payments/${payment.paymentId || payment.id}/`)
        const expectedStatus = action === 'confirm' ? 'confirmed' : 'rejected'
        assertPaymentReadback(mutation, readback, expectedStatus)
        let checkedBalance = Number.isInteger(mutation.balance_minor) ? asAccountBalance(mutation.balance_minor) : null
        if (payment.clientId) {
          const clientReadback = await api.get(`/api/admin/clients/${payment.clientId}/`)
          checkedBalance = asAccountBalance(clientReadback?.summary?.balance_minor)
        }
        await paymentList.retry()
        setReject(null)
        setRejectReason('')
        setRejectErrors({})
        const balanceSuffix = checkedBalance == null ? '' : t('finance.checkedBalance', { balance: checkedBalance.toFixed(2).replace('.', ',') })
        setMessage(`${action === 'confirm' ? t('finance.paymentConfirmed') : t('finance.paymentRejected')}${balanceSuffix}`)
        reloadRoleData?.('admin')
      } catch (err) {
        setError(apiErrorMessage(err, t('finance.updatePaymentStatusError')))
      } finally {
        setBusyId(null)
      }
    }

    function openPaymentEdit(payment) {
      setEditingPayment(payment)
      const nextForm = { method: payment.methodCode || 'cash', comment: payment.comment || '' }
      setPaymentEditForm(nextForm)
      setPaymentEditBaseline(nextForm)
      setPaymentEditErrors({})
      setError(null)
    }

    async function savePaymentEdit() {
      setBusyId(`edit-${editingPayment.id}`); setError(null); setPaymentEditErrors({})
      try {
        await api.post(`/api/admin/payments/${editingPayment.paymentId || editingPayment.id}/`, { method: paymentEditForm.method, comment: paymentEditForm.comment })
        setRows((current) => current.map((item) => item.id === editingPayment.id ? { ...item, methodCode: paymentEditForm.method, method: paymentMethodLabel(paymentEditForm.method, locale), comment: paymentEditForm.comment } : item))
        setEditingPayment(null); setPaymentEditBaseline(null); setMessage(t('finance.paymentDetailsUpdated'))
      } catch (err) {
        showApiFieldErrors(
          err, { method: 'method', comment: 'comment' },
          setPaymentEditErrors, PAYMENT_EDIT_FIELD_IDS,
          t('finance.updatePaymentDetailsError'),
        )
      } finally { setBusyId(null) }
    }

    function minorFromMajor(value) {
      return Math.round(Number(String(value || 0).replace(',', '.')) * 100)
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
      setSubscriptionTypeEditErrors({})
      const nextForm = {
        name: type.name || '',
        price: String(type.price ?? ''),
        currency: type.currency || 'PLN',
        durationDays: String(type.days || 30),
        sessionsCount: type.isUnlimited ? '' : String(type.sessions ?? ''),
        isUnlimited: type.isUnlimited,
        isIndividual: type.isIndividual,
        isActive: type.active,
      }
      setSubscriptionTypeEditForm(nextForm)
      setSubscriptionTypeEditBaseline(nextForm)
      setError(null)
    }

    function validateSubscriptionType(form, setErrors, fieldIds) {
      const nextErrors = {}
      if (!form.name.trim()) nextErrors.name = t('finance.nameRequired')
      if (!validNonnegativeMoney(form.price)) nextErrors.price = t('finance.priceInvalid')
      if (!positiveInteger(form.durationDays)) nextErrors.durationDays = t('finance.durationInvalid')
      if (!form.isUnlimited && !positiveInteger(form.sessionsCount)) {
        nextErrors.sessionsCount = t('finance.sessionsInvalid')
      }
      if (!String(form.currency || '').trim()) nextErrors.currency = t('finance.currencyRequired')
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length) {
        setError(null)
        focusFirstFieldError(nextErrors, fieldIds)
        return false
      }
      return true
    }

    async function createSubscriptionType() {
      if (!validateSubscriptionType(
        subscriptionTypeForm, setSubscriptionTypeErrors, TYPE_FIELD_IDS)) return
      setBusyId('subscription-type')
      setError(null); setSubscriptionTypeErrors({})
      try {
        await api.post('/api/admin/subscription-types/', subscriptionTypePayload(subscriptionTypeForm))
        setMessage(t('finance.typeCreated'))
        setCreatingSubscriptionType(false)
        setSubscriptionTypeBaseline(null)
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
        showApiFieldErrors(
          err, TYPE_FIELD_MAP, setSubscriptionTypeErrors, TYPE_FIELD_IDS,
          t('finance.createTypeError'),
        )
      } finally {
        setBusyId(null)
      }
    }

    async function saveSubscriptionTypeEdit() {
      if (!editingSubscriptionType) return
      if (!validateSubscriptionType(
        subscriptionTypeEditForm, setSubscriptionTypeEditErrors,
        TYPE_EDIT_FIELD_IDS)) return
      setBusyId('subscription-type-edit')
      setError(null); setSubscriptionTypeEditErrors({})
      try {
        await api.post(
          `/api/admin/subscription-types/${editingSubscriptionType.typeId}/`,
          subscriptionTypePayload(subscriptionTypeEditForm),
        )
        setEditingSubscriptionType(null)
        setSubscriptionTypeEditBaseline(null)
        setMessage(t('finance.typeUpdated'))
        await reloadRoleData?.('admin')
      } catch (err) {
        showApiFieldErrors(
          err, TYPE_FIELD_MAP, setSubscriptionTypeEditErrors,
          TYPE_EDIT_FIELD_IDS, t('finance.saveTypeError'),
        )
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
      const nextErrors = {}
      if (!financeForm.participantId) nextErrors.participantId = t('finance.selectParticipantError')
      if (!financeForm.subscriptionTypeId) nextErrors.subscriptionTypeId = t('finance.selectTypeError')
      if (!validIsoDate(financeForm.startDate)) nextErrors.startDate = t('finance.startDateError')
      if (!validIsoDate(financeForm.dueDate)) nextErrors.dueDate = t('finance.dueDateError')
      if (Object.keys(nextErrors).length && !showFinanceErrors(nextErrors)) return
      setBusyId('subscription')
      setError(null); setFinanceErrors({})
      try {
        const result = await api.post(`/api/admin/participants/${financeForm.participantId}/subscriptions/`, {
          subscription_type_id: financeForm.subscriptionTypeId,
          start_date: financeForm.startDate,
          due_date: financeForm.dueDate,
          idempotency_key: financeForm.subscriptionIdempotencyKey,
        })
        setMessage(t('finance.subscriptionCreated'))
        setFinanceAction(null)
        setFinanceBaseline(null)
        setFinanceForm((current) => ({ ...current, subscriptionId: result.subscription?.id || current.subscriptionId }))
        await reloadSubscriptions()
        await reloadRoleData?.('admin')
      } catch (err) {
        showApiFieldErrors(err, {
          participant_id: 'participantId', subscription_type_id: 'subscriptionTypeId',
          start_date: 'startDate', due_date: 'dueDate', idempotency_key: 'subscriptionTypeId',
        }, setFinanceErrors, FINANCE_FIELD_IDS, t('finance.issueError'))
      } finally {
        setBusyId(null)
      }
    }

    async function createCharge() {
      const nextErrors = {}
      if (!financeForm.participantId) nextErrors.participantId = t('finance.selectParticipantError')
      if (!financeForm.chargeDescription.trim()) nextErrors.chargeDescription = t('finance.chargeDescriptionError')
      if (!validPositiveMoney(financeForm.chargeAmount)) nextErrors.chargeAmount = t('finance.positiveAmountError')
      if (!validIsoDate(financeForm.dueDate)) nextErrors.dueDate = t('finance.dueDateError')
      if (Object.keys(nextErrors).length && !showFinanceErrors(nextErrors)) return
      setBusyId('charge')
      setError(null); setFinanceErrors({})
      try {
        await api.post(`/api/admin/participants/${financeForm.participantId}/charges/`, {
          description: financeForm.chargeDescription,
          amount_minor: minorFromMajor(financeForm.chargeAmount),
          currency: 'PLN',
          due_date: financeForm.dueDate,
        })
        setMessage(t('finance.chargeCreated'))
        setFinanceAction(null)
        setFinanceBaseline(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        showApiFieldErrors(err, {
          participant_id: 'participantId', subscription_id: 'subscriptionId',
          description: 'chargeDescription', amount_minor: 'chargeAmount',
          due_date: 'dueDate', currency: 'chargeAmount',
        }, setFinanceErrors, FINANCE_FIELD_IDS, t('finance.chargeError'))
      } finally {
        setBusyId(null)
      }
    }

    async function createPayment() {
      const nextErrors = {}
      if (!financeForm.participantId) nextErrors.participantId = t('finance.selectParticipantError')
      let amountMinor = null
      amountMinor = moneyMajorToMinor(financeForm.paymentAmount)
      if (!amountMinor) {
        nextErrors.paymentAmount = t('finance.preciseAmountError')
      }
      if (!validIsoDate(financeForm.paymentDate)) nextErrors.paymentDate = t('finance.paymentDateError')
      if (!financeForm.paymentMethod) nextErrors.paymentMethod = t('finance.paymentMethodError')
      if (Object.keys(nextErrors).length && !showFinanceErrors(nextErrors)) return
      setBusyId('payment')
      setError(null); setFinanceErrors({})
      try {
        const created = await api.post('/api/admin/payments/', {
          participant_id: financeForm.participantId,
          amount_minor: amountMinor,
          currency: 'PLN',
          paid_at: financeForm.paymentDate,
          method: financeForm.paymentMethod,
          comment: financeForm.paymentComment,
          confirm: true,
          idempotency_key: financeForm.paymentIdempotencyKey,
        })
        const paymentReadback = await api.get(`/api/admin/payments/${created.id}/`)
        assertPaymentReadback(created, paymentReadback, 'confirmed')
        let checkedBalance = Number.isInteger(created.balance_minor) ? asAccountBalance(created.balance_minor) : null
        if (selectedParticipant?.clientId) {
          const clientReadback = await api.get(`/api/admin/clients/${selectedParticipant.clientId}/`)
          checkedBalance = asAccountBalance(clientReadback?.summary?.balance_minor)
        }
        const balanceSuffix = checkedBalance == null ? '' : t('finance.checkedBalance', { balance: checkedBalance.toFixed(2).replace('.', ',') })
        setMessage(`${t('finance.paymentConfirmed')}${balanceSuffix}`)
        setFinanceAction(null)
        setFinanceBaseline(null)
        setFinanceForm((current) => ({
          ...current,
          paymentAmount: '',
          paymentComment: '',
          paymentIdempotencyKey: createPaymentAttemptKey('admin-payment'),
        }))
        await paymentList.retry()
        await reloadRoleData?.('admin')
      } catch (err) {
        showApiFieldErrors(err, {
          participant_id: 'participantId', amount_minor: 'paymentAmount',
          paid_at: 'paymentDate', method: 'paymentMethod', comment: 'paymentComment', currency: 'paymentAmount',
        }, setFinanceErrors, FINANCE_FIELD_IDS, t('finance.paymentError'))
      } finally {
        setBusyId(null)
      }
    }

    async function freezeSubscription() {
      const nextErrors = {}
      if (!financeForm.subscriptionId) nextErrors.subscriptionId = t('finance.selectSubscriptionError')
      if (!validIsoDate(financeForm.freezeStart)) nextErrors.freezeStart = t('finance.freezeStartError')
      if (!validIsoDate(financeForm.freezeEnd)) nextErrors.freezeEnd = t('finance.freezeEndError')
      if (validIsoDate(financeForm.freezeStart) && validIsoDate(financeForm.freezeEnd) && financeForm.freezeEnd < financeForm.freezeStart) {
        nextErrors.freezeEnd = t('finance.freezeOrderError')
      }
      if (Object.keys(nextErrors).length && !showFinanceErrors(nextErrors)) return
      setBusyId('freeze')
      setError(null); setFinanceErrors({})
      try {
        const result = await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/freeze/`, {
          start_date: financeForm.freezeStart,
          end_date: financeForm.freezeEnd,
          reason: financeForm.freezeReason,
        })
        setMessage(t('finance.frozenDays', { count: result.days }))
        setFinanceAction(null)
        setFinanceBaseline(null)
        await reloadSubscriptions()
      } catch (err) {
        showApiFieldErrors(err, {
          subscription_id: 'subscriptionId', start_date: 'freezeStart',
          end_date: 'freezeEnd', reason: 'freezeReason',
        }, setFinanceErrors, FINANCE_FIELD_IDS, t('finance.freezeError'))
      } finally {
        setBusyId(null)
      }
    }

    async function adjustSubscription() {
      const nextErrors = {}
      if (!financeForm.subscriptionId) nextErrors.subscriptionId = t('finance.selectSubscriptionError')
      const delta = Number(financeForm.adjustDelta)
      if (!Number.isInteger(delta) || delta === 0) nextErrors.adjustDelta = t('finance.adjustDeltaError')
      if (Object.keys(nextErrors).length && !showFinanceErrors(nextErrors)) return
      setBusyId('adjust')
      setError(null); setFinanceErrors({})
      try {
        await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/adjust/`, {
          delta: Number(financeForm.adjustDelta || 0),
          note: financeForm.adjustNote,
        })
        setMessage(t('finance.adjusted'))
        setFinanceAction(null)
        setFinanceBaseline(null)
        await reloadSubscriptions()
      } catch (err) {
        showApiFieldErrors(err, {
          subscription_id: 'subscriptionId', delta: 'adjustDelta', note: 'adjustNote',
        }, setFinanceErrors, FINANCE_FIELD_IDS, t('finance.adjustError'))
      } finally {
        setBusyId(null)
      }
    }

    async function renewSubscription() {
      const nextErrors = {}
      if (!financeForm.subscriptionId) nextErrors.subscriptionId = t('finance.selectSubscriptionError')
      if (!financeForm.subscriptionTypeId) nextErrors.subscriptionTypeId = t('finance.selectRenewTypeError')
      if (!validIsoDate(financeForm.startDate)) nextErrors.startDate = t('finance.startDateError')
      if (!validIsoDate(financeForm.dueDate)) nextErrors.dueDate = t('finance.dueDateError')
      if (Object.keys(nextErrors).length && !showFinanceErrors(nextErrors)) return
      setBusyId('renew')
      setError(null); setFinanceErrors({})
      try {
        const result = await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/renew/`, {
          subscription_type_id: financeForm.subscriptionTypeId,
          start_date: financeForm.startDate,
          due_date: financeForm.dueDate,
          idempotency_key: financeForm.subscriptionIdempotencyKey,
        })
        setMessage(t('finance.subscriptionRenewed'))
        setFinanceAction(null)
        setFinanceBaseline(null)
        setFinanceForm((current) => ({ ...current, subscriptionId: result.subscription?.id || current.subscriptionId }))
        await reloadSubscriptions()
        await reloadRoleData?.('admin')
      } catch (err) {
        showApiFieldErrors(err, {
          subscription_id: 'subscriptionId', subscription_type_id: 'subscriptionTypeId',
          start_date: 'startDate', due_date: 'dueDate', idempotency_key: 'subscriptionTypeId',
        }, setFinanceErrors, FINANCE_FIELD_IDS, t('finance.renewError'))
      } finally {
        setBusyId(null)
      }
    }

    function openSubscriptionTypeCreate() {
      setCreatingSubscriptionType(true)
      setSubscriptionTypeBaseline(subscriptionTypeForm)
      setSubscriptionTypeErrors({})
      setError(null)
    }

    function openFinanceAction(action) {
      const next = action === 'payment'
        ? { ...financeForm, paymentIdempotencyKey: createPaymentAttemptKey('admin-payment') }
        : ['issue', 'renew'].includes(action)
          ? { ...financeForm, subscriptionIdempotencyKey: createPaymentAttemptKey('admin-subscription') }
          : action === 'charge' && !financeForm.chargeDescription
            ? { ...financeForm, chargeDescription: t('finance.manualCharge') }
            : financeForm
      if (next !== financeForm) setFinanceForm(next)
      setFinanceAction(action)
      setFinanceBaseline(next)
      setFinanceErrors({})
      setError(null)
    }

    const financeActionMeta = {
      issue: { title: t('finance.issue'), label: t('finance.issue'), busy: 'subscription', submit: createSubscription },
      renew: { title: t('finance.renewPass'), label: t('finance.renew'), busy: 'renew', submit: renewSubscription },
      charge: { title: t('finance.addCharge'), label: t('finance.addCharge'), busy: 'charge', submit: createCharge },
      payment: { title: t('finance.addPayment'), label: t('finance.addPayment'), busy: 'payment', submit: createPayment },
      freeze: { title: t('finance.freezePass'), label: t('finance.freeze'), busy: 'freeze', submit: freezeSubscription },
      adjust: { title: t('finance.adjustPass'), label: t('finance.saveAdjustment'), busy: 'adjust', submit: adjustSubscription },
    }[financeAction]

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h1 className="page-title">{t('payments.title')}</h1>
            <p className="page-desc">{t('payments.description')}</p>
          </div>
        </div>

        <ToastNotice id="admin-payments-result" message={message} />
        {error && !creatingSubscriptionType && !editingSubscriptionType && !financeAction && !editingPayment && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busyId != null}>{t('payments.saving')}</BusyBanner>
        {participants.length === 0 && <Banner tone="warning" style={{ marginBottom: 12 }}>{t('payments.needParticipant')}</Banner>}
        {subscriptionTypes.length === 0 && <Banner tone="warning" style={{ marginBottom: 12 }}>{t('payments.needType')}</Banner>}

        <div className="ops-action-strip">
          <button type="button" className={`ops-action-card${toolPanel === 'subscriptions' ? ' is-active' : ''}`} onClick={() => setToolPanel((current) => current === 'subscriptions' ? null : 'subscriptions')}>
            <span>{t('payments.typesTitle')}</span>
            <small>{t('payments.typesDescription')}</small>
          </button>
          <button type="button" className={`ops-action-card${toolPanel === 'finance' ? ' is-active' : ''}`} onClick={() => setToolPanel((current) => current === 'finance' ? null : 'finance')}>
            <span>{t('payments.balanceTitle')}</span>
            <small>{t('payments.balanceDescription')}</small>
          </button>
        </div>

        {toolPanel === 'subscriptions' && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="ops-section-heading" style={{ marginBottom: 10 }}>
            <div className="eyebrow">{t('payments.typesTitle')}</div>
            <Button variant="primary" disabled={busyId != null} onClick={openSubscriptionTypeCreate}>{t('payments.createType')}</Button>
          </div>
          <div>
            <Table
              rows={subscriptionTypes}
              emptyLabel={t('payments.typesEmpty')}
              columns={[
                { key: 'name', header: t('common.type'), render: (type) => <span className="strong">{type.name}</span> },
                { key: 'price', header: t('field.price'), align: 'right', width: 110, render: (type) => <Money amount={type.price} /> },
                { key: 'sessions', header: t('field.sessions'), align: 'right', width: 100, render: (type) => type.isUnlimited ? t('field.unlimited') : type.sessions },
                { key: 'days', header: t('field.days'), align: 'right', width: 80 },
                { key: 'isIndividual', header: t('field.kind'), width: 120, render: (type) => type.isIndividual ? t('field.individual') : t('field.group') },
                { key: 'active', header: t('common.status'), width: 110, render: (type) => <StatusPill status={type.active ? 'active' : 'inactive'} size="sm" /> },
                {
                  key: 'act',
                  header: '',
                  width: 90,
                  render: (type) => <Button size="sm" variant="subtle" disabled={busyId != null} onClick={() => openSubscriptionTypeEdit(type)}>{t('common.edit')}</Button>,
                },
              ]}
            />
          </div>
        </div>
        )}

        {toolPanel === 'finance' && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>{t('payments.financeTitle')}</div>
          <div className="ops-action-strip">
            <Button variant="primary" disabled={busyId != null || participants.length === 0 || subscriptionTypes.length === 0} onClick={() => openFinanceAction('issue')}>{t('finance.issue')}</Button>
            <Button variant="secondary" disabled={busyId != null || participants.length === 0} onClick={() => openFinanceAction('renew')}>{t('finance.renew')}</Button>
            <Button variant="secondary" disabled={busyId != null || participants.length === 0} onClick={() => openFinanceAction('charge')}>{t('finance.addCharge')}</Button>
            <Button variant="secondary" disabled={busyId != null || participants.length === 0} onClick={() => openFinanceAction('payment')}>{t('finance.addPayment')}</Button>
            <Button variant="secondary" disabled={busyId != null || participants.length === 0} onClick={() => openFinanceAction('freeze')}>{t('finance.freeze')}</Button>
            <Button variant="secondary" disabled={busyId != null || participants.length === 0} onClick={() => openFinanceAction('adjust')}>{t('finance.adjust')}</Button>
          </div>
        </div>
        )}

        <div className="toolbar">
          <Tabs value={tab} onChange={setTab} style={{ border: 'none' }} items={[
            { value: 'all', label: t('common.all'), count: counts.all },
            { value: 'review', label: t('payments.review'), count: counts.review },
            { value: 'confirmed', label: t('payments.confirmed'), count: counts.confirmed },
            { value: 'rejected', label: t('payments.rejected'), count: counts.rejected },
          ]} />
        </div>

        <ListToolbar list={paymentList} searchLabel={t('payments.search')} searchPlaceholder={t('payments.searchPlaceholder')}>
          <label>{t('field.paymentMethod')}<select aria-label={t('field.paymentMethod')} value={paymentList.draftFilters.method} onChange={(event) => paymentList.setDraftFilter('method', event.target.value)}><option value="">{t('common.all')}</option><option value="cash">{t('paymentMethod.cash')}</option><option value="bank_transfer">{t('paymentMethod.bankTransfer')}</option><option value="card">{t('paymentMethod.card')}</option><option value="other">{t('paymentMethod.other')}</option></select></label>
          <label>{t('field.source')}<select value={paymentList.draftFilters.source} onChange={(event) => paymentList.setDraftFilter('source', event.target.value)}><option value="">{t('common.all')}</option><option value="admin">{t('payments.sourceAdmin')}</option><option value="client_top_up">{t('payments.sourceClient')}</option></select></label>
        </ListToolbar>

        <ListFeedback list={paymentList} emptyLabel={t('payments.empty')} />
        <div className="ops-entity-desktop-table"><Table
          rows={visibleRows}
          emptyLabel={t('payments.emptyCategory')}
          columns={[
            { key: 'sourceLabel', header: t('common.type'), muted: true, render: (payment) => paymentSourceLabel(payment.source, locale) },
            { key: 'client', header: t('client.title'), render: (payment) => <span className="strong">{payment.client || '—'}</span> },
            { key: 'child', header: t('common.participant'), render: (payment) => <button type="button" className="ops-link-button" disabled={!payment.clientId} onClick={() => go?.('clientDetail', { clientId: payment.clientId, tab: 'payments' })}><Avatar name={payment.child} size={26} /><span className="strong">{payment.child}</span></button> },
            { key: 'method', header: t('field.method'), muted: true, render: (payment) => paymentMethodLabel(payment.methodCode, locale) },
            { key: 'date', header: t('common.date'), muted: true, render: (payment) => <span className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{payment.date}</span> },
            { key: 'receipt', header: t('field.document'), render: (payment) => payment.receipt ? <a href={payment.receiptUrl || '#'} target={payment.receiptUrl ? '_blank' : undefined} rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-link)', fontSize: 'var(--fs-xs)' }}><I.File size={14} /> {payment.receipt}</a> : <span className="muted">-</span> },
            { key: 'amount', header: t('common.amount'), align: 'right', width: 110, render: (payment) => <Money amount={payment.amount} /> },
            { key: 'status', header: t('common.status'), width: 130, render: (payment) => <StatusPill status={payment.status} size="sm" /> },
            {
              key: 'act',
              header: '',
              width: 190,
              render: (payment) => (
                <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                  <Button size="sm" variant="subtle" disabled={busyId != null} onClick={() => openPaymentEdit(payment)}>{t('common.edit')}</Button>
                  {payment.status === 'pending' && <>
                  <IconButton label={t('finance.confirm')} size="sm" disabled={busyId != null} onClick={() => updatePayment(payment, 'confirm')}><I.Check size={16} /></IconButton>
                  <IconButton label={t('finance.reject')} size="sm" variant="danger" disabled={busyId != null} onClick={() => { setReject(payment); setRejectReason(''); setRejectErrors({}); setError(null) }}><I.X size={16} /></IconButton>
                  </>}
                </div>
              ),
            },
          ]}
        /></div>
        <div className="ops-entity-mobile-list">
          {visibleRows.map((payment) => (
            <EntityMobileCard key={payment.id} className="ops-payment-compact-card" labelledBy={`payment-card-${payment.id}`}>
              <div className="ops-payment-compact-head">
                <button type="button" className="ops-compact-card-title with-avatar" disabled={!payment.clientId} onClick={() => go?.('clientDetail', { clientId: payment.clientId, tab: 'payments' })}>
                  <Avatar name={payment.client || payment.child} size={34} /><strong id={`payment-card-${payment.id}`} title={payment.client || payment.child}>{payment.client || payment.child}</strong>
                </button>
                <strong className="ops-payment-amount">{payment.amount.toLocaleString(localeTag)} zł</strong>
                <ActionPopover label={t('common.actionsFor', { name: payment.client || payment.child })} actions={[
                  { key: 'profile', label: t('finance.profile'), disabled: !payment.clientId, onSelect: () => go?.('clientDetail', { clientId: payment.clientId, tab: 'payments' }) },
                  { key: 'edit', label: t('common.edit'), onSelect: () => openPaymentEdit(payment) },
                ]} />
              </div>
              <div className="ops-compact-card-line"><span>{t('common.participant')}</span><strong>{payment.child || '—'}</strong></div>
              <div className="ops-compact-card-line"><span>{t('common.date')}</span><strong>{payment.date || '—'} · {payment.methodCode ? paymentMethodLabel(payment.methodCode, locale) : t('finance.methodMissing')}</strong></div>
              <div className="ops-payment-compact-footer">
                <StatusPill status={payment.status} size="sm" />
                {payment.status === 'pending' && <div className="ops-payment-pending-actions">
                  <Button size="sm" variant="primary" disabled={busyId != null} onClick={() => updatePayment(payment, 'confirm')}>{t('finance.confirm')}</Button>
                  <Button size="sm" variant="danger" disabled={busyId != null} onClick={() => { setReject(payment); setRejectReason(''); setRejectErrors({}); setError(null) }}>{t('finance.reject')}</Button>
                </div>}
              </div>
            </EntityMobileCard>
          ))}
        </div>
        <ListPagination list={paymentList} />

        <FormModal open={creatingSubscriptionType} title={t('payments.newType')} size="lg" busy={busyId != null} dirty={Boolean(subscriptionTypeBaseline) && JSON.stringify(subscriptionTypeForm) !== JSON.stringify(subscriptionTypeBaseline)} onRequestClose={() => { if (subscriptionTypeBaseline) setSubscriptionTypeForm(subscriptionTypeBaseline); setCreatingSubscriptionType(false); setSubscriptionTypeBaseline(null); setSubscriptionTypeErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId != null} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" loading={busyId === 'subscription-type'} disabled={busyId != null} onClick={createSubscriptionType}>{t('payments.createType')}</Button></>}>
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="ops-form-grid">
            <Input id={TYPE_FIELD_IDS.name} label={t('field.name')} value={subscriptionTypeForm.name} error={subscriptionTypeErrors.name} onChange={(event) => updateSubscriptionTypeForm('name', event.target.value)} />
            <Input id={TYPE_FIELD_IDS.price} label={t('field.price')} value={subscriptionTypeForm.price} error={subscriptionTypeErrors.price} onChange={(event) => updateSubscriptionTypeForm('price', event.target.value)} placeholder="240.00" />
            <Input id={TYPE_FIELD_IDS.currency} label={t('field.currency')} value={subscriptionTypeForm.currency} error={subscriptionTypeErrors.currency} onChange={(event) => updateSubscriptionTypeForm('currency', event.target.value)} />
            <Input id={TYPE_FIELD_IDS.durationDays} label={t('field.days')} value={subscriptionTypeForm.durationDays} error={subscriptionTypeErrors.durationDays} onChange={(event) => updateSubscriptionTypeForm('durationDays', event.target.value)} />
            <Input id={TYPE_FIELD_IDS.sessionsCount} label={t('field.sessions')} value={subscriptionTypeForm.sessionsCount} error={subscriptionTypeErrors.sessionsCount} onChange={(event) => updateSubscriptionTypeForm('sessionsCount', event.target.value)} placeholder={t('field.unlimitedHint')} />
            <Checkbox id={TYPE_FIELD_IDS.isUnlimited} label={t('field.unlimited')} checked={subscriptionTypeForm.isUnlimited} error={subscriptionTypeErrors.isUnlimited} onChange={(event) => updateSubscriptionTypeForm('isUnlimited', event.target.checked)} />
            <Checkbox id={TYPE_FIELD_IDS.isIndividual} label={t('field.individual')} checked={subscriptionTypeForm.isIndividual} error={subscriptionTypeErrors.isIndividual} onChange={(event) => updateSubscriptionTypeForm('isIndividual', event.target.checked)} />
            <Checkbox id={TYPE_FIELD_IDS.isActive} label={t('field.accountActive')} checked={subscriptionTypeForm.isActive} error={subscriptionTypeErrors.isActive} onChange={(event) => updateSubscriptionTypeForm('isActive', event.target.checked)} />
          </div>
        </FormModal>

        <FormModal open={Boolean(editingSubscriptionType)} title={t('payments.editType')} size="lg" busy={busyId != null} dirty={Boolean(subscriptionTypeEditBaseline) && JSON.stringify(subscriptionTypeEditForm) !== JSON.stringify(subscriptionTypeEditBaseline)} onRequestClose={() => { if (subscriptionTypeEditBaseline) setSubscriptionTypeEditForm(subscriptionTypeEditBaseline); setEditingSubscriptionType(null); setSubscriptionTypeEditBaseline(null); setSubscriptionTypeEditErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId != null} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" loading={busyId === 'subscription-type-edit'} disabled={busyId != null} onClick={saveSubscriptionTypeEdit}>{t('payments.saveType')}</Button></>}>
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="ops-form-grid">
            <Input id={TYPE_EDIT_FIELD_IDS.name} label={t('field.name')} value={subscriptionTypeEditForm.name} error={subscriptionTypeEditErrors.name} onChange={(event) => updateSubscriptionTypeEditForm('name', event.target.value)} />
            <Input id={TYPE_EDIT_FIELD_IDS.price} label={t('field.price')} value={subscriptionTypeEditForm.price} error={subscriptionTypeEditErrors.price} onChange={(event) => updateSubscriptionTypeEditForm('price', event.target.value)} />
            <Input id={TYPE_EDIT_FIELD_IDS.currency} label={t('field.currency')} value={subscriptionTypeEditForm.currency} error={subscriptionTypeEditErrors.currency} onChange={(event) => updateSubscriptionTypeEditForm('currency', event.target.value)} />
            <Input id={TYPE_EDIT_FIELD_IDS.durationDays} label={t('field.days')} value={subscriptionTypeEditForm.durationDays} error={subscriptionTypeEditErrors.durationDays} onChange={(event) => updateSubscriptionTypeEditForm('durationDays', event.target.value)} />
            <Input id={TYPE_EDIT_FIELD_IDS.sessionsCount} label={t('field.sessions')} value={subscriptionTypeEditForm.sessionsCount} error={subscriptionTypeEditErrors.sessionsCount} onChange={(event) => updateSubscriptionTypeEditForm('sessionsCount', event.target.value)} placeholder={t('field.unlimitedHint')} />
            <Checkbox id={TYPE_EDIT_FIELD_IDS.isUnlimited} label={t('field.unlimited')} checked={subscriptionTypeEditForm.isUnlimited} error={subscriptionTypeEditErrors.isUnlimited} onChange={(event) => updateSubscriptionTypeEditForm('isUnlimited', event.target.checked)} />
            <Checkbox id={TYPE_EDIT_FIELD_IDS.isIndividual} label={t('field.individual')} checked={subscriptionTypeEditForm.isIndividual} error={subscriptionTypeEditErrors.isIndividual} onChange={(event) => updateSubscriptionTypeEditForm('isIndividual', event.target.checked)} />
            <Checkbox id={TYPE_EDIT_FIELD_IDS.isActive} label={t('field.accountActive')} checked={subscriptionTypeEditForm.isActive} error={subscriptionTypeEditErrors.isActive} onChange={(event) => updateSubscriptionTypeEditForm('isActive', event.target.checked)} />
          </div>
        </FormModal>

        <FormModal open={Boolean(financeAction)} title={financeActionMeta?.title || t('finance.operation')} description={financeAction === 'payment' ? t('finance.paymentReadback') : undefined} size="lg" busy={busyId != null} dirty={Boolean(financeBaseline) && JSON.stringify(financeForm) !== JSON.stringify(financeBaseline)} onRequestClose={() => { if (financeBaseline) setFinanceForm(financeBaseline); setFinanceAction(null); setFinanceBaseline(null); setFinanceErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId != null} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" loading={busyId === financeActionMeta?.busy} disabled={busyId != null || (['renew', 'freeze', 'adjust'].includes(financeAction) && (subscriptionsLoading || !financeForm.subscriptionId))} onClick={financeActionMeta?.submit}>{financeActionMeta?.label || t('common.save')}</Button></>}>
          {error && <Banner tone="danger">{error}</Banner>}
          {financeAction === 'payment' && <div className="ops-financial-context" aria-label={t('finance.contextPayment')}>
            <div><span>{t('client.title')}</span><strong>{selectedParticipant?.clientName || selectedParticipant?.parent || t('field.selectClient')}</strong></div>
            <div><span>{t('common.participant')}</span><strong>{selectedParticipant ? `${selectedParticipant.first || ''} ${selectedParticipant.last || ''}`.trim() : t('field.selectParticipant')}</strong></div>
            <div><span>{t('field.currentBalance')}</span><strong><Money amount={Number(selectedParticipant?.balance || 0)} signed currency="zł" /></strong></div>
            <div><span>{t('field.method')}</span><strong>{paymentMethodLabel(financeForm.paymentMethod, locale)}</strong></div>
          </div>}
          <div className="ops-form-grid">
            <SearchableSelect inputId={FINANCE_FIELD_IDS.participantId} label={t('common.participant')} value={financeForm.participantId} error={financeErrors.participantId} onChange={(value) => updateFinanceForm('participantId', value)} options={participants.map((participant) => clientSelectOption(participant, { description: (row) => row.phone || row.email || row.group }))} loadOptions={loadAdminParticipantOptions} />
            {(financeAction === 'issue' || financeAction === 'renew') && <Select id={FINANCE_FIELD_IDS.subscriptionTypeId} label={t('field.subscriptionType')} value={financeForm.subscriptionTypeId} error={financeErrors.subscriptionTypeId} onChange={(event) => updateFinanceForm('subscriptionTypeId', event.target.value)}><option value="">{t('field.selectType')}</option>{subscriptionTypes.map((type) => <option key={type.typeId} value={type.typeId}>{type.name} · {type.price.toLocaleString(localeTag)} {type.currency}</option>)}</Select>}
            {(financeAction === 'renew' || financeAction === 'freeze' || financeAction === 'adjust') && <Select id={FINANCE_FIELD_IDS.subscriptionId} label={t('field.participantSubscription')} value={financeForm.subscriptionId} error={financeErrors.subscriptionId} disabled={subscriptionsLoading} onChange={(event) => updateFinanceForm('subscriptionId', event.target.value)}><option value="">{subscriptionsLoading ? t('field.loadingSubscriptions') : t('field.selectSubscription')}</option>{subscriptions.map((subscription) => <option key={subscription.id} value={subscription.id}>#{subscription.id} · {subscription.type} · {subscriptionStatusLabel(subscription.status)} · {subscription.remaining_sessions ?? t('field.unlimitedLower')}</option>)}</Select>}
            {(financeAction === 'issue' || financeAction === 'renew') && <><Input id={FINANCE_FIELD_IDS.startDate} label={t('field.subscriptionStart')} value={financeForm.startDate} error={financeErrors.startDate} onChange={(event) => updateFinanceForm('startDate', event.target.value)} placeholder={t('field.dateFormat')} /><Input id={FINANCE_FIELD_IDS.dueDate} label={t('field.dueDate')} value={financeForm.dueDate} error={financeErrors.dueDate} onChange={(event) => updateFinanceForm('dueDate', event.target.value)} placeholder={t('field.dateFormat')} /><p className="ops-grid-full muted" style={{ margin: 0 }}>{t('finance.autoChargeHint')}</p></>}
            {financeAction === 'charge' && <><Input id={FINANCE_FIELD_IDS.chargeDescription} label={t('field.chargeDescription')} value={financeForm.chargeDescription} error={financeErrors.chargeDescription} onChange={(event) => updateFinanceForm('chargeDescription', event.target.value)} /><Input id={FINANCE_FIELD_IDS.chargeAmount} label={t('field.chargeAmount')} value={financeForm.chargeAmount} error={financeErrors.chargeAmount} onChange={(event) => updateFinanceForm('chargeAmount', event.target.value)} placeholder={selectedType ? String(selectedType.price) : '240.00'} /><Input id={FINANCE_FIELD_IDS.dueDate} label={t('field.dueDate')} value={financeForm.dueDate} error={financeErrors.dueDate} onChange={(event) => updateFinanceForm('dueDate', event.target.value)} placeholder={t('field.dateFormat')} /></>}
            {financeAction === 'payment' && <><Input id={FINANCE_FIELD_IDS.paymentAmount} label={t('field.paymentAmount')} value={financeForm.paymentAmount} error={financeErrors.paymentAmount} onChange={(event) => updateFinanceForm('paymentAmount', event.target.value)} placeholder={selectedType ? String(selectedType.price) : '240,00'} inputMode="decimal" /><Input id={FINANCE_FIELD_IDS.paymentDate} label={t('field.paymentDate')} value={financeForm.paymentDate} error={financeErrors.paymentDate} onChange={(event) => updateFinanceForm('paymentDate', event.target.value)} placeholder={t('field.dateFormat')} /><Select id={FINANCE_FIELD_IDS.paymentMethod} label={t('field.paymentMethod')} value={financeForm.paymentMethod} error={financeErrors.paymentMethod} onChange={(event) => updateFinanceForm('paymentMethod', event.target.value)}><option value="cash">{t('paymentMethod.cash')}</option><option value="bank_transfer">{t('paymentMethod.bankTransfer')}</option><option value="card">{t('paymentMethod.card')}</option><option value="other">{t('paymentMethod.other')}</option></Select><Input id={FINANCE_FIELD_IDS.paymentComment} label={t('field.comment')} value={financeForm.paymentComment} error={financeErrors.paymentComment} onChange={(event) => updateFinanceForm('paymentComment', event.target.value)} placeholder={t('common.optional')} /></>}
            {financeAction === 'freeze' && <><Input id={FINANCE_FIELD_IDS.freezeStart} label={t('field.freezeFrom')} value={financeForm.freezeStart} error={financeErrors.freezeStart} onChange={(event) => updateFinanceForm('freezeStart', event.target.value)} placeholder={t('field.dateFormat')} /><Input id={FINANCE_FIELD_IDS.freezeEnd} label={t('field.freezeTo')} value={financeForm.freezeEnd} error={financeErrors.freezeEnd} onChange={(event) => updateFinanceForm('freezeEnd', event.target.value)} placeholder={t('field.dateFormat')} /><Input id={FINANCE_FIELD_IDS.freezeReason} label={t('field.freezeReason')} value={financeForm.freezeReason} error={financeErrors.freezeReason} onChange={(event) => updateFinanceForm('freezeReason', event.target.value)} /></>}
            {financeAction === 'adjust' && <><Input id={FINANCE_FIELD_IDS.adjustDelta} label={t('field.adjustSessions')} value={financeForm.adjustDelta} error={financeErrors.adjustDelta} onChange={(event) => updateFinanceForm('adjustDelta', event.target.value)} /><Input id={FINANCE_FIELD_IDS.adjustNote} label={t('field.adjustNote')} value={financeForm.adjustNote} error={financeErrors.adjustNote} onChange={(event) => updateFinanceForm('adjustNote', event.target.value)} /></>}
          </div>
        </FormModal>

        <FormModal open={Boolean(editingPayment)} title={t('finance.editPayment')} description={t('finance.editPaymentDescription')} size="md" busy={busyId != null} dirty={Boolean(paymentEditBaseline) && JSON.stringify(paymentEditForm) !== JSON.stringify(paymentEditBaseline)} onRequestClose={() => { if (paymentEditBaseline) setPaymentEditForm(paymentEditBaseline); setEditingPayment(null); setPaymentEditBaseline(null); setPaymentEditErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId != null} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="primary" loading={busyId === `edit-${editingPayment?.id}`} disabled={busyId != null} onClick={savePaymentEdit}>{t('finance.saveChange')}</Button></>}>
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="ops-form-grid">
            <Select id={PAYMENT_EDIT_FIELD_IDS.method} label={t('field.paymentMethod')} value={paymentEditForm.method} error={paymentEditErrors.method} onChange={(event) => { setPaymentEditForm({ ...paymentEditForm, method: event.target.value }); setPaymentEditErrors((current) => clearFieldError(current, 'method')) }}><option value="cash">{t('paymentMethod.cash')}</option><option value="bank_transfer">{t('paymentMethod.bankTransfer')}</option><option value="card">{t('paymentMethod.card')}</option><option value="other">{t('paymentMethod.other')}</option></Select>
            <Input id={PAYMENT_EDIT_FIELD_IDS.comment} label={t('field.comment')} value={paymentEditForm.comment} error={paymentEditErrors.comment} onChange={(event) => { setPaymentEditForm({ ...paymentEditForm, comment: event.target.value }); setPaymentEditErrors((current) => clearFieldError(current, 'comment')) }} />
          </div>
        </FormModal>

        <FormModal open={Boolean(reject)} title={t('finance.rejectPayment')} description={t('finance.rejectDescription')} size="md" busy={busyId != null} dirty={Boolean(rejectReason.trim())} onRequestClose={() => { setReject(null); setRejectReason(''); setRejectErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId != null} onClick={() => requestClose('cancel')}>{t('common.cancel')}</Button><Button variant="danger" loading={busyId === reject?.id} disabled={busyId != null} onClick={() => updatePayment(reject, 'reject', rejectReason)}>{t('finance.reject')}</Button></>}>
          {error && <Banner tone="danger">{error}</Banner>}
          {reject && <div className="ops-financial-context" aria-label={t('finance.contextReject')}>
            <div><span>{t('client.title')}</span><strong>{reject.client || '—'}</strong></div>
            <div><span>{t('common.participant')}</span><strong>{reject.child || '—'}</strong></div>
            <div><span>{t('common.amount')}</span><strong>{reject.amount.toLocaleString(localeTag)} zł</strong></div>
            <div><span>{t('field.method')}</span><strong>{reject.methodCode ? paymentMethodLabel(reject.methodCode, locale) : '—'}</strong></div>
          </div>}
          <Input id={REJECT_FIELD_IDS.reason} label={t('finance.rejectReason')} value={rejectReason} error={rejectErrors.reason} onChange={(event) => { setRejectReason(event.target.value); setRejectErrors((current) => clearFieldError(current, 'reason')) }} autoComplete="off" />
        </FormModal>
      </div>
    )
  }
}

