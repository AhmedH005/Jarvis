/**
 * Scheduler Service — deterministic, rule-based scheduling logic.
 * Pure functions. No store or UI dependency.
 * This is product code, not AI code.
 */

import type { Task, CalendarBlock, EnergyType } from '@/store/planner'
import { uid, today, addDays } from '@/lib/dateUtils'

// ── Internal types ─────────────────────────────────────────────────────────────

type Minutes = number // minutes from midnight

interface BlockInterval {
  id: string
  start: Minutes
  end: Minutes
  locked: boolean
  flexible: boolean
}

// ── Public types ───────────────────────────────────────────────────────────────

export interface SchedulerConstraints {
  workdayStart: Minutes     // default 480  (08:00)
  workdayEnd: Minutes       // default 1080 (18:00)
  deepWindows: Array<{ start: Minutes; end: Minutes }>
  moderateWindows: Array<{ start: Minutes; end: Minutes }>
}

export const DEFAULT_CONSTRAINTS: SchedulerConstraints = {
  workdayStart: 480,
  workdayEnd: 1080,
  deepWindows:     [{ start: 540, end: 720 }],   // 09:00–12:00
  moderateWindows: [{ start: 810, end: 960 }],   // 13:30–16:00
}

export interface TimeSlot {
  date: string
  startTime: string   // HH:MM
  endTime: string     // HH:MM
  durationMinutes: number
}

export interface ConflictInfo {
  blockAId: string
  blockBId: string
  blockATitle: string
  blockBTitle: string
  date: string
  overlapMinutes: number
}

export interface SchedulerResult<T = undefined> {
  success: boolean
  reason: string
  data?: T
  warnings: string[]
  overloadFlag: boolean
}

export interface SuggestResult {
  success: boolean
  date: string
  startTime: string
  endTime: string
  reason: string
  alternates: Array<{ date: string; startTime: string; endTime: string }>
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
}

export interface ValidationIssue {
  type: 'conflict' | 'overdue-unscheduled' | 'overload' | 'no-slot'
  taskId?: string
  blockAId?: string
  blockBId?: string
  date?: string
  message: string
  severity: 'error' | 'warning'
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  summary: string
}

// ── Time utilities ─────────────────────────────────────────────────────────────

function toMinutes(time: string): Minutes {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function toTimeStr(minutes: Minutes): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function addMinsToTime(time: string, delta: Minutes): string {
  return toTimeStr(toMinutes(time) + delta)
}

function blocksToIntervals(blocks: CalendarBlock[], date: string): BlockInterval[] {
  return blocks
    .filter((b) => b.date === date)
    .map((b) => ({
      id: b.id,
      start: toMinutes(b.startTime),
      end: toMinutes(b.startTime) + b.duration,
      locked: b.locked,
      flexible: b.flexible ?? false,
    }))
    .sort((a, b) => a.start - b.start)
}

// ── getAvailableSlots ──────────────────────────────────────────────────────────
// Find contiguous gaps in the workday that fit the requested duration.

export function getAvailableSlots(
  blocks: CalendarBlock[],
  date: string,
  durationNeeded: Minutes,
  constraints: SchedulerConstraints = DEFAULT_CONSTRAINTS,
): TimeSlot[] {
  const intervals = blocksToIntervals(blocks, date)
  const slots: TimeSlot[] = []
  let cursor = constraints.workdayStart

  for (const interval of intervals) {
    const gapEnd = interval.start
    if (gapEnd - cursor >= durationNeeded) {
      slots.push({
        date,
        startTime: toTimeStr(cursor),
        endTime: toTimeStr(cursor + durationNeeded),
        durationMinutes: durationNeeded,
      })
    }
    cursor = Math.max(cursor, interval.end)
  }

  // Trailing gap to end of workday
  if (constraints.workdayEnd - cursor >= durationNeeded) {
    slots.push({
      date,
      startTime: toTimeStr(cursor),
      endTime: toTimeStr(cursor + durationNeeded),
      durationMinutes: durationNeeded,
    })
  }

  return slots
}

// ── detectConflicts ────────────────────────────────────────────────────────────
// Find all pairs of overlapping blocks on the same day.

export function detectConflicts(blocks: CalendarBlock[]): ConflictInfo[] {
  const byDate = new Map<string, CalendarBlock[]>()
  for (const b of blocks) {
    const list = byDate.get(b.date) ?? []
    list.push(b)
    byDate.set(b.date, list)
  }

  const conflicts: ConflictInfo[] = []
  for (const [date, dayBlocks] of byDate) {
    const sorted = [...dayBlocks].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]
        const b = sorted[j]
        const aStart = toMinutes(a.startTime)
        const aEnd = aStart + a.duration
        const bStart = toMinutes(b.startTime)
        const bEnd = bStart + b.duration
        const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart)
        if (overlap > 0) {
          conflicts.push({
            blockAId: a.id,
            blockBId: b.id,
            blockATitle: a.title,
            blockBTitle: b.title,
            date,
            overlapMinutes: overlap,
          })
        }
      }
    }
  }
  return conflicts
}

