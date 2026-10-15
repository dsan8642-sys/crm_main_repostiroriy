import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { toastReducer } from './toastContracts.js'
import { useLocale } from '../i18n.jsx'

const ToastContext = createContext(null)

function ToastItem({ toast, dismiss, exiting }) {
  const { t } = useLocale()
  useEffect(() => {
    if (!toast.duration) return undefined
    const timer = window.setTimeout(() => dismiss(toast.id), toast.duration)
    return () => window.clearTimeout(timer)
  }, [toast, dismiss])
  const role = toast.tone === 'danger' ? 'alert' : 'status'
  return (
    <div
      className={`ops-toast is-${toast.tone || 'info'}${exiting ? ' is-exiting' : ''}`}
      role={role}
      style={{
        background: 'var(--surface-inverse)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        color: '#fff',
        animation: exiting ? 'ops-toast-out 180ms ease-in both' : 'ops-toast-in var(--dur-normal) var(--ease-out)',
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
  const [exitingIds, setExitingIds] = useState(() => new Set())
  const exitTimers = useRef(new Map())
  useEffect(() => () => { for (const timer of exitTimers.current.values()) window.clearTimeout(timer) }, [])
  const dismiss = useCallback((id) => {
    if (exitTimers.current.has(id)) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      dispatch({ type: 'dismiss', id })
      return
    }
    setExitingIds((current) => new Set(current).add(id))
    exitTimers.current.set(id, window.setTimeout(() => {
      dispatch({ type: 'dismiss', id })
      setExitingIds((current) => { const next = new Set(current); next.delete(id); return next })
      exitTimers.current.delete(id)
    }, 180))
  }, [])
  const show = useCallback(({
    id = `toast-${Date.now()}`,
    message,
    tone = 'info',
    duration = tone === 'loading' ? 0 : 5000,
  }) => {
    if (exitTimers.current.has(id)) {
      window.clearTimeout(exitTimers.current.get(id))
      exitTimers.current.delete(id)
      setExitingIds((current) => { const next = new Set(current); next.delete(id); return next })
    }
    dispatch({ type: 'show', toast: { id, message, tone, duration } })
    return id
  }, [])
  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ops-toast-region" role="region" aria-label={t('toast.region')} aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} dismiss={dismiss} exiting={exitingIds.has(toast.id)} />)}
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
