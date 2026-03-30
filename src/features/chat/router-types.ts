/**
 * Typed command routing model for the Jarvis model-assisted router.
 *
 * These types are the single source of truth for routing results. They are
 * deliberately separate from OrchestratorRoute / OrchestratorDomain so that
 * the model router can evolve independently of the legacy staging contract.
 *
 * Adapters in model-router.ts convert TypedRouteResult → OrchestratorRoute
 * when the staged-action pipeline needs a legacy-shaped record.
 */

// ── Domain ────────────────────────────────────────────────────────────────────

/**
 * The 8 target domains exposed in the Jarvis module map.
 * Each domain corresponds directly to one of the 8 UI module tabs.
 *
 * Mapping from router domain → legacy OrchestratorDomain:
 *   command   → direct
 *   time      → calendar
 *   concierge → concierge
 *   creation  → media
 *   dev       → builder
 *   memory    → memory
 *   finance   → system
 *   unknown   → direct
 */
export type RouterDomain =
  | 'command'
  | 'time'
  | 'concierge'
  | 'creation'
  | 'dev'
  | 'memory'
  | 'finance'
  | 'unknown'

// ── Routing method ────────────────────────────────────────────────────────────

/**
 * How the route result was produced.
 *
 *   routed_by_model          — LLM classifier returned a usable result
 *   routed_by_fallback       — heuristic fallback used (model unavailable / error)
 *   routed_with_low_confidence — model responded but confidence was below threshold
 *   manual_review_required   — router cannot determine domain; needs human review
 */
export type RouterMethod =
  | 'routed_by_model'
  | 'routed_by_fallback'
  | 'routed_with_low_confidence'
  | 'manual_review_required'

// ── Confidence ────────────────────────────────────────────────────────────────

export type RouterConfidence = 'high' | 'medium' | 'low'

// ── Suggested action ─────────────────────────────────────────────────────────

/**
 * What Jarvis should do with this command under the current safety regime.
 *
 *   stage            — safe to stage immediately
 *   approve_and_stage — staging requires explicit approval before execution
 *   clarify          — more information needed from user
 *   unavailable      — domain not yet wired or provider unavailable
 */
export type RouterSuggestedAction =
  | 'stage'
  | 'approve_and_stage'
  | 'clarify'
  | 'unavailable'

// ── Entities ─────────────────────────────────────────────────────────────────

export interface RouterExtractedEntities {
  dates: string[]
  contacts: string[]
  keywords: string[]
}

// ── Core result ───────────────────────────────────────────────────────────────

export interface TypedRouteResult {
  /** The module domain this command belongs to. */
  targetDomain: RouterDomain

  /** One-line description of what the user wants. */
  intent: string

  /** Confidence in the domain assignment. */
  confidence: RouterConfidence

  /** How this result was produced. */
  routedBy: RouterMethod

  /** Whether the action requires explicit approval before execution. */
  requiresApproval: boolean

  /** What should happen to this command under current safety settings. */
  suggestedAction: RouterSuggestedAction

  /** Structured entities extracted from the command. */
  extractedEntities: RouterExtractedEntities

  /**
   * Human-readable rationale for the routing decision.
   * For model routes: brief explanation from the classifier.
   * For fallback routes: description of which signals triggered the match.
   */
  rationale: string

  /**
   * Set when routedBy is 'routed_by_fallback'.
   * Explains why the model was not used.
   */
  fallbackReason?: string

  /**
   * Set when routedBy is 'routed_by_model'.
   * The model identifier used for classification.
   */
  modelUsed?: string
}

// ── Model-side raw response ────────────────────────────────────────────────────

/**
 * The raw JSON shape the model is asked to return.
 * Parsed by model-router.ts and validated before conversion to TypedRouteResult.
 */
export interface ModelClassificationRaw {
  domain: string
  intent: string
  confidence: string
  requires_approval: boolean
  suggested_action: string
  entities: {
    dates: unknown[]
    contacts: unknown[]
    keywords: unknown[]
  }
}

// ── Classifier IPC result ─────────────────────────────────────────────────────

export type ClassifierIpcResult =
  | { ok: true; text: string }
  | { ok: false; error: string; code: string }

// ── Domain helpers ────────────────────────────────────────────────────────────

/** All valid router domain values, used for runtime validation. */
export const ROUTER_DOMAINS: RouterDomain[] = [
  'command',
  'time',
  'concierge',
  'creation',
  'dev',
  'memory',
  'finance',
  'unknown',
]

/** Domains that always require approval before execution. */
export const APPROVAL_REQUIRED_DOMAINS: RouterDomain[] = [
  'concierge',
  'creation',
  'dev',
  'time',
]

/** Domains that are currently unavailable (provider not wired). */
export const UNAVAILABLE_DOMAINS: RouterDomain[] = [
  'finance',
]
