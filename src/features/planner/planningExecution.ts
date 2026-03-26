/**
 * Planning Execution Safety Layer
 *
 * Implements transactional, reversible, dependency-ordered application of
 * AI-suggested planning actions.
 */

import type { CalendarBlock, ProtectedWindow, Task } from '@/store/planner'
import { uid, today } from '@/lib/dateUtils'
import { detectConflicts, toMinutes } from '@/features/scheduler/schedulerService'
import type {
  EnrichedCandidateSlot,
  OptimizeDayResult,
  OptimizeWeekResult,
  PlanningAction,
} from './planningTypes'
import { protectedWindowMatchesBlock, syncTasksWithBlocks } from './plannerStateUtils'

export type ExecutionSource =
  | 'manual'
  | 'optimize_day'
  | 'optimize_week'
  | 'apply_action'
  | 'apply_all'

export interface ExecutionResult {
  success: boolean
  appliedActionIds: string[]
  failedActionIds: string[]
  warnings: string[]
  error?: string
  rollbackAvailable: boolean
}

export interface ExecutionSnapshot {
  tasks: Task[]
  blocks: CalendarBlock[]
  protectedWindows: ProtectedWindow[]
  timestamp: string
  source: ExecutionSource
  summary: string
}

export interface ExecutionHistoryEntry {
  id: string
  timestamp: string
  source: ExecutionSource
  actionCount: number
  summary: string
  confidence?: number
  plannerSource?: 'ai' | 'fallback'
  undoAvailable: boolean
}

export interface StampedPlanningAction {
  actionId: string
  action: PlanningAction
  resolvedSlot: EnrichedCandidateSlot | undefined
  resolvedChunkSlots: EnrichedCandidateSlot[] | undefined
}

export function resolveSlotForAction(
  action: PlanningAction,
  result: OptimizeDayResult | OptimizeWeekResult,
): EnrichedCandidateSlot | undefined {
  if (action.type !== 'schedule_task' && action.type !== 'move_block') return undefined

  if ('candidateSlots' in result) {
    return result.candidateSlots[action.candidateIndex] ?? undefined
  }
  for (const dayResult of result.dayResults) {
    if (dayResult.actions.includes(action)) {
      return dayResult.candidateSlots[action.candidateIndex] ?? undefined
    }
  }
  return undefined
}

function resolveChunkSlotsForAction(
  action: PlanningAction,
  result: OptimizeDayResult | OptimizeWeekResult,
): EnrichedCandidateSlot[] | undefined {
  if (action.type !== 'split_task') return undefined
  if (!('candidateSlots' in result)) return undefined
  const pool = result.candidateSlots
  return action.chunks.map((chunk) => pool[chunk.candidateIndex]).filter((slot): slot is EnrichedCandidateSlot => !!slot)
}

export function stampActions(
  actions: PlanningAction[],
  result: OptimizeDayResult | OptimizeWeekResult,
): StampedPlanningAction[] {
  return actions.map((action) => ({
    actionId: uid('exec'),
    action,
    resolvedSlot: resolveSlotForAction(action, result),
    resolvedChunkSlots: resolveChunkSlotsForAction(action, result),
  }))
}

const ACTION_PHASE: Record<PlanningAction['type'], number> = {
  defer_task: 0,
  protect_focus_window: 0,
  schedule_task: 1,
  move_block: 1,
  split_task: 1,
  lock_block: 2,
  preserve_block: 2,
  flag_risk: 3,
}

export function orderActionsForExecution(stamped: StampedPlanningAction[]): StampedPlanningAction[] {
  return [...stamped].sort((a, b) => ACTION_PHASE[a.action.type] - ACTION_PHASE[b.action.type])
}

interface ValidationIssue {
  actionId: string
  reason: string
}

interface ValidationReport {
  valid: StampedPlanningAction[]
  invalid: StampedPlanningAction[]
  issues: ValidationIssue[]
  warnings: string[]
}

