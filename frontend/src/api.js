import { safeErrorMessage } from './contracts.js'

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

const AUTH_GENERATION_KEY = 'swimcrm.auth.generation'
const AUTH_CHANNEL_NAME = 'swimcrm.auth'
const AUTH_SOURCE_ID = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
let apiSessionGeneration = 0

export function invalidateApiSession() {
  apiSessionGeneration += 1
  csrfPromise = null
}

function staleAuthError() {
  const error = new Error('Authentication changed while the request was in flight.')
  error.code = 'AUTH_STALE'
  error.status = 0
  return error
}

function authGeneration(reason) {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
  return { generation: `${Date.now()}:${random}`, reason, source: AUTH_SOURCE_ID }
}

export function publishAuthChange(reason) {
  const change = authGeneration(reason)
  invalidateApiSession()
  try {
    globalThis.localStorage?.setItem(AUTH_GENERATION_KEY, JSON.stringify(change))
  } catch {
    // BroadcastChannel still covers tabs when storage is unavailable.
  }
  if (typeof globalThis.BroadcastChannel === 'function') {
    const channel = new globalThis.BroadcastChannel(AUTH_CHANNEL_NAME)
    channel.postMessage(change)
    channel.close()
  }
  return change
}

export function subscribeAuthChanges(listener) {
  let lastGeneration = ''
  try {
    lastGeneration = JSON.parse(globalThis.localStorage?.getItem(AUTH_GENERATION_KEY) || 'null')?.generation || ''
  } catch {
    lastGeneration = ''
  }
  const deliver = (change) => {
    if (!change?.generation || change.source === AUTH_SOURCE_ID || change.generation === lastGeneration) return
    lastGeneration = change.generation
    invalidateApiSession()
    listener(change)
  }
  const onStorage = (event) => {
    if (event.key !== AUTH_GENERATION_KEY || !event.newValue) return
    try {
      deliver(JSON.parse(event.newValue))
    } catch {
      // Ignore malformed values written by unrelated scripts/extensions.
    }
  }
  globalThis.addEventListener?.('storage', onStorage)
  const channel = typeof globalThis.BroadcastChannel === 'function'
    ? new globalThis.BroadcastChannel(AUTH_CHANNEL_NAME)
    : null
  if (channel) channel.onmessage = (event) => deliver(event.data)
  return () => {
    globalThis.removeEventListener?.('storage', onStorage)
    channel?.close()
  }
}

let csrfPromise = null

async function ensureCsrfToken(force = false) {
  const cookieToken = getCookie('csrftoken')
  if (!force && cookieToken) return cookieToken
  csrfPromise = csrfPromise || fetch('/api/csrf/', {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Accept-Language': document.documentElement.lang || 'ru',
    },
  }).then(async (response) => {
    let payload = {}
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      try {
        payload = await response.json()
      } catch {
        payload = {}
      }
    }
    return getCookie('csrftoken') || payload.csrf_token || ''
  }).finally(() => {
    csrfPromise = null
  })
  return csrfPromise
}

async function request(path, options = {}) {
  const requestGeneration = apiSessionGeneration
  const headers = new Headers(options.headers || {})
  const method = (options.method || 'GET').toUpperCase()
  const locale = document.documentElement.lang || 'ru'
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', locale)
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    const token = getCookie('csrftoken') || await ensureCsrfToken()
    if (requestGeneration !== apiSessionGeneration) throw staleAuthError()
    headers.set('X-CSRFToken', token)
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
  if (requestGeneration !== apiSessionGeneration) throw staleAuthError()
  const contentType = response.headers.get('content-type') || ''
  let payload = {}
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json()
    } catch {
      payload = {}
    }
  } else {
    // Drain the body but never surface an HTML/plain-text diagnostic to the UI.
    await response.text()
  }
  if (!response.ok) {
    const locale = document.documentElement.lang?.split('-')[0] || 'ru'
    const payloadMessage = typeof payload?.error === 'string' ? payload.error.trim() : ''
    const error = new Error(payloadMessage || safeErrorMessage(response.status, locale))
    error.code = payload?.code || `HTTP_${response.status || 'NETWORK'}`
    error.httpCode = `HTTP_${response.status || 'NETWORK'}`
    error.status = response.status
    error.payload = payload
    error.fieldErrors = payload?.errors && typeof payload.errors === 'object' ? payload.errors : {}
    error.nonFieldErrors = Array.isArray(payload?.non_field_errors) ? payload.non_field_errors : []
    error.message = apiErrorMessage(error, error.message)
    throw error
  }
  return payload
}

export const api = {
  get: (path, options = {}) => request(path, options),
  post: (path, body = {}) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body = {}) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path, body = {}) => request(path, { method: 'DELETE', body: JSON.stringify(body) }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData }),
}

export async function fetchAllPages(path, key, pageSize = 200, options = {}) {
  const separator = path.includes('?') ? '&' : '?'
  let page = 1
  let rows = []
  let lastPayload = {}
  do {
    lastPayload = await api.get(`${path}${separator}page=${page}&page_size=${pageSize}`, options)
    rows = rows.concat(lastPayload[key] || [])
    page += 1
  } while (lastPayload.pagination?.has_next)
  return { ...lastPayload, [key]: rows }
}

