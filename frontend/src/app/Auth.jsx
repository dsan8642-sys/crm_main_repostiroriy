import React, { useState } from 'react'
import { api } from '../api.js'
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
      <div className="seg" aria-label="Тестовый вход" style={{ transform: 'scale(.86)', transformOrigin: 'right center' }}>
        {Object.entries(ROLE_META).map(([key, meta]) => (
          <button key={key} type="button" className={role === key ? 'on' : ''} title={`Тестовый вход: ${meta.label}`}
            disabled={busyRole != null || apiState.state === 'loading'} onClick={() => loginAs(key)}>
            {busyRole === key ? '...' : meta.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function LoginScreen({ design, apiState, onLogin }) {
  const { Button, Banner } = design.components
  const icons = design.icons
  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [clientId, setClientId] = useState('')
  const [activationToken, setActivationToken] = useState('')
  const [activationMode, setActivationMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      if (activationMode) {
        await api.post('/api/auth/activate/', {
          client_id: clientId,
          activation_token: activationToken,
          password,
        })
        setActivationMode(false)
        setActivationToken('')
        setMessage('Доступ активирован. Теперь войдите с новым паролем.')
      } else {
        await onLogin({ login: loginValue, password })
      }
    } catch (err) {
      setError(err.message || (activationMode ? 'Не удалось активировать доступ' : 'Не удалось войти'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form className="card card-pad" style={{ width: 'min(420px, 100%)', display: 'grid', gap: 14 }} onSubmit={submit}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>SwimCRM</h1>
          <div className="muted" style={{ marginTop: 4 }}>{activationMode ? 'Активация доступа существующего клиента' : 'Вход в систему'}</div>
        </div>
        {message && <Banner tone="success" onClose={() => setMessage('')}>{message}</Banner>}
        {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}
        {apiState.state === 'error' && apiState.status !== 403 && (
          <Banner tone="warning">Не удалось подключиться к серверу: {apiState.error}</Banner>
        )}
        {!activationMode && (
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Логин или email</span>
            <input className="input" autoComplete="username" value={loginValue} onChange={(event) => setLoginValue(event.target.value)} />
          </label>
        )}
        {activationMode && (
          <>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Номер клиента</span>
              <input className="input" inputMode="numeric" value={clientId} onChange={(event) => setClientId(event.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Код активации</span>
              <input className="input" autoComplete="one-time-code" value={activationToken} onChange={(event) => setActivationToken(event.target.value)} />
            </label>
          </>
        )}
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{activationMode ? 'Новый пароль' : 'Пароль'}</span>
          <input className="input" autoComplete={activationMode ? 'new-password' : 'current-password'} type="password"
            value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <Button type="submit" loading={busy}
          disabled={busy || !password || (activationMode ? !clientId || !activationToken : !loginValue)}>
          <icons.Logout size={16} style={{ transform: 'rotate(180deg)' }} />
          {activationMode ? 'Активировать доступ' : 'Войти'}
        </Button>
        <button type="button" className="ops-link-button" onClick={() => { setActivationMode((value) => !value); setError(''); setMessage('') }}>
          {activationMode ? 'Вернуться ко входу' : 'Я уже клиент — активировать доступ'}
        </button>
      </form>
    </div>
  )
}
