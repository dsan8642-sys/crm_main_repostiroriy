import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './FormModal.css'
import { useOverlayLayer, useUnsavedChanges } from './uiLifecycle.jsx'

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
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const close = useCallback((reason) => {
    if (busy) return false
    if (dirty) {
      setConfirmDiscard(true)
      return false
    }
    onRequestClose?.(reason)
    return true
  }, [busy, dirty, onRequestClose])

  const modalLifecycle = useOverlayLayer({
    open,
    elementRef: panelRef,
    onRequestClose: close,
  })
  const confirmLifecycle = useOverlayLayer({
    open: open && confirmDiscard,
    elementRef: confirmRef,
    onRequestClose: () => {
      setConfirmDiscard(false)
      return true
    },
  })
  useUnsavedChanges(open && dirty, String(title || 'form'))

  useEffect(() => {
    if (!open) setConfirmDiscard(false)
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="form-modal-layer" data-backdrop-dismiss="false">
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
            onClick={() => modalLifecycle.requestClose('close-button')}
          >
            ×
          </button>
        </header>
        <div className="form-modal__body">{children}</div>
        {footer && (
          <footer className="form-modal__footer">
            {typeof footer === 'function' ? footer({ requestClose: modalLifecycle.requestClose }) : footer}
          </footer>
        )}
      </section>
      {confirmDiscard && (
        <div className="form-modal-confirm-layer">
          <section ref={confirmRef} className="form-modal-confirm" role="alertdialog" aria-modal="true" aria-labelledby={`${titleId}-discard`} tabIndex={-1}>
            <h3 id={`${titleId}-discard`}>Закрыть без сохранения?</h3>
            <p>Внесённые изменения будут потеряны.</p>
            <div>
              <button type="button" onClick={() => confirmLifecycle.requestClose('stay')}>Продолжить редактирование</button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  confirmLifecycle.requestClose('discard', () => onRequestClose?.('discard'))
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
