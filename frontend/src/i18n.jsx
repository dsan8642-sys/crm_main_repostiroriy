import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export const SUPPORTED_LOCALES = ['ru', 'pl', 'en']

export const catalogs = {
  ru: {
    'shell.skip': 'К основному содержимому',
    'shell.retry': 'Повторить',
    'shell.partial': 'Часть данных временно недоступна.',
    'shell.failed': 'Не удалось загрузить данные.',
    'shell.more': 'Ещё',
    'nav.admin.overview': 'Главная',
    'nav.admin.schedule': 'Расписание',
    'nav.admin.attendance': 'Посещаемость',
    'nav.admin.clients': 'Клиенты',
    'nav.trainer.sessions': 'Мои занятия',
    'nav.trainer.session': 'Посещаемость',
    'nav.trainer.groups': 'Группы',
    'nav.trainer.history': 'История',
    'nav.client.home': 'Главная',
    'nav.client.schedule': 'Расписание',
    'nav.client.payments': 'Платежи',
    'nav.client.history': 'История',
  },
  pl: {
    'shell.skip': 'Przejdź do treści',
    'shell.retry': 'Spróbuj ponownie',
    'shell.partial': 'Część danych jest chwilowo niedostępna.',
    'shell.failed': 'Nie udało się wczytać danych.',
    'shell.more': 'Więcej',
    'nav.admin.overview': 'Start',
    'nav.admin.schedule': 'Harmonogram',
    'nav.admin.attendance': 'Obecność',
    'nav.admin.clients': 'Klienci',
    'nav.trainer.sessions': 'Moje zajęcia',
    'nav.trainer.session': 'Obecność',
    'nav.trainer.groups': 'Grupy',
    'nav.trainer.history': 'Historia',
    'nav.client.home': 'Start',
    'nav.client.schedule': 'Harmonogram',
    'nav.client.payments': 'Płatności',
    'nav.client.history': 'Historia',
  },
  en: {
    'shell.skip': 'Skip to main content',
    'shell.retry': 'Retry',
    'shell.partial': 'Some data is temporarily unavailable.',
    'shell.failed': 'Data could not be loaded.',
    'shell.more': 'More',
    'nav.admin.overview': 'Home',
    'nav.admin.schedule': 'Schedule',
    'nav.admin.attendance': 'Attendance',
    'nav.admin.clients': 'Clients',
    'nav.trainer.sessions': 'My sessions',
    'nav.trainer.session': 'Attendance',
    'nav.trainer.groups': 'Groups',
    'nav.trainer.history': 'History',
    'nav.client.home': 'Home',
    'nav.client.schedule': 'Schedule',
    'nav.client.payments': 'Payments',
    'nav.client.history': 'History',
  },
}

const LocaleContext = createContext(null)

export function LocaleProvider({ children }) {
  const stored = globalThis.localStorage?.getItem('swimcrm.locale')
  const [locale, setLocaleState] = useState(SUPPORTED_LOCALES.includes(stored) ? stored : 'ru')
  const setLocale = useCallback((next) => {
    if (SUPPORTED_LOCALES.includes(next)) setLocaleState(next)
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale
    document.title = locale === 'pl' ? 'SwimCRM — panel' : locale === 'en' ? 'SwimCRM — portal' : 'SwimCRM — кабинет'
    globalThis.localStorage?.setItem('swimcrm.locale', locale)
  }, [locale])
  const value = useMemo(() => ({
    locale,
    setLocale,
    t: (key, fallback = key) => catalogs[locale]?.[key] || catalogs.ru[key] || fallback,
  }), [locale, setLocale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used inside LocaleProvider')
  return context
}
