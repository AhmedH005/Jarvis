import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Clock,
  Copy,
  Hash,
  LayoutGrid,
  List,
  ListOrdered,
  Loader2,
  Lock,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  usePlannerStore,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type EnergyType,
  uid,
  today,
} from '@/store/planner'
import { suggestPlacement } from '@/features/scheduler/schedulerService'
import { generatePlannerSummary, summaryToSignals, type PlannerSignal } from '@/features/planner/planningOrchestrator'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: '#ff6b35',
  medium: '#ffc84a',
  low: '#4a7a8a',
}

const ENERGY_COLOR: Record<EnergyType, string> = {
  deep: '#9d4edd',
  moderate: '#00d4ff',
  light: '#00ff88',
}

const ENERGY_LABEL: Record<EnergyType, string> = {
  deep: 'DEEP',
  moderate: 'MOD',
  light: 'LIGHT',
}

const SORT_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'due', label: 'Due Date' },
  { value: 'duration', label: 'Duration' },
  { value: 'energy', label: 'Energy' },
] as const
type SortKey = (typeof SORT_OPTIONS)[number]['value']

type FilterKey = 'all' | 'today' | 'upcoming' | 'overdue' | 'scheduled' | 'unscheduled' | 'completed'
type ViewMode = 'list' | 'board' | 'queue'

// ── Filter helpers ────────────────────────────────────────────────────────────

function matchesFilter(task: Task, filter: FilterKey): boolean {
  const td = today()
  switch (filter) {
    case 'all':         return true
    case 'today':       return task.dueDate === td && !task.completed
    case 'upcoming':    return !!task.dueDate && task.dueDate > td && !task.completed
    case 'overdue':     return !!task.dueDate && task.dueDate < td && !task.completed
    case 'scheduled':   return task.scheduled && !task.completed
    case 'unscheduled': return !task.scheduled && !task.completed
    case 'completed':   return task.completed
  }
}

function sortTasks(tasks: Task[], key: SortKey): Task[] {
  const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }
  const energyOrder: Record<EnergyType, number> = { deep: 0, moderate: 1, light: 2 }
  return [...tasks].sort((a, b) => {
    switch (key) {
      case 'priority': return priorityOrder[a.priority] - priorityOrder[b.priority]
      case 'due': {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      }
      case 'duration': return b.durationMinutes - a.durationMinutes
      case 'energy':   return energyOrder[a.energyType] - energyOrder[b.energyType]
      default:         return 0
    }
  })
}

// ── PriorityDot ───────────────────────────────────────────────────────────────

function PriorityDot({ priority, size = 8 }: { priority: TaskPriority; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: PRIORITY_COLOR[priority],
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: `0 0 4px ${PRIORITY_COLOR[priority]}88`,
      }}
    />
  )
}

// ── EnergyBadge ───────────────────────────────────────────────────────────────

function EnergyBadge({ energy }: { energy: EnergyType }) {
  return (
    <span
      className="text-[8px] font-mono px-1.5 py-0.5 rounded"
      style={{
        color: ENERGY_COLOR[energy],
        background: `${ENERGY_COLOR[energy]}18`,
        border: `1px solid ${ENERGY_COLOR[energy]}33`,
      }}
    >
      {ENERGY_LABEL[energy]}
    </span>
  )
}

// ── ScheduledBadge ────────────────────────────────────────────────────────────

function ScheduledBadge() {
  return (
    <span
      className="text-[8px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5"
      style={{
        color: '#00d4ff',
        background: 'rgba(0,212,255,0.1)',
        border: '1px solid rgba(0,212,255,0.25)',
      }}
    >
      <Lock className="w-2 h-2" />
      SCHED
    </span>
  )
}

// ── DueDateChip ───────────────────────────────────────────────────────────────

function DueDateChip({ dueDate, completed }: { dueDate: string; completed: boolean }) {
  const td = today()
  const isOverdue = !completed && dueDate < td
  const isToday = dueDate === td
  const color = isOverdue ? '#ff6b35' : isToday ? '#ffc84a' : 'rgba(74,122,138,0.7)'
  return (
    <span
      className="text-[8px] font-mono px-1.5 py-0.5 rounded"
      style={{
        color,
        background: isOverdue ? 'rgba(255,107,53,0.08)' : 'transparent',
        border: isOverdue ? '1px solid rgba(255,107,53,0.2)' : '1px solid transparent',
      }}
    >
      {dueDate}
    </span>
  )
}

// ── TaskRow (list view) ───────────────────────────────────────────────────────

