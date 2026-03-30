import assert from 'node:assert/strict'
import test from 'node:test'
import {
  scoreDomainMatch,
  scoreTagMatch,
  tokenize,
} from '@/integrations/memory/memory-scoring'
import type { MemoryRecord, SelectionContext } from '@/shared/memory-types'

function record(overrides: Partial<MemoryRecord>): MemoryRecord {
  return {
    id: 'mem_1',
    domain: 'project',
    title: 'Auth middleware',
    content: 'Fix auth middleware scoring',
    sourceType: 'user_input',
    sourceRef: 'note',
    tags: ['Auth', 'Backend'],
    confidence: 'verified',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

test('memory domain scoring applies module bias when explicit domains are absent', () => {
  const context: SelectionContext = { module: 'dev', query: 'middleware' }
  const projectScore = scoreDomainMatch(record({ domain: 'project' }), context)
  const personalScore = scoreDomainMatch(record({ domain: 'personal' }), context)

  assert.equal(projectScore, 1)
  assert.equal(personalScore, 0.25)
})

test('memory tag matching and tokenization are case-insensitive and deduplicated', () => {
  const tagScore = scoreTagMatch(record({ tags: ['Auth', 'Backend'] }), {
    module: 'dev',
    tags: ['auth', 'AUTH', 'frontend'],
  })

  assert.equal(tagScore, 0.5)
  assert.deepEqual(tokenize('auth auth middleware Fix'), ['auth', 'middleware', 'fix'])
})
