/**
 * Planning Orchestrator — AI-ready orchestration layer.
 *
 * This module sits between OpenClaw intelligence and the core product layer.
 * It consumes app state and returns structured planning signals.
 *
 * Rules:
 * - NEVER directly mutate UI state
 * - Returns suggestions, interpretations, and summaries
 * - Currently uses deterministic mock logic; OpenClaw integration replaces the
 *   analysis functions without changing the interfaces
 *
 * OpenClaw integration point:
 *   Replace the `*Mock()` private functions with real AI calls that return the
 *   same typed shapes. The public interface stays stable.
 */

import type { Task, CalendarBlock, TaskPriority, EnergyType } from '@/store/planner'
import { today, addDays } from '@/lib/dateUtils'
import { detectConflicts, getAvailableSlots, getWorkloadSummary, DEFAULT_CONSTRAINTS } from '@/features/scheduler/schedulerService'
import type { ActiveRefinementConstraints } from './plannerRefinementTypes'

// ── AI output interfaces ───────────────────────────────────────────────────────

export interface TaskInterpretation {
  taskId: string
  inferredPriority: TaskPriority | null
  inferredEnergyType: EnergyType | null
  estimatedDurationAdjustment: number | null  // minutes delta from current
  splitRecommendation: boolean
  urgencyReason: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface ScheduleRecommendation {
  taskId: string
  recommendedAction: 'schedule' | 'move' | 'split' | 'defer' | 'unschedule'
  suggestedWindow: { date: string; startTime: string; endTime: string } | null
  rationale: string
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
}

export interface FocusWindowSuggestion {
  date: string
  startTime: string
  endTime: string
  label: string
  durationMinutes: number
}

export interface RiskFlag {
  message: string
  severity: 'error' | 'warning'
  taskId?: string
  date?: string
}

export interface PlannerSummary {
  overloadedDays: string[]
  unscheduledCriticalTasks: Task[]
  focusWindowSuggestions: FocusWindowSuggestion[]
  protectedDays: string[]
  riskFlags: RiskFlag[]
  weeklyCommentary: string
  generatedAt: string
}

export interface PlannerSignal {
  id: string
  type: 'overload' | 'at-risk' | 'suggestion' | 'focus-window' | 'conflict'
  message: string
  detail?: string
  severity: 'error' | 'warning' | 'info'
  actionLabel?: string
  actionData?: Record<string, unknown>
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generate a full PlannerSummary from current task + block state.
 * Deterministic today; AI-powered when connected to OpenClaw.
 */
export function generatePlannerSummary(tasks: Task[], blocks: CalendarBlock[]): PlannerSummary {
  const td = today()
  const weekEnd = addDays(td, 6)

  const workload = getWorkloadSummary(blocks, td, weekEnd)
  const overloadedDays = workload.filter((d) => d.overloaded).map((d) => d.date)

  const unscheduledCriticalTasks = tasks.filter(
    (t) => !t.completed && !t.scheduled && (t.priority === 'high' || (t.priority === 'medium' && t.dueDate && t.dueDate <= addDays(td, 1))),
  )

  const focusWindowSuggestions = buildFocusWindowSuggestions(tasks, blocks, td, weekEnd)
  const protectedDays = [...new Set(blocks.filter((block) => block.isProtectedTime).map((block) => block.date))].sort()
  const riskFlags = buildRiskFlags(tasks, blocks, td)
  const weeklyCommentary = buildWeeklyCommentary(tasks, blocks, overloadedDays, unscheduledCriticalTasks, focusWindowSuggestions)

  return {
    overloadedDays,
    unscheduledCriticalTasks,
    focusWindowSuggestions,
    protectedDays,
    riskFlags,
    weeklyCommentary,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Convert a PlannerSummary into a compact list of UI-ready signal cards.
 */
export function summaryToSignals(summary: PlannerSummary): PlannerSignal[] {
  const signals: PlannerSignal[] = []

  if (summary.unscheduledCriticalTasks.length > 0) {
    const count = summary.unscheduledCriticalTasks.length
    signals.push({
      id: 'unscheduled-critical',
      type: 'at-risk',
      message: `${count} high-priority task${count > 1 ? 's' : ''} need${count === 1 ? 's' : ''} a time slot`,
      detail: summary.unscheduledCriticalTasks.map((t) => t.title).slice(0, 3).join(', '),
      severity: 'warning',
      actionLabel: 'View tasks',
    })
  }

  for (const date of summary.overloadedDays) {
    signals.push({
      id: `overload-${date}`,
      type: 'overload',
      message: `${formatDateLabel(date)} is overloaded`,
      detail: 'More than 10h of tasks scheduled. Consider moving some blocks.',
      severity: 'warning',
      actionLabel: 'Rebuild day',
      actionData: { date },
    })
  }

  for (const fw of summary.focusWindowSuggestions.slice(0, 2)) {
    signals.push({
      id: `focus-${fw.date}-${fw.startTime}`,
      type: 'focus-window',
      message: `Free focus window ${formatDateLabel(fw.date)}: ${fw.startTime}–${fw.endTime}`,
      detail: fw.label,
      severity: 'info',
      actionLabel: 'Block it',
      actionData: { date: fw.date, startTime: fw.startTime, duration: fw.durationMinutes },
    })
  }

  if (summary.protectedDays.length > 0) {
    signals.push({
      id: 'protected-days',
      type: 'focus-window',
      message: `${summary.protectedDays.length} day${summary.protectedDays.length > 1 ? 's' : ''} already protected for focus`,
      severity: 'info',
    })
  }

  for (const flag of summary.riskFlags.filter((f) => f.severity === 'error').slice(0, 2)) {
    signals.push({
      id: `risk-${flag.taskId ?? flag.date ?? Math.random()}`,
      type: 'at-risk',
      message: flag.message,
      severity: 'error',
    })
  }

  return signals
}

/**
 * Interpret a task to infer priority/energy and suggest adjustments.
 * Currently uses heuristics; connect to OpenClaw for richer analysis.
 */
export function interpretTask(task: Task): TaskInterpretation {
  const td = today()

  // Heuristic: if due date is today or overdue, consider it high urgency
  const daysUntilDue = task.dueDate
    ? Math.round((new Date(task.dueDate + 'T12:00:00').getTime() - new Date(td + 'T12:00:00').getTime()) / 86400000)
    : null

  const inferredPriority: TaskPriority | null =
    daysUntilDue !== null && daysUntilDue <= 0 && task.priority !== 'high' ? 'high' :
    daysUntilDue !== null && daysUntilDue <= 1 && task.priority === 'low' ? 'medium' :
    null

  const splitRecommendation = task.durationMinutes > 120

  const urgencyReason =
    daysUntilDue !== null && daysUntilDue < 0 ? `Overdue by ${Math.abs(daysUntilDue)} day(s)` :
    daysUntilDue === 0 ? 'Due today' :
    daysUntilDue === 1 ? 'Due tomorrow' :
    null

  return {
    taskId: task.id,
    inferredPriority,
    inferredEnergyType: null, // requires semantic analysis → OpenClaw
    estimatedDurationAdjustment: splitRecommendation ? -60 : null,
    splitRecommendation,
    urgencyReason,
    confidence: inferredPriority ? 'high' : 'low',
  }
}

/**
 * Generate schedule recommendations for a batch of tasks.
 */
export function recommendScheduling(tasks: Task[], blocks: CalendarBlock[]): ScheduleRecommendation[] {
  return tasks
    .filter((t) => !t.completed)
    .map((task) => {
      if (task.scheduled) {
        const linkedBlocks = blocks
          .filter((block) => task.linkedCalendarBlockIds.includes(block.id))
          .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
        const firstLinkedBlock = linkedBlocks[0]
        if (firstLinkedBlock && firstLinkedBlock.date < today()) {
          return {
            taskId: task.id,
            recommendedAction: 'move' as const,
            suggestedWindow: null,
            rationale: 'Linked block is in the past. Reschedule.',
            confidence: 'high' as const,
            warnings: [],
          }
        }
        return {
          taskId: task.id,
          recommendedAction: 'schedule' as const,
          suggestedWindow: null,
          rationale: linkedBlocks.length > 1
            ? `Task is already split across ${linkedBlocks.length} scheduled chunks.`
            : 'Task is already scheduled.',
          confidence: 'high' as const,
          warnings: [],
        }
      }

      const td = today()
      const daysUntilDue = task.dueDate
        ? Math.round((new Date(task.dueDate + 'T12:00:00').getTime() - new Date(td + 'T12:00:00').getTime()) / 86400000)
        : null

      if (daysUntilDue !== null && daysUntilDue < 0) {
        return {
          taskId: task.id,
          recommendedAction: 'schedule' as const,
          suggestedWindow: null,
          rationale: `Overdue. Schedule immediately.`,
          confidence: 'high' as const,
          warnings: [`"${task.title}" is ${Math.abs(daysUntilDue)} day(s) overdue`],
        }
      }

      if (task.durationMinutes > 120) {
        return {
          taskId: task.id,
          recommendedAction: 'split' as const,
          suggestedWindow: null,
          rationale: `${task.durationMinutes}m is a long block. Consider splitting into 2 sessions.`,
          confidence: 'medium' as const,
          warnings: [],
        }
      }

      return {
        taskId: task.id,
        recommendedAction: 'schedule' as const,
        suggestedWindow: null,
        rationale: 'Schedule when next available.',
        confidence: 'low' as const,
        warnings: [],
      }
    })
}

// ── Private helpers ────────────────────────────────────────────────────────────

function buildFocusWindowSuggestions(
  tasks: Task[],
  blocks: CalendarBlock[],
  startDate: string,
  endDate: string,
): FocusWindowSuggestion[] {
  const results: FocusWindowSuggestion[] = []
  const hasDeepTasks = tasks.some((t) => !t.completed && !t.scheduled && t.energyType === 'deep')

  let d = startDate
  while (d <= endDate && results.length < 3) {
    const slots = getAvailableSlots(blocks, d, 60, DEFAULT_CONSTRAINTS)
    for (const slot of slots) {
      const start = parseInt(slot.startTime.split(':')[0])
      if (start >= 9 && start <= 11) {
        results.push({
          date: d,
          startTime: slot.startTime,
          endTime: slot.endTime,
          label: hasDeepTasks ? 'Ideal for deep work' : 'Free focus window',
          durationMinutes: 60,
        })
        break
      }
    }
    d = addDays(d, 1)
  }

  return results
}

function buildRiskFlags(tasks: Task[], blocks: CalendarBlock[], td: string): RiskFlag[] {
  const flags: RiskFlag[] = []

  for (const t of tasks) {
    if (!t.completed && !t.scheduled && t.priority === 'high' && t.dueDate && t.dueDate <= td) {
      flags.push({ message: `"${t.title}" is overdue and unscheduled`, severity: 'error', taskId: t.id })
    }
  }

  const conflicts = detectConflicts(blocks)
  for (const c of conflicts.slice(0, 3)) {
    flags.push({
      message: `Conflict on ${c.date}: "${c.blockATitle}" vs "${c.blockBTitle}"`,
      severity: 'error',
      date: c.date,
    })
  }

  return flags
}

function buildWeeklyCommentary(
  tasks: Task[],
  _blocks: CalendarBlock[],
  overloadedDays: string[],
  unscheduled: Task[],
  focusWindows: FocusWindowSuggestion[],
): string {
  const parts: string[] = []

  if (unscheduled.length > 0) {
    parts.push(`${unscheduled.length} critical task${unscheduled.length > 1 ? 's' : ''} need${unscheduled.length === 1 ? 's' : ''} a time slot.`)
  }
  if (overloadedDays.length > 0) {
    parts.push(`${overloadedDays.map(formatDateLabel).join(', ')} ${overloadedDays.length > 1 ? 'are' : 'is'} overloaded.`)
  }
  if (focusWindows.length > 0) {
    parts.push(`Best focus window: ${focusWindows[0].startTime} ${formatDateLabel(focusWindows[0].date)}.`)
  }
  if (parts.length === 0) {
    parts.push('Schedule looks balanced. Stay focused.')
  }

  return parts.join(' ')
}

function formatDateLabel(dateStr: string): string {
  const td = today()
  if (dateStr === td) return 'today'
  if (dateStr === addDays(td, 1)) return 'tomorrow'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── AI-powered async public API ────────────────────────────────────────────────
//
// This is the ONLY surface that UI code should import from.
// Adapter internals are imported lazily to keep the sync orchestrator fast.

// ── Type re-exports ──────────────────────────────────────────────────────────

export type {
  TaskInterpretationResult,
  ScheduleRecommendationResult,
  WeeklyCommentaryResult,
} from './openclawPlanningAdapter'

export type {
  EnrichedCandidateSlot,
  PlanningAction,
  ActionScheduleTask,
  ActionMoveBlock,
  ActionDeferTask,
  ActionLockBlock,
  ActionFlagRisk,
  ActionSplitTask,
  ActionProtectFocusWindow,
  ActionPreserveBlock,
  OptimizeDayResult,
  OptimizeWeekResult,
} from './planningTypes'

export type {
  ExecutionResult,
  ExecutionSnapshot,
  ExecutionHistoryEntry,
  ExecutionSource,
  StampedPlanningAction,
  PostApplyIssues,
} from './planningExecution'

// ── Core AI planning functions ────────────────────────────────────────────────

/**
 * AI task interpretation.
 * Returns inferred priority, energy type, split recommendation, rationale, confidence.
 * Falls back to heuristics if OpenClaw is unavailable.
 *
 * @param context.forceRefresh  bypass the 5-minute session cache
 */
export async function interpretTaskAI(
  task: Task,
  context?: { forceRefresh?: boolean },
): Promise<import('./openclawPlanningAdapter').TaskInterpretationResult> {
  const { interpretTaskWithAICached } = await import('./openclawPlanningAdapter')
  return interpretTaskWithAICached(task, context?.forceRefresh === true)
}

/**
 * Clear the task interpretation cache.
 * Pass a taskId to clear only that task; omit to clear all.
 */
export async function clearInterpretationCache(taskId?: string): Promise<void> {
  const { clearTaskInterpretationCache } = await import('./openclawPlanningAdapter')
  clearTaskInterpretationCache(taskId)
}

/**
 * AI-assisted schedule recommendation for a single task.
 *
 * Generates valid candidate slots deterministically (using suggestPlacement),
 * then asks OpenClaw to rank them. The AI can only select from the candidate list —
 * it cannot invent slots. Falls back to the top deterministic suggestion on failure.
 */
export async function recommendSchedulingAI(
  task: Task,
  blocks: CalendarBlock[],
  refinementConstraints?: ActiveRefinementConstraints,
): Promise<import('./openclawPlanningAdapter').ScheduleRecommendationResult> {
  const { generateRichCandidateSlots, recommendSchedulingWithAI } = await import('./openclawPlanningAdapter')
  // Use rich candidates (up to 8 slots, 7-day search) for better AI context
  const richCandidates = generateRichCandidateSlots(task, blocks, { maxSlots: 8, refinementConstraints })
  // Convert to TimeSlot[] for the schedule recommendation function
  const candidates = richCandidates.map((c) => ({
    date: c.date,
    startTime: c.startTime,
    endTime: c.endTime,
    durationMinutes: c.durationMinutes,
  }))
  return recommendSchedulingWithAI(task, candidates)
}

/**
 * AI-generated weekly commentary.
 * Narrates deterministic planner facts — it does not replace them.
 * Produces keyRisks, keyOpportunities, suggestedFocus, and a summaryText.
 */
export async function buildWeeklyCommentaryAI(
  summary: PlannerSummary,
): Promise<import('./openclawPlanningAdapter').WeeklyCommentaryResult> {
  const { buildWeeklyCommentaryWithAI } = await import('./openclawPlanningAdapter')
  return buildWeeklyCommentaryWithAI(summary)
}

// ── Action-level planning ─────────────────────────────────────────────────────

/**
 * AI-powered day optimization.
 *
 * Process:
 * 1. Identifies unscheduled tasks due on or before the target date
 * 2. Generates rich candidate slots for each task (deterministic, no AI involvement)
 * 3. Sends task list + candidate list to OpenClaw
 * 4. AI returns schedule_task / defer_task / flag_risk actions with candidate indices
 * 5. Each action is validated against the candidate list (index bounds, task ID match,
 *    no double-booking, no past dates)
 * 6. Invalid actions are stripped; valid actions are returned as OptimizeDayResult
 * 7. Falls back to deterministic rebuildDay if AI fails or returns no valid actions
 *
 * Store mutations are NOT performed here — the caller applies actions explicitly.
 */
export async function optimizeDayAI(
  date: string,
  tasks: Task[],
  blocks: CalendarBlock[],
  refinementConstraints?: ActiveRefinementConstraints,
): Promise<import('./planningTypes').OptimizeDayResult> {
  const { optimizeDayWithAI } = await import('./openclawPlanningAdapter')
  return optimizeDayWithAI(date, tasks, blocks, refinementConstraints)
}

/**
 * Week optimization (deterministic fallback — AI week optimization is deferred).
 *
 * Uses rebuildWeek deterministically across 7 days from weekStart, converting the
 * result to a structured OptimizeWeekResult with per-day action lists and candidate
 * slot arrays. The UI can preview and apply these actions.
 *
 * Full AI week optimization (single batch call or per-day AI) is a future improvement
 * deferred to avoid 7-call sequential queue depth (~3–4 min worst case).
 */
export async function optimizeWeekAI(
  weekStart: string,
  tasks: Task[],
  blocks: CalendarBlock[],
  refinementConstraints?: ActiveRefinementConstraints,
): Promise<import('./planningTypes').OptimizeWeekResult> {
  const { optimizeWeekWithAI } = await import('./openclawPlanningAdapter')
  return optimizeWeekWithAI(weekStart, tasks, blocks, refinementConstraints)
}
