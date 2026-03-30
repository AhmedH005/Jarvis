/**
 * Shared types for the Skill Governance / Trust Layer.
 * These are the canonical types for all governance decisions in Jarvis.
 */

// ── Trust Level ───────────────────────────────────────────────────────────────

/**
 * Trust level assigned to a skill by the governance system.
 * No skill defaults to 'trusted' — least privilege applies.
 */
export type SkillTrustLevel =
  | 'unknown'      // not yet assessed; staging allowed, execution blocked until vetted
  | 'unverified'   // known but not vetted; can stage, not live-execute
  | 'vetted'       // passed governance review; allowed within granted scopes
  | 'trusted'      // explicitly elevated; full granted-scope execution
  | 'restricted'   // execution requires elevated approval before proceeding
  | 'blocked'      // rejected; no staging or execution permitted

// ── Permission Scopes ─────────────────────────────────────────────────────────

/**
 * What a skill is allowed to touch.
 * Permissions are additive — a skill has only what is explicitly granted.
 */
export type SkillPermissionScope =
  | 'read_files'         // read local files within SAFE_ROOT
  | 'write_files'        // write or mutate local files
  | 'network'            // make outbound HTTP/network calls
  | 'external_api'       // call external third-party APIs
  | 'email'              // read or send email
  | 'calendar'           // read or write calendar data
  | 'media_generation'   // generate audio/video/image media
  | 'dev_execution'      // execute code, scripts, or agent tasks
  | 'browser_automation' // drive browser or web automation

// ── Provenance ────────────────────────────────────────────────────────────────

/**
 * Where the skill came from and how it was verified.
 */
export interface SkillProvenance {
  /** 'openclaw' | 'local' | 'builtin' | 'unknown' */
  sourceRegistry:      string
  /** Slug in the registry (e.g. 'elevenlabs-tts') */
  sourceSlug:          string
  installedVersion?:   string
  /** 'openclaw' | 'jarvis-runtime' | 'builtin' */
  installLocation?:    string
  lastVerifiedAt?:     string  // ISO 8601
  /** 'manifest_check' | 'manual' | 'none' */
  verificationMethod?: string
}

// ── Governance Record ─────────────────────────────────────────────────────────

/**
 * Per-skill governance record stored in SAFE_ROOT.
 * Every field is inspectable and deterministic — no hidden magic.
 */
export interface SkillGovernanceRecord {
  skillId:        string
  label:          string
  trustLevel:     SkillTrustLevel
  /** Explicitly granted permission scopes (additive, least-privilege default = empty) */
  permissions:    SkillPermissionScope[]
  provenance:     SkillProvenance
  notes?:         string
  lastSeen?:      string  // ISO 8601 — last time skill was inventoried or checked
  actionCounts:   {
    attempted: number
    staged:    number
    blocked:   number
  }
  blockedReasons: string[]
  /** Who made the last trust decision: 'system' | 'user' */
  verifiedBy?:    string
  updatedAt:      string  // ISO 8601
}

// ── Governance Decision ───────────────────────────────────────────────────────

/**
 * Result of a governance check before skill execution.
 */
export type GovernanceDecision =
  | 'allowed_to_stage'         // passes governance; staging allowed
  | 'blocked_by_governance'    // trust level blocks this action
  | 'requires_elevated_approval' // restricted trust; needs explicit consent
  | 'blocked_by_capability'    // capability gate prevents execution
  | 'blocked_by_dry_run'       // DRY_RUN prevents live execution

export interface GovernanceCheckResult {
  decision:             GovernanceDecision
  skillId:              string
  trustLevel:           SkillTrustLevel
  reason:               string
  permissionsRequired:  SkillPermissionScope[]
  permissionsGranted:   SkillPermissionScope[]
  permissionsMissing:   SkillPermissionScope[]
  checkedAt:            string
}

// ── Enforcement Outcome ───────────────────────────────────────────────────────

/**
 * Final enforcement outcome — result of the full governance + capability + DRY_RUN chain.
 * Stored in audit entries as the top-level "what happened" field.
 */
export type EnforcementOutcome =
  | 'allowed_to_stage'           // passes governance; staging allowed
  | 'allowed_read_only'          // read-only pass; no writes
  | 'blocked_by_governance'      // trust level or missing permissions blocked the action
  | 'requires_elevated_approval' // restricted skill; needs explicit consent
  | 'blocked_by_capability'      // capability gate prevents execution
  | 'blocked_by_dry_run'         // DRY_RUN staging path (action is staged, not executed live)

// ── Audit Entry ───────────────────────────────────────────────────────────────

/**
 * One entry in the governance audit trail.
 * Append-only. Written to jarvis-runtime/governance/audit-log.jsonl.
 */
export interface GovernanceAuditEntry {
  entryId:              string
  timestamp:            string
  skillId:              string
  providerKey:          string
  action:               string       // human-readable description of what was attempted
  decision:             GovernanceDecision
  trustLevel:           SkillTrustLevel
  reason:               string
  stagedActionId?:      string
  // Phase 5 — richer audit fields
  enforcementOutcome?:  EnforcementOutcome
  permissionsRequired?: SkillPermissionScope[]
  permissionsMissing?:  SkillPermissionScope[]
  isWriteOp?:           boolean
}

// ── Store Shape ───────────────────────────────────────────────────────────────

export type GovernanceStore = Record<string, SkillGovernanceRecord>

// ── Constants ─────────────────────────────────────────────────────────────────

export const ALL_TRUST_LEVELS: SkillTrustLevel[] = [
  'unknown', 'unverified', 'vetted', 'trusted', 'restricted', 'blocked',
]

export const ALL_PERMISSION_SCOPES: SkillPermissionScope[] = [
  'read_files', 'write_files', 'network', 'external_api',
  'email', 'calendar', 'media_generation', 'dev_execution', 'browser_automation',
]

/**
 * Human-readable labels for trust levels.
 */
export const TRUST_LEVEL_LABELS: Record<SkillTrustLevel, string> = {
  unknown:    'Unknown',
  unverified: 'Unverified',
  vetted:     'Vetted',
  trusted:    'Trusted',
  restricted: 'Restricted',
  blocked:    'Blocked',
}

/**
 * Human-readable labels for permission scopes.
 */
export const PERMISSION_SCOPE_LABELS: Record<SkillPermissionScope, string> = {
  read_files:        'Read Files',
  write_files:       'Write Files',
  network:           'Network',
  external_api:      'External API',
  email:             'Email',
  calendar:          'Calendar',
  media_generation:  'Media Generation',
  dev_execution:     'Dev Execution',
  browser_automation:'Browser Automation',
}
