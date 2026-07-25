import React, { useState } from 'react'
import { api } from '../api.js'

function EyeIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.4 3.2M6.2 6.2A17.2 17.2 0 0 0 2 12s3.5 7 10 7a9.9 9.9 0 0 0 4.3-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  )
}

export function LoginScreen({ design, apiState, onLogin }) {
  const { Button, Banner } = design.components
  const icons = design.icons
  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [activationToken, setActivationToken] = useState('')
  const [activationMode, setActivationMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (activationMode && password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов.')
      return
    }
    setBusy(true)
    try {
      if (activationMode) {
        await api.post('/api/auth/activate/', {
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
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Код активации</span>
            <input className="input" autoComplete="one-time-code" value={activationToken} onChange={(event) => setActivationToken(event.target.value)} />
          </label>
        )}
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{activationMode ? 'Новый пароль' : 'Пароль'}</span>
          <div style={{ position: 'relative', display: 'flex' }}>
            <input className="input" autoComplete={activationMode ? 'new-password' : 'current-password'}
              type={showPassword ? 'text' : 'password'} style={{ width: '100%', paddingRight: 40 }}
              value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none',
                border: 'none', padding: 4, cursor: 'pointer', color: 'var(--muted, #888)' }}>
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {activationMode && <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Минимум 8 символов.</span>}
        </label>
        <Button type="submit" loading={busy}
          disabled={busy || !password || (activationMode ? !activationToken : !loginValue)}>
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
