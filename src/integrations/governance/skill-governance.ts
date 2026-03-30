/**
 * Skill Governance — enforcement layer, inventory, and verification hooks.
 *
 * This module answers:
 *   - what skills are wired / installed
 *   - what each skill is allowed to do
 *   - whether a skill is trusted for a given action
 *   - why an action is staged, restricted, or blocked
 *
 * All decisions are deterministic and explainable.
 * No skill silently gains permissions.
 * No trust is assumed — every trust decision is recorded.
 */

import { CAPABILITIES, DRY_RUN } from '@/shared/operational-safety'
import type {
  SkillGovernanceRecord,
  SkillPermissionScope,
  SkillProvenance,
  GovernanceCheckResult,
  GovernanceDecision,
} from '@/shared/skill-governance-types'
import {
  loadGovernanceStore,
  buildDefaultRecord,
  mergeRecord,
  stageRecordUpdate,
  stageTrustLevelChange,
  stagePermissionsUpdate,
} from './skill-governance-store'
import { decideGovernance } from './governance-decision'

// ── Known skill catalog ───────────────────────────────────────────────────────

/**
 * Canonical inventory of known skills.
 * Provenance and default permission scopes assigned by source.
 * All default to trust level 'unknown' — must be explicitly promoted.
 */
const KNOWN_SKILL_CATALOG: Array<{
  skillId:     string
  label:       string
  provenance:  SkillProvenance
  defaultPermissions: SkillPermissionScope[]
}> = [
  {
    skillId: 'agent-task-manager',
    label:   'Agent Task Manager',
    provenance: { sourceRegistry: 'openclaw', sourceSlug: 'agent-task-manager', installLocation: 'openclaw', verificationMethod: 'none' },
    defaultPermissions: ['dev_execution', 'network'],
  },
  {
    skillId: 'agent-orchestrator',
    label:   'Agent Orchestrator',
    provenance: { sourceRegistry: 'openclaw', sourceSlug: 'agent-orchestrator', installLocation: 'openclaw', verificationMethod: 'none' },
    defaultPermissions: ['dev_execution', 'network'],
  },
  {
    skillId: 'advanced-calendar',
    label:   'Advanced Calendar',
    provenance: { sourceRegistry: 'openclaw', sourceSlug: 'advanced-calendar', installLocation: 'openclaw', verificationMethod: 'none' },
    defaultPermissions: ['calendar', 'external_api'],
  },
  {
    skillId: 'cron-scheduling',
    label:   'Cron Scheduling',
    provenance: { sourceRegistry: 'openclaw', sourceSlug: 'cron-scheduling', installLocation: 'openclaw', verificationMethod: 'none' },
    defaultPermissions: ['dev_execution'],
  },
  {
    skillId: 'agent-mail-cli',
    label:   'Agent Mail CLI',
    provenance: { sourceRegistry: 'openclaw', sourceSlug: 'agent-mail-cli', installLocation: 'openclaw', verificationMethod: 'none' },
    defaultPermissions: ['email', 'external_api', 'network'],
  },
  {
    skillId: 'bookameeting',
    label:   'Book a Meeting',
    provenance: { sourceRegistry: 'openclaw', sourceSlug: 'bookameeting', installLocation: 'openclaw', verificationMethod: 'none' },
    defaultPermissions: ['calendar', 'external_api', 'network'],
  },
  {
    skillId: 'elevenlabs-tts',
    label:   'ElevenLabs TTS',
    provenance: { sourceRegistry: 'openclaw', sourceSlug: 'elevenlabs-tts', installLocation: 'openclaw', verificationMethod: 'none' },
    defaultPermissions: ['external_api', 'media_generation'],
  },
  {
    skillId: 'elevenlabs-transcribe',
    label:   'ElevenLabs Transcribe',
    provenance: { sourceRegistry: 'openclaw', sourceSlug: 'elevenlabs-transcribe', installLocation: 'openclaw', verificationMethod: 'none' },
    defaultPermissions: ['external_api'],
  },
  {
    skillId: 'eachlabs-music',
    label:   'EachLabs Music',
    provenance: { sourceRegistry: 'openclaw', sourceSlug: 'eachlabs-music', installLocation: 'openclaw', verificationMethod: 'none' },
    defaultPermissions: ['external_api', 'media_generation'],
  },
  {
    skillId: 'brainrepo',
    label:   'Brainrepo',
    provenance: { sourceRegistry: 'builtin', sourceSlug: 'brainrepo', installLocation: 'jarvis-runtime', verificationMethod: 'manifest_check' },
    defaultPermissions: ['read_files'],
  },
  {
    skillId: 'context-anchor',
    label:   'Context Anchor',
    provenance: { sourceRegistry: 'builtin', sourceSlug: 'context-anchor', installLocation: 'jarvis-runtime', verificationMethod: 'manifest_check' },
    defaultPermissions: ['read_files'],
  },
  {
    skillId: 'actual-budget',
    label:   'Actual Budget',
    provenance: { sourceRegistry: 'openclaw', sourceSlug: 'actual-budget', installLocation: 'openclaw', verificationMethod: 'none' },
    defaultPermissions: ['read_files', 'external_api'],
  },
]

