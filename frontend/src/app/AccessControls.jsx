import React, { useState } from 'react'
import { accessCodeClipboardText } from './accessContracts.js'

export function AccessButtons({
  Button,
  portalAccess,
  accessActivated,
  busy = false,
  onAction,
}) {
  if (portalAccess === 'revoked') {
    return <Button variant="secondary" disabled={busy} onClick={() => onAction('restore')}>Вернуть доступ</Button>
  }
  return (
    <>
      <Button variant="secondary" disabled={busy} onClick={() => onAction('issue')}>{accessActivated ? 'Восстановить доступ' : 'Выдать доступ'}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => onAction('revoke')}>Отозвать доступ</Button>
    </>
  )
}

export function AccessCodeCard({ info, Button, onClose }) {
  const [copyStatus, setCopyStatus] = useState('')
  if (!info) return null
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus('Скопировано.')
    } catch {
      setCopyStatus('Ошибка копирования.')
    }
  }
  return (
    <div className="card card-pad ops-access-card">
      <strong>{info.purpose === 'recovery' ? 'Код восстановления доступа' : 'Код активации доступа'}</strong>
      <div className="ops-detail-row"><span>Логин: <strong>{info.login}</strong></span><Button size="sm" variant="secondary" onClick={() => copy(info.login)}>Копировать логин</Button></div>
      <div className="ops-detail-row"><span className="mono" style={{ wordBreak: 'break-all' }}>{info.activation_code}</span><Button size="sm" variant="secondary" onClick={() => copy(info.activation_code)}>Копировать код</Button></div>
      <Button size="sm" variant="primary" onClick={() => copy(accessCodeClipboardText(info))}>Копировать всё</Button>
      {copyStatus && <span role="status" className="muted">{copyStatus}</span>}
      <div className="muted">Срок: {info.expires_at}</div>
      {onClose && <Button size="sm" variant="subtle" onClick={onClose}>Закрыть</Button>}
    </div>
  )
}
