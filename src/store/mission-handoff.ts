import { create } from 'zustand'
import type { AgentPersonaId } from '@/adapters/agent-control'
import type { MissionActionMode } from './mission-intake'

// ── Research context (optional — populated by Researcher handoffs) ────────────

export interface ResearchContext {
  summary:     string
  /** When scaffolded: questions to investigate. Otherwise: user-authored findings. */
  keyFindings: string[]
  options:     Array<{ label: string; description: string }>
  tradeoffs:   string[]
  scaffolded:  boolean
}

// ── Handoff payload ───────────────────────────────────────────────────────────

export interface MissionHandoff {
  missionText:      string
  agentId:          AgentPersonaId
  agentName:        string
  actionMode:       MissionActionMode
  actionLabel:      string
  targetHint:       string | null
  targetId:         string | null
  rationale:        string
  ambiguous:        boolean
  source:           'command-center' | 'researcher'
  createdAt:        string
  /** Structured Researcher output — present when source === 'researcher' */
  researchContext?: ResearchContext
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface MissionHandoffState {
  /** All queued handoffs, including the active one */
  handoffQueue:    MissionHandoff[]
  /** The handoff currently shown in the banner / being worked on */
  activeHandoff:   MissionHandoff | null

  navigationTarget: 'agents' | null

  /**
   * Transient hint: which agent to auto-select when the Agents tab opens.
   * Set whenever a new handoff becomes active.
   */
  agentSelectHint: AgentPersonaId | null

  /**
   * Push a new handoff onto the queue. If nothing is active yet, the new
   * handoff becomes active immediately and triggers tab navigation.
   */
  setHandoff:           (handoff: MissionHandoff) => void

  /**
   * Explicitly select a queued handoff as the active one (used by the
   * incoming-missions inbox when the user clicks a non-active item).
   */
  setActiveHandoff:     (handoff: MissionHandoff) => void

  /**
   * Navigate to the Agents tab and auto-select a specific agent without
   * creating a full mission handoff. Used by the work queue.
   */
  navigateToAgent:      (agentId: AgentPersonaId) => void

  /** AgentsTab calls this after consuming the hint */
  clearAgentSelectHint: () => void

  /** TabShell calls this after it has handled the navigation */
  clearNavigation:      () => void

  /** Receiving surface: accept context → remove active, advance to next */
  adopt:                () => void

  /** Receiving surface: discard without applying → remove active, advance to next */
  dismiss:              () => void
}

export const useMissionHandoffStore = create<MissionHandoffState>((set, get) => ({
  handoffQueue:    [],
  activeHandoff:   null,
  navigationTarget: null,
  agentSelectHint: null,

  setHandoff(handoff) {
    set((s) => {
      const queue      = [...s.handoffQueue, handoff]
      // Only become active (and trigger nav) if nothing is active yet
      const alreadyActive = s.activeHandoff !== null
      return {
        handoffQueue:    queue,
        activeHandoff:   alreadyActive ? s.activeHandoff : handoff,
        navigationTarget: 'agents',
        agentSelectHint: alreadyActive ? s.agentSelectHint : handoff.agentId,
      }
    })
  },

  setActiveHandoff(handoff) {
    set({ activeHandoff: handoff, agentSelectHint: handoff.agentId })
  },

  navigateToAgent(agentId) {
    set({ navigationTarget: 'agents', agentSelectHint: agentId })
  },

  clearAgentSelectHint() {
    set({ agentSelectHint: null })
  },

  clearNavigation() {
    set({ navigationTarget: null })
  },

  adopt() {
    const { handoffQueue, activeHandoff } = get()
    const remaining = handoffQueue.filter((h) => h !== activeHandoff)
    // Do NOT auto-advance — leave activeHandoff null so user explicitly opens next
    set({
      handoffQueue:    remaining,
      activeHandoff:   null,
      agentSelectHint: null,
    })
  },

  dismiss() {
    const { handoffQueue, activeHandoff } = get()
    const remaining = handoffQueue.filter((h) => h !== activeHandoff)
    const next      = remaining[0] ?? null
    set({
      handoffQueue:  remaining,
      activeHandoff: next,
      agentSelectHint: next?.agentId ?? null,
    })
  },
}))
