/**
 * system module
 *
 * Backend status: LIVE
 * Owned domain: gateway health, session diagnostics, process inspection
 * Live tools: session_status, sessions_list, exec (read-only diagnostics)
 *
 * Policy: system never mutates — read-only. Execution module owns mutations.
 * Mirrors: jarvis-system/modules/system/
 */

import { nanoid } from '@/lib/utils'
import type {
  ModuleId,
  ModuleState,
  ModuleResult,
  Decision,
  Handoff,
} from '@/shared/types'

export const MODULE_ID: ModuleId = 'system'

export const MODULE_STATE: ModuleState = {
  module:              'system',
  status:              'live',
  ownedDomain:         ['gateway health', 'session diagnostics', 'process inspection'],
  currentConstraints:  [
    'read-only — does not mutate system state',
    'exec limited to diagnostic commands',
  ],
  blockedCapabilities: [],
  lastUpdated:         new Date().toISOString(),
  notes:               'session_status, sessions_list, and safe exec are live',
}

export interface SystemOutput {
  gatewayOnline:    boolean
  activeSessionIds: string[]
  diagnosticNotes:  string
  rawOutput?:       string
}

export function parseSystemOutput(raw: string): SystemOutput {
  const online = !raw.toLowerCase().includes('offline') &&
                 !raw.toLowerCase().includes('error') &&
                 raw.trim().length > 0

  return {
    gatewayOnline:    online,
    activeSessionIds: [],
    diagnosticNotes:  raw.slice(0, 500),
    rawOutput:        raw,
  }
}

export function buildSystemResult(output: SystemOutput): ModuleResult<SystemOutput> {
  const decisions: Decision[] = [{
    decisionId:      nanoid(),
    timestamp:       new Date().toISOString(),
    owner:           MODULE_ID,
    summary:         `System diagnostic: gateway ${output.gatewayOnline ? 'online' : 'offline'}`,
    accepted:        true,
    reason:          'Non-mutating read — no approval required',
    sourceRefs:      ['session_status'],
    impactedDomains: ['gateway health'],
  }]

  const handoffs: Handoff[] = []

  return {
    moduleId:            MODULE_ID,
    success:             true,
    data:                output,
    blockedCapabilities: [],
    handoffs,
    decisions,
  }
}
