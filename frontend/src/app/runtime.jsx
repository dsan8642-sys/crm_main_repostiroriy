import React, { useEffect, useId } from 'react'
import { useToast } from './ToastProvider.jsx'

export const ROLE_META = {
  admin: {
    labelKey: 'role.admin.label',
    productRoleKey: 'role.admin.name',
    userKey: 'role.admin.name',
    subtitle: 'H2O Swim School',
    initialView: 'overview',
    titles: {
      overview: ['runtime.admin.overview.title', 'runtime.admin.overview.desc'],
      clients: ['runtime.admin.clients.title', 'runtime.admin.clients.desc'],
      clientDetail: ['runtime.admin.clientDetail.title', 'runtime.admin.clientDetail.desc'],
      trainers: ['runtime.admin.trainers.title', 'runtime.admin.trainers.desc'],
      groups: ['runtime.admin.groups.title', 'runtime.admin.groups.desc'],
      schedule: ['runtime.admin.schedule.title', 'runtime.admin.schedule.desc'],
      attendance: ['runtime.admin.attendance.title', 'runtime.admin.attendance.desc'],
      subscriptions: ['runtime.admin.subscriptions.title', 'runtime.admin.subscriptions.desc'],
      payments: ['runtime.admin.payments.title', 'runtime.admin.payments.desc'],
      debtors: ['runtime.admin.debtors.title', 'runtime.admin.debtors.desc'],
      settings: ['runtime.admin.settings.title', 'runtime.admin.settings.desc'],
    },
  },
  trainer: {
    labelKey: 'role.trainer.label',
    productRoleKey: 'role.trainer.label',
    userKey: 'role.trainer.label',
    subtitle: 'H2O',
    initialView: 'sessions',
    titles: {
      sessions: ['runtime.trainer.sessions.title', 'runtime.trainer.sessions.desc'],
      schedule: ['runtime.trainer.schedule.title', 'runtime.trainer.schedule.desc'],
      session: ['runtime.trainer.session.title', 'runtime.trainer.session.desc'],
      groups: ['runtime.trainer.groups.title', 'runtime.trainer.groups.desc'],
      history: ['runtime.trainer.history.title', 'runtime.trainer.history.desc'],
      guide: ['runtime.trainer.guide.title', 'runtime.trainer.guide.desc'],
    },
  },
  client: {
    labelKey: 'role.client.label',
    productRoleKey: 'role.client.label',
    userKey: 'role.client.label',
    subtitleKey: 'role.client.subtitle',
    initialView: 'home',
    titles: {
      home: ['runtime.client.home.title', 'runtime.client.home.desc'],
      schedule: ['runtime.client.schedule.title', 'runtime.client.schedule.desc'],
      subscription: ['runtime.client.subscription.title', 'runtime.client.subscription.desc'],
      payments: ['runtime.client.payments.title', 'runtime.client.payments.desc'],
      consents: ['runtime.client.consents.title', 'runtime.client.consents.desc'],
      history: ['runtime.client.history.title', 'runtime.client.history.desc'],
      profile: ['runtime.client.profile.title', 'runtime.client.profile.desc'],
      help: ['runtime.client.help.title', 'runtime.client.help.desc'],
    },
  },
}

export function roleNav(role, icons, data, counts = {}, t = (key) => key) {
  if (role === 'admin') {
    return [
      { key: 'overview', label: t('nav.admin.overview'), icon: <icons.Home size={20} /> },
      { key: 'clients', label: t('nav.admin.clients'), icon: <icons.ClientFamily size={20} /> },
      { key: 'schedule', label: t('nav.admin.schedule'), icon: <icons.Calendar size={20} />, section: t('shell.operationsSection') },
      { key: 'groups', label: t('nav.admin.groups'), icon: <icons.GroupMembers size={20} />, section: t('shell.operationsSection') },
      { key: 'trainers', label: t('nav.admin.trainers'), icon: <icons.Trainer size={20} />, section: t('shell.operationsSection') },
      {
        key: 'payments',
        label: t('nav.admin.payments'),
        icon: <icons.Wallet size={20} />,
        count: (counts.pendingPayments ?? data.AdminData?.payments?.filter((payment) => payment.status === 'pending').length) || undefined,
        section: t('shell.financeSection'),
      },
      {
        key: 'debtors',
        label: t('nav.admin.debtors'),
        icon: <icons.Alert size={20} />,
        count: (counts.debtors ?? data.AdminData?.debtors?.length) || undefined,
        countTone: 'danger',
        section: t('shell.financeSection'),
      },
      {
        key: 'subscriptions',
        label: t('nav.admin.subscriptions'),
        icon: <icons.Ticket size={20} />,
        section: t('shell.financeSection'),
      },
      { key: 'settings', label: t('nav.admin.settings'), icon: <icons.Settings size={20} />, section: t('shell.systemSection') },
    ]
  }

  if (role === 'trainer') {
    return [
      { key: 'sessions', label: t('nav.trainer.sessions'), icon: <icons.Swimmer size={20} /> },
      { key: 'schedule', label: t('nav.trainer.schedule'), icon: <icons.Calendar size={20} /> },
      { key: 'groups', label: t('nav.trainer.groups'), icon: <icons.GroupMembers size={20} />, section: t('shell.operationsSection') },
      { key: 'history', label: t('nav.trainer.history'), icon: <icons.History size={20} />, section: t('shell.operationsSection') },
      { key: 'guide', label: t('nav.trainer.guide'), icon: <icons.HelpCircle size={20} />, section: t('shell.systemSection') },
    ]
  }

  return [
    { key: 'home', label: t('nav.client.home'), icon: <icons.Home size={20} /> },
    { key: 'schedule', label: t('nav.client.schedule'), icon: <icons.Calendar size={20} /> },
    { key: 'subscription', label: t('nav.client.subscription'), icon: <icons.Ticket size={20} />, section: t('shell.accountSection') },
    { key: 'payments', label: t('nav.client.payments'), icon: <icons.Wallet size={20} />, section: t('shell.accountSection') },
    { key: 'history', label: t('nav.client.history'), icon: <icons.History size={20} />, section: t('shell.accountSection') },
    { key: 'profile', label: t('nav.client.profile'), icon: <icons.User size={20} />, section: t('shell.settingsSection') },
    { key: 'help', label: t('nav.client.help'), icon: <icons.HelpCircle size={20} />, section: t('shell.settingsSection') },
  ]
}

export function screenFor(role, view, screens) {
  const cap = view.charAt(0).toUpperCase() + view.slice(1)
  if (role === 'admin') return screens.AdminScreens?.[cap] || screens.AdminScreens?.Overview
  if (role === 'trainer') return screens.TrainerScreens?.[cap] || screens.TrainerScreens?.Sessions
  return screens.ParentScreens?.[cap] || screens.ParentScreens?.Home
}

export function BusyBanner({ show, children, id }) {
  const generatedId = useId()
  const toast = useToast()
  const toastId = id || `busy-${generatedId}`
  useEffect(() => {
    if (show) {
      toast.show({ id: toastId, message: children, tone: 'loading', duration: 0 })
    } else {
      toast.dismiss(toastId)
    }
    return () => toast.dismiss(toastId)
  }, [show, children, toast, toastId])
  return null
}
