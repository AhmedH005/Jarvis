import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AgentPersonaId } from '@/adapters/agent-control'

// ── Research brief ────────────────────────────────────────────────────────────

export interface ResearchOption {
  label:       string
  description: string
}

export interface ResearchBrief {
  id:                string
  prompt:            string
  scaffolded:        boolean   // true = fields were pre-filled by scaffold, not user-authored
  summary:           string
  keyFindings:       string[]  // When scaffolded: questions-to-investigate. Otherwise: user findings.
  options:           ResearchOption[]
  tradeoffs:         string[]
  recommendedRoute:  {
    agentId:    AgentPersonaId
    agentName:  string
    rationale:  string
  } | null
  createdAt:  string
  updatedAt:  string
}

export type ResearchPhase = 'idle' | 'briefing' | 'complete'

// ── Store ─────────────────────────────────────────────────────────────────────

export interface ResearcherState {
  prompt:  string
  brief:   ResearchBrief | null
  phase:   ResearchPhase

  setPrompt:     (prompt: string) => void
  scaffoldBrief: () => void
  startBrief:    () => void
  editBrief:     () => void
  updateField:   (field: Partial<Omit<ResearchBrief, 'id' | 'prompt' | 'createdAt'>>) => void
  completeBrief: () => void
  clearBrief:    () => void
}

