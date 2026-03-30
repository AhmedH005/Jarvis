/**
 * Governance store — reads and stages writes for skill governance records.
 *
 * Persists to: jarvis-runtime/governance/skills.json
 * Format: GovernanceStore (Record<skillId, SkillGovernanceRecord>)
 *
 * All reads are live. Writes are always staged under DRY_RUN.
 */

import { readSafeJson } from '@/integrations/runtime/files'
import { stageAction } from '@/integrations/runtime/safety'
import type {
  GovernanceStore,
  SkillGovernanceRecord,
  SkillTrustLevel,
  SkillPermissionScope,
  SkillProvenance,
} from '@/shared/skill-governance-types'

const STORE_PATH = 'governance/skills.json'

// ── Read ──────────────────────────────────────────────────────────────────────

export async function loadGovernanceStore(): Promise<GovernanceStore> {
  return readSafeJson<GovernanceStore>(STORE_PATH, {})
}

export async function getGovernanceRecord(skillId: string): Promise<SkillGovernanceRecord | null> {
  const store = await loadGovernanceStore()
  return store[skillId] ?? null
}

// ── Build ─────────────────────────────────────────────────────────────────────

/**
 * Build a default governance record for a skill.
 * Trust level defaults to 'unknown'. Permissions default to empty (least privilege).
 */
export function buildDefaultRecord(
  skillId: string,
  label: string,
  provenance: SkillProvenance,
): SkillGovernanceRecord {
  const ts = new Date().toISOString()
  return {
    skillId,
    label,
    trustLevel:   'unknown',
    permissions:  [],
    provenance,
    notes:        undefined,
    lastSeen:     ts,
    actionCounts: { attempted: 0, staged: 0, blocked: 0 },
    blockedReasons: [],
    verifiedBy:   undefined,
    updatedAt:    ts,
  }
}

// ── Merge (non-destructive patch) ─────────────────────────────────────────────

/**
 * Merge a partial update into an existing record.
 * Fields not in `patch` are preserved from `existing`.
 */
export function mergeRecord(
  existing: SkillGovernanceRecord,
  patch: Partial<SkillGovernanceRecord>,
): SkillGovernanceRecord {
  return {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
    // Merge array fields explicitly to avoid accidental replacement
    permissions:    patch.permissions    ?? existing.permissions,
    blockedReasons: patch.blockedReasons ?? existing.blockedReasons,
    actionCounts:   patch.actionCounts   ?? existing.actionCounts,
    provenance:     patch.provenance     ?? existing.provenance,
  }
}

// ── Write (staged) ────────────────────────────────────────────────────────────

/**
 * Stage a write of a single governance record.
 * Returns the staged action id.
 */
export function stageRecordUpdate(record: SkillGovernanceRecord): string {
  return stageAction({
    domain:      'system',
    providerKey: 'skill-governance',
    title:       `Governance update [${record.skillId}]`,
    summary:     `Trust level "${record.trustLevel}" staged for skill "${record.label}".`,
    payload:     { path: STORE_PATH, record },
  })
}

/**
 * Stage a trust level change for a skill.
 */
export async function stageTrustLevelChange(
  skillId: string,
  newTrust: SkillTrustLevel,
  verifiedBy: string,
  notes?: string,
): Promise<string> {
  const store    = await loadGovernanceStore()
  const existing = store[skillId]
  if (!existing) throw new Error(`No governance record found for skill "${skillId}"`)

  const updated = mergeRecord(existing, {
    trustLevel: newTrust,
    verifiedBy,
    notes: notes ?? existing.notes,
  })

  return stageRecordUpdate(updated)
}

/**
 * Stage a permission scope update for a skill.
 */
export async function stagePermissionsUpdate(
  skillId: string,
  permissions: SkillPermissionScope[],
  verifiedBy: string,
): Promise<string> {
  const store    = await loadGovernanceStore()
  const existing = store[skillId]
  if (!existing) throw new Error(`No governance record found for skill "${skillId}"`)

  const updated = mergeRecord(existing, { permissions, verifiedBy })
  return stageRecordUpdate(updated)
}

/**
 * Stage a bump to the action counters for a skill.
 */
export async function stageCounterBump(
  skillId: string,
  field: 'attempted' | 'staged' | 'blocked',
): Promise<void> {
  const store    = await loadGovernanceStore()
  const existing = store[skillId]
  if (!existing) return

  const counts = { ...existing.actionCounts }
  counts[field] = (counts[field] ?? 0) + 1
  const updated = mergeRecord(existing, { actionCounts: counts, lastSeen: new Date().toISOString() })
  stageRecordUpdate(updated)
}
