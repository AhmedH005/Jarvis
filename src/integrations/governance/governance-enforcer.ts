/**
 * Governance Enforcer — the single shared enforcement path for all skill-backed actions.
 *
 * Every real provider action should call `enforce()` before any capability or DRY_RUN check.
 * The enforcer runs the full chain:
 *   1. Governance check (trust level + permission scopes)
 *   2. Audit entry recorded
 *   3. Typed EnforcementResult returned
 *
 * Providers use the result to short-circuit early if `!result.allowed`.
 * Converters `toOperationResult` and `toCalendarResult` produce typed provider outcomes.
 *
 * Decision priority (first match wins):
 *   1. trust=blocked → blocked_by_governance
 *   2. missing required permissions → blocked_by_governance
 *   3. trust=restricted → requires_elevated_approval (allowed: true — staging ok, exec needs consent)
 *   4. capability gate disabled → blocked_by_capability
 *   5. write op + DRY_RUN → blocked_by_dry_run (allowed: true — staging proceeds normally)
 *   6. unknown/unverified trust → allowed_to_stage (flagged for vetting, staging ok)
 *   7. vetted/trusted + perms satisfied → allowed_to_stage or allowed_read_only
 */

import type { ProviderOperationResult } from '@/integrations/contracts/base'
import type { CalendarActionResult } from '@/calendar/calendarTypes'
import {
  blockedResult,
  buildProviderFailure,
  calendarFailureResult,
} from '@/integrations/contracts/result-helpers'
import type {
  SkillPermissionScope,
  GovernanceDecision,
  SkillTrustLevel,
  EnforcementOutcome,
} from '@/shared/skill-governance-types'
import { checkSkillGovernance } from './skill-governance'
import { recordAuditEntry } from './audit-trail'

// ── Result type ───────────────────────────────────────────────────────────────

export interface EnforcementResult {
  /** True when the action may proceed (to staging or read). False when it must be rejected. */
  allowed:              boolean
  outcome:              EnforcementOutcome
  skillId:              string
  providerKey:          string
  action:               string
  reason:               string
  governanceDecision:   GovernanceDecision
  trustLevel:           SkillTrustLevel
  permissionsRequired:  SkillPermissionScope[]
  permissionsMissing:   SkillPermissionScope[]
  auditEntryId:         string
  checkedAt:            string
}

// ── allowed-to-proceed map ────────────────────────────────────────────────────

const ALLOWED_OUTCOMES: EnforcementOutcome[] = [
  'allowed_to_stage',
  'allowed_read_only',
  'requires_elevated_approval',  // staging ok; live exec needs consent
  'blocked_by_dry_run',          // staging proceeds; provider handles DRY_RUN path
]

// ── Core enforcement function ─────────────────────────────────────────────────

/**
 * Run the full governance + audit chain for a skill-backed action.
 *
 * @param skillId       - The governance skill id (must match KNOWN_SKILL_CATALOG)
 * @param providerKey   - The provider key (for audit trail)
 * @param action        - Human-readable action description (for audit trail)
 * @param requiredScopes - Permission scopes this action needs
 * @param isWriteOp     - True for write/mutation operations
 */
export async function enforce(
  skillId:         string,
  providerKey:     string,
  action:          string,
  requiredScopes:  SkillPermissionScope[],
  isWriteOp:       boolean = false,
): Promise<EnforcementResult> {
  // 1. Run governance check (trust + permissions + capability + DRY_RUN)
  const govCheck = await checkSkillGovernance(skillId, providerKey, action, requiredScopes, isWriteOp)

  // 2. Map governance decision → enforcement outcome
  const outcome = decisionToOutcome(govCheck.decision, isWriteOp)
  const allowed = ALLOWED_OUTCOMES.includes(outcome)

  // 3. Record audit entry with richer Phase-5 fields
  const auditEntry = recordAuditEntry({
    skillId,
    providerKey,
    action,
    decision:             govCheck.decision,
    trustLevel:           govCheck.trustLevel,
    reason:               govCheck.reason,
    enforcementOutcome:   outcome,
    permissionsRequired:  govCheck.permissionsRequired,
    permissionsMissing:   govCheck.permissionsMissing,
    isWriteOp,
  })

  return {
    allowed,
    outcome,
    skillId,
    providerKey,
    action,
    reason:               govCheck.reason,
    governanceDecision:   govCheck.decision,
    trustLevel:           govCheck.trustLevel,
    permissionsRequired:  govCheck.permissionsRequired,
    permissionsMissing:   govCheck.permissionsMissing,
    auditEntryId:         auditEntry.entryId,
    checkedAt:            govCheck.checkedAt,
  }
}

function decisionToOutcome(decision: GovernanceDecision, isWriteOp: boolean): EnforcementOutcome {
  switch (decision) {
    case 'blocked_by_governance':    return 'blocked_by_governance'
    case 'requires_elevated_approval': return 'requires_elevated_approval'
    case 'blocked_by_capability':    return 'blocked_by_capability'
    case 'blocked_by_dry_run':       return 'blocked_by_dry_run'
    case 'allowed_to_stage':         return isWriteOp ? 'allowed_to_stage' : 'allowed_read_only'
  }
}

// ── Converters ────────────────────────────────────────────────────────────────

/**
 * Convert a non-allowed EnforcementResult into a ProviderOperationResult.
 * Only call this when `result.allowed === false`.
 */
export function toOperationResult<T>(result: EnforcementResult): ProviderOperationResult<T> {
  const status =
    result.outcome === 'blocked_by_governance'
      ? 'blockedByGovernance'
      : result.outcome === 'blocked_by_capability'
      ? 'blockedByCapability'
      : result.outcome === 'blocked_by_dry_run'
      ? 'blockedByDryRun'
      : 'unavailable'

  return blockedResult(
    {
      providerKey: result.providerKey,
      action: result.action,
      auditEntryId: result.auditEntryId,
      notes: [result.reason],
      metadata: {
        governanceDecision: result.governanceDecision,
        trustLevel: result.trustLevel,
        permissionsRequired: result.permissionsRequired,
        permissionsMissing: result.permissionsMissing,
      },
    },
    `${result.action} blocked — ${result.reason}`,
    status === 'blockedByDryRun' ? 'unavailable' : status,
    buildProviderFailure(
      status,
      `governance_${result.outcome}`,
      result.reason,
      false,
      {
        governanceDecision: result.governanceDecision,
        permissionsMissing: result.permissionsMissing,
      },
    ),
  )
}

/**
 * Convert a non-allowed EnforcementResult into a CalendarActionResult.
 * Only call this when `result.allowed === false`.
 */
export function toCalendarResult<T>(result: EnforcementResult): CalendarActionResult<T> {
  const status =
    result.outcome === 'blocked_by_governance'
      ? 'blockedByGovernance'
      : result.outcome === 'blocked_by_capability'
      ? 'blockedByCapability'
      : result.outcome === 'blocked_by_dry_run'
      ? 'blockedByDryRun'
      : 'unavailable'

  return calendarFailureResult(
    {
      providerKey: result.providerKey,
      action: result.action,
      auditEntryId: result.auditEntryId,
      notes: [result.reason],
      metadata: {
        governanceDecision: result.governanceDecision,
        permissionsRequired: result.permissionsRequired,
        permissionsMissing: result.permissionsMissing,
      },
    },
    `${result.action} blocked — ${result.reason}`,
    status,
    buildProviderFailure(
      status,
      `governance_${result.outcome}`,
      result.reason,
      false,
      {
        governanceDecision: result.governanceDecision,
        permissionsMissing: result.permissionsMissing,
      },
    ),
  )
}
