import { safeErrorMessage } from './contracts.js'

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

let csrfPromise = null

async function ensureCsrfToken(force = false) {
  if (!force && getCookie('csrftoken')) return
  csrfPromise = csrfPromise || fetch('/api/csrf/', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  }).finally(() => {
    csrfPromise = null
  })
  await csrfPromise
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const method = options.method || 'GET'
  if (method !== 'GET' && !headers.has('X-CSRFToken')) {
    await ensureCsrfToken()
    headers.set('X-CSRFToken', getCookie('csrftoken'))
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response
  try {
    response = await fetch(path, {
      ...options,
      method,
      headers,
      credentials: 'same-origin',
    })
  } catch {
    const locale = document.documentElement.lang?.split('-')[0] || 'ru'
    const error = new Error(safeErrorMessage(0, locale))
    error.code = 'NETWORK'
    error.status = 0
    throw error
  }
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const locale = document.documentElement.lang?.split('-')[0] || 'ru'
    const error = new Error(safeErrorMessage(response.status, locale))
    error.code = `HTTP_${response.status || 'NETWORK'}`
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

export const api = {
  get: (path) => request(path),
  post: (path, body = {}) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body = {}) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path, body = {}) => request(path, { method: 'DELETE', body: JSON.stringify(body) }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData }),
}

export async function fetchAllPages(path, key, pageSize = 200) {
  const separator = path.includes('?') ? '&' : '?'
  let page = 1
  let rows = []
  let lastPayload = {}
  do {
    lastPayload = await api.get(`${path}${separator}page=${page}&page_size=${pageSize}`)
    rows = rows.concat(lastPayload[key] || [])
    page += 1
  } while (lastPayload.pagination?.has_next)
  return { ...lastPayload, [key]: rows }
}

export function apiErrorMessage(error, fallback = 'Не удалось выполнить запрос.') {
  const payload = error?.payload
  if (typeof payload === 'string' && payload.trim()) return payload.trim()
  if (Array.isArray(payload?.error)) return payload.error.filter(Boolean).join(', ')
  if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error.trim()
  if (typeof payload?.detail === 'string' && payload.detail.trim()) return payload.detail.trim()
  return fallback
}

export async function downloadFile(path, fallbackName) {
  let response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: '*/*' },
    })
  } catch {
    const locale = document.documentElement.lang?.split('-')[0] || 'ru'
    const error = new Error(safeErrorMessage(0, locale))
    error.code = 'NETWORK'
    error.status = 0
    throw error
  }
  if (!response.ok) {
    await response.text()
    const locale = document.documentElement.lang?.split('-')[0] || 'ru'
    const error = new Error(safeErrorMessage(response.status, locale))
    error.code = `HTTP_${response.status || 'NETWORK'}`
    error.status = response.status
    throw error
  }
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const name = match?.[1] || fallbackName || 'download'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return { name }
}

export async function fetchMe() {
  return api.get('/api/me/')
}

export async function productionLogin(credentials) {
  const payload = await api.post('/api/auth/login/', credentials)
  await ensureCsrfToken(true)
  return payload
}

export async function productionLogout() {
  const payload = await api.post('/api/auth/logout/')
  await ensureCsrfToken(true)
  return payload
}

export async function devLogin(role) {
  const payload = await api.post(`/api/dev-login/${role}/`)
  await ensureCsrfToken(true)
  return payload
}

export async function devLogout() {
  return api.post('/api/dev-logout/')
}

export async function fetchResourceMap(loaders) {
  const entries = Object.entries(loaders)
  const settled = await Promise.all(entries.map(async ([key, loader]) => {
    try {
      return [key, { state: 'ok', data: await loader() }]
    } catch (error) {
      return [key, { state: 'error', error, status: error.status || 0 }]
    }
  }))
  const resourceStates = Object.fromEntries(settled)
  const authFailure = Object.values(resourceStates).find(
    (state) => state.status === 401 || state.status === 403,
  )
  if (authFailure) {
    authFailure.error.resourceStates = resourceStates
    throw authFailure.error
  }
  return {
    resourceStates,
    values: Object.fromEntries(Object.entries(resourceStates).map(
      ([key, state]) => [key, state.state === 'ok' ? state.data : {}],
    )),
  }
}

export async function fetchClientPortal({ studentId } = {}) {
  const overview = await api.get('/api/client/overview/')
  const participants = overview.participants || overview.students || []
  const resolvedStudentId = studentId || participants[0]?.id || null
  const target = resolvedStudentId ? `?student_id=${encodeURIComponent(resolvedStudentId)}` : ''
  const { values, resourceStates } = await fetchResourceMap({
    profile: () => api.get('/api/client/profile/'),
    consents: () => api.get('/api/client/consents/'),
    schedule: () => api.get(`/api/client/schedule/${target}`),
    attendance: () => api.get(`/api/client/attendance/${target}`),
    payments: () => api.get(`/api/client/payments/${target}`),
    notifications: () => fetchAllPages('/api/client/notifications/', 'notifications'),
  })
  return { overview, ...values, resourceStates, resolvedStudentId }
}

export async function fetchTrainerPortal() {
  const today = new Date().toISOString().slice(0, 10)
  const result = await fetchResourceMap({
    sessions: () => api.get('/api/trainer/sessions/'),
    groups: () => api.get('/api/trainer/groups/'),
    history: () => api.get(`/api/trainer/history/?date_to=${today}`),
  })
  const { sessions, groups, history } = result.values
  const firstSession = sessions.sessions?.find((session) => !session.is_cancelled) || sessions.sessions?.[0]
  let detail = null
  if (firstSession) {
    const detailResult = await fetchResourceMap({
      detail: () => api.get(`/api/trainer/sessions/${firstSession.id}/`),
    })
    detail = detailResult.values.detail
    result.resourceStates.detail = detailResult.resourceStates.detail
  }
  return { sessions, groups, history, detail, resourceStates: result.resourceStates }
}

export async function fetchAdminPortal() {
  const result = await fetchResourceMap({
    dashboard: () => api.get('/api/admin/dashboard/'),
    reference: () => api.get('/api/admin/reference/'),
    clients: () => fetchAllPages('/api/admin/clients/', 'clients'),
    trainers: () => fetchAllPages('/api/admin/trainers/', 'trainers'),
    groups: () => fetchAllPages('/api/admin/groups/', 'groups'),
    subscriptionTypes: () => fetchAllPages('/api/admin/subscription-types/', 'subscription_types'),
    sessionTypeConfigs: () => fetchAllPages('/api/admin/settings/session-types/', 'session_types'),
    sessions: () => fetchAllPages('/api/admin/schedule/sessions/', 'sessions'),
    payments: () => fetchAllPages('/api/admin/payments/', 'payments'),
    debtors: () => api.get('/api/admin/debtors/'),
  })
  return { ...result.values, resourceStates: result.resourceStates }
}
