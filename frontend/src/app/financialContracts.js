export function moneyMajorToMinor(value) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [major, fraction = ''] = normalized.split('.')
  const amount = Number(major) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

export function createPaymentAttemptKey(prefix = 'payment') {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${randomPart}`
}

export function rebasePassiveFormUpdate(current, baseline, patch) {
  const next = { ...current, ...patch }
  const untouched = baseline != null
    && JSON.stringify(current) === JSON.stringify(baseline)
  return {
    form: next,
    baseline: untouched ? next : baseline,
  }
}

export function assertPaymentReadback(mutation, readBack, expectedStatus) {
  const mutationId = String(mutation?.id ?? '')
  const readBackId = String(readBack?.id ?? '')
  const event = readBack?.events?.at?.(-1) || null
  if (!mutationId || mutationId !== readBackId || readBack?.status !== expectedStatus) {
    throw new Error('Authoritative payment read-back did not match the requested transition.')
  }
  if (expectedStatus !== 'pending' && event?.type !== expectedStatus) {
    throw new Error('Authoritative payment audit event is missing.')
  }
  return readBack
}
