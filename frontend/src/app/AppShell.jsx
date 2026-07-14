import React, { useEffect, useMemo, useState } from 'react'
import { ROLE_META, roleNav, screenFor } from './runtime.jsx'
import { RoleSwitch } from './Auth.jsx'
import {
  createAdminAttendanceScreen,
  createAdminClientDetailScreen,
  createAdminClientsScreen,
  createAdminDebtorsScreen,
  createAdminGroupsScreen,
  createAdminOverviewScreen,
  createAdminPaymentsScreen,
  createAdminScheduleScreen,
  createAdminTrainersScreen,
} from './screens/AdminScreens.jsx'
import {
  createTrainerGroupsScreen,
  createTrainerHistoryScreen,
  createTrainerSessionScreen,
  createTrainerSessionsScreen,
} from './screens/TrainerScreens.jsx'
import { createClientScreens } from './screens/ClientScreens.jsx'
export function AppShell({ design, health, apiState, initialRole, reloadRoleData, onDevLogin, onLogout }) {
  const [role, setRole] = useState(initialRole || 'admin')
  const [view, setView] = useState(ROLE_META[initialRole || 'admin'].initialView)
  const [kid, setKid] = useState('k1')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [selectedTrainerSessionId, setSelectedTrainerSessionId] = useState(null)

  const { components, icons, screens, data } = design
  const { SidebarNav, Avatar, IconButton, Badge } = components
  const meta = ROLE_META[role]
  const nav = useMemo(() => roleNav(role, icons, data), [role, icons, data])
  const runtimeScreens = useMemo(() => ({
    ...screens,
    AdminScreens: {
      ...screens.AdminScreens,
      Overview: createAdminOverviewScreen(components, icons),
      Clients: createAdminClientsScreen(components, reloadRoleData),
      ClientDetail: createAdminClientDetailScreen(components, icons, reloadRoleData),
      Trainers: createAdminTrainersScreen(components, reloadRoleData),
      Groups: createAdminGroupsScreen(components, reloadRoleData),
      Schedule: createAdminScheduleScreen(components, icons, reloadRoleData),
      Attendance: createAdminAttendanceScreen(components, icons, reloadRoleData),
      Payments: createAdminPaymentsScreen(components, icons, reloadRoleData),
      Debtors: createAdminDebtorsScreen(components, icons, reloadRoleData),
    },
    TrainerScreens: {
      ...screens.TrainerScreens,
      Sessions: createTrainerSessionsScreen(components, icons),
      Session: createTrainerSessionScreen(components, icons, reloadRoleData),
      Groups: createTrainerGroupsScreen(components, icons),
      History: createTrainerHistoryScreen(components, icons),
    },
    ParentScreens: {
      ...screens.ParentScreens,
      ...createClientScreens(components, icons, reloadRoleData),
    },
  }), [screens, components, icons, reloadRoleData])
  const Screen = screenFor(role, view, runtimeScreens)
  const [title, subtitle] = meta.titles[view] || Object.values(meta.titles)[0]
  const clientItems = data.ParentData?.children || []
  const activeKid = role === 'client' && !clientItems.some((item) => item.id === kid)
    ? clientItems[0]?.id || kid
    : kid

  useEffect(() => {
    if (!initialRole) return
    setRole(initialRole)
    setView(ROLE_META[initialRole].initialView)
  }, [initialRole])

  function navigate(nextView, params = {}) {
    if (params.clientId) setSelectedClientId(params.clientId)
    if (params.sessionId) setSelectedSessionId(params.sessionId)
    if (params.trainerSessionId) setSelectedTrainerSessionId(params.trainerSessionId)
    setView(nextView)
  }

  return (
    <div className="app">
      <SidebarNav
        items={nav}
        active={view}
        onSelect={setView}
        brand="H2O"
        product="SwimCRM"
        roleLabel={meta.productRole}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Avatar name={meta.user} size={30} />
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <div className="strong" style={{ fontSize: 'var(--fs-xs)' }}>{meta.user}</div>
              <div className="muted" style={{ fontSize: 'var(--fs-2xs)' }}>{meta.subtitle}</div>
            </div>
            <IconButton label="Wyloguj" onClick={onLogout}><icons.Logout size={16} /></IconButton>
          </div>
        }
      />

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <div className="sub">{subtitle}</div>
          </div>
          <span className="spacer" />
          <RoleSwitch role={role} onDevLogin={onDevLogin} apiState={apiState} />
          <Badge tone={health.state === 'ok' ? 'success' : health.state === 'error' ? 'danger' : 'warning'} dot>
            Backend
          </Badge>
          <Badge tone={apiState.state === 'ok' ? 'success' : apiState.state === 'error' ? 'danger' : 'warning'} dot>
            API
          </Badge>
        </header>

        <div className="scroll">
          {Screen ? (
            <Screen go={navigate} kid={activeKid} setKid={setKid} clientId={selectedClientId} sessionId={selectedSessionId} trainerSessionId={selectedTrainerSessionId} />
          ) : (
            <div className="page">
              <div className="card card-pad">Ekran nie zostal znaleziony w design bundle.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
