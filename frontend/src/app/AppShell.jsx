import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { mapAdminClientRows } from '../mappers.js'
import { ROLE_META, roleNav, screenFor } from './runtime.jsx'
import { SUPPORTED_LOCALES, useLocale } from '../i18n.jsx'
import { uiLocaleTag } from '../localeContracts.js'
import {
  clearSessionUiState,
  hasUnsavedChanges,
  readSessionBoolean,
  useOverlayLayer,
  writeSessionBoolean,
} from './uiLifecycle.jsx'

const ROLE_SCREEN_LOADERS = {
  admin: () => import('./screens/AdminScreens.jsx'),
  trainer: () => import('./screens/TrainerScreens.jsx'),
  client: () => import('./screens/ClientScreens.jsx'),
}

function activeMobileKey(role, view) {
  if (role === 'admin' && view === 'clientDetail') return 'clients'
  if (role === 'admin' && view === 'attendance') return 'schedule'
  if (role === 'admin' && view === 'reports') return 'settings'
  return view
}

function initials(name) {
  return String(name || 'H2O')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'H2O'
}

function routeState() {
  const params = new URLSearchParams(window.location.search)
  return {
    role: params.get('role'), view: params.get('view'), clientId: params.get('client'),
    sessionId: params.get('session'), trainerSessionId: params.get('trainerSession'),
    groupId: params.get('group'), tab: params.get('tab'), kid: params.get('kid'),
    participantId: params.get('participant'), balanceAmount: params.get('amount'),
    createClient: params.get('createClient'), createSession: params.get('createSession'), financeAction: params.get('financeAction'),
    subscriptionId: params.get('subscription'),
  }
}

function LocaleSelector({ compact = false, dark = false, locale, setLocale, t }) {
  return (
    <label style={{ display: 'grid', gap: 3, minWidth: 0 }}>
      <span className="sr-only">{t('locale.label')}</span>
      <select
        aria-label={t('locale.label')}
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
        style={{ width: '100%', minHeight: 42, padding: '0 12px', border: dark ? '1px solid rgba(255,255,255,0.16)' : '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: dark ? '#18263a' : 'var(--surface-card)', color: dark ? '#f4f8ff' : 'var(--text-strong)', font: 'inherit', fontFamily: 'var(--font-sans)', fontWeight: 'var(--fw-medium)', colorScheme: dark ? 'dark' : 'normal' }}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>{compact ? code.toUpperCase() : t(`locale.${code}`)}</option>
        ))}
      </select>
    </label>
  )
}

function allowedView(role, view) {
  return Boolean(view && ROLE_META[role]?.titles?.[view])
}

function routeForRole(role, route = routeState()) {
  const sameRole = route.role === role
  return {
    ...route,
    role,
    view: sameRole && allowedView(role, route.view) ? route.view : ROLE_META[role].initialView,
    clientId: sameRole ? route.clientId : null,
    sessionId: sameRole ? route.sessionId : null,
    trainerSessionId: sameRole ? route.trainerSessionId : null,
    groupId: sameRole ? route.groupId : null,
    tab: sameRole ? route.tab : null,
    kid: sameRole ? route.kid : null,
    participantId: sameRole ? route.participantId : null,
    balanceAmount: sameRole ? route.balanceAmount : null,
    createClient: sameRole ? route.createClient : null,
    createSession: sameRole ? route.createSession : null,
    financeAction: sameRole ? route.financeAction : null,
    subscriptionId: sameRole ? route.subscriptionId : null,
  }
}

function defaultSidebarCollapsed() {
  return window.innerWidth >= 768 && window.innerWidth < 960
}

function sidebarStateKey(role, user) {
  return `sidebar.${role}.${user?.id || user?.username || 'session'}.collapsed`
}

function routeUrl(role, view, params = {}) {
  const query = new URLSearchParams({ role, view })
  const values = {
    client: params.clientId,
    session: params.sessionId,
    trainerSession: params.trainerSessionId,
    group: params.groupId,
    tab: params.tab,
    kid: role === 'client' ? params.kid : null,
    participant: role === 'admin' ? params.participantId : null,
    amount: role === 'admin' ? params.balanceAmount : null,
    createClient: role === 'admin' ? params.createClient : null,
    createSession: role === 'admin' ? params.createSession : null,
    financeAction: role === 'admin' ? params.financeAction : null,
    subscription: role === 'admin' ? params.subscriptionId : null,
  }
  Object.entries(values).forEach(([key, value]) => {
    if (value) query.set(key, value)
  })
  return `${window.location.pathname}?${query}`
}