export function validateActions(
  ordered: StampedPlanningAction[],
  state: { tasks: Task[]; blocks: CalendarBlock[]; protectedWindows: ProtectedWindow[] },
): ValidationReport {
  const taskMap = new Map(state.tasks.map((task) => [task.id, task]))
  const blockMap = new Map(state.blocks.map((block) => [block.id, block]))
  const td = today()

  const valid: StampedPlanningAction[] = []
  const invalid: StampedPlanningAction[] = []
  const issues: ValidationIssue[] = []
  const warnings: string[] = []
  const usedSlotKeys = new Set<string>()
  const usedProtectedWindowKeys = new Set(state.protectedWindows.map((window) => `${window.date}:${window.startTime}:${window.endTime}`))
  const scheduledTaskIds = new Set<string>()

  for (const stamped of ordered) {
    const { actionId, action, resolvedSlot, resolvedChunkSlots } = stamped
    let ok = true

    if (action.type === 'flag_risk') {
      valid.push(stamped)
      continue
    }

    if (action.type === 'defer_task') {
      const task = taskMap.get(action.taskId)
      if (!task) {
        issues.push({ actionId, reason: `Task ${action.taskId} not found` })
        ok = false
      } else if (action.toDate < td) {
        issues.push({ actionId, reason: `Defer date ${action.toDate} is in the past` })
        ok = false
      } else if (action.toDate === task.dueDate) {
        warnings.push(`Defer: "${task.title}" already has due date ${action.toDate} — no-op`)
      }
    }

    if (action.type === 'protect_focus_window') {
      if (action.date < td) {
        issues.push({ actionId, reason: `protect_focus_window date ${action.date} is in the past` })
        ok = false
      } else if (!action.startTime.match(/^\d{2}:\d{2}$/) || !action.endTime.match(/^\d{2}:\d{2}$/)) {
        issues.push({ actionId, reason: 'protect_focus_window has invalid startTime or endTime' })
        ok = false
      } else if (action.startTime >= action.endTime) {
        issues.push({ actionId, reason: 'protect_focus_window startTime must be before endTime' })
        ok = false
      } else {
        const slotKey = `${action.date}:${action.startTime}`
        const windowKey = `${action.date}:${action.startTime}:${action.endTime}`
        if (usedSlotKeys.has(slotKey)) {
          warnings.push(`protect_focus_window: slot ${slotKey} already used — skipping`)
          ok = false
        } else if (usedProtectedWindowKeys.has(windowKey)) {
          warnings.push(`protect_focus_window: window ${windowKey} already protected — skipping`)
          ok = false
        } else {
          usedSlotKeys.add(slotKey)
          usedProtectedWindowKeys.add(windowKey)
        }
      }
    }

    if (action.type === 'lock_block' || action.type === 'preserve_block') {
      const block = blockMap.get(action.blockId)
      if (!block) {
        issues.push({ actionId, reason: `Block ${action.blockId} not found` })
        ok = false
      } else if (block.locked) {
        warnings.push(`${action.type}: "${block.title}" is already locked — applying anyway (idempotent)`)
      }
    }

    if (action.type === 'move_block') {
      const block = blockMap.get(action.blockId)
      if (!block) {
        issues.push({ actionId, reason: `Block ${action.blockId} not found` })
        ok = false
      } else if (block.locked) {
        issues.push({ actionId, reason: `Block "${block.title}" is locked and cannot be moved` })
        ok = false
      } else if (!resolvedSlot) {
        issues.push({ actionId, reason: 'No candidate slot resolved for move_block action' })
        ok = false
      } else {
        const key = `${resolvedSlot.date}:${resolvedSlot.startTime}`
        if (usedSlotKeys.has(key)) {
          issues.push({ actionId, reason: `Slot ${key} already claimed by another action in this batch` })
          ok = false
        } else {
          usedSlotKeys.add(key)
        }
      }
    }

    if (action.type === 'schedule_task') {
      const task = taskMap.get(action.taskId)
      if (!task) {
        issues.push({ actionId, reason: `Task ${action.taskId} not found` })
        ok = false
      } else if (task.completed) {
        issues.push({ actionId, reason: `Task "${task.title}" is already completed` })
        ok = false
      } else if (scheduledTaskIds.has(action.taskId)) {
        issues.push({ actionId, reason: `Task "${task.title}" already scheduled in this batch` })
        ok = false
      } else if (!resolvedSlot) {
        issues.push({ actionId, reason: 'No candidate slot resolved for schedule_task action' })
        ok = false
      } else if (resolvedSlot.date < td) {
        issues.push({ actionId, reason: `Target date ${resolvedSlot.date} is in the past` })
        ok = false
      } else {
        const key = `${resolvedSlot.date}:${resolvedSlot.startTime}`
        if (usedSlotKeys.has(key)) {
          issues.push({ actionId, reason: `Slot ${key} already claimed by another action in this batch` })
          ok = false
        } else {
          usedSlotKeys.add(key)
          scheduledTaskIds.add(action.taskId)
        }
      }
    }

    if (action.type === 'split_task') {
      const task = taskMap.get(action.taskId)
      if (!task) {
        issues.push({ actionId, reason: `Task ${action.taskId} not found` })
        ok = false
      } else if (task.completed) {
        issues.push({ actionId, reason: `Task "${task.title}" is already completed` })
        ok = false
      } else if (scheduledTaskIds.has(action.taskId)) {
        issues.push({ actionId, reason: `Task "${task.title}" already scheduled in this batch` })
        ok = false
      } else if (!resolvedChunkSlots || resolvedChunkSlots.length !== action.chunks.length) {
        issues.push({ actionId, reason: `split_task: could not resolve all ${action.chunks.length} chunk slots` })
        ok = false
      } else if (action.chunks.length < 2) {
        issues.push({ actionId, reason: 'split_task must have at least 2 chunks' })
        ok = false
      } else {
        const localUsedSlotKeys = new Set<string>()
        const localCandidateIndices = new Set<number>()
        const totalChunkMinutes = action.chunks.reduce((total, chunk) => total + chunk.durationMinutes, 0)

        if (totalChunkMinutes > task.durationMinutes) {
          issues.push({ actionId, reason: `split_task schedules ${totalChunkMinutes}m for a ${task.durationMinutes}m task` })
          ok = false
        }

        for (let index = 0; ok && index < resolvedChunkSlots.length; index++) {
          const slot = resolvedChunkSlots[index]
          const chunk = action.chunks[index]
          if (slot.date < td) {
            issues.push({ actionId, reason: `split_task chunk slot date ${slot.date} is in the past` })
            ok = false
            break
          }
          const slotKey = `${slot.date}:${slot.startTime}`
          if (usedSlotKeys.has(slotKey) || localUsedSlotKeys.has(slotKey)) {
            issues.push({ actionId, reason: `split_task chunk slot ${slotKey} already claimed` })
            ok = false
            break
          }
          if (localCandidateIndices.has(chunk.candidateIndex)) {
            issues.push({ actionId, reason: 'split_task repeats a chunk candidateIndex' })
            ok = false
            break
          }
          localUsedSlotKeys.add(slotKey)
          localCandidateIndices.add(chunk.candidateIndex)
        }

        if (ok) {
          localUsedSlotKeys.forEach((key) => usedSlotKeys.add(key))
          scheduledTaskIds.add(action.taskId)
        }
      }
    }

    if (ok) valid.push(stamped)
    else invalid.push(stamped)
  }

  return { valid, invalid, issues, warnings }
}

