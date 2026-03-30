import type {
  GovernanceDecision,
  SkillPermissionScope,
  SkillTrustLevel,
} from '@/shared/skill-governance-types'

export interface GovernanceDecisionInput {
  trustLevel: SkillTrustLevel
  blockedReasons: string[]
  notes?: string
  grantedPermissions: SkillPermissionScope[]
  requiredScopes: SkillPermissionScope[]
  isWriteOperation: boolean
  runtime: {
    networkEnabled: boolean
    executeEnabled: boolean
    writeEnabled: boolean
    dryRun: boolean
  }
}

export interface GovernanceDecisionOutput {
  decision: GovernanceDecision
  reason: string
  missingPermissions: SkillPermissionScope[]
}

export function decideGovernance(input: GovernanceDecisionInput): GovernanceDecisionOutput {
  const missingPermissions = input.requiredScopes.filter((scope) => !input.grantedPermissions.includes(scope))

  if (input.trustLevel === 'blocked') {
    return {
      decision: 'blocked_by_governance',
      reason: input.blockedReasons.length > 0
        ? `Skill is blocked: ${input.blockedReasons.join('; ')}`
        : 'Skill is blocked by governance policy.',
      missingPermissions,
    }
  }

  if (missingPermissions.length > 0 && input.requiredScopes.length > 0) {
    return {
      decision: 'blocked_by_governance',
      reason: `Missing required permissions: ${missingPermissions.join(', ')}.`,
      missingPermissions,
    }
  }

  if (input.trustLevel === 'restricted') {
    return {
      decision: 'requires_elevated_approval',
      reason: input.notes
        ? `Skill is restricted: ${input.notes}`
        : 'Skill requires elevated approval before execution.',
      missingPermissions,
    }
  }

  if (!input.runtime.networkEnabled && input.requiredScopes.includes('network')) {
    return {
      decision: 'blocked_by_capability',
      reason: 'network capability is disabled.',
      missingPermissions,
    }
  }

  if (!input.runtime.executeEnabled && input.requiredScopes.includes('dev_execution')) {
    return {
      decision: 'blocked_by_capability',
      reason: 'execute capability is disabled.',
      missingPermissions,
    }
  }

  if (!input.runtime.writeEnabled && (input.isWriteOperation || input.requiredScopes.includes('write_files'))) {
    return {
      decision: 'blocked_by_capability',
      reason: 'write capability is disabled.',
      missingPermissions,
    }
  }

  if (input.isWriteOperation && input.runtime.dryRun) {
    return {
      decision: 'blocked_by_dry_run',
      reason: 'DRY_RUN is enabled — writes are staged.',
      missingPermissions,
    }
  }

  return {
    decision: 'allowed_to_stage',
    reason: input.trustLevel === 'unknown'
      ? 'Skill is unassessed — staging permitted; requires vetting before live execution.'
      : input.trustLevel === 'unverified'
      ? 'Skill is known but not vetted — staging permitted.'
      : `Skill is ${input.trustLevel} with required permissions granted.`,
    missingPermissions,
  }
}
