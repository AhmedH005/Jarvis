import type { CalendarBlock, ProtectedWindow, Task } from '@/store/planner'

export function sortBlocksChronologically<T extends Pick<CalendarBlock, 'date' | 'startTime'>>(blocks: T[]): T[] {
  return [...blocks].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.startTime.localeCompare(b.startTime)
  })
}

export function getTaskBlocks(taskId: string, blocks: CalendarBlock[]): CalendarBlock[] {
  return sortBlocksChronologically(blocks.filter((block) => block.linkedTaskId === taskId))
}

export function getTaskScheduledMinutes(taskId: string, blocks: CalendarBlock[]): number {
  return getTaskBlocks(taskId, blocks).reduce((total, block) => total + block.duration, 0)
}

export function syncTaskWithBlocks(task: Task, blocks: CalendarBlock[]): Task {
  const linkedBlocks = getTaskBlocks(task.id, blocks)
  const linkedCalendarBlockIds = linkedBlocks.map((block) => block.id)
  const scheduledMinutes = linkedBlocks.reduce((total, block) => total + block.duration, 0)
  const progress = task.durationMinutes > 0
    ? Math.max(0, Math.min(1, scheduledMinutes / task.durationMinutes))
    : 0

  return {
    ...task,
    scheduled: linkedCalendarBlockIds.length > 0,
    linkedCalendarBlockIds,
    linkedCalendarBlockId: linkedCalendarBlockIds[0],
    scheduledMinutes,
    schedulingProgress: progress,
  }
}

export function syncTasksWithBlocks(tasks: Task[], blocks: CalendarBlock[]): Task[] {
  return tasks.map((task) => syncTaskWithBlocks(task, blocks))
}

export function appendLinkedBlockId(task: Task, blockId: string): Task {
  const nextIds = task.linkedCalendarBlockIds.includes(blockId)
    ? task.linkedCalendarBlockIds
    : [...task.linkedCalendarBlockIds, blockId]

  return {
    ...task,
    linkedCalendarBlockIds: nextIds,
    linkedCalendarBlockId: nextIds[0],
    scheduled: nextIds.length > 0,
  }
}

export function removeLinkedBlockId(task: Task, blockId: string): Task {
  const nextIds = task.linkedCalendarBlockIds.filter((id) => id !== blockId)
  return {
    ...task,
    linkedCalendarBlockIds: nextIds,
    linkedCalendarBlockId: nextIds[0],
    scheduled: nextIds.length > 0,
  }
}

export function getProtectedWindowKey(window: Pick<ProtectedWindow, 'date' | 'startTime' | 'endTime'>): string {
  return `${window.date}:${window.startTime}:${window.endTime}`
}

export function protectedWindowMatchesBlock(window: ProtectedWindow, block: CalendarBlock): boolean {
  return block.protectedWindowId === window.id ||
    (
      block.date === window.date &&
      block.startTime === window.startTime &&
      block.duration === window.durationMinutes &&
      block.type === 'focus' &&
      block.isProtectedTime === true
    )
}
