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

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
  })
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.error ? payload.error : `HTTP ${response.status}`
    const error = new Error(Array.isArray(message) ? message.join(', ') : String(message))
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

export const api = {
  get: (path) => request(path),
  post: (path, body = {}) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData }),
}

export async function downloadFile(path, fallbackName) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: '*/*' },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `HTTP ${response.status}`)
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

export async function fetchClientPortal() {
  const [overview, profile, consents, schedule, attendance, payments] = await Promise.all([
    api.get('/api/client/overview/'),
    api.get('/api/client/profile/'),
    api.get('/api/client/consents/'),
    api.get('/api/client/schedule/'),
    api.get('/api/client/attendance/'),
    api.get('/api/client/payments/'),
  ])
  return { overview, profile, consents, schedule, attendance, payments }
}

export async function fetchTrainerPortal() {
  const today = new Date().toISOString().slice(0, 10)
  const [sessions, groups, history] = await Promise.all([
    api.get('/api/trainer/sessions/'),
    api.get('/api/trainer/groups/'),
    api.get(`/api/trainer/history/?date_to=${today}`),
  ])
  const firstSession = sessions.sessions?.find((session) => !session.is_cancelled) || sessions.sessions?.[0]
  const detail = firstSession ? await api.get(`/api/trainer/sessions/${firstSession.id}/`) : null
  return { sessions, groups, history, detail }
}

export async function fetchAdminPortal() {
  const today = new Date().toISOString().slice(0, 10)
  const [dashboard, reference, clients, trainers, groups, subscriptionTypes, templates, sessions, payments, debtors] = await Promise.all([
    api.get('/api/admin/dashboard/'),
    api.get('/api/admin/reference/'),
    api.get('/api/admin/clients/'),
    api.get('/api/admin/trainers/'),
    api.get('/api/admin/groups/'),
    api.get('/api/admin/subscription-types/'),
    api.get('/api/admin/schedule/templates/'),
    api.get(`/api/admin/schedule/sessions/?date_from=${today}`),
    api.get('/api/admin/payments/'),
    api.get('/api/admin/debtors/'),
  ])
  return { dashboard, reference, clients, trainers, groups, subscriptionTypes, templates, sessions, payments, debtors }
}
