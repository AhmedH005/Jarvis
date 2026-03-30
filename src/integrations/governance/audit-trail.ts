/**
 * Governance audit trail.
 *
 * Records every governance decision — whether an action was allowed, staged,
 * blocked, or escalated. Append-only by design.
 *
 * In-session entries are kept in the action store (always accessible).
 * Persisted entries are staged to: jarvis-runtime/governance/audit-log.jsonl
 *
 * Under DRY_RUN, disk writes are staged — the in-session action log captures them.
 */

import { stageAction } from '@/integrations/runtime/safety'
import { readSafeFile } from '@/integrations/runtime/files'
import { useActionRuntimeStore } from '@/store/action-runtime'
import type { GovernanceAuditEntry } from '@/shared/skill-governance-types'

const AUDIT_LOG_PATH = 'governance/audit-log.jsonl'

// ── ID generation ─────────────────────────────────────────────────────────────

function makeAuditId(): string {
  return `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// ── Record ────────────────────────────────────────────────────────────────────

/**
 * Record a governance decision to the audit trail.
 * Always stages — disk append only happens when write capability is enabled.
 * Accepts all fields including the Phase-5 richer audit fields.
 */
export function recordAuditEntry(
  entry: Omit<GovernanceAuditEntry, 'entryId' | 'timestamp'>,
): GovernanceAuditEntry {
  const full: GovernanceAuditEntry = {
    ...entry,
    entryId:   makeAuditId(),
    timestamp: new Date().toISOString(),
  }

  const stagedActionId = stageAction({
    domain:      'system',
    providerKey: 'skill-governance-audit',
    title:       `Governance audit: ${full.decision} [${full.skillId}]`,
    summary:     `${full.action} — decision: ${full.decision} (${full.reason})`,
    payload:     { auditEntry: full, appendTo: AUDIT_LOG_PATH },
  })
  full.stagedActionId = stagedActionId

  return full
}

// ── In-session log ────────────────────────────────────────────────────────────

/**
 * Return governance audit entries from the in-session action store.
 * These are the staged/attempted governance decisions for the current session.
 */
export function getInSessionAuditLog(): GovernanceAuditEntry[] {
  const actions = useActionRuntimeStore.getState().actions

  return actions
    .filter((action) => action.providerKey === 'skill-governance-audit')
    .map((action) => {
      const payload = action.payload as { auditEntry?: GovernanceAuditEntry } | undefined
      return payload?.auditEntry ?? null
    })
    .filter((entry): entry is GovernanceAuditEntry => entry !== null)
}

// ── Persisted log (read-only) ─────────────────────────────────────────────────

/**
 * Load the persisted audit log from SAFE_ROOT.
 * Returns an array of parsed entries; ignores malformed lines.
 */
export async function loadPersistedAuditLog(): Promise<GovernanceAuditEntry[]> {
  const raw = await readSafeFile(AUDIT_LOG_PATH)
  if (!raw) return []

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as GovernanceAuditEntry
      } catch {
        return null
      }
    })
    .filter((entry): entry is GovernanceAuditEntry => entry !== null)
}

/**
 * Merged audit log: in-session entries + persisted entries (deduplicated by entryId).
 */
export async function getFullAuditLog(): Promise<GovernanceAuditEntry[]> {
  const inSession = getInSessionAuditLog()
  const persisted = await loadPersistedAuditLog()

  const seen = new Set<string>(inSession.map((e) => e.entryId))
  const combined: GovernanceAuditEntry[] = [...inSession]

  for (const entry of persisted) {
    if (!seen.has(entry.entryId)) {
      seen.add(entry.entryId)
      combined.push(entry)
    }
  }

  // Newest first
  combined.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return combined
}
