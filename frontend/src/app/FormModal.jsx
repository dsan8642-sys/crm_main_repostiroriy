import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './FormModal.css'
import { useOverlayLayer, useUnsavedChanges } from './uiLifecycle.jsx'
import { usePresence } from './usePresence.js'
import { useLocale } from '../i18n.jsx'

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
  const { t } = useLocale()
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef(null)
  const confirmRef = useRef(null)
  const lastContent = useRef(null)
  if (open) lastContent.current = { title, description, size, footer, children }
  const shown = lastContent.current
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const modalPresence = usePresence(open)
  const confirmPresence = usePresence(open && confirmDiscard)

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

  if (!modalPresence.present || !shown) return null

  return createPortal(
    <div className={`form-modal-layer ops-motion-fade${modalPresence.exiting ? ' is-exiting' : ''}`} data-backdrop-dismiss="false" aria-hidden={modalPresence.exiting || undefined} inert={modalPresence.exiting || undefined}>
      <section
        ref={panelRef}
        className={`form-modal form-modal--${shown.size} ops-motion-panel${modalPresence.exiting ? ' is-exiting' : ''}`}
        data-testid="form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={shown.description ? descriptionId : undefined}
        aria-hidden={suspended || confirmDiscard ? 'true' : undefined}
        inert={suspended || confirmDiscard || undefined}
        tabIndex={-1}
      >
        <header className="form-modal__header">
          <div>
            <h2 id={titleId}>{shown.title}</h2>
            {shown.description && <p id={descriptionId}>{shown.description}</p>}
          </div>
          <button
            type="button"
            className="form-modal__close"
            data-testid="form-modal-close"
            aria-label={t('modal.close')}
            disabled={busy}
            onClick={() => modalLifecycle.requestClose('close-button')}
          >
            ×
          </button>
        </header>
        <div className="form-modal__body">{shown.children}</div>
        {shown.footer && (
          <footer className="form-modal__footer">
            {typeof shown.footer === 'function' ? shown.footer({ requestClose: modalLifecycle.requestClose }) : shown.footer}
          </footer>
        )}
      </section>
      {confirmPresence.present && (
        <div className={`form-modal-confirm-layer ops-motion-fade${confirmPresence.exiting ? ' is-exiting' : ''}`} aria-hidden={confirmPresence.exiting || undefined} inert={confirmPresence.exiting || undefined}>
          <section ref={confirmRef} className={`form-modal-confirm ops-motion-panel${confirmPresence.exiting ? ' is-exiting' : ''}`} data-testid="discard-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${titleId}-discard`} tabIndex={-1}>
            <h3 id={`${titleId}-discard`}>{t('modal.discardTitle')}</h3>
            <p>{t('modal.discardDescription')}</p>
            <div>
              <button type="button" data-testid="discard-keep-editing" onClick={() => confirmLifecycle.requestClose('stay')}>{t('modal.continueEditing')}</button>
              <button
                type="button"
                className="is-danger"
                data-testid="discard-confirm"
                onClick={() => {
                  confirmLifecycle.requestClose('discard', () => onRequestClose?.('discard'))
                }}
              >
                {t('modal.discard')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>,
    document.body,
  )
}
