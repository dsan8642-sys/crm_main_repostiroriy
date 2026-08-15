import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildListUrl,
  createListRequestController,
  listStateKey,
  shouldRequestSearch,
  visiblePageNumbers,
} from '../src/app/listContracts.js'


test('list search waits for two characters and keeps blank as the baseline request', () => {
  assert.equal(shouldRequestSearch(''), true)
  assert.equal(shouldRequestSearch(' а '), false)
  assert.equal(shouldRequestSearch(' аб '), true)
})

test('list URLs preserve ownership parameters and send explicit page policy', () => {
  const url = buildListUrl('/api/client/attendance/?student_id=17', {
    page: 2,
    page_size: 20,
    search: 'дельфин',
    status: '',
    order: '-date',
  })
  const parsed = new URL(url, 'http://local.test')
  assert.equal(parsed.pathname, '/api/client/attendance/')
  assert.equal(parsed.searchParams.get('student_id'), '17')
  assert.equal(parsed.searchParams.get('page'), '2')
  assert.equal(parsed.searchParams.get('page_size'), '20')
  assert.equal(parsed.searchParams.get('search'), 'дельфин')
  assert.equal(parsed.searchParams.has('status'), false)
})

test('session list keys isolate user role and route', () => {
  assert.equal(
    listStateKey({ userKey: 9, role: 'trainer', route: 'history' }),
    'swimcrm.ui.list.9.trainer.history',
  )
})

test('desktop page numbers keep the current page reachable in long lists', () => {
  assert.deepEqual(visiblePageNumbers(1, 20), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(visiblePageNumbers(10, 20), [7, 8, 9, 10, 11, 12, 13])
  assert.deepEqual(visiblePageNumbers(20, 20), [14, 15, 16, 17, 18, 19, 20])
})

test('monotonic request IDs prevent an older response replacing a newer one', async () => {
  const pending = []
  const controller = createListRequestController((url, options) => new Promise((resolve) => {
    pending.push({ url, signal: options.signal, resolve })
  }))

  const older = controller.run('/older')
  const newer = controller.run('/newer')
  assert.equal(pending[0].signal.aborted, true)

  pending[1].resolve({ rows: ['newer'] })
  pending[0].resolve({ rows: ['older'] })

  assert.deepEqual(await newer, { payload: { rows: ['newer'] }, stale: false })
  assert.deepEqual(await older, { payload: { rows: ['older'] }, stale: true })
})
