import React, { useCallback, useEffect, useState } from 'react'
import './design/styles.css'
import './design/ui_kits/shared/kit.css'
import {
  devLogin,
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
import { AppShell } from './app/AppShell.jsx'
import { ROLE_META, ensureDesignDataRefs } from './app/runtime.jsx'
export default function App() {
  const [design, setDesign] = useState(null)
  const [health, setHealth] = useState({ state: 'loading' })
  const [apiState, setApiState] = useState({ state: 'loading' })
  const [initialRole, setInitialRole] = useState('admin')
  const [authRequired, setAuthRequired] = useState(false)

  const applyRoleData = useCallback((role, mapped) => {
    const refs = ensureDesignDataRefs()
    if (role === 'admin') Object.assign(refs.AdminData, mapped)
    if (role === 'trainer') Object.assign(refs.TrainerData, mapped)
    if (role === 'client') Object.assign(refs.ParentData, mapped)

    setDesign((current) => current ? ({
      ...current,
      data: {
        AdminData: refs.AdminData,
        TrainerData: refs.TrainerData,
        ParentData: refs.ParentData,
      },
    }) : current)
  }, [])

  const loadRoleData = useCallback(async (role) => {
    setApiState({ state: 'loading', role })
    try {
      if (role === 'admin') {
        applyRoleData(role, mapAdminPortalData(await fetchAdminPortal()))
      } else if (role === 'trainer') {
        applyRoleData(role, mapTrainerPortalData(await fetchTrainerPortal()))
      } else {
        applyRoleData(role, mapClientPortalData(await fetchClientPortal()))
      }
      setApiState({ state: 'ok', role })
    } catch (error) {
      setApiState({ state: 'error', role, error: error.message, status: error.status })
    }
  }, [applyRoleData])

  const handleDevLogin = useCallback(async (role) => {
    setApiState({ state: 'loading', role })
    try {
      await devLogin(role)
      setAuthRequired(false)
      setInitialRole(role)
      await loadRoleData(role)
    } catch (error) {
      setApiState({ state: 'error', role, error: error.message, status: error.status })
      throw error
    }
  }, [loadRoleData])

  const handleProductionLogin = useCallback(async (credentials) => {
    setApiState({ state: 'loading', role: 'unknown' })
    const payload = await productionLogin(credentials)
    const role = payload.user?.role === 'parent' ? 'client' : payload.user?.role
    if (!ROLE_META[role]) throw new Error('Unsupported user role')
    setAuthRequired(false)
    setInitialRole(role)
    await loadRoleData(role)
  }, [loadRoleData])

  const handleProductionLogout = useCallback(async () => {
    setApiState({ state: 'loading', role: initialRole })
    try {
      await productionLogout()
    } finally {
      setAuthRequired(true)
      setApiState({ state: 'error', role: 'unknown', error: 'Login required', status: 403 })
    }
  }, [initialRole])

  useEffect(() => {
    let alive = true
    globalThis.React = React
    const refs = ensureDesignDataRefs()
    import('./design/_ds_bundle.js').then(async () => {
      const bundled = {
        AdminData: globalThis.AdminData,
        TrainerData: globalThis.TrainerData,
        ParentData: globalThis.ParentData,
      }
      Object.assign(refs.AdminData, bundled.AdminData)
      Object.assign(refs.TrainerData, bundled.TrainerData)
      Object.assign(refs.ParentData, bundled.ParentData)
      globalThis.AdminData = refs.AdminData
      globalThis.TrainerData = refs.TrainerData
      globalThis.ParentData = refs.ParentData

      const nextDesign = {
        components: globalThis.SwimCRMDesignSystem_546643,
        icons: globalThis.SwimIcons,
        screens: {
          AdminScreens: globalThis.AdminScreens,
          TrainerScreens: globalThis.TrainerScreens,
          ParentScreens: globalThis.ParentScreens,
        },
        data: {
          AdminData: refs.AdminData,
          TrainerData: refs.TrainerData,
          ParentData: refs.ParentData,
        },
      }
      if (alive) setDesign(nextDesign)

      try {
        const me = await fetchMe()
        const role = me.role === 'parent' ? 'client' : me.role
        if (alive && ROLE_META[role]) {
          setAuthRequired(false)
          setInitialRole(role)
          await loadRoleData(role)
        }
      } catch (error) {
        if (alive) {
          setAuthRequired(error.status === 403 || error.status === 401)
          setApiState({ state: 'error', role: 'unknown', error: error.message, status: error.status })
        }
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

  if (!design) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card card-pad">Ladowanie systemu projektowego...</div>
      </div>
    )
  }

  if (authRequired) {
    return <LoginScreen design={design} apiState={apiState} onLogin={handleProductionLogin} />
  }

  return (
    <AppShell
      design={design}
      health={health}
      apiState={apiState}
      initialRole={initialRole}
      reloadRoleData={loadRoleData}
      onDevLogin={handleDevLogin}
      onLogout={handleProductionLogout}
    />
  )
}
