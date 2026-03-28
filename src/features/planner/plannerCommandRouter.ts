import { addDays, today } from '@/lib/dateUtils'
import type { CalendarBlock, Task } from '@/store/planner'
import { optimizeDayAI, optimizeWeekAI, recommendSchedulingAI, type EnrichedCandidateSlot, type OptimizeDayResult, type PlanningAction } from './planningOrchestrator'
import type { ActiveRefinementConstraints } from './plannerRefinementTypes'

export interface PlannerContext {
  currentDate: string
  selectedDate: string
  tasks: Task[]
  blocks: CalendarBlock[]
}

export type PlannerCommand =
  | { type: 'optimize_day'; date: string }
  | { type: 'optimize_week'; weekStart: string }
  | { type: 'schedule_unscheduled'; date?: string }
  | { type: 'protect_focus'; date: string }
  | { type: 'refine_plan'; instructions: string }
  | { type: 'unknown' }

export type PlannerAgentResponse = {
  command: PlannerCommand
  result: OptimizeDayResult | import('./planningOrchestrator').OptimizeWeekResult | null
  summary: string
  requiresConfirmation: boolean
  source: 'ai' | 'fallback'
  refinementConstraints?: ActiveRefinementConstraints
  refinementNotes?: string[]
}

export async function handlePlannerCommand(input: string, context: PlannerContext): Promise<PlannerAgentResponse> {
  const command = parsePlannerCommand(input, context)

  switch (command.type) {
    case 'optimize_day': {
      const result = await optimizeDayAI(command.date, context.tasks, context.blocks)
      return buildResponse(command, result)
    }
    case 'optimize_week': {
      const result = await optimizeWeekAI(command.weekStart, context.tasks, context.blocks)
      return buildResponse(command, result)
    }
    case 'schedule_unscheduled': {
      const result = await buildScheduleUnscheduledPreview(command.date, context)
      return buildResponse(command, result)
    }
    case 'protect_focus': {
      const result = buildProtectFocusPreview(command.date, context)
      return buildResponse(command, result)
    }
    case 'unknown':
    default:
      return {
        command,
        result: null,
        summary: 'I recognized planner language, but I could not map it to a safe planner command.',
        requiresConfirmation: false,
        source: 'fallback',
      }
  }
}

export function isPlannerIntent(input: string): boolean {
  const normalized = input.toLowerCase()
  return [
    'schedule my',
    'schedule unscheduled',
    'schedule all tasks',
    'optimize',
    'rearrange',
    'protect focus',
    'protect deep work',
    'protect my focus',
    'protect time',
    'fix my',
    'rebuild',
    'plan my',
  ].some((keyword) => normalized.includes(keyword))
}

function parsePlannerCommand(input: string, context: PlannerContext): PlannerCommand {
  const normalized = input.toLowerCase()
  const currentDate = context.currentDate || today()
  const targetDate =
    normalized.includes('tomorrow') ? addDays(currentDate, 1) :
    normalized.includes('today') ? currentDate :
    context.selectedDate || currentDate

  if (matchesAny(normalized, ['optimize my week', 'fix my week', 'plan my week', 'rebuild my week', 'redo my week'])) {
    return { type: 'optimize_week', weekStart: getWeekStart(targetDate) }
  }

  if (matchesAny(normalized, [
    'rearrange my day', 'optimize today', 'fix my day', 'rebuild my day',
    'optimize tomorrow', 'fix tomorrow', 'plan my day', 'plan today', 'plan tomorrow',
    'redo my day', 'redo today',
  ])) {
    return { type: 'optimize_day', date: targetDate }
  }

  if (matchesAny(normalized, [
    'schedule my tasks',
    'fit unscheduled tasks',
    'schedule unscheduled',
    'schedule all tasks',
    'schedule my unscheduled tasks',
    'unscheduled tasks around my meetings',
    'schedule my unscheduled tasks around my meetings',
  ])) {
    return { type: 'schedule_unscheduled', date: normalized.includes('today') || normalized.includes('tomorrow') ? targetDate : undefined }
  }

  if (matchesAny(normalized, ['protect deep work', 'protect focus', 'protect my focus', 'protect time', 'protect my morning', 'protect mornings'])) {
    return { type: 'protect_focus', date: targetDate }
  }

  if (normalized.includes('week')) {
    return { type: 'optimize_week', weekStart: getWeekStart(targetDate) }
  }

  if (normalized.includes('today') || normalized.includes('tomorrow')) {
    return { type: 'optimize_day', date: targetDate }
  }

  return { type: 'unknown' }
}

