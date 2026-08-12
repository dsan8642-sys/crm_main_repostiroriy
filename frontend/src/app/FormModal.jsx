import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './FormModal.css'

const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(node) {
  if (!node) return []
  return Array.from(node.querySelectorAll(FOCUSABLE)).filter((element) => (
    !element.hidden && element.getAttribute('aria-hidden') !== 'true'
  ))
}

export function FormModal({
  open,
  title,
  description,
  size = 'md',
  busy = false,
  dirty = false,
  suspended = false,
  onRequestClose,
  footer,
  children,
}) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef(null)
  const confirmRef = useRef(null)
  const openerRef = useRef(null)
  const confirmOpenerRef = useRef(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  useEffect(() => {
    if (open) return undefined
    const rememberTrigger = (event) => {
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return
      const target = event.type === 'keydown' ? document.activeElement : event.target
      const candidate = target instanceof Element ? target.closest(FOCUSABLE) : null
      if (candidate instanceof HTMLElement && !candidate.closest('.form-modal-layer')) {
        openerRef.current = candidate
      }
    }
    document.addEventListener('pointerdown', rememberTrigger, true)
    document.addEventListener('keydown', rememberTrigger, true)
    return () => {
      document.removeEventListener('pointerdown', rememberTrigger, true)
      document.removeEventListener('keydown', rememberTrigger, true)
    }
  }, [open])

  const close = useCallback((reason) => {
    if (busy) return
    if (dirty) {
      confirmOpenerRef.current = document.activeElement
      setConfirmDiscard(true)
      return
    }
    onRequestClose?.(reason)
  }, [busy, dirty, onRequestClose])

  useEffect(() => {
    if (!open) return undefined
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement
        && activeElement !== document.body
        && activeElement !== document.documentElement
        && !activeElement.closest('.form-modal-layer')) {
      openerRef.current = activeElement
    }
    const bodyOverflow = document.body.style.overflow
    const bodyPaddingRight = document.body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`
    const timer = window.setTimeout(() => {
      const elements = focusableElements(panelRef.current)
      if (elements[0]) elements[0].focus()
      else panelRef.current?.focus()
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = bodyOverflow
      document.body.style.paddingRight = bodyPaddingRight
      const opener = openerRef.current
      if (opener instanceof HTMLElement && opener.isConnected) {
        window.setTimeout(() => opener.focus(), 0)
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) setConfirmDiscard(false)
  }, [open])

  useEffect(() => {
    if (!confirmDiscard) return undefined
    const timer = window.setTimeout(() => {
      focusableElements(confirmRef.current)[0]?.focus()
    }, 0)
    return () => {
      window.clearTimeout(timer)
      const opener = confirmOpenerRef.current
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [confirmDiscard])

  useEffect(() => {
    if (!confirmDiscard) return undefined
    const dismissDiscard = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setConfirmDiscard(false)
    }
    document.addEventListener('keydown', dismissDiscard, true)
    return () => document.removeEventListener('keydown', dismissDiscard, true)
  }, [confirmDiscard])

  if (!open) return null

  function handleKeyDown(event) {
    if (suspended || confirmDiscard) return
    if (event.key === 'Escape') {
      if (event.defaultPrevented) return
      const expandedChild = event.target instanceof Element
        ? event.target.closest('[aria-expanded="true"]')
        : null
      if (expandedChild) return
      event.preventDefault()
      close('escape')
      return
    }
    if (event.key !== 'Tab') return
    const elements = focusableElements(panelRef.current)
    if (!elements.length) {
      event.preventDefault()
      panelRef.current?.focus()
      return
    }
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function handleConfirmKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setConfirmDiscard(false)
      return
    }
    if (event.key !== 'Tab') return
    const elements = focusableElements(confirmRef.current)
    if (!elements.length) return
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="form-modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close('backdrop')
      }}
    >
      <section
        ref={panelRef}
        className={`form-modal form-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-hidden={suspended || confirmDiscard ? 'true' : undefined}
        inert={suspended || confirmDiscard || undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="form-modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            type="button"
            className="form-modal__close"
            aria-label="Закрыть"
            disabled={busy}
            onClick={() => close('close-button')}
          >
            ×
          </button>
        </header>
        <div className="form-modal__body">{children}</div>
        {footer && (
          <footer className="form-modal__footer">
            {typeof footer === 'function' ? footer({ requestClose: close }) : footer}
          </footer>
        )}
      </section>
      {confirmDiscard && (
        <div className="form-modal-confirm-layer">
          <section ref={confirmRef} className="form-modal-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`${titleId}-discard`} onKeyDown={handleConfirmKeyDown}>
            <h3 id={`${titleId}-discard`}>Закрыть без сохранения?</h3>
            <p>Внесённые изменения будут потеряны.</p>
            <div>
              <button type="button" onClick={() => setConfirmDiscard(false)}>Продолжить редактирование</button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  setConfirmDiscard(false)
                  onRequestClose?.('discard')
                }}
              >
                Закрыть без сохранения
              </button>
            </div>
          </section>
        </div>
      )}
    </div>,
    document.body,
  )
}
