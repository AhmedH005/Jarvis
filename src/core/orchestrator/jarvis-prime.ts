/**
 * jarvis-prime — Main orchestrator
 *
 * Implements the 7-step orchestration flow from orchestrator/flows.md:
 *   1. Receive request
 *   2. Check memory retrieval (if prior context matters)
 *   3. Route: direct answer vs module delegation
 *   4. Collect module outputs
 *   5. Resolve ownership conflicts
 *   6. Gate execution if mutation
 *   7. Return answer + update world state
 *
 * This module does NOT call OpenClaw directly.
 * The adapter layer (src/adapters/openclaw/) handles all API calls.
 * jarvis-prime operates on typed inputs/outputs only.
 */

import { nanoid } from '@/lib/utils'
import { route } from './router'
import { validateHandoff, ESCALATION_RULES } from './policies'
import { approvalGate } from './approval-gate'
import { decisionLog } from './decision-log'
import { handoffBus } from '@/shared/handoff-bus'
import { worldState } from '@/shared/world-state'

import * as MemoryModule   from '@/modules/memory'
import * as SystemModule   from '@/modules/system'
import * as ResearchModule from '@/modules/research'
import * as HealthModule   from '@/modules/health'
import * as MentalModule   from '@/modules/mental'
import * as CalendarModule from '@/modules/calendar'

import type {
  ModuleId,
  ModuleResult,
  OrchestrationContext,
  RouteDecision,
  WorldState,
  Handoff,
} from '@/shared/types'

// ── Adapter injection ──────────────────────────────────────────────────────────
// The OpenClaw adapter provides a send function used by modules that need
// live tool calls (memory_search, session_status, etc.).
// jarvis-prime accepts it as a dependency so the orchestrator stays adapter-agnostic.

export type OpenClawSend = (
  message: string,
  context?: OrchestrationContext,
) => Promise<string>

// ── Orchestrator ───────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  userMessage:    string
  conversationId: string
  history:        Array<{ role: 'user' | 'assistant'; content: string }>
  send:           OpenClawSend   // injected by adapter layer
}

export interface OrchestratorOutput {
  answer:         string
  routeDecision:  RouteDecision
  moduleResults:  ModuleResult[]
  handoffsIssued: Handoff[]
  requestId:      string
}

