import assert from 'node:assert/strict'
import test from 'node:test'
import { decideGovernance } from '@/integrations/governance/governance-decision'

test('governance blocks missing permissions before capability checks', () => {
  const result = decideGovernance({
    trustLevel: 'trusted',
    blockedReasons: [],
    grantedPermissions: ['network'],
    requiredScopes: ['network', 'calendar'],
    isWriteOperation: false,
    runtime: {
      networkEnabled: false,
      executeEnabled: true,
      writeEnabled: true,
      dryRun: false,
    },
  })

  assert.equal(result.decision, 'blocked_by_governance')
  assert.deepEqual(result.missingPermissions, ['calendar'])
})

test('governance returns restricted and dry-run outcomes deterministically', () => {
  const restricted = decideGovernance({
    trustLevel: 'restricted',
    blockedReasons: [],
    notes: 'manual review required',
    grantedPermissions: ['network'],
    requiredScopes: ['network'],
    isWriteOperation: false,
    runtime: {
      networkEnabled: true,
      executeEnabled: true,
      writeEnabled: true,
      dryRun: false,
    },
  })

  const dryRun = decideGovernance({
    trustLevel: 'trusted',
    blockedReasons: [],
    grantedPermissions: ['write_files'],
    requiredScopes: ['write_files'],
    isWriteOperation: true,
    runtime: {
      networkEnabled: true,
      executeEnabled: true,
      writeEnabled: true,
      dryRun: true,
    },
  })

  assert.equal(restricted.decision, 'requires_elevated_approval')
  assert.match(restricted.reason, /manual review required/i)
  assert.equal(dryRun.decision, 'blocked_by_dry_run')
})
