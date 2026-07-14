import React, { useState } from 'react'
import { ROLE_META } from './runtime.jsx'

export function RoleSwitch({ role, onDevLogin, apiState }) {
  const [busyRole, setBusyRole] = useState(null)

  async function loginAs(nextRole) {
    setBusyRole(nextRole)
    try {
      await onDevLogin?.(nextRole)
    } finally {
      setBusyRole(null)
    }
  }

  if (!import.meta.env.DEV) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
      <div className="seg" aria-label="Dev login" style={{ transform: 'scale(.86)', transformOrigin: 'right center' }}>
        {Object.entries(ROLE_META).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            className={role === key ? 'on' : ''}
            title={`Dev login: ${meta.label}`}
            disabled={busyRole != null || apiState.state === 'loading'}
            onClick={() => loginAs(key)}
          >
            {busyRole === key ? '...' : `API ${meta.label}`}
          </button>
        ))}
      </div>
    </div>
  )
}

export function LoginScreen({ design, apiState, onLogin }) {
  const { components, icons } = design
  const { Button, Banner } = components
  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onLogin({ login: loginValue, password })
    } catch (err) {
      setError(err.message || 'Nie udalo sie zalogowac')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form className="card card-pad" style={{ width: 'min(420px, 100%)', display: 'grid', gap: 14 }} onSubmit={submit}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>SwimCRM</h1>
          <div className="muted" style={{ marginTop: 4 }}>Logowanie do systemu</div>
        </div>
        {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}
        {apiState.state === 'error' && apiState.status !== 403 && (
          <Banner tone="warning">API: {apiState.error}</Banner>
        )}
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Login lub email</span>
          <input
            className="input"
            autoComplete="username"
            value={loginValue}
            onChange={(event) => setLoginValue(event.target.value)}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Haslo</span>
          <input
            className="input"
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button type="submit" loading={busy} disabled={busy || !loginValue || !password}>
          <icons.Logout size={16} style={{ transform: 'rotate(180deg)' }} />
          Zaloguj
        </Button>
      </form>
    </div>
  )
}