export async function orchestrate(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const requestId = nanoid()
  const ws: WorldState = worldState.get()

  const ctx: OrchestrationContext = {
    requestId,
    userMessage: input.userMessage,
    worldState:  ws,
    constraints: [],
    history:     input.history,
  }

  // ── Step 1: Route ────────────────────────────────────────────────────────────
  const routeDecision = route(input.userMessage, ws)
  const moduleResults: ModuleResult[] = []
  const handoffsIssued: Handoff[] = []
  let answer = ''

  // ── Step 2: Memory pre-fetch ─────────────────────────────────────────────────
  let memoryContext: MemoryModule.MemoryOutput | null = null
  if (ESCALATION_RULES.prefetchMemoryContext &&
      routeDecision.secondaries.includes('memory') || routeDecision.primary === 'memory') {

    const query   = MemoryModule.buildMemoryQuery(ctx)
    const rawMem  = await input.send(`memory_search: ${query}`, ctx)
    const memOut  = MemoryModule.parseMemoryOutput(rawMem)
    const memRes  = MemoryModule.buildMemoryResult(memOut)
    memoryContext = memOut

    moduleResults.push(memRes)
    decisionLog.appendMany(memRes.decisions)

    // Update world state with retrieved snippets
    worldState.update({
      memoryContext: { recentSnippets: memOut.snippets },
    })
  }

  // ── Step 3: Dispatch to primary module ───────────────────────────────────────

  if (routeDecision.primary === 'direct') {
    // No module delegation — answer directly via jarvis-prime
    answer = await input.send(input.userMessage, ctx)

  } else if (routeDecision.primary === 'memory') {
    // Memory was primary — answer is already built from context
    answer = memoryContext?.summary ?? await input.send(input.userMessage, ctx)

  } else if (routeDecision.primary === 'system') {
    const rawOut = await input.send('session_status', ctx)
    const sysOut = SystemModule.parseSystemOutput(rawOut)
    const sysRes = SystemModule.buildSystemResult(sysOut)
    moduleResults.push(sysRes)
    decisionLog.appendMany(sysRes.decisions)
    answer = await input.send(
      `System status: ${sysOut.diagnosticNotes}\nUser question: ${input.userMessage}`,
      ctx,
    )

  } else if (routeDecision.primary === 'research') {
    const resRes = ResearchModule.buildResearchResult(input.userMessage)
    moduleResults.push(resRes)
    decisionLog.appendMany(resRes.decisions)

    if (ESCALATION_RULES.gracefulResearchFallback) {
      // Acknowledge block, answer from training knowledge
      answer = await input.send(
        `Note: research module is blocked (${resRes.data?.explanation}).\nAnswer from training knowledge: ${input.userMessage}`,
        ctx,
      )
    } else {
      answer = resRes.data?.explanation ?? 'Research unavailable.'
    }

  } else if (routeDecision.primary === 'health') {
    const plan    = HealthModule.buildHealthPlan(ctx)
    const healRes = HealthModule.buildHealthResult(plan)
    moduleResults.push(healRes)
    decisionLog.appendMany(healRes.decisions)

    // Process health handoffs to calendar
    const calHandoffs = healRes.handoffs.filter((h) => h.toModule === 'calendar')
    if (calHandoffs.length > 0) {
      const calSuggestion = CalendarModule.buildCalendarSuggestion(calHandoffs)
      const calRes        = CalendarModule.buildCalendarResult(calSuggestion, calHandoffs)
      moduleResults.push(calRes)
      decisionLog.appendMany(calRes.decisions)
      handoffBus.dispatch(calHandoffs)
      handoffsIssued.push(...calHandoffs)

      answer = await input.send(
        `Health plan: ${plan.notes}\nSchedule suggestion: ${calSuggestion.presentation}\nCaveat: ${calSuggestion.caveat}\nUser question: ${input.userMessage}`,
        ctx,
      )
    } else {
      answer = await input.send(
        `Health plan: ${plan.notes}\nUser question: ${input.userMessage}`,
        ctx,
      )
    }

  } else if (routeDecision.primary === 'mental') {
    const assessment = MentalModule.assessMentalState(ctx)
    const mentalRes  = MentalModule.buildMentalResult(assessment)
    moduleResults.push(mentalRes)
    decisionLog.appendMany(mentalRes.decisions)

    // Update world mental state
    worldState.update({
      mentalState: {
        overloadFlag: assessment.overloadDetected,
        bufferNeeded: assessment.bufferNeeded,
        currentMode:  assessment.currentMode,
        notes:        assessment.recommendation,
      },
    })

    // Process mental handoffs to calendar
    const calHandoffs = mentalRes.handoffs.filter((h) => h.toModule === 'calendar')
    if (calHandoffs.length > 0) {
      const calSuggestion = CalendarModule.buildCalendarSuggestion(calHandoffs)
      const calRes        = CalendarModule.buildCalendarResult(calSuggestion, calHandoffs)
      moduleResults.push(calRes)
      decisionLog.appendMany(calRes.decisions)
      handoffBus.dispatch(calHandoffs)
      handoffsIssued.push(...calHandoffs)

      answer = await input.send(
        `Mental assessment: ${assessment.recommendation}\nSchedule suggestion: ${calSuggestion.presentation}\nUser question: ${input.userMessage}`,
        ctx,
      )
    } else {
      answer = await input.send(
        `Mental state: ${assessment.currentMode}. ${assessment.recommendation}\nUser question: ${input.userMessage}`,
        ctx,
      )
    }

  } else if (routeDecision.primary === 'calendar') {
    // Direct calendar request — no live integration, present constraint + suggestion
    const suggestion = CalendarModule.buildCalendarSuggestion([])
    const calRes     = CalendarModule.buildCalendarResult(suggestion, [])
    moduleResults.push(calRes)
    decisionLog.appendMany(calRes.decisions)
    answer = await input.send(
      `Calendar status: ${CalendarModule.MODULE_STATE.currentConstraints.join('; ')}\nUser question: ${input.userMessage}`,
      ctx,
    )

  } else if (routeDecision.primary === 'execution') {
    // ── Step 6: Approval gate ──────────────────────────────────────────────────
    const approval = await approvalGate.request({
      requestedBy:     'jarvis-prime',
      intent:          input.userMessage,
      scope:           ['unknown — plan not yet built'],
      plan:            'Awaiting user confirmation before building execution plan',
      expectedOutcome: 'Unknown',
      rollback:        'No changes made until approved',
      priority:        'normal',
    })

    if (!approval.approved) {
      answer = `Execution cancelled: ${approval.reason ?? 'User rejected the request.'}`
    } else {
      // Post-approval: delegate to adapter to build + run execution plan
      answer = await input.send(
        `Approved execution: ${input.userMessage}`,
        ctx,
      )
    }
  }

  // ── Step 5: Validate any cross-module handoffs ────────────────────────────────
  handoffsIssued.forEach((h) => {
    const { valid, reason } = validateHandoff(h)
    if (!valid) console.warn(`[jarvis-prime] Invalid handoff blocked: ${reason}`)
  })

  return { answer, routeDecision, moduleResults, handoffsIssued, requestId }
}
