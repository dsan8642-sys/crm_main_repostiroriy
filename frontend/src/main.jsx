import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { LocaleProvider } from './i18n.jsx'
import { ToastProvider } from './app/ToastProvider.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LocaleProvider><ToastProvider><App /></ToastProvider></LocaleProvider>
  </React.StrictMode>,
)
