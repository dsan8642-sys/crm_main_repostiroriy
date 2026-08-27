import { apiErrorMessage } from '../api.js'

function itemMessage(item) {
  return typeof item === 'string' ? item : item?.message
}

function messages(items) {
  const source = Array.isArray(items) ? items : [items]
  return [...new Set(source.map(itemMessage).filter(Boolean))].join(' ')
}

export function fieldErrorsFromApi(error, fieldMap = {}) {
  const result = {}
  for (const [serverField, items] of Object.entries(error?.fieldErrors || {})) {
    const localFields = fieldMap[serverField] || serverField
    const message = messages(items)
    if (!message) continue
    for (const localField of Array.isArray(localFields) ? localFields : [localFields]) {
      result[localField] = result[localField]
        ? `${result[localField]} ${message}`
        : message
    }
  }
  return result
}

export function formErrorMessage(error, fallback = '') {
  const nonField = messages(error?.nonFieldErrors || [])
  if (nonField) return nonField
  if (Object.keys(error?.fieldErrors || {}).length) return null
  return apiErrorMessage(error, fallback)
}

export function clearFieldError(errors, field) {
  if (!errors?.[field]) return errors
  const next = { ...errors }
  delete next[field]
  return next
}

export function focusFirstFieldError(errors, fieldIds = {}) {
  const first = Object.keys(errors || {})[0]
  if (!first || typeof document === 'undefined') return
  const target = document.getElementById(fieldIds[first] || first)
  target?.focus()
}
