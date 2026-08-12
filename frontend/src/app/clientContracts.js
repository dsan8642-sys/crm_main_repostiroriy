export function normalizePhoneLogin(value) {
  return String(value || '').replace(/\D/g, '')
}

function nameLogin(firstName, lastName) {
  const raw = [firstName, lastName]
    .map((part) => String(part || '').trim().toLocaleLowerCase())
    .filter(Boolean)
    .join('.')
  return raw
    .replace(/[^\p{L}\p{N}_.@+-]+/gu, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.@+_-]+|[.@+_-]+$/g, '')
}

export function clientAutoLogin({ email, phone, firstName, lastName } = {}) {
  const normalizedEmail = String(email || '').trim().toLocaleLowerCase()
  if (normalizedEmail) return normalizedEmail
  const normalizedPhone = normalizePhoneLogin(phone)
  if (normalizedPhone) return normalizedPhone
  return nameLogin(firstName, lastName)
}

export function updateClientIdentity(current, field, value) {
  const next = { ...current, [field]: value }
  if (field === 'username') {
    const manualValue = String(value || '').trim()
    if (manualValue) return { ...next, username: value, usernameManual: true }
    return {
      ...next,
      username: clientAutoLogin(next),
      usernameManual: false,
    }
  }
  if (!current.usernameManual) next.username = clientAutoLogin(next)
  return next
}
