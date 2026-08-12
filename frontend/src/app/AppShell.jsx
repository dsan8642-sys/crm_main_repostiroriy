import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ROLE_META, roleNav, screenFor } from './runtime.jsx'
import { useLocale } from '../i18n.jsx'

const ROLE_SCREEN_LOADERS = {
  admin: () => import('./screens/AdminScreens.jsx'),
  trainer: () => import('./screens/TrainerScreens.jsx'),
  client: () => import('./screens/ClientScreens.jsx'),
}

const MOBILE_NAV_CONFIG = {
  admin: [
    { key: 'overview', label: 'Главная' },
    { key: 'clients', label: 'Клиенты' },
    { key: 'schedule', label: 'Расписание' },
    { key: 'debtors', label: 'Должники' },
    { key: 'settings', label: 'Ещё' },
  ],
  trainer: [
    { key: 'sessions', label: 'Мои занятия' },
    { key: 'session', label: 'Посещаемость' },
    { key: 'groups', label: 'Группы' },
    { key: 'history', label: 'История' },
  ],
  client: [
    { key: 'home', label: 'Главная' },
    { key: 'schedule', label: 'Расписание' },
    { key: 'payments', label: 'Платежи' },
    { key: 'history', label: 'История' },
    { key: 'profile', label: 'Профиль' },
  ],
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
  }
}

