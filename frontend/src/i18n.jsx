import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import {
  DEFAULT_UI_LOCALE,
  SUPPORTED_UI_LOCALES,
  applyUiLocale,
  localeStorageKey,
  normalizeUiLocale,
  readScopedUiLocale,
} from './localeContracts.js'
import { portalCatalogs } from './portalLocales.js'

export const SUPPORTED_LOCALES = SUPPORTED_UI_LOCALES

export const catalogs = portalCatalogs

function formatMessage(message, values) {
  if (!values) return message
  return String(message).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ))
}

const LocaleContext = createContext(null)

export function LocaleProvider({ children }) {
  const [identity, setIdentity] = useState(null)
  const [locale, setLocaleState] = useState(DEFAULT_UI_LOCALE)
  const setLocale = useCallback((next) => {
    const normalized = applyUiLocale(globalThis.document, next)
    if (SUPPORTED_LOCALES.includes(normalized)) setLocaleState(normalized)
  }, [])
  const bindLocaleIdentity = useCallback((nextIdentity) => {
    const normalizedIdentity = nextIdentity?.userId != null && nextIdentity?.role
      ? { userId: nextIdentity.userId, role: String(nextIdentity.role) }
      : null
    const nextLocale = readScopedUiLocale(globalThis.localStorage, normalizedIdentity)
    setIdentity(normalizedIdentity)
    applyUiLocale(globalThis.document, nextLocale)
    setLocaleState(nextLocale)
    return nextLocale
  }, [])
  const clearLocaleIdentity = useCallback(() => {
    setIdentity(null)
    applyUiLocale(globalThis.document, DEFAULT_UI_LOCALE)
    setLocaleState(DEFAULT_UI_LOCALE)
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale
    document.title = ({
      ru: 'SwimCRM — кабинет',
      uk: 'SwimCRM — кабінет',
      pl: 'SwimCRM — panel',
      en: 'SwimCRM — portal',
    })[locale]
    const key = localeStorageKey(identity)
    if (key) globalThis.localStorage?.setItem(key, locale)
  }, [identity, locale])
  useEffect(() => {
    const key = localeStorageKey(identity)
    if (!key) return undefined
    const onStorage = (event) => {
      if (event.key === key) {
        const nextLocale = applyUiLocale(globalThis.document, event.newValue)
        setLocaleState(nextLocale)
      }
    }
    globalThis.addEventListener?.('storage', onStorage)
    return () => globalThis.removeEventListener?.('storage', onStorage)
  }, [identity])
  const value = useMemo(() => ({
    locale,
    setLocale,
    bindLocaleIdentity,
    clearLocaleIdentity,
    t: (key, fallback = key, values) => formatMessage(
      catalogs[locale]?.[key] || catalogs.ru[key] || fallback,
      values,
    ),
  }), [bindLocaleIdentity, clearLocaleIdentity, locale, setLocale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used inside LocaleProvider')
  return context
}
