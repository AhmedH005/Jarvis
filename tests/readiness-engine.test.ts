import assert from 'node:assert/strict'
import test from 'node:test'
import { derivePromotionStage, deriveReadinessLevel } from '@/integrations/runtime/readiness-engine'

test('readiness level distinguishes bridge, blocker, and verified states', () => {
  assert.equal(deriveReadinessLevel([]), 'write_ready')
  assert.equal(
    deriveReadinessLevel([
      { type: 'bridge_absent', reason: 'missing bridge', resolution: 'wire bridge' },
    ]),
    'not_wired',
  )
  assert.equal(
    deriveReadinessLevel([
      { type: 'dry_run', reason: 'dry run', resolution: 'disable dry run' },
    ]),
    'runtime_verified',
  )
})

test('promotion stage keeps dry-run writes separate from governance blocks', () => {
  assert.equal(
    derivePromotionStage([
      { type: 'dry_run', reason: 'dry run', resolution: 'disable dry run' },
    ], true),
    'write_live_candidate',
  )

  assert.equal(
    derivePromotionStage([
      { type: 'governance_restricted', reason: 'governance', resolution: 'vet skill' },
    ], true),
    'staged_only',
  )
})
