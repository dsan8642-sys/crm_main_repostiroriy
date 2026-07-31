export function accessCodeClipboardText(info) {
  const codeLabel = info?.purpose === 'recovery' ? 'Код восстановления' : 'Код активации'
  return `Логин: ${info?.login || ''}\n${codeLabel}: ${info?.activation_code || ''}`
}