function genId(): string {
  return `rb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// ── Deterministic scaffold ────────────────────────────────────────────────────
// Generates structural thinking-helpers from the prompt text.
// No web search, no AI inference, no fabricated facts.
// Output is explicitly a draft structure the user must edit.

function buildScaffold(prompt: string): Omit<ResearchBrief, 'id' | 'prompt' | 'createdAt' | 'updatedAt'> {
  const text = prompt.trim()
  const lower = text.toLowerCase()

  // ── Signal detection ─────────────────────────────────────────────────────
  const hasCompare  = /\b(compare|comparison|versus|vs\.?|difference between|which is better|tradeoff[s]? between)\b/.test(lower)
  const hasImplement = /\b(implement|build|add|create|make|write|develop|integrate|wire)\b/.test(lower)
  const hasPlan      = /\b(plan|design|architect|scope|structure|strategy|outline|spec)\b/.test(lower)
  const hasExplore   = /\b(explore|research|investigate|understand|figure out|should we|how should|what approach|best way|options|alternatives)\b/.test(lower)

  // Extract "X vs Y" pair if present
  const vsMatch = text.match(/\b(.{3,40}?)\s+vs\.?\s+(.{3,40?}?)(?=\s+(?:for|in|to|when|[?.!,]|$))/i)
    ?? text.match(/\b(.{3,40}?)\s+vs\.?\s+(.{3,40})/i)

  // ── Summary seed ─────────────────────────────────────────────────────────
  let summary: string
  if (hasCompare && vsMatch) {
    summary = `Comparing "${vsMatch[1].trim()}" vs "${vsMatch[2].trim()}" — goal is to identify the best fit given current constraints.`
  } else if (hasCompare) {
    summary = `Comparing available options to find the best approach. Needs investigation before committing.`
  } else if (hasImplement && !hasExplore) {
    summary = `Evaluating the implementation approach before execution begins. Scope and dependencies to confirm.`
  } else if (hasPlan) {
    summary = `Scoping a design or planning direction. Needs bounded acceptance criteria before execution.`
  } else if (hasExplore) {
    summary = `Open question requiring context-gathering and approach evaluation. Not ready for execution yet.`
  } else {
    summary = `Research question. Context and constraints need clarification before routing to execution.`
  }

  // ── Questions to investigate (stored in keyFindings when scaffolded) ─────
  const keyFindings: string[] = []
  if (hasCompare || vsMatch) {
    keyFindings.push('What hard constraints would eliminate one option entirely?')
    keyFindings.push('What does the current codebase already support or block?')
    keyFindings.push('What is the maintenance burden of each option over 6 months?')
    keyFindings.push('Has a similar decision been made elsewhere in this codebase?')
  } else if (hasImplement) {
    keyFindings.push('What dependencies or blockers exist before this can start?')
    keyFindings.push('Is there existing code or patterns to extend rather than replace?')
    keyFindings.push('What is the minimum viable first step to validate the approach?')
    keyFindings.push('What could go wrong, and how would it be caught early?')
  } else if (hasPlan || hasExplore) {
    keyFindings.push('What is the goal this decision is meant to achieve?')
    keyFindings.push('What constraints (time, scope, dependencies) apply?')
    keyFindings.push('What does success look like — how will we know it worked?')
    keyFindings.push('What is the cost of not deciding now vs deciding later?')
  } else {
    keyFindings.push('What is the problem this question is trying to solve?')
    keyFindings.push('Who or what is most affected by the decision?')
    keyFindings.push('What information would change the answer if we had it?')
  }

  // ── Comparison angles / options ───────────────────────────────────────────
  let options: ResearchOption[]
  if (vsMatch) {
    options = [
      { label: vsMatch[1].trim(), description: 'Investigate fit, complexity, and existing support in the stack.' },
      { label: vsMatch[2].trim(), description: 'Investigate fit, complexity, and existing support in the stack.' },
    ]
  } else if (hasCompare) {
    options = [
      { label: 'Option A — primary', description: 'Define after initial investigation of the question.' },
      { label: 'Option B — alternative', description: 'Define after initial investigation of the question.' },
    ]
  } else {
    options = []
  }

  // ── Trade-off prompts ─────────────────────────────────────────────────────
  let tradeoffs: string[]
  if (hasCompare || vsMatch) {
    tradeoffs = [
      'Short-term complexity vs long-term maintainability',
      'Developer familiarity vs technical best-fit',
      'Delivery speed vs quality of implementation',
    ]
  } else if (hasImplement) {
    tradeoffs = [
      'Build from scratch vs extend existing patterns',
      'Speed of delivery vs correctness and coverage',
      'Local solution vs reusable abstraction',
    ]
  } else {
    tradeoffs = [
      'Cost of acting now vs cost of deferring the decision',
      'Narrow scoped fix vs broader system improvement',
    ]
  }

  // ── Heuristic route recommendation ───────────────────────────────────────
  let recommendedRoute: ResearchBrief['recommendedRoute']
  if (hasImplement && !hasCompare && !hasExplore) {
    // Clear implementation intent — route to Kai after scope is confirmed
    recommendedRoute = {
      agentId:   'kai',
      agentName: 'Kai',
      rationale: 'Implementation signals detected. Kai can create an execution request once scope and approach are confirmed here.',
    }
  } else {
    // Comparison, planning, exploration — Alex to scope first
    recommendedRoute = {
      agentId:   'alex',
      agentName: 'Alex',
      rationale: hasPlan
        ? 'Planning signals detected. Alex can produce a bounded plan with acceptance criteria.'
        : 'Comparison or open-ended question. Alex can turn this into a scoped plan before Kai executes.',
    }
  }

  return {
    scaffolded:       true,
    summary,
    keyFindings,
    options,
    tradeoffs,
    recommendedRoute,
  }
}

// ── Store factory ─────────────────────────────────────────────────────────────

export const useResearcherStore = create<ResearcherState>()(
  persist(
    (set, get) => ({
      prompt: '',
      brief:  null,
      phase:  'idle',

      setPrompt(prompt) {
        set({ prompt })
      },

      scaffoldBrief() {
        const { prompt } = get()
        if (!prompt.trim()) return
        const now      = new Date().toISOString()
        const scaffold = buildScaffold(prompt.trim())
        set({
          phase: 'briefing',
          brief: {
            id:        genId(),
            prompt:    prompt.trim(),
            createdAt: now,
            updatedAt: now,
            ...scaffold,
          },
        })
      },

      startBrief() {
        const { prompt } = get()
        if (!prompt.trim()) return
        const now = new Date().toISOString()
        set({
          phase: 'briefing',
          brief: {
            id:               genId(),
            prompt:           prompt.trim(),
            scaffolded:       false,
            summary:          '',
            keyFindings:      [],
            options:          [],
            tradeoffs:        [],
            recommendedRoute: null,
            createdAt:        now,
            updatedAt:        now,
          },
        })
      },

      editBrief() {
        if (!get().brief) return
        set({ phase: 'briefing' })
      },

      updateField(field) {
        const { brief } = get()
        if (!brief) return
        set({
          brief: { ...brief, ...field, updatedAt: new Date().toISOString() },
        })
      },

      completeBrief() {
        set({ phase: 'complete' })
      },

      clearBrief() {
        set({ prompt: '', brief: null, phase: 'idle' })
      },
    }),
    {
      name:       'jarvis-researcher',
      version:    2,
      partialize: (s) => ({ prompt: s.prompt, brief: s.brief, phase: s.phase }),
    },
  ),
)
