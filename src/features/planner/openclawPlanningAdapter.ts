/**
 * OpenClaw Planning Adapter
 *
 * Isolated AI integration layer for the planning system.
 *
 * Responsibilities:
 * - Serial call queue (prevents concurrent stream listener collisions)
 * - Per-request timeout + guaranteed cleanup
 * - Structured debug logging (console.debug — silent in production by default)
 * - JSON prompt building, response parsing, strict schema validation
 * - Deterministic fallbacks for every AI operation
 * - Rich candidate slot generation for the optimizer
 *
 * Rules:
 * - No React / UI imports
 * - No direct store mutations
 * - All AI outputs are validated before returning
 * - Every public function has a deterministic fallback path
 *
 * UI code must NOT import this module directly.
 * All public access goes through planningOrchestrator.ts.
 */

import type { Task, CalendarBlock } from '@/store/planner'
import {
  suggestPlacement,
  getAvailableSlots,
  getWorkloadSummary,
  rebuildDay,
  rebuildWeek,
  toMinutes,
  addMinsToTime,
  DEFAULT_CONSTRAINTS,
} from '@/features/scheduler/schedulerService'
import type { TimeSlot } from '@/features/scheduler/schedulerService'
import { today, addDays } from '@/lib/dateUtils'
import type {
  EnrichedCandidateSlot,
  PlanningAction,
  OptimizeDayResult,
  OptimizeWeekResult,
} from './planningTypes'
import type { ActiveRefinementConstraints } from './plannerRefinementTypes'

// ── Re-export core types ───────────────────────────────────────────────────────

export type { EnrichedCandidateSlot, PlanningAction, OptimizeDayResult, OptimizeWeekResult }
export type { TimeSlot }

// ── AI output types ───────────────────────────────────────────────────────────

export interface TaskInterpretationResult {
  taskId: string
  inferredPriority: 'low' | 'medium' | 'high' | null
  inferredEnergyType: 'deep' | 'moderate' | 'light' | null
  estimatedDurationAdjustmentMinutes: number | null
  splitRecommendation: {
    shouldSplit: boolean
    suggestedChunkMinutes?: number
    rationale?: string
  } | null
  rationale: string
  confidence: number   // 0–1
  source: 'ai' | 'fallback'
}

export interface ScheduleRecommendationResult {
  taskId: string
  recommendedAction: 'schedule' | 'defer' | 'split' | 'unschedule' | 'none'
  suggestedWindow: { date: string; start: string; end: string } | null
  backupWindows: Array<{ date: string; start: string; end: string }>
  rationale: string
  confidence: number   // 0–1
  warnings: string[]
  source: 'ai' | 'fallback'
}

export interface WeeklyCommentaryResult {
  summaryText: string
  keyRisks: string[]
  keyOpportunities: string[]
  suggestedFocus: string[]
  confidence: number   // 0–1
  source: 'ai' | 'fallback'
}

/** Minimal PlannerSummary shape — avoids circular import from planningOrchestrator */
interface PlannerSummaryInput {
  overloadedDays: string[]
  unscheduledCriticalTasks: Array<{ id: string; title: string; priority: string; dueDate?: string }>
  focusWindowSuggestions: Array<{ date: string; startTime: string; endTime: string; durationMinutes: number }>
  riskFlags: Array<{ message: string; severity: 'error' | 'warning' }>
  weeklyCommentary: string
  generatedAt: string
}

// ── Serial planning request queue ─────────────────────────────────────────────
//
// The OpenClaw stream bus is shared — concurrent callers would receive each
// other's tokens. We serialize all planning calls through a promise chain.
// Each call waits for the previous one to settle (resolve or reject) before
// starting its own IPC exchange.

let _queueTail: Promise<void> = Promise.resolve()

function enqueueCall<T>(fn: () => Promise<T>): Promise<T> {
  const result = _queueTail.then(fn)
  // Swallow errors on the tail so the chain never permanently breaks
  _queueTail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

// ── Raw OpenClaw IPC call ─────────────────────────────────────────────────────

const PLANNING_TIMEOUT_MS = 30_000

async function rawCallOpenClaw(prompt: string, label: string): Promise<string> {
  if (!window.jarvis) {
    throw new Error('Electron bridge unavailable — planning AI requires the desktop app')
  }

  console.debug(`[planner:ai] ${label} — start (${prompt.length} chars)`)

  return new Promise<string>((resolve, reject) => {
    let accumulated = ''
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout>
    // unsub is assigned synchronously inside the Promise body before send() is called
    // eslint-disable-next-line prefer-const
    let unsub: () => void = () => {}

    function finish(fn: () => void): void {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      unsub()
      fn()
    }

    timeoutId = setTimeout(() => {
      finish(() => {
        console.debug(`[planner:ai] ${label} — TIMEOUT after ${PLANNING_TIMEOUT_MS}ms`)
        reject(new Error(`AI planning timed out (${PLANNING_TIMEOUT_MS / 1000}s) — ${label}`))
      })
    }, PLANNING_TIMEOUT_MS)

    unsub = window.jarvis!.openclaw.onStream((event) => {
      if (settled) return
      if (event.type === 'token') {
        accumulated += event.payload
      } else if (event.type === 'end') {
        finish(() => {
          console.debug(`[planner:ai] ${label} — complete (${accumulated.length} chars)`)
          resolve(accumulated)
        })
      } else if (event.type === 'error') {
        finish(() => {
          console.debug(`[planner:ai] ${label} — stream error: ${event.payload}`)
          reject(new Error(event.payload))
        })
      }
    })

    window.jarvis!.openclaw
      .send(prompt, undefined, [], 'planner')
      .catch((err: unknown) => {
        finish(() => {
          const msg = err instanceof Error ? err.message : String(err)
          console.debug(`[planner:ai] ${label} — send error: ${msg}`)
          reject(err instanceof Error ? err : new Error(msg))
        })
      })
  })
}

/**
 * Queue and execute a planning AI call.
 * Calls are serialized — at most one runs at a time.
 */
function callOpenClawForPlanning(prompt: string, label: string): Promise<string> {
  return enqueueCall(() => rawCallOpenClaw(prompt, label))
}

// ── JSON parsing utilities ────────────────────────────────────────────────────

function parseJSON(text: string): unknown {
  // Accept markdown fenced blocks or bare JSON
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1].trim() : text.trim()
  const objMatch = candidate.match(/\{[\s\S]*\}/)
  if (!objMatch) return null
  try {
    return JSON.parse(objMatch[0])
  } catch {
    return null
  }
}

function clampConfidence(v: unknown): number {
  const n = typeof v === 'number' ? v : 0
  return Math.max(0, Math.min(1, n))
}

