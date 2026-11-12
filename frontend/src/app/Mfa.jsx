import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, apiErrorMessage } from '../api.js'
import { useLocale } from '../i18n.jsx'
import { adminTranslator } from '../adminLocales.js'

export function MfaEnrollment({ onComplete, Button }) {
  const { locale } = useLocale()
  const t = adminTranslator(locale)
  const [password, setPassword] = useState('')
  const [setup, setSetup] = useState(null)
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    if (setup?.uri) QRCode.toDataURL(setup.uri, { margin: 2, width: 220 })
      .then((url) => { if (active) setQr(url) })
      .catch(() => { if (active) setQr('') })
    return () => { active = false }
  }, [setup?.uri])

  async function begin(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await api.post('/api/auth/mfa/setup/', { current_password: password })
      setPassword('')
      setSetup(result)
    } catch (err) { setError(apiErrorMessage(err)) }
    finally { setBusy(false) }
  }

  async function confirm(event) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await api.post('/api/auth/mfa/verify/', { code })
      setSetup(null); setCode(''); setQr('')
      onComplete?.()
    } catch (err) { setError(apiErrorMessage(err)) }
    finally { setBusy(false) }
  }

  return <div className="card card-pad" style={{ maxWidth: 440, marginBottom: 16 }}>
    <h2>{t('mfa.enrollTitle')}</h2>
    <p>{t('mfa.enrollDescription')}</p>
    {error && <p role="alert">{error}</p>}
    {!setup ? <form className="ops-form-stack" onSubmit={begin}>
      <label htmlFor="mfa-current-password">{t('mfa.currentPassword')}</label>
      <input id="mfa-current-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      <div><Button type="submit" disabled={busy}>{t('mfa.begin')}</Button></div>
    </form> : <form className="ops-form-stack" onSubmit={confirm}>
      <p>{t('mfa.scan')}</p>
      {qr && <img src={qr} alt={t('mfa.qrAlt')} width="220" height="220" />}
      <p><code style={{ overflowWrap: 'anywhere' }}>{setup.secret}</code></p>
      <label htmlFor="mfa-enroll-code">{t('mfa.code')}</label>
      <input id="mfa-enroll-code" className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />
      <div><Button type="submit" disabled={busy}>{t('mfa.confirm')}</Button></div>
    </form>}
  </div>
}

export function MfaChallenge({ onVerified, onLogout, Button }) {
  const { locale } = useLocale()
  const t = adminTranslator(locale)
  const [configured, setConfigured] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.get('/api/auth/mfa/status/').then((result) => setConfigured(result.configured)).catch((err) => setError(apiErrorMessage(err)))
  }, [])
  async function verify(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await api.post('/api/auth/mfa/verify/', { code }); onVerified() }
    catch (err) { setError(apiErrorMessage(err)) }
    finally { setBusy(false) }
  }
  return <div className="app" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <div className="card card-pad" style={{ maxWidth: 460 }}>
      <h1>{t('mfa.challenge')}</h1>
      {error && <p role="alert">{error}</p>}
      {configured === false ? <MfaEnrollment Button={Button} onComplete={onVerified} /> : <form className="ops-form-stack" onSubmit={verify}>
        <p>{t('mfa.enterCode')}</p>
        <label htmlFor="mfa-login-code">{t('mfa.code')}</label>
        <input id="mfa-login-code" className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />
        <div><Button type="submit" disabled={busy}>{t('mfa.signIn')}</Button></div>
      </form>}
      <div style={{ marginTop: 16 }}><Button variant="secondary" type="button" onClick={onLogout}>{t('mfa.signOut')}</Button></div>
    </div>
  </div>
}
