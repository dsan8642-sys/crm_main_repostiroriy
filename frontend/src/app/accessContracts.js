export function accessCodeClipboardText(info, t) {
  if (t) {
    const codeLabel = t(info?.purpose === 'recovery' ? 'access.recoveryCodeShort' : 'access.activationCodeShort')
    return `${t('access.login', { login: info?.login || '' })}\n${codeLabel}: ${info?.activation_code || ''}`
  }
  const codeLabel = info?.purpose === 'recovery' ? 'Recovery code' : 'Activation code'
  return `Login: ${info?.login || ''}\n${codeLabel}: ${info?.activation_code || ''}`
}

export function gmailAccessDraftUrl(info, email, t, crmUrl) {
  const subject = t('access.emailSubject')
  const body = [
    t('access.emailGreeting'),
    '',
    t('access.emailIntro'),
    t('access.login', { login: info.login }),
    `${t(info.purpose === 'recovery' ? 'access.recoveryCodeShort' : 'access.activationCodeShort')}: ${info.activation_code}`,
    t('access.expires', { date: info.expires_at }),
    '',
    t('access.emailOpen', { url: crmUrl }),
    t('access.emailSteps'),
  ].join('\n')
  const url = new URL('https://mail.google.com/mail/')
  url.search = new URLSearchParams({ view: 'cm', fs: '1', to: email, su: subject, body }).toString()
  return url.href
}