function safeString(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

function daysUntilDue(dueDate: string | undefined): number | null {
  if (!dueDate) return null
  const td = today()
  return Math.round(
    (new Date(dueDate + 'T12:00:00').getTime() - new Date(td + 'T12:00:00').getTime()) / 86400000,
  )
}

// ── Rich candidate slot generation ────────────────────────────────────────────

const DEEP_WINDOWS = DEFAULT_CONSTRAINTS.deepWindows
const MODERATE_WINDOWS = DEFAULT_CONSTRAINTS.moderateWindows
const MORNING_START = 9 * 60
const MORNING_END = 12 * 60

// Focus quality: 0–1 score based on how premium the time window is.
// 1.0 = fully inside the prime deep-work block (09:00–12:00)
function computeFocusQuality(startMin: number, endMin: number): number {
  const DEEP_S = 9 * 60          // 540 = 09:00
  const DEEP_E = 12 * 60         // 720 = 12:00
  const MOD_S  = 13 * 60 + 30   // 810 = 13:30
  const MOD_E  = 16 * 60        // 960 = 16:00
  const dur = endMin - startMin
  if (dur <= 0) return 0

  if (startMin >= DEEP_S && endMin <= DEEP_E) return 1.0

  const deepOverlap = Math.max(0, Math.min(endMin, DEEP_E) - Math.max(startMin, DEEP_S))
  if (deepOverlap > 0) return Math.round((0.7 * deepOverlap) / dur * 100) / 100

  if (startMin >= MOD_S && endMin <= MOD_E) return 0.5

  const modOverlap = Math.max(0, Math.min(endMin, MOD_E) - Math.max(startMin, MOD_S))
  if (modOverlap > 0) return Math.round((0.3 * modOverlap) / dur * 100) / 100

  return 0
}

function overlapsRange(startMin: number, endMin: number, rangeStart: number, rangeEnd: number): boolean {
  return startMin < rangeEnd && endMin > rangeStart
}

function isDueSoon(task: Pick<Task, 'dueDate'>): boolean {
  if (!task.dueDate) return false
  const td = today()
  const daysUntilDue = Math.round(
    (new Date(`${task.dueDate}T12:00:00`).getTime() - new Date(`${td}T12:00:00`).getTime()) / 86400000,
  )
  return daysUntilDue <= 1
}

function overlapsBlockedWindow(
  date: string,
  startMin: number,
  endMin: number,
  constraints?: ActiveRefinementConstraints,
): boolean {
  return (constraints?.blockedWindows ?? []).some((window) => (
    window.date === date &&
    overlapsRange(startMin, endMin, toMinutes(window.startTime), toMinutes(window.endTime))
  ))
}

function satisfiesBufferConstraint(
  date: string,
  startMin: number,
  endMin: number,
  blocks: CalendarBlock[],
  minBufferMinutes?: number | null,
  excludedBlockId?: string,
): boolean {
  if (!minBufferMinutes || minBufferMinutes <= 0) return true
  const dayBlocks = blocks.filter((block) => block.date === date && block.id !== excludedBlockId)
  return !dayBlocks.some((block) => {
    const blockStart = toMinutes(block.startTime)
    const blockEnd = blockStart + block.duration
    return startMin < (blockEnd + minBufferMinutes) && endMin > (blockStart - minBufferMinutes)
  })
}

function violatesRefinementConstraints(
  task: Pick<Task, 'energyType' | 'dueDate'> | null,
  date: string,
  startMin: number,
  endMin: number,
  blocks: CalendarBlock[],
  constraints?: ActiveRefinementConstraints,
  excludedBlockId?: string,
): boolean {
  if (!constraints) return false

  if (constraints.earliestStartTime && startMin < toMinutes(constraints.earliestStartTime)) {
    return true
  }
  if (constraints.latestEndTime && endMin > toMinutes(constraints.latestEndTime)) {
    return true
  }
  if (overlapsBlockedWindow(date, startMin, endMin, constraints)) {
    return true
  }
  if (!satisfiesBufferConstraint(date, startMin, endMin, blocks, constraints.minBufferMinutes, excludedBlockId)) {
    return true
  }
  if (constraints.protectMorning && overlapsRange(startMin, endMin, MORNING_START, MORNING_END)) {
    return true
  }
  if (constraints.deepWorkMorningOnly && task?.energyType !== 'deep' && overlapsRange(startMin, endMin, MORNING_START, MORNING_END)) {
    return true
  }

  return false
}

function applyRefinementScoreAdjustments(
  baseScore: number,
  task: Pick<Task, 'energyType' | 'dueDate'> | null,
  date: string,
  startMin: number,
  endMin: number,
  constraints?: ActiveRefinementConstraints,
): number {
  if (!constraints) return baseScore

  let score = baseScore

  if (constraints.preferLaterScheduling) {
    score += startMin / 2
  }
  if (constraints.deepWorkMorningOnly && task?.energyType === 'deep') {
    score += overlapsRange(startMin, endMin, MORNING_START, MORNING_END) ? 220 : -80
  }
  if (constraints.avoidDeferringDueSoon && task && isDueSoon(task)) {
    score += date <= (task.dueDate ?? date) ? 180 : -280
  }
  if (constraints.minBufferMinutes) {
    score += 40
  }

  return score
}

/**
 * Generate a rich list of validated candidate slots for a task.
 *
 * Searches forward from `searchStart` (default: today) for up to 7 days,
 * computing energy alignment, urgency fit, focus window membership, and a
 * composite score for each slot. Returns at most `maxSlots` results sorted
 * by score descending.
 *
 * Safe to call for any task — slots are derived from the deterministic
 * scheduler and cannot be invented by AI.
 */
export function generateRichCandidateSlots(
  task: Task,
  blocks: CalendarBlock[],
  options: { targetDate?: string; searchDays?: number; maxSlots?: number; refinementConstraints?: ActiveRefinementConstraints } = {},
): EnrichedCandidateSlot[] {
  const { targetDate, searchDays = 7, maxSlots = 8, refinementConstraints } = options
  const td = today()
  const searchStart = targetDate ?? td
  const searchEnd = targetDate ?? addDays(td, searchDays - 1)

  // Precompute workload per day for the search range
  const workload = getWorkloadSummary(blocks, searchStart, searchEnd, DEFAULT_CONSTRAINTS)
  const workloadMap = new Map(workload.map((d) => [d.date, d.totalMinutes]))

  const relevantWindows =
    task.energyType === 'deep' ? DEEP_WINDOWS :
    task.energyType === 'moderate' ? MODERATE_WINDOWS :
    null  // light = any window

  const results: EnrichedCandidateSlot[] = []
  let d = searchStart

  while (d <= searchEnd && results.length < maxSlots) {
    const slots = getAvailableSlots(blocks, d, task.durationMinutes, DEFAULT_CONSTRAINTS)

    for (const slot of slots) {
      if (results.length >= maxSlots) break

      const startMin = toMinutes(slot.startTime)
      const endMin = startMin + task.durationMinutes

      if (violatesRefinementConstraints(task, d, startMin, endMin, blocks, refinementConstraints)) {
        continue
      }

      // Energy alignment
      let energyAlignment: EnrichedCandidateSlot['energyAlignment'] = 'none'
      if (relevantWindows) {
        const perfect = relevantWindows.some((w) => startMin >= w.start && endMin <= w.end)
        if (perfect) {
          energyAlignment = 'perfect'
        } else {
          const partial = relevantWindows.some((w) => startMin < w.end && endMin > w.start)
          if (partial) energyAlignment = 'partial'
        }
      } else {
        // Light tasks fit anywhere — treat as perfect alignment
        energyAlignment = 'perfect'
      }

      // Urgency fit
      let urgencyFit: EnrichedCandidateSlot['urgencyFit'] = 'no-deadline'
      if (task.dueDate) {
        if (d < task.dueDate) urgencyFit = 'before-due'
        else if (d === task.dueDate) urgencyFit = 'on-due'
        else urgencyFit = 'after-due'
      }

      // Focus window membership (deep OR moderate preferred window)
      const isFocusWindow = [...DEEP_WINDOWS, ...MODERATE_WINDOWS].some(
        (w) => startMin >= w.start && endMin <= w.end,
      )

      // Composite score (higher = better for AI context + deterministic fallback)
      const daysFromNow = Math.round(
        (new Date(d + 'T12:00:00').getTime() - new Date(td + 'T12:00:00').getTime()) / 86400000,
      )
      let score = 0
      score -= daysFromNow * 100           // prefer sooner dates
      score -= startMin / 60               // prefer earlier in day
      if (energyAlignment === 'perfect') score += 500
      else if (energyAlignment === 'partial') score += 200
      if (urgencyFit === 'before-due' || urgencyFit === 'on-due') score += 300
      else if (urgencyFit === 'after-due') score -= 200
      if (isFocusWindow) score += 100
      score = applyRefinementScoreAdjustments(score, task, d, startMin, endMin, refinementConstraints)

      results.push({
        taskId: task.id,
        date: d,
        startTime: slot.startTime,
        endTime: slot.endTime,
        durationMinutes: task.durationMinutes,
        dayWorkloadMinutes: workloadMap.get(d) ?? 0,
        energyAlignment,
        urgencyFit,
        isFocusWindow,
        score,
        focusQuality: computeFocusQuality(startMin, endMin),
        displacementCost: 0,
        isChunkSlot: false,
        isBlockDestination: false,
      })
    }

    d = addDays(d, 1)
  }

  return results.sort((a, b) => b.score - a.score)
}

/**
 * Get a minimal TimeSlot[] candidate list for single-task scheduling.
 * Uses suggestPlacement for the primary + alternates, then wraps as TimeSlot[].
 */
export function getCandidateSlotsForTask(
  task: Pick<Task, 'id' | 'durationMinutes' | 'energyType' | 'dueDate' | 'priority'>,
  blocks: CalendarBlock[],
): TimeSlot[] {
  const suggestion = suggestPlacement(task, blocks)
  if (!suggestion.success) return []

  return [
    {
      date: suggestion.date,
      startTime: suggestion.startTime,
      endTime: suggestion.endTime,
      durationMinutes: task.durationMinutes,
    },
    ...suggestion.alternates.map((alt) => ({
      date: alt.date,
      startTime: alt.startTime,
      endTime: alt.endTime,
      durationMinutes: task.durationMinutes,
    })),
  ]
}

// ── Chunk candidate generation ────────────────────────────────────────────────

/**
 * Generate chunk-slot candidates for a task being split.
 * `chunkDurationMinutes` is the per-chunk size (shorter than task.durationMinutes).
 * Returned candidates have isChunkSlot=true.
 */
function generateChunkCandidates(
  task: Task,
  blocks: CalendarBlock[],
  chunkDurationMinutes: number,
  options: { targetDate?: string; searchDays?: number; maxSlots?: number; refinementConstraints?: ActiveRefinementConstraints } = {},
): EnrichedCandidateSlot[] {
  const { targetDate, searchDays = 7, maxSlots = 6, refinementConstraints } = options
  const td = today()
  const searchStart = targetDate ?? td
  const searchEnd = targetDate ?? addDays(td, searchDays - 1)

  const workload = getWorkloadSummary(blocks, searchStart, searchEnd, DEFAULT_CONSTRAINTS)
  const workloadMap = new Map(workload.map((d) => [d.date, d.totalMinutes]))

  const relevantWindows =
    task.energyType === 'deep' ? DEEP_WINDOWS :
    task.energyType === 'moderate' ? MODERATE_WINDOWS :
    null

  const results: EnrichedCandidateSlot[] = []
  let d = searchStart

  while (d <= searchEnd && results.length < maxSlots) {
    const slots = getAvailableSlots(blocks, d, chunkDurationMinutes, DEFAULT_CONSTRAINTS)

    for (const slot of slots) {
      if (results.length >= maxSlots) break
      const startMin = toMinutes(slot.startTime)
      const endMin = startMin + chunkDurationMinutes

      if (violatesRefinementConstraints(task, d, startMin, endMin, blocks, refinementConstraints)) {
        continue
      }

      let energyAlignment: EnrichedCandidateSlot['energyAlignment'] = 'none'
      if (relevantWindows) {
        if (relevantWindows.some((w) => startMin >= w.start && endMin <= w.end)) {
          energyAlignment = 'perfect'
        } else if (relevantWindows.some((w) => startMin < w.end && endMin > w.start)) {
          energyAlignment = 'partial'
        }
      } else {
        energyAlignment = 'perfect'
      }

      let urgencyFit: EnrichedCandidateSlot['urgencyFit'] = 'no-deadline'
      if (task.dueDate) {
        urgencyFit = d < task.dueDate ? 'before-due' : d === task.dueDate ? 'on-due' : 'after-due'
      }

      const isFocusWindow = [...DEEP_WINDOWS, ...MODERATE_WINDOWS].some(
        (w) => startMin >= w.start && endMin <= w.end,
      )

      const daysFromNow = Math.round(
        (new Date(d + 'T12:00:00').getTime() - new Date(td + 'T12:00:00').getTime()) / 86400000,
      )
      let score = 0
      score -= daysFromNow * 100
      score -= startMin / 60
      if (energyAlignment === 'perfect') score += 500
      else if (energyAlignment === 'partial') score += 200
      if (urgencyFit === 'before-due' || urgencyFit === 'on-due') score += 300
      else if (urgencyFit === 'after-due') score -= 200
      if (isFocusWindow) score += 100
      score = applyRefinementScoreAdjustments(score, task, d, startMin, endMin, refinementConstraints)

      results.push({
        taskId: task.id,
        date: d,
        startTime: slot.startTime,
        endTime: addMinsToTime(slot.startTime, chunkDurationMinutes),
        durationMinutes: task.durationMinutes,
        dayWorkloadMinutes: workloadMap.get(d) ?? 0,
        energyAlignment,
        urgencyFit,
        isFocusWindow,
        score,
        focusQuality: computeFocusQuality(startMin, endMin),
        displacementCost: 0,
        isChunkSlot: true,
        chunkDurationMinutes,
        isBlockDestination: false,
      })
    }

    d = addDays(d, 1)
  }

  return results.sort((a, b) => b.score - a.score)
}

// ── Movable block candidate generation ───────────────────────────────────────

/**
 * Generate destination candidates for a flexible (movable) block.
 * Finds free slots for the block's duration on `targetDate`, excluding the
 * block itself. Returned candidates have isBlockDestination=true, taskId=blockId.
 */
function generateMovableCandidates(
  block: CalendarBlock,
  allBlocks: CalendarBlock[],
  targetDate: string,
  refinementConstraints?: ActiveRefinementConstraints,
): EnrichedCandidateSlot[] {
  const td = today()
  const otherBlocks = allBlocks.filter((b) => b.id !== block.id)
  const slots = getAvailableSlots(otherBlocks, targetDate, block.duration, DEFAULT_CONSTRAINTS)

  const workload = getWorkloadSummary(otherBlocks, targetDate, targetDate, DEFAULT_CONSTRAINTS)
  const dayWorkload = workload[0]?.totalMinutes ?? 0

  const results: EnrichedCandidateSlot[] = []

  for (const slot of slots.slice(0, 4)) {
    const startMin = toMinutes(slot.startTime)
    const endMin = startMin + block.duration
    if (violatesRefinementConstraints(null, targetDate, startMin, endMin, otherBlocks, refinementConstraints, block.id)) {
      continue
    }
    const isFocusWindow = [...DEEP_WINDOWS, ...MODERATE_WINDOWS].some(
      (w) => startMin >= w.start && endMin <= w.end,
    )
    const daysFromNow = Math.round(
      (new Date(targetDate + 'T12:00:00').getTime() - new Date(td + 'T12:00:00').getTime()) / 86400000,
    )
    let score = 0
    score -= daysFromNow * 100
    score -= startMin / 60
    if (isFocusWindow) score += 100
    score = applyRefinementScoreAdjustments(score, null, targetDate, startMin, endMin, refinementConstraints)

    results.push({
      taskId: block.id,
      date: targetDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationMinutes: block.duration,
      dayWorkloadMinutes: dayWorkload,
      energyAlignment: 'none' as const,
      urgencyFit: 'no-deadline' as const,
      isFocusWindow,
      score,
      focusQuality: computeFocusQuality(startMin, endMin),
      displacementCost: 0,
      isChunkSlot: false,
      isBlockDestination: true,
    })
  }

  return results.sort((a, b) => b.score - a.score)
}

// ── Premium free window detection ─────────────────────────────────────────────

interface PremiumFreeWindow {
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
}

/**
 * Detect premium focus windows (09:00–12:00, 13:30–16:00) on a date that
 * are fully unoccupied by any existing block. Used by fallback to suggest
 * protect_focus_window actions.
 */
function detectPremiumFreeWindows(blocks: CalendarBlock[], date: string): PremiumFreeWindow[] {
  const dayBlocks = blocks.filter((b) => b.date === date)
  const windows: PremiumFreeWindow[] = [
    { date, startTime: '09:00', endTime: '12:00', durationMinutes: 180 },
    { date, startTime: '13:30', endTime: '16:00', durationMinutes: 150 },
  ]

  return windows.filter((w) => {
    const wStart = toMinutes(w.startTime)
    const wEnd = toMinutes(w.endTime)
    return !dayBlocks.some((b) => {
      const bStart = toMinutes(b.startTime)
      const bEnd = bStart + b.duration
      return bStart < wEnd && bEnd > wStart
    })
  })
}

function shouldAllowDeferral(task: Task, toDate: string, constraints?: ActiveRefinementConstraints): boolean {
  if (!constraints?.avoidDeferringDueSoon) return true
  if (!isDueSoon(task)) return true
  return Boolean(task.dueDate && toDate <= task.dueDate)
}

function compareTasksForScheduling(a: Task, b: Task): number {
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  const priorityDelta = priorityOrder[a.priority] - priorityOrder[b.priority]
  if (priorityDelta !== 0) return priorityDelta
  return (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
}

function candidateConflictsWithBlocks(candidate: EnrichedCandidateSlot, blocks: CalendarBlock[]): boolean {
  const candidateStart = toMinutes(candidate.startTime)
  const candidateEnd = candidateStart + (candidate.isChunkSlot ? (candidate.chunkDurationMinutes ?? candidate.durationMinutes) : candidate.durationMinutes)
  return blocks.some((block) => {
    if (block.date !== candidate.date) return false
    const blockStart = toMinutes(block.startTime)
    const blockEnd = blockStart + block.duration
    return candidateStart < blockEnd && candidateEnd > blockStart
  })
}

function buildPreviewTaskBlock(task: Task, candidate: EnrichedCandidateSlot): CalendarBlock {
  return {
    id: `fallback-preview-${task.id}-${candidate.date}-${candidate.startTime}-${candidate.isChunkSlot ? candidate.chunkDurationMinutes : candidate.durationMinutes}`,
    title: task.title,
    date: candidate.date,
    startTime: candidate.startTime,
    duration: candidate.isChunkSlot ? (candidate.chunkDurationMinutes ?? task.durationMinutes) : task.durationMinutes,
    color: task.energyType === 'deep' ? '#9d4edd' : task.energyType === 'moderate' ? '#00d4ff' : '#00ff88',
    type: 'task-block',
    locked: false,
    flexible: true,
    recurring: false,
    source: 'scheduler',
    linkedTaskId: task.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function buildDeterministicChunkPlan(
  task: Task,
  chunkCandidates: Array<{ candidate: EnrichedCandidateSlot; index: number }>,
): {
  chunks: Array<{ durationMinutes: number; candidateIndex: number }>
  previewBlocks: CalendarBlock[]
} | null {
  if (chunkCandidates.length < 2) return null

  const selected: Array<{ candidate: EnrichedCandidateSlot; index: number }> = []
  let scheduledMinutes = 0

  for (const entry of chunkCandidates) {
    const chunkDuration = entry.candidate.chunkDurationMinutes ?? 0
    if (chunkDuration <= 0) continue
    const overlapsExistingChunk = selected.some(({ candidate }) => (
      candidate.date === entry.candidate.date &&
      overlapsRange(
        toMinutes(candidate.startTime),
        toMinutes(candidate.startTime) + (candidate.chunkDurationMinutes ?? candidate.durationMinutes),
        toMinutes(entry.candidate.startTime),
        toMinutes(entry.candidate.startTime) + chunkDuration,
      )
    ))
    if (overlapsExistingChunk) continue
    selected.push(entry)
    scheduledMinutes += chunkDuration
    if (selected.length >= 2 && scheduledMinutes >= Math.min(task.durationMinutes, chunkDuration * 2)) {
      break
    }
  }

  if (selected.length < 2) return null

  return {
    chunks: selected.map(({ candidate, index }) => ({
      durationMinutes: candidate.chunkDurationMinutes ?? candidate.durationMinutes,
      candidateIndex: index,
    })),
    previewBlocks: selected.map(({ candidate }) => buildPreviewTaskBlock(task, candidate)),
  }
}

// ── Task interpretation ───────────────────────────────────────────────────────

function buildTaskInterpretationPrompt(task: Task): string {
  const td = today()
  const days = daysUntilDue(task.dueDate)

  return `You are a planning assistant. Analyze this task and return ONLY a JSON object.

TASK:
- Title: ${task.title}
- Description: ${task.description || '(none)'}
- Current priority: ${task.priority}
- Current energy type: ${task.energyType || '(not set)'}
- Duration (minutes): ${task.durationMinutes}
- Due date: ${task.dueDate ?? '(no deadline)'}
- Days until due: ${days !== null ? days : '(no deadline)'}
- Tags: ${task.tags.join(', ') || '(none)'}
- Project: ${task.project ?? '(none)'}
- TODAY: ${td}

Return ONLY this JSON with no markdown, no explanation:
{
  "inferredPriority": "low" | "medium" | "high" | null,
  "inferredEnergyType": "deep" | "moderate" | "light" | null,
  "estimatedDurationAdjustmentMinutes": <integer or null>,
  "splitRecommendation": {
    "shouldSplit": <boolean>,
    "suggestedChunkMinutes": <integer or null>,
    "rationale": "<string or null>"
  },
  "rationale": "<one or two concise sentences>",
  "confidence": <0.0 to 1.0>
}

Rules:
- inferredPriority: null if the current priority seems correct; only suggest if clearly miscategorized
- inferredEnergyType: deep=focus/analysis/coding/writing, moderate=meetings/reviews/planning, light=admin/email/quick tasks
- estimatedDurationAdjustmentMinutes: null if estimate seems reasonable; only suggest a delta if clearly off
- splitRecommendation.shouldSplit: true only if task > 90 min AND genuinely benefits from splitting
- confidence: honest 0.0–1.0 based on how much signal the task fields provide
- Do NOT invent data not present in the task fields`
}

function validateTaskInterpretation(raw: unknown, taskId: string): TaskInterpretationResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const validPriorities = new Set(['low', 'medium', 'high'])
  const validEnergies = new Set(['deep', 'moderate', 'light'])

  const inferredPriority = validPriorities.has(r.inferredPriority as string)
    ? (r.inferredPriority as 'low' | 'medium' | 'high')
    : null

  const inferredEnergyType = validEnergies.has(r.inferredEnergyType as string)
    ? (r.inferredEnergyType as 'deep' | 'moderate' | 'light')
    : null

  const durAdj = typeof r.estimatedDurationAdjustmentMinutes === 'number'
    ? Math.round(r.estimatedDurationAdjustmentMinutes)
    : null

  let splitRec: TaskInterpretationResult['splitRecommendation'] = null
  if (r.splitRecommendation && typeof r.splitRecommendation === 'object') {
    const s = r.splitRecommendation as Record<string, unknown>
    splitRec = {
      shouldSplit: Boolean(s.shouldSplit),
      suggestedChunkMinutes: typeof s.suggestedChunkMinutes === 'number'
        ? Math.max(15, Math.round(s.suggestedChunkMinutes))
        : undefined,
      rationale: safeString(s.rationale) || undefined,
    }
  }

  const rationale = safeString(r.rationale)
  if (!rationale) {
    console.debug('[planner:ai] interpretTask — validation failed: missing rationale')
    return null
  }

  return {
    taskId,
    inferredPriority,
    inferredEnergyType,
    estimatedDurationAdjustmentMinutes: durAdj,
    splitRecommendation: splitRec,
    rationale,
    confidence: clampConfidence(r.confidence),
    source: 'ai',
  }
}

function fallbackTaskInterpretation(task: Task): TaskInterpretationResult {
  const days = daysUntilDue(task.dueDate)

  const inferredPriority: 'low' | 'medium' | 'high' | null =
    days !== null && days <= 0 && task.priority !== 'high' ? 'high' :
    days !== null && days <= 1 && task.priority === 'low' ? 'medium' :
    null

  const shouldSplit = task.durationMinutes > 120

  const rationale =
    days !== null && days < 0 ? `Task is overdue by ${Math.abs(days)} day(s).` :
    days === 0 ? 'Task is due today.' :
    days === 1 ? 'Task is due tomorrow.' :
    shouldSplit ? 'Long duration — consider splitting into shorter sessions.' :
    'No urgent signals detected.'

  return {
    taskId: task.id,
    inferredPriority,
    inferredEnergyType: null,
    estimatedDurationAdjustmentMinutes: null,
    splitRecommendation: shouldSplit
      ? {
          shouldSplit: true,
          suggestedChunkMinutes: Math.round(task.durationMinutes / 2),
          rationale: 'Long task — consider splitting into two sessions.',
        }
      : { shouldSplit: false },
    rationale,
    confidence: 0.4,
    source: 'fallback',
  }
}

export async function interpretTaskWithAI(task: Task): Promise<TaskInterpretationResult> {
  try {
    const prompt = buildTaskInterpretationPrompt(task)
    const response = await callOpenClawForPlanning(prompt, `interpret:${task.id}`)
    const parsed = parseJSON(response)
    const validated = validateTaskInterpretation(parsed, task.id)
    if (validated) return validated
    console.debug(`[planner:ai] interpret:${task.id} — validation fallback`)
  } catch (err) {
    console.debug(`[planner:ai] interpret:${task.id} — error fallback: ${(err as Error).message}`)
  }
  return fallbackTaskInterpretation(task)
}

// ── Task interpretation cache ─────────────────────────────────────────────────

const taskInterpretationCache = new Map<string, { result: TaskInterpretationResult; at: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

export async function interpretTaskWithAICached(
  task: Task,
  forceRefresh = false,
): Promise<TaskInterpretationResult> {
  const cacheKey = `${task.id}-${task.updatedAt}`
  const cached = taskInterpretationCache.get(cacheKey)
  if (!forceRefresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.result
  }
  const result = await interpretTaskWithAI(task)
  taskInterpretationCache.set(cacheKey, { result, at: Date.now() })
  return result
}

export function clearTaskInterpretationCache(taskId?: string): void {
  if (taskId) {
    for (const key of taskInterpretationCache.keys()) {
      if (key.startsWith(taskId + '-')) taskInterpretationCache.delete(key)
    }
  } else {
    taskInterpretationCache.clear()
  }
}

// ── Schedule recommendation ───────────────────────────────────────────────────

function buildScheduleRecommendationPrompt(task: Task, candidates: TimeSlot[]): string {
  const td = today()
  const days = daysUntilDue(task.dueDate)

  const candidateList = candidates.length > 0
    ? candidates.map((c, i) =>
        `  ${i + 1}. ${c.date} ${c.startTime}–${c.endTime} (${c.durationMinutes}min available)`
      ).join('\n')
    : '  (none available)'

  return `You are a scheduling assistant. Choose the best time slot for this task.

TASK:
- Title: ${task.title}
- Priority: ${task.priority}
- Energy type: ${task.energyType || 'not set'}
- Duration needed: ${task.durationMinutes} minutes
- Due: ${task.dueDate ?? 'no deadline'}${days !== null ? ` (in ${days} days)` : ''}
- TODAY: ${td}

AVAILABLE CANDIDATE SLOTS — you MUST only select from these:
${candidateList}

Return ONLY this JSON with no markdown, no explanation:
{
  "recommendedAction": "schedule" | "defer" | "split" | "none",
  "selectedSlotIndex": <1-based index from the list above, or null>,
  "backupSlotIndices": [<up to 2 additional 1-based indices, or empty array>],
  "rationale": "<one or two concise sentences explaining the choice>",
  "confidence": <0.0 to 1.0>,
  "warnings": [<warning strings, or empty array>]
}

Rules:
- selectedSlotIndex MUST be from the numbered list above (1-based), or null if recommending defer/none
- Prefer slots matching energy type: deep work → before 12:00, moderate → 13:30–16:00
- Prefer slots on or before the due date
- If no suitable slot exists, use "defer" with null selectedSlotIndex
- warnings: flag if the chosen slot is suboptimal`
}

function validateScheduleRecommendation(
  raw: unknown,
  taskId: string,
  candidates: TimeSlot[],
): ScheduleRecommendationResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const validActions = new Set(['schedule', 'defer', 'split', 'unschedule', 'none'])
  const recommendedAction = validActions.has(r.recommendedAction as string)
    ? (r.recommendedAction as ScheduleRecommendationResult['recommendedAction'])
    : 'none'

  let suggestedWindow: ScheduleRecommendationResult['suggestedWindow'] = null
  const idx = typeof r.selectedSlotIndex === 'number' ? Math.round(r.selectedSlotIndex) - 1 : -1
  if (idx >= 0 && idx < candidates.length) {
    const slot = candidates[idx]
    suggestedWindow = { date: slot.date, start: slot.startTime, end: slot.endTime }
  }

  const backupWindows: ScheduleRecommendationResult['backupWindows'] = []
  if (Array.isArray(r.backupSlotIndices)) {
    for (const bi of r.backupSlotIndices) {
      if (typeof bi !== 'number') continue
      const bIdx = Math.round(bi) - 1
      if (bIdx < 0 || bIdx >= candidates.length || bIdx === idx) continue
      const s = candidates[bIdx]
      backupWindows.push({ date: s.date, start: s.startTime, end: s.endTime })
      if (backupWindows.length >= 2) break
    }
  }

  const rationale = safeString(r.rationale)
  if (!rationale) {
    console.debug('[planner:ai] scheduleRec — validation failed: missing rationale')
    return null
  }

  return {
    taskId,
    recommendedAction,
    suggestedWindow,
    backupWindows,
    rationale,
    confidence: clampConfidence(r.confidence),
    warnings: safeStringArray(r.warnings).slice(0, 4),
    source: 'ai',
  }
}

function fallbackScheduleRecommendation(task: Task, candidates: TimeSlot[]): ScheduleRecommendationResult {
  const first = candidates[0] ?? null
  return {
    taskId: task.id,
    recommendedAction: first ? 'schedule' : 'defer',
    suggestedWindow: first
      ? { date: first.date, start: first.startTime, end: first.endTime }
      : null,
    backupWindows: candidates.slice(1, 3).map((s) => ({
      date: s.date,
      start: s.startTime,
      end: s.endTime,
    })),
    rationale: first
      ? 'Best available slot from deterministic scheduler.'
      : 'No available slots in the next 7 days. Defer task.',
    confidence: 0.5,
    warnings: [],
    source: 'fallback',
  }
}

export async function recommendSchedulingWithAI(
  task: Task,
  candidates: TimeSlot[],
): Promise<ScheduleRecommendationResult> {
  if (candidates.length === 0) return fallbackScheduleRecommendation(task, candidates)
  try {
    const prompt = buildScheduleRecommendationPrompt(task, candidates)
    const response = await callOpenClawForPlanning(prompt, `schedule-rec:${task.id}`)
    const parsed = parseJSON(response)
    const validated = validateScheduleRecommendation(parsed, task.id, candidates)
    if (validated) return validated
    console.debug(`[planner:ai] schedule-rec:${task.id} — validation fallback`)
  } catch (err) {
    console.debug(`[planner:ai] schedule-rec:${task.id} — error fallback: ${(err as Error).message}`)
  }
  return fallbackScheduleRecommendation(task, candidates)
}

// ── Weekly commentary ─────────────────────────────────────────────────────────

function buildWeeklyCommentaryPrompt(summary: PlannerSummaryInput): string {
  const critical = summary.unscheduledCriticalTasks
  const criticalList = critical.length > 0
    ? critical.map((t) => `"${t.title}" (${t.priority}${t.dueDate ? `, due ${t.dueDate}` : ''})`).join(', ')
    : 'none'

  const focusCount = summary.focusWindowSuggestions.length
  const nextFocus = focusCount > 0
    ? `${summary.focusWindowSuggestions[0].date} at ${summary.focusWindowSuggestions[0].startTime}`
    : 'none available'

  return `You are a planning assistant generating a weekly briefing. Be concise, specific, and practical.

PLANNER DATA:
- Overloaded days: ${summary.overloadedDays.join(', ') || 'none'}
- Unscheduled critical tasks (${critical.length}): ${criticalList}
- Focus windows available: ${focusCount} (next: ${nextFocus})
- Risk flags: ${summary.riskFlags.length} total, ${summary.riskFlags.filter((f) => f.severity === 'error').length} critical
- Generated: ${summary.generatedAt}

Return ONLY this JSON with no markdown, no explanation:
{
  "summaryText": "<2–3 sentence practical weekly overview — specific, not generic>",
  "keyRisks": [<up to 3 specific risk strings>],
  "keyOpportunities": [<up to 3 actionable opportunity strings>],
  "suggestedFocus": [<up to 3 concrete recommended focus areas>],
  "confidence": <0.0 to 1.0>
}

Rules:
- summaryText must reference actual data — no motivational fluff
- keyRisks: specific risks from the data (task names, days, counts)
- keyOpportunities: specific opportunities (e.g. "Free 60-min focus window Tuesday morning")
- suggestedFocus: actionable (e.g. "Schedule overdue tasks before noon today")
- confidence: lower if data is sparse, higher if clear patterns exist`
}

function validateWeeklyCommentary(raw: unknown): WeeklyCommentaryResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const summaryText = safeString(r.summaryText)
  if (!summaryText) return null
  return {
    summaryText,
    keyRisks: safeStringArray(r.keyRisks).slice(0, 3),
    keyOpportunities: safeStringArray(r.keyOpportunities).slice(0, 3),
    suggestedFocus: safeStringArray(r.suggestedFocus).slice(0, 3),
    confidence: clampConfidence(r.confidence),
    source: 'ai',
  }
}

function fallbackWeeklyCommentary(summary: PlannerSummaryInput): WeeklyCommentaryResult {
  const risks: string[] = []
  const opps: string[] = []
  const focus: string[] = []

  if (summary.unscheduledCriticalTasks.length > 0) {
    risks.push(`${summary.unscheduledCriticalTasks.length} critical task(s) need a time slot`)
    focus.push(`Schedule: ${summary.unscheduledCriticalTasks[0].title}`)
  }
  if (summary.overloadedDays.length > 0) {
    risks.push(`${summary.overloadedDays.length} overloaded day(s) — consider moving some blocks`)
  }
  const criticalFlags = summary.riskFlags.filter((f) => f.severity === 'error')
  if (criticalFlags.length > 0) {
    risks.push(`${criticalFlags.length} critical issue(s) in schedule`)
  }
  if (summary.focusWindowSuggestions.length > 0) {
    const fw = summary.focusWindowSuggestions[0]
    opps.push(`Free ${fw.durationMinutes}min focus window on ${fw.date} at ${fw.startTime}`)
    focus.push(`Use focus window: ${fw.date} ${fw.startTime}`)
  }
  if (!risks.length && !opps.length) {
    opps.push('Schedule looks balanced')
  }

  return {
    summaryText: summary.weeklyCommentary,
    keyRisks: risks,
    keyOpportunities: opps,
    suggestedFocus: focus,
    confidence: 0.3,
    source: 'fallback',
  }
}

export async function buildWeeklyCommentaryWithAI(
  summary: PlannerSummaryInput,
): Promise<WeeklyCommentaryResult> {
  try {
    const prompt = buildWeeklyCommentaryPrompt(summary)
    const response = await callOpenClawForPlanning(prompt, 'weekly-commentary')
    const parsed = parseJSON(response)
    const validated = validateWeeklyCommentary(parsed)
    if (validated) return validated
    console.debug('[planner:ai] weekly-commentary — validation fallback')
  } catch (err) {
    console.debug(`[planner:ai] weekly-commentary — error fallback: ${(err as Error).message}`)
  }
  return fallbackWeeklyCommentary(summary)
}

// ── Optimize Day ──────────────────────────────────────────────────────────────

function buildOptimizeDayPrompt(
  date: string,
  tasksToSchedule: Task[],
  movableBlocks: CalendarBlock[],
  lockedBlocks: CalendarBlock[],
  candidates: EnrichedCandidateSlot[],
  refinementConstraints?: ActiveRefinementConstraints,
): string {
  const td = today()
  const dayLabel = date === td ? 'today' : date

  const taskList = tasksToSchedule.length > 0
    ? tasksToSchedule.map((t, i) =>
        `  ${i + 1}. id:${t.id} — "${t.title}" (${t.priority}, ${t.durationMinutes}min, ${t.energyType ?? 'any'}, due: ${t.dueDate ?? 'none'})`
      ).join('\n')
    : '  (none)'

  const movableList = movableBlocks.length > 0
    ? movableBlocks.map((b) =>
        `  • id:${b.id} — "${b.title}" @ ${b.startTime}–${addMinsToTime(b.startTime, b.duration)} [FLEXIBLE — can be moved]`
      ).join('\n')
    : '  (none)'

  const lockedList = lockedBlocks.length > 0
    ? lockedBlocks.map((b) =>
        `  • ${b.startTime}–${addMinsToTime(b.startTime, b.duration)} "${b.title}" [${b.isProtectedTime ? 'PROTECTED' : 'LOCKED'}]`
      ).join('\n')
    : '  (none)'

  const protectedWindows = lockedBlocks.filter((block) => block.isProtectedTime)
  const protectedList = protectedWindows.length > 0
    ? protectedWindows.map((block) =>
        `  • ${block.startTime}–${addMinsToTime(block.startTime, block.duration)} "${block.title}"`
      ).join('\n')
    : '  (none)'
  const refinementList = refinementConstraints
    ? describeConstraintsForPrompt(refinementConstraints)
    : '  (none)'

  const candidateList = candidates.length > 0
    ? candidates.map((c, i) => {
        let tag: string
        if (c.isBlockDestination) {
          tag = `[block:${c.taskId} → MOVE]`
        } else if (c.isChunkSlot) {
          tag = `[task:${c.taskId} CHUNK ${c.chunkDurationMinutes}min]`
        } else {
          tag = `[task:${c.taskId}]`
        }
        return (
          `  ${i + 1}. ${tag} ${c.date} ${c.startTime}–${c.endTime}` +
          ` | focus:${c.focusQuality.toFixed(1)}` +
          ` | energy:${c.energyAlignment}` +
          ` | urgency:${c.urgencyFit}` +
          (c.isFocusWindow ? ' | FOCUS-WINDOW' : '') +
          (c.displacementCost > 0 ? ` | DISPLACES(cost:${c.displacementCost})` : '') +
          ` | load:${c.dayWorkloadMinutes}min/day`
        )
      }).join('\n')
    : '  (none available)'

  return `You are a planning assistant optimizing a day's schedule. Return ONLY a JSON object.

DATE: ${dayLabel} (${date})

TASKS TO SCHEDULE (${tasksToSchedule.length}):
${taskList}

FLEXIBLE BLOCKS — can be moved to free up better slots:
${movableList}

FIXED BLOCKS — locked, cannot be moved:
${lockedList}

PROTECTED WINDOWS — premium focus time already reserved and should be preserved unless explicitly necessary:
${protectedList}

ACTIVE REFINEMENT CONSTRAINTS:
${refinementList}

CANDIDATE PLACEMENTS (1-based index — task slots, chunk slots, and block destinations):
${candidateList}

Return ONLY this JSON with no markdown, no explanation:
{
  "actions": [
    { "type": "schedule_task", "taskId": "<exact task id>", "candidateIndex": <1-based>, "rationale": "<why>" },
    { "type": "move_block", "blockId": "<exact block id>", "candidateIndex": <1-based of a [block:id → MOVE] entry>, "rationale": "<why>" },
    { "type": "split_task", "taskId": "<exact task id>", "chunks": [{ "durationMinutes": <int>, "candidateIndex": <1-based CHUNK slot> }, ...], "rationale": "<why>" },
    { "type": "protect_focus_window", "date": "<YYYY-MM-DD>", "startTime": "<HH:MM>", "endTime": "<HH:MM>", "rationale": "<why>" },
    { "type": "preserve_block", "blockId": "<exact block id from FLEXIBLE or FIXED list>", "rationale": "<why>" },
    { "type": "defer_task", "taskId": "<exact task id>", "toDate": "<YYYY-MM-DD>", "rationale": "<why>" },
    { "type": "flag_risk", "entityId": "<task or block id>", "message": "<specific risk>" }
  ],
  "summary": "<2–3 sentence overview of the optimization>",
  "confidence": <0.0 to 1.0>,
  "warnings": [<strings>]
}

Rules:
- candidateIndex MUST be from the numbered list above (1-based)
- schedule_task: taskId MUST match the [task:id] tag on that candidate entry
- move_block: candidateIndex MUST point to a [block:id → MOVE] entry matching blockId
- split_task: requires ≥2 chunks; each candidateIndex MUST point to a [task:id CHUNK Xmin] entry for that taskId
- split_task and schedule_task for the same task are mutually exclusive
- Do not use the same candidateIndex twice across all actions
- Prefer FOCUS-WINDOW slots (focus: score 0.7–1.0) for deep tasks
- Use move_block only if it meaningfully improves placement for a higher-value task
- Use split_task only for tasks ≥90 min where no single full slot exists
- Use protect_focus_window for premium windows (09:00–12:00, 13:30–16:00) that would otherwise go unused
- Never place low-value or shallow work into PROTECTED windows
- If a task cannot fit, use defer_task with a future date or flag_risk
- Only include actions for tasks/blocks in the lists above`
}

function describeConstraintsForPrompt(constraints: ActiveRefinementConstraints): string {
  const lines: string[] = []
  if (constraints.earliestStartTime) lines.push(`  - No starts before ${constraints.earliestStartTime}`)
  if (constraints.latestEndTime) lines.push(`  - Finish by ${constraints.latestEndTime}`)
  if (constraints.preserveMovedBlocks) lines.push('  - Previously moved blocks should be preserved')
  if (constraints.protectMorning) lines.push('  - Morning time should stay protected')
  if (constraints.deepWorkMorningOnly) lines.push('  - Mornings are reserved for deep work')
  if (constraints.preferLaterScheduling) lines.push('  - Prefer later scheduling where possible')
  if (constraints.avoidDeferringDueSoon) lines.push('  - Avoid deferring tasks due soon')
  for (const window of constraints.blockedWindows ?? []) {
    lines.push(`  - Blocked ${window.date} ${window.startTime}-${window.endTime} (${window.reason})`)
  }
  for (const note of constraints.notes ?? []) {
    lines.push(`  - ${note}`)
  }
  return lines.length > 0 ? lines.join('\n') : '  (none)'
}

function validateAndFilterOptimizeActions(
  rawActions: unknown,
  candidates: EnrichedCandidateSlot[],
  tasksToSchedule: Task[],
  movableBlocks: CalendarBlock[],
  allBlocks: CalendarBlock[],
  refinementConstraints?: ActiveRefinementConstraints,
): { actions: PlanningAction[]; warnings: string[] } {
  if (!Array.isArray(rawActions)) {
    return { actions: [], warnings: ['AI returned no action array'] }
  }

  const taskIdSet = new Set(tasksToSchedule.map((t) => t.id))
  const movableBlockIds = new Set(movableBlocks.map((b) => b.id))
  const allBlockIds = new Set(allBlocks.map((b) => b.id))
  const usedCandidateIndices = new Set<number>()
  const scheduledOrSplitTaskIds = new Set<string>()
  const movedBlockIds = new Set<string>()
  const actions: PlanningAction[] = []
  const warnings: string[] = []
  const td = today()

  for (const item of rawActions) {
    if (!item || typeof item !== 'object') continue
    const a = item as Record<string, unknown>
    const type = a.type as string

    if (type === 'schedule_task') {
      const taskId = safeString(a.taskId)
      const rawIdx = typeof a.candidateIndex === 'number' ? Math.round(a.candidateIndex) - 1 : -1
      const rationale = safeString(a.rationale, 'Scheduled by AI.')

      if (!taskIdSet.has(taskId)) {
        warnings.push(`schedule_task: unknown taskId "${taskId}" — skipped`)
        continue
      }
      if (rawIdx < 0 || rawIdx >= candidates.length) {
        warnings.push(`schedule_task: candidateIndex out of range for "${taskId}" — skipped`)
        continue
      }
      const cand = candidates[rawIdx]
      if (cand.taskId !== taskId || cand.isBlockDestination || cand.isChunkSlot) {
        warnings.push(`schedule_task: candidate ${rawIdx + 1} is not a regular slot for task "${taskId}" — skipped`)
        continue
      }
      if (usedCandidateIndices.has(rawIdx)) {
        warnings.push(`schedule_task: candidate ${rawIdx + 1} already used — skipped`)
        continue
      }
      if (scheduledOrSplitTaskIds.has(taskId)) {
        warnings.push(`schedule_task: task "${taskId}" already handled — skipped`)
        continue
      }

      usedCandidateIndices.add(rawIdx)
      scheduledOrSplitTaskIds.add(taskId)
      actions.push({ type: 'schedule_task', taskId, candidateIndex: rawIdx, rationale })

    } else if (type === 'move_block') {
      const blockId = safeString(a.blockId)
      const rawIdx = typeof a.candidateIndex === 'number' ? Math.round(a.candidateIndex) - 1 : -1
      const rationale = safeString(a.rationale, 'Moved by AI.')

      if (!movableBlockIds.has(blockId)) {
        warnings.push(`move_block: unknown or non-movable blockId "${blockId}" — skipped`)
        continue
      }
      if (rawIdx < 0 || rawIdx >= candidates.length) {
        warnings.push(`move_block: candidateIndex out of range for block "${blockId}" — skipped`)
        continue
      }
      const cand = candidates[rawIdx]
      if (!cand.isBlockDestination || cand.taskId !== blockId) {
        warnings.push(`move_block: candidate ${rawIdx + 1} is not a destination for block "${blockId}" — skipped`)
        continue
      }
      if (usedCandidateIndices.has(rawIdx)) {
        warnings.push(`move_block: candidate ${rawIdx + 1} already used — skipped`)
        continue
      }
      if (movedBlockIds.has(blockId)) {
        warnings.push(`move_block: block "${blockId}" already moved — skipped`)
        continue
      }

      usedCandidateIndices.add(rawIdx)
      movedBlockIds.add(blockId)
      actions.push({ type: 'move_block', blockId, candidateIndex: rawIdx, rationale })

    } else if (type === 'split_task') {
      const taskId = safeString(a.taskId)
      const rationale = safeString(a.rationale, 'Split by AI.')

      if (!taskIdSet.has(taskId)) {
        warnings.push(`split_task: unknown taskId "${taskId}" — skipped`)
        continue
      }
      if (scheduledOrSplitTaskIds.has(taskId)) {
        warnings.push(`split_task: task "${taskId}" already handled — skipped`)
        continue
      }

      const rawChunks = Array.isArray(a.chunks) ? a.chunks : []
      if (rawChunks.length < 2) {
        warnings.push(`split_task: task "${taskId}" requires at least 2 chunks — skipped`)
        continue
      }

      const resolvedChunks: Array<{ durationMinutes: number; candidateIndex: number }> = []
      let chunkValid = true
      let totalChunkMinutes = 0

      for (const chunk of rawChunks) {
        if (!chunk || typeof chunk !== 'object') { chunkValid = false; break }
        const c = chunk as Record<string, unknown>
        const dur = typeof c.durationMinutes === 'number' ? Math.round(c.durationMinutes) : 0
        const cIdx = typeof c.candidateIndex === 'number' ? Math.round(c.candidateIndex) - 1 : -1

        if (dur < 15 || dur > 240) {
          warnings.push(`split_task: chunk duration ${dur} out of range for "${taskId}" — skipped`)
          chunkValid = false; break
        }
        if (cIdx < 0 || cIdx >= candidates.length) {
          warnings.push(`split_task: chunk candidateIndex out of range for "${taskId}" — skipped`)
          chunkValid = false; break
        }
        const cand = candidates[cIdx]
        if (!cand.isChunkSlot || cand.taskId !== taskId) {
          warnings.push(`split_task: candidate ${cIdx + 1} is not a chunk slot for "${taskId}" — skipped`)
          chunkValid = false; break
        }
        if (usedCandidateIndices.has(cIdx)) {
          warnings.push(`split_task: candidate ${cIdx + 1} already used — skipped`)
          chunkValid = false; break
        }
        resolvedChunks.push({ durationMinutes: dur, candidateIndex: cIdx })
        usedCandidateIndices.add(cIdx)
        totalChunkMinutes += dur
      }

      const task = tasksToSchedule.find((entry) => entry.id === taskId)
      if (chunkValid && task && totalChunkMinutes > task.durationMinutes) {
        warnings.push(`split_task: chunk total ${totalChunkMinutes} exceeds task duration for "${taskId}" — skipped`)
        chunkValid = false
      }

      if (!chunkValid) continue

      scheduledOrSplitTaskIds.add(taskId)
      actions.push({ type: 'split_task', taskId, chunks: resolvedChunks, rationale })

    } else if (type === 'protect_focus_window') {
      const fDate = safeString(a.date)
      const startTime = safeString(a.startTime)
      const endTime = safeString(a.endTime)
      const rationale = safeString(a.rationale, 'Protected by AI.')

      if (!/^\d{4}-\d{2}-\d{2}$/.test(fDate) || fDate < td) {
        warnings.push(`protect_focus_window: invalid or past date "${fDate}" — skipped`)
        continue
      }
      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
        warnings.push(`protect_focus_window: invalid time format — skipped`)
        continue
      }
      if (toMinutes(startTime) >= toMinutes(endTime)) {
        warnings.push(`protect_focus_window: startTime >= endTime — skipped`)
        continue
      }
      const overlap = allBlocks.some((block) => (
        block.date === fDate &&
        block.isProtectedTime &&
        block.startTime === startTime &&
        addMinsToTime(block.startTime, block.duration) === endTime
      ))
      if (overlap) {
        warnings.push(`protect_focus_window: ${fDate} ${startTime}-${endTime} already protected — skipped`)
        continue
      }

      actions.push({ type: 'protect_focus_window', date: fDate, startTime, endTime, rationale })

    } else if (type === 'preserve_block') {
      const blockId = safeString(a.blockId)
      const rationale = safeString(a.rationale, 'Preserved by AI.')

      if (!allBlockIds.has(blockId)) {
        warnings.push(`preserve_block: unknown blockId "${blockId}" — skipped`)
        continue
      }

      actions.push({ type: 'preserve_block', blockId, rationale })

    } else if (type === 'defer_task') {
      const taskId = safeString(a.taskId)
      const toDate = safeString(a.toDate)
      const rationale = safeString(a.rationale, 'Deferred by AI.')

      if (!taskIdSet.has(taskId)) {
        warnings.push(`defer_task: unknown taskId "${taskId}" — skipped`)
        continue
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate) || toDate <= td) {
        warnings.push(`defer_task: invalid or past date "${toDate}" — skipped`)
        continue
      }
      const task = tasksToSchedule.find((entry) => entry.id === taskId)
      if (!task) {
        warnings.push(`defer_task: task "${taskId}" is unavailable for validation — skipped`)
        continue
      }
      if (!shouldAllowDeferral(task, toDate, refinementConstraints)) {
        warnings.push(`defer_task: "${taskId}" is due soon and current refinement constraints avoid deferral — skipped`)
        continue
      }

      actions.push({ type: 'defer_task', taskId, toDate, rationale })

    } else if (type === 'flag_risk') {
      const entityId = safeString(a.entityId)
      const message = safeString(a.message)
      if (message) {
        actions.push({ type: 'flag_risk', entityId, message })
      }
    }
    // lock_block is not AI-generated (only user-initiated via UI)
  }

  return { actions, warnings }
}

