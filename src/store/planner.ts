import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid, today, addDays } from '@/lib/dateUtils'
import type { PlanningAction, OptimizeDayResult, OptimizeWeekResult } from '@/features/planner/planningTypes'
import {
  stampActions,
  orderActionsForExecution,
  validateActions,
  computeNextState,
  runPostApplyValidation,
  captureSnapshot,
  type ExecutionResult,
  type ExecutionSnapshot,
  type ExecutionHistoryEntry,
  type ExecutionSource,
} from '@/features/planner/planningExecution'
import { syncTasksWithBlocks } from '@/features/planner/plannerStateUtils'

export type { ExecutionResult, ExecutionSnapshot, ExecutionHistoryEntry, ExecutionSource }

// ── Types ─────────────────────────────────────────────────────────────────────

// ── Intake action shapes (avoids circular import with plannerIntakeTypes.ts) ──

export interface IntakeEventData {
  title: string
  date: string        // YYYY-MM-DD
  startTime: string   // HH:MM
  durationMinutes?: number | null
  locked: boolean
  notes?: string
}

export interface IntakeTaskData {
  title: string
  dueDate?: string | null
  durationMinutes?: number | null
  priority?: 'low' | 'medium' | 'high' | null
  energyType?: 'light' | 'moderate' | 'deep' | null
  notes?: string
}

// ── Core types ────────────────────────────────────────────────────────────────

export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskStatus = 'todo' | 'in-progress' | 'done'
export type EnergyType = 'deep' | 'moderate' | 'light'
export type BlockType = 'event' | 'task-block' | 'focus' | 'break'

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: string                 // YYYY-MM-DD
  durationMinutes: number
  energyType: EnergyType
  scheduled: boolean
  completed: boolean
  tags: string[]
  project?: string
  recurrence?: string
  linkedCalendarBlockId?: string
  linkedCalendarBlockIds: string[]
  scheduledMinutes: number
  schedulingProgress: number
  splitAllowed: boolean            // can be broken into multiple sessions
  pinned: boolean                  // locked planning priority
  createdAt: string
  updatedAt: string
}

export type BlockSource = 'manual' | 'scheduler' | 'external'