interface ApplyReport {
  newTasks: Task[]
  newBlocks: CalendarBlock[]
  newProtectedWindows: ProtectedWindow[]
  appliedActionIds: string[]
  failedActionIds: string[]
  warnings: string[]
}

export function computeNextState(
  valid: StampedPlanningAction[],
  state: { tasks: Task[]; blocks: CalendarBlock[]; protectedWindows: ProtectedWindow[] },
): ApplyReport {
  let tasks = [...state.tasks]
  let blocks = [...state.blocks]
  let protectedWindows = [...state.protectedWindows]
  const appliedActionIds: string[] = []
  const failedActionIds: string[] = []
  const warnings: string[] = []
  const now = new Date().toISOString()

  for (const { actionId, action, resolvedSlot, resolvedChunkSlots } of valid) {
    try {
      if (action.type === 'flag_risk') {
        appliedActionIds.push(actionId)
        continue
      }

      if (action.type === 'defer_task') {
        if (!tasks.some((task) => task.id === action.taskId)) { failedActionIds.push(actionId); continue }
        tasks = tasks.map((task) => task.id === action.taskId ? { ...task, dueDate: action.toDate, updatedAt: now } : task)
        appliedActionIds.push(actionId)
        continue
      }

      if (action.type === 'protect_focus_window') {
        const duration = toMinutes(action.endTime) - toMinutes(action.startTime)
        if (duration <= 0) { failedActionIds.push(actionId); continue }
        const duplicateWindow = protectedWindows.find((window) =>
          window.date === action.date &&
          window.startTime === action.startTime &&
          window.endTime === action.endTime,
        )
        if (duplicateWindow) { failedActionIds.push(actionId); continue }

        const protectedWindowId = uid('protected')
        const blockId = uid('block')
        blocks = [...blocks, {
          id: blockId,
          title: 'Protected Focus',
          date: action.date,
          startTime: action.startTime,
          duration,
          color: '#9d4edd',
          type: 'focus',
          locked: true,
          flexible: false,
          recurring: false,
          source: 'scheduler',
          protectedWindowId,
          isProtectedTime: true,
          protectionSource: 'ai',
          notes: action.rationale,
          createdAt: now,
          updatedAt: now,
        }]
        protectedWindows = [...protectedWindows, {
          id: protectedWindowId,
          date: action.date,
          startTime: action.startTime,
          endTime: action.endTime,
          durationMinutes: duration,
          source: 'ai',
          locked: true,
          blockId,
          rationale: action.rationale,
          createdAt: now,
          updatedAt: now,
        }]
        appliedActionIds.push(actionId)
        continue
      }

      if (action.type === 'lock_block' || action.type === 'preserve_block') {
        if (!blocks.some((block) => block.id === action.blockId)) { failedActionIds.push(actionId); continue }
        blocks = blocks.map((block) => block.id === action.blockId ? { ...block, locked: true, updatedAt: now } : block)
        protectedWindows = protectedWindows.map((window) => window.blockId === action.blockId ? { ...window, locked: true, updatedAt: now } : window)
        appliedActionIds.push(actionId)
        continue
      }

      if (action.type === 'move_block') {
        if (!resolvedSlot) { failedActionIds.push(actionId); continue }
        if (!blocks.some((block) => block.id === action.blockId)) { failedActionIds.push(actionId); continue }
        blocks = blocks.map((block) =>
          block.id === action.blockId
            ? { ...block, date: resolvedSlot.date, startTime: resolvedSlot.startTime, duration: resolvedSlot.durationMinutes, updatedAt: now }
            : block,
        )
        protectedWindows = protectedWindows.map((window) => window.blockId === action.blockId ? {
          ...window,
          date: resolvedSlot.date,
          startTime: resolvedSlot.startTime,
          endTime: addDurationToTime(resolvedSlot.startTime, resolvedSlot.durationMinutes),
          durationMinutes: resolvedSlot.durationMinutes,
          updatedAt: now,
        } : window)
        appliedActionIds.push(actionId)
        continue
      }

      if (action.type === 'schedule_task') {
        if (!resolvedSlot) { failedActionIds.push(actionId); continue }
        const task = tasks.find((entry) => entry.id === action.taskId)
        if (!task) { failedActionIds.push(actionId); continue }

        blocks = blocks.filter((block) => block.linkedTaskId !== action.taskId)
        const blockId = uid('block')
        const color = task.energyType === 'deep' ? '#9d4edd' : task.energyType === 'moderate' ? '#00d4ff' : '#00ff88'
        blocks = [...blocks, {
          id: blockId,
          title: task.title,
          date: resolvedSlot.date,
          startTime: resolvedSlot.startTime,
          duration: resolvedSlot.durationMinutes,
          color,
          type: 'task-block',
          locked: false,
          flexible: true,
          recurring: false,
          source: 'scheduler',
          linkedTaskId: task.id,
          schedulingGroupId: task.id,
          createdAt: now,
          updatedAt: now,
        }]
        tasks = syncTasksWithBlocks(tasks.map((entry) => entry.id === action.taskId ? { ...entry, updatedAt: now } : entry), blocks)
        appliedActionIds.push(actionId)
        continue
      }

      if (action.type === 'split_task') {
        if (!resolvedChunkSlots || resolvedChunkSlots.length !== action.chunks.length) { failedActionIds.push(actionId); continue }
        const task = tasks.find((entry) => entry.id === action.taskId)
        if (!task) { failedActionIds.push(actionId); continue }

        blocks = blocks.filter((block) => block.linkedTaskId !== action.taskId)
        const color = task.energyType === 'deep' ? '#9d4edd' : task.energyType === 'moderate' ? '#00d4ff' : '#00ff88'
        const chunkCount = action.chunks.length
        let firstBlockId: string | undefined

        for (let index = 0; index < chunkCount; index++) {
          const slot = resolvedChunkSlots[index]
          const chunkDuration = action.chunks[index].durationMinutes
          const blockId = uid('block')
          if (!firstBlockId) firstBlockId = blockId
          blocks = [...blocks, {
            id: blockId,
            title: `${task.title} (${index + 1}/${chunkCount})`,
            date: slot.date,
            startTime: slot.startTime,
            duration: chunkDuration,
            color,
            type: 'task-block',
            locked: false,
            flexible: true,
            recurring: false,
            source: 'scheduler',
            linkedTaskId: task.id,
            chunkIndex: index,
            chunkCount,
            chunkDurationMinutes: chunkDuration,
            schedulingGroupId: task.id,
            notes: `Split chunk ${index + 1}/${chunkCount} — ${chunkDuration}min`,
            createdAt: now,
            updatedAt: now,
          }]
        }

        tasks = syncTasksWithBlocks(
          tasks.map((entry) => entry.id === action.taskId ? { ...entry, linkedCalendarBlockId: firstBlockId, updatedAt: now } : entry),
          blocks,
        )
        appliedActionIds.push(actionId)
        continue
      }
    } catch (error) {
      warnings.push(`Action ${actionId} threw during state computation: ${String(error)}`)
      failedActionIds.push(actionId)
    }
  }

  return {
    newTasks: syncTasksWithBlocks(tasks, blocks),
    newBlocks: blocks,
    newProtectedWindows: protectedWindows,
    appliedActionIds,
    failedActionIds,
    warnings,
  }
}

