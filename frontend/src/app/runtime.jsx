import React from 'react'

export const ROLE_META = {
  admin: {
    label: 'Админ',
    productRole: 'Администратор',
    user: 'Администратор',
    subtitle: 'H2O Swim School',
    initialView: 'overview',
    titles: {
      overview: ['Рабочий стол', 'Быстрые переходы и ближайшие действия'],
      clients: ['Клиенты', 'Родители, дети, контакты и абонементы'],
      clientDetail: ['Карточка клиента', 'Данные аккаунта, участники и история'],
      trainers: ['Тренеры', 'Команда, доступы и назначенные группы'],
      groups: ['Группы', 'Учебные группы, тренеры и наполняемость'],
      schedule: ['Расписание', 'Сначала график, затем действия по кнопке'],
      attendance: ['Занятие', 'Состав, посещаемость и быстрые действия'],
      payments: ['Платежи', 'Подтверждения, начисления и баланс клиента'],
      debtors: ['Должники', 'Просрочки и напоминания'],
      settings: ['Настройки и контроль', 'Справочники, уведомления, доступы и журналы'],
      importExport: ['Импорт и экспорт', 'Загрузка клиентов, посещаемости и оплат, выгрузка отчётов'],
    },
  },
  trainer: {
    label: 'Тренер',
    productRole: 'Тренер',
    user: 'Тренер',
    subtitle: 'H2O',
    initialView: 'sessions',
    titles: {
      sessions: ['Мои занятия', 'Назначенные группы и ближайшие занятия'],
      session: ['Посещаемость', 'Отметка учеников'],
      groups: ['Мои группы', 'Состав групп'],
      history: ['История', 'Завершенные занятия'],
    },
  },
  client: {
    label: 'Клиент',
    productRole: 'Клиент',
    user: 'Клиент',
    subtitle: 'Личный кабинет',
    initialView: 'home',
    titles: {
      home: ['Главная', 'Ваш аккаунт H2O'],
      schedule: ['Расписание', 'Плановые занятия'],
      subscription: ['Абонемент', 'Остаток занятий и срок действия'],
      payments: ['Платежи', 'Начисления и подтверждения'],
      consents: ['Согласия', 'RODO и каналы связи'],
      history: ['История', 'Платежи и посещаемость'],
      profile: ['Профиль', 'Данные аккаунта'],
    },
  },
}

export function roleNav(role, icons, data) {
  if (role === 'admin') {
    return [
      { key: 'overview', label: 'Пульт', icon: <icons.Home size={17} /> },
      { key: 'clients', label: 'Клиенты', icon: <icons.Users size={17} />, count: data.AdminData?.clients?.length },
      { key: 'trainers', label: 'Тренеры', icon: <icons.Whistle size={17} />, count: data.AdminData?.trainers?.length, section: 'Операции' },
      { key: 'groups', label: 'Группы', icon: <icons.Users size={17} />, count: data.AdminData?.groups?.length, section: 'Операции' },
      { key: 'schedule', label: 'Расписание', icon: <icons.Calendar size={17} />, section: 'Операции' },
      { key: 'attendance', label: 'Занятие', icon: <icons.Check size={17} />, section: 'Операции' },
      {
        key: 'payments',
        label: 'Платежи',
        icon: <icons.Cash size={17} />,
        count: data.AdminData?.payments?.filter((payment) => payment.status === 'pending').length,
        section: 'Финансы',
      },
      {
        key: 'debtors',
        label: 'Должники',
        icon: <icons.Alert size={17} />,
        count: data.AdminData?.debtors?.length,
        countTone: 'danger',
        section: 'Финансы',
      },
      { key: 'settings', label: 'Настройки', icon: <icons.Settings size={17} />, section: 'Система' },
      { key: 'importExport', label: 'Импорт/экспорт', icon: <icons.Import size={17} />, section: 'Система' },
    ]
  }

  if (role === 'trainer') {
    return [
      { key: 'sessions', label: 'Мои занятия', icon: <icons.Calendar size={17} /> },
      { key: 'session', label: 'Посещаемость', icon: <icons.Check size={17} />, section: 'Операции' },
      { key: 'groups', label: 'Мои группы', icon: <icons.Users size={17} />, section: 'Операции' },
      { key: 'history', label: 'История', icon: <icons.File size={17} />, section: 'Операции' },
    ]
  }

  return [
    { key: 'home', label: 'Главная', icon: <icons.Home size={17} /> },
    { key: 'schedule', label: 'Расписание', icon: <icons.Calendar size={17} /> },
    { key: 'subscription', label: 'Абонемент', icon: <icons.Layers size={17} />, section: 'Аккаунт' },
    { key: 'payments', label: 'Платежи', icon: <icons.Wallet size={17} />, section: 'Аккаунт' },
    { key: 'history', label: 'История', icon: <icons.File size={17} />, section: 'Аккаунт' },
    { key: 'profile', label: 'Профиль', icon: <icons.User size={17} />, section: 'Настройки' },
    { key: 'consents', label: 'Согласия', icon: <icons.Shield size={17} />, section: 'Настройки' },
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
