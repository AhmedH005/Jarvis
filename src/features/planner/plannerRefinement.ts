import type { CalendarBlock } from '@/store/planner'
import type { ActivePlanSession } from '@/store/jarvis'
import { optimizeDayAI, optimizeWeekAI, type OptimizeDayResult, type OptimizeWeekResult } from './planningOrchestrator'
import type { PlannerAgentResponse, PlannerCommand, PlannerContext } from './plannerCommandRouter'
import {
  type ActiveRefinementConstraints,
  type RefinementBlockedWindow,
  describeRefinementConstraints,
  hasActiveRefinementConstraints,
  mergeRefinementConstraints,
} from './plannerRefinementTypes'

const WORKDAY_START = '07:00'
const WORKDAY_END = '21:00'

export function isPlanRefinementIntent(input: string): boolean {
  const normalized = input.toLowerCase()
  return [
    // Time-shift phrases
    'move it later',
    'move it earlier',
    'move that',
    'push it to',
    'push that to',
    'shift it',
    'shift that',
    'reschedule it',
    'reschedule that',
    'make it later',
    'make it earlier',
    'change it to',
    'change that to',
    'swap it',
    'put it at',
    // Block constraints
    'not that early',
    'not in the morning',
    'not before',
    'no meetings before',
    'keep mornings free',
    'keep evenings free',
    'afternoons only',
    'mornings only',
    'only deep work in mornings',
    'only deep work in the morning',
    // Lock / unlock phrases
    "don't move",
    'dont move',
    'keep it there',
    'leave it',
    // Buffer / spacing
    'add a buffer',
    'leave more time',
    'give me a break',
    'space them out',
  ].some((phrase) => normalized.includes(phrase))
}

export async function handlePlanRefinement(
  input: string,
  session: ActivePlanSession,
  context: PlannerContext,
): Promise<PlannerAgentResponse> {
  const delta = parseRefinementDelta(input, session)
  const command: PlannerCommand = { type: 'refine_plan', instructions: input }

  if (!hasActiveRefinementConstraints(delta)) {
    return {
      command,
      result: session.result,
      summary: 'I did not recognize a safe refinement rule, so I kept the current plan unchanged.',
      requiresConfirmation: true,
      source: session.result.source,
      refinementConstraints: session.refinementConstraints,
      refinementNotes: describeRefinementConstraints(session.refinementConstraints),
    }
  }

  const mergedConstraints = mergeRefinementConstraints(session.refinementConstraints, delta)
  return rerunPlanWithConstraints(session, mergedConstraints, context, command)
}

export async function rerunPlanWithConstraints(
  session: ActivePlanSession,
  constraints: ActiveRefinementConstraints,
  context: PlannerContext,
  command: PlannerCommand = session.command,
): Promise<PlannerAgentResponse> {
  const constrainedContext = applyRefinementConstraintsToPlannerContext(context, constraints, session)
  const result = await rerunOptimizer(session, constrainedContext, constraints)
  const labels = describeRefinementConstraints(constraints)

  return {
    command,
    result,
    summary: labels.length > 0
      ? `${result.summary} Active refinements: ${labels.join(', ')}.`
      : result.summary,
    requiresConfirmation: true,
    source: result.source,
    refinementConstraints: constraints,
    refinementNotes: labels,
  }
}

export function applyRefinementConstraintsToPlannerContext(
  context: PlannerContext,
  constraints: ActiveRefinementConstraints,
  session?: ActivePlanSession,
): PlannerContext {
  let blocks = context.blocks.map((block) => ({ ...block }))

  if (constraints.preserveMovedBlocks && session) {
    const movedBlockIds = session.result.actions
      .filter((action): action is Extract<typeof session.result.actions[number], { type: 'move_block' }> => action.type === 'move_block')
      .map((action) => action.blockId)
    blocks = blocks.map((block) => movedBlockIds.includes(block.id)
      ? { ...block, locked: true, flexible: false, updatedAt: new Date().toISOString() }
      : block,
    )
  }

  const syntheticWindows = buildSyntheticBlockedWindows(constraints, session)
  const blockedWindows = dedupeBlockedWindows([...(constraints.blockedWindows ?? []), ...syntheticWindows])
  const injectedBlocks = blockedWindows.map((window) => blockedWindowToBlock(window))

  return {
    ...context,
    tasks: context.tasks.map((task) => ({ ...task })),
    blocks: dedupeBlocks([...blocks, ...injectedBlocks]),
  }
}