export function AppShell({ design, health, apiState, initialRole, currentUser, reloadRoleData, onLogout }) {
  const { locale, setLocale, t } = useLocale()
  const initialRoute = routeForRole(initialRole || 'admin')
  const [role, setRole] = useState(initialRole || 'admin')
  const [view, setView] = useState(initialRoute.view)
  const [kid, setKid] = useState(initialRoute.kid || 'k1')
  const [selectedClientId, setSelectedClientId] = useState(initialRoute.clientId)
  const [selectedSessionId, setSelectedSessionId] = useState(initialRoute.sessionId)
  const [selectedTrainerSessionId, setSelectedTrainerSessionId] = useState(initialRoute.trainerSessionId)
  const [selectedGroupId, setSelectedGroupId] = useState(initialRoute.groupId)
  const [selectedTab, setSelectedTab] = useState(initialRoute.tab)
  const [selectedParticipantId, setSelectedParticipantId] = useState(initialRoute.participantId)
  const [selectedBalanceAmount, setSelectedBalanceAmount] = useState(initialRoute.balanceAmount)
  const [selectedCreateClient, setSelectedCreateClient] = useState(initialRoute.createClient)
  const [selectedCreateSession, setSelectedCreateSession] = useState(initialRoute.createSession)
  const [selectedFinanceAction, setSelectedFinanceAction] = useState(initialRoute.financeAction)
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState(initialRoute.subscriptionId)
  const [searchQuery, setSearchQuery] = useState('')
  const [remoteClientSearch, setRemoteClientSearch] = useState({ query: '', rows: [] })
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    readSessionBoolean(sidebarStateKey(initialRole || 'admin', currentUser)) ?? defaultSidebarCollapsed()
  ))
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState(null)
  const [logoutPending, setLogoutPending] = useState(false)
  const [adminListCounts, setAdminListCounts] = useState({})
  const [roleScreenBundle, setRoleScreenBundle] = useState({
    role: null,
    module: null,
    error: null,
  })
  const previousLocaleRef = useRef(locale)
  useEffect(() => {
    if (previousLocaleRef.current === locale) return
    previousLocaleRef.current = locale
    void reloadRoleData?.(role)
  }, [locale, reloadRoleData, role])

  const { components, icons, data } = design
  const roleDataRefs = useRef({ AdminData: {}, TrainerData: {}, ParentData: {} })
  Object.assign(roleDataRefs.current.AdminData, data.AdminData)
  Object.assign(roleDataRefs.current.TrainerData, data.TrainerData)
  Object.assign(roleDataRefs.current.ParentData, data.ParentData)
  const { IconButton } = components
  const meta = ROLE_META[role]
  const userName = currentUser?.full_name?.trim() || currentUser?.username?.trim() || t(meta.userKey)
  const drawerRef = useRef(null)
  const searchOverlayRef = useRef(null)
  const navigationGuardRef = useRef(null)
  const logoutPendingRef = useRef(false)
  const bypassNextPopRef = useRef(false)
  const currentUrlRef = useRef(window.location.href)
  const currentHistoryStateRef = useRef(window.history.state || {})
  const sidebarKey = sidebarStateKey(role, currentUser)
  const nav = useMemo(() => roleNav(role, icons, data, adminListCounts, t), [role, icons, data, adminListCounts, t])
  const runtimeScreens = useMemo(() => {
    if (roleScreenBundle.role !== role || !roleScreenBundle.module) return {}
    const factories = roleScreenBundle.module
    if (role === 'admin') {
      return {
        AdminScreens: {
          Overview: factories.createAdminOverviewScreen(components, icons, roleDataRefs.current.AdminData),
          Clients: factories.createAdminClientsScreen(components, reloadRoleData, roleDataRefs.current.AdminData),
          ClientDetail: factories.createAdminClientDetailScreen(components, icons, reloadRoleData, roleDataRefs.current.AdminData),
          Trainers: factories.createAdminTrainersScreen(components, reloadRoleData, roleDataRefs.current.AdminData),
          Groups: factories.createAdminGroupsScreen(components, reloadRoleData, roleDataRefs.current.AdminData),
          Schedule: factories.createAdminScheduleScreen(components, icons, reloadRoleData, roleDataRefs.current.AdminData),
          Attendance: factories.createAdminAttendanceScreen(components, icons, reloadRoleData, roleDataRefs.current.AdminData),
          Subscriptions: factories.createAdminSubscriptionsScreen(components, roleDataRefs.current.AdminData),
          Payments: factories.createAdminPaymentsScreen(components, icons, reloadRoleData, roleDataRefs.current.AdminData),
          Debtors: factories.createAdminDebtorsScreen(components, icons, reloadRoleData, roleDataRefs.current.AdminData),
          Settings: factories.createAdminSettingsScreen(components, reloadRoleData, icons, roleDataRefs.current.AdminData),
        },
      }
    }
    if (role === 'trainer') {
      return {
        TrainerScreens: {
          Sessions: factories.createTrainerSessionsScreen(components, icons, roleDataRefs.current.TrainerData),
          Session: factories.createTrainerSessionScreen(components, icons, reloadRoleData, roleDataRefs.current.TrainerData),
          Groups: factories.createTrainerGroupsScreen(components, icons, roleDataRefs.current.TrainerData),
          History: factories.createTrainerHistoryScreen(components, icons, roleDataRefs.current.TrainerData),
        },
      }
    }
    return {
      ParentScreens: {
        ...factories.createClientScreens(components, icons, reloadRoleData, roleDataRefs.current.ParentData),
      },
    }
  }, [components, icons, reloadRoleData, role, roleScreenBundle])
  const Screen = screenFor(role, view, runtimeScreens)
  const clientItems = data.ParentData?.children || []
  const activeKid = role === 'client' && !clientItems.some((item) => item.id === kid)
    ? clientItems[0]?.id || kid
    : kid
  useEffect(() => {
    const query = searchQuery.trim()
    if (role !== 'admin' || !query) {
      setRemoteClientSearch({ query: '', rows: [] })
      return undefined
    }
    let alive = true
    const controller = new AbortController()
    const handle = setTimeout(async () => {
      try {
        const payload = await api.get(`/api/admin/reference/?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (alive) {
          setRemoteClientSearch({
            query: query.toLocaleLowerCase(uiLocaleTag(locale)),
            rows: mapAdminClientRows(payload.participants || []).active,
          })
        }
      } catch {
        if (alive && !controller.signal.aborted) {
          setRemoteClientSearch({ query: query.toLocaleLowerCase(uiLocaleTag(locale)), rows: [] })
        }
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(handle)
      controller.abort()
    }
  }, [searchQuery, role, locale])

  const searchResults = useMemo(() => {
    const localeTag = uiLocaleTag(locale)
    const needle = searchQuery.trim().toLocaleLowerCase(localeTag)
    if (!needle || role !== 'admin') return []
    const hasCurrentRemoteResults = remoteClientSearch.query === needle
    const clientSource = hasCurrentRemoteResults
      ? remoteClientSearch.rows
      : (data.AdminData?.clients || [])
    const matchingClients = hasCurrentRemoteResults
      ? clientSource
      : clientSource.filter((row) => [row.first, row.last, `${row.first} ${row.last}`, `${row.last} ${row.first}`, row.phone, row.email, row.group].some((value) => String(value || '').toLocaleLowerCase(localeTag).includes(needle)))
    const clients = matchingClients.map((row) => ({ key: `client-${row.studentId}`, label: `${row.first} ${row.last}`, hint: row.phone || row.email || row.group, view: 'clientDetail', params: { clientId: row.clientId } }))
    const groups = (data.AdminData?.groups || []).filter((row) => row.name.toLocaleLowerCase(localeTag).includes(needle)).map((row) => ({ key: `group-${row.groupId}`, label: row.name, hint: t('shell.groupHint'), view: 'groups', params: { groupId: row.groupId } }))
    return [...clients, ...groups]
  }, [searchQuery, role, data, remoteClientSearch, locale, t])

  useEffect(() => {
    if (role !== 'admin') return undefined
    let alive = true
    let requestController = null
    const loadCounts = () => {
      requestController?.abort()
      const controller = new AbortController()
      requestController = controller
      Promise.allSettled([
        api.get('/api/admin/clients/?page=1&page_size=1&active=true', { signal: controller.signal }),
        api.get('/api/admin/payments/?page=1&page_size=1&status=pending&order=-date', { signal: controller.signal }),
        api.get('/api/admin/debtors/?page=1&page_size=1&order=-balance', { signal: controller.signal }),
      ]).then(([clientsResult, paymentsResult, debtorsResult]) => {
        if (!alive || controller.signal.aborted || requestController !== controller) return
        setAdminListCounts((current) => ({
          clients: clientsResult.status === 'fulfilled'
            ? (clientsResult.value.pagination?.total ?? current.clients)
            : current.clients,
          pendingPayments: paymentsResult.status === 'fulfilled'
            ? (paymentsResult.value.pagination?.total
              ?? (paymentsResult.value.payments || []).filter((payment) => payment.status === 'pending').length)
            : current.pendingPayments,
          debtors: debtorsResult.status === 'fulfilled'
            ? (debtorsResult.value.pagination?.total ?? (debtorsResult.value.debtors || []).length)
            : current.debtors,
        }))
      })
    }
    loadCounts()
    window.addEventListener('swimcrm:list-invalidate', loadCounts)
    return () => {
      alive = false
      requestController?.abort()
      window.removeEventListener('swimcrm:list-invalidate', loadCounts)
    }
  }, [role])

  useEffect(() => {
    const mobileMedia = window.matchMedia('(max-width: 767px)')
    const compactDesktopMedia = window.matchMedia('(min-width: 768px) and (max-width: 959px)')
    const update = () => {
      setIsMobile(mobileMedia.matches)
      if (mobileMedia.matches) return
      const stored = readSessionBoolean(sidebarKey)
      setSidebarCollapsed(stored ?? compactDesktopMedia.matches)
      setMobileMenuOpen(false)
      setMobileSearchOpen(false)
    }
    update()
    mobileMedia.addEventListener('change', update)
    compactDesktopMedia.addEventListener('change', update)
    return () => {
      mobileMedia.removeEventListener('change', update)
      compactDesktopMedia.removeEventListener('change', update)
    }
  }, [sidebarKey])

  function closeMobileMenu() {
    setMobileMenuOpen(false)
    return true
  }

  function closeMobileSearch() {
    setMobileSearchOpen(false)
    return true
  }

  function closeNavigationGuard() {
    setPendingNavigation(null)
    return true
  }

  const drawerLifecycle = useOverlayLayer({
    open: isMobile && mobileMenuOpen,
    id: 'ops-mobile-drawer-layer',
    elementRef: drawerRef,
    onRequestClose: closeMobileMenu,
  })
  const searchLifecycle = useOverlayLayer({
    open: isMobile && mobileSearchOpen,
    id: 'ops-mobile-search-layer',
    elementRef: searchOverlayRef,
    onRequestClose: closeMobileSearch,
    initialFocus: 'input',
  })
  const navigationGuardLifecycle = useOverlayLayer({
    open: Boolean(pendingNavigation),
    id: 'ops-navigation-guard-layer',
    elementRef: navigationGuardRef,
    onRequestClose: closeNavigationGuard,
    initialFocus: '.ops-navigation-stay',
  })

  useEffect(() => {
    if (!initialRole) return
    const route = routeForRole(initialRole)
    setRole(initialRole)
    setMobileMenuOpen(false)
    setMobileSearchOpen(false)
    setView(route.view)
    setSelectedClientId(route.clientId)
    setSelectedSessionId(route.sessionId)
    setSelectedTrainerSessionId(route.trainerSessionId)
    setSelectedGroupId(route.groupId)
    setSelectedTab(route.tab)
    setSelectedParticipantId(route.participantId)
    setSelectedBalanceAmount(route.balanceAmount)
    setSelectedCreateClient(route.createClient)
    setSelectedCreateSession(route.createSession)
    setSelectedFinanceAction(route.financeAction)
    setSelectedSubscriptionId(route.subscriptionId)
    if (route.kid) setKid(route.kid)
    const canonicalUrl = routeUrl(initialRole, route.view, route)
    const historyState = { ...currentHistoryStateRef.current, swimcrm: true }
    window.history.replaceState(historyState, '', canonicalUrl)
    currentHistoryStateRef.current = historyState
    currentUrlRef.current = window.location.href
  }, [initialRole])

  useEffect(() => {
    let active = true
    setRoleScreenBundle({ role, module: null, error: null })
    ROLE_SCREEN_LOADERS[role]().then((module) => {
      if (active) setRoleScreenBundle({ role, module, error: null })
    }).catch((error) => {
      if (active) setRoleScreenBundle({ role, module: null, error })
    })
    return () => {
      active = false
    }
  }, [role])

  useEffect(() => {
    const onPopState = (event) => {
      const rawRoute = routeState()
      const route = routeForRole(role, rawRoute)
      if (rawRoute.role && rawRoute.role !== role) {
        const canonicalUrl = routeUrl(role, ROLE_META[role].initialView)
        const historyState = { swimcrm: true }
        window.history.replaceState(historyState, '', canonicalUrl)
        currentHistoryStateRef.current = historyState
        currentUrlRef.current = window.location.href
        applyRoute(routeForRole(role), { scrollToTop: true })
        return
      }
      if (bypassNextPopRef.current) {
        bypassNextPopRef.current = false
        currentHistoryStateRef.current = event.state || {}
        currentUrlRef.current = window.location.href
        applyRoute(route, { scrollToTop: true })
        return
      }
      if (hasUnsavedChanges()) {
        const targetUrl = window.location.href
        window.history.pushState(currentHistoryStateRef.current, '', currentUrlRef.current)
        setPendingNavigation({ kind: 'history', targetUrl })
        return
      }
      currentHistoryStateRef.current = event.state || {}
      currentUrlRef.current = window.location.href
      applyRoute(route, { scrollToTop: true })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [role])

  function applyRoute(route, { scrollToTop = false } = {}) {
      setMobileMenuOpen(false)
      setMobileSearchOpen(false)
      setView(route.view)
      setSelectedClientId(route.clientId || null)
      setSelectedSessionId(route.sessionId || null)
      setSelectedTrainerSessionId(route.trainerSessionId || null)
      setSelectedGroupId(route.groupId || null)
      setSelectedTab(route.tab || null)
      setSelectedParticipantId(route.participantId || null)
      setSelectedBalanceAmount(route.balanceAmount || null)
      setSelectedCreateClient(route.createClient || null)
      setSelectedCreateSession(route.createSession || null)
      setSelectedFinanceAction(route.financeAction || null)
      setSelectedSubscriptionId(route.subscriptionId || null)
      if (route.kid) setKid(route.kid)
      setSearchQuery('')
      if (scrollToTop) window.requestAnimationFrame(() => window.scrollTo(0, 0))
  }

  function writeRoute(nextView, params = {}, replace = false) {
    const nextUrl = routeUrl(role, nextView, {
      ...params,
      kid: params.kid || activeKid,
    })
    const historyState = replace
      ? { ...currentHistoryStateRef.current, swimcrm: true }
      : { swimcrm: true, swimcrmReturnUrl: currentUrlRef.current }
    window.history[replace ? 'replaceState' : 'pushState'](historyState, '', nextUrl)
    currentHistoryStateRef.current = historyState
    currentUrlRef.current = window.location.href
  }

  function commitNavigation(nextView, params = {}) {
    const safeView = allowedView(role, nextView) ? nextView : ROLE_META[role].initialView
    applyRoute({ role, view: safeView, ...params }, { scrollToTop: true })
    writeRoute(safeView, params)
  }

  function attemptNavigation(nextView, params = {}) {
    const hasParams = Object.values(params).some((value) => value != null && value !== '')
    if (nextView === view && !hasParams) return
    if (hasUnsavedChanges()) {
      setPendingNavigation({ kind: 'route', nextView, params })
      return
    }
    commitNavigation(nextView, params)
  }

  function navigate(nextView, params = {}) {
    const proceed = () => attemptNavigation(nextView, params)
    if (mobileMenuOpen) {
      drawerLifecycle.requestClose('navigate', proceed)
      return
    }
    if (mobileSearchOpen) {
      searchLifecycle.requestClose('navigate', proceed)
      return
    }
    proceed()
  }

  function contextBack(fallbackView, fallbackParams = {}) {
    if (currentHistoryStateRef.current?.swimcrmReturnUrl) {
      window.history.back()
      return
    }
    attemptNavigation(fallbackView, fallbackParams)
  }

  function performLogout() {
    if (logoutPendingRef.current) return
    logoutPendingRef.current = true
    setLogoutPending(true)
    clearSessionUiState()
    setMobileMenuOpen(false)
    setMobileSearchOpen(false)
    Promise.resolve(onLogout?.())
      .catch(() => {})
      .finally(() => {
        logoutPendingRef.current = false
        setLogoutPending(false)
      })
  }

  function logout() {
    const proceed = () => {
      if (hasUnsavedChanges()) setPendingNavigation({ kind: 'logout' })
      else performLogout()
    }
    if (mobileMenuOpen) drawerLifecycle.requestClose('logout', proceed)
    else proceed()
  }

  function confirmPendingNavigation() {
    const pending = pendingNavigation
    if (!pending) return
    navigationGuardLifecycle.requestClose('leave', () => {
      if (pending.kind === 'route') commitNavigation(pending.nextView, pending.params)
      else if (pending.kind === 'logout') performLogout()
      else if (pending.kind === 'history') {
        bypassNextPopRef.current = true
        window.history.back()
      }
    })
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current
      writeSessionBoolean(sidebarKey, next)
      return next
    })
  }

  function changeKid(nextKid) {
    setKid(nextKid)
    const participant = clientItems.find((item) => item.id === nextKid)
    if (participant?.studentId) reloadRoleData?.('client', { studentId: participant.studentId })
    writeRoute(view, { clientId: selectedClientId, sessionId: selectedSessionId, trainerSessionId: selectedTrainerSessionId, groupId: selectedGroupId, tab: selectedTab, participantId: selectedParticipantId, balanceAmount: selectedBalanceAmount, financeAction: selectedFinanceAction, subscriptionId: selectedSubscriptionId, kid: nextKid }, true)
  }

  let sidebarLastSection = null
  let drawerLastSection = null
  const navActiveKey = activeMobileKey(role, view)

  return (
    <div className={`app${sidebarCollapsed && !isMobile ? ' is-sidebar-collapsed' : ''}`}>
      <a className="ops-skip-link" href="#main-content">{t('shell.skip')}</a>
      <aside className="ops-sidebar">
        <div className="ops-sidebar-head">
          <button type="button" className="ops-brand ops-brand-button" onClick={() => navigate(ROLE_META[role].initialView)}>
            <div className="ops-brand-mark">H2O</div>
            <div>
              <div className="ops-brand-name">SwimCRM</div>
              <div className="ops-brand-sub">{t('shell.brandSubtitle')}</div>
            </div>
          </button>
          {isMobile && (
            <div className="ops-mobile-head-actions">
              {role === 'admin' && (
                <button
                  type="button"
                  className="ops-mobile-search-button"
                  aria-label={mobileSearchOpen ? t('shell.closeSearch') : t('shell.openSearch')}
                  aria-controls="ops-mobile-search"
                  aria-expanded={mobileSearchOpen}
                  onClick={() => (mobileSearchOpen ? searchLifecycle.requestClose('header-close') : setMobileSearchOpen(true))}
                >
                  {mobileSearchOpen ? <icons.X size={19} /> : <icons.Search size={19} />}
                </button>
              )}
              <button
                type="button"
                className="ops-mobile-menu-button"
                aria-label={t('shell.openMenu')}
                aria-controls="ops-mobile-drawer"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(true)}
              >
                <span aria-hidden="true"><i /><i /><i /><i /></span>
              </button>
            </div>
          )}
        </div>

        <nav className="ops-nav" aria-label={t('shell.mainNavigation')}>
          {nav.map((item) => {
            const section = item.section || t('shell.mainSection')
            const showSection = section !== sidebarLastSection
            sidebarLastSection = section
            return (
              <React.Fragment key={item.key}>
                {showSection && <div className="ops-nav-section" style={{ margin: '14px 0 6px', padding: '0 10px', color: '#fff', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', lineHeight: 1.2 }}>{section}</div>}
                <button
                  type="button"
                  className={`ops-nav-button${navActiveKey === item.key ? ' is-active' : ''}`}
                  aria-current={navActiveKey === item.key ? 'page' : undefined}
                  onClick={() => navigate(item.key)}
                  title={item.label}
                >
                  <span style={{ display: 'grid', width: 24, height: 24, placeItems: 'center' }}>{item.icon}</span>
                  <span>{t(`nav.${role}.${item.key}`, item.label)}</span>
                  {item.count != null && (
                    <span className={`ops-nav-count${item.countTone === 'danger' ? ' is-danger' : ''}`}>{item.count}</span>
                  )}
                </button>
              </React.Fragment>
            )
          })}
        </nav>

        <div className="ops-user-wrap">
          <div className="ops-sidebar-locale">
            <LocaleSelector compact={sidebarCollapsed} dark locale={locale} setLocale={setLocale} t={t} />
          </div>
          <div className="ops-user-actions">
            <div className="ops-user">
              <div className="ops-avatar" title={userName}>{initials(userName)}</div>
              <div>
                <div className="ops-user-name">{userName}</div>
              </div>
            </div>
            <IconButton className="ops-sidebar-logout is-desktop" label={t('shell.logout')} disabled={logoutPending} onClick={logout}><icons.Logout size={16} /></IconButton>
          </div>
          <button
            type="button"
            className="ops-sidebar-toggle"
            aria-label={sidebarCollapsed ? t('shell.expandMenu') : t('shell.collapseMenu')}
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <icons.ChevronR size={17} /> : <icons.ChevronL size={17} />}
            <span>{sidebarCollapsed ? t('shell.expandMenu') : t('shell.collapseMenu')}</span>
          </button>
        </div>
      </aside>

      {isMobile && mobileMenuOpen && (
        <div
          className="ops-mobile-drawer-layer"
          onClick={(event) => {
            if (event.target === event.currentTarget) drawerLifecycle.requestClose('backdrop')
          }}
        >
          <aside
            ref={drawerRef}
            id="ops-mobile-drawer"
            className="ops-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('shell.menu')}
            tabIndex={-1}
            style={{ background: '#0f1728', color: '#fff', borderLeftColor: 'rgba(255,255,255,0.12)' }}
          >
            <div className="ops-mobile-drawer-head" style={{ background: 'transparent', borderBottomColor: 'rgba(255,255,255,0.12)' }}>
              <strong>{t('shell.menu')}</strong>
              <button type="button" className="ops-mobile-drawer-close" aria-label={t('shell.closeMenu')} onClick={() => drawerLifecycle.requestClose('close-button')} style={{ borderColor: 'rgba(255,255,255,0.16)', background: '#18263a', color: '#fff' }}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <nav className="ops-mobile-drawer-nav" aria-label={t('shell.menuNavigation')} style={{ background: 'transparent' }}>
              {nav.map((item) => {
                const section = item.section || t('shell.mainSection')
                const showSection = section !== drawerLastSection
                drawerLastSection = section
                return (
                  <React.Fragment key={`drawer-${item.key}`}>
                    {showSection && <div className="ops-nav-section" style={{ margin: '14px 0 6px', padding: '0 10px', color: '#fff', fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', lineHeight: 1.2 }}>{section}</div>}
                    <button
                      type="button"
                      className={`ops-nav-button${navActiveKey === item.key ? ' is-active' : ''}`}
                      aria-current={navActiveKey === item.key ? 'page' : undefined}
                      onClick={() => navigate(item.key)}
                      title={item.label}
                      style={{ color: navActiveKey === item.key ? '#fff' : '#cad5e4' }}
                    >
                      <span style={{ display: 'grid', width: 24, height: 24, placeItems: 'center' }}>{item.icon}</span>
                      <span>{t(`nav.${role}.${item.key}`, item.label)}</span>
                      {item.count != null && (
                        <span className={`ops-nav-count${item.countTone === 'danger' ? ' is-danger' : ''}`}>{item.count}</span>
                      )}
                    </button>
                  </React.Fragment>
                )
              })}
            </nav>
            <div className="ops-mobile-drawer-user-wrap" style={{ background: 'transparent', borderTopColor: 'rgba(255,255,255,0.12)', color: '#fff' }}>
              <div className="ops-sidebar-locale">
                <LocaleSelector dark locale={locale} setLocale={setLocale} t={t} />
              </div>
              <div className="ops-user-actions">
                <div className="ops-user">
                  <div className="ops-avatar" title={userName}>{initials(userName)}</div>
                  <div className="ops-user-name">{userName}</div>
                </div>
                <IconButton className="ops-sidebar-logout" label={t('shell.logout')} disabled={logoutPending} onClick={logout}><icons.Logout size={16} /></IconButton>
              </div>
            </div>
          </aside>
        </div>
      )}

      {isMobile && mobileSearchOpen && (
        <div className="ops-mobile-search-layer">
          <section
            ref={searchOverlayRef}
            id="ops-mobile-search"
            className="ops-mobile-search"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ops-mobile-search-title"
            tabIndex={-1}
          >
            <h2 id="ops-mobile-search-title" className="sr-only">{t('shell.searchTitle')}</h2>
            <label>
              <span className="sr-only">{t('shell.globalSearch')}</span>
              <input
                autoComplete="off"
                aria-label={t('shell.globalSearch')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('shell.searchPlaceholder')}
              />
            </label>
            <div className="ops-mobile-search-results" aria-live="polite">
              {searchQuery && searchResults.map((result) => (
                <button type="button" key={result.key} onClick={() => navigate(result.view, result.params)}>
                  <strong>{result.label}</strong>
                  <span>{result.hint}</span>
                </button>
              ))}
              {searchQuery && !searchResults.length && <div className="empty">{t('shell.noResults')}</div>}
            </div>
          </section>
        </div>
      )}

      {pendingNavigation && (
        <div className="ops-navigation-guard-layer" data-backdrop-dismiss="false">
          <section
            ref={navigationGuardRef}
            className="ops-navigation-guard"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ops-navigation-guard-title"
            aria-describedby="ops-navigation-guard-description"
            tabIndex={-1}
          >
            <h2 id="ops-navigation-guard-title">{t('shell.unsavedTitle')}</h2>
            <p id="ops-navigation-guard-description">{t('shell.unsavedDescription')}</p>
            <div>
              <button type="button" className="ops-navigation-stay" onClick={() => navigationGuardLifecycle.requestClose('stay')}>{t('shell.stay')}</button>
              <button type="button" className="is-danger" onClick={confirmPendingNavigation}>{t('shell.leave')}</button>
            </div>
          </section>
        </div>
      )}

      <div className="ops-main">
        {role === 'admin' && !isMobile && (
          <header className="topbar ops-topbar">
            <div className="ops-global-search"><input aria-label={t('shell.globalSearch')} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('shell.searchPlaceholder')} />{searchQuery && <div className="ops-search-results">{searchResults.map((result) => <button type="button" key={result.key} onClick={() => navigate(result.view, result.params)}><strong>{result.label}</strong><span>{result.hint}</span></button>)}{!searchResults.length && <div className="empty">{t('shell.noResults')}</div>}</div>}</div>
            <div className="ops-topbar-statuses">
              <span className={`ops-status${health.state === 'ok' ? '' : ' is-bad'}`}>{t('shell.server')}</span>
              <span className={`ops-status${apiState.state === 'ok' ? '' : ' is-bad'}`}>{t('shell.data')}</span>
            </div>
          </header>
        )}

        <main className="scroll" id="main-content" tabIndex={-1}>
          {apiState.state === 'loading' && <div className="ops-api-state" role="status"><strong>{t('shell.loadingData')}</strong><span>{t('shell.autoRefresh')}</span></div>}
          {apiState.state === 'partial' && <div className="ops-api-state is-error" role="status"><span><strong>{t('shell.partial')}</strong><small>{t('shell.availablePreserved')}</small></span><button type="button" onClick={() => reloadRoleData?.(role)}>{t('shell.retry')}</button></div>}
          {apiState.state === 'error' && <div className="ops-api-state is-error" role="alert"><span><strong>{t('shell.failed')}</strong><small>{apiState.error || t('shell.checkConnection')}</small></span><button type="button" onClick={() => reloadRoleData?.(role)}>{t('shell.retry')}</button></div>}
          {roleScreenBundle.error ? (
            <div className="page">
              <div className="card card-pad" role="alert">
                <strong>{t('shell.failed')}</strong>
                <button type="button" onClick={() => window.location.reload()}>{t('shell.retry')}</button>
              </div>
            </div>
          ) : Screen ? (
            <Screen key={role === 'admin' && view === 'clientDetail' ? `admin-client-${selectedClientId || 'none'}` : `${role}-${view}`} go={navigate} back={contextBack} kid={activeKid} setKid={changeKid} clientId={selectedClientId} sessionId={selectedSessionId} trainerSessionId={selectedTrainerSessionId} groupId={selectedGroupId} initialTab={selectedTab} initialParticipantId={selectedParticipantId} createClient={selectedCreateClient} createSession={selectedCreateSession} initialFinanceAction={selectedFinanceAction} initialSubscriptionId={selectedSubscriptionId} prefillAmount={selectedBalanceAmount} currentUser={currentUser} />
          ) : (
            <div className="page">
              <div className="card card-pad">{t('shell.screenMissing')}</div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
