export const RESOURCE_STATES = ['idle', 'loading', 'ok', 'error']

export function resourceState(state, value = {}) {
  if (!RESOURCE_STATES.includes(state)) throw new TypeError(`Unknown resource state: ${state}`)
  return { state, ...value }
}

const SAFE_ERROR_MESSAGES = {
  ru: { auth: 'Сессия завершена. Войдите снова.', forbidden: 'У вас нет доступа к этому действию.', missing: 'Запись не найдена или больше недоступна.', invalid: 'Проверьте заполненные поля.', server: 'Сервис временно недоступен.', network: 'Нет связи с сервером.' },
  pl: { auth: 'Sesja wygasła. Zaloguj się ponownie.', forbidden: 'Nie masz dostępu do tej czynności.', missing: 'Nie znaleziono rekordu lub nie jest już dostępny.', invalid: 'Sprawdź wypełnione pola.', server: 'Usługa jest chwilowo niedostępna.', network: 'Brak połączenia z serwerem.' },
  en: { auth: 'Your session ended. Sign in again.', forbidden: 'You do not have access to this action.', missing: 'The record was not found or is no longer available.', invalid: 'Check the highlighted fields.', server: 'The service is temporarily unavailable.', network: 'The server could not be reached.' },
}

export function errorCode(status) {
  if (status === 401) return 'auth'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'missing'
  if (status >= 400 && status < 500) return 'invalid'
  if (status >= 500) return 'server'
  return 'network'
}

export function safeErrorMessage(status, locale = 'ru') {
  const catalog = SAFE_ERROR_MESSAGES[locale] || SAFE_ERROR_MESSAGES.ru
  return catalog[errorCode(status)]
}

export const PAYMENT_METHODS = Object.freeze([
  { code: 'cash', ru: 'Наличные', pl: 'Gotówka', en: 'Cash' },
  { code: 'bank_transfer', ru: 'Банковский перевод / IBAN', pl: 'Przelew / IBAN', en: 'Bank transfer / IBAN' },
  { code: 'card', ru: 'Карта', pl: 'Karta', en: 'Card' },
  { code: 'other', ru: 'Другое', pl: 'Inne', en: 'Other' },
])

export function paymentMethodLabel(method, locale = 'ru') {
  const row = PAYMENT_METHODS.find((item) => item.code === method)
  return row?.[locale] || row?.ru || method || '—'
}

export function participantKey(clientId, participantId) {
  if (clientId == null || participantId == null) throw new TypeError('clientId and participantId are required')
  return `client-${clientId}-participant-${participantId}`
}
