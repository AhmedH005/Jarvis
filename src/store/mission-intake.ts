import { create } from 'zustand'
import type { AgentPersonaId } from '@/adapters/agent-control'
import { AGENT_FOCUS_OPTIONS } from '@/adapters/agent-control'
import type { BuilderWorkTarget } from '@/shared/builder-bridge'
import { buildBuilderRepoTarget } from '@/shared/builder-bridge'
import { getOrchestratorProvider } from '@/integrations/registry/providerRegistry'
import type { RouteConfidence } from '@/integrations/contracts/providers'
import { useMissionHandoffStore } from './mission-handoff'

// ── Action modes correspond to real existing pipeline phases ──────────────────

export type MissionActionMode =
  | 'plan-only'               // Alex or Kai: generate a plan, no execution
  | 'execution-request'       // Kai: create an approval-gated execution request
  | 'verification'            // Maya: verify a finalized Builder run
  | 'remediation'             // Kai: create a remediation request from a failed run
  | 'ops-check'               // Noah: surface system/runtime health
  | 'research'                // Researcher: gather context, compare approaches
  | 'concierge-workflow'
  | 'calendar-write'
  | 'memory-retrieval'
  | 'media-generation'

export type MissionConfidence = RouteConfidence

export interface MissionRoute {
  domain: 'direct' | 'concierge' | 'builder' | 'calendar' | 'memory' | 'media' | 'system' | 'research'
  providerInterface: string
  providerKey: string
  agentId: AgentPersonaId
  agentName: string
  actionMode: MissionActionMode
  actionLabel: string
  targetHint: string | null
  targetId: string | null
  focusTarget: BuilderWorkTarget
  rationale: string
  confidence: MissionConfidence
  ambiguous: boolean
  fallbackNote: string | null
  executionState: 'suggested' | 'unavailable'
  unavailableReason?: string | null
}

export type MissionPhase = 'idle' | 'parsed' | 'handed-off'

export interface MissionIntakeState {
  input: string
  phase: MissionPhase
  route: MissionRoute | null
  handoffNote: string | null
  setInput: (input: string) => void
  parseRoute: () => void
  clearMission: () => void
  confirmHandoff: () => void
}

// ── Routing signal tables ─────────────────────────────────────────────────────

const BUILDER_EXECUTE_SIGNALS = [
  'fix', 'implement', 'build', 'add', 'update', 'change', 'refactor',
  'create', 'write', 'move', 'delete', 'rename', 'migrate', 'scaffold',
  'wire', 'connect', 'integrate',
]

const PLAN_SIGNALS = [
  'plan', 'scope', 'design', 'architect', 'outline', 'define', 'spec',
  'strategy', 'map out', 'sketch', 'figure out', 'think through',
]

const VERIFY_SIGNALS = [
  'verify', 'check', 'review', 'validate', 'confirm', 'inspect', 'audit',
  'test', 'look at', 'examine',
]

const REMEDIATION_SIGNALS = [
  'remediate', 'retry', 'failed run', 'fix forward', 'broken run', 'failed build',
  'last run', 'previous run', 'undo', 'rollback',
]

const OPS_SIGNALS = [
  'system', 'health', 'gateway', 'ops', 'runtime', 'blocked', 'status',
  'latency', 'error rate', 'crash', 'down', 'offline', 'uptime',
]

const RESEARCH_SIGNALS = [
  'research', 'find out', 'compare', 'analyze', 'investigate', 'look into',
  'what approach', 'how should', 'context', 'prior art', 'options',
  'tradeoffs', 'alternatives', 'which is better', 'gather context', 'explore options',
]

// ── Focus target inference from keywords ─────────────────────────────────────

interface FocusHint {
  focusOptionId: string
  keywords: string[]
}

const FOCUS_HINTS: FocusHint[] = [
  { focusOptionId: 'app/calendar',      keywords: ['calendar', 'event', 'schedule', 'booking', 'appointment'] },
  { focusOptionId: 'app/health',        keywords: ['health', 'vital', 'wellness', 'medical', 'nutrition'] },
  { focusOptionId: 'package/scheduler', keywords: ['scheduler', 'scheduling', 'time block', 'slot', 'weekly'] },
  { focusOptionId: 'docs/product',      keywords: ['docs', 'copy', 'product', 'framing', 'readme', 'ui text'] },
]

function inferFocusTarget(text: string): { focusOptionId: string | null; focusTarget: BuilderWorkTarget; targetHint: string | null; targetId: string | null } {
  const lower = text.toLowerCase()

  for (const hint of FOCUS_HINTS) {
    if (hint.keywords.some((kw) => lower.includes(kw))) {
      const option = AGENT_FOCUS_OPTIONS.find((o) => o.id === hint.focusOptionId)
      if (option) {
        return {
          focusOptionId: option.id,
          focusTarget: option.target,
          targetHint: option.label,
          targetId: option.target.targetId,
        }
      }
    }
  }

  return {
    focusOptionId: 'repo-wide',
    focusTarget: buildBuilderRepoTarget(),
    targetHint: 'repo-wide',
    targetId: 'repo',
  }
}

// ── Score-based intent matching ───────────────────────────────────────────────

function countSignals(text: string, signals: string[]): number {
  const lower = text.toLowerCase()
  return signals.filter((sig) => lower.includes(sig)).length
}

