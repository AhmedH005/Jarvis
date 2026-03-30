import { nanoid } from '@/lib/utils'
import { getOrchestratorProvider } from '@/integrations/registry/providerRegistry'
import { useJarvisStore } from '@/store/jarvis'
import { classifyCommand, toOrchestratorRoute } from './model-router'
import type { TypedRouteResult } from './router-types'
import type { Message } from '@/types'

export interface JarvisPipelineResult {
  replyText: string
  route: 'command'
  routeResult: TypedRouteResult
}

// ── Reply formatting ──────────────────────────────────────────────────────────

function formatRouteReply(result: TypedRouteResult): string {
  const lines: string[] = []

  // Header — domain + routing method badge
  const methodBadge =
    result.routedBy === 'routed_by_model'         ? '[MODEL]'
    : result.routedBy === 'routed_with_low_confidence' ? '[MODEL/LOW CONF]'
    : result.routedBy === 'routed_by_fallback'     ? '[FALLBACK]'
    : '[MANUAL REVIEW]'

  lines.push(`${result.targetDomain.toUpperCase()} ROUTE ${methodBadge}`)
  lines.push(result.intent)
  lines.push('')

  // Routing details
  lines.push(`Confidence: ${result.confidence}`)
  lines.push(`Approval: ${result.requiresApproval ? 'required once dry run is lifted' : 'not required for staging'}`)
  lines.push(`Action: ${result.suggestedAction}`)
  lines.push('Execution: Blocked (dry run).')

  // Entities — only show if any were found
  const { dates, contacts, keywords } = result.extractedEntities
  const entityParts: string[] = []
  if (dates.length > 0) entityParts.push(`dates=[${dates.join(', ')}]`)
  if (contacts.length > 0) entityParts.push(`contacts=[${contacts.join(', ')}]`)
  if (keywords.length > 0) entityParts.push(`keywords=[${keywords.join(', ')}]`)
  if (entityParts.length > 0) {
    lines.push('')
    lines.push(`Entities: ${entityParts.join('  ')}`)
  }

  // Rationale / fallback note
  lines.push('')
  lines.push(result.rationale)
  if (result.fallbackReason) {
    lines.push(`Fallback reason: ${result.fallbackReason}`)
  }
  if (result.modelUsed) {
    lines.push(`Classified by: ${result.modelUsed}`)
  }

  return lines.join('\n')
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function submitJarvisMessage(userText: string): Promise<JarvisPipelineResult> {
  const text = userText.trim()
  if (!text) {
    const empty: TypedRouteResult = {
      targetDomain: 'command',
      intent: 'Empty input',
      confidence: 'low',
      routedBy: 'manual_review_required',
      requiresApproval: false,
      suggestedAction: 'clarify',
      extractedEntities: { dates: [], contacts: [], keywords: [] },
      rationale: 'No input provided.',
    }
    return { replyText: '', route: 'command', routeResult: empty }
  }

  const jarvis = useJarvisStore.getState()
  const {
    addMessage,
    setPlannerPreview,
    setActivePlanSession,
    setIntakePreview,
    setStreamPhase,
  } = jarvis

  addMessage({ id: nanoid(), role: 'user', content: text, timestamp: new Date() } as Message)
  setStreamPhase('start')

  // ── Model-assisted classification ─────────────────────────────────────────
  // classifyCommand() never throws — always returns a TypedRouteResult.
  // Fallback to heuristic is handled internally when model is unavailable.
  const routeResult = await classifyCommand(text)

  // ── Adapter: TypedRouteResult → OrchestratorRoute for staging ────────────
  const legacyRoute = toOrchestratorRoute(routeResult)

  // ── Stage the action via the existing orchestrator contract ──────────────
  getOrchestratorProvider().stageMission(legacyRoute, text)

  // ── Format reply ─────────────────────────────────────────────────────────
  const reply = formatRouteReply(routeResult)

  setPlannerPreview(null)
  setIntakePreview(null)
  setActivePlanSession(null)
  setStreamPhase('complete')

  addMessage({
    id: nanoid(),
    role: 'assistant',
    content: reply,
    timestamp: new Date(),
  } as Message)

  setTimeout(() => useJarvisStore.getState().setStreamPhase('idle'), 250)
  return { replyText: reply, route: 'command', routeResult }
}

export async function forwardTelegramToJarvis(userText: string): Promise<string> {
  const result = await submitJarvisMessage(userText)
  return result.replyText
}
