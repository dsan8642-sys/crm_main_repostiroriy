import { useCallback, useEffect, useId, useRef } from 'react'

const SESSION_UI_PREFIX = 'swimcrm.ui.'
const OVERLAY_STATE_KEY = '__swimcrmOverlay'
const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const overlayStack = []
const dirtySources = new Map()
const suppressedHistoryPops = []
let listenersAttached = false
let bodyLock = null
let lastFocusTrigger = null

function rememberFocusTrigger(event) {
  if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return
  const candidate = event.target instanceof Element ? event.target.closest(FOCUSABLE) : null
  if (candidate instanceof HTMLElement) lastFocusTrigger = candidate
}

function focusableElements(node) {
  if (!node) return []
  return Array.from(node.querySelectorAll(FOCUSABLE)).filter((element) => (
    !element.hidden
      && element.getAttribute('aria-hidden') !== 'true'
      && !element.closest('[inert]')
  ))
}

function topOverlay() {
  return overlayStack[overlayStack.length - 1] || null
}

function currentHistoryState() {
  return window.history.state && typeof window.history.state === 'object'
    ? window.history.state
    : {}
}

function lockPageScroll() {
  if (bodyLock || typeof document === 'undefined') return
  const body = document.body
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
  bodyLock = {
    scrollX,
    scrollY,
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  }
  body.style.overflow = 'hidden'
  body.style.position = 'fixed'
  body.style.top = `${-scrollY}px`
  body.style.left = `${-scrollX}px`
  body.style.right = '0'
  body.style.width = '100%'
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
  body.dataset.overlayOpen = 'true'
}

function unlockPageScroll() {
  if (!bodyLock || typeof document === 'undefined') return
  const body = document.body
  const previous = bodyLock
  bodyLock = null
  body.style.overflow = previous.overflow
  body.style.position = previous.position
  body.style.top = previous.top
  body.style.left = previous.left
  body.style.right = previous.right
  body.style.width = previous.width
  body.style.paddingRight = previous.paddingRight
  delete body.dataset.overlayOpen
  window.scrollTo(previous.scrollX, previous.scrollY)
}

