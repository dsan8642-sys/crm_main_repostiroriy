import test from 'node:test'
import assert from 'node:assert/strict'

import { PAYMENT_METHODS, errorCode, participantKey, paymentMethodLabel, resourceState, safeErrorMessage } from '../src/contracts.js'
import { api, apiErrorMessage, downloadFile, fetchResourceMap } from '../src/api.js'
import { clientAutoLogin, updateClientIdentity } from '../src/app/clientContracts.js'
import { fieldErrorsFromApi, formErrorMessage } from '../src/app/formErrors.js'

test('resource states are discriminated and reject unknown variants', () => {
  assert.deepEqual(resourceState('ok', { data: [1] }), { state: 'ok', data: [1] })
  assert.throws(() => resourceState('stale'), /Unknown resource state/)
})

test('secondary resource failure preserves successful resources', async () => {
  const result = await fetchResourceMap({
    primary: async () => ({ id: 1 }),
    secondary: async () => { const error = new Error('raw'); error.status = 500; throw error },
  })
  assert.deepEqual(result.values.primary, { id: 1 })
  assert.deepEqual(result.values.secondary, {})
  assert.equal(result.resourceStates.secondary.state, 'error')
})

test('authorization failures remain a hard boundary', async () => {
  await assert.rejects(
    fetchResourceMap({
      primary: async () => ({ id: 1 }),
      private: async () => { const error = new Error('raw'); error.status = 403; throw error },
    }),
    (error) => error.status === 403 && error.resourceStates.primary.state === 'ok',
  )
})

test('safe errors, payment methods and keys are deterministic', () => {
  assert.equal(errorCode(403), 'forbidden')
  assert.equal(safeErrorMessage(500, 'en'), 'The service is temporarily unavailable.')
  assert.equal(safeErrorMessage(403, 'uk'), 'У вас немає доступу до цієї дії.')
  assert.deepEqual(PAYMENT_METHODS.map((item) => item.code), ['cash', 'bank_transfer', 'card', 'other'])
  assert.equal(paymentMethodLabel('card', 'pl'), 'Karta')
  assert.equal(paymentMethodLabel('bank_transfer', 'uk'), 'Банківський переказ / IBAN')
  assert.equal(participantKey(4, 9), 'client-4-participant-9')
  assert.throws(() => participantKey(null, 9))
})

test('api errors preserve structured field and non-field validation details', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  globalThis.document = {
    cookie: 'csrftoken=test-token',
    documentElement: { lang: 'ru' },
  }
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: 'Проверьте отмеченные поля.',
    code: 'validation_error',
    errors: {
      'account.email': [{ code: 'duplicate', message: 'Этот email уже используется.' }],
    },
    non_field_errors: [{ code: 'conflict', message: 'Данные конфликтуют.' }],
  }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  })

  try {
    await assert.rejects(
      api.post('/api/admin/clients/', {}),
      (error) => {
        assert.equal(error.code, 'validation_error')
        assert.equal(error.fieldErrors['account.email'][0].code, 'duplicate')
        assert.equal(error.nonFieldErrors[0].message, 'Данные конфликтуют.')
        assert.equal(apiErrorMessage(error), 'Данные конфликтуют.')
        return true
      },
    )
  } finally {
    globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})

test('mutations use the current CSRF cookie after another tab rotates it', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  const requestHeaders = []
  globalThis.document = {
    cookie: 'csrftoken=first-token',
    documentElement: { lang: 'uk-UA' },
  }
  globalThis.fetch = async (_path, options) => {
    const headers = new Headers(options.headers)
    requestHeaders.push({
      csrf: headers.get('X-CSRFToken'),
      language: headers.get('Accept-Language'),
    })
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    await api.post('/api/test-mutation/', { value: 1 })
    globalThis.document.cookie = 'csrftoken=second-token'
    await api.post('/api/test-mutation/', { value: 2 })
    assert.deepEqual(requestHeaders, [
      { csrf: 'first-token', language: 'uk-UA' },
      { csrf: 'second-token', language: 'uk-UA' },
    ])
  } finally {
    globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})

test('non-JSON mutation errors are redacted and never replayed', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.document = {
    cookie: 'csrftoken=current-token',
    documentElement: { lang: 'ru' },
  }
  globalThis.fetch = async () => {
    requests += 1
    return new Response('<html><body>DEBUG secret diagnostic</body></html>', {
      status: 403,
      headers: { 'content-type': 'text/html' },
    })
  }

  try {
    await assert.rejects(
      api.post('/api/test-mutation/', { value: 1 }),
      (error) => {
        assert.equal(error.status, 403)
        assert.equal(error.message, safeErrorMessage(403, 'ru'))
        assert.doesNotMatch(error.message, /DEBUG|html|diagnostic/i)
        return true
      },
    )
    assert.equal(requests, 1)
  } finally {
    globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})

test('downloads send the current UI language and redact error bodies', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  let language = null
  globalThis.document = { documentElement: { lang: 'pl' } }
  globalThis.fetch = async (_path, options) => {
    language = new Headers(options.headers).get('Accept-Language')
    return new Response('<html>private proxy diagnostic</html>', {
      status: 403,
      headers: { 'content-type': 'text/html' },
    })
  }

  try {
    await assert.rejects(
      downloadFile('/api/private-export/', 'export.xlsx'),
      (error) => error.message === safeErrorMessage(403, 'pl'),
    )
    assert.equal(language, 'pl')
  } finally {
    globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})

test('client login stays automatic until the administrator edits it', () => {
  const email = clientAutoLogin({
    firstName: 'Anna', lastName: 'Nowak',
    email: ' ANNA@Example.COM ', phone: '+48 500-111-222',
  })
  const phone = clientAutoLogin({ phone: '+48 500-111-222' })
  const name = clientAutoLogin({ firstName: 'Jan', lastName: 'Kowalski' })
  assert.equal(email, 'anna@example.com')
  assert.equal(phone, '48500111222')
  assert.equal(name, 'jan.kowalski')

  const manual = updateClientIdentity({
    firstName: 'Anna', lastName: 'Nowak', email: '', phone: '',
    username: 'anna.nowak', usernameManual: false,
  }, 'username', 'custom.login')
  assert.deepEqual(
    updateClientIdentity(manual, 'email', 'anna@example.com'),
    { ...manual, email: 'anna@example.com' },
  )
  assert.equal(updateClientIdentity(manual, 'username', '').username, 'anna.nowak')
})

test('structured api fields map to local form fields without a generic banner', () => {
  const error = {
    fieldErrors: {
      'account.email': [{ code: 'duplicate', message: 'Email занят.' }],
      'account.username': [{ code: 'duplicate', message: 'Логин занят.' }],
    },
    nonFieldErrors: [],
  }
  assert.deepEqual(fieldErrorsFromApi(error, {
    'account.email': 'email',
    'account.username': 'username',
  }), {
    email: 'Email занят.',
    username: 'Логин занят.',
  })
  assert.equal(formErrorMessage(error), null)
})