function parseRefinementDelta(
  input: string,
  session: ActivePlanSession,
): ActiveRefinementConstraints {
  const normalized = input.toLowerCase()
  const delta: ActiveRefinementConstraints = { blockedWindows: [], notes: [] }
  const dates = getRelevantDates(session.result)

  // ── Later scheduling ──────────────────────────────────────────────────────
  if (normalized.includes('not that early') || normalized.includes('not in the morning')) {
    delta.earliestStartTime = '11:00'
    delta.preferLaterScheduling = true
    delta.notes?.push('Later start requested')
  }

  if (
    normalized.includes('move it later') ||
    normalized.includes('make it later') ||
    normalized.includes('push it to afternoon') ||
    normalized.includes('afternoons only')
  ) {
    delta.earliestStartTime = '13:00'
    delta.preferLaterScheduling = true
    delta.notes?.push('Afternoon scheduling requested')
  }

  // ── Earlier scheduling ─────────────────────────────────────────────────────
  if (normalized.includes('move it earlier') || normalized.includes('make it earlier')) {
    delta.preferLaterScheduling = false
    delta.notes?.push('Earlier scheduling requested')
  }

  // ── Protect morning ───────────────────────────────────────────────────────
  if (
    normalized.includes('keep mornings free') ||
    normalized.includes('mornings only') ||
    normalized.includes('no meetings before') ||
    normalized.includes('not before 9') ||
    normalized.includes('not before 10')
  ) {
    delta.protectMorning = true
    delta.blockedWindows?.push(...dates.map((date) => ({
      date,
      startTime: '09:00',
      endTime: '12:00',
      reason: 'Morning protected',
    })))
  }

  // ── Protect evening ────────────────────────────────────────────────────────
  if (normalized.includes('keep evenings free') || normalized.includes('nothing after 5') || normalized.includes('nothing after 6')) {
    delta.latestEndTime = normalized.includes('nothing after 5') ? '17:00' : '18:00'
    delta.notes?.push('Evening kept free')
  }

  // ── Buffer / spacing ───────────────────────────────────────────────────────
  if (
    normalized.includes('space them out') ||
    normalized.includes('add a buffer') ||
    normalized.includes('leave more time') ||
    normalized.includes('give me a break')
  ) {
    delta.minBufferMinutes = 20
    delta.notes?.push('Buffer between tasks increased')
  }

  // ── Preserve ──────────────────────────────────────────────────────────────
  if (
    normalized.includes("don't move") ||
    normalized.includes('dont move') ||
    normalized.includes('keep it there') ||
    normalized.includes('leave it')
  ) {
    delta.preserveMovedBlocks = true
    delta.notes?.push('Moved blocks preserved')
  }

  if (normalized.includes('only deep work in mornings') || normalized.includes('only deep work in the morning')) {
    delta.deepWorkMorningOnly = true
    delta.notes?.push('Morning time reserved for deep work')
  }

  return {
    ...delta,
    blockedWindows: dedupeBlockedWindows(delta.blockedWindows ?? []),
    notes: [...new Set(delta.notes ?? [])],
  }
}

async function rerunOptimizer(
  session: ActivePlanSession,
  context: PlannerContext,
  constraints: ActiveRefinementConstraints,
): Promise<OptimizeDayResult | OptimizeWeekResult> {
  if ('weekStart' in session.result) {
    return optimizeWeekAI(session.result.weekStart, context.tasks, context.blocks, constraints)
  }
  return optimizeDayAI(session.result.date, context.tasks, context.blocks, constraints)
}

function buildSyntheticBlockedWindows(
  constraints: ActiveRefinementConstraints,
  session?: ActivePlanSession,
): RefinementBlockedWindow[] {
  if (!session) return []
  const dates = getRelevantDates(session.result)
  const windows: RefinementBlockedWindow[] = []

  if (constraints.earliestStartTime) {
    windows.push(...dates.map((date) => ({
      date,
      startTime: WORKDAY_START,
      endTime: constraints.earliestStartTime!,
      reason: 'Starts later than usual',
    })))
  }

  if (constraints.latestEndTime) {
    windows.push(...dates.map((date) => ({
      date,
      startTime: constraints.latestEndTime!,
      endTime: WORKDAY_END,
      reason: 'Ends earlier than usual',
    })))
  }

  return windows
}

function getRelevantDates(result: OptimizeDayResult | OptimizeWeekResult): string[] {
  if ('weekStart' in result) {
    return Array.from({ length: 7 }, (_, index) => {
      const base = new Date(`${result.weekStart}T12:00:00`)
      base.setDate(base.getDate() + index)
      return base.toISOString().split('T')[0]
    })
  }
  return [result.date]
}

function blockedWindowToBlock(window: RefinementBlockedWindow): CalendarBlock {
  return {
    id: `refine-${window.date}-${window.startTime}-${window.endTime}-${window.reason}`,
    title: `Refinement: ${window.reason}`,
    date: window.date,
    startTime: window.startTime,
    duration: toMinutes(window.endTime) - toMinutes(window.startTime),
    color: '#9d4edd',
    type: 'focus',
    locked: true,
    flexible: false,
    recurring: false,
    source: 'manual',
    notes: `Preview-only refinement constraint: ${window.reason}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function dedupeBlocks(blocks: CalendarBlock[]): CalendarBlock[] {
  const seen = new Set<string>()
  return blocks.filter((block) => {
    const key = `${block.date}:${block.startTime}:${block.duration}:${block.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dedupeBlockedWindows(windows: RefinementBlockedWindow[]): RefinementBlockedWindow[] {
  const seen = new Set<string>()
  return windows.filter((window) => {
    const key = `${window.date}:${window.startTime}:${window.endTime}:${window.reason}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return (hours * 60) + minutes
}