async function buildScheduleUnscheduledPreview(date: string | undefined, context: PlannerContext): Promise<OptimizeDayResult> {
  const previewDate = date ?? context.selectedDate
  const unscheduledTasks = [...context.tasks.filter((task) => !task.completed && !task.scheduled)].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    const priorityDelta = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDelta !== 0) return priorityDelta
    return (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
  })
  const actions: PlanningAction[] = []
  const candidateSlots: EnrichedCandidateSlot[] = []
  const warnings: string[] = []
  let dominantSource: 'ai' | 'fallback' = 'fallback'
  let workingBlocks = [...context.blocks]

  for (const task of unscheduledTasks) {
    const recommendation = await recommendSchedulingAI(task, workingBlocks)
    if (recommendation.source === 'ai') dominantSource = 'ai'

    if (recommendation.recommendedAction === 'schedule' && recommendation.suggestedWindow) {
      const suggestedWindow = recommendation.suggestedWindow
      if (date && recommendation.suggestedWindow.date !== date) {
        actions.push({
          type: 'flag_risk',
          entityId: task.id,
          message: `${task.title}: no safe slot on ${date}; best suggestion is ${suggestedWindow.date} ${suggestedWindow.start}.`,
        })
        warnings.push(...recommendation.warnings)
        continue
      }

      const candidateIndex = candidateSlots.length
      candidateSlots.push({
        taskId: task.id,
        date: suggestedWindow.date,
        startTime: suggestedWindow.start,
        endTime: suggestedWindow.end,
        durationMinutes: task.durationMinutes,
        dayWorkloadMinutes: workingBlocks.filter((block) => block.date === suggestedWindow.date).reduce((total, block) => total + block.duration, 0),
        energyAlignment: 'partial',
        urgencyFit: task.dueDate
          ? suggestedWindow.date < task.dueDate ? 'before-due'
          : suggestedWindow.date === task.dueDate ? 'on-due'
          : 'after-due'
          : 'no-deadline',
        isFocusWindow: isFocusWindow(suggestedWindow.start, suggestedWindow.end),
        score: 0.75,
        focusQuality: isFocusWindow(suggestedWindow.start, suggestedWindow.end) ? 1 : 0.2,
        displacementCost: 0,
        isChunkSlot: false,
        isBlockDestination: false,
      })
      actions.push({
        type: 'schedule_task',
        taskId: task.id,
        candidateIndex,
        rationale: recommendation.rationale,
      })
      workingBlocks = [...workingBlocks, {
        id: `preview-${task.id}-${candidateIndex}`,
        title: task.title,
        date: suggestedWindow.date,
        startTime: suggestedWindow.start,
        duration: task.durationMinutes,
        color: task.energyType === 'deep' ? '#9d4edd' : task.energyType === 'moderate' ? '#00d4ff' : '#00ff88',
        type: 'task-block',
        locked: false,
        flexible: true,
        recurring: false,
        source: 'scheduler',
        linkedTaskId: task.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }]
    } else if (recommendation.recommendedAction === 'defer' && task.dueDate) {
      actions.push({
        type: 'defer_task',
        taskId: task.id,
        toDate: addDays(task.dueDate, 1),
        rationale: recommendation.rationale,
      })
    } else {
      actions.push({
        type: 'flag_risk',
        entityId: task.id,
        message: `${task.title}: ${recommendation.rationale}`,
      })
    }

    warnings.push(...recommendation.warnings)
  }

  return {
    date: previewDate,
    actions,
    candidateSlots,
    summary: actions.length > 0
      ? `Prepared ${actions.length} planner action${actions.length !== 1 ? 's' : ''} for unscheduled tasks${date ? ` on ${date}` : ''}.`
      : 'No unscheduled tasks needed planner changes.',
    confidence: unscheduledTasks.length > 0 ? 0.78 : 1,
    source: dominantSource,
    warnings,
  }
}

function buildProtectFocusPreview(date: string, context: PlannerContext): OptimizeDayResult {
  const windows = findProtectableFocusWindows(date, context.blocks)
  const actions: PlanningAction[] = windows.length > 0
    ? windows.map((window) => ({
        type: 'protect_focus_window',
        date: window.date,
        startTime: window.startTime,
        endTime: window.endTime,
        rationale: `Protect premium ${window.durationMinutes} minute focus window for deep work.`,
      }))
    : [{
        type: 'flag_risk',
        entityId: date,
        message: `No premium free focus window is available on ${date}.`,
      }]

  return {
    date,
    actions,
    candidateSlots: [],
    summary: windows.length > 0
      ? `Prepared ${windows.length} focus protection action${windows.length > 1 ? 's' : ''} for ${date}.`
      : `No premium free focus windows were available on ${date}.`,
    confidence: windows.length > 0 ? 0.9 : 0.6,
    source: 'fallback',
    warnings: [],
  }
}

function buildResponse(
  command: PlannerCommand,
  result: OptimizeDayResult | import('./planningOrchestrator').OptimizeWeekResult,
): PlannerAgentResponse {
  return {
    command,
    result,
    summary: result.summary || 'Plan ready',
    requiresConfirmation: true,
    source: result.source,
  }
}

function matchesAny(input: string, phrases: string[]): boolean {
  return phrases.some((phrase) => input.includes(phrase))
}

function getWeekStart(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  return date.toISOString().split('T')[0]
}

function isFocusWindow(startTime: string, endTime: string): boolean {
  const windows = [
    { start: '09:00', end: '12:00' },
    { start: '13:30', end: '16:00' },
  ]
  return windows.some((window) => startTime >= window.start && endTime <= window.end)
}

function findProtectableFocusWindows(date: string, blocks: CalendarBlock[]): Array<{ date: string; startTime: string; endTime: string; durationMinutes: number }> {
  const windows = [
    { date, startTime: '09:00', endTime: '12:00', durationMinutes: 180 },
    { date, startTime: '13:30', endTime: '16:00', durationMinutes: 150 },
  ]
  const dayBlocks = blocks.filter((block) => block.date === date)
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number)
    return (hours * 60) + minutes
  }

  return windows.filter((window) => !dayBlocks.some((block) => {
    const blockStart = toMinutes(block.startTime)
    const blockEnd = blockStart + block.duration
    const windowStart = toMinutes(window.startTime)
    const windowEnd = toMinutes(window.endTime)
    return blockStart < windowEnd && blockEnd > windowStart
  }))
}
