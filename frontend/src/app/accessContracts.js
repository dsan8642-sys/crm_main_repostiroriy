export function accessCodeClipboardText(info, t) {
  if (t) {
    const codeLabel = t(info?.purpose === 'recovery' ? 'access.recoveryCodeShort' : 'access.activationCodeShort')
    return `${t('access.login', { login: info?.login || '' })}\n${codeLabel}: ${info?.activation_code || ''}`
  }
  const codeLabel = info?.purpose === 'recovery' ? 'Recovery code' : 'Activation code'
  return `Login: ${info?.login || ''}\n${codeLabel}: ${info?.activation_code || ''}`
}