function fallbackOptimizeDay(
  date: string,
  tasks: Task[],
  blocks: CalendarBlock[],
  candidates: EnrichedCandidateSlot[],
  refinementConstraints?: ActiveRefinementConstraints,
): OptimizeDayResult {
  const tasksToSchedule = tasks
    .filter((task) => !task.completed && !task.scheduled && (!task.dueDate || task.dueDate <= date))
    .sort(compareTasksForScheduling)
  const actions: PlanningAction[] = []
  const warnings: string[] = []
  const usedCandidateIndices = new Set<number>()
  let workingBlocks = [...blocks]

  for (const task of tasksToSchedule) {
    const regularCandidate = candidates.find((candidate, index) => (
      !usedCandidateIndices.has(index) &&
      candidate.taskId === task.id &&
      !candidate.isChunkSlot &&
      !candidate.isBlockDestination &&
      !candidateConflictsWithBlocks(candidate, workingBlocks)
    ))

    if (regularCandidate) {
      const candidateIndex = candidates.indexOf(regularCandidate)
      usedCandidateIndices.add(candidateIndex)
      actions.push({
        type: 'schedule_task',
        taskId: task.id,
        candidateIndex,
        rationale: 'Deterministic constrained candidate placement.',
      })
      workingBlocks = [...workingBlocks, buildPreviewTaskBlock(task, regularCandidate)]
      continue
    }

    const chunkCandidates = candidates
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate, index }) => (
        !usedCandidateIndices.has(index) &&
        candidate.taskId === task.id &&
        candidate.isChunkSlot &&
        !candidate.isBlockDestination &&
        !candidateConflictsWithBlocks(candidate, workingBlocks)
      ))

    const chunkPlan = buildDeterministicChunkPlan(task, chunkCandidates)
    if (chunkPlan) {
      for (const chunk of chunkPlan.chunks) {
        usedCandidateIndices.add(chunk.candidateIndex)
      }
      actions.push({
        type: 'split_task',
        taskId: task.id,
        chunks: chunkPlan.chunks,
        rationale: 'Deterministic constrained chunk placement.',
      })
      workingBlocks = [...workingBlocks, ...chunkPlan.previewBlocks]
      continue
    }

    if (task.dueDate && !shouldAllowDeferral(task, addDays(task.dueDate, 1), refinementConstraints)) {
      actions.push({
        type: 'flag_risk',
        entityId: task.id,
        message: `${task.title}: due soon and no safe constrained slot was available.`,
      })
      warnings.push(`Deterministic fallback could not place due-soon task "${task.title}" within current refinements.`)
      continue
    }

    if (task.dueDate) {
      actions.push({
        type: 'defer_task',
        taskId: task.id,
        toDate: addDays(task.dueDate, 1),
        rationale: 'Deterministic fallback could not find a safe constrained slot before the due date.',
      })
    } else {
      actions.push({
        type: 'flag_risk',
        entityId: task.id,
        message: `${task.title}: no safe constrained slot was available.`,
      })
    }
  }

  // Add protect_focus_window for unoccupied premium windows (deterministic)
  const td = today()
  if (date >= td) {
    const freeWindows = detectPremiumFreeWindows(blocks, date)
    for (const fw of freeWindows) {
      actions.push({
        type: 'protect_focus_window',
        date: fw.date,
        startTime: fw.startTime,
        endTime: fw.endTime,
        rationale: `Premium ${fw.durationMinutes}min focus window (${fw.startTime}–${fw.endTime}) is unoccupied — protect it for deep work.`,
      })
    }
  }

  return {
    date,
    actions,
    candidateSlots: candidates,
    summary: actions.length > 0
      ? `Fallback: prepared ${actions.length} deterministic constrained action(s) for ${date}.`
      : `Fallback: No constrained actions were available for ${date}.`,
    confidence: 0.5,
    source: 'fallback',
    warnings,
  }
}

