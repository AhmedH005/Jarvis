/**
 * WorldState store — mirrors shared/world-state.md
 *
 * Single in-memory store of cross-module shared state.
 * jarvis-prime reads this before routing; modules update it via orchestrator.
 * This is NOT persisted to disk — it reflects the current session's live state.
 */

import type { WorldState, ModuleId, ModuleState } from './types'

import { MODULE_STATE as MEMORY_STATE }    from '@/modules/memory'
import { MODULE_STATE as SYSTEM_STATE }    from '@/modules/system'
import { MODULE_STATE as RESEARCH_STATE }  from '@/modules/research'
import { MODULE_STATE as HEALTH_STATE }    from '@/modules/health'
import { MODULE_STATE as MENTAL_STATE }    from '@/modules/mental'
import { MODULE_STATE as CALENDAR_STATE }  from '@/modules/calendar'
import { MODULE_STATE as EXECUTION_STATE } from '@/modules/execution'

// jarvis-prime module state (the orchestrator itself)
const JARVIS_PRIME_STATE: ModuleState = {
  module:              'jarvis-prime',
  status:              'live',
  ownedDomain:         ['orchestration', 'routing', 'conflict resolution'],
  currentConstraints:  [],
  blockedCapabilities: [],
  lastUpdated:         new Date().toISOString(),
  notes:               'Main orchestrator — always live',
}

const INITIAL_STATE: WorldState = {
  identity: {
    name:     'JARVIS',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale:   navigator.language ?? 'en-US',
  },
  operations: {
    activeModules:    ['jarvis-prime', 'memory', 'system', 'health', 'mental', 'execution'],
    blockedModules:   ['research'],
    pendingHandoffs:  [],
    pendingApprovals: [],
  },
  scheduleIntent: {
    pendingBlocks:      [],
    lastKnownSchedule:  'No schedule data available (calendar is defined-only)',
  },
  healthPlan: {
    currentFocus:   '',
    activeSessions: [],
    constraints:    [],
  },
  mentalState: {
    overloadFlag: false,
    bufferNeeded: false,
    currentMode:  'normal',
    notes:        '',
  },
  memoryContext: {
    recentSnippets: [],
  },
  executionQueue: [],
  moduleStates: {
    'jarvis-prime': JARVIS_PRIME_STATE,
    'memory':       MEMORY_STATE,
    'system':       SYSTEM_STATE,
    'research':     RESEARCH_STATE,
    'health':       HEALTH_STATE,
    'mental':       MENTAL_STATE,
    'calendar':     CALENDAR_STATE,
    'execution':    EXECUTION_STATE,
  },
}

class WorldStateStore {
  private state: WorldState = structuredClone(INITIAL_STATE)

  get(): WorldState {
    return this.state
  }

  update(partial: DeepPartial<WorldState>): void {
    this.state = deepMerge(this.state, partial) as WorldState
  }

  moduleState(moduleId: ModuleId): ModuleState {
    return this.state.moduleStates[moduleId]
  }

  reset(): void {
    this.state = structuredClone(INITIAL_STATE)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T

function deepMerge(base: unknown, override: unknown): unknown {
  if (typeof override !== 'object' || override === null) return override
  if (typeof base    !== 'object' || base    === null) return override
  const result = { ...(base as Record<string, unknown>) }
  for (const key of Object.keys(override as Record<string, unknown>)) {
    const k = key as string
    result[k] = deepMerge(
      (base as Record<string, unknown>)[k],
      (override as Record<string, unknown>)[k],
    )
  }
  return result
}

export const worldState = new WorldStateStore()
