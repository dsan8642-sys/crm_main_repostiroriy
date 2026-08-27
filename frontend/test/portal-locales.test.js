import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PORTAL_LOCALES,
  PORTAL_MESSAGE_ROWS,
  portalCatalogs,
} from '../src/portalLocales.js'


test('every portal message has a non-empty RU, UK, PL and EN translation', () => {
  assert.deepEqual(PORTAL_LOCALES, ['ru', 'uk', 'pl', 'en'])
  assert.ok(Object.keys(PORTAL_MESSAGE_ROWS).length > 0)

  for (const [key, row] of Object.entries(PORTAL_MESSAGE_ROWS)) {
    assert.equal(row.length, PORTAL_LOCALES.length, `${key} must define every locale`)
    row.forEach((value, index) => {
      assert.equal(typeof value, 'string', `${key}/${PORTAL_LOCALES[index]} must be text`)
      assert.ok(value.trim(), `${key}/${PORTAL_LOCALES[index]} must not be empty`)
    })
  }
})

test('portal catalogs have exact key parity and preserve notification-language wording', () => {
  const expected = Object.keys(PORTAL_MESSAGE_ROWS).sort()
  PORTAL_LOCALES.forEach((locale) => {
    assert.deepEqual(Object.keys(portalCatalogs[locale]).sort(), expected)
  })

  assert.equal(portalCatalogs.ru['client.profile.notificationLanguage'], 'Язык уведомлений')
  assert.equal(portalCatalogs.uk['client.profile.notificationLanguage'], 'Мова сповіщень')
  assert.equal(portalCatalogs.pl['client.profile.notificationLanguage'], 'Język powiadomień')
  assert.equal(portalCatalogs.en['client.profile.notificationLanguage'], 'Notification language')
  assert.equal(portalCatalogs.ru['shared.confirm'], 'Подтвердить')
  assert.equal(portalCatalogs.uk['shared.irreversible'], 'Незворотна дія')
  assert.equal(portalCatalogs.pl['shared.close'], 'Zamknij')
  assert.equal(portalCatalogs.en['shared.cancel'], 'Cancel')
  assert.equal(portalCatalogs.en['shared.noData'], 'No data')
  assert.equal(portalCatalogs.uk['shared.lessonDeducted'], 'Заняття списується')
})