// ── Governance enforcement ────────────────────────────────────────────────────

/**
 * Core governance check. Call this before any skill-backed provider execution.
 *
 * Decision priority:
 *  1. blocked trustLevel → blocked_by_governance
 *  2. missing required permissions → blocked_by_governance
 *  3. restricted trustLevel → requires_elevated_approval
 *  4. capability gate disabled → blocked_by_capability
 *  5. DRY_RUN for write ops → blocked_by_dry_run
 *  6. unknown/unverified trust → allowed_to_stage (flagged for vetting)
 *  7. vetted/trusted + permissions satisfied → allowed_to_stage
 */
export async function checkSkillGovernance(
  skillId:          string,
  providerKey:      string,
  action:           string,
  requiredScopes:   SkillPermissionScope[],
  isWriteOperation: boolean = false,
): Promise<GovernanceCheckResult> {
  const store  = await loadGovernanceStore()
  const record = store[skillId] ?? null

  const trustLevel     = record?.trustLevel ?? 'unknown'
  const grantedPerms   = record?.permissions ?? []
  const missingPerms   = requiredScopes.filter((s) => !grantedPerms.includes(s))

  const decisionResult = decideGovernance({
    trustLevel,
    blockedReasons: record?.blockedReasons ?? [],
    notes: record?.notes,
    grantedPermissions: grantedPerms,
    requiredScopes,
    isWriteOperation,
    runtime: {
      networkEnabled: CAPABILITIES.network,
      executeEnabled: CAPABILITIES.execute,
      writeEnabled: CAPABILITIES.write,
      dryRun: DRY_RUN,
    },
  })

  const result: GovernanceCheckResult = {
    decision: decisionResult.decision,
    skillId,
    trustLevel,
    reason:               decisionResult.reason,
    permissionsRequired: requiredScopes,
    permissionsGranted:  grantedPerms,
    permissionsMissing:  decisionResult.missingPermissions,
    checkedAt:           new Date().toISOString(),
  }

  return result
}

// ── Skill inventory ───────────────────────────────────────────────────────────

/**
 * Inventory all known skills against the governance store.
 * Creates records for any skill not yet tracked.
 * Updates `lastSeen` for known skills.
 * Does NOT change trust level or permissions for existing records.
 *
 * Returns the number of new records staged.
 */
export async function inventorySkills(): Promise<{ total: number; new: number; existing: number }> {
  const store = await loadGovernanceStore()
  let newCount = 0

  for (const entry of KNOWN_SKILL_CATALOG) {
    const existing = store[entry.skillId]

    if (!existing) {
      const record = buildDefaultRecord(entry.skillId, entry.label, entry.provenance)
      // Assign default permissions (still trust=unknown — operator must elevate)
      const withPerms = mergeRecord(record, { permissions: entry.defaultPermissions })
      stageRecordUpdate(withPerms)
      newCount++
    } else {
      // Touch lastSeen only
      const touched = mergeRecord(existing, { lastSeen: new Date().toISOString() })
      stageRecordUpdate(touched)
    }
  }

  const existingCount = KNOWN_SKILL_CATALOG.length - newCount
  return { total: KNOWN_SKILL_CATALOG.length, new: newCount, existing: existingCount }
}

/**
 * Return summary of current governance state from the store.
 */
