import assert from 'node:assert/strict'
import test from 'node:test'
import { heuristicClassify } from '@/features/chat/router-fallback'

test('router fallback marks finance as unavailable and unknown input for review', () => {
  const finance = heuristicClassify('What is my budget this month?', 'fallback test')
  const unknown = heuristicClassify('hmm maybe do the thing', 'fallback test')

  assert.equal(finance.targetDomain, 'finance')
  assert.equal(finance.suggestedAction, 'unavailable')
  assert.equal(unknown.routedBy, 'manual_review_required')
  assert.equal(unknown.suggestedAction, 'clarify')
})

test('router fallback routes concierge intents with approval', () => {
  const route = heuristicClassify('Draft an email reply and book a reservation', 'fallback test')

  assert.equal(route.targetDomain, 'concierge')
  assert.equal(route.requiresApproval, true)
  assert.equal(route.suggestedAction, 'approve_and_stage')
})
