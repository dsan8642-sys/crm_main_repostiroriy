import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import './design/styles.css'
import './design/ui_kits/shared/kit.css'
import './app/ops-redesign.css'
import {
  fetchAdminPortal,
  fetchClientPortal,
  fetchMe,
  fetchTrainerPortal,
  productionLogin,
  productionLogout,
  subscribeAuthChanges,
} from './api.js'
import {
  mapAdminPortalData,
  mapClientPortalData,
  mapTrainerPortalData,
} from './mappers.js'
import { LoginScreen } from './app/Auth.jsx'
import { ROLE_META } from './app/runtime.jsx'
import { useLocale } from './i18n.jsx'
import { uiLocaleTag } from './localeContracts.js'

const LazyAppShell = React.lazy(() => import('./app/AppShell.jsx').then(
  (module) => ({ default: module.AppShell }),
))

function emptyPortalData() {
  return {
    AdminData: { trainers: [], groups: [], subscriptionTypes: [], clients: [], sessions: [], roster: [], payments: [], debtors: [] },
    TrainerData: { sessions: [], roster: [], groups: [] },
    ParentData: { account: {}, children: [], profileParticipants: [], consents: [], schedule: {}, ledger: {}, attendance: {}, charges: [], payments: [], notifications: [] },
  }
}

function appRole(user) {
  return user?.role === 'parent' ? 'client' : user?.role
}

function sameIdentity(left, right) {
  return Boolean(left && right)
    && String(left.id ?? left.username) === String(right.id ?? right.username)
    && appRole(left) === appRole(right)
}

class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    const t = this.props.t
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card card-pad" role="alert">
          <h1>{t('shell.roleLoadTitle')}</h1>
          <p>{t('shell.roleLoadDescription')}</p>
          <button type="button" onClick={() => window.location.reload()}>{t('shell.retry')}</button>
        </div>
      </div>
    )
  }
}

function localizedComponents(source) {
  const BaseStatusPill = source.StatusPill
  const BaseDialog = source.Dialog
  const BaseBanner = source.Banner
  const BaseTable = source.Table
  const BaseMoney = source.Money
  function LocalizedStatusPill(props) {
    const { t } = useLocale()
    return (
      <BaseStatusPill
        {...props}
        label={props.label || (props.status ? t(`status.${props.status}`, props.status) : undefined)}
        consumesLabel={props.consumesLabel || t('shared.lessonDeducted')}
        doesNotConsumeLabel={props.doesNotConsumeLabel || t('shared.lessonNotDeducted')}
      />
    )
  }
  function LocalizedDialog(props) {
    const { t } = useLocale()
    return (
      <BaseDialog
        {...props}
        confirmLabel={props.confirmLabel || t('shared.confirm')}
        cancelLabel={props.cancelLabel || t('shared.cancel')}
        irreversibleLabel={props.irreversibleLabel || t('shared.irreversible')}
      />
    )
  }
  function LocalizedBanner(props) {
    const { t } = useLocale()
    return <BaseBanner {...props} closeLabel={props.closeLabel || t('shared.close')} />
  }
  function LocalizedTable(props) {
    const { t } = useLocale()
    return <BaseTable {...props} emptyLabel={props.emptyLabel || t('shared.noData')} />
  }
  function LocalizedMoney(props) {
    const { locale } = useLocale()
    return <BaseMoney {...props} locale={props.locale || uiLocaleTag(locale)} />
  }
  return {
    ...source,
    StatusPill: LocalizedStatusPill,
    Dialog: LocalizedDialog,
    Banner: LocalizedBanner,
    Table: LocalizedTable,
    Money: LocalizedMoney,
  }
}

