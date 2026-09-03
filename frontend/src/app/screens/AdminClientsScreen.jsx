import React, { useEffect, useMemo, useState } from 'react'
import { adminLocaleTag, adminTranslator } from '../../adminLocales.js'
import { api, apiErrorMessage } from '../../api.js'
import { useLocale } from '../../i18n.jsx'
import { mapAdminClientRows } from '../../mappers.js'
import { updateClientIdentity } from '../clientContracts.js'
import {
  clearFieldError,
  fieldErrorsFromApi,
  focusFirstFieldError,
  formErrorMessage,
} from '../formErrors.js'
import { BusyBanner } from '../runtime.jsx'
import { clientSelectOption, SearchableSelect } from '../SearchableSelect.jsx'
import { DateField } from '../DateTimeField.jsx'
import { FormModal } from '../FormModal.jsx'
import { ToastNotice } from '../ToastProvider.jsx'
import { ListFeedback, useScreenList } from '../listFoundation.jsx'
import { ActionPopover, EntityMobileCard } from '../EntityListPrimitives.jsx'
import { clientActivity, formatEntityDate, formatEntityMoney } from '../entityListContracts.js'
import { GroupMultiSelect } from '../GroupMultiSelect.jsx'

const CLIENT_FIELD_MAP = {
  'account.first_name': 'firstName',
  'account.last_name': 'lastName',
  'account.email': 'email',
  'account.username': 'username',
  'account.phone': 'phone',
  'account.instagram_username': 'instagramUsername',
  'participant.birth_date': 'birthDate',
  'participant.group_ids': 'groupIds',
  birth_date: 'birthDate',
  group_ids: 'groupIds',
  instagram_username: 'instagramUsername',
}

const CLIENT_FIELD_IDS = {
  firstName: 'admin-client-firstName',
  lastName: 'admin-client-lastName',
  email: 'admin-client-email',
  username: 'admin-client-username',
  phone: 'admin-client-phone',
  instagramUsername: 'admin-client-instagramUsername',
  birthDate: 'admin-client-birthDate',
  groupIds: 'admin-client-groupIds',
}

const CLIENT_EDIT_FIELD_MAP = {
  'account.first_name': 'accountFirstName',
  'account.last_name': 'accountLastName',
  'account.email': 'accountEmail',
  'account.username': 'accountUsername',
  'account.phone': 'accountPhone',
  birth_date: 'birthDate',
  group_ids: 'groupIds',
}

const PARTICIPANT_FIELD_MAP = {
  'participant.first_name': 'firstName',
  'participant.last_name': 'lastName',
  'participant.birth_date': 'birthDate',
  'participant.email': 'email',
  'participant.group_ids': 'groupIds',
  first_name: 'firstName',
  last_name: 'lastName',
  birth_date: 'birthDate',
  email: 'email',
  group_ids: 'groupIds',
}

const mapActiveClientRows = (rows) => mapAdminClientRows(rows).active
const mapBlacklistedClientRows = (rows) => mapAdminClientRows(rows).blacklisted

function hasMeaningfulFormValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'boolean') return value
  return String(value ?? '').trim().length > 0
}

function currentClientListLayout() {
  if (typeof window === 'undefined') return 'desktop'
  if (window.innerWidth < 768) return 'mobile'
  if (window.innerWidth < 960) return 'tablet'
  return 'desktop'
}

