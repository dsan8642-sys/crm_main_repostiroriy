import React from 'react'

export const ROLE_META = {
  admin: {
    label: 'Administrator',
    productRole: 'Administrator',
    user: 'Katarzyna Admin',
    subtitle: 'Szkola H2O',
    initialView: 'overview',
    titles: {
      overview: ['Przeglad', 'Panel administratora'],
      clients: ['Klienci', 'Baza klientow i uczestnikow'],
      clientDetail: ['Klient', 'Szczegoly konta, uczestnikow i historii'],
      trainers: ['Trenerzy', 'Kadra i dostepy trenerskie'],
      groups: ['Grupy', 'Grupy szkoleniowe i trenerzy'],
      schedule: ['Grafik', 'Zajecia i szablony'],
      attendance: ['Frekwencja', 'Odznaczanie obecnosci'],
      payments: ['Platnosci', 'Naliczenia i weryfikacja'],
      debtors: ['Dluznicy', 'Zaleglosci i przypomnienia'],
    },
  },
  trainer: {
    label: 'Trener',
    productRole: 'Trener',
    user: 'Marek Zielinski',
    subtitle: 'Trener В· H2O',
    initialView: 'sessions',
    titles: {
      sessions: ['Moje zajecia', 'Tylko przypisane grupy i sesje'],
      session: ['Frekwencja', 'Zapis obecnosci'],
      groups: ['Moje grupy', 'Przypisane grupy'],
      history: ['Historia', 'Zakonczone zajecia'],
    },
  },
  client: {
    label: 'Klient',
    productRole: 'Klient',
    user: 'Ewa Kowalska',
    subtitle: 'Panel klienta',
    initialView: 'home',
    titles: {
      home: ['Glowna', 'Twoje konto w H2O'],
      schedule: ['Rozklad', 'Planowane zajecia'],
      subscription: ['Abonament', 'Pozostale zajecia i historia'],
      payments: ['Platnosci', 'Naliczenia i potwierdzenia'],
      consents: ['Zgody', 'RODO i kanaly kontaktu'],
      history: ['Historia', 'Platnosci i obecnosc'],
      profile: ['Profil', 'Dane konta klienta'],
    },
  },
}

export function roleNav(role, icons, data) {
  if (role === 'admin') {
    return [
      { key: 'overview', label: 'Przeglad', icon: <icons.Home size={17} /> },
      { key: 'clients', label: 'Klienci', icon: <icons.Users size={17} />, count: data.AdminData?.clients?.length, section: '' },
      { key: 'trainers', label: 'Trenerzy', icon: <icons.Whistle size={17} />, count: data.AdminData?.trainers?.length, section: 'Operacje' },
      { key: 'groups', label: 'Grupy', icon: <icons.Users size={17} />, count: data.AdminData?.groups?.length, section: 'Operacje' },
      { key: 'schedule', label: 'Grafik', icon: <icons.Calendar size={17} />, section: 'Operacje' },
      { key: 'attendance', label: 'Obecnosc', icon: <icons.Check size={17} />, section: 'Operacje' },
      { key: 'payments', label: 'Platnosci', icon: <icons.Cash size={17} />, count: 4, section: 'Finanse' },
      {
        key: 'debtors',
        label: 'Dluznicy',
        icon: <icons.Alert size={17} />,
        count: data.AdminData?.debtors?.length,
        countTone: 'danger',
        section: 'Finanse',
      },
    ]
  }

  if (role === 'trainer') {
    return [
      { key: 'sessions', label: 'Moje zajecia', icon: <icons.Calendar size={17} /> },
      { key: 'session', label: 'Frekwencja', icon: <icons.Check size={17} />, section: 'Operacje' },
      { key: 'groups', label: 'Moje grupy', icon: <icons.Users size={17} />, section: 'Operacje' },
      { key: 'history', label: 'Historia', icon: <icons.File size={17} />, section: 'Operacje' },
    ]
  }

  return [
    { key: 'home', label: 'Glowna', icon: <icons.Home size={17} /> },
    { key: 'schedule', label: 'Rozklad', icon: <icons.Calendar size={17} /> },
    { key: 'subscription', label: 'Abonament', icon: <icons.Layers size={17} />, section: 'Konto' },
    { key: 'payments', label: 'Platnosci', icon: <icons.Wallet size={17} />, section: 'Konto' },
    { key: 'history', label: 'Historia', icon: <icons.File size={17} />, section: 'Konto' },
    { key: 'profile', label: 'Profil', icon: <icons.User size={17} />, section: 'Ustawienia' },
    { key: 'consents', label: 'Zgody', icon: <icons.Shield size={17} />, section: 'Ustawienia' },
  ]
}

export function screenFor(role, view, screens) {
  const cap = view.charAt(0).toUpperCase() + view.slice(1)
  if (role === 'admin') return screens.AdminScreens?.[cap] || screens.AdminScreens?.Overview
  if (role === 'trainer') return screens.TrainerScreens?.[cap] || screens.TrainerScreens?.Sessions
  return screens.ParentScreens?.[cap] || screens.ParentScreens?.Home
}

export function ensureDesignDataRefs() {
  if (!globalThis.__SwimCRMDataRefs) {
    globalThis.__SwimCRMDataRefs = {
      AdminData: { trainers: [], groups: [], subscriptionTypes: [], clients: [], sessions: [], roster: [], payments: [], debtors: [] },
      TrainerData: { sessions: [], roster: [], groups: [] },
      ParentData: { account: {}, children: [], profileParticipants: [], consents: [], schedule: {}, ledger: {}, attendance: {}, charges: [], payments: [] },
    }
  }
  globalThis.AdminData = globalThis.__SwimCRMDataRefs.AdminData
  globalThis.TrainerData = globalThis.__SwimCRMDataRefs.TrainerData
  globalThis.ParentData = globalThis.__SwimCRMDataRefs.ParentData
  return globalThis.__SwimCRMDataRefs
}

export function BusyBanner({ Banner, show, children }) {
  return show ? <Banner tone="info" style={{ marginBottom: 12 }}>{children}</Banner> : null
}