export default function App() {
  const { bindLocaleIdentity, clearLocaleIdentity, t } = useLocale()
  const tRef = useRef(t)
  tRef.current = t
  const [design, setDesign] = useState(null)
  const [portalData, setPortalData] = useState(() => emptyPortalData())
  const [health, setHealth] = useState({ state: 'loading' })
  const [apiState, setApiState] = useState({ state: 'loading' })
  const [initialRole, setInitialRole] = useState('admin')
  const [currentUser, setCurrentUser] = useState(null)
  const [authRequired, setAuthRequired] = useState(null)
  const [bootstrapError, setBootstrapError] = useState(null)
  const authEpochRef = useRef(0)
  const currentUserRef = useRef(null)
  const authCheckControllerRef = useRef(null)
  const roleLoadControllerRef = useRef(null)

  const purgePrivateState = useCallback(({ resetRoute = true } = {}) => {
    authEpochRef.current += 1
    authCheckControllerRef.current?.abort()
    roleLoadControllerRef.current?.abort()
    setPortalData(emptyPortalData())
    currentUserRef.current = null
    setCurrentUser(null)
    clearLocaleIdentity()
    setAuthRequired(null)
    if (resetRoute) window.history.replaceState({}, '', window.location.pathname)
    return authEpochRef.current
  }, [clearLocaleIdentity])

  const requireAuthentication = useCallback((error) => {
    purgePrivateState()
    setAuthRequired(true)
    setApiState({
      state: 'error',
      role: 'unknown',
      error: error?.message || tRef.current('shell.loginRequired'),
      status: error?.status || 403,
    })
  }, [purgePrivateState])

  const applyRoleData = useCallback((role, mapped) => {
    const key = role === 'admin' ? 'AdminData' : role === 'trainer' ? 'TrainerData' : 'ParentData'
    setPortalData((current) => {
      const previous = current[key]
      const next = role === 'client'
        ? {
            ...previous,
            ...mapped,
            schedule: { ...previous.schedule, ...mapped.schedule },
            attendance: { ...previous.attendance, ...mapped.attendance },
          }
        : { ...previous, ...mapped }
      return { ...current, [key]: next }
    })
  }, [])

  const loadRoleData = useCallback(async (role, options = {}) => {
    const { authEpoch = authEpochRef.current, ...roleOptions } = options
    roleLoadControllerRef.current?.abort()
    const controller = new AbortController()
    roleLoadControllerRef.current = controller
    setApiState({ state: 'loading', role })
    try {
      let payload
      if (role === 'admin') {
        payload = await fetchAdminPortal({ signal: controller.signal })
        if (controller.signal.aborted || authEpoch !== authEpochRef.current) return false
        applyRoleData(role, mapAdminPortalData(payload))
      } else if (role === 'trainer') {
        payload = await fetchTrainerPortal({ signal: controller.signal })
        if (controller.signal.aborted || authEpoch !== authEpochRef.current) return false
        applyRoleData(role, mapTrainerPortalData(payload))
      } else {
        payload = await fetchClientPortal({ ...roleOptions, signal: controller.signal })
        if (controller.signal.aborted || authEpoch !== authEpochRef.current) return false
        applyRoleData(role, mapClientPortalData(payload))
      }
      if (controller.signal.aborted || authEpoch !== authEpochRef.current) return false
      const failures = Object.entries(payload.resourceStates || {})
        .filter(([, state]) => state.state === 'error')
        .map(([resource, state]) => ({ resource, status: state.status }))
      setApiState({ state: failures.length ? 'partial' : 'ok', role, failures })
      window.dispatchEvent(new CustomEvent('swimcrm:list-invalidate', { detail: { role } }))
      return true
    } catch (error) {
      if (controller.signal.aborted || authEpoch !== authEpochRef.current || error.code === 'AUTH_STALE') {
        return false
      }
      if (error.status === 401 || error.status === 403) {
        requireAuthentication(error)
        return false
      }
      setApiState({ state: 'error', role, error: error.message, status: error.status })
      return false
    }
  }, [applyRoleData, requireAuthentication])

  const revalidateAuthentication = useCallback(async ({ purgeFirst = false, bootstrap = false } = {}) => {
    let authEpoch = purgeFirst ? purgePrivateState() : authEpochRef.current
    authCheckControllerRef.current?.abort()
    const controller = new AbortController()
    authCheckControllerRef.current = controller
    try {
      const me = await fetchMe({ signal: controller.signal })
      if (controller.signal.aborted || authEpoch !== authEpochRef.current) return false
      const role = appRole(me)
      if (!ROLE_META[role]) throw new Error(tRef.current('shell.roleUnsupported'))

      const identityChanged = !sameIdentity(currentUserRef.current, me)
      if (!bootstrap && !purgeFirst && !identityChanged) return true
      if (identityChanged && !purgeFirst) authEpoch = purgePrivateState({ resetRoute: !bootstrap })

      currentUserRef.current = me
      setCurrentUser(me)
      setInitialRole(role)
      bindLocaleIdentity({ userId: me.id ?? me.username, role })
      const loaded = await loadRoleData(role, { authEpoch })
      if (!loaded || authEpoch !== authEpochRef.current) return false
      setAuthRequired(false)
      return true
    } catch (error) {
      if (controller.signal.aborted || authEpoch !== authEpochRef.current || error.code === 'AUTH_STALE') {
        return false
      }
      if (error.status === 401 || error.status === 403) {
        requireAuthentication(error)
      } else {
        setAuthRequired(false)
        setApiState({ state: 'error', role: 'unknown', error: error.message, status: error.status })
      }
      return false
    }
  }, [bindLocaleIdentity, loadRoleData, purgePrivateState, requireAuthentication])

  const handleProductionLogin = useCallback(async (credentials) => {
    setApiState({ state: 'loading', role: 'unknown' })
    const payload = await productionLogin(credentials)
    const role = appRole(payload.user)
    if (!ROLE_META[role]) throw new Error(tRef.current('shell.roleUnsupported'))
    const authEpoch = purgePrivateState()
    currentUserRef.current = payload.user
    setCurrentUser(payload.user)
    setInitialRole(role)
    bindLocaleIdentity({ userId: payload.user.id ?? payload.user.username, role })
    const loaded = await loadRoleData(role, { authEpoch })
    if (!loaded || authEpoch !== authEpochRef.current) return
    setAuthRequired(false)
  }, [bindLocaleIdentity, loadRoleData, purgePrivateState])

  const handleProductionLogout = useCallback(async () => {
    setApiState({ state: 'loading', role: initialRole })
    try {
      await productionLogout()
    } finally {
      purgePrivateState()
      setAuthRequired(true)
      setApiState({ state: 'error', role: 'unknown', error: tRef.current('shell.loginRequired'), status: 403 })
    }
  }, [initialRole, purgePrivateState])

  useEffect(() => subscribeAuthChanges(() => {
    revalidateAuthentication({ purgeFirst: true })
  }), [revalidateAuthentication])

  useEffect(() => {
    const revalidateVisibleTab = () => {
      if (document.visibilityState === 'hidden') return
      revalidateAuthentication()
    }
    window.addEventListener('focus', revalidateVisibleTab)
    document.addEventListener('visibilitychange', revalidateVisibleTab)
    return () => {
      window.removeEventListener('focus', revalidateVisibleTab)
      document.removeEventListener('visibilitychange', revalidateVisibleTab)
    }
  }, [revalidateAuthentication])

  useEffect(() => {
    let alive = true
    globalThis.React = React
    import('./design/_ds_bundle.js').then(async () => {
      const nextDesign = {
        components: localizedComponents(globalThis.SwimCRMDesignSystem_546643),
        icons: globalThis.SwimIcons,
      }
      if (alive) setDesign(nextDesign)

      if (alive) await revalidateAuthentication({ bootstrap: true })
    }).catch((error) => {
      if (alive) {
        setBootstrapError(error)
        setAuthRequired(false)
      }
    })
    return () => {
      alive = false
      authCheckControllerRef.current?.abort()
      roleLoadControllerRef.current?.abort()
    }
  }, [revalidateAuthentication])

  useEffect(() => {
    fetch('/api/health/')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => setHealth({ state: 'ok', data }))
      .catch((error) => setHealth({ state: 'error', error: String(error) }))
  }, [])

  if (bootstrapError) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card card-pad" role="alert">
          <h1>{t('shell.interfaceLoadTitle')}</h1>
          <p>{t('shell.interfaceLoadDescription')}</p>
          <button type="button" onClick={() => window.location.reload()}>{t('shell.retryLoad')}</button>
        </div>
      </div>
    )
  }

  if (!design || authRequired === null) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card card-pad">{t('shell.loadingData')}</div>
      </div>
    )
  }

  if (authRequired) {
    return <LoginScreen design={design} apiState={apiState} onLogin={handleProductionLogin} />
  }

  return (
    <ChunkErrorBoundary t={t}>
      <Suspense fallback={<div className="card card-pad" role="status">{t('shell.loadingRole')}</div>}>
        <LazyAppShell
          design={{ ...design, data: portalData }}
          health={health}
          apiState={apiState}
          initialRole={initialRole}
          currentUser={currentUser}
          reloadRoleData={loadRoleData}
          onLogout={handleProductionLogout}
        />
      </Suspense>
    </ChunkErrorBoundary>
  )
}
