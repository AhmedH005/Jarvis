import assert from 'node:assert/strict'
import test from 'node:test'
import {
  blockedResult,
  buildProviderFailure,
  stagedResult,
} from '@/integrations/contracts/result-helpers'

test('staged provider results preserve stage metadata and normalized status', () => {
  const result = stagedResult(
    {
      providerKey: 'mail-provider',
      action: 'mail:sendMessage',
      stagedActionId: 'act_123',
    },
    'Mail send staged.',
    undefined,
    { status: 'blockedByDryRun' },
  )

  assert.equal(result.ok, true)
  assert.equal(result.state, 'staged')
  assert.equal(result.status, 'blockedByDryRun')
  assert.equal(result.trace?.stagedActionId, 'act_123')
})

test('blocked provider results carry normalized failure status', () => {
  const failure = buildProviderFailure('blockedByCapability', 'capability_network_disabled', 'network disabled', false)
  const result = blockedResult(
    {
      providerKey: 'mail-provider',
      action: 'mail:fetchRecentMessages',
    },
    'Network blocked.',
    'blockedByCapability',
    failure,
  )

  assert.equal(result.ok, false)
  assert.equal(result.state, 'unavailable')
  assert.equal(result.status, 'blockedByCapability')
  assert.equal(result.failure?.status, 'blockedByCapability')
})
