import { useLayoutEffect, useState } from 'react'

export function usePresence(open, duration = 180) {
  const [present, setPresent] = useState(Boolean(open))

  useLayoutEffect(() => {
    if (open) {
      setPresent(true)
      return undefined
    }
    if (!present) return undefined
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setPresent(false), reduceMotion ? 0 : duration)
    return () => window.clearTimeout(timer)
  }, [open, present, duration])

  return { present, exiting: present && !open }
}