export interface PostApplyIssues {
  conflictCount: number
  brokenLinkTaskIds: string[]
  duplicateScheduledTaskIds: string[]
  protectedWindowIdsWithoutBlocks: string[]
  warnings: string[]
  criticalFailure: boolean
}

export function runPostApplyValidation(
  state: { tasks: Task[]; blocks: CalendarBlock[]; protectedWindows: ProtectedWindow[] },
): PostApplyIssues {
  const warnings: string[] = []
  let criticalFailure = false

  const conflicts = detectConflicts(state.blocks)
  if (conflicts.length > 0) {
    warnings.push(`${conflicts.length} scheduling conflict${conflicts.length > 1 ? 's' : ''} detected after apply`)
  }

  const blockIdSet = new Set(state.blocks.map((block) => block.id))
  const brokenLinkTaskIds: string[] = []
  const duplicateScheduledTaskIds: string[] = []

  for (const task of state.tasks) {
    const taskBlocks = state.blocks.filter((block) => block.linkedTaskId === task.id)
    const linkedIds = taskBlocks.map((block) => block.id)
    const missingLinkedIds = task.linkedCalendarBlockIds.filter((id) => !blockIdSet.has(id))

    if (missingLinkedIds.length > 0 || (task.linkedCalendarBlockId && !blockIdSet.has(task.linkedCalendarBlockId))) {
      brokenLinkTaskIds.push(task.id)
      warnings.push(`"${task.title}" is marked scheduled but one of its linked blocks no longer exists`)
      criticalFailure = true
    }

    if (task.scheduled !== (linkedIds.length > 0) || task.linkedCalendarBlockIds.join('|') !== linkedIds.join('|')) {
      duplicateScheduledTaskIds.push(task.id)
      warnings.push(`"${task.title}" task linkage is out of sync with its calendar blocks`)
      criticalFailure = true
    }

    const actualMinutes = taskBlocks.reduce((total, block) => total + block.duration, 0)
    if (task.scheduledMinutes !== actualMinutes) {
      duplicateScheduledTaskIds.push(task.id)
      warnings.push(`"${task.title}" scheduledMinutes does not match linked blocks`)
      criticalFailure = true
    }

    const chunkIndices = taskBlocks
      .map((block) => block.chunkIndex)
      .filter((value): value is number => typeof value === 'number')
    if (chunkIndices.length > 0 && new Set(chunkIndices).size !== chunkIndices.length) {
      duplicateScheduledTaskIds.push(task.id)
      warnings.push(`"${task.title}" has duplicate chunk indices`)
      criticalFailure = true
    }
  }

  const protectedWindowIdsWithoutBlocks: string[] = []
  for (const window of state.protectedWindows) {
    const matchingBlock = state.blocks.find((block) => protectedWindowMatchesBlock(window, block))
    if (!matchingBlock) {
      protectedWindowIdsWithoutBlocks.push(window.id)
      warnings.push(`Protected window ${window.date} ${window.startTime}-${window.endTime} has no matching block`)
      criticalFailure = true
      continue
    }

    const overlappingTaskBlock = state.blocks.some((block) => {
      if (block.id === matchingBlock.id || block.date !== window.date || !block.linkedTaskId) return false
      const blockStart = toMinutes(block.startTime)
      const blockEnd = blockStart + block.duration
      const windowStart = toMinutes(window.startTime)
      const windowEnd = toMinutes(window.endTime)
      return blockStart < windowEnd && blockEnd > windowStart
    })
    if (overlappingTaskBlock) {
      warnings.push(`Protected window ${window.date} ${window.startTime}-${window.endTime} is violated by a task block`)
      criticalFailure = true
    }
  }

  for (const block of state.blocks) {
    if (block.locked && block.flexible) {
      warnings.push(`"${block.title}" is both locked and flexible — state is contradictory`)
    }
  }

  return {
    conflictCount: conflicts.length,
    brokenLinkTaskIds,
    duplicateScheduledTaskIds,
    protectedWindowIdsWithoutBlocks,
    warnings,
    criticalFailure,
  }
}

export function captureSnapshot(
  state: { tasks: Task[]; blocks: CalendarBlock[]; protectedWindows: ProtectedWindow[] },
  source: ExecutionSource,
  summary: string,
): ExecutionSnapshot {
  return {
    tasks: state.tasks.map((task) => ({ ...task })),
    blocks: state.blocks.map((block) => ({ ...block })),
    protectedWindows: state.protectedWindows.map((window) => ({ ...window })),
    timestamp: new Date().toISOString(),
    source,
    summary,
  }
}

function addDurationToTime(startTime: string, durationMinutes: number): string {
  const totalMinutes = toMinutes(startTime) + durationMinutes
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
