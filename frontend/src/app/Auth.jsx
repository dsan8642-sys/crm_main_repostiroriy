import React, { useState } from 'react'
import { api } from '../api.js'
import { SUPPORTED_LOCALES, useLocale } from '../i18n.jsx'
import {
  clearFieldError,
  fieldErrorsFromApi,
  focusFirstFieldError,
  formErrorMessage,
} from './formErrors.js'

const AUTH_FIELD_MAP = { activation_token: 'activationToken', password: 'password' }
const AUTH_FIELD_IDS = {
  login: 'auth-login', activationToken: 'auth-activation-token', password: 'auth-password',
}

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
  const { locale, setLocale, t } = useLocale()
  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [activationToken, setActivationToken] = useState('')
  const [activationMode, setActivationMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    setMessage('')
    const nextErrors = {}
    if (activationMode && !activationToken.trim()) nextErrors.activationToken = t('auth.requiredToken')
    if (!activationMode && !loginValue.trim()) nextErrors.login = t('auth.requiredLogin')
    if (!password) nextErrors.password = activationMode ? t('auth.requiredNewPassword') : t('auth.requiredPassword')
    if (activationMode && password && password.length < 8) {
      nextErrors.password = t('auth.passwordTooShort')
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      focusFirstFieldError(nextErrors, AUTH_FIELD_IDS)
      return
    }
    setBusy(true)
    try {
      if (activationMode) {
        const activation = await api.post('/api/auth/activate/', {
          activation_token: activationToken,
          password,
        })
        setLoginValue(activation.username || activation.login || '')
        setActivationMode(false)
        setActivationToken('')
        setMessage(t('auth.activated'))
      } else {
        await onLogin({ login: loginValue, password })
      }
    } catch (err) {
      const nextFieldErrors = fieldErrorsFromApi(err, AUTH_FIELD_MAP)
      setFieldErrors(nextFieldErrors)
      setError(formErrorMessage(
        err, activationMode ? t('auth.activationFailed') : t('auth.loginFailed'),
      ) || '')
      focusFirstFieldError(nextFieldErrors, AUTH_FIELD_IDS)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form className="card card-pad" style={{ width: 'min(420px, 100%)', display: 'grid', gap: 14 }} onSubmit={submit}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>SwimCRM</h1>
          <div className="muted" style={{ marginTop: 4 }}>{activationMode ? t('auth.activate') : t('auth.signIn')}</div>
        </div>
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('locale.label')}</span>
          <select className="input" aria-label={t('locale.label')} value={locale} onChange={(event) => setLocale(event.target.value)}>
            {SUPPORTED_LOCALES.map((code) => <option key={code} value={code}>{t(`locale.${code}`)}</option>)}
          </select>
        </label>
        {message && <Banner tone="success" onClose={() => setMessage('')}>{message}</Banner>}
        {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}
        {apiState.state === 'error' && apiState.status !== 403 && (
          <Banner tone="warning">{t('auth.serverFailed', undefined, { error: apiState.error })}</Banner>
        )}
        {!activationMode && (
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('auth.loginLabel')}</span>
            <input id={AUTH_FIELD_IDS.login} className="input" autoComplete="username" value={loginValue} aria-invalid={Boolean(fieldErrors.login)} aria-describedby={fieldErrors.login ? `${AUTH_FIELD_IDS.login}-error` : undefined} onChange={(event) => { setLoginValue(event.target.value); setFieldErrors((current) => clearFieldError(current, 'login')) }} />
            {fieldErrors.login && <small id={`${AUTH_FIELD_IDS.login}-error`} className="ops-field-error" role="alert">{fieldErrors.login}</small>}
          </label>
        )}
        {activationMode && (
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('auth.tokenLabel')}</span>
            <input id={AUTH_FIELD_IDS.activationToken} className="input" autoComplete="one-time-code" value={activationToken} aria-invalid={Boolean(fieldErrors.activationToken)} aria-describedby={fieldErrors.activationToken ? `${AUTH_FIELD_IDS.activationToken}-error` : undefined} onChange={(event) => { setActivationToken(event.target.value); setFieldErrors((current) => clearFieldError(current, 'activationToken')) }} />
            {fieldErrors.activationToken && <small id={`${AUTH_FIELD_IDS.activationToken}-error`} className="ops-field-error" role="alert">{fieldErrors.activationToken}</small>}
          </label>
        )}
        <label style={{ display: 'grid', gap: 6 }}>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{activationMode ? t('auth.newPassword') : t('auth.password')}</span>
          <div style={{ position: 'relative', display: 'flex' }}>
            <input id={AUTH_FIELD_IDS.password} className="input" autoComplete={activationMode ? 'new-password' : 'current-password'}
              type={showPassword ? 'text' : 'password'} style={{ width: '100%', paddingRight: 40 }}
              value={password} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? `${AUTH_FIELD_IDS.password}-error` : undefined} onChange={(event) => { setPassword(event.target.value); setFieldErrors((current) => clearFieldError(current, 'password')) }} />
            <button type="button" onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none',
                border: 'none', padding: 4, cursor: 'pointer', color: 'var(--muted, #888)' }}>
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {fieldErrors.password && <small id={`${AUTH_FIELD_IDS.password}-error`} className="ops-field-error" role="alert">{fieldErrors.password}</small>}
          {activationMode && <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('auth.minPassword')}</span>}
        </label>
        <Button type="submit" loading={busy}
          disabled={busy || !password || (activationMode ? !activationToken : !loginValue)}>
          <icons.Logout size={16} style={{ transform: 'rotate(180deg)' }} />
          {activationMode ? t('auth.setPassword') : t('auth.submit')}
        </Button>
        <button type="button" className="ops-link-button" onClick={() => { setActivationMode((value) => !value); setError(''); setFieldErrors({}); setMessage('') }}>
          {activationMode ? t('auth.back') : t('auth.haveCode')}
        </button>
      </form>
    </div>
  )
}
