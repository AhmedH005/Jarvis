/**
 * Cross-module memory hooks.
 *
 * These are the primary entry points for other modules to query memory.
 * All reads are live (SAFE_ROOT). All writes are staged (DRY_RUN).
 *
 * Hooks use the selection engine (selectMemory) for ranked, context-aware results.
 *
 * Usage pattern:
 *   import { lookupProjectContext } from '@/integrations/memory/hooks'
 *   const records = await lookupProjectContext(['auth', 'middleware'])
 */

import { selectMemory } from './memory-selector'
import type { MemoryRecord } from '@/shared/memory-types'

// ── Command module ────────────────────────────────────────────────────────────

/**
 * Look up memory records relevant to a natural-language command.
 * Used by the command router to attach prior context to classification.
 */
export async function lookupCommandContext(text: string, limit = 5): Promise<MemoryRecord[]> {
  if (!text.trim()) return []
  const result = await selectMemory({ module: 'command', query: text, limit })
  return result.selectedRecords
}

// ── Concierge module ──────────────────────────────────────────────────────────

/**
 * Look up memory records about a specific person/contact.
 * Used by concierge workers for email replies, booking context, follow-ups.
 */
export async function lookupContactMemory(name: string, limit = 10): Promise<MemoryRecord[]> {
  if (!name.trim()) return []
  const result = await selectMemory({
    module:  'concierge',
    query:   name,
    domains: ['people', 'receipts'],
    limit,
  })
  return result.selectedRecords
}

/**
 * Look up recent operational receipts for admin/concierge context.
 */
export async function lookupAdminContext(limit = 10): Promise<MemoryRecord[]> {
  const result = await selectMemory({
    module:  'concierge',
    domains: ['operational', 'receipts'],
    limit,
  })
  return result.selectedRecords
}

// ── Time module ───────────────────────────────────────────────────────────────

/**
 * Look up scheduling context — recent operational records + personal context.
 * Used by the Time module to attach prior scheduling state to new requests.
 */
export async function lookupSchedulingContext(limit = 8): Promise<MemoryRecord[]> {
  const result = await selectMemory({
    module:  'time',
    domains: ['operational', 'personal'],
    tags:    ['scheduling', 'calendar', 'time'],
    limit,
  })
  return result.selectedRecords
}

// ── Dev / Builder module ──────────────────────────────────────────────────────

/**
 * Look up project context by keyword(s).
 * Used by the Dev module to surface relevant project memory before a task.
 */
export async function lookupProjectContext(keywords: string[], limit = 8): Promise<MemoryRecord[]> {
  if (keywords.length === 0) return []
  const result = await selectMemory({
    module:  'dev',
    query:   keywords.join(' '),
    domains: ['project'],
    limit,
  })
  return result.selectedRecords
}

/**
 * Look up recent execution receipts for a builder task.
 * Useful for "what did we just do" context.
 */
export async function lookupRecentExecutionReceipts(limit = 5): Promise<MemoryRecord[]> {
  const result = await selectMemory({
    module:  'dev',
    domains: ['receipts'],
    limit,
  })
  return result.selectedRecords
}

// ── Generic utility ───────────────────────────────────────────────────────────

/**
 * Look up all records in the personal domain.
 * Used for context-anchor style recovery.
 */
export async function lookupPersonalContext(limit = 10): Promise<MemoryRecord[]> {
  const result = await selectMemory({
    module:  'command',
    domains: ['personal'],
    limit,
  })
  return result.selectedRecords
}

/**
 * Tag-based lookup — useful for module-specific named memory.
 */
export async function lookupByTags(tags: string[], limit = 10): Promise<MemoryRecord[]> {
  const result = await selectMemory({ module: 'memory', tags, limit })
  return result.selectedRecords
}
