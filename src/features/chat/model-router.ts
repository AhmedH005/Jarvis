/**
 * Model-assisted command router.
 *
 * Primary path:
 *   1. Call window.jarvis.llm.classify(command) via the IPC bridge.
 *   2. Parse and validate the raw JSON response from the LLM.
 *   3. Return a TypedRouteResult with routedBy = 'routed_by_model'.
 *
 * Fallback path (automatic, silent):
 *   Triggered whenever model classification is unavailable or unreliable:
 *   - window.jarvis.llm.classify is not present (no Electron context)
 *   - ANTHROPIC_API_KEY not set (model returns credentials error)
 *   - API call fails (network error, rate limit, server error)
 *   - Response is malformed JSON
 *   - Response fails schema validation
 *   - Domain field is not one of the known RouterDomain values
 *
 *   In all fallback cases the heuristic classifier runs on the original input
 *   and the result carries routedBy = 'routed_by_fallback' or
 *   'routed_with_low_confidence' with a fallbackReason explaining what happened.
 *
 * Safety guarantees:
 *   - No writes or side effects during classification
 *   - Classification is inference-only / read-only
 *   - DRY_RUN and capability gates are NOT evaluated here — they apply at the
 *     action-staging layer (orchestrator-provider.ts, safety.ts)
 *   - No exceptions propagate out of classifyCommand(); it always returns a result
 */

import type {
  TypedRouteResult,
  ModelClassificationRaw,
  RouterDomain,
  RouterConfidence,
  RouterSuggestedAction,
} from './router-types'
import {
  ROUTER_DOMAINS,
  APPROVAL_REQUIRED_DOMAINS,
  UNAVAILABLE_DOMAINS,
} from './router-types'
import { heuristicClassify } from './router-fallback'

// ── Schema validation ─────────────────────────────────────────────────────────

const VALID_CONFIDENCE = new Set<string>(['high', 'medium', 'low'])
const VALID_SUGGESTED_ACTION = new Set<string>(['stage', 'approve_and_stage', 'clarify', 'unavailable'])

function isValidRaw(raw: unknown): raw is ModelClassificationRaw {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  if (typeof r['domain'] !== 'string') return false
  if (typeof r['intent'] !== 'string') return false
  if (!VALID_CONFIDENCE.has(r['confidence'] as string)) return false
  if (typeof r['requires_approval'] !== 'boolean') return false
  if (!VALID_SUGGESTED_ACTION.has(r['suggested_action'] as string)) return false
  const ents = r['entities']
  if (!ents || typeof ents !== 'object') return false
  return true
}

function isKnownDomain(domain: string): domain is RouterDomain {
  return (ROUTER_DOMAINS as string[]).includes(domain)
}

// ── String array coercion (entities fields may contain non-strings) ─────────

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

// ── Convert raw model response → TypedRouteResult ─────────────────────────────

function rawToResult(raw: ModelClassificationRaw, modelUsed: string): TypedRouteResult {
  const domain = isKnownDomain(raw.domain) ? raw.domain : 'unknown'
  const confidence = VALID_CONFIDENCE.has(raw.confidence)
    ? (raw.confidence as RouterConfidence)
    : 'low'
  const suggestedAction = VALID_SUGGESTED_ACTION.has(raw.suggested_action)
    ? (raw.suggested_action as RouterSuggestedAction)
    : 'stage'

  // Override approval/action if domain has fixed rules
  const requiresApproval = raw.requires_approval || APPROVAL_REQUIRED_DOMAINS.includes(domain)
  const isUnavailable = UNAVAILABLE_DOMAINS.includes(domain)
  const effectiveAction: RouterSuggestedAction = isUnavailable ? 'unavailable' : suggestedAction

  return {
    targetDomain: domain,
    intent: raw.intent.slice(0, 120),
    confidence,
    routedBy: confidence === 'low' ? 'routed_with_low_confidence' : 'routed_by_model',
    requiresApproval,
    suggestedAction: effectiveAction,
    extractedEntities: {
      dates: toStringArray(raw.entities?.dates),
      contacts: toStringArray(raw.entities?.contacts),
      keywords: toStringArray(raw.entities?.keywords),
    },
    rationale: `Model routed to ${domain} (${confidence} confidence): ${raw.intent}`,
    modelUsed,
  }
}

// ── Parse JSON from model text ────────────────────────────────────────────────

function parseModelText(text: string): ModelClassificationRaw | null {
  // Strip any accidental markdown fencing
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    const parsed: unknown = JSON.parse(stripped)
    return isValidRaw(parsed) ? parsed : null
  } catch {
    // Try to extract first {...} block in case model added prose
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      const parsed: unknown = JSON.parse(match[0])
      return isValidRaw(parsed) ? parsed : null
    } catch {
      return null
    }
  }
}

// ── LLM bridge availability check ────────────────────────────────────────────

