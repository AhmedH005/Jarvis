/**
 * Shared live-status model for JARVIS providers.
 *
 * Every provider's describe() and readiness check should classify itself
 * using one of these values so the runtime and UI can show truthful state.
 *
 * Safety contract: status values must never be promoted without runtime evidence.
 *   - Do not assign LIVE unless a real call succeeded.
 *   - Do not assign LIVE_READ_ONLY unless a real read call completed.
 *   - WIRED_* means the invocation path exists but is blocked right now.
 *   - STAGED_* means a prerequisite (binary/key/support) is missing.
 *   - UNAVAILABLE means the provider cannot be reached at all.
 *   - ERROR means a runtime exception occurred during the check.
 */

export type ProviderLiveStatus =
  /** Real calls are executing and succeeding. */
  | 'LIVE'
  /** Read-only calls execute and succeed. Writes are staged or blocked. */
  | 'LIVE_READ_ONLY'
  /** Invocation path exists and would work; blocked only by DRY_RUN=true. */
  | 'WIRED_BLOCKED_BY_DRY_RUN'
  /** Invocation path exists but a capability gate (network/execute/write) blocks it. */
  | 'WIRED_BLOCKED_BY_CAPABILITY'
  /** Path exists; waiting for a skill binary/package to be installed. */
  | 'STAGED_PENDING_BINARY'
  /** Path exists; waiting for credentials / API key to be provided. */
  | 'STAGED_PENDING_CREDENTIALS'
  /** Path exists; waiting for a capability gate to be safely opened (e.g., NO_SECRETS_MODE=false). */
  | 'STAGED_PENDING_SAFE_EXECUTION_SUPPORT'
  /** Provider bridge is absent or the runtime cannot reach the backend at all. */
  | 'UNAVAILABLE'
  /** A runtime error occurred during the readiness check. */
  | 'ERROR'

/**
 * How callable a specific OpenClaw skill is right now.
 * These are ordered from most blocked to most available.
 */
export type SkillCallabilityLevel =
  /** Skill is not in the enabled list returned by /v1/skills. */
  | 'not_discovered'
  /** Skill is in the enabled list but cannot be invoked (capability gate blocks). */
  | 'discovered_blocked_by_capability'
  /** Skill is in the enabled list and the capability gate is open — invoke is possible. */
  | 'callable'
  /** Skill appeared callable but returned a credentials / config error when invoked. */
  | 'blocked_by_config'
  /** OpenClaw gateway is unreachable; cannot determine skill state. */
  | 'gateway_offline'

export interface SkillCallabilityResult {
  skill: string
  level: SkillCallabilityLevel
  reason: string
}

/**
 * Compact readiness summary returned by provider describe() methods.
 * Attach to ProviderHealth.liveStatus for structured UI consumption.
 */
export interface ProviderReadinessReport {
  liveStatus: ProviderLiveStatus
  readStatus: ProviderLiveStatus
  writeStatus: ProviderLiveStatus
  /** Human-readable strings explaining what is blocking promotion to LIVE. */
  blockers: string[]
  /** Informational notes that don't block but are worth surfacing. */
  notes: string[]
}
