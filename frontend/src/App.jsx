import React, { Suspense, useCallback, useEffect, useState } from 'react'
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
} from './api.js'
import {
  mapAdminPortalData,
  mapClientPortalData,
  mapTrainerPortalData,
} from './mappers.js'
import { LoginScreen } from './app/Auth.jsx'
import { ROLE_META } from './app/runtime.jsx'
import { useLocale } from './i18n.jsx'

const LazyAppShell = React.lazy(() => import('./app/AppShell.jsx').then(
  (module) => ({ default: module.AppShell }),
))

const EMPTY_PORTAL_DATA = {
  AdminData: { trainers: [], groups: [], subscriptionTypes: [], clients: [], sessions: [], roster: [], payments: [], debtors: [] },
  TrainerData: { sessions: [], roster: [], groups: [] },
  ParentData: { account: {}, children: [], profileParticipants: [], consents: [], schedule: {}, ledger: {}, attendance: {}, charges: [], payments: [], notifications: [] },
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
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card card-pad" role="alert">
          <h1>Экран роли не загрузился</h1>
          <p>Повторите загрузку страницы. Автоматические повторы отключены.</p>
          <button type="button" onClick={() => window.location.reload()}>Повторить</button>
        </div>
      </div>
    )
  }
}

const STATUS_LABELS = {
  active: 'Активен',
  inactive: 'Неактивен',
  planned: 'Запланировано',
  done: 'Завершено',
  cancelled: 'Отменено',
  present: 'Был',
  absent: 'Не был',
  excused: 'Уважительная причина',
  moved: 'Перенос',
  paid: 'Подтверждён',
  pending: 'На проверке',
  rejected: 'Отклонён',
  overdue: 'Просрочен',
  awaiting: 'Ожидается',
}

function localizedComponents(source) {
  const BaseStatusPill = source.StatusPill
  return {
    ...source,
    StatusPill: (props) => (
      <BaseStatusPill
        {...props}
        label={props.label || STATUS_LABELS[props.status] || props.status}
      />
    ),
  }
}

export default function App() {
  const { setLocale } = useLocale()
  const [design, setDesign] = useState(null)
  const [portalData, setPortalData] = useState(EMPTY_PORTAL_DATA)
  const [health, setHealth] = useState({ state: 'loading' })
  const [apiState, setApiState] = useState({ state: 'loading' })
  const [initialRole, setInitialRole] = useState('admin')
  const [currentUser, setCurrentUser] = useState(null)
  const [authRequired, setAuthRequired] = useState(null)
  const [bootstrapError, setBootstrapError] = useState(null)

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
    setApiState({ state: 'loading', role })
    try {
      let payload
      if (role === 'admin') {
        payload = await fetchAdminPortal()
        applyRoleData(role, mapAdminPortalData(payload))
      } else if (role === 'trainer') {
        payload = await fetchTrainerPortal()
        applyRoleData(role, mapTrainerPortalData(payload))
      } else {
        payload = await fetchClientPortal(options)
        applyRoleData(role, mapClientPortalData(payload))
        setLocale(payload.profile?.account?.preferred_language || payload.overview?.account?.preferred_language || 'ru')
      }
      const failures = Object.entries(payload.resourceStates || {})
        .filter(([, state]) => state.state === 'error')
        .map(([resource, state]) => ({ resource, status: state.status }))
      setApiState({ state: failures.length ? 'partial' : 'ok', role, failures })
      window.dispatchEvent(new CustomEvent('swimcrm:list-invalidate', { detail: { role } }))
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        setPortalData(EMPTY_PORTAL_DATA)
        window.history.replaceState({}, '', window.location.pathname)
        setAuthRequired(true)
      }
      setApiState({ state: 'error', role, error: error.message, status: error.status })
    }
  }, [applyRoleData, setLocale])

  const handleProductionLogin = useCallback(async (credentials) => {
    setApiState({ state: 'loading', role: 'unknown' })
    const payload = await productionLogin(credentials)
    const role = payload.user?.role === 'parent' ? 'client' : payload.user?.role
    if (!ROLE_META[role]) throw new Error('Для этой роли интерфейс пока не настроен')
    setCurrentUser(payload.user)
    setInitialRole(role)
    await loadRoleData(role)
    setAuthRequired(false)
  }, [loadRoleData])

  const handleProductionLogout = useCallback(async () => {
    setApiState({ state: 'loading', role: initialRole })
    try {
      await productionLogout()
    } finally {
      setPortalData(EMPTY_PORTAL_DATA)
      setCurrentUser(null)
      window.history.replaceState({}, '', window.location.pathname)
      setAuthRequired(true)
      setApiState({ state: 'error', role: 'unknown', error: 'Требуется вход', status: 403 })
    }
  }, [initialRole])

  useEffect(() => {
    let alive = true
    globalThis.React = React
    import('./design/_ds_bundle.js').then(async () => {
      const nextDesign = {
        components: localizedComponents(globalThis.SwimCRMDesignSystem_546643),
        icons: globalThis.SwimIcons,
      }
      if (alive) setDesign(nextDesign)

      try {
        const me = await fetchMe()
        const role = me.role === 'parent' ? 'client' : me.role
        if (alive && ROLE_META[role]) {
          setCurrentUser(me)
          setInitialRole(role)
          await loadRoleData(role)
          setAuthRequired(false)
        }
      } catch (error) {
        if (alive) {
          setAuthRequired(error.status === 403 || error.status === 401)
          setApiState({ state: 'error', role: 'unknown', error: error.message, status: error.status })
        }
      }
    }).catch((error) => {
      if (alive) {
        setBootstrapError(error)
        setAuthRequired(false)
      }
    })
    return () => {
      alive = false
    }
  }, [loadRoleData])

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
          <h1>Не удалось загрузить интерфейс</h1>
          <p>Обновите локальную страницу. Повтор не выполняется автоматически.</p>
          <button type="button" onClick={() => window.location.reload()}>Повторить загрузку</button>
        </div>
      </div>
    )
  }

  if (!design || authRequired === null) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card card-pad">Загружаю рабочие данные...</div>
      </div>
    )
  }

  if (authRequired) {
    return <LoginScreen design={design} apiState={apiState} onLogin={handleProductionLogin} />
  }

  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<div className="card card-pad" role="status">Загружаю экран роли...</div>}>
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
