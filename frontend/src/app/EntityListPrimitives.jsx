import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clampedPopoverPosition } from './entityListContracts.js'

export function ActionPopover({ label, actions, disabled = false }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    setPosition(null)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return
    const anchor = triggerRef.current.getBoundingClientRect()
    const menu = menuRef.current.getBoundingClientRect()
    setPosition(clampedPopoverPosition({
      anchor,
      menu,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }))
  }, [])

  useLayoutEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() => {
      updatePosition()
      menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      close(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close(true)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [close, open, updatePosition])

  function moveFocus(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])
    if (!items.length) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length
          : (current - 1 + items.length) % items.length
    items[next].focus()
  }

  const menu = open ? (
    <div
      ref={menuRef}
      id={`entity-actions-${id}`}
      className="ops-action-popover"
      role="menu"
      aria-label={label}
      onKeyDown={moveFocus}
      style={position ? {
        top: position.top,
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        visibility: 'visible',
      } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      {actions.filter(Boolean).map((action) => (
        <button
          key={action.key || action.label}
          type="button"
          role="menuitem"
          className={action.danger ? 'is-danger' : ''}
          disabled={action.disabled}
          onClick={() => {
            close(false)
            action.onSelect?.()
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ops-entity-actions-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `entity-actions-${id}` : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </>
  )
}

export function EntityMobileCard({ className = '', children, labelledBy, testId }) {
  return (
    <article className={`ops-compact-entity-card ${className}`.trim()} aria-labelledby={labelledBy} data-testid={testId}>
      {children}
    </article>
  )
}

export function ContextRow({ label = 'Участник', value, onChange, changeLabel = 'Сменить' }) {
  return (
    <div className="ops-context-row">
      <span><small>{label}</small><strong>{value || 'Не выбран'}</strong></span>
      {onChange && <button type="button" onClick={onChange}>{changeLabel}</button>}
    </div>
  )
}

export function ContextBackButton({ children, onClick, icon }) {
  return <button type="button" className="ops-context-back" onClick={onClick}>{icon}{children}</button>
}
