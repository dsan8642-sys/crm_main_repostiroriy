export const DEFAULT_UI_LOCALE = 'ru'
export const SUPPORTED_UI_LOCALES = Object.freeze(['ru', 'uk', 'pl', 'en'])

const LOCALE_ALIASES = Object.freeze({ ua: 'uk' })
const LOCALE_TAGS = Object.freeze({ ru: 'ru-RU', uk: 'uk-UA', pl: 'pl-PL', en: 'en-GB' })

export function normalizeUiLocale(value) {
  const base = String(value || '').trim().toLowerCase().split(/[-_]/)[0]
  const normalized = LOCALE_ALIASES[base] || base
  return SUPPORTED_UI_LOCALES.includes(normalized) ? normalized : DEFAULT_UI_LOCALE
}

export function uiLocaleTag(value) {
  return LOCALE_TAGS[normalizeUiLocale(value)]
}

export function applyUiLocale(documentLike, value) {
  const normalized = normalizeUiLocale(value)
  if (documentLike?.documentElement) documentLike.documentElement.lang = normalized
  return normalized
}

export function localeStorageKey(identity) {
  const userId = identity?.userId
  const role = String(identity?.role || '').trim().toLowerCase()
  if (userId == null || !role) return null
  return `swimcrm.ui.locale.${userId}.${role}`
}

export function readScopedUiLocale(storage, identity) {
  const key = localeStorageKey(identity)
  if (!key || !storage?.getItem) return DEFAULT_UI_LOCALE
  return normalizeUiLocale(storage.getItem(key))
}
