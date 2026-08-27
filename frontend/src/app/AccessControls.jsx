import React, { useState } from 'react'
import { adminTranslator } from '../adminLocales.js'
import { useLocale } from '../i18n.jsx'

export function AccessButtons({
  Button,
  portalAccess,
  accessActivated,
  busy = false,
  onAction,
}) {
  const { locale } = useLocale()
  const t = adminTranslator(locale)
  if (portalAccess === 'revoked') {
    return <Button variant="secondary" disabled={busy} onClick={() => onAction('restore')}>{t('access.restore')}</Button>
  }
  return (
    <>
      <Button variant="secondary" disabled={busy} onClick={() => onAction('issue')}>{accessActivated ? t('access.recover') : t('access.issue')}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => onAction('revoke')}>{t('access.revoke')}</Button>
    </>
  )
}

export function AccessCodeCard({ info, Button, onClose }) {
  const { locale } = useLocale()
  const t = adminTranslator(locale)
  const [copyStatus, setCopyStatus] = useState('')
  if (!info) return null
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus(t('access.copied'))
    } catch {
      setCopyStatus(t('access.copyError'))
    }
  }
  return (
    <div className="card card-pad ops-access-card">
      <strong>{info.purpose === 'recovery' ? t('access.recoveryCode') : t('access.activationCode')}</strong>
      <div className="ops-detail-row"><span>{t('access.login', { login: info.login })}</span><Button size="sm" variant="secondary" onClick={() => copy(info.login)}>{t('access.copyLogin')}</Button></div>
      <div className="ops-detail-row"><span className="mono" style={{ wordBreak: 'break-all' }}>{info.activation_code}</span><Button size="sm" variant="secondary" onClick={() => copy(info.activation_code)}>{t('access.copyCode')}</Button></div>
      <Button size="sm" variant="primary" onClick={() => copy([
        t('access.login', { login: info.login }),
        `${info.purpose === 'recovery' ? t('access.recoveryCode') : t('access.activationCode')}: ${info.activation_code}`,
      ].join('\n'))}>{t('access.copyAll')}</Button>
      {copyStatus && <span role="status" className="muted">{copyStatus}</span>}
      <div className="muted">{t('access.expires', { date: info.expires_at })}</div>
      {onClose && <Button size="sm" variant="subtle" onClick={onClose}>{t('common.close')}</Button>}
    </div>
  )
}
