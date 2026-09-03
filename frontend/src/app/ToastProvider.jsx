import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import { toastReducer } from './toastContracts.js'
import { useLocale } from '../i18n.jsx'

const ToastContext = createContext(null)

function ToastItem({ toast, dismiss }) {
  const { t } = useLocale()
  useEffect(() => {
    if (!toast.duration) return undefined
    const timer = window.setTimeout(() => dismiss(toast.id), toast.duration)
    return () => window.clearTimeout(timer)
  }, [toast, dismiss])
  const role = toast.tone === 'danger' ? 'alert' : 'status'
  return (
    <div
      className={`ops-toast is-${toast.tone || 'info'}`}
      role={role}
      style={{
        background: 'var(--surface-inverse)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        color: '#fff',
        animation: 'ops-toast-in var(--dur-normal) var(--ease-out)',
      }}
    >
      {toast.tone === 'loading' && <span className="ops-toast-spinner" aria-hidden="true" />}
      <span>{toast.message}</span>
      {toast.tone !== 'loading' && (
        <button
          type="button"
          aria-label={t('toast.close')}
          onClick={() => dismiss(toast.id)}
          style={{
            display: 'grid',
            width: 44,
            height: 44,
            placeItems: 'center',
            padding: 0,
            border: '1px solid rgba(255,255,255,0.28)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            fontSize: 20,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >×</button>
      )}
    </div>
  )
}

export function ToastProvider({ children }) {
  const { t } = useLocale()
  const [toasts, dispatch] = useReducer(toastReducer, [])
  const dismiss = useCallback((id) => dispatch({ type: 'dismiss', id }), [])
  const show = useCallback(({
    id = `toast-${Date.now()}`,
    message,
    tone = 'info',
    duration = tone === 'loading' ? 0 : 5000,
  }) => {
    dispatch({ type: 'show', toast: { id, message, tone, duration } })
    return id
  }, [])
  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ops-toast-region" role="region" aria-label={t('toast.region')} aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  return context || { show: () => null, dismiss: () => {} }
}

export function ToastNotice({ id, message, tone = 'success' }) {
  const toast = useToast()
  useEffect(() => {
    if (!message) return undefined
    toast.show({ id, message, tone })
    return undefined
  }, [id, message, tone, toast])
  return null
}
