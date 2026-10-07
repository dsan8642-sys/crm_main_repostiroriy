import React, { useState } from 'react'
import { adminTranslator } from '../adminLocales.js'
import { useLocale } from '../i18n.jsx'
import { gmailAccessDraftUrl } from './accessContracts.js'

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
    return <Button data-testid="client-access-restore" variant="secondary" disabled={busy} onClick={() => onAction('restore')}>{t('access.restore')}</Button>
  }
  return (
    <>
      <Button data-testid="client-access-issue" variant="secondary" disabled={busy} onClick={() => onAction('issue')}>{accessActivated ? t('access.recover') : t('access.issue')}</Button>
      <Button data-testid="client-access-revoke" variant="secondary" disabled={busy} onClick={() => onAction('revoke')}>{t('access.revoke')}</Button>
    </>
  )
}

export function AccessCodeCard({ info, Button, onClose, email, emailLanguage }) {
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
  function openGmail() {
    const draft = gmailAccessDraftUrl(info, email, adminTranslator(emailLanguage || locale), window.location.origin)
    window.open(draft, '_blank', 'noopener,noreferrer')
  }
  return (
    <div className="card card-pad ops-access-card" data-testid="access-code-card">
      <strong>{info.purpose === 'recovery' ? t('access.recoveryCode') : t('access.activationCode')}</strong>
      <div className="ops-detail-row"><span>{t('access.login', { login: info.login })}</span><Button data-testid="access-copy-login" size="sm" variant="secondary" onClick={() => copy(info.login)}>{t('access.copyLogin')}</Button></div>
      <div className="ops-detail-row"><span className="mono" style={{ wordBreak: 'break-all' }}>{info.activation_code}</span><Button data-testid="access-copy-code" size="sm" variant="secondary" onClick={() => copy(info.activation_code)}>{t('access.copyCode')}</Button></div>
      <Button data-testid="access-copy-all" size="sm" variant="primary" onClick={() => copy([
        t('access.login', { login: info.login }),
        `${info.purpose === 'recovery' ? t('access.recoveryCode') : t('access.activationCode')}: ${info.activation_code}`,
      ].join('\n'))}>{t('access.copyAll')}</Button>
      {email && <Button size="sm" variant="secondary" onClick={openGmail}>{t('access.openGmail')}</Button>}
      {copyStatus && <span role="status" className="muted">{copyStatus}</span>}
      <div className="muted">{t('access.expires', { date: info.expires_at })}</div>
      {onClose && <Button data-testid="access-code-close" size="sm" variant="subtle" onClick={onClose}>{t('common.close')}</Button>}
    </div>
  )
}
