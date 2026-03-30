import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildResultSummary,
  decomposePrompt,
  inferRemediationKind,
} from '@/integrations/providers/builder-heuristics'
import type { BuilderTaskContext } from '@/shared/builder-action-types'
import type { BuilderExecutionRun } from '@/adapters/builder-execution'

const context: BuilderTaskContext = {
  projectNotes: [],
  relevantFiles: ['src/index.ts'],
  matchedTags: ['auth'],
  memoryRecordIds: ['mem_1'],
  contextSummary: 'Test context',
  assembledAt: '2026-03-01T00:00:00.000Z',
}

test('builder heuristics infer remediation kind and preserve empty-prompt fallback decomposition', () => {
  assert.equal(inferRemediationKind('Vitest spec is failing in auth flow'), 'fix_failing_test')

  const decomposition = decomposePrompt('Fix auth', context)
  assert.equal(decomposition.taskCount, 1)
  assert.equal(decomposition.subtasks[0]?.id, 'subtask_1')
})

test('builder result summaries surface successful runs clearly', () => {
  const run: BuilderExecutionRun = {
    runId: 'run_1',
    requestId: 'req_1',
    scope: 'repo',
    target: {
      targetType: 'repo',
      targetId: 'repo',
      targetLabel: 'repo',
      targetPaths: ['.'],
    },
    executionState: 'completed',
    status: 'completed',
    source: 'real-bridge',
    sourceLabel: 'real bridge',
    summary: 'Done',
    commandsRun: ['npm run typecheck'],
    filesChanged: ['src/index.ts'],
    verificationStatus: 'passed',
    verificationSummary: 'All checks passed.',
    startedAt: '2026-03-01T00:00:00.000Z',
    finishedAt: '2026-03-01T00:05:00.000Z',
    note: 'ok',
  }

  const summary = buildResultSummary(run)
  assert.equal(summary.verdict, 'success')
  assert.match(summary.headline, /completed successfully/i)
})
