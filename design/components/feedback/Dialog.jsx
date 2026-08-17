import React from 'react';
import { Button } from '../forms/Button.jsx';

/**
 * SwimCRM Dialog — modal for confirmations and short forms.
 * `tone="danger"` styles the confirm button for irreversible actions
 * (anonymise family / RODO, cancel a session series) as required by the brief.
 */
export function Dialog({
  open = true,
  title,
  description,
  children,
  onClose,
  onConfirm,
  confirmLabel = 'Potwierdź',
  cancelLabel = 'Anuluj',
  tone = 'primary',
  width = 460,
  hideFooter = false,
  irreversible = false,
  dismissOnBackdrop = true,
}) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const dialogId = `design-dialog-${React.useId()}`;
  const dialogRef = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  React.useEffect(() => {
    if (!open) return undefined;
    const lifecycle = window.SwimCRMUiLifecycle;
    if (lifecycle) {
      return lifecycle.registerOverlay({
        id: dialogId,
        getElement: () => dialogRef.current,
        requestClose: () => {
          if (!onCloseRef.current) return false;
          onCloseRef.current();
          return true;
        },
        initialFocus: '[data-dialog-cancel]',
      });
    }
    const previousFocus = document.activeElement;
    const focusCancel = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector('[data-dialog-cancel]')?.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusCancel);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [dialogId, open]);

  function requestClose(reason) {
    if (!onClose) return false;
    const lifecycle = window.SwimCRMUiLifecycle;
    if (lifecycle) return lifecycle.requestOverlayClose(dialogId, reason);
    onClose();
    return true;
  }

  function handleDialogKeyDown(event) {
    if (window.SwimCRMUiLifecycle) return;
    if (event.key === 'Escape' && onClose) {
      event.preventDefault();
      requestClose('escape');
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
      onKeyDown={handleDialogKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        // Confirmations can be opened from FormModal (1000) and its discard guard (1010).
        // Keep the active confirmation above both so it remains visible and clickable.
        zIndex: 1100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '10vh 16px 16px',
        background: 'rgba(26,33,41,0.44)',
        backdropFilter: 'blur(2px)',
        animation: 'swim-fade var(--dur-normal) var(--ease-standard)',
      }}
      onMouseDown={(e) => { if (dismissOnBackdrop && e.target === e.currentTarget) requestClose('backdrop'); }}
    >
      <div
        style={{
          width,
          maxWidth: '100%',
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-pop)',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          animation: 'swim-pop var(--dur-normal) var(--ease-out)',
        }}
      >
        <div style={{ padding: '18px 20px 0' }}>
          {irreversible && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--red-600)', fontSize: 'var(--fs-2xs)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <WarnIcon /> Działanie nieodwracalne
            </div>
          )}
          {title && <h2 id={titleId} style={{ margin: 0, font: 'var(--text-card-title)', color: 'var(--text-strong)' }}>{title}</h2>}
          {description && <p id={descriptionId} style={{ margin: '7px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 'var(--lh-normal)' }}>{description}</p>}
        </div>
        <div style={{ padding: children ? '16px 20px' : '10px 20px' }}>{children}</div>
        {!hideFooter && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', background: 'var(--surface-sunken)', borderTop: '1px solid var(--border-subtle)' }}>
            <Button variant="secondary" data-dialog-cancel onClick={() => requestClose('cancel')}>{cancelLabel}</Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function WarnIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M12 3l9 16H3L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