export async function optimizeDayWithAI(
  date: string,
  tasks: Task[],
  blocks: CalendarBlock[],
  refinementConstraints?: ActiveRefinementConstraints,
): Promise<OptimizeDayResult> {
  // 1. Identify tasks that need scheduling on or before this date
  const tasksToSchedule = tasks.filter(
    (t) => !t.completed && !t.scheduled && (!t.dueDate || t.dueDate <= date),
  )

  // 2. Identify movable blocks: flexible, unlocked, non-event, on this date
  const movableBlocks = blocks.filter(
    (b) => b.date === date && b.flexible && !b.locked && b.type !== 'event',
  )

  // 3. Generate rich candidates per task (regular slots + chunk slots for long tasks)
  const candidates: EnrichedCandidateSlot[] = []
  for (const task of tasksToSchedule) {
    // Regular full-duration candidates
    candidates.push(...generateRichCandidateSlots(task, blocks, {
      targetDate: date,
      maxSlots: 5,
      refinementConstraints,
    }))
    // Chunk candidates for long tasks (≥90 min)
    if (task.durationMinutes >= 90) {
      const chunkDur = Math.round(task.durationMinutes / 2 / 15) * 15  // round to 15-min boundary
      const clamped = Math.max(30, Math.min(120, chunkDur))
      candidates.push(...generateChunkCandidates(task, blocks, clamped, {
        targetDate: date,
        maxSlots: 4,
        refinementConstraints,
      }))
    }
  }

  // 4. Generate block-destination candidates for each movable block
  for (const block of movableBlocks) {
    candidates.push(...generateMovableCandidates(block, blocks, date, refinementConstraints))
  }

  if (tasksToSchedule.length === 0) {
    return {
      date,
      actions: [],
      candidateSlots: candidates,
      summary: 'No unscheduled tasks due on or before this date.',
      confidence: 1.0,
      source: 'fallback',
      warnings: [],
    }
  }

  const lockedBlocks = blocks.filter((b) => b.date === date && b.locked)

  try {
    const prompt = buildOptimizeDayPrompt(date, tasksToSchedule, movableBlocks, lockedBlocks, candidates, refinementConstraints)
    const response = await callOpenClawForPlanning(prompt, `optimize-day:${date}`)
    const parsed = parseJSON(response)

    if (parsed && typeof parsed === 'object') {
      const r = parsed as Record<string, unknown>
      const { actions, warnings: validWarnings } = validateAndFilterOptimizeActions(
        r.actions,
        candidates,
        tasksToSchedule,
        movableBlocks,
        blocks,
        refinementConstraints,
      )

      const summary = safeString(r.summary, `Optimized ${date}: ${actions.length} action(s) planned.`)
      const allWarnings = [...safeStringArray(r.warnings), ...validWarnings]

      console.debug(`[planner:ai] optimize-day:${date} — ${actions.length} valid actions, ${validWarnings.length} validation warnings`)

      return {
        date,
        actions,
        candidateSlots: candidates,
        summary,
        confidence: clampConfidence(r.confidence),
        source: 'ai',
        warnings: allWarnings,
      }
    }
    console.debug(`[planner:ai] optimize-day:${date} — parse failure, using fallback`)
  } catch (err) {
    console.debug(`[planner:ai] optimize-day:${date} — error fallback: ${(err as Error).message}`)
  }

  return fallbackOptimizeDay(date, tasks, blocks, candidates, refinementConstraints)
}