function useClientListLayout() {
  const [layout, setLayout] = useState(currentClientListLayout)
  useEffect(() => {
    const update = () => setLayout(currentClientListLayout())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return layout
}

async function loadClientAccountOptions(query, requestOptions = {}) {
  const payload = await api.get(`/api/admin/reference/?q=${encodeURIComponent(query)}`, requestOptions)
  const rows = mapAdminClientRows(payload.participants || []).active
  const accounts = Array.from(new Map(rows.map((row) => [row.clientId, row])).values())
  return accounts.map((row) => clientSelectOption(row, {
    valueKey: 'clientId',
    description: (client) => client.phone || client.email || `ID ${client.clientId}`,
  }))
}

export function createAdminClientsScreen(components, reloadRoleData, adminData = {}) {
  const { Table, StatusPill, Avatar, Button, Banner, Badge, Money, Input, Dialog } = components
  return function ApiAdminClients({ go, currentUser, createClient: createClientShortcut }) {
    const { locale } = useLocale()
    const t = useMemo(() => adminTranslator(locale), [locale])
    const localeTag = adminLocaleTag(locale)
    const clientListLayout = useClientListLayout()
    const groups = adminData.groups || []
    const [scope, setScope] = useState('active')
    const clientList = useScreenList({
      path: '/api/admin/clients/',
      itemKey: 'clients',
      mapRows: scope === 'blacklist' ? mapBlacklistedClientRows : mapActiveClientRows,
      role: 'admin',
      route: `clients-${scope}`,
      userKey: currentUser?.id || currentUser?.username,
      initialFilters: { subscription: '', balance: '', activity: '' },
      fixedParams: { active: scope === 'blacklist' ? 'false' : 'true', all: 'true' },
      defaultOrder: 'name',
    })
    const rows = clientList.rows
    const clientOptions = Array.from(
      new Map([...(adminData.clients || []), ...rows].filter((row) => row.clientId).map((row) => [row.clientId, row])).values(),
    )
    const [clientForm, setClientForm] = useState({
      firstName: '',
      lastName: '',
      email: '',
      username: '',
      usernameManual: false,
      phone: '',
      instagramUsername: '',
      birthDate: '',
      groupIds: [],
    })
    const [participantForm, setParticipantForm] = useState({
      clientId: '',
      firstName: '',
      lastName: '',
      birthDate: '',
      email: '',
      groupIds: [],
    })
    const [editingClient, setEditingClient] = useState(null)
    const [clientEditBaseline, setClientEditBaseline] = useState(null)
    const [clientEditForm, setClientEditForm] = useState({
      accountFirstName: '',
      accountLastName: '',
      accountEmail: '',
      accountUsername: '',
      accountPhone: '',
      firstName: '',
      lastName: '',
      birthDate: '',
      email: '',
      groupIds: [],
      isActive: true,
    })
    const [message, setMessage] = useState(null)
    const [error, setError] = useState(null)
    const [clientFieldErrors, setClientFieldErrors] = useState({})
    const [participantFieldErrors, setParticipantFieldErrors] = useState({})
    const [clientEditFieldErrors, setClientEditFieldErrors] = useState({})
    const [busy, setBusy] = useState(false)
    const [quickAction, setQuickAction] = useState(null)
    const [clientAction, setClientAction] = useState(null)
    useEffect(() => {
      if (createClientShortcut === '1') setQuickAction('client')
    }, [createClientShortcut])
    const filteredRows = rows
    const hasActiveFilter = Boolean(clientList.search.trim()) || clientList.filterCount > 0
    const emptyLabel = hasActiveFilter
      ? t('clients.emptyFiltered')
      : scope === 'blacklist'
        ? t('clients.emptyBlacklist')
        : t('clients.emptyActive')
    const clientFormDirty = Object.entries(clientForm).some(
      ([key, value]) => key !== 'usernameManual' && hasMeaningfulFormValue(value),
    )
    const participantFormDirty = Object.values(participantForm).some(hasMeaningfulFormValue)
    const clientEditDirty = Boolean(clientEditBaseline) && JSON.stringify(clientEditForm) !== JSON.stringify(clientEditBaseline)

    function closeQuickAction() {
      if (quickAction === 'client') {
        setClientForm({ firstName: '', lastName: '', email: '', username: '', usernameManual: false, phone: '', instagramUsername: '', birthDate: '', groupIds: [] })
        setClientFieldErrors({})
      } else if (quickAction === 'participant') {
        setParticipantForm({ clientId: '', firstName: '', lastName: '', birthDate: '', email: '', groupIds: [] })
        setParticipantFieldErrors({})
      }
      setError(null)
      setQuickAction(null)
    }

    const subscriptionUsage = (row) => {
      if (!row.hasCurrentSubscription) return t('clients.noPass')
      if (row.currentSubscriptionIsUnlimited) return t('clients.unlimited')
      return t('clients.remaining', { remaining: row.currentSubscriptionRemaining, total: row.currentSubscriptionTotal })
    }

    const activity = (row) => {
      const value = clientActivity(row.lastPresentAt)
      const statusLabel = t(value.state === 'active' ? 'clients.activeStatus' : 'clients.inactiveStatus')
      if (value.days == null || value.days > 180) return { ...value, label: t('clients.inactiveLong'), statusLabel, detail: t('clients.inactiveLongDetail') }
      const date = formatEntityDate(row.lastPresentAt, localeTag)
      return { ...value, label: t(value.state === 'active' ? 'clients.activeAt' : 'clients.inactiveAt', { date }), statusLabel, detail: date }
    }

    const updateClientForm = (field, value) => {
      setClientFieldErrors((current) => {
        let next = clearFieldError(current, field)
        if (!clientForm.usernameManual
            && ['firstName', 'lastName', 'email', 'phone'].includes(field)) {
          next = clearFieldError(next, 'username')
        }
        return next
      })
      setClientForm((current) => updateClientIdentity(current, field, value))
    }
    const updateParticipantForm = (field, value) => {
      setParticipantFieldErrors((current) => clearFieldError(current, field))
      setParticipantForm((current) => ({ ...current, [field]: value }))
    }
    const updateClientEditForm = (field, value) => {
      setClientEditFieldErrors((current) => clearFieldError(current, field))
      setClientEditForm((current) => ({ ...current, [field]: value }))
    }

    function splitFullName(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
      return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') }
    }

    async function openClientEdit(row) {
      setEditingClient(row)
      setClientEditFieldErrors({})
      const initialForm = {
        accountFirstName: '',
        accountLastName: '',
        accountEmail: row.email || '',
        accountUsername: '',
        accountPhone: row.phone || '',
        firstName: row.first || '',
        lastName: row.last || '',
        birthDate: row.born === '-' ? '' : row.born || '',
        email: row.email || '',
        groupIds: (row.groupIds || []).map(String),
        isActive: row.isActive,
      }
      setClientEditForm(initialForm)
      setClientEditBaseline(initialForm)
      if (!row.clientId) return
      setBusy(true)
      setError(null)
      try {
        const detail = await api.get(`/api/admin/clients/${row.clientId}/`)
        const account = detail.account || {}
        const accountName = splitFullName(account.full_name)
        setClientEditForm((current) => {
          const next = {
          ...current,
          accountFirstName: account.first_name || accountName.firstName,
          accountLastName: account.last_name || accountName.lastName,
          accountEmail: account.email || '',
          accountUsername: account.username || '',
          accountPhone: account.phone || row.phone || '',
          }
          setClientEditBaseline(next)
          return next
        })
      } catch (err) {
        setError(apiErrorMessage(err, t('clients.loadError')))
      } finally {
        setBusy(false)
      }
    }

    async function createClient() {
      if (!clientForm.firstName.trim() && !clientForm.lastName.trim()) {
        const nextErrors = {
          firstName: t('clients.nameRequired'),
          lastName: t('clients.nameRequired'),
        }
        setClientFieldErrors(nextErrors)
        setError(null)
        focusFirstFieldError(nextErrors, CLIENT_FIELD_IDS)
        return
      }
      setBusy(true)
      setError(null)
      setClientFieldErrors({})
      try {
        await api.post('/api/admin/clients/', {
          client_type: 'adult',
          is_adult: true,
          account: {
            first_name: clientForm.firstName,
            last_name: clientForm.lastName,
            email: clientForm.email,
            username: clientForm.username,
            phone: clientForm.phone,
            instagram_username: clientForm.instagramUsername,
          },
          participant: {
            first_name: clientForm.firstName,
            last_name: clientForm.lastName,
            birth_date: clientForm.birthDate || null,
            group_ids: clientForm.groupIds,
            is_account_holder: true,
          },
        })
        setMessage(t('clients.created'))
        setQuickAction(null)
        setClientForm({
          firstName: '',
          lastName: '',
          email: '',
          username: '',
          usernameManual: false,
          phone: '',
          instagramUsername: '',
          birthDate: '',
          groupIds: [],
        })
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, CLIENT_FIELD_MAP)
        setClientFieldErrors(nextErrors)
        setError(formErrorMessage(err, t('clients.createError')))
        setTimeout(() => focusFirstFieldError(nextErrors, CLIENT_FIELD_IDS), 0)
      } finally {
        setBusy(false)
      }
    }

    async function addParticipant() {
      if (!participantForm.clientId) {
        setParticipantFieldErrors({ clientId: t('clients.accountRequired') })
        setTimeout(() => focusFirstFieldError(
          { clientId: true }, { clientId: 'admin-participant-clientId' }), 0)
        return
      }
      if (!participantForm.firstName.trim() && !participantForm.lastName.trim()) {
        const nextErrors = {
          firstName: t('clients.nameRequired'),
          lastName: t('clients.nameRequired'),
        }
        setParticipantFieldErrors(nextErrors)
        setError(null)
        focusFirstFieldError(nextErrors, {
          firstName: 'admin-participant-firstName',
          lastName: 'admin-participant-lastName',
        })
        return
      }
      setBusy(true)
      setError(null)
      setParticipantFieldErrors({})
      try {
        await api.post(`/api/admin/clients/${participantForm.clientId}/participants/`, {
          participant: {
            first_name: participantForm.firstName,
            last_name: participantForm.lastName,
            birth_date: participantForm.birthDate || null,
            email: participantForm.email,
            group_ids: participantForm.groupIds,
          },
        })
        setMessage(t('clients.participantAdded'))
        setQuickAction(null)
        setParticipantForm({ clientId: '', firstName: '', lastName: '', birthDate: '', email: '', groupIds: [] })
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, PARTICIPANT_FIELD_MAP)
        setParticipantFieldErrors(nextErrors)
        setError(formErrorMessage(err, t('clients.participantError')))
        setTimeout(() => focusFirstFieldError(nextErrors, {
          clientId: 'admin-participant-clientId',
          firstName: 'admin-participant-firstName',
          lastName: 'admin-participant-lastName',
          birthDate: 'admin-participant-birthDate',
          email: 'admin-participant-email',
          groupIds: 'admin-participant-groupIds',
        }), 0)
      } finally {
        setBusy(false)
      }
    }

    async function saveClientEdit() {
      if (!editingClient) return
      setBusy(true)
      setError(null)
      setClientEditFieldErrors({})
      try {
        if (editingClient.clientId) {
          await api.post(`/api/admin/clients/${editingClient.clientId}/`, {
            account: {
              first_name: clientEditForm.accountFirstName,
              last_name: clientEditForm.accountLastName,
              email: clientEditForm.accountEmail,
              username: clientEditForm.accountUsername,
              phone: clientEditForm.accountPhone,
            },
          })
        }
        await api.post(`/api/admin/participants/${editingClient.studentId}/`, {
          participant: {
            first_name: clientEditForm.firstName,
            last_name: clientEditForm.lastName,
            birth_date: clientEditForm.birthDate || null,
            email: clientEditForm.email,
            group_ids: clientEditForm.groupIds,
            is_active: clientEditForm.isActive,
          },
        })
        setEditingClient(null)
        setClientEditBaseline(null)
        setMessage(t('clients.updated'))
        await reloadRoleData?.('admin')
      } catch (err) {
        const nextErrors = fieldErrorsFromApi(err, {
          ...CLIENT_EDIT_FIELD_MAP,
          ...PARTICIPANT_FIELD_MAP,
        })
        setClientEditFieldErrors(nextErrors)
        setError(formErrorMessage(err, t('clients.updateError')))
        setTimeout(() => focusFirstFieldError(nextErrors, {
          accountFirstName: 'admin-client-edit-accountFirstName',
          accountLastName: 'admin-client-edit-accountLastName',
          accountEmail: 'admin-client-edit-accountEmail',
          accountUsername: 'admin-client-edit-accountUsername',
          accountPhone: 'admin-client-edit-accountPhone',
          firstName: 'admin-client-edit-firstName',
          lastName: 'admin-client-edit-lastName',
          birthDate: 'admin-client-edit-birthDate',
          email: 'admin-client-edit-email',
          groupIds: 'admin-client-edit-groupIds',
        }), 0)
      } finally {
        setBusy(false)
      }
    }

    async function applyClientAction() {
      if (!clientAction?.row?.clientId) return
      setBusy(true)
      setError(null)
      try {
        if (clientAction.type === 'archive') {
          await api.delete(`/api/admin/clients/${clientAction.row.clientId}/`)
          setMessage(t('clients.archived'))
        } else {
          await api.post(`/api/admin/clients/${clientAction.row.clientId}/restore/`)
          setMessage(t('clients.restored'))
        }
        setClientAction(null)
        await reloadRoleData?.('admin')
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.getElementById('admin-clients-search')?.focus({ preventScroll: true })
        }))
      } catch (err) {
        setError(apiErrorMessage(err, t('clients.statusError')))
      } finally {
        setBusy(false)
      }
    }

    return (
      <div className="page page-wide">
        <div className="page-head">
          <div>
            <h1 className="page-title">{t('clients.title')}</h1>
            <p className="page-desc">{t('clients.description')}</p>
          </div>
        </div>
        <ToastNotice id="admin-clients-result" message={message} />
        {error && !quickAction && !editingClient && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
        <BusyBanner Banner={Banner} show={busy}>{t('clients.saving')}</BusyBanner>

        <div className="ops-action-strip">
          <button type="button" className={`ops-action-card${quickAction === 'client' ? ' is-active' : ''}`} onClick={() => setQuickAction((current) => current === 'client' ? null : 'client')}>
            <span>{t('clients.new')}</span>
            <small>{t('clients.openCreate')}</small>
          </button>
          <button type="button" className={`ops-action-card${quickAction === 'participant' ? ' is-active' : ''}`} onClick={() => setQuickAction((current) => current === 'participant' ? null : 'participant')}>
            <span>{t('clients.participantToAccount')}</span>
            <small>{t('clients.addSecond')}</small>
          </button>
        </div>

        <FormModal
          open={quickAction === 'client'}
          title={t('clients.new')}
          size="lg"
          busy={busy}
          dirty={clientFormDirty}
          onRequestClose={closeQuickAction}
          footer={({ requestClose }) => (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>{t('common.close')}</Button>
              <Button variant="primary" loading={busy && !editingClient} disabled={busy} onClick={createClient}>{t('clients.create')}</Button>
            </>
          )}
        >
            {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
            <div className="ops-form-grid ops-client-create-grid">
              <Input id="admin-client-firstName" label={t('clients.ownerFirstName')} value={clientForm.firstName} error={clientFieldErrors.firstName} onChange={(event) => updateClientForm('firstName', event.target.value)} />
              <Input id="admin-client-lastName" label={t('clients.ownerLastName')} value={clientForm.lastName} error={clientFieldErrors.lastName} onChange={(event) => updateClientForm('lastName', event.target.value)} />
              <Input id="admin-client-email" label="Email" value={clientForm.email} error={clientFieldErrors.email} onChange={(event) => updateClientForm('email', event.target.value)} />
              <Input id="admin-client-username" label={t('trainers.login')} value={clientForm.username} error={clientFieldErrors.username} hint={t('clients.usernameHint')} onChange={(event) => updateClientForm('username', event.target.value)} />
              <Input id="admin-client-phone" label={t('common.phone')} value={clientForm.phone} error={clientFieldErrors.phone} onChange={(event) => updateClientForm('phone', event.target.value)} />
              <DateField id="admin-client-birthDate" label={t('clients.birthDate')} value={clientForm.birthDate} error={clientFieldErrors.birthDate} onChange={(value) => updateClientForm('birthDate', value)} />
              <GroupMultiSelect id="admin-client-groupIds" groups={groups} value={clientForm.groupIds} error={clientFieldErrors.groupIds} onChange={(value) => updateClientForm('groupIds', value)} />
              <Input id="admin-client-instagramUsername" label="Instagram" value={clientForm.instagramUsername} error={clientFieldErrors.instagramUsername} hint={t('clients.instagramHint')} onChange={(event) => updateClientForm('instagramUsername', event.target.value)} />
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: 'var(--fs-sm)' }}>{t('clients.ownerParticipantHint')}</p>
        </FormModal>

        <FormModal
          open={quickAction === 'participant'}
          title={t('clients.newParticipant')}
          size="lg"
          busy={busy}
          dirty={participantFormDirty}
          onRequestClose={closeQuickAction}
          footer={({ requestClose }) => (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>{t('common.close')}</Button>
              <Button variant="primary" loading={busy && !editingClient} disabled={busy} onClick={addParticipant}>{t('clients.addParticipant')}</Button>
            </>
          )}
        >
            {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SearchableSelect
                className="ops-grid-full"
                inputId="admin-participant-clientId"
                label={t('clients.account')}
                value={participantForm.clientId}
                error={participantFieldErrors.clientId}
                onChange={(value) => updateParticipantForm('clientId', value)}
                options={clientOptions.map((row) => clientSelectOption(row, {
                  valueKey: 'clientId',
                  description: (client) => client.phone || client.email || `ID ${client.clientId}`,
                }))}
                loadOptions={loadClientAccountOptions}
                placeholder={t('clients.findAccount')}
              />
              <Input id="admin-participant-firstName" label={t('trainers.firstName')} value={participantForm.firstName} error={participantFieldErrors.firstName} onChange={(event) => updateParticipantForm('firstName', event.target.value)} />
              <Input id="admin-participant-lastName" label={t('trainers.lastName')} value={participantForm.lastName} error={participantFieldErrors.lastName} onChange={(event) => updateParticipantForm('lastName', event.target.value)} />
              <DateField id="admin-participant-birthDate" label={t('clients.birthDate')} value={participantForm.birthDate} error={participantFieldErrors.birthDate} onChange={(value) => updateParticipantForm('birthDate', value)} />
              <Input id="admin-participant-email" label="Email" value={participantForm.email} error={participantFieldErrors.email} onChange={(event) => updateParticipantForm('email', event.target.value)} />
              <GroupMultiSelect id="admin-participant-groupIds" groups={groups} value={participantForm.groupIds} error={participantFieldErrors.groupIds} onChange={(value) => updateParticipantForm('groupIds', value)} />
            </div>
        </FormModal>

        <FormModal
          open={Boolean(editingClient)}
          title={t('clients.edit')}
          size="lg"
          busy={busy}
          dirty={clientEditDirty}
          onRequestClose={() => { if (clientEditBaseline) setClientEditForm(clientEditBaseline); setEditingClient(null); setClientEditBaseline(null); setClientEditFieldErrors({}); setError(null) }}
          footer={({ requestClose }) => (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => requestClose('cancel')}>{t('common.close')}</Button>
              <Button variant="primary" loading={busy} disabled={busy} onClick={saveClientEdit}>{t('common.save')}</Button>
            </>
          )}
        >
            {error && <Banner tone="danger" style={{ marginBottom: 12 }} onClose={() => setError(null)}>{error}</Banner>}
            <div className="ops-form-grid">
              <Input id="admin-client-edit-accountFirstName" label={t('clients.ownerFirstShort')} value={clientEditForm.accountFirstName} error={clientEditFieldErrors.accountFirstName} onChange={(event) => updateClientEditForm('accountFirstName', event.target.value)} />
              <Input id="admin-client-edit-accountLastName" label={t('clients.ownerLastName')} value={clientEditForm.accountLastName} error={clientEditFieldErrors.accountLastName} onChange={(event) => updateClientEditForm('accountLastName', event.target.value)} />
              <Input id="admin-client-edit-accountEmail" label={t('clients.ownerEmail')} value={clientEditForm.accountEmail} error={clientEditFieldErrors.accountEmail} onChange={(event) => updateClientEditForm('accountEmail', event.target.value)} />
              <Input id="admin-client-edit-accountUsername" label={t('trainers.login')} value={clientEditForm.accountUsername} error={clientEditFieldErrors.accountUsername} onChange={(event) => updateClientEditForm('accountUsername', event.target.value)} />
              <Input id="admin-client-edit-accountPhone" label={t('clients.ownerPhone')} value={clientEditForm.accountPhone} error={clientEditFieldErrors.accountPhone} onChange={(event) => updateClientEditForm('accountPhone', event.target.value)} />
              <Input id="admin-client-edit-firstName" label={t('clients.participantFirst')} value={clientEditForm.firstName} error={clientEditFieldErrors.firstName} onChange={(event) => updateClientEditForm('firstName', event.target.value)} />
              <Input id="admin-client-edit-lastName" label={t('clients.participantLast')} value={clientEditForm.lastName} error={clientEditFieldErrors.lastName} onChange={(event) => updateClientEditForm('lastName', event.target.value)} />
              <DateField id="admin-client-edit-birthDate" label={t('clients.birthDate')} value={clientEditForm.birthDate} error={clientEditFieldErrors.birthDate} onChange={(value) => updateClientEditForm('birthDate', value)} />
              <Input id="admin-client-edit-email" label={t('clients.participantEmail')} value={clientEditForm.email} error={clientEditFieldErrors.email} onChange={(event) => updateClientEditForm('email', event.target.value)} />
              <GroupMultiSelect id="admin-client-edit-groupIds" groups={groups} value={clientEditForm.groupIds} error={clientEditFieldErrors.groupIds} onChange={(value) => updateClientEditForm('groupIds', value)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 21, fontSize: 'var(--fs-sm)' }}>
                <input type="checkbox" checked={clientEditForm.isActive} onChange={(event) => updateClientEditForm('isActive', event.target.checked)} />
                {t('trainers.active')}
              </label>
            </div>
        </FormModal>
        <div className="ops-command-row">
          <div className="ops-client-list-tools">
            <div className="seg" aria-label={t('clients.listMode')}>
              <button type="button" className={scope === 'active' ? 'on' : ''} onClick={() => setScope('active')}>{t('clients.title')}</button>
              <button type="button" className={scope === 'blacklist' ? 'on' : ''} onClick={() => setScope('blacklist')}>{t('clients.blacklist')}</button>
            </div>
            <div className="ops-search">
              <span aria-hidden="true">⌕</span>
              <input id="admin-clients-search" aria-label={t('clients.search')} value={clientList.search} onChange={(event) => clientList.setSearch(event.target.value)} placeholder={t('clients.searchPlaceholder')} />
            </div>
            <div className="ops-client-filter-selects">
              <label className="ops-client-filter-field">
                <span>{t('clients.subscription')}</span>
                <select aria-label={t('clients.subscription')} value={clientList.draftFilters.subscription} onChange={(event) => clientList.setDraftFilter('subscription', event.target.value)}>
                  <option value="">{t('common.all')}</option>
                  <option value="with">{t('clients.with')}</option>
                  <option value="without">{t('clients.without')}</option>
                </select>
              </label>
              <label className="ops-client-filter-field">
                <span>{t('common.balance')}</span>
                <select aria-label={t('common.balance')} value={clientList.draftFilters.balance} onChange={(event) => clientList.setDraftFilter('balance', event.target.value)}>
                  <option value="">{t('clients.any')}</option>
                  <option value="positive">{t('clients.overpayment')}</option>
                  <option value="negative">{t('clients.debt')}</option>
                </select>
              </label>
              <label className="ops-client-filter-field">
                <span>{t('clients.activity')}</span>
                <select aria-label={t('clients.activity')} value={clientList.draftFilters.activity} onChange={(event) => clientList.setDraftFilter('activity', event.target.value)}>
                  <option value="">{t('common.all')}</option>
                  <option value="active">{t('clients.active60')}</option>
                  <option value="inactive">{t('common.inactive')}</option>
                </select>
              </label>
            </div>
          </div>
          <div className="ops-client-command-actions">
            <span className="muted">{t('clients.found', { count: clientList.pagination.total })}</span>
            <Button size="sm" variant="secondary" onClick={clientList.applyFilters}>{t('clients.applyFilters', { count: clientList.filterCount })}</Button>
            {hasActiveFilter && (
              <Button size="sm" variant="subtle" onClick={clientList.resetFilters}>{t('clients.resetFilters')}</Button>
            )}
          </div>
        </div>
        <ListFeedback
          list={clientList}
          emptyLabel={scope === 'blacklist' ? t('clients.emptyBlacklist') : t('clients.emptyActive')}
          noResultsLabel={t('clients.emptyFiltered')}
        />
        {filteredRows.length > 0 && clientListLayout === 'desktop' && <div className="ops-client-desktop-table">
          <Table
            rows={filteredRows}
            emptyLabel={emptyLabel}
            columns={[
              { key: 'name', header: t('common.participant'), render: (row) => (
                <button type="button" className="ops-link-button ops-ellipsis-value" data-full-value={`${row.last} ${row.first}`} title={`${row.last} ${row.first}`} disabled={!row.clientId} onClick={() => go?.('clientDetail', { clientId: row.clientId })}>
                  <Avatar name={`${row.first} ${row.last}`} size={28} />
                  <span className="strong ops-ellipsis-text">{row.last} {row.first}</span>
                </button>
              ) },
              { key: 'phone', header: t('common.phone'), muted: true, render: (row) => <span className="mono ops-ellipsis-value" data-full-value={row.phone || '-'} title={row.phone || '-'} tabIndex={0}><span className="ops-ellipsis-text">{row.phone || '-'}</span></span> },
              { key: 'email', header: 'Email', muted: true, render: (row) => <span className="ops-ellipsis-value" data-full-value={row.email || '-'} title={row.email || '-'} tabIndex={0}><span className="ops-ellipsis-text">{row.email || '-'}</span></span> },
              { key: 'group', header: t('common.group'), render: (row) => row.groupId ? <button type="button" className="ops-link-button ops-ellipsis-value" data-full-value={row.group || '-'} title={row.group || '-'} onClick={() => go?.('groups', { groupId: row.groupId })}><span className="ops-ellipsis-text">{row.group}</span></button> : <span className="ops-ellipsis-value" data-full-value={row.group || '-'} title={row.group || '-'} tabIndex={0}><span className="ops-ellipsis-text">{row.group || '-'}</span></span> },
              { key: 'subscription', header: t('clients.subscription'), width: 105, render: (row) => <Badge tone={row.hasCurrentSubscription ? 'success' : 'neutral'}>{subscriptionUsage(row)}</Badge> },
              { key: 'balance', header: t('common.balance'), align: 'right', width: 105, render: (row) => <Money amount={row.balance} signed currency="zł" /> },
              { key: 'activity', header: t('clients.activity'), width: 150, render: (row) => (
                <span className="ops-client-activity">
                  <StatusPill status={activity(row).state} label={activity(row).statusLabel} size="sm" />
                  <small className="ops-ellipsis-value" style={{ minWidth: 0, width: '100%' }} data-full-value={activity(row).detail} title={activity(row).detail} tabIndex={0}><span className="ops-ellipsis-text">{activity(row).detail}</span></small>
                </span>
              ) },
              {
                key: 'act',
                header: '',
                width: 240,
                render: (row) => (
                  <div className="ops-client-row-actions">
                    {scope === 'active' ? (
                      <>
                        <Button size="sm" variant="subtle" disabled={busy} onClick={() => openClientEdit(row)}>{t('common.edit')}</Button>
                        <Button size="sm" variant="subtle" disabled={busy} onClick={() => setClientAction({ type: 'archive', row })}>{t('clients.archive')}</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => setClientAction({ type: 'restore', row })}>{t('clients.restore')}</Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>}
        {filteredRows.length > 0 && clientListLayout === 'tablet' && <div className="ops-client-tablet-table">
          <Table
            rows={filteredRows}
            columns={[
              { key: 'client', header: t('clients.client'), render: (row) => (
                <div className="ops-client-tablet-stack">
                  <button type="button" className="ops-link-button strong" disabled={!row.clientId} onClick={() => go?.('clientDetail', { clientId: row.clientId })}>{row.last} {row.first}</button>
                  <span className="mono">{row.phone || '-'}</span>
                  <span>{row.email || '-'}</span>
                </div>
              ) },
              { key: 'membership', header: t('clients.membership'), render: (row) => (
                <div className="ops-client-tablet-stack">
                  {row.groupId
                    ? <button type="button" className="ops-link-button" onClick={() => go?.('groups', { groupId: row.groupId })}>{row.group}</button>
                    : <span>{row.group || '-'}</span>}
                  <Badge tone={row.hasCurrentSubscription ? 'success' : 'neutral'}>{subscriptionUsage(row)}</Badge>
                </div>
              ) },
              { key: 'state', header: t('clients.financeActivity'), render: (row) => (
                <div className="ops-client-tablet-stack">
                  <Money amount={row.balance} signed currency="zł" />
                  <span className="ops-client-tablet-activity"><StatusPill status={activity(row).state} label={activity(row).statusLabel} size="sm" /><small>{activity(row).detail}</small></span>
                </div>
              ) },
              { key: 'actions', header: t('clients.actions'), width: 64, render: (row) => (
                <ActionPopover
                  label={t('common.actionsFor', { name: `${row.last} ${row.first}` })}
                  disabled={busy}
                  actions={[
                    { key: 'profile', label: t('trainers.profile'), disabled: !row.clientId, onSelect: () => go?.('clientDetail', { clientId: row.clientId }) },
                    scope === 'active' && { key: 'edit', label: t('common.edit'), onSelect: () => openClientEdit(row) },
                    scope === 'active'
                      ? { key: 'archive', label: t('clients.archive'), danger: true, onSelect: () => setClientAction({ type: 'archive', row }) }
                      : { key: 'restore', label: t('clients.restore'), onSelect: () => setClientAction({ type: 'restore', row }) },
                  ]}
                />
              ) },
            ]}
          />
        </div>}
        {filteredRows.length > 0 && clientListLayout === 'mobile' && <div className="ops-client-mobile-list">
          {filteredRows.map((row) => (
            <EntityMobileCard key={row.id} className="ops-client-compact-card" labelledBy={`client-card-${row.id}`} testId="client-compact-card">
              <div className="ops-client-compact-primary">
                <button
                  type="button"
                  className="ops-client-compact-profile ops-compact-card-title"
                  disabled={!row.clientId}
                  style={{ appearance: 'none', border: 0, background: 'transparent', color: 'var(--text-strong)', font: 'inherit', fontFamily: 'var(--font-sans)', textAlign: 'left' }}
                  aria-label={row.clientId ? t('clients.openProfile', { name: `${row.last} ${row.first}` }) : undefined}
                  onClick={row.clientId ? () => go?.('clientDetail', { clientId: row.clientId }) : undefined}
                >
                  <Avatar name={`${row.first} ${row.last}`} size={36} />
                  <strong id={`client-card-${row.id}`} title={`${row.last} ${row.first}`}>{row.last} {row.first}</strong>
                </button>
                <span className={`ops-client-compact-balance${row.balance < 0 ? ' is-debt' : ''}`}>{formatEntityMoney(row.balance)}</span>
                <ActionPopover
                  label={t('common.actionsFor', { name: `${row.last} ${row.first}` })}
                  disabled={busy}
                  actions={[
                    { key: 'profile', label: t('trainers.profile'), disabled: !row.clientId, onSelect: () => go?.('clientDetail', { clientId: row.clientId }) },
                    scope === 'active' && { key: 'edit', label: t('common.edit'), onSelect: () => openClientEdit(row) },
                    scope === 'active'
                      ? { key: 'archive', label: t('clients.archive'), danger: true, onSelect: () => setClientAction({ type: 'archive', row }) }
                      : { key: 'restore', label: t('clients.restore'), onSelect: () => setClientAction({ type: 'restore', row }) },
                  ]}
                />
              </div>
              <div
                className="ops-client-compact-context"
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, paddingLeft: 0 }}
              >
                <span title={row.group || t('clients.individual')}>{row.group || t('clients.individual')}</span>
                <span style={{ justifySelf: 'end', textAlign: 'right' }} title={subscriptionUsage(row)}>{subscriptionUsage(row)}</span>
              </div>
              <div className={`ops-client-compact-activity is-${activity(row).state}`} title={activity(row).label}>
                <span aria-hidden="true" />{activity(row).label}
              </div>
            </EntityMobileCard>
          ))}
        </div>}
        {clientAction && (
          <Dialog
            title={clientAction.type === 'archive'
              ? t('clients.archiveTitle', { name: `${clientAction.row.last} ${clientAction.row.first}` })
              : t('clients.restoreTitle', { name: `${clientAction.row.last} ${clientAction.row.first}` })}
            description={clientAction.type === 'archive'
              ? t('clients.archiveDescription')
              : t('clients.restoreDescription')}
            tone={clientAction.type === 'archive' ? 'danger' : 'default'}
            confirmLabel={clientAction.type === 'archive' ? t('clients.archive') : t('clients.restore')}
            onClose={() => busy ? null : setClientAction(null)}
            onConfirm={applyClientAction}
          >
            <div className="strong">{clientAction.row.last} {clientAction.row.first}</div>
          </Dialog>
        )}
      </div>
    )
  }
}

