import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { ROLE_META, roleNav, screenFor } from './runtime.jsx'
import { useLocale } from '../i18n.jsx'
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
  }
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
  }
  Object.entries(values).forEach(([key, value]) => {
    if (value) query.set(key, value)
  })
  return `${window.location.pathname}?${query}`
}

export function AppShell({ design, health, apiState, initialRole, currentUser, reloadRoleData, onLogout }) {
  const { t } = useLocale()
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
  const [searchQuery, setSearchQuery] = useState('')
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

  const { components, icons, data } = design
  const roleDataRefs = useRef({ AdminData: {}, TrainerData: {}, ParentData: {} })
  Object.assign(roleDataRefs.current.AdminData, data.AdminData)
  Object.assign(roleDataRefs.current.TrainerData, data.TrainerData)
  Object.assign(roleDataRefs.current.ParentData, data.ParentData)
  const { IconButton } = components
  const meta = ROLE_META[role]
  const userName = currentUser?.full_name?.trim() || currentUser?.username?.trim() || meta.user
  const drawerRef = useRef(null)
  const searchOverlayRef = useRef(null)
  const navigationGuardRef = useRef(null)
  const logoutPendingRef = useRef(false)
  const bypassNextPopRef = useRef(false)
  const currentUrlRef = useRef(window.location.href)
  const currentHistoryStateRef = useRef(window.history.state || {})
  const sidebarKey = sidebarStateKey(role, currentUser)
  const nav = useMemo(() => roleNav(role, icons, data, adminListCounts), [role, icons, data, adminListCounts])
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
  const searchResults = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase('ru-RU')
    if (!needle || role !== 'admin') return []
    const clients = (data.AdminData?.clients || []).filter((row) => [row.first, row.last, `${row.first} ${row.last}`, `${row.last} ${row.first}`, row.phone, row.email, row.group].some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(needle))).slice(0, 6).map((row) => ({ key: `client-${row.studentId}`, label: `${row.first} ${row.last}`, hint: row.phone || row.email || row.group, view: 'clientDetail', params: { clientId: row.clientId } }))
    const groups = (data.AdminData?.groups || []).filter((row) => row.name.toLocaleLowerCase('ru-RU').includes(needle)).slice(0, 3).map((row) => ({ key: `group-${row.groupId}`, label: row.name, hint: 'Группа', view: 'groups', params: { groupId: row.groupId } }))
    return [...clients, ...groups].slice(0, 10)
  }, [searchQuery, role, data])

  useEffect(() => {
    if (role !== 'admin') return undefined
    let alive = true
    let requestController = null
    const loadCounts = () => {
      requestController?.abort()
      const controller = new AbortController()
      requestController = controller
      Promise.allSettled([
        api.get('/api/admin/payments/?page=1&page_size=1&status=pending&order=-date', { signal: controller.signal }),
        api.get('/api/admin/debtors/?page=1&page_size=1&order=-balance', { signal: controller.signal }),
      ]).then(([paymentsResult, debtorsResult]) => {
        if (!alive || controller.signal.aborted || requestController !== controller) return
        setAdminListCounts((current) => ({
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
    writeRoute(view, { clientId: selectedClientId, sessionId: selectedSessionId, trainerSessionId: selectedTrainerSessionId, groupId: selectedGroupId, tab: selectedTab, participantId: selectedParticipantId, balanceAmount: selectedBalanceAmount, kid: nextKid }, true)
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
              <div className="ops-brand-sub">операционная панель</div>
            </div>
          </button>
          {isMobile && (
            <div className="ops-mobile-head-actions">
              {role === 'admin' && (
                <button
                  type="button"
                  className="ops-mobile-search-button"
                  aria-label="Открыть глобальный поиск"
                  aria-controls="ops-mobile-search"
                  aria-expanded={mobileSearchOpen}
                  onClick={() => setMobileSearchOpen(true)}
                >
                  <icons.Search size={19} />
                </button>
              )}
              <button
                type="button"
                className="ops-mobile-menu-button"
                aria-label="Открыть меню"
                aria-controls="ops-mobile-drawer"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(true)}
              >
                <span aria-hidden="true"><i /><i /><i /><i /></span>
              </button>
            </div>
          )}
        </div>

        <nav className="ops-nav" aria-label="Основная навигация">
          {nav.map((item) => {
            const section = item.section || 'Главное'
            const showSection = section !== sidebarLastSection
            sidebarLastSection = section
            return (
              <React.Fragment key={item.key}>
                {showSection && <div className="ops-nav-section">{section}</div>}
                <button
                  type="button"
                  className={`ops-nav-button${navActiveKey === item.key ? ' is-active' : ''}`}
                  aria-current={navActiveKey === item.key ? 'page' : undefined}
                  onClick={() => navigate(item.key)}
                  title={item.label}
                >
                  <span>{item.icon}</span>
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
          <div className="ops-user">
            <div className="ops-avatar">{initials(userName)}</div>
            <div>
              <div className="ops-user-name">{userName}</div>
            </div>
          </div>
          <IconButton className="ops-sidebar-logout is-desktop" label="Выйти" disabled={logoutPending} onClick={logout}><icons.Logout size={16} /></IconButton>
          <button
            type="button"
            className="ops-sidebar-toggle"
            aria-label={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <icons.ChevronR size={17} /> : <icons.ChevronL size={17} />}
            <span>{sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}</span>
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
            aria-label="Меню"
            tabIndex={-1}
          >
            <div className="ops-mobile-drawer-head">
              <strong>Меню</strong>
              <button type="button" className="ops-mobile-drawer-close" aria-label="Закрыть меню" onClick={() => drawerLifecycle.requestClose('close-button')}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <nav className="ops-mobile-drawer-nav" aria-label="Навигация в меню">
              {nav.map((item) => {
                const section = item.section || 'Главное'
                const showSection = section !== drawerLastSection
                drawerLastSection = section
                return (
                  <React.Fragment key={`drawer-${item.key}`}>
                    {showSection && <div className="ops-nav-section">{section}</div>}
                    <button
                      type="button"
                      className={`ops-nav-button${navActiveKey === item.key ? ' is-active' : ''}`}
                      aria-current={navActiveKey === item.key ? 'page' : undefined}
                      onClick={() => navigate(item.key)}
                      title={item.label}
                    >
                      <span>{item.icon}</span>
                      <span>{t(`nav.${role}.${item.key}`, item.label)}</span>
                      {item.count != null && (
                        <span className={`ops-nav-count${item.countTone === 'danger' ? ' is-danger' : ''}`}>{item.count}</span>
                      )}
                    </button>
                  </React.Fragment>
                )
              })}
            </nav>
            <div className="ops-mobile-drawer-user-wrap">
              <div className="ops-user">
                <div className="ops-avatar">{initials(userName)}</div>
                <div className="ops-user-name">{userName}</div>
              </div>
              <IconButton className="ops-sidebar-logout" label="Выйти" disabled={logoutPending} onClick={logout}><icons.Logout size={16} /></IconButton>
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
            <header>
              <h2 id="ops-mobile-search-title">Поиск клиентов и групп</h2>
              <button type="button" aria-label="Закрыть поиск" onClick={() => searchLifecycle.requestClose('close-button')}>×</button>
            </header>
            <label>
              <span className="sr-only">Глобальный поиск</span>
              <input
                autoComplete="off"
                aria-label="Глобальный поиск"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Найти клиента или группу"
              />
            </label>
            <div className="ops-mobile-search-results" aria-live="polite">
              {searchQuery && searchResults.map((result) => (
                <button type="button" key={result.key} onClick={() => navigate(result.view, result.params)}>
                  <strong>{result.label}</strong>
                  <span>{result.hint}</span>
                </button>
              ))}
              {searchQuery && !searchResults.length && <div className="empty">Ничего не найдено</div>}
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
            <h2 id="ops-navigation-guard-title">Есть несохранённые изменения</h2>
            <p id="ops-navigation-guard-description">Если уйти со страницы, внесённые изменения будут потеряны.</p>
            <div>
              <button type="button" className="ops-navigation-stay" onClick={() => navigationGuardLifecycle.requestClose('stay')}>Остаться</button>
              <button type="button" className="is-danger" onClick={confirmPendingNavigation}>Уйти без сохранения</button>
            </div>
          </section>
        </div>
      )}

      <div className="ops-main">
        {role === 'admin' && !isMobile && (
          <header className="topbar ops-topbar">
            <div className="ops-global-search"><input aria-label="Глобальный поиск" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Найти клиента или группу" />{searchQuery && <div className="ops-search-results">{searchResults.map((result) => <button type="button" key={result.key} onClick={() => navigate(result.view, result.params)}><strong>{result.label}</strong><span>{result.hint}</span></button>)}{!searchResults.length && <div className="empty">Ничего не найдено</div>}</div>}</div>
            <div className="ops-topbar-statuses">
              <span className={`ops-status${health.state === 'ok' ? '' : ' is-bad'}`}>Сервер</span>
              <span className={`ops-status${apiState.state === 'ok' ? '' : ' is-bad'}`}>Данные</span>
            </div>
          </header>
        )}

        <main className="scroll" id="main-content" tabIndex={-1}>
          {apiState.state === 'loading' && <div className="ops-api-state" role="status"><strong>Загружаю рабочие данные...</strong><span>Экран обновится автоматически.</span></div>}
          {apiState.state === 'partial' && <div className="ops-api-state is-error" role="status"><span><strong>{t('shell.partial')}</strong><small>Доступные разделы сохранены.</small></span><button type="button" onClick={() => reloadRoleData?.(role)}>{t('shell.retry')}</button></div>}
          {apiState.state === 'error' && <div className="ops-api-state is-error" role="alert"><span><strong>{t('shell.failed')}</strong><small>{apiState.error || 'Проверьте соединение с сервером.'}</small></span><button type="button" onClick={() => reloadRoleData?.(role)}>{t('shell.retry')}</button></div>}
          {roleScreenBundle.error ? (
            <div className="page">
              <div className="card card-pad" role="alert">
                <strong>{t('shell.failed')}</strong>
                <button type="button" onClick={() => window.location.reload()}>{t('shell.retry')}</button>
              </div>
            </div>
          ) : Screen ? (
            <Screen go={navigate} back={contextBack} kid={activeKid} setKid={changeKid} clientId={selectedClientId} sessionId={selectedSessionId} trainerSessionId={selectedTrainerSessionId} groupId={selectedGroupId} initialTab={selectedTab} initialParticipantId={selectedParticipantId} prefillAmount={selectedBalanceAmount} currentUser={currentUser} />
          ) : (
            <div className="page">
              <div className="card card-pad">Экран пока не подключен.</div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
