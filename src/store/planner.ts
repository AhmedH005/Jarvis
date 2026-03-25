import { create } from 'zustand'
import { uid, today, addDays } from '@/lib/dateUtils'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  notes?: string
  createdAt: string
  updatedAt: string
}

// ── Re-export utilities so consumers can import from one place ─────────────────
export { uid, today, addDays } from '@/lib/dateUtils'

// ── Seed data ─────────────────────────────────────────────────────────────────

const t = today()

const NOW = new Date().toISOString()

function seedTask(fields: Omit<Task, 'splitAllowed' | 'pinned' | 'updatedAt'> & { splitAllowed?: boolean; pinned?: boolean }): Task {
  return { splitAllowed: false, pinned: false, updatedAt: NOW, ...fields }
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

// ── Store ─────────────────────────────────────────────────────────────────────

interface PlannerState {
  tasks: Task[]
  blocks: CalendarBlock[]

  addTask: (task: Task) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  togglePin: (id: string) => void

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
}

export const usePlannerStore = create<PlannerState>((set) => ({
  tasks: SEED_TASKS,
  blocks: SEED_BLOCKS,

  // ── Task actions ─────────────────────────────────────────────────────────────
  addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),
  updateTask: (id, patch) =>
    set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t) })),
  deleteTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  togglePin: (id) =>
    set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, pinned: !t.pinned, updatedAt: new Date().toISOString() } : t) })),

  // ── Block actions ─────────────────────────────────────────────────────────────
  addBlock: (block) => set((s) => ({ blocks: [...s.blocks, block] })),
  updateBlock: (id, patch) =>
    set((s) => ({ blocks: s.blocks.map((b) => b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b) })),
  deleteBlock: (id) =>
    set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) })),
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
        tasks: s.tasks.map((t) => t.id === taskId ? { ...t, scheduled: true, linkedCalendarBlockId: blockId, updatedAt: new Date().toISOString() } : t),
      }
    }),

  // ── Unschedule ─────────────────────────────────────────────────────────────────
  unscheduleTask: (taskId) =>
    set((s) => ({
      blocks: s.blocks.filter((b) => b.linkedTaskId !== taskId),
      tasks: s.tasks.map((t) => t.id === taskId ? { ...t, scheduled: false, linkedCalendarBlockId: undefined, updatedAt: new Date().toISOString() } : t),
    })),

  // ── Apply rebuilt block set (from rebuildDay/rebuildWeek) ─────────────────────
  applyRebuiltBlocks: (blocks) => {
    // Sync scheduled state on tasks based on new block set
    set((s) => {
      const linkedTaskIds = new Set(blocks.map((b) => b.linkedTaskId).filter(Boolean) as string[])
      const updatedTasks = s.tasks.map((t) => {
        const stillLinked = linkedTaskIds.has(t.id)
        if (t.scheduled && !stillLinked) {
          return { ...t, scheduled: false, linkedCalendarBlockId: undefined, updatedAt: new Date().toISOString() }
        }
        return t
      })
      return { blocks, tasks: updatedTasks }
    })
  },
}))