function onOverlayKeyDown(event) {
  if (event.defaultPrevented) return
  const entry = topOverlay()
  if (!entry) return
  const panel = entry.getElement()

  if (event.key === 'Escape') {
    const expandedChild = event.target instanceof Element
      ? event.target.closest('[aria-expanded="true"]')
      : null
    if (expandedChild && panel?.contains(expandedChild)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    requestOverlayClose(entry.id, 'escape')
    return
  }

  if (event.key !== 'Tab' || !panel) return
  const controls = focusableElements(panel)
  if (!controls.length) {
    event.preventDefault()
    panel.focus()
    return
  }
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!panel.contains(document.activeElement)) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function onOverlayPopState(event) {
  if (suppressedHistoryPops.length) {
    const afterClose = suppressedHistoryPops.shift()
    event.stopImmediatePropagation()
    if (afterClose) window.queueMicrotask(afterClose)
    syncOverlayListeners()
    return
  }

  const entry = topOverlay()
  if (!entry) return
  event.stopImmediatePropagation()
  entry.historyActive = false
  const accepted = entry.requestClose('history') !== false
  if (!accepted) {
    try {
      window.history.pushState(
        { ...currentHistoryState(), [OVERLAY_STATE_KEY]: entry.id },
        '',
        entry.url,
      )
      entry.historyActive = true
    } catch {
      // The dirty guard remains active even if a host disallows history writes.
    }
  }
}

function syncOverlayListeners() {
  const shouldAttach = overlayStack.length > 0
  if (shouldAttach && !listenersAttached) {
    document.addEventListener('keydown', onOverlayKeyDown)
    listenersAttached = true
  } else if (!shouldAttach && listenersAttached) {
    document.removeEventListener('keydown', onOverlayKeyDown)
    listenersAttached = false
  }
  if (overlayStack.length > 0) lockPageScroll()
  else unlockPageScroll()
}

export function registerOverlay({ id, getElement, requestClose, initialFocus }) {
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const opener = activeElement && activeElement !== document.body && activeElement !== document.documentElement
    ? activeElement
    : lastFocusTrigger
  const entry = {
    id,
    getElement,
    requestClose,
    initialFocus,
    opener,
    url: window.location.href,
    historyActive: false,
    historyFrame: null,
    afterClose: null,
    focusFrame: null,
  }

  overlayStack.push(entry)
  syncOverlayListeners()
  entry.historyFrame = window.requestAnimationFrame(() => {
    entry.historyFrame = null
    if (!overlayStack.includes(entry)) return
    try {
      window.history.pushState(
        { ...currentHistoryState(), [OVERLAY_STATE_KEY]: id },
        '',
        entry.url,
      )
      entry.historyActive = true
    } catch {
      entry.historyActive = false
    }
  })
  entry.focusFrame = window.requestAnimationFrame(() => {
    const panel = getElement()
    const preferred = typeof initialFocus === 'function'
      ? initialFocus(panel)
      : initialFocus
        ? panel?.querySelector(initialFocus)
        : null
    ;(preferred || focusableElements(panel)[0] || panel)?.focus?.()
  })

  return () => {
    const index = overlayStack.findIndex((item) => item.id === id)
    if (index < 0) return
    const [removed] = overlayStack.splice(index, 1)
    if (removed.historyFrame != null) window.cancelAnimationFrame(removed.historyFrame)
    if (removed.focusFrame != null) window.cancelAnimationFrame(removed.focusFrame)
    const wasTop = index === overlayStack.length
    const afterClose = removed.afterClose
    const ownsCurrentHistory = removed.historyActive
      && currentHistoryState()[OVERLAY_STATE_KEY] === removed.id

    if (ownsCurrentHistory) {
      removed.historyActive = false
      suppressedHistoryPops.push(afterClose)
      window.history.back()
    } else if (afterClose) {
      window.queueMicrotask(afterClose)
    }

    syncOverlayListeners()
    if (wasTop) {
      const next = topOverlay()
      const nextElement = next?.getElement()
      const focusTarget = removed.opener instanceof HTMLElement
        && removed.opener.isConnected
        && (!nextElement || nextElement.contains(removed.opener))
        ? removed.opener
        : nextElement || removed.opener
      window.requestAnimationFrame(() => {
        if (focusTarget instanceof HTMLElement && focusTarget.isConnected) focusTarget.focus()
      })
    }
  }
}

export function requestOverlayClose(id, reason = 'explicit', afterClose = null) {
  const entry = topOverlay()
  if (!entry || entry.id !== id) return false
  entry.afterClose = afterClose
  const accepted = entry.requestClose(reason) !== false
  if (!accepted) entry.afterClose = null
  return accepted
}

export function useOverlayLayer({
  open,
  id: providedId,
  elementRef,
  onRequestClose,
  initialFocus,
}) {
  const generatedId = useId()
  const id = providedId || `swimcrm-overlay-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const closeRef = useRef(onRequestClose)
  const focusRef = useRef(initialFocus)
  closeRef.current = onRequestClose
  focusRef.current = initialFocus

  useEffect(() => {
    if (!open) return undefined
    return registerOverlay({
      id,
      getElement: () => elementRef.current,
      requestClose: (reason) => closeRef.current?.(reason),
      initialFocus: (panel) => (
        typeof focusRef.current === 'function'
          ? focusRef.current(panel)
          : focusRef.current
            ? panel?.querySelector(focusRef.current)
            : null
      ),
    })
  }, [elementRef, id, open])

  const close = useCallback(
    (reason = 'explicit', afterClose = null) => requestOverlayClose(id, reason, afterClose),
    [id],
  )
  return { overlayId: id, requestClose: close }
}

function onBeforeUnload(event) {
  event.preventDefault()
  event.returnValue = ''
}

function syncBeforeUnload() {
  window.removeEventListener('beforeunload', onBeforeUnload)
  if (dirtySources.size) window.addEventListener('beforeunload', onBeforeUnload)
}

export function useUnsavedChanges(dirty, label = 'form') {
  const generatedId = useId()
  const id = `swimcrm-dirty-${generatedId}`
  useEffect(() => {
    if (dirty) dirtySources.set(id, label)
    else dirtySources.delete(id)
    syncBeforeUnload()
    return () => {
      dirtySources.delete(id)
      syncBeforeUnload()
    }
  }, [dirty, id, label])
}

export function hasUnsavedChanges() {
  return dirtySources.size > 0
}

export function readSessionBoolean(key) {
  try {
    const value = window.sessionStorage.getItem(`${SESSION_UI_PREFIX}${key}`)
    return value == null ? null : value === 'true'
  } catch {
    return null
  }
}

export function writeSessionBoolean(key, value) {
  try {
    window.sessionStorage.setItem(`${SESSION_UI_PREFIX}${key}`, String(Boolean(value)))
  } catch {
    // Session state is an enhancement; shell navigation remains usable without it.
  }
}

export function clearSessionUiState() {
  try {
    const keys = []
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (key?.startsWith(SESSION_UI_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key))
  } catch {
    // Logout continues even when storage is unavailable.
  }
  dirtySources.clear()
  syncBeforeUnload()
}

if (typeof window !== 'undefined') {
  document.addEventListener('pointerdown', rememberFocusTrigger, true)
  document.addEventListener('keydown', rememberFocusTrigger, true)
  window.addEventListener('popstate', onOverlayPopState, true)
  window.SwimCRMUiLifecycle = {
    registerOverlay,
    requestOverlayClose,
  }
}
