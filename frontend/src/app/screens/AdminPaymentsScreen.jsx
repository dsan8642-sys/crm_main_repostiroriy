import React, { useEffect, useMemo, useState } from 'react'
import { api, apiErrorMessage, downloadFile } from '../../api.js'
import { asMoneyMajor, formatDate, formatShortDate, formatTime } from '../../mappers.js'
import { BusyBanner } from '../runtime.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'
import {
  clearFieldError,
  fieldErrorsFromApi,
  focusFirstFieldError,
  formErrorMessage,
} from '../formErrors.js'
import { validIsoDate } from '../scheduleContracts.js'
import { FormModal } from '../FormModal.jsx'

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
  createCharge: 'admin-finance-create-charge',
  chargeDescription: 'admin-finance-charge-description',
  chargeAmount: 'admin-finance-charge-amount',
  paymentAmount: 'admin-finance-payment-amount',
  paymentDate: 'admin-finance-payment-date',
  paymentMethod: 'admin-finance-payment-method',
  freezeStart: 'admin-finance-freeze-start', freezeEnd: 'admin-finance-freeze-end',
  freezeReason: 'admin-finance-freeze-reason',
  adjustDelta: 'admin-finance-adjust-delta', adjustNote: 'admin-finance-adjust-note',
}
const PAYMENT_EDIT_FIELD_IDS = {
  method: 'admin-payment-edit-method', comment: 'admin-payment-edit-comment',
}

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
  const { Table, StatusPill, Money, Button, IconButton, Tabs, Banner, Dialog, Avatar, Input, Select, Checkbox } = components
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
    const [paymentEditBaseline, setPaymentEditBaseline] = useState(null)
    const [paymentEditErrors, setPaymentEditErrors] = useState({})
    const [rows, setRows] = useState(() => [...(adminData.payments || [])])
    const [subscriptions, setSubscriptions] = useState([])
    const [subscriptionsLoading, setSubscriptionsLoading] = useState(false)
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
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [busyId, setBusyId] = useState(null)
    const [toolPanel, setToolPanel] = useState(null)
    const selectedType = subscriptionTypes.find((type) => String(type.typeId) === String(financeForm.subscriptionTypeId))

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
      if (!financeForm.participantId) {
        setSubscriptions([])
        setSubscriptionsLoading(false)
        return undefined
      }
      let alive = true
      setSubscriptions([])
      setSubscriptionsLoading(true)
      setFinanceForm((current) => ({ ...current, subscriptionId: '' }))
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
          if (alive) setError(apiErrorMessage(err, 'Не удалось загрузить абонементы участника.'))
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
        setError(apiErrorMessage(err, 'Не удалось изменить статус платежа.'))
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
        setRows((current) => current.map((item) => item.id === editingPayment.id ? { ...item, methodCode: paymentEditForm.method, method: { cash: 'Наличные', bank_transfer: 'Bank transfer / IBAN', card: 'Карта', other: 'Другое' }[paymentEditForm.method], comment: paymentEditForm.comment } : item))
        setEditingPayment(null); setPaymentEditBaseline(null); setMessage('Реквизиты платежа обновлены, изменение записано в журнал.')
      } catch (err) {
        showApiFieldErrors(
          err, { method: 'method', comment: 'comment' },
          setPaymentEditErrors, PAYMENT_EDIT_FIELD_IDS,
          'Не удалось изменить реквизиты платежа.',
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
      if (!form.name.trim()) nextErrors.name = 'Укажите название типа абонемента.'
      if (!validNonnegativeMoney(form.price)) nextErrors.price = 'Введите корректную неотрицательную цену.'
      if (!positiveInteger(form.durationDays)) nextErrors.durationDays = 'Введите целое количество дней больше нуля.'
      if (!form.isUnlimited && !positiveInteger(form.sessionsCount)) {
        nextErrors.sessionsCount = 'Введите целое количество занятий больше нуля или включите безлимитный абонемент.'
      }
      if (!String(form.currency || '').trim()) nextErrors.currency = 'Укажите валюту.'
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
        setMessage('Тип абонемента создан.')
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
          'Не удалось создать тип абонемента.',
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
        setMessage('Тип абонемента обновлён.')
        await reloadRoleData?.('admin')
      } catch (err) {
        showApiFieldErrors(
          err, TYPE_FIELD_MAP, setSubscriptionTypeEditErrors,
          TYPE_EDIT_FIELD_IDS, 'Не удалось сохранить тип абонемента.',
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
      if (!financeForm.participantId) nextErrors.participantId = 'Выберите участника.'
      if (!financeForm.subscriptionTypeId) nextErrors.subscriptionTypeId = 'Выберите тип абонемента.'
      if (!validIsoDate(financeForm.startDate)) nextErrors.startDate = 'Введите дату начала в формате ГГГГ-ММ-ДД.'
      if (financeForm.createCharge && !validIsoDate(financeForm.dueDate)) nextErrors.dueDate = 'Введите срок оплаты в формате ГГГГ-ММ-ДД.'
      if (Object.keys(nextErrors).length && !showFinanceErrors(nextErrors)) return
      setBusyId('subscription')
      setError(null); setFinanceErrors({})
      try {
        const result = await api.post(`/api/admin/participants/${financeForm.participantId}/subscriptions/`, {
          subscription_type_id: financeForm.subscriptionTypeId,
          start_date: financeForm.startDate,
          due_date: financeForm.dueDate,
          create_charge: financeForm.createCharge,
        })
        setMessage(financeForm.createCharge ? 'Абонемент и начисление созданы.' : 'Абонемент создан.')
        setFinanceAction(null)
        setFinanceBaseline(null)
        setFinanceForm((current) => ({ ...current, subscriptionId: result.subscription?.id || current.subscriptionId }))
        await reloadSubscriptions()
        await reloadRoleData?.('admin')
      } catch (err) {
        showApiFieldErrors(err, {
          participant_id: 'participantId', subscription_type_id: 'subscriptionTypeId',
          start_date: 'startDate', due_date: 'dueDate', create_charge: 'createCharge',
        }, setFinanceErrors, FINANCE_FIELD_IDS, 'Не удалось выдать абонемент.')
      } finally {
        setBusyId(null)
      }
    }

    async function createCharge() {
      const nextErrors = {}
      if (!financeForm.participantId) nextErrors.participantId = 'Выберите участника.'
      if (!financeForm.chargeDescription.trim()) nextErrors.chargeDescription = 'Укажите описание начисления.'
      if (!validPositiveMoney(financeForm.chargeAmount)) nextErrors.chargeAmount = 'Введите сумму больше нуля.'
      if (!validIsoDate(financeForm.dueDate)) nextErrors.dueDate = 'Введите срок оплаты в формате ГГГГ-ММ-ДД.'
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
        setMessage('Начисление создано.')
        setFinanceAction(null)
        setFinanceBaseline(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        showApiFieldErrors(err, {
          participant_id: 'participantId', subscription_id: 'subscriptionId',
          description: 'chargeDescription', amount_minor: 'chargeAmount',
          due_date: 'dueDate', currency: 'chargeAmount',
        }, setFinanceErrors, FINANCE_FIELD_IDS, 'Не удалось добавить начисление.')
      } finally {
        setBusyId(null)
      }
    }

    async function createPayment() {
      const nextErrors = {}
      if (!financeForm.participantId) nextErrors.participantId = 'Выберите участника.'
      if (!validPositiveMoney(financeForm.paymentAmount)) nextErrors.paymentAmount = 'Введите сумму больше нуля.'
      if (!validIsoDate(financeForm.paymentDate)) nextErrors.paymentDate = 'Введите дату платежа в формате ГГГГ-ММ-ДД.'
      if (!financeForm.paymentMethod) nextErrors.paymentMethod = 'Выберите способ оплаты.'
      if (Object.keys(nextErrors).length && !showFinanceErrors(nextErrors)) return
      setBusyId('payment')
      setError(null); setFinanceErrors({})
      try {
        await api.post('/api/admin/payments/', {
          participant_id: financeForm.participantId,
          amount_minor: minorFromMajor(financeForm.paymentAmount),
          currency: 'PLN',
          paid_at: financeForm.paymentDate,
          method: financeForm.paymentMethod,
        })
        setMessage('Платёж добавлен.')
        setFinanceAction(null)
        setFinanceBaseline(null)
        await reloadRoleData?.('admin')
      } catch (err) {
        showApiFieldErrors(err, {
          participant_id: 'participantId', amount_minor: 'paymentAmount',
          paid_at: 'paymentDate', method: 'paymentMethod', currency: 'paymentAmount',
        }, setFinanceErrors, FINANCE_FIELD_IDS, 'Не удалось добавить платёж.')
      } finally {
        setBusyId(null)
      }
    }

    async function freezeSubscription() {
      const nextErrors = {}
      if (!financeForm.subscriptionId) nextErrors.subscriptionId = 'Выберите абонемент.'
      if (!validIsoDate(financeForm.freezeStart)) nextErrors.freezeStart = 'Введите дату начала заморозки в формате ГГГГ-ММ-ДД.'
      if (!validIsoDate(financeForm.freezeEnd)) nextErrors.freezeEnd = 'Введите дату окончания заморозки в формате ГГГГ-ММ-ДД.'
      if (validIsoDate(financeForm.freezeStart) && validIsoDate(financeForm.freezeEnd) && financeForm.freezeEnd < financeForm.freezeStart) {
        nextErrors.freezeEnd = 'Дата окончания не может быть раньше даты начала.'
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
        setMessage(`Абонемент заморожен на ${result.days} дней.`)
        setFinanceAction(null)
        setFinanceBaseline(null)
        await reloadSubscriptions()
      } catch (err) {
        showApiFieldErrors(err, {
          subscription_id: 'subscriptionId', start_date: 'freezeStart',
          end_date: 'freezeEnd', reason: 'freezeReason',
        }, setFinanceErrors, FINANCE_FIELD_IDS, 'Не удалось заморозить абонемент.')
      } finally {
        setBusyId(null)
      }
    }

    async function adjustSubscription() {
      const nextErrors = {}
      if (!financeForm.subscriptionId) nextErrors.subscriptionId = 'Выберите абонемент.'
      const delta = Number(financeForm.adjustDelta)
      if (!Number.isInteger(delta) || delta === 0) nextErrors.adjustDelta = 'Введите целое число, отличное от нуля.'
      if (Object.keys(nextErrors).length && !showFinanceErrors(nextErrors)) return
      setBusyId('adjust')
      setError(null); setFinanceErrors({})
      try {
        await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/adjust/`, {
          delta: Number(financeForm.adjustDelta || 0),
          note: financeForm.adjustNote,
        })
        setMessage('Корректировка абонемента сохранена.')
        setFinanceAction(null)
        setFinanceBaseline(null)
        await reloadSubscriptions()
      } catch (err) {
        showApiFieldErrors(err, {
          subscription_id: 'subscriptionId', delta: 'adjustDelta', note: 'adjustNote',
        }, setFinanceErrors, FINANCE_FIELD_IDS, 'Не удалось скорректировать абонемент.')
      } finally {
        setBusyId(null)
      }
    }

    async function renewSubscription() {
      const nextErrors = {}
      if (!financeForm.subscriptionId) nextErrors.subscriptionId = 'Выберите абонемент.'
      if (!financeForm.subscriptionTypeId) nextErrors.subscriptionTypeId = 'Выберите тип продления.'
      if (!validIsoDate(financeForm.startDate)) nextErrors.startDate = 'Введите дату начала в формате ГГГГ-ММ-ДД.'
      if (financeForm.createCharge && !validIsoDate(financeForm.dueDate)) nextErrors.dueDate = 'Введите срок оплаты в формате ГГГГ-ММ-ДД.'
      if (Object.keys(nextErrors).length && !showFinanceErrors(nextErrors)) return
      setBusyId('renew')
      setError(null); setFinanceErrors({})
      try {
        const result = await api.post(`/api/admin/subscriptions/${financeForm.subscriptionId}/renew/`, {
          subscription_type_id: financeForm.subscriptionTypeId,
          start_date: financeForm.startDate,
          due_date: financeForm.dueDate,
          create_charge: financeForm.createCharge,
        })
        setMessage(financeForm.createCharge ? 'Абонемент продлён с начислением.' : 'Абонемент продлён.')
        setFinanceAction(null)
        setFinanceBaseline(null)
        setFinanceForm((current) => ({ ...current, subscriptionId: result.subscription?.id || current.subscriptionId }))
        await reloadSubscriptions()
        await reloadRoleData?.('admin')
      } catch (err) {
        showApiFieldErrors(err, {
          subscription_id: 'subscriptionId', subscription_type_id: 'subscriptionTypeId',
          start_date: 'startDate', due_date: 'dueDate', create_charge: 'createCharge',
        }, setFinanceErrors, FINANCE_FIELD_IDS, 'Не удалось продлить абонемент.')
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
      setFinanceAction(action)
      setFinanceBaseline(financeForm)
      setFinanceErrors({})
      setError(null)
    }

    const financeActionMeta = {
      issue: { title: 'Выдать абонемент', label: 'Выдать абонемент', busy: 'subscription', submit: createSubscription },
      renew: { title: 'Продлить абонемент', label: 'Продлить', busy: 'renew', submit: renewSubscription },
      charge: { title: 'Добавить начисление', label: 'Добавить начисление', busy: 'charge', submit: createCharge },
      payment: { title: 'Добавить платёж', label: 'Добавить платёж', busy: 'payment', submit: createPayment },
      freeze: { title: 'Заморозить абонемент', label: 'Заморозить', busy: 'freeze', submit: freezeSubscription },
      adjust: { title: 'Корректировка абонемента', label: 'Сохранить корректировку', busy: 'adjust', submit: adjustSubscription },
    }[financeAction]

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h1 className="page-title">Платежи</h1>
            <p className="page-desc">Подтверждение оплат, абонементы, начисления и корректировки.</p>
          </div>
        </div>

        <ToastNotice id="admin-payments-result" message={message} />
        {error && !creatingSubscriptionType && !editingSubscriptionType && !financeAction && !editingPayment && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
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
          <div className="ops-section-heading" style={{ marginBottom: 10 }}>
            <div className="eyebrow">Типы абонементов</div>
            <Button variant="primary" disabled={busyId != null} onClick={openSubscriptionTypeCreate}>Создать тип</Button>
          </div>
          <div>
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
          <div className="ops-action-strip">
            <Button variant="primary" disabled={busyId != null || participants.length === 0 || subscriptionTypes.length === 0} onClick={() => openFinanceAction('issue')}>Выдать абонемент</Button>
            <Button variant="secondary" disabled={busyId != null || participants.length === 0} onClick={() => openFinanceAction('renew')}>Продлить</Button>
            <Button variant="secondary" disabled={busyId != null || participants.length === 0} onClick={() => openFinanceAction('charge')}>Добавить начисление</Button>
            <Button variant="secondary" disabled={busyId != null || participants.length === 0} onClick={() => openFinanceAction('payment')}>Добавить платёж</Button>
            <Button variant="secondary" disabled={busyId != null || participants.length === 0} onClick={() => openFinanceAction('freeze')}>Заморозить</Button>
            <Button variant="secondary" disabled={busyId != null || participants.length === 0} onClick={() => openFinanceAction('adjust')}>Корректировка</Button>
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

        <FormModal open={creatingSubscriptionType} title="Новый тип абонемента" size="lg" busy={busyId != null} dirty={Boolean(subscriptionTypeBaseline) && JSON.stringify(subscriptionTypeForm) !== JSON.stringify(subscriptionTypeBaseline)} onRequestClose={() => { if (subscriptionTypeBaseline) setSubscriptionTypeForm(subscriptionTypeBaseline); setCreatingSubscriptionType(false); setSubscriptionTypeBaseline(null); setSubscriptionTypeErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId != null} onClick={() => requestClose('cancel')}>Отмена</Button><Button variant="primary" loading={busyId === 'subscription-type'} disabled={busyId != null} onClick={createSubscriptionType}>Создать тип</Button></>}>
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="ops-form-grid">
            <Input id={TYPE_FIELD_IDS.name} label="Название" value={subscriptionTypeForm.name} error={subscriptionTypeErrors.name} onChange={(event) => updateSubscriptionTypeForm('name', event.target.value)} />
            <Input id={TYPE_FIELD_IDS.price} label="Цена" value={subscriptionTypeForm.price} error={subscriptionTypeErrors.price} onChange={(event) => updateSubscriptionTypeForm('price', event.target.value)} placeholder="240.00" />
            <Input id={TYPE_FIELD_IDS.currency} label="Валюта" value={subscriptionTypeForm.currency} error={subscriptionTypeErrors.currency} onChange={(event) => updateSubscriptionTypeForm('currency', event.target.value)} />
            <Input id={TYPE_FIELD_IDS.durationDays} label="Дней" value={subscriptionTypeForm.durationDays} error={subscriptionTypeErrors.durationDays} onChange={(event) => updateSubscriptionTypeForm('durationDays', event.target.value)} />
            <Input id={TYPE_FIELD_IDS.sessionsCount} label="Занятий" value={subscriptionTypeForm.sessionsCount} error={subscriptionTypeErrors.sessionsCount} onChange={(event) => updateSubscriptionTypeForm('sessionsCount', event.target.value)} placeholder="Пусто для безлимитного" />
            <Checkbox id={TYPE_FIELD_IDS.isUnlimited} label="Безлимитный" checked={subscriptionTypeForm.isUnlimited} error={subscriptionTypeErrors.isUnlimited} onChange={(event) => updateSubscriptionTypeForm('isUnlimited', event.target.checked)} />
            <Checkbox id={TYPE_FIELD_IDS.isIndividual} label="Индивидуальный" checked={subscriptionTypeForm.isIndividual} error={subscriptionTypeErrors.isIndividual} onChange={(event) => updateSubscriptionTypeForm('isIndividual', event.target.checked)} />
            <Checkbox id={TYPE_FIELD_IDS.isActive} label="Активен" checked={subscriptionTypeForm.isActive} error={subscriptionTypeErrors.isActive} onChange={(event) => updateSubscriptionTypeForm('isActive', event.target.checked)} />
          </div>
        </FormModal>

        <FormModal open={Boolean(editingSubscriptionType)} title="Редактирование типа абонемента" size="lg" busy={busyId != null} dirty={Boolean(subscriptionTypeEditBaseline) && JSON.stringify(subscriptionTypeEditForm) !== JSON.stringify(subscriptionTypeEditBaseline)} onRequestClose={() => { if (subscriptionTypeEditBaseline) setSubscriptionTypeEditForm(subscriptionTypeEditBaseline); setEditingSubscriptionType(null); setSubscriptionTypeEditBaseline(null); setSubscriptionTypeEditErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId != null} onClick={() => requestClose('cancel')}>Отмена</Button><Button variant="primary" loading={busyId === 'subscription-type-edit'} disabled={busyId != null} onClick={saveSubscriptionTypeEdit}>Сохранить тип</Button></>}>
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="ops-form-grid">
            <Input id={TYPE_EDIT_FIELD_IDS.name} label="Название" value={subscriptionTypeEditForm.name} error={subscriptionTypeEditErrors.name} onChange={(event) => updateSubscriptionTypeEditForm('name', event.target.value)} />
            <Input id={TYPE_EDIT_FIELD_IDS.price} label="Цена" value={subscriptionTypeEditForm.price} error={subscriptionTypeEditErrors.price} onChange={(event) => updateSubscriptionTypeEditForm('price', event.target.value)} />
            <Input id={TYPE_EDIT_FIELD_IDS.currency} label="Валюта" value={subscriptionTypeEditForm.currency} error={subscriptionTypeEditErrors.currency} onChange={(event) => updateSubscriptionTypeEditForm('currency', event.target.value)} />
            <Input id={TYPE_EDIT_FIELD_IDS.durationDays} label="Дней" value={subscriptionTypeEditForm.durationDays} error={subscriptionTypeEditErrors.durationDays} onChange={(event) => updateSubscriptionTypeEditForm('durationDays', event.target.value)} />
            <Input id={TYPE_EDIT_FIELD_IDS.sessionsCount} label="Занятий" value={subscriptionTypeEditForm.sessionsCount} error={subscriptionTypeEditErrors.sessionsCount} onChange={(event) => updateSubscriptionTypeEditForm('sessionsCount', event.target.value)} placeholder="Пусто для безлимитного" />
            <Checkbox id={TYPE_EDIT_FIELD_IDS.isUnlimited} label="Безлимитный" checked={subscriptionTypeEditForm.isUnlimited} error={subscriptionTypeEditErrors.isUnlimited} onChange={(event) => updateSubscriptionTypeEditForm('isUnlimited', event.target.checked)} />
            <Checkbox id={TYPE_EDIT_FIELD_IDS.isIndividual} label="Индивидуальный" checked={subscriptionTypeEditForm.isIndividual} error={subscriptionTypeEditErrors.isIndividual} onChange={(event) => updateSubscriptionTypeEditForm('isIndividual', event.target.checked)} />
            <Checkbox id={TYPE_EDIT_FIELD_IDS.isActive} label="Активен" checked={subscriptionTypeEditForm.isActive} error={subscriptionTypeEditErrors.isActive} onChange={(event) => updateSubscriptionTypeEditForm('isActive', event.target.checked)} />
          </div>
        </FormModal>

        <FormModal open={Boolean(financeAction)} title={financeActionMeta?.title || 'Финансовая операция'} size="lg" busy={busyId != null} dirty={Boolean(financeBaseline) && JSON.stringify(financeForm) !== JSON.stringify(financeBaseline)} onRequestClose={() => { if (financeBaseline) setFinanceForm(financeBaseline); setFinanceAction(null); setFinanceBaseline(null); setFinanceErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId != null} onClick={() => requestClose('cancel')}>Отмена</Button><Button variant="primary" loading={busyId === financeActionMeta?.busy} disabled={busyId != null || (['renew', 'freeze', 'adjust'].includes(financeAction) && (subscriptionsLoading || !financeForm.subscriptionId))} onClick={financeActionMeta?.submit}>{financeActionMeta?.label || 'Сохранить'}</Button></>}>
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="ops-form-grid">
            <SearchableSelect inputId={FINANCE_FIELD_IDS.participantId} label="Участник" value={financeForm.participantId} error={financeErrors.participantId} onChange={(value) => updateFinanceForm('participantId', value)} options={participants.map((participant) => clientSelectOption(participant, { description: (row) => row.phone || row.email || row.group }))} />
            {(financeAction === 'issue' || financeAction === 'renew') && <Select id={FINANCE_FIELD_IDS.subscriptionTypeId} label="Тип абонемента" value={financeForm.subscriptionTypeId} error={financeErrors.subscriptionTypeId} onChange={(event) => updateFinanceForm('subscriptionTypeId', event.target.value)}><option value="">Выберите тип</option>{subscriptionTypes.map((type) => <option key={type.typeId} value={type.typeId}>{type.name} · {type.price.toLocaleString('ru-RU')} {type.currency}</option>)}</Select>}
            {(financeAction === 'renew' || financeAction === 'freeze' || financeAction === 'adjust') && <Select id={FINANCE_FIELD_IDS.subscriptionId} label="Абонемент участника" value={financeForm.subscriptionId} error={financeErrors.subscriptionId} disabled={subscriptionsLoading} onChange={(event) => updateFinanceForm('subscriptionId', event.target.value)}><option value="">{subscriptionsLoading ? 'Загрузка абонементов…' : 'Выберите абонемент'}</option>{subscriptions.map((subscription) => <option key={subscription.id} value={subscription.id}>#{subscription.id} · {subscription.type} · {subscription.status} · {subscription.remaining_sessions ?? 'безлимитный'}</option>)}</Select>}
            {(financeAction === 'issue' || financeAction === 'renew') && <><Input id={FINANCE_FIELD_IDS.startDate} label="Начало абонемента" value={financeForm.startDate} error={financeErrors.startDate} onChange={(event) => updateFinanceForm('startDate', event.target.value)} placeholder="ГГГГ-ММ-ДД" /><Input id={FINANCE_FIELD_IDS.dueDate} label="Срок оплаты" value={financeForm.dueDate} error={financeErrors.dueDate} onChange={(event) => updateFinanceForm('dueDate', event.target.value)} placeholder="ГГГГ-ММ-ДД" /><Checkbox id={FINANCE_FIELD_IDS.createCharge} label="Создать начисление" checked={financeForm.createCharge} error={financeErrors.createCharge} onChange={(event) => updateFinanceForm('createCharge', event.target.checked)} /></>}
            {financeAction === 'charge' && <><Input id={FINANCE_FIELD_IDS.chargeDescription} label="Описание начисления" value={financeForm.chargeDescription} error={financeErrors.chargeDescription} onChange={(event) => updateFinanceForm('chargeDescription', event.target.value)} /><Input id={FINANCE_FIELD_IDS.chargeAmount} label="Сумма начисления" value={financeForm.chargeAmount} error={financeErrors.chargeAmount} onChange={(event) => updateFinanceForm('chargeAmount', event.target.value)} placeholder={selectedType ? String(selectedType.price) : '240.00'} /><Input id={FINANCE_FIELD_IDS.dueDate} label="Срок оплаты" value={financeForm.dueDate} error={financeErrors.dueDate} onChange={(event) => updateFinanceForm('dueDate', event.target.value)} placeholder="ГГГГ-ММ-ДД" /></>}
            {financeAction === 'payment' && <><Input id={FINANCE_FIELD_IDS.paymentAmount} label="Сумма платежа" value={financeForm.paymentAmount} error={financeErrors.paymentAmount} onChange={(event) => updateFinanceForm('paymentAmount', event.target.value)} placeholder={selectedType ? String(selectedType.price) : '240.00'} /><Input id={FINANCE_FIELD_IDS.paymentDate} label="Дата платежа" value={financeForm.paymentDate} error={financeErrors.paymentDate} onChange={(event) => updateFinanceForm('paymentDate', event.target.value)} placeholder="ГГГГ-ММ-ДД" /><Select id={FINANCE_FIELD_IDS.paymentMethod} label="Способ оплаты" value={financeForm.paymentMethod} error={financeErrors.paymentMethod} onChange={(event) => updateFinanceForm('paymentMethod', event.target.value)}><option value="cash">Наличные</option><option value="bank_transfer">Bank transfer / IBAN</option><option value="card">Карта</option><option value="other">Другое</option></Select></>}
            {financeAction === 'freeze' && <><Input id={FINANCE_FIELD_IDS.freezeStart} label="Заморозить с" value={financeForm.freezeStart} error={financeErrors.freezeStart} onChange={(event) => updateFinanceForm('freezeStart', event.target.value)} placeholder="ГГГГ-ММ-ДД" /><Input id={FINANCE_FIELD_IDS.freezeEnd} label="Заморозить до" value={financeForm.freezeEnd} error={financeErrors.freezeEnd} onChange={(event) => updateFinanceForm('freezeEnd', event.target.value)} placeholder="ГГГГ-ММ-ДД" /><Input id={FINANCE_FIELD_IDS.freezeReason} label="Причина заморозки" value={financeForm.freezeReason} error={financeErrors.freezeReason} onChange={(event) => updateFinanceForm('freezeReason', event.target.value)} /></>}
            {financeAction === 'adjust' && <><Input id={FINANCE_FIELD_IDS.adjustDelta} label="Корректировка занятий" value={financeForm.adjustDelta} error={financeErrors.adjustDelta} onChange={(event) => updateFinanceForm('adjustDelta', event.target.value)} /><Input id={FINANCE_FIELD_IDS.adjustNote} label="Комментарий к корректировке" value={financeForm.adjustNote} error={financeErrors.adjustNote} onChange={(event) => updateFinanceForm('adjustNote', event.target.value)} /></>}
          </div>
        </FormModal>

        <FormModal open={Boolean(editingPayment)} title="Изменить реквизиты платежа" description="Сумма, время и сама запись не удаляются. Изменение попадёт в журнал действий." size="md" busy={busyId != null} dirty={Boolean(paymentEditBaseline) && JSON.stringify(paymentEditForm) !== JSON.stringify(paymentEditBaseline)} onRequestClose={() => { if (paymentEditBaseline) setPaymentEditForm(paymentEditBaseline); setEditingPayment(null); setPaymentEditBaseline(null); setPaymentEditErrors({}); setError(null) }} footer={({ requestClose }) => <><Button variant="secondary" disabled={busyId != null} onClick={() => requestClose('cancel')}>Отмена</Button><Button variant="primary" loading={busyId === `edit-${editingPayment?.id}`} disabled={busyId != null} onClick={savePaymentEdit}>Сохранить изменение</Button></>}>
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="ops-form-grid">
            <Select id={PAYMENT_EDIT_FIELD_IDS.method} label="Способ оплаты" value={paymentEditForm.method} error={paymentEditErrors.method} onChange={(event) => { setPaymentEditForm({ ...paymentEditForm, method: event.target.value }); setPaymentEditErrors((current) => clearFieldError(current, 'method')) }}><option value="cash">Наличные</option><option value="bank_transfer">Bank transfer / IBAN</option><option value="card">Карта</option><option value="other">Другое</option></Select>
            <Input id={PAYMENT_EDIT_FIELD_IDS.comment} label="Комментарий" value={paymentEditForm.comment} error={paymentEditErrors.comment} onChange={(event) => { setPaymentEditForm({ ...paymentEditForm, comment: event.target.value }); setPaymentEditErrors((current) => clearFieldError(current, 'comment')) }} />
          </div>
        </FormModal>

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

