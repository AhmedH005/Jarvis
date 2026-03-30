import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveActiveCalendarAdapter } from '@/integrations/adapters/calendar/composed-resolution'

test('calendar adapter resolution preserves google then ics then local precedence', () => {
  assert.equal(resolveActiveCalendarAdapter({ googleReadable: true, icsReadable: true }), 'google')
  assert.equal(resolveActiveCalendarAdapter({ googleReadable: false, icsReadable: true }), 'ics')
  assert.equal(resolveActiveCalendarAdapter({ googleReadable: false, icsReadable: false }), 'local')
})
