/**
 * execution module
 *
 * Backend status: LIVE (approval-gated)
 * Owned domain: approved file mutations, shell commands, write operations
 * Live tools: read, write, edit, exec — ALL gated behind user approval
 *
 * Per backend policy (orchestrator/approval-model.md):
 *   - NEVER executes without an approved ApprovalRequest
 *   - Every mutation goes through ApprovalGate first
 *   - Rollback plan required for every request
 *   - jarvis-prime is the ONLY module that may route to execution
 *
 * Mirrors: jarvis-system/modules/execution/
 */

import { nanoid } from '@/lib/utils'
import type {
  ModuleId,
  ModuleState,
  ModuleResult,
  ApprovalRequest,
  ApprovalResult,
  Decision,
} from '@/shared/types'

export const MODULE_ID: ModuleId = 'execution'

export const MODULE_STATE: ModuleState = {
  module:              'execution',
  status:              'live',
  ownedDomain:         ['file mutations', 'shell commands', 'write operations', 'approved changes'],
  currentConstraints:  [
    'ALL operations require prior ApprovalRequest',
    'jarvis-prime is the sole router to this module',
    'rollback plan required',
    'no silent execution',
  ],
  blockedCapabilities: [],
  lastUpdated:         new Date().toISOString(),
  notes:               'Live but approval-gated. Every mutation needs explicit user approval.',
}

export interface ExecutionPlan {
  approvalRequest: ApprovalRequest
  steps:           ExecutionStep[]
}

export interface ExecutionStep {
  stepId:      string
  description: string
  tool:        'read' | 'write' | 'edit' | 'exec'
  args:        Record<string, string>
  reversible:  boolean
}

export interface ExecutionOutput {
  approvalId:  string
  stepsRun:    number
  stepResults: Array<{ stepId: string; success: boolean; output?: string }>
  summary:     string
}

/** Build an approval request — called BEFORE anything is executed */
export function buildApprovalRequest(params: {
  requestedBy:     ModuleId
  intent:          string
  scope:           string[]
  plan:            string
  expectedOutcome: string
  rollback:        string
}): ApprovalRequest {
  return {
    approvalId:      nanoid(),
    requestedBy:     params.requestedBy,
    intent:          params.intent,
    scope:           params.scope,
    plan:            params.plan,
    expectedOutcome: params.expectedOutcome,
    rollback:        params.rollback,
    priority:        'normal',
    createdAt:       new Date().toISOString(),
  }
}

/** Called after user approves — log the decision and run steps */
export function buildExecutionResult(
  approval: ApprovalResult,
  output: ExecutionOutput,
): ModuleResult<ExecutionOutput> {
  const decisions: Decision[] = [{
    decisionId:      nanoid(),
    timestamp:       new Date().toISOString(),
    owner:           MODULE_ID,
    summary:         `Execution ${approval.approved ? 'completed' : 'rejected'}: ${output.summary}`,
    accepted:        approval.approved,
    reason:          approval.reason ?? (approval.approved ? 'User approved' : 'User rejected'),
    sourceRefs:      [approval.approvalId],
    impactedDomains: ['file mutations', 'shell commands'],
  }]

  return {
    moduleId:            MODULE_ID,
    success:             approval.approved,
    data:                output,
    blockedCapabilities: [],
    handoffs:            [],
    decisions,
  }
}

/** Guard — returns error result if no approval exists */
export function requiresApproval(approvalId: string | undefined): ModuleResult<never> | null {
  if (approvalId) return null
  return {
    moduleId:            MODULE_ID,
    success:             false,
    error:               'Execution blocked: no ApprovalRequest found. Every mutation requires prior approval.',
    blockedCapabilities: [],
    handoffs:            [],
    decisions:           [],
  }
}