export function AppShell({ design, health, apiState, initialRole, currentUser, reloadRoleData, onLogout }) {
  const { t } = useLocale()
  const initialRoute = routeState()
  const [role, setRole] = useState(initialRole || 'admin')
  const [view, setView] = useState(initialRoute.view || ROLE_META[initialRole || 'admin'].initialView)
  const [kid, setKid] = useState(initialRoute.kid || 'k1')
  const [selectedClientId, setSelectedClientId] = useState(initialRoute.clientId)
  const [selectedSessionId, setSelectedSessionId] = useState(initialRoute.sessionId)
  const [selectedTrainerSessionId, setSelectedTrainerSessionId] = useState(initialRoute.trainerSessionId)
  const [selectedGroupId, setSelectedGroupId] = useState(initialRoute.groupId)
  const [selectedTab, setSelectedTab] = useState(initialRoute.tab)
  const [searchQuery, setSearchQuery] = useState('')
  const [compactSidebar, setCompactSidebar] = useState(() => window.matchMedia('(max-width: 960px)').matches)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)
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
  const menuButtonRef = useRef(null)
  const drawerRef = useRef(null)
  const returnMenuFocusRef = useRef(false)
  const logoutPendingRef = useRef(false)
  const nav = useMemo(() => roleNav(role, icons, data), [role, icons, data])
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
    const sessions = (data.AdminData?.sessions || []).filter((row) => [row.group, row.trainer, row.location, row.date].some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(needle))).slice(0, 4).map((row) => ({ key: `session-${row.sessionId}`, label: `${row.date} · ${row.start} · ${row.group}`, hint: row.location, view: 'attendance', params: { sessionId: row.sessionId } }))
    return [...clients, ...groups, ...sessions].slice(0, 10)
  }, [searchQuery, role, data])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 960px)')
    const update = () => {
      setCompactSidebar(media.matches)
      if (!media.matches) {
        returnMenuFocusRef.current = false
        setMobileMenuOpen(false)
      }
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) {
      if (returnMenuFocusRef.current) {
        returnMenuFocusRef.current = false
        menuButtonRef.current?.focus()
      }
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const drawer = drawerRef.current
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusFirst = () => drawer?.querySelector(focusableSelector)?.focus()
    const frame = window.requestAnimationFrame(focusFirst)

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMobileMenu()
        return
      }
      if (event.key !== 'Tab' || !drawer) return
      const focusable = [...drawer.querySelectorAll(focusableSelector)]
      if (!focusable.length) {
        event.preventDefault()
        drawer.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!initialRole) return
    setRole(initialRole)
    setMobileMenuOpen(false)
    const route = routeState()
    setView(route.role === initialRole && route.view ? route.view : ROLE_META[initialRole].initialView)
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
    const onPopState = () => {
      const route = routeState()
      if (route.role && route.role !== role) return
      returnMenuFocusRef.current = false
      setMobileMenuOpen(false)
      setView(route.view || ROLE_META[role].initialView)
      setSelectedClientId(route.clientId); setSelectedSessionId(route.sessionId)
      setSelectedTrainerSessionId(route.trainerSessionId); setSelectedGroupId(route.groupId)
      setSelectedTab(route.tab); if (route.kid) setKid(route.kid)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [role])

  function writeRoute(nextView, params = {}, replace = false) {
    const query = new URLSearchParams({ role, view: nextView })
    const values = { client: params.clientId, session: params.sessionId, trainerSession: params.trainerSessionId, group: params.groupId, tab: params.tab, kid: params.kid || activeKid }
    Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value) })
    window.history[replace ? 'replaceState' : 'pushState']({}, '', `${window.location.pathname}?${query}`)
  }

  function navigate(nextView, params = {}) {
    if (params.clientId) setSelectedClientId(params.clientId)
    if (params.sessionId) setSelectedSessionId(params.sessionId)
    if (params.trainerSessionId) setSelectedTrainerSessionId(params.trainerSessionId)
    if (params.groupId) setSelectedGroupId(params.groupId)
    setSelectedTab(params.tab || null)
    setView(nextView)
    setSearchQuery('')
    if (mobileMenuOpen) closeMobileMenu()
    else setMobileMenuOpen(false)
    writeRoute(nextView, params)
  }

  function closeMobileMenu({ returnFocus = true } = {}) {
    returnMenuFocusRef.current = returnFocus
    setMobileMenuOpen(false)
  }

  function logout() {
    if (logoutPendingRef.current) return
    logoutPendingRef.current = true
    setLogoutPending(true)
    returnMenuFocusRef.current = false
    setMobileMenuOpen(false)
    Promise.resolve(onLogout?.())
      .catch(() => {})
      .finally(() => {
        logoutPendingRef.current = false
        setLogoutPending(false)
      })
  }

  function changeKid(nextKid) {
    setKid(nextKid)
    const participant = clientItems.find((item) => item.id === nextKid)
    if (participant?.studentId) reloadRoleData?.('client', { studentId: participant.studentId })
    writeRoute(view, { clientId: selectedClientId, sessionId: selectedSessionId, trainerSessionId: selectedTrainerSessionId, groupId: selectedGroupId, tab: selectedTab, kid: nextKid }, true)
  }

  let sidebarLastSection = null
  let drawerLastSection = null
  const mobileNav = MOBILE_NAV_CONFIG[role].map(({ key, label }) => {
    const item = nav.find((candidate) => candidate.key === key)
    return item ? { ...item, mobileLabel: label } : null
  }).filter(Boolean)
  const navActiveKey = activeMobileKey(role, view)

  return (
    <div className="app">
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
          {compactSidebar && (
            <button
              ref={menuButtonRef}
              type="button"
              className="ops-mobile-menu-button"
              aria-label="Открыть меню"
              aria-controls="ops-mobile-drawer"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <span aria-hidden="true"><i /><i /><i /><i /></span>
            </button>
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
          {!compactSidebar && <IconButton className="ops-sidebar-logout is-desktop" label="Выйти" disabled={logoutPending} onClick={logout}><icons.Logout size={16} /></IconButton>}
        </div>
      </aside>

      {compactSidebar && mobileMenuOpen && (
        <div
          className="ops-mobile-drawer-layer"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeMobileMenu()
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
              <button type="button" className="ops-mobile-drawer-close" aria-label="Закрыть меню" onClick={() => closeMobileMenu()}>
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

      <div className="ops-main">
        <header className="topbar ops-topbar">
          {role === 'admin' && <div className="ops-global-search"><input aria-label="Глобальный поиск" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Найти клиента, группу или занятие" />{searchQuery && <div className="ops-search-results">{searchResults.map((result) => <button type="button" key={result.key} onClick={() => navigate(result.view, result.params)}><strong>{result.label}</strong><span>{result.hint}</span></button>)}{!searchResults.length && <div className="empty">Ничего не найдено</div>}</div>}</div>}
          <div className="ops-topbar-statuses">
            <span className={`ops-status${health.state === 'ok' ? '' : ' is-bad'}`}>Сервер</span>
            <span className={`ops-status${apiState.state === 'ok' ? '' : ' is-bad'}`}>Данные</span>
          </div>
        </header>

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
            <Screen go={navigate} kid={activeKid} setKid={changeKid} clientId={selectedClientId} sessionId={selectedSessionId} trainerSessionId={selectedTrainerSessionId} groupId={selectedGroupId} initialTab={selectedTab} />
          ) : (
            <div className="page">
              <div className="card card-pad">Экран пока не подключен.</div>
            </div>
          )}
        </main>
        <nav
          className="ops-mobile-nav"
          aria-label="Основная мобильная навигация"
          style={{ '--ops-mobile-nav-count': mobileNav.length }}
        >
          {mobileNav.map((item) => (
            <button
              key={`mobile-${item.key}`}
              type="button"
              aria-current={navActiveKey === item.key ? 'page' : undefined}
              className={navActiveKey === item.key ? 'is-active' : ''}
              onClick={() => navigate(item.key)}
            >
              <span>{item.icon}</span>
              <small>{item.mobileLabel}</small>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