// ── suggestPlacement ───────────────────────────────────────────────────────────
// Find the best time slot for a task given energy type preferences.
// Looks forward up to 7 days, respecting due date urgency.

export function suggestPlacement(
  task: Pick<Task, 'durationMinutes' | 'energyType' | 'dueDate' | 'priority'>,
  existingBlocks: CalendarBlock[],
  constraints: SchedulerConstraints = DEFAULT_CONSTRAINTS,
  searchDays = 7,
): SuggestResult {
  const td = today()
  const maxDate = task.dueDate && task.dueDate >= td ? task.dueDate : addDays(td, searchDays - 1)

  const windows =
    task.energyType === 'deep' ? constraints.deepWindows :
    task.energyType === 'moderate' ? constraints.moderateWindows :
    null // light = any time

  const alternates: SuggestResult['alternates'] = []
  let best: (SuggestResult & { _score: number }) | null = null

  let d = td
  while (d <= maxDate) {
    const slots = getAvailableSlots(existingBlocks, d, task.durationMinutes, constraints)

    for (const slot of slots) {
      const slotStart = toMinutes(slot.startTime)
      const slotEnd = slotStart + task.durationMinutes

      // Score: prefer preferred windows, earlier dates, earlier in day
      let score = 0
      const daysFromNow = Math.max(0, (new Date(d + 'T12:00:00').getTime() - new Date(td + 'T12:00:00').getTime()) / 86400000)
      score -= daysFromNow * 100  // earlier date = better
      score -= slotStart / 60     // earlier in day = better

      // Bonus for fitting in the preferred energy window
      if (windows) {
        const inWindow = windows.some((w) => slotStart >= w.start && slotEnd <= w.end)
        const partialWindow = windows.some((w) => slotStart < w.end && slotEnd > w.start)
        if (inWindow) score += 500
        else if (partialWindow) score += 200
      }

      const candidate = {
        success: true as const,
        date: d,
        startTime: slot.startTime,
        endTime: slot.endTime,
        reason: '',
        alternates: [],
        confidence: 'high' as const,
        warnings: [],
        _score: score,
      }

      if (!best || score > best._score) {
        if (best) alternates.push({ date: best.date, startTime: best.startTime, endTime: best.endTime })
        best = candidate
      } else if (alternates.length < 2) {
        alternates.push({ date: d, startTime: slot.startTime, endTime: slot.endTime })
      }
    }

    d = addDays(d, 1)
  }

  if (!best) {
    return {
      success: false,
      date: td,
      startTime: toTimeStr(constraints.workdayStart),
      endTime: toTimeStr(constraints.workdayStart + task.durationMinutes),
      reason: 'No available slot found in the next ' + searchDays + ' days. Consider rescheduling or reducing duration.',
      alternates: [],
      confidence: 'low',
      warnings: ['Schedule may be overloaded. Consider reducing task load.'],
    }
  }

  const windowLabel =
    task.energyType === 'deep' ? 'deep-focus window (09:00–12:00)' :
    task.energyType === 'moderate' ? 'moderate-focus window (13:30–16:00)' :
    'available light-work slot'

  const daysAway = Math.round((new Date(best.date + 'T12:00:00').getTime() - new Date(td + 'T12:00:00').getTime()) / 86400000)
  const dayLabel = daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`

  const inPreferred = windows?.some((w) => {
    const s = toMinutes(best!.startTime)
    const e = s + task.durationMinutes
    return s >= w.start && e <= w.end
  }) ?? true

  const confidence: SuggestResult['confidence'] = inPreferred ? 'high' : 'medium'
  const reason = inPreferred
    ? `Best slot ${dayLabel} at ${best.startTime} — fits the ${windowLabel}.`
    : `Placed ${dayLabel} at ${best.startTime}. No ${windowLabel} was free; consider rescheduling lower-priority blocks.`

  const warnings: string[] = []
  if (task.dueDate && best.date > task.dueDate) {
    warnings.push(`No slot before due date (${task.dueDate}). Earliest available is ${best.date}.`)
  }

  return { success: true, date: best.date, startTime: best.startTime, endTime: best.endTime, reason, alternates, confidence, warnings }
}

// ── scheduleTask ───────────────────────────────────────────────────────────────
// Create a CalendarBlock for a task using the best available slot.

export function scheduleTask(
  task: Task,
  existingBlocks: CalendarBlock[],
  constraints: SchedulerConstraints = DEFAULT_CONSTRAINTS,
): SchedulerResult<CalendarBlock> {
  const suggestion = suggestPlacement(task, existingBlocks, constraints)

  if (!suggestion.success) {
    return { success: false, reason: suggestion.reason, warnings: suggestion.warnings, overloadFlag: true }
  }

  const colorMap: Record<string, string> = { deep: '#9d4edd', moderate: '#00d4ff', light: '#00ff88' }
  const block: CalendarBlock = {
    id: uid('block'),
    title: task.title,
    date: suggestion.date,
    startTime: suggestion.startTime,
    duration: task.durationMinutes,
    color: colorMap[task.energyType] ?? '#00d4ff',
    type: 'task-block',
    locked: false,
    flexible: true,
    recurring: false,
    source: 'scheduler',
    linkedTaskId: task.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return {
    success: true,
    reason: suggestion.reason,
    data: block,
    warnings: suggestion.warnings,
    overloadFlag: suggestion.confidence === 'low',
  }
}

// ── unscheduleTask ─────────────────────────────────────────────────────────────
// Remove the block linked to a task and return the updated blocks list.

export function unscheduleTask(
  taskId: string,
  blocks: CalendarBlock[],
): { updatedBlocks: CalendarBlock[]; unlinkedBlockId: string | null } {
  const linked = blocks.find((b) => b.linkedTaskId === taskId)
  return {
    updatedBlocks: blocks.filter((b) => b.linkedTaskId !== taskId),
    unlinkedBlockId: linked?.id ?? null,
  }
}

// ── moveBlock ──────────────────────────────────────────────────────────────────
// Move a block to a new date/time, checking for conflicts.

export function moveBlock(
  blockId: string,
  newDate: string,
  newStartTime: string,
  blocks: CalendarBlock[],
): SchedulerResult<CalendarBlock> {
  const block = blocks.find((b) => b.id === blockId)
  if (!block) return { success: false, reason: 'Block not found', warnings: [], overloadFlag: false }
  if (block.locked) return { success: false, reason: 'Block is locked and cannot be moved.', warnings: [], overloadFlag: false }

  const newEnd = toMinutes(newStartTime) + block.duration
  const dayIntervals = blocksToIntervals(blocks.filter((b) => b.id !== blockId), newDate)
  const newStart = toMinutes(newStartTime)

  const overlaps = dayIntervals.filter((i) => newStart < i.end && newEnd > i.start)
  const warnings: string[] = overlaps.map((i) => `Overlaps with existing block (${i.id})`)

  const updated: CalendarBlock = { ...block, date: newDate, startTime: newStartTime, updatedAt: new Date().toISOString() }
  return { success: true, reason: `Moved to ${newDate} at ${newStartTime}.`, data: updated, warnings, overloadFlag: overlaps.length > 0 }
}

// ── resizeBlock ────────────────────────────────────────────────────────────────
// Extend or shrink a block's duration, checking for forward conflicts.

export function resizeBlock(
  blockId: string,
  newDurationMinutes: number,
  blocks: CalendarBlock[],
): SchedulerResult<CalendarBlock> {
  const block = blocks.find((b) => b.id === blockId)
  if (!block) return { success: false, reason: 'Block not found', warnings: [], overloadFlag: false }

  const newEnd = toMinutes(block.startTime) + newDurationMinutes
  const newStart = toMinutes(block.startTime)
  const dayIntervals = blocksToIntervals(blocks.filter((b) => b.id !== blockId), block.date)
  const overlaps = dayIntervals.filter((i) => newStart < i.end && newEnd > i.start)
  const warnings = overlaps.map((i) => `Resized block overlaps with ${i.id}`)

  const updated: CalendarBlock = { ...block, duration: newDurationMinutes, updatedAt: new Date().toISOString() }
  return { success: true, reason: `Resized to ${newDurationMinutes}m.`, data: updated, warnings, overloadFlag: overlaps.length > 0 }
}

// ── lockBlock ──────────────────────────────────────────────────────────────────
// Toggle the lock state of a block.

export function lockBlock(blockId: string, locked: boolean, blocks: CalendarBlock[]): CalendarBlock[] {
  return blocks.map((b) =>
    b.id === blockId ? { ...b, locked, updatedAt: new Date().toISOString() } : b,
  )
}

// ── validateSchedule ───────────────────────────────────────────────────────────
// Full schedule validation: conflicts, overdue unscheduled tasks, overloaded days.

export function validateSchedule(tasks: Task[], blocks: CalendarBlock[]): ValidationResult {
  const issues: ValidationIssue[] = []
  const td = today()

  // 1. Conflicts
  const conflicts = detectConflicts(blocks)
  for (const c of conflicts) {
    issues.push({
      type: 'conflict',
      blockAId: c.blockAId,
      blockBId: c.blockBId,
      date: c.date,
      message: `Conflict on ${c.date}: "${c.blockATitle}" overlaps "${c.blockBTitle}" by ${c.overlapMinutes}m`,
      severity: 'error',
    })
  }

  // 2. Overdue unscheduled high/medium priority tasks
  for (const t of tasks) {
    if (!t.completed && !t.scheduled && t.dueDate && t.dueDate < td && (t.priority === 'high' || t.priority === 'medium')) {
      issues.push({
        type: 'overdue-unscheduled',
        taskId: t.id,
        message: `"${t.title}" is overdue (${t.dueDate}) and unscheduled`,
        severity: t.priority === 'high' ? 'error' : 'warning',
      })
    }
  }

  // 3. Overloaded days (> workday hours scheduled)
  const byDate = new Map<string, number>()
  for (const b of blocks) {
    byDate.set(b.date, (byDate.get(b.date) ?? 0) + b.duration)
  }
  for (const [date, totalMins] of byDate) {
    if (totalMins > 600) { // > 10 hours
      issues.push({
        type: 'overload',
        date,
        message: `${date} has ${Math.round(totalMins / 60 * 10) / 10}h scheduled — likely overloaded`,
        severity: 'warning',
      })
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warnCount = issues.filter((i) => i.severity === 'warning').length
  const summary =
    issues.length === 0 ? 'Schedule looks clean.'
    : `${errorCount > 0 ? errorCount + ' error(s), ' : ''}${warnCount > 0 ? warnCount + ' warning(s)' : ''} found.`

  return { valid: errorCount === 0, issues, summary }
}

// ── rebuildDay ─────────────────────────────────────────────────────────────────
// Reschedule all flexible (non-locked) blocks on a day by priority order.
// Locked blocks stay put. Flexible task-blocks get re-slotted around them.

export function rebuildDay(
  date: string,
  tasks: Task[],
  blocks: CalendarBlock[],
  constraints: SchedulerConstraints = DEFAULT_CONSTRAINTS,
): SchedulerResult<CalendarBlock[]> {
  const lockedOnDay = blocks.filter((b) => b.date === date && b.locked)
  const flexibleOnDay = blocks.filter((b) => b.date === date && !b.locked)

  // Tasks that either have a flex block today or are unscheduled with due <= date
  const tasksToPlace = flexibleOnDay
    .filter((b) => b.linkedTaskId)
    .map((b) => tasks.find((t) => t.id === b.linkedTaskId))
    .filter((t): t is Task => !!t)

  // Also add unscheduled tasks due on or before this date
  const td = today()
  for (const t of tasks) {
    if (!t.completed && !t.scheduled && t.dueDate && t.dueDate <= date && !tasksToPlace.find((x) => x.id === t.id)) {
      tasksToPlace.push(t)
    }
  }

  // Sort by priority, then by due date
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  tasksToPlace.sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (pd !== 0) return pd
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
  })

  // Working set: start with locked blocks, greedily add each task
  let workingBlocks: CalendarBlock[] = [...blocks.filter((b) => b.date !== date), ...lockedOnDay]
  const newDayBlocks: CalendarBlock[] = [...lockedOnDay]
  const warnings: string[] = []

  for (const task of tasksToPlace) {
    const slots = getAvailableSlots(workingBlocks, date, task.durationMinutes, constraints)
    if (slots.length === 0) {
      warnings.push(`Could not place "${task.title}" — no available slot on ${date}`)
      continue
    }

    // Prefer energy-appropriate slot
    const preferred = pickPreferredSlot(slots, task.energyType, constraints)
    const block: CalendarBlock = {
      id: uid('block'),
      title: task.title,
      date,
      startTime: preferred.startTime,
      duration: task.durationMinutes,
      color: { deep: '#9d4edd', moderate: '#00d4ff', light: '#00ff88' }[task.energyType] ?? '#00d4ff',
      type: 'task-block',
      locked: false,
      flexible: true,
      recurring: false,
      source: 'scheduler',
      linkedTaskId: task.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    workingBlocks = [...workingBlocks, block]
    newDayBlocks.push(block)
  }

  const finalBlocks = [...blocks.filter((b) => b.date !== date), ...newDayBlocks]
  const overload = newDayBlocks.reduce((s, b) => s + b.duration, 0) > 600

  return {
    success: true,
    reason: `Rebuilt ${date}: placed ${newDayBlocks.length - lockedOnDay.length} task(s) around ${lockedOnDay.length} locked block(s).`,
    data: finalBlocks,
    warnings,
    overloadFlag: overload,
  }
}

// ── rebuildWeek ────────────────────────────────────────────────────────────────
// Apply rebuildDay across a 7-day window starting at weekStart.

export function rebuildWeek(
  weekStart: string,
  tasks: Task[],
  blocks: CalendarBlock[],
  constraints: SchedulerConstraints = DEFAULT_CONSTRAINTS,
): SchedulerResult<CalendarBlock[]> {
  let current = blocks
  const warnings: string[] = []

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    const result = rebuildDay(date, tasks, current, constraints)
    if (result.data) current = result.data
    warnings.push(...result.warnings)
  }

  return { success: true, reason: `Rebuilt week starting ${weekStart}.`, data: current, warnings, overloadFlag: warnings.length > 0 }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pickPreferredSlot(
  slots: TimeSlot[],
  energyType: EnergyType,
  constraints: SchedulerConstraints,
): TimeSlot {
  const windows =
    energyType === 'deep' ? constraints.deepWindows :
    energyType === 'moderate' ? constraints.moderateWindows :
    null

  if (windows) {
    const inWindow = slots.find((s) => {
      const start = toMinutes(s.startTime)
      const end = start + s.durationMinutes
      return windows.some((w) => start >= w.start && end <= w.end)
    })
    if (inWindow) return inWindow
  }

  return slots[0] // fallback: earliest available
}

// ── Workload summary ───────────────────────────────────────────────────────────
// Compute a per-day workload summary for a date range.

export interface DayWorkload {
  date: string
  totalMinutes: number
  lockedMinutes: number
  flexibleMinutes: number
  blockedSlots: number
  freeMinutes: number
  overloaded: boolean
}

export function getWorkloadSummary(
  blocks: CalendarBlock[],
  startDate: string,
  endDate: string,
  constraints: SchedulerConstraints = DEFAULT_CONSTRAINTS,
): DayWorkload[] {
  const result: DayWorkload[] = []
  let d = startDate
  while (d <= endDate) {
    const dayBlocks = blocks.filter((b) => b.date === d)
    const totalMins = dayBlocks.reduce((s, b) => s + b.duration, 0)
    const lockedMins = dayBlocks.filter((b) => b.locked).reduce((s, b) => s + b.duration, 0)
    const flexMins = totalMins - lockedMins
    const workdayLen = constraints.workdayEnd - constraints.workdayStart
    result.push({
      date: d,
      totalMinutes: totalMins,
      lockedMinutes: lockedMins,
      flexibleMinutes: flexMins,
      blockedSlots: dayBlocks.length,
      freeMinutes: Math.max(0, workdayLen - totalMins),
      overloaded: totalMins > workdayLen,
    })
    d = addDays(d, 1)
  }
  return result
}

export { addMinsToTime, toMinutes, toTimeStr }