export function apiErrorMessage(error, fallback = 'Не удалось выполнить запрос.') {
  const payload = error?.payload
  const itemMessage = (item) => typeof item === 'string' ? item : item?.message
  const nonFieldMessage = (error?.nonFieldErrors || payload?.non_field_errors || [])
    .map(itemMessage).filter(Boolean).join(' ')
  if (nonFieldMessage) return nonFieldMessage
  const firstFieldItems = Object.values(error?.fieldErrors || payload?.errors || {})[0]
  const fieldMessage = (Array.isArray(firstFieldItems) ? firstFieldItems : [firstFieldItems])
    .map(itemMessage).filter(Boolean).join(' ')
  if (fieldMessage) return fieldMessage
  if (Array.isArray(payload?.error)) return payload.error.filter(Boolean).join(', ')
  if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error.trim()
  if (typeof payload?.detail === 'string' && payload.detail.trim()) return payload.detail.trim()
  return fallback
}

export async function downloadFile(path, fallbackName) {
  const requestGeneration = apiSessionGeneration
  let response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        Accept: '*/*',
        'Accept-Language': document.documentElement.lang || 'ru',
      },
    })
  } catch {
    const locale = document.documentElement.lang?.split('-')[0] || 'ru'
    const error = new Error(safeErrorMessage(0, locale))
    error.code = 'NETWORK'
    error.status = 0
    throw error
  }
  if (requestGeneration !== apiSessionGeneration) throw staleAuthError()
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

export async function fetchMe(options = {}) {
  return api.get('/api/me/', options)
}

export async function productionLogin(credentials) {
  const payload = await api.post('/api/auth/login/', credentials)
  publishAuthChange('login')
  await ensureCsrfToken(true)
  return payload
}

export async function productionLogout() {
  const payload = await api.post('/api/auth/logout/')
  publishAuthChange('logout')
  await ensureCsrfToken(true)
  return payload
}

export async function devLogin(role) {
  const payload = await api.post(`/api/dev-login/${role}/`)
  publishAuthChange('role-switch')
  await ensureCsrfToken(true)
  return payload
}

export async function devLogout() {
  const payload = await api.post('/api/dev-logout/')
  publishAuthChange('logout')
  return payload
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

export async function fetchClientPortal({ studentId, signal } = {}) {
  const requestOptions = signal ? { signal } : {}
  const overview = await api.get('/api/client/overview/', requestOptions)
  const participants = overview.participants || overview.students || []
  const resolvedStudentId = studentId || participants[0]?.id || null
  const target = resolvedStudentId ? `?student_id=${encodeURIComponent(resolvedStudentId)}` : ''
  const { values, resourceStates } = await fetchResourceMap({
    profile: () => api.get('/api/client/profile/', requestOptions),
    consents: () => api.get('/api/client/consents/', requestOptions),
    schedule: () => api.get(`/api/client/schedule/${target}`, requestOptions),
    notifications: () => fetchAllPages('/api/client/notifications/', 'notifications', 200, requestOptions),
  })
  return {
    overview,
    attendance: { attendance: [] },
    payments: { charges: [], payments: [] },
    ...values,
    resourceStates,
    resolvedStudentId,
  }
}

export async function fetchTrainerPortal({ signal } = {}) {
  const requestOptions = signal ? { signal } : {}
  const result = await fetchResourceMap({
    sessions: () => api.get('/api/trainer/sessions/', requestOptions),
    groups: () => api.get('/api/trainer/groups/', requestOptions),
  })
  const { sessions, groups } = result.values
  const firstSession = sessions.sessions?.find((session) => !session.is_cancelled) || sessions.sessions?.[0]
  let detail = null
  if (firstSession) {
    const detailResult = await fetchResourceMap({
      detail: () => api.get(`/api/trainer/sessions/${firstSession.id}/`, requestOptions),
    })
    detail = detailResult.values.detail
    result.resourceStates.detail = detailResult.resourceStates.detail
  }
  return {
    sessions,
    groups,
    history: { sessions: [] },
    detail,
    resourceStates: result.resourceStates,
  }
}

export async function fetchAdminPortal({ signal } = {}) {
  const requestOptions = signal ? { signal } : {}
  const result = await fetchResourceMap({
    dashboard: () => api.get('/api/admin/dashboard/', requestOptions),
    reference: () => api.get('/api/admin/reference/', requestOptions),
    sessionTypeConfigs: () => fetchAllPages('/api/admin/settings/session-types/', 'session_types', 200, requestOptions),
  })
  const reference = result.values.reference || {}
  return {
    // The existing reference contract supplies selector data. Growing list
    // endpoints themselves are requested only by their owning screens.
    clients: { clients: reference.participants || [] },
    trainers: { trainers: reference.trainers || [] },
    groups: { groups: reference.groups || [] },
    subscriptionTypes: { subscription_types: reference.subscription_types || [] },
    sessions: { sessions: [] },
    payments: { payments: [] },
    debtors: { debtors: [] },
    ...result.values,
    resourceStates: result.resourceStates,
  }
}