export async function getGovernanceSummary(): Promise<{
  totalSkills:       number
  byTrustLevel:      Record<string, number>
  blockedSkills:     string[]
  restrictedSkills:  string[]
  unvettedSkills:    string[]
}> {
  const store   = await loadGovernanceStore()
  const records = Object.values(store)

  const byTrustLevel: Record<string, number> = {}
  const blocked:    string[] = []
  const restricted: string[] = []
  const unvetted:   string[] = []

  for (const record of records) {
    byTrustLevel[record.trustLevel] = (byTrustLevel[record.trustLevel] ?? 0) + 1
    if (record.trustLevel === 'blocked')     blocked.push(record.label)
    if (record.trustLevel === 'restricted')  restricted.push(record.label)
    if (record.trustLevel === 'unknown' || record.trustLevel === 'unverified') {
      unvetted.push(record.label)
    }
  }

  return {
    totalSkills:      records.length,
    byTrustLevel,
    blockedSkills:    blocked,
    restrictedSkills: restricted,
    unvettedSkills:   unvetted,
  }
}

// ── Verification hooks ────────────────────────────────────────────────────────

/**
 * Mark a skill as vetted (passed governance review).
 * Returns the staged action id.
 */
export async function markSkillVetted(skillId: string, notes?: string): Promise<string> {
  return stageTrustLevelChange(skillId, 'vetted', 'user', notes)
}

/**
 * Restrict a skill — execution requires elevated approval.
 * Returns the staged action id.
 */
export async function restrictSkill(skillId: string, reason: string): Promise<string> {
  const store    = await loadGovernanceStore()
  const existing = store[skillId]
  if (!existing) throw new Error(`No governance record found for skill "${skillId}"`)

  const updated = mergeRecord(existing, {
    trustLevel:     'restricted',
    blockedReasons: [...existing.blockedReasons, reason],
    verifiedBy:     'user',
  })
  return stageRecordUpdate(updated)
}

/**
 * Block a skill entirely — no staging or execution permitted.
 * Returns the staged action id.
 */
export async function blockSkill(skillId: string, reason: string): Promise<string> {
  const store    = await loadGovernanceStore()
  const existing = store[skillId]
  if (!existing) throw new Error(`No governance record found for skill "${skillId}"`)

  const updated = mergeRecord(existing, {
    trustLevel:     'blocked',
    blockedReasons: [...existing.blockedReasons, reason],
    verifiedBy:     'user',
  })
  return stageRecordUpdate(updated)
}

/**
 * Grant a permission scope to a skill.
 * Idempotent — does not duplicate existing grants.
 */
export async function grantPermission(skillId: string, scope: SkillPermissionScope): Promise<string> {
  const store    = await loadGovernanceStore()
  const existing = store[skillId]
  if (!existing) throw new Error(`No governance record found for skill "${skillId}"`)

  if (existing.permissions.includes(scope)) {
    // Already granted — no-op stage
    return stageRecordUpdate(existing)
  }

  return stagePermissionsUpdate(skillId, [...existing.permissions, scope], 'user')
}

/**
 * Revoke a permission scope from a skill.
 */
export async function revokePermission(skillId: string, scope: SkillPermissionScope): Promise<string> {
  const store    = await loadGovernanceStore()
  const existing = store[skillId]
  if (!existing) throw new Error(`No governance record found for skill "${skillId}"`)

  return stagePermissionsUpdate(
    skillId,
    existing.permissions.filter((p) => p !== scope),
    'user',
  )
}

/**
 * Return a human-readable explanation of the governance state for a skill.
 * Suitable for display in the UI or for logging.
 */
export function explainGovernanceRecord(record: SkillGovernanceRecord): string {
  const lines: string[] = [
    `Skill: ${record.label} (${record.skillId})`,
    `Trust: ${record.trustLevel}`,
    `Source: ${record.provenance.sourceRegistry} / ${record.provenance.sourceSlug}`,
    `Permissions: ${record.permissions.length > 0 ? record.permissions.join(', ') : 'none'}`,
  ]

  if (record.blockedReasons.length > 0) {
    lines.push(`Blocked reasons: ${record.blockedReasons.join('; ')}`)
  }
  if (record.notes) {
    lines.push(`Notes: ${record.notes}`)
  }
  if (record.verifiedBy) {
    lines.push(`Verified by: ${record.verifiedBy}`)
  }

  return lines.join(' | ')
}