export interface CalendarBlock {
  id: string
  title: string
  date: string             // YYYY-MM-DD
  startTime: string        // HH:MM
  duration: number         // minutes
  color: string
  type: BlockType
  locked: boolean          // cannot be moved by scheduler
  flexible: boolean        // can be auto-rescheduled
  recurring: boolean
  source: BlockSource
  linkedTaskId?: string
  chunkIndex?: number
  chunkCount?: number
  chunkDurationMinutes?: number
  schedulingGroupId?: string
  protectedWindowId?: string
  isProtectedTime?: boolean
  protectionSource?: 'manual' | 'ai'
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface ProtectedWindow {
  id: string
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  source: 'manual' | 'ai'
  locked: boolean
  blockId?: string
  rationale?: string
  createdAt: string
  updatedAt: string
}

// ── Re-export utilities so consumers can import from one place ─────────────────
export { uid, today, addDays } from '@/lib/dateUtils'

// ── Seed data ─────────────────────────────────────────────────────────────────

const t = today()

const NOW = new Date().toISOString()

function addMinsToTime(time: string, deltaMinutes: number): string {
  const [hours, minutes] = time.split(':').map(Number)
  const totalMinutes = (hours * 60) + minutes + deltaMinutes
  const nextHours = Math.floor(totalMinutes / 60)
  const nextMinutes = totalMinutes % 60
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`
}

function seedTask(
  fields: Omit<Task, 'splitAllowed' | 'pinned' | 'updatedAt' | 'linkedCalendarBlockIds' | 'scheduledMinutes' | 'schedulingProgress'> & {
    splitAllowed?: boolean
    pinned?: boolean
  },
): Task {
  return {
    splitAllowed: false,
    pinned: false,
    linkedCalendarBlockIds: [],
    scheduledMinutes: 0,
    schedulingProgress: 0,
    updatedAt: NOW,
    ...fields,
  }
}

const SEED_TASKS: Task[] = [
  seedTask({
    id: uid('task'),
    title: 'Review OpenClaw builder bridge logs',
    description: 'Check the latest builder execution history for errors and anomalies',
    status: 'in-progress', priority: 'high', dueDate: t,
    durationMinutes: 45, energyType: 'deep',
    scheduled: true, completed: false,
    tags: ['openclaw', 'debug'], project: 'Infrastructure', createdAt: NOW,
  }),
  seedTask({
    id: uid('task'),
    title: 'Design weekly automation pipeline',
    description: 'Define trigger conditions and action sequences for the daily summary cron',
    status: 'todo', priority: 'high', dueDate: t,
    durationMinutes: 90, energyType: 'deep',
    scheduled: false, completed: false,
    tags: ['automation', 'design'], project: 'Automations', createdAt: NOW,
  }),
  seedTask({
    id: uid('task'),
    title: 'Set up Concierge calendar sync',
    description: 'Connect Concierge to Google Calendar for two-way event sync',
    status: 'todo', priority: 'high', dueDate: addDays(t, -2),
    durationMinutes: 75, energyType: 'moderate',
    scheduled: false, completed: false,
    tags: ['calendar', 'integration'], project: 'Automations', createdAt: NOW,
  }),
  seedTask({
    id: uid('task'),
    title: 'Refactor agent-control adapter',
    description: 'Extract mission handoff logic into a dedicated module',
    status: 'todo', priority: 'medium', dueDate: addDays(t, 1),
    durationMinutes: 120, energyType: 'deep',
    scheduled: false, completed: false, splitAllowed: true,
    tags: ['refactor', 'agents'], project: 'Infrastructure', createdAt: NOW,
  }),
  seedTask({
    id: uid('task'),
    title: 'Write integration tests for multi-mission store',
    status: 'todo', priority: 'medium', dueDate: addDays(t, 2),
    durationMinutes: 60, energyType: 'moderate',
    scheduled: false, completed: false,
    tags: ['testing'], project: 'Infrastructure', createdAt: NOW,
  }),
  seedTask({
    id: uid('task'),
    title: 'Update nutrition & wellness preferences',
    description: 'Sync Concierge profile with latest dietary restrictions',
    status: 'todo', priority: 'low', dueDate: addDays(t, 3),
    durationMinutes: 15, energyType: 'light',
    scheduled: false, completed: false,
    tags: ['wellness', 'profile'], project: 'Personal', createdAt: NOW,
  }),
  seedTask({
    id: uid('task'),
    title: 'Document OpenClaw API endpoints',
    description: 'Write a concise reference doc for the local gateway routes',
    status: 'in-progress', priority: 'low',
    durationMinutes: 45, energyType: 'light',
    scheduled: false, completed: false,
    tags: ['docs', 'openclaw'], project: 'Infrastructure',
    recurrence: 'weekly', createdAt: NOW,
  }),
  seedTask({
    id: uid('task'),
    title: 'Review weekly analytics dashboard',
    description: 'Check KPIs and flag anything that needs immediate attention',
    status: 'done', priority: 'medium', dueDate: addDays(t, -1),
    durationMinutes: 30, energyType: 'moderate',
    scheduled: false, completed: true,
    tags: ['analytics'], project: 'Operations', createdAt: NOW,
  }),
]

// Link first task to a calendar block
const LINKED_BLOCK_ID = uid('block')
SEED_TASKS[0].linkedCalendarBlockId = LINKED_BLOCK_ID
SEED_TASKS[0].linkedCalendarBlockIds = [LINKED_BLOCK_ID]
SEED_TASKS[0].scheduledMinutes = SEED_TASKS[0].durationMinutes
SEED_TASKS[0].schedulingProgress = 1

function seedBlock(fields: Omit<CalendarBlock, 'flexible' | 'source' | 'createdAt' | 'updatedAt'> & { flexible?: boolean; source?: BlockSource }): CalendarBlock {
  return { flexible: false, source: 'manual', createdAt: NOW, updatedAt: NOW, ...fields }
}

const SEED_BLOCKS: CalendarBlock[] = [
  seedBlock({ id: LINKED_BLOCK_ID, title: 'Review builder bridge logs', date: t, startTime: '10:00', duration: 45, color: '#9d4edd', type: 'task-block', locked: false, recurring: false, flexible: true, source: 'scheduler', linkedTaskId: SEED_TASKS[0].id }),
  seedBlock({ id: uid('block'), title: 'Morning standup',         date: t,              startTime: '09:00', duration: 30,  color: '#00d4ff', type: 'event',      locked: true,  recurring: true  }),
  seedBlock({ id: uid('block'), title: 'Deep focus: architecture', date: t,              startTime: '11:00', duration: 90,  color: '#9d4edd', type: 'focus',      locked: false, recurring: false, flexible: true, notes: 'Review agent control flow and propose refactor' }),
  seedBlock({ id: uid('block'), title: 'Lunch',                   date: t,              startTime: '13:00', duration: 60,  color: '#ffc84a', type: 'break',      locked: false, recurring: true  }),
  seedBlock({ id: uid('block'), title: 'Team sync',               date: t,              startTime: '15:00', duration: 45,  color: '#00d4ff', type: 'event',      locked: true,  recurring: false }),
  seedBlock({ id: uid('block'), title: 'Design automation pipeline', date: addDays(t,1), startTime: '10:00', duration: 90,  color: '#00ff88', type: 'task-block', locked: false, recurring: false, flexible: true, source: 'scheduler' }),
  seedBlock({ id: uid('block'), title: 'Deep focus: refactor',    date: addDays(t, 1),  startTime: '13:30', duration: 120, color: '#9d4edd', type: 'focus',      locked: false, recurring: false, flexible: true, notes: 'agent-control adapter refactor' }),
  seedBlock({ id: uid('block'), title: 'Weekly planning',         date: addDays(t, 2),  startTime: '09:30', duration: 60,  color: '#ff6b35', type: 'event',      locked: true,  recurring: true  }),
  seedBlock({ id: uid('block'), title: 'Integration testing',     date: addDays(t, 2),  startTime: '14:00', duration: 60,  color: '#00ff88', type: 'focus',      locked: false, recurring: false, flexible: true }),
]

// ── Execution layer constants ─────────────────────────────────────────────────

/** Maximum number of execution history entries to keep in memory. */
const EXECUTION_HISTORY_MAX = 20

// ── Store ─────────────────────────────────────────────────────────────────────

interface PlannerState {
  tasks: Task[]
  blocks: CalendarBlock[]
  protectedWindows: ProtectedWindow[]

  // ── Execution safety state ────────────────────────────────────────────────
  /** Bounded in-memory history of completed planning execution passes. */
  executionHistory: ExecutionHistoryEntry[]
  /** Snapshot taken immediately before the most recent applyPlanningActions call.
   *  null when no undo is available (after undo consumed it, or not yet applied). */
  undoSnapshot: ExecutionSnapshot | null

  // ── Task actions ──────────────────────────────────────────────────────────
  addTask: (task: Task) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  togglePin: (id: string) => void

  // ── Block actions ─────────────────────────────────────────────────────────
  addBlock: (block: CalendarBlock) => void
  updateBlock: (id: string, patch: Partial<CalendarBlock>) => void
  deleteBlock: (id: string) => void
  toggleLock: (id: string) => void
  toggleFlexible: (id: string) => void

  /** Manual schedule: create linked block at exact date/time */
  scheduleTask: (taskId: string, date: string, startTime: string) => void
  /** Unschedule: remove linked block + clear task.scheduled */
  unscheduleTask: (taskId: string) => void
  /** Replace all blocks with a rebuilt set (from rebuildDay / rebuildWeek) */
  applyRebuiltBlocks: (blocks: CalendarBlock[]) => void
  addProtectedWindow: (window: Omit<ProtectedWindow, 'id' | 'createdAt' | 'updatedAt'>) => void
  removeProtectedWindow: (id: string) => void

  // ── Planning execution actions ────────────────────────────────────────────

  /**
   * Transactional apply of AI-suggested planning actions.
   *
   * Pipeline (all synchronous, single set() call):
   *   1. Stamp actions with stable execution IDs
   *   2. Order by dependency phase (defer → place → lock → info)
   *   3. Validate full batch against current state
   *   4. If no valid actions, return without mutation
   *   5. Capture pre-mutation snapshot for undo
   *   6. Compute next state (pure — no side effects)
   *   7. Run post-apply validation on proposed state
   *   8. If critical post-apply failure, discard and return error (no mutation)
   *   9. Atomically commit new state + snapshot + history entry
   *
   * @param actions   The PlanningAction array to apply (subset of result.actions is OK)
   * @param result    The OptimizeDayResult or OptimizeWeekResult that produced these actions
   *                  (used for candidate slot resolution)
   * @param opts      Source label, human-readable summary, optional confidence/plannerSource
   */
  applyPlanningActions: (
    actions: PlanningAction[],
    result: OptimizeDayResult | OptimizeWeekResult,
    opts: {
      source: ExecutionSource
      summary: string
      confidence?: number
      plannerSource?: 'ai' | 'fallback'
    },
  ) => ExecutionResult

  /**
   * Restore planner state to the snapshot captured before the last
   * applyPlanningActions call. Clears the snapshot after restoring.
   * No-op if undoSnapshot is null.
   */
  undoLastPlanningExecution: () => void

  /**
   * Remove a single entry from executionHistory by ID.
   * Useful for the UI's "dismiss" / "x" on history rows.
   */
  dismissPlanningHistoryEntry: (id: string) => void

  // ── Intake creation (safe, no planning-execution pipeline needed) ─────────

  /** Create a single locked calendar event from intake data. */
  createEventBlockFromIntake: (data: IntakeEventData) => void
  /** Create a single planner task from intake data. */
  createTaskFromIntake: (data: IntakeTaskData) => void
  /**
   * Batch-create events and tasks from intake in one atomic set() call.
   * Preserves task↔block consistency via syncTasksWithBlocks.
   */
  createManyFromIntake: (events: IntakeEventData[], tasks: IntakeTaskData[]) => void
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      tasks: syncTasksWithBlocks(SEED_TASKS, SEED_BLOCKS),
      blocks: SEED_BLOCKS,
      protectedWindows: [],

      // ── Execution safety initial state ────────────────────────────────────────────
      executionHistory: [],
      undoSnapshot: null,

      // ── Task actions ─────────────────────────────────────────────────────────────
      addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t) })),
      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      togglePin: (id) =>
    set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, pinned: !t.pinned, updatedAt: new Date().toISOString() } : t) })),

  // ── Block actions ─────────────────────────────────────────────────────────────
  addBlock: (block) => set((s) => {
    const blocks = [...s.blocks, block]
    return { blocks, tasks: syncTasksWithBlocks(s.tasks, blocks) }
  }),
  updateBlock: (id, patch) =>
    set((s) => {
      const now = new Date().toISOString()
      const blocks = s.blocks.map((b) => b.id === id ? { ...b, ...patch, updatedAt: now } : b)
      const updatedBlock = blocks.find((block) => block.id === id)
      const protectedWindows = updatedBlock?.protectedWindowId
        ? s.protectedWindows.map((window) => (
            window.id === updatedBlock.protectedWindowId
              ? {
                  ...window,
                  date: updatedBlock.date,
                  startTime: updatedBlock.startTime,
                  endTime: addMinsToTime(updatedBlock.startTime, updatedBlock.duration),
                  durationMinutes: updatedBlock.duration,
                  updatedAt: now,
                }
              : window
          ))
        : patch.protectedWindowId || patch.isProtectedTime === false
          ? s.protectedWindows.map((window) => window.blockId === id ? { ...window, updatedAt: now } : window)
          : s.protectedWindows
      return { blocks, tasks: syncTasksWithBlocks(s.tasks, blocks), protectedWindows }
    }),
  deleteBlock: (id) =>
    set((s) => {
      const blocks = s.blocks.filter((b) => b.id !== id)
      const protectedWindows = s.protectedWindows.filter((window) => window.blockId !== id)
      return { blocks, protectedWindows, tasks: syncTasksWithBlocks(s.tasks, blocks) }
    }),
  toggleLock: (id) =>
    set((s) => ({ blocks: s.blocks.map((b) => b.id === id ? { ...b, locked: !b.locked, updatedAt: new Date().toISOString() } : b) })),
  toggleFlexible: (id) =>
    set((s) => ({ blocks: s.blocks.map((b) => b.id === id ? { ...b, flexible: !b.flexible, updatedAt: new Date().toISOString() } : b) })),

  // ── Schedule (manual exact placement) ────────────────────────────────────────
  scheduleTask: (taskId, date, startTime) =>
    set((s) => {
      const task = s.tasks.find((t) => t.id === taskId)
      if (!task) return s
      // Remove any existing linked block first
      const cleanedBlocks = s.blocks.filter((b) => b.linkedTaskId !== taskId)
      const blockId = uid('block')
      const newBlock: CalendarBlock = {
        id: blockId, title: task.title, date, startTime,
        duration: task.durationMinutes,
        color: task.energyType === 'deep' ? '#9d4edd' : task.energyType === 'moderate' ? '#00d4ff' : '#00ff88',
        type: 'task-block', locked: false, flexible: true,
        source: 'manual', recurring: false,
        linkedTaskId: taskId,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }
      return {
        blocks: [...cleanedBlocks, newBlock],
        tasks: syncTasksWithBlocks(
          s.tasks.map((t) => t.id === taskId ? { ...t, updatedAt: new Date().toISOString() } : t),
          [...cleanedBlocks, newBlock],
        ),
      }
    }),

  // ── Unschedule ─────────────────────────────────────────────────────────────────
  unscheduleTask: (taskId) =>
    set((s) => {
      const blocks = s.blocks.filter((b) => b.linkedTaskId !== taskId)
      return {
        blocks,
        tasks: syncTasksWithBlocks(
          s.tasks.map((t) => t.id === taskId ? { ...t, updatedAt: new Date().toISOString() } : t),
          blocks,
        ),
      }
    }),

  // ── Apply rebuilt block set (from rebuildDay/rebuildWeek) ─────────────────────
  applyRebuiltBlocks: (blocks) => {
    set((s) => ({ blocks, tasks: syncTasksWithBlocks(s.tasks, blocks) }))
  },

  addProtectedWindow: (window) => set((s) => {
    const now = new Date().toISOString()
    const protectedWindowId = uid('protected')
    const blockId = uid('block')
    const block: CalendarBlock = {
      id: blockId,
      title: window.source === 'manual' ? 'Protected Focus' : 'AI Protected Focus',
      date: window.date,
      startTime: window.startTime,
      duration: window.durationMinutes,
      color: '#9d4edd',
      type: 'focus',
      locked: true,
      flexible: false,
      recurring: false,
      source: 'scheduler',
      protectedWindowId,
      isProtectedTime: true,
      protectionSource: window.source,
      notes: window.rationale,
      createdAt: now,
      updatedAt: now,
    }
    const protectedWindow: ProtectedWindow = {
      id: protectedWindowId,
      blockId,
      createdAt: now,
      updatedAt: now,
      ...window,
    }
    const blocks = [...s.blocks, block]
    return {
      blocks,
      protectedWindows: [...s.protectedWindows, protectedWindow],
      tasks: syncTasksWithBlocks(s.tasks, blocks),
    }
  }),

  removeProtectedWindow: (id) => set((s) => {
    const window = s.protectedWindows.find((entry) => entry.id === id)
    if (!window) return s
    const blocks = s.blocks.filter((block) => block.id !== window.blockId)
    return {
      blocks,
      protectedWindows: s.protectedWindows.filter((entry) => entry.id !== id),
      tasks: syncTasksWithBlocks(s.tasks, blocks),
    }
  }),

  // ── Planning execution ────────────────────────────────────────────────────────

  applyPlanningActions: (actions, result, opts) => {
    const { source, summary, confidence, plannerSource } = opts

    // Execution result is computed inside the set() callback (synchronous)
    // and captured here so the store action can return it.
    let executionResult!: ExecutionResult

    set((s) => {
      const currentState = { tasks: s.tasks, blocks: s.blocks, protectedWindows: s.protectedWindows }

      // 1. Stamp actions with stable IDs and pre-resolve candidate slots
      const stamped = stampActions(actions, result)

      // 2. Order by dependency phase
      const ordered = orderActionsForExecution(stamped)

      // 3. Validate the full batch — conservative policy: skip only invalid actions,
      //    but allow valid ones through even if some failed validation
      const validation = validateActions(ordered, currentState)

      if (validation.valid.length === 0) {
        executionResult = {
          success: false,
          appliedActionIds: [],
          failedActionIds: validation.invalid.map((sa) => sa.actionId),
          warnings: [
            ...validation.warnings,
            ...validation.issues.map((i) => i.reason),
          ],
          error: 'No valid actions after pre-flight validation — state unchanged',
          rollbackAvailable: false,
        }
        return s  // no mutation
      }

      // 4. Capture snapshot BEFORE any mutation (enables undo)
      const snapshot = captureSnapshot(currentState, source, summary)

      // 5. Compute next state as a pure transform
      const applyReport = computeNextState(validation.valid, currentState)

      // 6. Post-apply validation on the proposed new state
      const postIssues = runPostApplyValidation({
        tasks: applyReport.newTasks,
        blocks: applyReport.newBlocks,
        protectedWindows: applyReport.newProtectedWindows,
      })

      // 7. Critical post-apply failure → rollback (don't commit)
      if (postIssues.criticalFailure) {
        executionResult = {
          success: false,
          appliedActionIds: [],
          failedActionIds: [
            ...applyReport.appliedActionIds,
            ...applyReport.failedActionIds,
            ...validation.invalid.map((sa) => sa.actionId),
          ],
          warnings: [...applyReport.warnings, ...postIssues.warnings],
          error: 'Post-apply validation detected critical inconsistency — rolled back',
          rollbackAvailable: false,
        }
        return s  // no mutation
      }

      // 8. Build history entry
      const historyEntry: ExecutionHistoryEntry = {
        id: uid('hist'),
        timestamp: new Date().toISOString(),
        source,
        actionCount: applyReport.appliedActionIds.length,
        summary,
        confidence,
        plannerSource,
        undoAvailable: true,
      }

      // 9. Atomically commit: new state + snapshot + history
      executionResult = {
        success: true,
        appliedActionIds: applyReport.appliedActionIds,
        failedActionIds: [
          ...applyReport.failedActionIds,
          ...validation.invalid.map((sa) => sa.actionId),
        ],
        warnings: [
          ...applyReport.warnings,
          ...validation.warnings,
          ...postIssues.warnings,
        ],
        rollbackAvailable: true,
      }

      return {
        tasks: applyReport.newTasks,
        blocks: applyReport.newBlocks,
        protectedWindows: applyReport.newProtectedWindows,
        undoSnapshot: snapshot,
        executionHistory: [historyEntry, ...s.executionHistory].slice(0, EXECUTION_HISTORY_MAX),
      }
    })

    return executionResult
  },

  undoLastPlanningExecution: () => {
    set((s) => {
      if (!s.undoSnapshot) return s
      return {
        tasks: s.undoSnapshot.tasks,
        blocks: s.undoSnapshot.blocks,
        protectedWindows: s.undoSnapshot.protectedWindows,
        undoSnapshot: null,
        // Mark the most recent history entry as no longer undoable
        executionHistory: s.executionHistory.map((e, i) =>
          i === 0 ? { ...e, undoAvailable: false } : e,
        ),
      }
    })
  },

  dismissPlanningHistoryEntry: (id) => {
    set((s) => ({
      executionHistory: s.executionHistory.filter((e) => e.id !== id),
    }))
  },

  // ── Intake creation ───────────────────────────────────────────────────────

  createEventBlockFromIntake: (data) => {
    set((s) => {
      const now  = new Date().toISOString()
      const block: CalendarBlock = {
        id:         uid('block'),
        title:      data.title,
        date:       data.date,
        startTime:  data.startTime,
        duration:   data.durationMinutes ?? 60,
        color:      '#00d4ff',
        type:       'event',
        locked:     data.locked,
        flexible:   false,
        recurring:  false,
        source:     'manual',
        notes:      data.notes,
        createdAt:  now,
        updatedAt:  now,
      }
      const blocks = [...s.blocks, block]
      return { blocks, tasks: syncTasksWithBlocks(s.tasks, blocks) }
    })
  },

  createTaskFromIntake: (data) => {
    set((s) => {
      const now  = new Date().toISOString()
      const task: Task = {
        id:                     uid('task'),
        title:                  data.title,
        description:            data.notes,
        status:                 'todo',
        priority:               (data.priority ?? 'medium') as TaskPriority,
        dueDate:                data.dueDate ?? undefined,
        durationMinutes:        data.durationMinutes ?? 60,
        energyType:             (data.energyType ?? 'moderate') as EnergyType,
        scheduled:              false,
        completed:              false,
        tags:                   [],
        linkedCalendarBlockIds: [],
        scheduledMinutes:       0,
        schedulingProgress:     0,
        splitAllowed:           false,
        pinned:                 false,
        createdAt:              now,
        updatedAt:              now,
      }
      return { tasks: syncTasksWithBlocks([task, ...s.tasks], s.blocks) }
    })
  },

      createManyFromIntake: (events, intakeTasks) => {
        set((s) => {
          const now = new Date().toISOString()

          const newBlocks: CalendarBlock[] = events.map((e) => ({
            id:         uid('block'),
            title:      e.title,
            date:       e.date,
            startTime:  e.startTime,
            duration:   e.durationMinutes ?? 60,
            color:      '#00d4ff',
            type:       'event' as BlockType,
            locked:     e.locked,
            flexible:   false,
            recurring:  false,
            source:     'manual' as BlockSource,
            notes:      e.notes,
            createdAt:  now,
            updatedAt:  now,
          }))

          const newTasks: Task[] = intakeTasks.map((t) => ({
            id:                     uid('task'),
            title:                  t.title,
            description:            t.notes,
            status:                 'todo' as TaskStatus,
            priority:               (t.priority ?? 'medium') as TaskPriority,
            dueDate:                t.dueDate ?? undefined,
            durationMinutes:        t.durationMinutes ?? 60,
            energyType:             (t.energyType ?? 'moderate') as EnergyType,
            scheduled:              false,
            completed:              false,
            tags:                   [],
            linkedCalendarBlockIds: [],
            scheduledMinutes:       0,
            schedulingProgress:     0,
            splitAllowed:           false,
            pinned:                 false,
            createdAt:              now,
            updatedAt:              now,
          }))

          const allBlocks = [...s.blocks, ...newBlocks]
          const allTasks  = syncTasksWithBlocks([...newTasks, ...s.tasks], allBlocks)
          return { blocks: allBlocks, tasks: allTasks }
        })
      },
    }),
    {
      name: 'jarvis-planner-v1',
      partialize: (state) => ({
        tasks: state.tasks,
        blocks: state.blocks,
        protectedWindows: state.protectedWindows,
      }),
      merge: (persisted, current) => {
        const stored = (persisted as Partial<Pick<PlannerState, 'tasks' | 'blocks' | 'protectedWindows'>>) ?? {}
        const blocks = stored.blocks ?? current.blocks
        const tasks = syncTasksWithBlocks(stored.tasks ?? current.tasks, blocks)

        return {
          ...current,
          tasks,
          blocks,
          protectedWindows: stored.protectedWindows ?? current.protectedWindows,
        }
      },
    },
  ),
)