// Public wrapper — used by multi-mission planner to route individual sub-missions
export function parseSingleMission(text: string): MissionRoute {
  return deriveRoute(text)
}

// ── Multi-mission detection ────────────────────────────────────────────────────
// Heuristically splits one input into multiple mission texts.
// Returns null if only one mission is detected.
// No AI, no inference — pattern matching only.

export function detectMultiMissions(text: string): string[] | null {
  const trimmed = text.trim()
  const lines   = trimmed.split('\n').map((l) => l.trim()).filter(Boolean)

  // Pattern 1: numbered list  (1. / 1) / 1: — all lines start with a number)
  if (lines.length >= 2) {
    const isNumbered = lines.every((l) => /^\d+[.)]\s+\S/.test(l))
    if (isNumbered) {
      return lines.map((l) => l.replace(/^\d+[.)]\s+/, '').trim()).filter(Boolean)
    }
  }

  // Pattern 2: bullet list  (-, •, *, > — all lines start with a bullet)
  if (lines.length >= 2) {
    const isBulleted = lines.every((l) => /^[-•*>]\s+\S/.test(l))
    if (isBulleted) {
      return lines.map((l) => l.replace(/^[-•*>]\s+/, '').trim()).filter(Boolean)
    }
  }

  // Pattern 3: single-line comma-and list
  // e.g. "build a calendar app, a fitness app, and a journaling app"
  // Only fires if there are at least 2 substantial segments.
  if (lines.length === 1) {
    const ACTION_VERBS = /\b(build|create|add|implement|fix|write|make|develop|design|plan|research|refactor|scaffold|wire|integrate)\b/i
    if (ACTION_VERBS.test(trimmed)) {
      const parts = trimmed
        .split(/,\s*(?:and\s+)?|\s+and\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 4)

      if (parts.length >= 2) {
        // Extract leading verb from the first part and apply to any headless parts
        const verbMatch = parts[0].match(/^(\w+)\s+/i)
        const verb      = verbMatch ? verbMatch[1] : null
        return parts.map((part, i) => {
          if (i === 0) return part
          // Only prepend verb if part doesn't already open with an action verb
          const partHasVerb = ACTION_VERBS.test(part.split(' ')[0])
          return verb && !partHasVerb ? `${verb} ${part}` : part
        })
      }
    }
  }

  return null
}

function deriveRoute(input: string): MissionRoute {
  const route = getOrchestratorProvider().routeMission(input.trim())
  return {
    domain: route.domain,
    providerInterface: route.providerInterface,
    providerKey: route.providerKey,
    agentId: route.agentId as AgentPersonaId,
    agentName: route.agentName,
    actionMode: route.actionMode as MissionActionMode,
    actionLabel: route.actionLabel,
    targetHint: route.targetHint,
    targetId: route.targetId,
    focusTarget: route.focusTarget,
    rationale: route.rationale,
    confidence: route.confidence,
    ambiguous: route.ambiguous,
    fallbackNote: route.fallbackNote,
    executionState: route.executionState,
    unavailableReason: route.unavailableReason,
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useMissionIntakeStore = create<MissionIntakeState>((set, get) => ({
  input:       '',
  phase:       'idle',
  route:       null,
  handoffNote: null,

  setInput(input) {
    set({ input, phase: 'idle', route: null, handoffNote: null })
  },

  parseRoute() {
    const { input } = get()
    if (!input.trim()) return
    const route = deriveRoute(input)
    set({ route, phase: 'parsed', handoffNote: null })
  },

  clearMission() {
    set({ input: '', phase: 'idle', route: null, handoffNote: null })
  },

  confirmHandoff() {
    const { route, input } = get()
    if (!route) return
    if (route.executionState === 'unavailable') {
      set({
        phase: 'parsed',
        handoffNote: route.unavailableReason ?? 'This route is unavailable in the current runtime.',
      })
      return
    }

    getOrchestratorProvider().stageMission(
      {
        id: `route_${Date.now().toString(36)}`,
        domain: route.domain,
        providerInterface: route.providerInterface as any,
        providerKey: route.providerKey,
        agentId: route.agentId,
        agentName: route.agentName,
        actionMode: route.actionMode,
        actionLabel: route.actionLabel,
        targetHint: route.targetHint,
        targetId: route.targetId,
        focusTarget: route.focusTarget,
        rationale: route.rationale,
        confidence: route.confidence,
        ambiguous: route.ambiguous,
        requiresApproval: ['execution-request', 'remediation', 'concierge-workflow'].includes(route.actionMode),
        executionState: route.executionState,
        fallbackNote: route.fallbackNote,
        unavailableReason: route.unavailableReason,
      },
      input.trim(),
    )

    // Persist the full handoff payload and trigger agent-tab navigation
    useMissionHandoffStore.getState().setHandoff({
      missionText:  input.trim(),
      agentId:      route.agentId,
      agentName:    route.agentName,
      actionMode:   route.actionMode,
      actionLabel:  route.actionLabel,
      targetHint:   route.targetHint,
      targetId:     route.targetId,
      rationale:    route.rationale,
      ambiguous:    route.ambiguous,
      source:       'command-center',
      createdAt:    new Date().toISOString(),
    })

    const label = `Mission handed off to ${route.agentName} — ${route.actionLabel}. Open the Agents tab to adopt.`
    set({ phase: 'handed-off', handoffNote: label })
  },
}))