// ── Optimize Week ─────────────────────────────────────────────────────────────
//
// Week optimization uses the deterministic rebuildWeek and converts its output
// to a structured OptimizeWeekResult. Per-day AI optimization across 7 days
// would require 7 serialized calls (up to 3.5 min) — this is deferred as a
// future improvement once streaming or batch AI endpoints are available.

export async function optimizeWeekWithAI(
  weekStart: string,
  tasks: Task[],
  blocks: CalendarBlock[],
  refinementConstraints?: ActiveRefinementConstraints,
): Promise<OptimizeWeekResult> {
  const dayResults: OptimizeDayResult[] = []
  const allWarnings: string[] = []

  // Run deterministic week rebuild
  const weekRebuildResult = rebuildWeek(weekStart, tasks, blocks)
  allWarnings.push(...weekRebuildResult.warnings)

  // Build per-day results from the rebuild output
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)

    // Generate candidates for this day
    const tasksForDay = tasks.filter(
      (t) => !t.completed && !t.scheduled && (!t.dueDate || t.dueDate <= date),
    )
    const candidates: EnrichedCandidateSlot[] = []
    for (const task of tasksForDay) {
      candidates.push(...generateRichCandidateSlots(task, blocks, {
        targetDate: date,
        maxSlots: 3,
        refinementConstraints,
      }))
    }

    // Build schedule_task actions from rebuilt blocks
    const dayActions: PlanningAction[] = []
    if (weekRebuildResult.success && weekRebuildResult.data) {
      const rebuiltDay = weekRebuildResult.data.filter(
        (b) => b.date === date && b.source === 'scheduler' && b.linkedTaskId,
      )
      for (const block of rebuiltDay) {
        if (!block.linkedTaskId) continue
        const candIdx = candidates.findIndex(
          (c) => c.taskId === block.linkedTaskId &&
                 c.date === block.date &&
                 c.startTime === block.startTime,
        )
        if (candIdx >= 0) {
          dayActions.push({
            type: 'schedule_task',
            taskId: block.linkedTaskId,
            candidateIndex: candIdx,
            rationale: 'Deterministic week rebuild.',
          })
        } else {
          allWarnings.push(`Week rebuild placed "${block.title}" at ${date} ${block.startTime}, but no validated candidate matched that slot.`)
        }
      }
    }

    dayResults.push({
      date,
      actions: dayActions,
      candidateSlots: candidates,
      summary: weekRebuildResult.success
        ? `Rebuilt ${date}: ${dayActions.length} task(s) placed.`
        : `No available slots on ${date}.`,
      confidence: 0.6,
      source: 'fallback',
      warnings: [],
    })
  }

  const totalActions = dayResults.reduce((s, dr) => s + dr.actions.length, 0)
  const avgConf = dayResults.reduce((s, dr) => s + dr.confidence, 0) / dayResults.length

  return {
    weekStart,
    actions: dayResults.flatMap((dr) => dr.actions),
    dayResults,
    summary: `Week plan: ${totalActions} task(s) scheduled across ${dayResults.filter((d) => d.actions.length > 0).length} day(s). AI week optimization is queued for a future update.`,
    confidence: avgConf,
    source: 'fallback',
    warnings: allWarnings.slice(0, 8),
  }
}