function TaskRow({
  task,
  selected,
  compact = false,
  onSelect,
  onComplete,
  onSchedule,
  onUnschedule,
  onPin,
  onDelete,
  onDuplicate,
}: {
  task: Task
  selected: boolean
  compact?: boolean
  onSelect: () => void
  onComplete: () => void
  onSchedule: () => void
  onUnschedule: () => void
  onPin: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const isDone = task.completed
  const td = today()
  const isOverdue = !isDone && !!task.dueDate && task.dueDate < td

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      onClick={onSelect}
      className={`flex items-start gap-2.5 rounded-md ${compact ? 'px-2.5 py-1' : 'px-3 py-2'} group cursor-pointer`}
      style={{
        background: selected ? 'rgba(0,212,255,0.06)' : task.pinned ? 'rgba(255,196,74,0.03)' : 'rgba(255,255,255,0.025)',
        border: selected
          ? '1px solid rgba(0,212,255,0.3)'
          : task.pinned
          ? '1px solid rgba(255,196,74,0.2)'
          : isOverdue
          ? '1px solid rgba(255,107,53,0.2)'
          : '1px solid rgba(0,212,255,0.08)',
        borderLeft: selected ? '3px solid #00d4ff' : task.pinned ? '3px solid #ffc84a' : isOverdue ? '3px solid rgba(255,107,53,0.5)' : '3px solid transparent',
        opacity: isDone ? 0.45 : 1,
      }}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onComplete() }}
        className="mt-0.5 flex-shrink-0"
      >
        {isDone ? (
          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
        ) : task.status === 'in-progress' ? (
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}>
            <Loader2 className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
          </motion.div>
        ) : (
          <Circle className="w-3.5 h-3.5" style={{ color: 'rgba(192,232,240,0.3)' }} />
        )}
      </button>

      {/* Priority dot */}
      <div className="mt-1.5 flex-shrink-0">
        <PriorityDot priority={task.priority} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[11px] font-mono leading-snug"
            style={{
              color: isDone ? 'rgba(192,232,240,0.4)' : 'rgba(192,232,240,0.88)',
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            {task.title}
          </span>
          <EnergyBadge energy={task.energyType} />
          {task.scheduled && !isDone && <ScheduledBadge />}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[8px] font-mono flex items-center gap-0.5" style={{ color: 'rgba(74,122,138,0.6)' }}>
            <Clock className="w-2 h-2" />
            {task.durationMinutes}m
          </span>
          {task.dueDate && <DueDateChip dueDate={task.dueDate} completed={task.completed} />}
          {task.project && (
            <span className="text-[8px] font-mono" style={{ color: 'rgba(157,78,221,0.6)' }}>
              {task.project}
            </span>
          )}
          {task.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[7px] font-mono px-1 py-0.5 rounded" style={{ color: 'rgba(74,122,138,0.5)', background: 'rgba(74,122,138,0.08)' }}>
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Actions (hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!isDone && !task.scheduled && (
          <button
            onClick={(e) => { e.stopPropagation(); onSchedule() }}
            className="p-1 rounded"
            style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)' }}
            title="Send to calendar"
          >
            <CalendarPlus className="w-3 h-3" />
          </button>
        )}
        {!isDone && task.scheduled && (
          <button
            onClick={(e) => { e.stopPropagation(); onUnschedule() }}
            className="p-1 rounded"
            style={{ color: '#ffc84a', background: 'rgba(255,196,74,0.08)', border: '1px solid rgba(255,196,74,0.2)' }}
            title="Unschedule"
          >
            <CalendarX className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onPin() }}
          className="p-1 rounded"
          style={{ color: task.pinned ? '#ffc84a' : 'rgba(192,232,240,0.3)' }}
          title={task.pinned ? 'Unpin' : 'Pin'}
        >
          <Pin className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate() }}
          className="p-1 rounded"
          style={{ color: 'rgba(192,232,240,0.35)' }}
          title="Duplicate"
        >
          <Copy className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-1 rounded"
          style={{ color: 'rgba(255,107,53,0.45)' }}
          title="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  )
}

// ── TaskCard (board view) ─────────────────────────────────────────────────────

