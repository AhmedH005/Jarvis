/**
 * Readiness & Execution Enablement Types
 *
 * These types describe, per provider and action, exactly where in the
 * staged → read-only-live → write-live promotion path each thing sits,
 * what is blocking it, and what precise steps are required to advance it.
 *
 * Safety contract: readiness level must reflect actual runtime state.
 * No provider or action may be declared "ready" without verified evidence.
 */

// ── Readiness level ────────────────────────────────────────────────────────

/**
 * The current promotion stage of a provider or action.
 *
 * Ordered from most blocked (not_wired) to fully live (write_ready).
 */
export type ProviderReadinessLevel =
  /** No invocation path exists. Adapter/bridge not wired at all. */
  | 'not_wired'
  /** Invocation path is wired in code, but blocked by at least one runtime condition. */
  | 'wired'
  /** Path is wired and at least one read probe has completed successfully. */
  | 'runtime_verified'
  /** Read operations are safe to enable. All read blockers resolved. */
  | 'read_only_ready'
  /** Write operations are safe to enable. All write blockers resolved. */
  | 'write_ready'
  /** Permanently blocked by governance policy or trust level. */
  | 'blocked'
  /** A runtime error occurred during the readiness evaluation. */
  | 'error'

// ── Blocker types ──────────────────────────────────────────────────────────

/**
 * The specific type of condition blocking promotion.
 */
export type ProviderBlockerType =
  /** DRY_RUN=true prevents writes from executing. */
  | 'dry_run'
  /** Required API key or credential is absent from the environment. */
  | 'missing_credentials'
  /** Required binary, skill, or runtime package is not installed. */
  | 'missing_binary'
  /** Required configuration value (env var, config file, URL) is missing. */
  | 'missing_config'
  /** Governance trust level is 'restricted' or 'blocked' for this skill. */
  | 'governance_restricted'
  /** A required CAPABILITIES flag (execute/write) is false. */
  | 'capability_disabled'
  /** CAPABILITIES.network is false. */
  | 'network_disabled'
  /** NO_SECRETS_MODE=true prevents credentials from being read. */
  | 'safe_execution_not_verified'
  /** Bridge or IPC handler is not present in this runtime (e.g., not in Electron). */
  | 'bridge_absent'
  /** The action is intentionally staged-only because no live execution path exists yet. */
  | 'not_implemented'

// ── Blocker detail ─────────────────────────────────────────────────────────

export interface ProviderBlocker {
  type: ProviderBlockerType
  /** Human-readable explanation of exactly what is blocked and why. */
  reason: string
  /** Exact step to take to resolve this blocker. */
  resolution: string
}

// ── Promotion stage ────────────────────────────────────────────────────────

/**
 * Coarse rollout bucket for each provider/action.
 * Used to group things in the enablement plan.
 */
export type PromotionStage =
  /** All operations produce staged/dry-run outputs only. */
  | 'staged_only'
  /** Read operations could go live; writes must stay staged. */
  | 'read_only_live_candidate'
  /** Write operations could go live given governance approval + capability change. */
  | 'write_live_candidate'
  /** Both read and write paths are unblocked and could go fully live. */
  | 'fully_live_candidate'

// ── Per-action result ──────────────────────────────────────────────────────

/**
 * Full readiness evaluation for one provider action.
 */
export interface ReadinessCheckResult {
  /** Provider key (e.g. 'builder-skill-provider') */
  provider: string
  /** Action name (e.g. 'builder:requestPlan') */
  action: string
  /** Whether this is a write/mutation operation */
  isWriteOp: boolean
  /** Current readiness level */
  readinessLevel: ProviderReadinessLevel
  /** All active blockers (empty = no blockers) */
  blockers: ProviderBlocker[]
  /** Coarse rollout bucket */
  promotionStage: PromotionStage
  /**
   * Ordered steps needed to advance to the next promotion stage.
   * Each step is a short imperative: "Set GCAL_CLIENT_ID in .env"
   */
  requiredSteps: string[]
  /** ISO timestamp of this evaluation */
  lastCheckedAt: string
}

// ── Per-provider summary ───────────────────────────────────────────────────

/**
 * Aggregated readiness summary for one provider (across all its actions).
 */
export interface ProviderReadinessSummary {
  providerKey: string
  providerLabel: string
  /** Most restrictive readiness level across all actions */
  overallReadiness: ProviderReadinessLevel
  /** Most restrictive promotion stage across all actions */
  overallPromotion: PromotionStage
  /** All unique blockers across all actions */
  allBlockers: ProviderBlocker[]
  /** Per-action breakdown */
  actions: ReadinessCheckResult[]
  /** Human-readable headline: what's ready, what's not */
  headline: string
  lastCheckedAt: string
}

// ── System-wide report ─────────────────────────────────────────────────────

/**
 * Full readiness report for all evaluated providers.
 */
export interface SystemReadinessReport {
  /** Total providers evaluated */
  totalProviders: number
  /** Count per readiness level */
  byReadinessLevel: Partial<Record<ProviderReadinessLevel, number>>
  /** Count per promotion stage */
  byPromotionStage: Partial<Record<PromotionStage, number>>
  /** Providers that are read_only_ready or better */
  readReadyProviders: string[]
  /** Providers that are write_ready */
  writeReadyProviders: string[]
  /** Providers that are staged_only */
  stagedOnlyProviders: string[]
  /** Providers blocked by governance */
  blockedProviders: string[]
  /** All per-provider summaries */
  providers: ProviderReadinessSummary[]
  evaluatedAt: string
}
