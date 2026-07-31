import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ROLE_META, roleNav, screenFor } from './runtime.jsx'
import { useLocale } from '../i18n.jsx'

const ROLE_SCREEN_LOADERS = {
  admin: () => import('./screens/AdminScreens.jsx'),
  trainer: () => import('./screens/TrainerScreens.jsx'),
  client: () => import('./screens/ClientScreens.jsx'),
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

export function AppShell({ design, health, apiState, initialRole, reloadRoleData, onLogout }) {
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
  const [title, subtitle] = meta.titles[view] || Object.values(meta.titles)[0]
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
    if (!initialRole) return
    setRole(initialRole)
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
    writeRoute(nextView, params)
  }

  function changeKid(nextKid) {
    setKid(nextKid)
    const participant = clientItems.find((item) => item.id === nextKid)
    if (participant?.studentId) reloadRoleData?.('client', { studentId: participant.studentId })
    writeRoute(view, { clientId: selectedClientId, sessionId: selectedSessionId, trainerSessionId: selectedTrainerSessionId, groupId: selectedGroupId, tab: selectedTab, kid: nextKid }, true)
  }

  let lastSection = null
  const mobileKeys = role === 'admin'
    ? ['overview', 'schedule', 'attendance', 'clients', 'settings']
    : role === 'trainer'
      ? ['sessions', 'session', 'groups', 'history']
      : ['home', 'schedule', 'payments', 'history', 'profile']
  const mobileNav = mobileKeys.map((key) => nav.find((item) => item.key === key)).filter(Boolean)

  return (
    <div className="app">
      <a className="ops-skip-link" href="#main-content">{t('shell.skip')}</a>
      <aside className="ops-sidebar">
        <button type="button" className="ops-brand ops-brand-button" onClick={() => navigate(ROLE_META[role].initialView)}>
          <div className="ops-brand-mark">H2O</div>
          <div>
            <div className="ops-brand-name">SwimCRM</div>
            <div className="ops-brand-sub">операционная панель</div>
          </div>
        </button>

        <nav className="ops-nav" aria-label="Основная навигация">
          {nav.map((item) => {
            const section = item.section || 'Главное'
            const showSection = section !== lastSection
            lastSection = section
            return (
              <React.Fragment key={item.key}>
                {showSection && <div className="ops-nav-section">{section}</div>}
                <button
                  type="button"
                  className={`ops-nav-button${view === item.key ? ' is-active' : ''}`}
                  aria-current={view === item.key ? 'page' : undefined}
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
            <div className="ops-avatar">{initials(meta.user)}</div>
            <div>
              <div className="ops-user-name">{meta.user}</div>
              <div className="ops-user-role">{meta.productRole}</div>
            </div>
          </div>
          <IconButton label="Выйти" onClick={onLogout}><icons.Logout size={16} /></IconButton>
        </div>
      </aside>

      <div className="ops-main">
        <header className="topbar ops-topbar">
          <div>
            <div className="ops-crumb">H2O / {meta.productRole}</div>
            <h1>{title}</h1>
            <div className="sub">{subtitle}</div>
          </div>
          {role === 'admin' && <div className="ops-global-search"><input aria-label="Глобальный поиск" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Найти клиента, группу или занятие" />{searchQuery && <div className="ops-search-results">{searchResults.map((result) => <button type="button" key={result.key} onClick={() => navigate(result.view, result.params)}><strong>{result.label}</strong><span>{result.hint}</span></button>)}{!searchResults.length && <div className="empty">Ничего не найдено</div>}</div>}</div>}
          <span className="spacer" />
          <span className={`ops-status${health.state === 'ok' ? '' : ' is-bad'}`}>Сервер</span>
          <span className={`ops-status${apiState.state === 'ok' ? '' : ' is-bad'}`}>Данные</span>
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
        <nav className="ops-mobile-nav" aria-label="Основная мобильная навигация">
          {mobileNav.map((item, index) => <button key={`mobile-${item.key}`} type="button" aria-current={view === item.key ? 'page' : undefined} className={view === item.key ? 'is-active' : ''} onClick={() => navigate(item.key)}><span>{item.icon}</span><small>{index === mobileNav.length - 1 ? t('shell.more') : t(`nav.${role}.${item.key}`, item.label.replace('Мои ', ''))}</small></button>)}
        </nav>
      </div>
    </div>
  )
}