function TaskCard({
  task,
  selected,
  onSelect,
  onComplete,
  onSchedule,
  onDelete,
}: {
  task: Task
  selected: boolean
  onSelect: () => void
  onComplete: () => void
  onSchedule: () => void
  onDelete: () => void
}) {
  const isDone = task.completed
  const td = today()
  const isOverdue = !isDone && !!task.dueDate && task.dueDate < td

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      onClick={onSelect}
      className="rounded-md px-3 py-2.5 mb-2 group cursor-pointer"
      style={{
        background: selected ? 'rgba(0,212,255,0.06)' : 'rgba(255,255,255,0.025)',
        border: selected
          ? '1px solid rgba(0,212,255,0.3)'
          : isOverdue
          ? '1px solid rgba(255,107,53,0.2)'
          : '1px solid rgba(0,212,255,0.08)',
        opacity: isDone ? 0.45 : 1,
      }}
    >
      <div className="flex items-start gap-1.5 mb-1.5">
        <PriorityDot priority={task.priority} size={6} />
        <span
          className="text-[10px] font-mono leading-snug flex-1"
          style={{
            color: isDone ? 'rgba(192,232,240,0.4)' : 'rgba(192,232,240,0.88)',
            textDecoration: isDone ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <EnergyBadge energy={task.energyType} />
        {task.scheduled && <ScheduledBadge />}
        {task.dueDate && <DueDateChip dueDate={task.dueDate} completed={task.completed} />}
      </div>
      <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onComplete() }}
          className="text-[8px] font-mono px-1.5 py-0.5 rounded"
          style={{ color: '#00ff88', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.15)' }}
        >
          {isDone ? 'Undo' : 'Done'}
        </button>
        {!isDone && !task.scheduled && (
          <button
            onClick={(e) => { e.stopPropagation(); onSchedule() }}
            className="text-[8px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5"
            style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)' }}
          >
            <CalendarPlus className="w-2.5 h-2.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="ml-auto text-[8px] font-mono p-0.5 rounded"
          style={{ color: 'rgba(255,107,53,0.4)' }}
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </motion.div>
  )
}

// ── TaskInspector ─────────────────────────────────────────────────────────────

function TaskInspector({
  task,
  onClose,
  onComplete,
  onSchedule,
  onUnschedule,
  onPin,
  onDelete,
  onDuplicate,
}: {
  task: Task
  onClose: () => void
  onComplete: () => void
  onSchedule: () => void
  onUnschedule: () => void
  onPin: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  return (
    <motion.div
      initial={{ x: 48, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 48, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-shrink-0 flex flex-col overflow-y-auto"
      style={{
        width: 256,
        borderLeft: '1px solid rgba(0,212,255,0.1)',
        background: 'rgba(0,8,16,0.95)',
      }}
    >
      {/* Inspector header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}
      >
        <span className="text-[9px] font-mono tracking-widest" style={{ color: 'rgba(0,212,255,0.6)' }}>
          TASK INSPECTOR
        </span>
        <button onClick={onClose} style={{ color: 'rgba(192,232,240,0.35)' }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 px-3 py-3 space-y-3">
        {/* Title */}
        <div>
          <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>TITLE</p>
          <p className="text-[11px] font-mono leading-snug" style={{ color: 'rgba(192,232,240,0.9)' }}>
            {task.title}
          </p>
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>DESCRIPTION</p>
            <p className="text-[10px] font-mono leading-relaxed" style={{ color: 'rgba(192,232,240,0.55)' }}>
              {task.description}
            </p>
          </div>
        )}

        {/* Priority + Energy row */}
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>PRIORITY</p>
            <div className="flex items-center gap-1.5">
              <PriorityDot priority={task.priority} />
              <span className="text-[10px] font-mono" style={{ color: PRIORITY_COLOR[task.priority] }}>
                {task.priority.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>ENERGY</p>
            <EnergyBadge energy={task.energyType} />
          </div>
        </div>

        {/* Duration + Due */}
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>DURATION</p>
            <span className="text-[10px] font-mono flex items-center gap-1" style={{ color: 'rgba(192,232,240,0.7)' }}>
              <Clock className="w-2.5 h-2.5" />
              {task.durationMinutes}m
            </span>
          </div>
          {task.dueDate && (
            <div className="flex-1">
              <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>DUE</p>
              <DueDateChip dueDate={task.dueDate} completed={task.completed} />
            </div>
          )}
        </div>

        {/* Project + Tags */}
        {task.project && (
          <div>
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>PROJECT</p>
            <span className="text-[10px] font-mono" style={{ color: '#9d4edd' }}>{task.project}</span>
          </div>
        )}
        {task.tags.length > 0 && (
          <div>
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>TAGS</p>
            <div className="flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <span key={tag} className="text-[8px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ color: 'rgba(74,122,138,0.6)', background: 'rgba(74,122,138,0.08)', border: '1px solid rgba(74,122,138,0.15)' }}>
                  <Hash className="w-2 h-2" />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recurrence */}
        {task.recurrence && (
          <div>
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>RECURRENCE</p>
            <span className="text-[10px] font-mono flex items-center gap-1" style={{ color: 'rgba(0,212,255,0.6)' }}>
              <RefreshCw className="w-2.5 h-2.5" />
              {task.recurrence}
            </span>
          </div>
        )}

        {/* Calendar link status */}
        <div>
          <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>CALENDAR</p>
          {task.scheduled ? (
            <span className="text-[9px] font-mono flex items-center gap-1" style={{ color: '#00d4ff' }}>
              <Lock className="w-2.5 h-2.5" />
              Scheduled
            </span>
          ) : (
            <span className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.4)' }}>Not scheduled</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div
        className="flex-shrink-0 px-3 py-3 space-y-2"
        style={{ borderTop: '1px solid rgba(0,212,255,0.08)' }}
      >
        <button
          onClick={onComplete}
          className="w-full py-1.5 rounded text-[9px] font-mono tracking-wider"
          style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', color: '#00ff88' }}
        >
          {task.completed ? 'MARK INCOMPLETE' : 'MARK COMPLETE'}
        </button>
        {!task.completed && !task.scheduled && (
          <button
            onClick={onSchedule}
            className="w-full py-1.5 rounded text-[9px] font-mono tracking-wider flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}
          >
            <CalendarPlus className="w-3 h-3" />
            SEND TO CALENDAR
          </button>
        )}
        {!task.completed && task.scheduled && (
          <button
            onClick={onUnschedule}
            className="w-full py-1.5 rounded text-[9px] font-mono tracking-wider flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(255,196,74,0.06)', border: '1px solid rgba(255,196,74,0.2)', color: '#ffc84a' }}
          >
            <CalendarX className="w-3 h-3" />
            UNSCHEDULE
          </button>
        )}
        <button
          onClick={onPin}
          className="w-full py-1.5 rounded text-[9px] font-mono tracking-wider flex items-center justify-center gap-1.5"
          style={{
            background: task.pinned ? 'rgba(255,196,74,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${task.pinned ? 'rgba(255,196,74,0.25)' : 'rgba(255,255,255,0.08)'}`,
            color: task.pinned ? '#ffc84a' : 'rgba(192,232,240,0.45)',
          }}
        >
          <Pin className="w-3 h-3" />
          {task.pinned ? 'UNPIN' : 'PIN PRIORITY'}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onDuplicate}
            className="flex-1 py-1.5 rounded text-[9px] font-mono tracking-wider flex items-center justify-center gap-1"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(192,232,240,0.5)' }}
          >
            <Copy className="w-3 h-3" />
            DUPE
          </button>
          <button
            onClick={onDelete}
            className="flex-1 py-1.5 rounded text-[9px] font-mono tracking-wider flex items-center justify-center gap-1"
            style={{ background: 'rgba(255,107,53,0.06)', border: '1px solid rgba(255,107,53,0.18)', color: '#ff6b35' }}
          >
            <Trash2 className="w-3 h-3" />
            DELETE
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── AddTaskModal ──────────────────────────────────────────────────────────────

function AddTaskModal({ onClose, onSave }: { onClose: () => void; onSave: (t: Task) => void }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [energy, setEnergy] = useState<EnergyType>('moderate')
  const [duration, setDuration] = useState(30)
  const [dueDate, setDueDate] = useState('')
  const [project, setProject] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  function handleSave() {
    if (!title.trim()) return
    const now = new Date().toISOString()
    const task: Task = {
      id: uid('task'),
      title: title.trim(),
      description: desc.trim() || undefined,
      status: 'todo',
      priority,
      dueDate: dueDate || undefined,
      durationMinutes: duration,
      energyType: energy,
      scheduled: false,
      completed: false,
      tags: [],
      project: project.trim() || undefined,
      splitAllowed: false,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    }
    onSave(task)
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg p-5 w-full max-w-md space-y-4"
        style={{
          background: 'rgba(4,14,24,0.98)',
          border: '1px solid rgba(0,212,255,0.18)',
          boxShadow: '0 0 40px rgba(0,212,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest" style={{ color: '#00d4ff' }}>NEW TASK</span>
          <button onClick={onClose} style={{ color: 'rgba(192,232,240,0.35)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          ref={titleRef}
          className="w-full rounded-md px-3 py-2 text-sm font-mono outline-none"
          style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.18)', color: 'rgba(192,232,240,0.9)' }}
          placeholder="Task title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />

        <textarea
          className="w-full rounded-md px-3 py-2 text-[11px] font-mono outline-none resize-none"
          style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.1)', color: 'rgba(192,232,240,0.6)' }}
          placeholder="Description (optional)…"
          rows={2}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        {/* Priority chips */}
        <div>
          <p className="text-[9px] font-mono mb-1.5" style={{ color: 'rgba(74,122,138,0.5)' }}>PRIORITY</p>
          <div className="flex gap-1.5">
            {(['low', 'medium', 'high'] as TaskPriority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className="flex-1 py-1 rounded text-[9px] font-mono"
                style={{
                  background: priority === p ? `${PRIORITY_COLOR[p]}22` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${priority === p ? PRIORITY_COLOR[p] : 'rgba(255,255,255,0.08)'}`,
                  color: priority === p ? PRIORITY_COLOR[p] : 'rgba(192,232,240,0.4)',
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Energy chips */}
        <div>
          <p className="text-[9px] font-mono mb-1.5" style={{ color: 'rgba(74,122,138,0.5)' }}>ENERGY TYPE</p>
          <div className="flex gap-1.5">
            {(['deep', 'moderate', 'light'] as EnergyType[]).map((e) => (
              <button
                key={e}
                onClick={() => setEnergy(e)}
                className="flex-1 py-1 rounded text-[9px] font-mono"
                style={{
                  background: energy === e ? `${ENERGY_COLOR[e]}18` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${energy === e ? ENERGY_COLOR[e] : 'rgba(255,255,255,0.08)'}`,
                  color: energy === e ? ENERGY_COLOR[e] : 'rgba(192,232,240,0.4)',
                }}
              >
                {ENERGY_LABEL[e]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-[9px] font-mono mb-1.5" style={{ color: 'rgba(74,122,138,0.5)' }}>DURATION (min)</p>
            <input
              type="number"
              min={5}
              step={5}
              className="w-full rounded-md px-3 py-1.5 text-[11px] font-mono outline-none"
              style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.1)', color: 'rgba(192,232,240,0.8)' }}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
          <div className="flex-1">
            <p className="text-[9px] font-mono mb-1.5" style={{ color: 'rgba(74,122,138,0.5)' }}>DUE DATE</p>
            <input
              type="date"
              className="w-full rounded-md px-3 py-1.5 text-[11px] font-mono outline-none"
              style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.1)', color: 'rgba(192,232,240,0.8)' }}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <p className="text-[9px] font-mono mb-1.5" style={{ color: 'rgba(74,122,138,0.5)' }}>PROJECT</p>
          <input
            className="w-full rounded-md px-3 py-1.5 text-[11px] font-mono outline-none"
            style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.1)', color: 'rgba(192,232,240,0.8)' }}
            placeholder="e.g. Infrastructure"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 rounded text-[9px] font-mono"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(192,232,240,0.4)' }}
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-1.5 rounded text-[9px] font-mono"
            style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff' }}
          >
            SAVE TASK
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── ScheduleModal ─────────────────────────────────────────────────────────────

function ScheduleModal({
  taskTitle,
  task,
  onClose,
  onSchedule,
}: {
  taskTitle: string
  task?: Pick<Task, 'durationMinutes' | 'energyType' | 'dueDate' | 'priority'>
  onClose: () => void
  onSchedule: (date: string, startTime: string) => void
}) {
  const blocks = usePlannerStore((s) => s.blocks)

  // Compute the AI suggestion once on mount
  const suggestion = useMemo(() => {
    if (!task) return null
    return suggestPlacement(task, blocks)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [date, setDate] = useState(() => suggestion?.date ?? today())
  const [time, setTime] = useState(() => suggestion?.startTime ?? '10:00')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg p-5 w-full max-w-xs space-y-4"
        style={{
          background: 'rgba(4,14,24,0.98)',
          border: '1px solid rgba(0,212,255,0.18)',
          boxShadow: '0 0 40px rgba(0,212,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest" style={{ color: '#00d4ff' }}>SCHEDULE TASK</span>
          <button onClick={onClose} style={{ color: 'rgba(192,232,240,0.35)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.55)' }}>{taskTitle}</p>

        {/* Scheduler suggestion */}
        {suggestion?.success && (
          <div
            className="px-2.5 py-2 rounded-md"
            style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.12)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="w-2.5 h-2.5 flex-shrink-0" style={{ color: '#9d4edd' }} />
              <span className="text-[8px] font-mono tracking-wider" style={{ color: '#9d4edd' }}>
                SUGGESTED · {suggestion.confidence.toUpperCase()} CONFIDENCE
              </span>
            </div>
            <p className="text-[9px] font-mono leading-relaxed" style={{ color: 'rgba(0,212,255,0.7)' }}>
              {suggestion.reason}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>DATE</p>
            <input
              type="date"
              className="w-full rounded-md px-3 py-1.5 text-[11px] font-mono outline-none"
              style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.15)', color: 'rgba(192,232,240,0.8)' }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>START TIME</p>
            <input
              type="time"
              className="w-full rounded-md px-3 py-1.5 text-[11px] font-mono outline-none"
              style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.15)', color: 'rgba(192,232,240,0.8)' }}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 rounded text-[9px] font-mono"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(192,232,240,0.4)' }}
          >
            CANCEL
          </button>
          <button
            onClick={() => { onSchedule(date, time); onClose() }}
            className="flex-1 py-1.5 rounded text-[9px] font-mono flex items-center justify-center gap-1"
            style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff' }}
          >
            <CalendarPlus className="w-3 h-3" />
            CONFIRM
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── TasksTab ──────────────────────────────────────────────────────────────────

export function TasksTab() {
  const tasks = usePlannerStore((s) => s.tasks)
  const blocks = usePlannerStore((s) => s.blocks)
  const addTask = usePlannerStore((s) => s.addTask)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const deleteTask = usePlannerStore((s) => s.deleteTask)
  const scheduleTask = usePlannerStore((s) => s.scheduleTask)
  const unscheduleTask = usePlannerStore((s) => s.unscheduleTask)
  const togglePin = usePlannerStore((s) => s.togglePin)

  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>('priority')
  const [view, setView] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null)
  const [showInsights, setShowInsights] = useState(true)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [railProjectFilter, setRailProjectFilter] = useState<string | null>(null)
  const [railTagFilter, setRailTagFilter] = useState<string | null>(null)
  const [railEnergyFilter, setRailEnergyFilter] = useState<EnergyType | null>(null)
  const [compact, setCompact] = useState(false)

  const td = today()

  // ── Derived counts ───────────────────────────────────────────────────────────
  const filterCounts = useMemo(() => {
    const keys: FilterKey[] = ['all', 'today', 'upcoming', 'overdue', 'scheduled', 'unscheduled', 'completed']
    return Object.fromEntries(keys.map((k) => [k, tasks.filter((t) => matchesFilter(t, k)).length])) as Record<FilterKey, number>
  }, [tasks])

  // ── Filtered + sorted tasks ──────────────────────────────────────────────────
  const visibleTasks = useMemo(() => {
    let list = tasks.filter((t) => matchesFilter(t, filter))
    if (railProjectFilter) list = list.filter((t) => t.project === railProjectFilter)
    if (railTagFilter) list = list.filter((t) => t.tags.includes(railTagFilter))
    if (railEnergyFilter) list = list.filter((t) => t.energyType === railEnergyFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.project?.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      )
    }
    return sortTasks(list, sort)
  }, [tasks, filter, sort, search, railProjectFilter, railTagFilter, railEnergyFilter])

  // ── Board columns ────────────────────────────────────────────────────────────
  const boardColumns = useMemo(() => {
    const base = tasks.filter((t) => {
      if (railProjectFilter && t.project !== railProjectFilter) return false
      if (railTagFilter && !t.tags.includes(railTagFilter)) return false
      if (railEnergyFilter && t.energyType !== railEnergyFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false
      }
      return true
    })
    const todo = sortTasks(base.filter((t) => t.status === 'todo' && !t.completed), sort)
    const inProgress = sortTasks(base.filter((t) => t.status === 'in-progress' && !t.completed), sort)
    const done = sortTasks(base.filter((t) => t.completed || t.status === 'done'), sort)
    return { todo, inProgress, done }
  }, [tasks, sort, search, railProjectFilter, railTagFilter, railEnergyFilter])

  // ── Queue buckets ────────────────────────────────────────────────────────────
  const queueBuckets = useMemo(() => {
    const unscheduled = tasks.filter((t) => !t.scheduled && !t.completed)
    const overdue = sortTasks(unscheduled.filter((t) => t.dueDate && t.dueDate < td), 'priority')
    const dueToday = sortTasks(unscheduled.filter((t) => t.dueDate === td), 'priority')
    const upcoming = sortTasks(unscheduled.filter((t) => !t.dueDate || t.dueDate > td), 'priority')
    return { overdue, dueToday, upcoming }
  }, [tasks, td])

  // ── Rail data ────────────────────────────────────────────────────────────────
  const allProjects = useMemo(() => [...new Set(tasks.map((t) => t.project).filter(Boolean) as string[])], [tasks])
  const allTags = useMemo(() => [...new Set(tasks.flatMap((t) => t.tags))], [tasks])

  // ── Planner signals ───────────────────────────────────────────────────────────
  const plannerSignals = useMemo<PlannerSignal[]>(() => {
    if (!showInsights) return []
    return summaryToSignals(generatePlannerSummary(tasks, blocks))
  }, [tasks, blocks, showInsights])

  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null
  const scheduleTaskData = scheduleTaskId ? tasks.find((t) => t.id === scheduleTaskId) ?? null : null

  function handleComplete(id: string) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    updateTask(id, { completed: !task.completed, status: task.completed ? 'todo' : 'done' })
  }

  function handleDelete(id: string) {
    deleteTask(id)
    if (selectedId === id) setSelectedId(null)
  }

  function handleDuplicate(id: string) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    const now = new Date().toISOString()
    addTask({ ...task, id: uid('task'), title: `${task.title} (copy)`, scheduled: false, linkedCalendarBlockId: undefined, createdAt: now, updatedAt: now })
  }

  function handleUnschedule(id: string) {
    unscheduleTask(id)
  }

  function handleScheduleConfirm(date: string, startTime: string) {
    if (!scheduleTaskId) return
    scheduleTask(scheduleTaskId, date, startTime)
    setScheduleTaskId(null)
  }

  const FILTER_LABELS: Record<FilterKey, string> = {
    all: 'All',
    today: 'Today',
    upcoming: 'Upcoming',
    overdue: 'Overdue',
    scheduled: 'Scheduled',
    unscheduled: 'Unscheduled',
    completed: 'Completed',
  }

  const totalDone = tasks.filter((t) => t.completed).length
  const totalActive = tasks.filter((t) => !t.completed).length

  return (
    <div className="flex flex-col h-full font-mono" style={{ background: 'rgba(0,10,20,0.6)' }}>
      {/* ── Header ── */}
      <div
        className="flex items-center gap-4 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}
      >
        {/* Title */}
        <div className="flex-shrink-0">
          <h2 className="text-[11px] font-mono tracking-[0.2em]" style={{ color: 'rgba(0,212,255,0.9)' }}>TASKS</h2>
          <p className="text-[8px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.55)' }}>
            {totalActive} active · {totalDone} done
          </p>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 flex-1 rounded-md px-2.5 py-1.5"
          style={{ background: 'rgba(0,10,20,0.7)', border: '1px solid rgba(0,212,255,0.1)', maxWidth: 300 }}
        >
          <Search className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(0,212,255,0.4)' }} />
          <input
            className="flex-1 bg-transparent text-[10px] font-mono outline-none"
            style={{ color: 'rgba(192,232,240,0.8)' }}
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: 'rgba(192,232,240,0.3)' }}>
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Density toggle */}
        <button
          onClick={() => setCompact((v) => !v)}
          className="px-2 py-1.5 rounded text-[8px] font-mono flex-shrink-0"
          style={{
            background: compact ? 'rgba(0,212,255,0.08)' : 'transparent',
            border: `1px solid ${compact ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
            color: compact ? '#00d4ff' : 'rgba(74,122,138,0.5)',
          }}
          title={compact ? 'Comfortable view' : 'Compact view'}
        >
          {compact ? 'COMPACT' : 'COMFY'}
        </button>

        {/* View toggles */}
        <div
          className="flex items-center rounded overflow-hidden flex-shrink-0"
          style={{ border: '1px solid rgba(0,212,255,0.12)', background: 'rgba(0,10,20,0.5)' }}
        >
          {([['list', List], ['board', LayoutGrid], ['queue', ListOrdered]] as [ViewMode, React.ElementType][]).map(([v, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-2.5 py-1.5"
              style={{
                background: view === v ? 'rgba(0,212,255,0.1)' : 'transparent',
                color: view === v ? '#00d4ff' : 'rgba(74,122,138,0.5)',
              }}
              title={v}
            >
              <Icon className="w-3 h-3" />
            </button>
          ))}
        </div>

        {/* Add Task */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 flex-shrink-0"
          style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-[9px] font-mono tracking-wider">ADD TASK</span>
        </button>
      </div>

      {/* ── Filter / Sort bar ── */}
      <div
        className="flex items-center gap-2 px-4 py-2 flex-shrink-0 overflow-x-auto"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.06)' }}
      >
        {/* Filter chips */}
        <div className="flex items-center gap-1 flex-1">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono whitespace-nowrap transition-all"
              style={{
                background: filter === f ? 'rgba(0,212,255,0.12)' : 'transparent',
                border: `1px solid ${filter === f ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.05)'}`,
                color: filter === f ? '#00d4ff' : 'rgba(192,232,240,0.4)',
              }}
            >
              {FILTER_LABELS[f]}
              <span
                className="px-1 rounded text-[7px]"
                style={{
                  background: filter === f ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.06)',
                  color: filter === f ? '#00d4ff' : 'rgba(192,232,240,0.35)',
                }}
              >
                {filterCounts[f]}
              </span>
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>SORT</span>
          <select
            className="text-[8px] font-mono rounded px-2 py-0.5 outline-none"
            style={{ background: 'rgba(0,10,20,0.7)', border: '1px solid rgba(0,212,255,0.1)', color: 'rgba(192,232,240,0.6)' }}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── JARVIS Intelligence bar ── */}
      <AnimatePresence>
        {showInsights && plannerSignals.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden flex-shrink-0"
          >
            <div
              className="flex items-start gap-3 px-4 py-2"
              style={{
                borderBottom: '1px solid rgba(0,212,255,0.06)',
                borderLeft: '3px solid rgba(157,78,221,0.5)',
                background: 'rgba(157,78,221,0.04)',
              }}
            >
              <Sparkles className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#9d4edd' }} />
              <div className="flex-1 flex items-start gap-4 flex-wrap">
                {plannerSignals.map((sig) => (
                  <span
                    key={sig.id}
                    className="text-[9px] font-mono"
                    style={{
                      color: sig.severity === 'error' ? '#ff6b35'
                           : sig.severity === 'warning' ? '#ffc84a'
                           : 'rgba(0,212,255,0.6)',
                    }}
                  >
                    {sig.type === 'at-risk' && <Zap className="inline w-2.5 h-2.5 mr-0.5" style={{ color: sig.severity === 'error' ? '#ff6b35' : '#ffc84a' }} />}
                    {sig.message}
                  </span>
                ))}
              </div>
              <button onClick={() => setShowInsights(false)} style={{ color: 'rgba(192,232,240,0.25)', flexShrink: 0 }}>
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Filter Rail ── */}
        <AnimatePresence initial={false}>
          {!railCollapsed ? (
            <motion.div
              key="rail-open"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 144, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex-shrink-0 overflow-y-auto overflow-x-hidden flex flex-col"
              style={{ borderRight: '1px solid rgba(0,212,255,0.08)', background: 'rgba(0,6,14,0.5)' }}
            >
              <div className="p-2 space-y-3 min-w-[144px]">
                {/* Collapse toggle */}
                <button
                  onClick={() => setRailCollapsed(true)}
                  className="flex items-center gap-1 text-[8px] font-mono"
                  style={{ color: 'rgba(74,122,138,0.45)' }}
                >
                  <ChevronLeft className="w-3 h-3" />
                  COLLAPSE
                </button>

                {/* Projects */}
                <div>
                  <p className="text-[8px] font-mono mb-1.5 tracking-wider" style={{ color: 'rgba(0,212,255,0.4)' }}>PROJECTS</p>
                  <div className="space-y-0.5">
                    <button
                      onClick={() => setRailProjectFilter(null)}
                      className="w-full text-left text-[9px] font-mono px-1.5 py-1 rounded"
                      style={{
                        color: railProjectFilter === null ? '#00d4ff' : 'rgba(192,232,240,0.45)',
                        background: railProjectFilter === null ? 'rgba(0,212,255,0.08)' : 'transparent',
                      }}
                    >
                      All projects
                    </button>
                    {allProjects.map((p) => (
                      <button
                        key={p}
                        onClick={() => setRailProjectFilter(railProjectFilter === p ? null : p)}
                        className="w-full text-left text-[9px] font-mono px-1.5 py-1 rounded flex items-center gap-1.5 truncate"
                        style={{
                          color: railProjectFilter === p ? '#9d4edd' : 'rgba(192,232,240,0.45)',
                          background: railProjectFilter === p ? 'rgba(157,78,221,0.08)' : 'transparent',
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#9d4edd' }} />
                        <span className="truncate">{p}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <p className="text-[8px] font-mono mb-1.5 tracking-wider" style={{ color: 'rgba(0,212,255,0.4)' }}>TAGS</p>
                  <div className="flex flex-wrap gap-1">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setRailTagFilter(railTagFilter === tag ? null : tag)}
                        className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                        style={{
                          color: railTagFilter === tag ? '#00d4ff' : 'rgba(74,122,138,0.5)',
                          background: railTagFilter === tag ? 'rgba(0,212,255,0.08)' : 'rgba(74,122,138,0.06)',
                          border: `1px solid ${railTagFilter === tag ? 'rgba(0,212,255,0.2)' : 'rgba(74,122,138,0.1)'}`,
                        }}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Energy */}
                <div>
                  <p className="text-[8px] font-mono mb-1.5 tracking-wider" style={{ color: 'rgba(0,212,255,0.4)' }}>ENERGY</p>
                  <div className="space-y-0.5">
                    {(['deep', 'moderate', 'light'] as EnergyType[]).map((e) => (
                      <button
                        key={e}
                        onClick={() => setRailEnergyFilter(railEnergyFilter === e ? null : e)}
                        className="w-full text-left text-[9px] font-mono px-1.5 py-1 rounded flex items-center gap-1.5"
                        style={{
                          color: railEnergyFilter === e ? ENERGY_COLOR[e] : 'rgba(192,232,240,0.45)',
                          background: railEnergyFilter === e ? `${ENERGY_COLOR[e]}10` : 'transparent',
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ENERGY_COLOR[e] }} />
                        {ENERGY_LABEL[e]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Smart buckets */}
                <div>
                  <p className="text-[8px] font-mono mb-1.5 tracking-wider" style={{ color: 'rgba(0,212,255,0.4)' }}>SMART</p>
                  <div className="space-y-0.5">
                    {(['overdue', 'today', 'unscheduled'] as FilterKey[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className="w-full text-left text-[9px] font-mono px-1.5 py-1 rounded flex items-center justify-between"
                        style={{
                          color: filter === f ? '#00d4ff' : 'rgba(192,232,240,0.4)',
                          background: filter === f ? 'rgba(0,212,255,0.08)' : 'transparent',
                        }}
                      >
                        <span>{FILTER_LABELS[f]}</span>
                        <span
                          className="text-[7px] px-1 rounded"
                          style={{
                            background: filterCounts[f] > 0 && f === 'overdue' ? 'rgba(255,107,53,0.15)' : 'rgba(255,255,255,0.06)',
                            color: filterCounts[f] > 0 && f === 'overdue' ? '#ff6b35' : 'rgba(192,232,240,0.35)',
                          }}
                        >
                          {filterCounts[f]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="rail-closed"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 28, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex-shrink-0 flex flex-col items-center py-3"
              style={{ borderRight: '1px solid rgba(0,212,255,0.08)', background: 'rgba(0,6,14,0.5)' }}
            >
              <button
                onClick={() => setRailCollapsed(false)}
                className="text-[8px] font-mono"
                style={{ color: 'rgba(74,122,138,0.45)', writingMode: 'vertical-rl' }}
                title="Expand rail"
              >
                FILTERS
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 overflow-y-auto px-3 py-2">
          {/* List view */}
          {view === 'list' && (
            <AnimatePresence initial={false}>
              {visibleTasks.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <p className="text-[10px] font-mono" style={{ color: 'rgba(74,122,138,0.4)' }}>No tasks match</p>
                </div>
              ) : (
                <div className={compact ? 'space-y-0.5' : 'space-y-1.5'}>
                  {visibleTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      selected={selectedId === task.id}
                      compact={compact}
                      onSelect={() => setSelectedId(selectedId === task.id ? null : task.id)}
                      onComplete={() => handleComplete(task.id)}
                      onSchedule={() => setScheduleTaskId(task.id)}
                      onUnschedule={() => handleUnschedule(task.id)}
                      onPin={() => togglePin(task.id)}
                      onDelete={() => handleDelete(task.id)}
                      onDuplicate={() => handleDuplicate(task.id)}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>
          )}

          {/* Board view */}
          {view === 'board' && (
            <div className="flex gap-3 h-full min-h-0">
              {([
                { key: 'todo' as const, label: 'TO DO', color: 'rgba(192,232,240,0.4)', tasks: boardColumns.todo },
                { key: 'inProgress' as const, label: 'IN PROGRESS', color: '#00d4ff', tasks: boardColumns.inProgress },
                { key: 'done' as const, label: 'DONE', color: '#00ff88', tasks: boardColumns.done },
              ]).map((col) => (
                <div key={col.key} className="flex-1 flex flex-col min-w-0">
                  <div
                    className="flex items-center gap-2 px-2 py-2 flex-shrink-0 mb-2"
                    style={{ borderBottom: `2px solid ${col.color}33` }}
                  >
                    <span className="text-[9px] font-mono tracking-widest" style={{ color: col.color }}>
                      {col.label}
                    </span>
                    <span
                      className="text-[7px] font-mono px-1 rounded"
                      style={{ background: `${col.color}18`, color: col.color }}
                    >
                      {col.tasks.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <AnimatePresence initial={false}>
                      {col.tasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          selected={selectedId === task.id}
                          onSelect={() => setSelectedId(selectedId === task.id ? null : task.id)}
                          onComplete={() => handleComplete(task.id)}
                          onSchedule={() => setScheduleTaskId(task.id)}
                          onDelete={() => handleDelete(task.id)}
                        />
                      ))}
                    </AnimatePresence>
                    {col.tasks.length === 0 && (
                      <p className="text-[9px] font-mono text-center py-6" style={{ color: 'rgba(74,122,138,0.3)' }}>Empty</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Queue view */}
          {view === 'queue' && (
            <div className="space-y-4">
              {([
                { label: 'OVERDUE', color: '#ff6b35', tasks: queueBuckets.overdue },
                { label: 'DUE TODAY', color: '#ffc84a', tasks: queueBuckets.dueToday },
                { label: 'UPCOMING / BACKLOG', color: 'rgba(192,232,240,0.4)', tasks: queueBuckets.upcoming },
              ]).map((bucket) => (
                bucket.tasks.length > 0 && (
                  <div key={bucket.label}>
                    <div
                      className="flex items-center gap-2 mb-2 px-1"
                      style={{ borderLeft: `3px solid ${bucket.color}`, paddingLeft: 8 }}
                    >
                      <span className="text-[9px] font-mono tracking-widest" style={{ color: bucket.color }}>
                        {bucket.label}
                      </span>
                      <span className="text-[7px] font-mono" style={{ color: 'rgba(192,232,240,0.3)' }}>
                        {bucket.tasks.length} tasks
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {bucket.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 rounded-md px-3 py-2 group"
                          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(0,212,255,0.08)' }}
                        >
                          <PriorityDot priority={task.priority} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.85)' }}>{task.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <EnergyBadge energy={task.energyType} />
                              <span className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>
                                <Clock className="inline w-2 h-2 mr-0.5" />
                                {task.durationMinutes}m
                              </span>
                              {task.dueDate && <DueDateChip dueDate={task.dueDate} completed={task.completed} />}
                            </div>
                          </div>
                          <button
                            onClick={() => setScheduleTaskId(task.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}
                          >
                            <CalendarPlus className="w-3 h-3" />
                            Schedule
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ))}
              {queueBuckets.overdue.length === 0 && queueBuckets.dueToday.length === 0 && queueBuckets.upcoming.length === 0 && (
                <div className="flex items-center justify-center py-16">
                  <p className="text-[10px] font-mono" style={{ color: 'rgba(74,122,138,0.4)' }}>All tasks scheduled</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Task Inspector ── */}
        <AnimatePresence>
          {selectedTask && (
            <TaskInspector
              task={selectedTask}
              onClose={() => setSelectedId(null)}
              onComplete={() => handleComplete(selectedTask.id)}
              onSchedule={() => { setScheduleTaskId(selectedTask.id); setSelectedId(null) }}
              onUnschedule={() => handleUnschedule(selectedTask.id)}
              onPin={() => togglePin(selectedTask.id)}
              onDelete={() => { handleDelete(selectedTask.id); setSelectedId(null) }}
              onDuplicate={() => handleDuplicate(selectedTask.id)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showAddModal && (
          <AddTaskModal
            onClose={() => setShowAddModal(false)}
            onSave={addTask}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scheduleTaskData && (
          <ScheduleModal
            taskTitle={scheduleTaskData.title}
            task={scheduleTaskData}
            onClose={() => setScheduleTaskId(null)}
            onSchedule={handleScheduleConfirm}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