function isClassifyAvailable(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.jarvis?.llm?.classify === 'function'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a command using the model-assisted router.
 *
 * Always returns a TypedRouteResult. Never throws.
 * Falls back to heuristic if model is unavailable or fails.
 */
export async function classifyCommand(command: string): Promise<TypedRouteResult> {
  // ── Model path ──────────────────────────────────────────────────────────────

  if (!isClassifyAvailable()) {
    return heuristicClassify(
      command,
      'Model classification unavailable (no Electron context or bridge not present).',
    )
  }

  try {
    const ipcResult = await window.jarvis!.llm!.classify!(command)

    if (!ipcResult.ok) {
      const code = (ipcResult as { ok: false; error: string; code: string }).code
      const error = (ipcResult as { ok: false; error: string; code: string }).error
      return heuristicClassify(
        command,
        `Model classifier returned error (code=${code}): ${error}`,
      )
    }

    const text = (ipcResult as { ok: true; text: string }).text
    const raw = parseModelText(text)

    if (!raw) {
      return heuristicClassify(
        command,
        `Model returned unparseable output. Raw: "${text.slice(0, 120)}"`,
      )
    }

    if (!isKnownDomain(raw.domain)) {
      return heuristicClassify(
        command,
        `Model returned unknown domain "${raw.domain}" — not in RouterDomain enum.`,
      )
    }

    return rawToResult(raw, 'claude-haiku-4-5-20251001')

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return heuristicClassify(
      command,
      `Model classification threw: ${message}`,
    )
  }
}

// ── Domain → legacy OrchestratorDomain adapter ───────────────────────────────
// Used by jarvisMessagePipeline.ts to bridge TypedRouteResult back to the
// existing stageMission() contract without changing OrchestratorProvider.

import type { OrchestratorDomain, OrchestratorRoute } from '@/integrations/contracts/providers'
import { buildBuilderRepoTarget } from '@/shared/builder-bridge'

const DOMAIN_TO_ORCHESTRATOR: Record<RouterDomain, OrchestratorDomain> = {
  command:   'direct',
  time:      'calendar',
  concierge: 'concierge',
  creation:  'media',
  dev:       'builder',
  memory:    'memory',
  finance:   'system',
  unknown:   'direct',
}

const DOMAIN_AGENT_NAMES: Record<RouterDomain, string> = {
  command:   'Command',
  time:      'Time',
  concierge: 'Concierge',
  creation:  'Creation',
  dev:       'Dev',
  memory:    'Memory',
  finance:   'Finance',
  unknown:   'Command',
}

const DOMAIN_ACTION_LABELS: Record<RouterDomain, string> = {
  command:   'Stage command review',
  time:      'Stage time action',
  concierge: 'Stage concierge action',
  creation:  'Stage creation action',
  dev:       'Stage dev action',
  memory:    'Stage memory action',
  finance:   'Finance unavailable',
  unknown:   'Stage command review',
}

const DOMAIN_PROVIDER_INTERFACES: Record<RouterDomain, OrchestratorRoute['providerInterface']> = {
  command:   'OrchestratorProvider',
  time:      'CalendarProvider',
  concierge: 'ConciergeProvider',
  creation:  'MediaProvider',
  dev:       'BuilderProvider',
  memory:    'MemoryProvider',
  finance:   'RuntimeProvider',
  unknown:   'OrchestratorProvider',
}

const DOMAIN_PROVIDER_KEYS: Record<RouterDomain, string> = {
  command: 'agent-task-manager-router',
  time: 'composed-calendar-provider',
  concierge: 'concierge-skill-provider',
  creation: 'creation-skill-provider',
  dev: 'builder-skill-provider',
  memory: 'memory-skill-provider',
  finance: 'runtime-skill-provider',
  unknown: 'agent-task-manager-router',
}

/**
 * Convert a TypedRouteResult to an OrchestratorRoute for use with
 * HeuristicOrchestratorProvider.stageMission().
 *
 * This adapter exists to preserve the existing staged-action contract
 * while the router becomes model-assisted. Once stageMission() is updated
 * to accept TypedRouteResult directly, this adapter can be removed.
 */
export function toOrchestratorRoute(result: TypedRouteResult): OrchestratorRoute {
  const domain = DOMAIN_TO_ORCHESTRATOR[result.targetDomain]
  const agentName = DOMAIN_AGENT_NAMES[result.targetDomain]
  const actionLabel = DOMAIN_ACTION_LABELS[result.targetDomain]
  const providerInterface = DOMAIN_PROVIDER_INTERFACES[result.targetDomain]

  const confidence = result.confidence === 'high' ? 'high'
    : result.confidence === 'medium' ? 'medium'
    : 'low'

  return {
    id: `route_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    domain,
    providerInterface,
    providerKey: DOMAIN_PROVIDER_KEYS[result.targetDomain],
    agentId: 'jarvis',
    agentName,
    actionMode: `${result.targetDomain}-stage`,
    actionLabel,
    targetHint: agentName,
    targetId: result.targetDomain,
    focusTarget: buildBuilderRepoTarget(),
    rationale: result.rationale,
    confidence,
    ambiguous: result.routedBy === 'routed_with_low_confidence' || result.routedBy === 'manual_review_required',
    requiresApproval: result.requiresApproval,
    executionState: 'suggested',
    fallbackNote: result.fallbackReason
      ? `Fallback used: ${result.fallbackReason}`
      : result.routedBy === 'routed_with_low_confidence'
        ? 'Low confidence route — review before executing.'
        : null,
    unavailableReason: result.suggestedAction === 'unavailable'
      ? `${result.targetDomain} provider is not yet wired.`
      : null,
  }
}
