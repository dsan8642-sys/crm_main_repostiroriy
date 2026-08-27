const SESSION_PREFIX = 'swimcrm.ui.list.'

export function shouldRequestSearch(value) {
  const length = String(value || '').trim().length
  return length === 0 || length >= 2
}

export function listStateKey({ userKey, role, route }) {
  return `${SESSION_PREFIX}${userKey || 'session'}.${role}.${route}`
}

export function visiblePageNumbers(currentPage, totalPages, limit = 7) {
  const total = Math.max(1, Number(totalPages) || 1)
  const current = Math.min(total, Math.max(1, Number(currentPage) || 1))
  const size = Math.max(1, Math.min(total, limit))
  let start = Math.max(1, current - Math.floor(size / 2))
  const end = Math.min(total, start + size - 1)
  start = Math.max(1, end - size + 1)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function buildListUrl(path, params = {}) {
  const [base, existing = ''] = String(path).split('?')
  const query = new URLSearchParams(existing)
  Object.entries(params).forEach(([name, value]) => {
    if (value === undefined || value === null || value === '') query.delete(name)
    else query.set(name, String(value))
  })
  const suffix = query.toString()
  return suffix ? `${base}?${suffix}` : base
}

export function createListRequestController(fetcher) {
  let requestId = 0
  let activeController = null
  let timer = null

  function cancel() {
    requestId += 1
    if (timer) clearTimeout(timer)
    timer = null
    activeController?.abort()
    activeController = null
  }

  function run(url, { delay = 0 } = {}) {
    const id = ++requestId
    if (timer) clearTimeout(timer)
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    return new Promise((resolve, reject) => {
      const execute = () => {
        timer = null
        fetcher(url, { signal: controller.signal }).then(
          (payload) => resolve({ payload, stale: id !== requestId }),
          (error) => {
            if (id !== requestId || error?.name === 'AbortError') {
              resolve({ payload: null, stale: true })
              return
            }
            reject(error)
          },
        )
      }
      if (delay) timer = setTimeout(execute, delay)
      else execute()
    })
  }

  return { cancel, run }
}
