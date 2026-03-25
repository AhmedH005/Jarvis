import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react'
import {
  usePlannerStore,
  type CalendarBlock,
  type BlockType,
  type Task,
  uid,
  today,
  addDays,
} from '@/store/planner'
import { detectConflicts, rebuildDay, type ConflictInfo } from '@/features/scheduler/schedulerService'
import { generatePlannerSummary, summaryToSignals, type PlannerSignal } from '@/features/planner/planningOrchestrator'

// ── Constants ─────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7) // 7–21
const HOUR_HEIGHT = 52 // px per hour

const BLOCK_COLORS: Record<BlockType, string> = {
  event: '#00d4ff',
  'task-block': '#00ff88',
  focus: '#9d4edd',
  break: '#ffc84a',
}

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  event: 'EVENT',
  'task-block': 'TASK',
  focus: 'FOCUS',
  break: 'BREAK',
}

type CalView = 'week' | 'day' | 'agenda'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay() // 0=Sun
  d.setDate(d.getDate() - day)
  return formatDate(d)
}

function blockTop(startTime: string): number {
  const [h, m] = startTime.split(':').map(Number)
  return ((h - 7) + m / 60) * HOUR_HEIGHT
}

function blockHeight(duration: number): number {
  return Math.max((duration / 60) * HOUR_HEIGHT, 24)
}

function dayLabel(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── Mini month calendar ───────────────────────────────────────────────────────

function MiniMonthCalendar({
  selectedDate,
  dotDates,
  onSelectDate,
}: {
  selectedDate: string
  dotDates: Set<string>
  onSelectDate: (d: string) => void
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(selectedDate + 'T12:00:00')
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const td = today()
  const { year, month } = viewMonth

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1)
      return formatDate(d)
    }),
  ]

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  function prevMonth() {
    setViewMonth((v) => {
      const m = v.month - 1
      return m < 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: m }
    })
  }
  function nextMonth() {
    setViewMonth((v) => {
      const m = v.month + 1
      return m > 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: m }
    })
  }

  return (
    <div className="px-2 py-2">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={prevMonth} style={{ color: 'rgba(0,212,255,0.4)' }}>
          <ChevronLeft className="w-3 h-3" />
        </button>
        <span className="text-[8px] font-mono tracking-wider" style={{ color: 'rgba(192,232,240,0.55)' }}>
          {monthLabel.toUpperCase()}
        </span>
        <button onClick={nextMonth} style={{ color: 'rgba(0,212,255,0.4)' }}>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[7px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />
          const isToday = dateStr === td
          const isSelected = dateStr === selectedDate
          const hasDot = dotDates.has(dateStr)
          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className="flex flex-col items-center justify-center h-5 w-full rounded"
              style={{
                background: isSelected ? 'rgba(0,212,255,0.15)' : isToday ? 'rgba(0,212,255,0.06)' : 'transparent',
                color: isSelected ? '#00d4ff' : isToday ? '#00d4ff' : 'rgba(192,232,240,0.55)',
                fontSize: 8,
                fontFamily: 'monospace',
                border: isToday && !isSelected ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
              }}
            >
              {new Date(dateStr + 'T12:00:00').getDate()}
              {hasDot && (
                <span
                  className="rounded-full"
                  style={{ width: 3, height: 3, background: isSelected ? '#00d4ff' : 'rgba(0,212,255,0.4)', marginTop: 1 }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── BlockChip ─────────────────────────────────────────────────────────────────

function BlockChip({
  block,
  selected,
  hasConflict = false,
  onClick,
}: {
  block: CalendarBlock
  selected: boolean
  hasConflict?: boolean
  onClick: () => void
}) {
  const color = hasConflict ? '#ff6b35' : BLOCK_COLORS[block.type]
  const top = blockTop(block.startTime)
  const height = blockHeight(block.duration)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 cursor-pointer overflow-hidden group"
      style={{
        top,
        height,
        background: hasConflict ? 'rgba(255,107,53,0.12)' : `${BLOCK_COLORS[block.type]}18`,
        border: selected ? `1px solid ${color}` : block.locked ? `1px dashed ${color}55` : `1px solid ${color}44`,
        boxShadow: selected ? `0 0 8px ${color}44` : hasConflict ? '0 0 6px rgba(255,107,53,0.3)' : 'none',
        zIndex: selected ? 10 : 1,
      }}
    >
      <div className="flex items-center gap-1 truncate">
        {block.locked && <Lock className="w-2 h-2 flex-shrink-0" style={{ color: `${color}cc` }} />}
        {block.recurring && <RefreshCw className="w-2 h-2 flex-shrink-0" style={{ color: `${color}88` }} />}
        {block.linkedTaskId && <Link2 className="w-2 h-2 flex-shrink-0" style={{ color: `${color}88` }} />}
        <span className="text-[8px] font-mono truncate" style={{ color }}>
          {block.startTime} {block.title}
        </span>
      </div>
      {height > 36 && (
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className="text-[7px] font-mono px-1 py-0.5 rounded"
            style={{ background: `${color}22`, color: `${color}cc` }}
          >
            {BLOCK_TYPE_LABELS[block.type]}
          </span>
          <span className="text-[7px] font-mono" style={{ color: `${color}88` }}>
            {block.duration}m
          </span>
        </div>
      )}
    </motion.div>
  )
}

// ── BlockInspector ────────────────────────────────────────────────────────────

function BlockInspector({
  block,
  linkedTask,
  onClose,
  onDelete,
  onUnlink,
  onUpdate,
}: {
  block: CalendarBlock
  linkedTask: Task | undefined
  onClose: () => void
  onDelete: () => void
  onUnlink: () => void
  onUpdate: (patch: Partial<CalendarBlock>) => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [titleVal, setTitleVal] = useState(block.title)
  const [notesVal, setNotesVal] = useState(block.notes ?? '')
  const color = BLOCK_COLORS[block.type]

  function saveTitle() {
    if (titleVal.trim()) onUpdate({ title: titleVal.trim() })
    setEditingTitle(false)
  }
  function saveNotes() {
    onUpdate({ notes: notesVal || undefined })
    setEditingNotes(false)
  }

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
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}
      >
        <span className="text-[9px] font-mono tracking-widest" style={{ color: 'rgba(0,212,255,0.6)' }}>
          BLOCK INSPECTOR
        </span>
        <button onClick={onClose} style={{ color: 'rgba(192,232,240,0.35)' }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 px-3 py-3 space-y-3">
        {/* Type badge */}
        <span
          className="text-[8px] font-mono px-2 py-0.5 rounded"
          style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
        >
          {BLOCK_TYPE_LABELS[block.type]}
        </span>

        {/* Title */}
        <div>
          <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>TITLE</p>
          {editingTitle ? (
            <input
              className="w-full rounded px-2 py-1 text-[11px] font-mono outline-none"
              style={{ background: 'rgba(0,10,20,0.8)', border: `1px solid ${color}55`, color: 'rgba(192,232,240,0.9)' }}
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
              autoFocus
            />
          ) : (
            <p
              className="text-[11px] font-mono cursor-pointer hover:underline"
              style={{ color: 'rgba(192,232,240,0.9)' }}
              onClick={() => setEditingTitle(true)}
              title="Click to edit"
            >
              {block.title}
            </p>
          )}
        </div>

        {/* Date / Time */}
        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>DATE</p>
            <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.7)' }}>{block.date}</p>
          </div>
          <div className="flex-1">
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>TIME</p>
            <p className="text-[10px] font-mono flex items-center gap-1" style={{ color: 'rgba(192,232,240,0.7)' }}>
              <Clock className="w-2.5 h-2.5" />
              {block.startTime} · {block.duration}m
            </p>
          </div>
        </div>

        {/* Flags */}
        <div className="flex gap-2 flex-wrap">
          {block.locked && (
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ color: '#ffc84a', background: 'rgba(255,200,74,0.1)' }}>
              <Lock className="w-2 h-2" />
              LOCKED
            </span>
          )}
          {block.recurring && (
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.08)' }}>
              <RefreshCw className="w-2 h-2" />
              RECURRING
            </span>
          )}
          <span
            className="text-[8px] font-mono px-1.5 py-0.5 rounded cursor-pointer"
            style={{ color: block.flexible ? 'rgba(0,255,136,0.6)' : 'rgba(74,122,138,0.5)', background: block.flexible ? 'rgba(0,255,136,0.06)' : 'transparent' }}
            onClick={() => onUpdate({ flexible: !block.flexible })}
            title="Toggle flexible"
          >
            {block.flexible ? 'FLEXIBLE' : 'FIXED'}
          </span>
        </div>

        {/* Linked task */}
        {linkedTask && (
          <div>
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>LINKED TASK</p>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded"
              style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.12)' }}
            >
              <Link2 className="w-2.5 h-2.5 flex-shrink-0" style={{ color: '#00ff88' }} />
              <span className="text-[9px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.7)' }}>{linkedTask.title}</span>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>NOTES</p>
          {editingNotes ? (
            <textarea
              className="w-full rounded px-2 py-1 text-[10px] font-mono outline-none resize-none"
              style={{ background: 'rgba(0,10,20,0.8)', border: `1px solid ${color}44`, color: 'rgba(192,232,240,0.7)' }}
              rows={3}
              value={notesVal}
              onChange={(e) => setNotesVal(e.target.value)}
              onBlur={saveNotes}
              autoFocus
            />
          ) : (
            <p
              className="text-[10px] font-mono leading-relaxed cursor-pointer"
              style={{ color: block.notes ? 'rgba(192,232,240,0.55)' : 'rgba(74,122,138,0.3)' }}
              onClick={() => setEditingNotes(true)}
              title="Click to edit"
            >
              {block.notes ?? 'Add notes…'}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className="flex-shrink-0 px-3 py-3 space-y-2"
        style={{ borderTop: '1px solid rgba(0,212,255,0.08)' }}
      >
        <button
          onClick={() => onUpdate({ locked: !block.locked })}
          className="w-full py-1.5 rounded text-[9px] font-mono tracking-wider flex items-center justify-center gap-1.5"
          style={{
            background: block.locked ? 'rgba(255,196,74,0.06)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${block.locked ? 'rgba(255,196,74,0.2)' : 'rgba(255,255,255,0.08)'}`,
            color: block.locked ? '#ffc84a' : 'rgba(192,232,240,0.45)',
          }}
        >
          {block.locked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
          {block.locked ? 'UNLOCK BLOCK' : 'LOCK BLOCK'}
        </button>
        {linkedTask && (
          <button
            onClick={onUnlink}
            className="w-full py-1.5 rounded text-[9px] font-mono tracking-wider flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(192,232,240,0.45)' }}
          >
            <Link2 className="w-3 h-3" />
            UNLINK TASK
          </button>
        )}
        <button
          onClick={onDelete}
          className="w-full py-1.5 rounded text-[9px] font-mono tracking-wider flex items-center justify-center gap-1"
          style={{ background: 'rgba(255,107,53,0.06)', border: '1px solid rgba(255,107,53,0.18)', color: '#ff6b35' }}
        >
          <Trash2 className="w-3 h-3" />
          DELETE BLOCK
        </button>
      </div>
    </motion.div>
  )
}

// ── AddEventModal ─────────────────────────────────────────────────────────────

function AddEventModal({
  defaultDate,
  onClose,
  onSave,
}: {
  defaultDate: string
  onClose: () => void
  onSave: (b: CalendarBlock) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('10:00')
  const [duration, setDuration] = useState(60)
  const [type, setType] = useState<BlockType>('event')
  const [notes, setNotes] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  function handleSave() {
    if (!title.trim()) return
    const now = new Date().toISOString()
    onSave({
      id: uid('block'),
      title: title.trim(),
      date,
      startTime,
      duration,
      color: BLOCK_COLORS[type],
      type,
      locked: false,
      flexible: true,
      recurring: false,
      source: 'manual',
      notes: notes.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    })
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
        className="rounded-lg p-5 w-full max-w-sm space-y-4"
        style={{
          background: 'rgba(4,14,24,0.98)',
          border: '1px solid rgba(0,212,255,0.18)',
          boxShadow: '0 0 40px rgba(0,212,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest" style={{ color: '#00d4ff' }}>NEW BLOCK</span>
          <button onClick={onClose} style={{ color: 'rgba(192,232,240,0.35)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          ref={titleRef}
          className="w-full rounded-md px-3 py-2 text-sm font-mono outline-none"
          style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.18)', color: 'rgba(192,232,240,0.9)' }}
          placeholder="Event title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />

        <div className="flex gap-3">
          <div className="flex-1">
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>DATE</p>
            <input
              type="date"
              className="w-full rounded-md px-2.5 py-1.5 text-[10px] font-mono outline-none"
              style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.12)', color: 'rgba(192,232,240,0.8)' }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>START TIME</p>
            <input
              type="time"
              className="w-full rounded-md px-2.5 py-1.5 text-[10px] font-mono outline-none"
              style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.12)', color: 'rgba(192,232,240,0.8)' }}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        </div>

        {/* Duration */}
        <div>
          <p className="text-[9px] font-mono mb-1.5" style={{ color: 'rgba(74,122,138,0.5)' }}>DURATION</p>
          <div className="flex gap-1.5">
            {[30, 60, 90, 120].map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className="flex-1 py-1 rounded text-[9px] font-mono"
                style={{
                  background: duration === d ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${duration === d ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: duration === d ? '#00d4ff' : 'rgba(192,232,240,0.4)',
                }}
              >
                {d}m
              </button>
            ))}
          </div>
        </div>

        {/* Type */}
        <div>
          <p className="text-[9px] font-mono mb-1.5" style={{ color: 'rgba(74,122,138,0.5)' }}>TYPE</p>
          <div className="grid grid-cols-4 gap-1">
            {(Object.keys(BLOCK_COLORS) as BlockType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className="py-1 rounded text-[8px] font-mono"
                style={{
                  background: type === t ? `${BLOCK_COLORS[t]}22` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${type === t ? BLOCK_COLORS[t] : 'rgba(255,255,255,0.08)'}`,
                  color: type === t ? BLOCK_COLORS[t] : 'rgba(192,232,240,0.4)',
                }}
              >
                {BLOCK_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="text-[9px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.5)' }}>NOTES (optional)</p>
          <textarea
            className="w-full rounded-md px-3 py-1.5 text-[10px] font-mono outline-none resize-none"
            style={{ background: 'rgba(0,10,20,0.8)', border: '1px solid rgba(0,212,255,0.08)', color: 'rgba(192,232,240,0.7)' }}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
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
            onClick={handleSave}
            className="flex-1 py-1.5 rounded text-[9px] font-mono"
            style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', color: '#00d4ff' }}
          >
            SAVE
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── ScheduleModal (quick schedule from sidebar) ───────────────────────────────

function ScheduleModal({
  taskTitle,
  onClose,
  onSchedule,
}: {
  taskTitle: string
  onClose: () => void
  onSchedule: (date: string, startTime: string) => void
}) {
  const [date, setDate] = useState(today())
  const [time, setTime] = useState('10:00')

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

// ── TimeGrid (shared between week and day views) ──────────────────────────────

function TimeGrid({
  days,
  blocks,
  selectedId,
  currentTimeDate,
  conflictIds,
  onBlockClick,
}: {
  days: string[]
  blocks: CalendarBlock[]
  selectedId: string | null
  currentTimeDate: string
  conflictIds?: Set<string>
  onBlockClick: (id: string) => void
}) {
  const td = today()
  const gridRef = useRef<HTMLDivElement>(null)

  // Scroll to current time on mount
  useEffect(() => {
    const now = new Date()
    const topPx = ((now.getHours() - 7) + now.getMinutes() / 60) * HOUR_HEIGHT - 60
    gridRef.current?.scrollTo({ top: Math.max(0, topPx) })
  }, [])

  // Current time as fractional hours offset
  const nowOffset = useMemo(() => {
    const now = new Date()
    return ((now.getHours() - 7) + now.getMinutes() / 60) * HOUR_HEIGHT
  }, [])

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
      {/* Time gutter */}
      <div className="flex-shrink-0" style={{ width: 44 }}>
        {/* Header spacer */}
        <div style={{ height: 36 }} />
        {/* Hours */}
        {HOURS.map((h) => (
          <div
            key={h}
            className="flex items-start justify-end pr-2"
            style={{ height: HOUR_HEIGHT }}
          >
            <span className="text-[7px] font-mono -mt-1.5" style={{ color: 'rgba(74,122,138,0.45)' }}>
              {String(h).padStart(2, '0')}:00
            </span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      <div ref={gridRef} className="flex flex-1 min-w-0 overflow-x-auto overflow-y-auto">
        {days.map((dateStr) => {
          const isToday = dateStr === td
          const dayBlocks = blocks.filter((b) => b.date === dateStr)

          return (
            <div
              key={dateStr}
              className="flex flex-col flex-1 min-w-0"
              style={{ borderLeft: '1px solid rgba(0,212,255,0.06)', minWidth: days.length === 1 ? 200 : 100 }}
            >
              {/* Day header (sticky) */}
              <div
                className="flex flex-col items-center py-1.5 flex-shrink-0 sticky top-0 z-20"
                style={{
                  height: 36,
                  borderBottom: '1px solid rgba(0,212,255,0.08)',
                  background: isToday ? 'rgba(0,212,255,0.06)' : 'rgba(4,14,24,0.95)',
                  borderLeft: isToday ? '2px solid rgba(0,212,255,0.4)' : '2px solid transparent',
                }}
              >
                <p className="text-[7px] font-mono tracking-wider" style={{ color: isToday ? '#00d4ff' : 'rgba(74,122,138,0.55)' }}>
                  {new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                </p>
                <p className="text-[12px] font-mono font-medium" style={{ color: isToday ? '#00d4ff' : 'rgba(192,232,240,0.65)' }}>
                  {new Date(dateStr + 'T12:00:00').getDate()}
                </p>
              </div>

              {/* Hour rows + events */}
              <div className="relative">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{ height: HOUR_HEIGHT, borderBottom: '1px solid rgba(0,212,255,0.04)' }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && dateStr === currentTimeDate && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ top: nowOffset }}
                  >
                    <div className="relative flex items-center">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ff4444' }} />
                      <div className="flex-1 h-px" style={{ background: 'rgba(255,68,68,0.6)' }} />
                    </div>
                  </div>
                )}

                {/* Blocks */}
                <AnimatePresence initial={false}>
                  {dayBlocks.map((block) => (
                    <BlockChip
                      key={block.id}
                      block={block}
                      selected={selectedId === block.id}
                      hasConflict={conflictIds?.has(block.id) ?? false}
                      onClick={() => onBlockClick(block.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── AgendaView ────────────────────────────────────────────────────────────────

function AgendaView({
  blocks,
  tasks,
  selectedId,
  onBlockClick,
}: {
  blocks: CalendarBlock[]
  tasks: Task[]
  selectedId: string | null
  onBlockClick: (id: string) => void
}) {
  const td = today()

  // Group blocks by date, sorted chronologically
  const grouped = useMemo(() => {
    const sorted = [...blocks].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.startTime.localeCompare(b.startTime)
    })
    const map = new Map<string, CalendarBlock[]>()
    for (const b of sorted) {
      const arr = map.get(b.date) ?? []
      arr.push(b)
      map.set(b.date, arr)
    }
    return map
  }, [blocks])

  const dates = [...grouped.keys()].sort()

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {dates.length === 0 && (
        <p className="text-[10px] font-mono text-center py-12" style={{ color: 'rgba(74,122,138,0.4)' }}>No upcoming events</p>
      )}
      {dates.map((dateStr) => {
        const dayBlocks = grouped.get(dateStr) ?? []
        const isToday = dateStr === td
        return (
          <div key={dateStr}>
            <div
              className="flex items-center gap-2 mb-2 py-1 px-2 rounded"
              style={{
                background: isToday ? 'rgba(0,212,255,0.05)' : 'transparent',
                borderLeft: `3px solid ${isToday ? '#00d4ff' : 'rgba(74,122,138,0.2)'}`,
              }}
            >
              <p className="text-[9px] font-mono tracking-wider" style={{ color: isToday ? '#00d4ff' : 'rgba(192,232,240,0.5)' }}>
                {dayLabel(dateStr).toUpperCase()}
                {isToday && <span className="ml-2 text-[7px]" style={{ color: 'rgba(0,212,255,0.5)' }}>TODAY</span>}
              </p>
            </div>
            <div className="space-y-1.5 pl-2">
              {dayBlocks.map((block) => {
                const color = BLOCK_COLORS[block.type]
                const linked = block.linkedTaskId ? tasks.find((t) => t.id === block.linkedTaskId) : undefined
                return (
                  <motion.div
                    key={block.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.12 }}
                    onClick={() => onBlockClick(block.id)}
                    className="flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer group"
                    style={{
                      background: selectedId === block.id ? `${color}10` : 'rgba(255,255,255,0.025)',
                      border: selectedId === block.id ? `1px solid ${color}55` : '1px solid rgba(0,212,255,0.07)',
                    }}
                  >
                    <div className="flex-shrink-0 w-1 self-stretch rounded-full" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.85)' }}>{block.title}</span>
                        <span className="text-[7px] font-mono px-1 py-0.5 rounded" style={{ background: `${color}18`, color }}>
                          {BLOCK_TYPE_LABELS[block.type]}
                        </span>
                        {block.locked && <Lock className="w-2.5 h-2.5" style={{ color: '#ffc84a' }} />}
                        {block.recurring && <RefreshCw className="w-2.5 h-2.5" style={{ color: 'rgba(0,212,255,0.4)' }} />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[8px] font-mono flex items-center gap-0.5" style={{ color: 'rgba(74,122,138,0.55)' }}>
                          <Clock className="w-2 h-2" />
                          {block.startTime} · {block.duration}m
                        </span>
                        {linked && (
                          <span className="text-[8px] font-mono flex items-center gap-0.5" style={{ color: 'rgba(0,255,136,0.5)' }}>
                            <Link2 className="w-2 h-2" />
                            {linked.title.slice(0, 24)}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── NewCalendarTab ─────────────────────────────────────────────────────────────

export function NewCalendarTab() {
  const blocks = usePlannerStore((s) => s.blocks)
  const tasks = usePlannerStore((s) => s.tasks)
  const addBlock = usePlannerStore((s) => s.addBlock)
  const updateBlock = usePlannerStore((s) => s.updateBlock)
  const deleteBlock = usePlannerStore((s) => s.deleteBlock)
  const scheduleTask = usePlannerStore((s) => s.scheduleTask)
  const unscheduleTask = usePlannerStore((s) => s.unscheduleTask)
  const toggleLock = usePlannerStore((s) => s.toggleLock)
  const toggleFlexible = usePlannerStore((s) => s.toggleFlexible)
  const applyRebuiltBlocks = usePlannerStore((s) => s.applyRebuiltBlocks)

  const td = today()
  const [calView, setCalView] = useState<CalView>('week')
  const [viewDate, setViewDate] = useState(td)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null)
  const [showInsights, setShowInsights] = useState(true)

  // ── Navigation ───────────────────────────────────────────────────────────────
  function goToday() { setViewDate(td) }
  function goPrev() {
    if (calView === 'week') setViewDate(addDays(viewDate, -7))
    else setViewDate(addDays(viewDate, -1))
  }
  function goNext() {
    if (calView === 'week') setViewDate(addDays(viewDate, 7))
    else setViewDate(addDays(viewDate, 1))
  }

  // ── Week days ────────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const ws = getWeekStart(viewDate)
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  }, [viewDate])

  const days = calView === 'week' ? weekDays : [viewDate]

  // ── Range label ──────────────────────────────────────────────────────────────
  const rangeLabel = useMemo(() => {
    if (calView === 'day') return dayLabel(viewDate)
    return `${dayLabel(weekDays[0])} – ${dayLabel(weekDays[6])}`
  }, [calView, viewDate, weekDays])

  // ── Unscheduled tasks ────────────────────────────────────────────────────────
  const unscheduledTasks = useMemo(() => tasks.filter((t) => !t.scheduled && !t.completed), [tasks])

  // ── Mini calendar dot dates ──────────────────────────────────────────────────
  const dotDates = useMemo(() => new Set(blocks.map((b) => b.date)), [blocks])

  // ── Selected block + linked task ─────────────────────────────────────────────
  const selectedBlock = selectedBlockId ? blocks.find((b) => b.id === selectedBlockId) ?? null : null
  const linkedTask = selectedBlock?.linkedTaskId
    ? tasks.find((t) => t.id === selectedBlock.linkedTaskId)
    : undefined

  const scheduleTaskData = scheduleTaskId ? tasks.find((t) => t.id === scheduleTaskId) ?? null : null

  // ── Conflict detection ───────────────────────────────────────────────────────
  const conflicts = useMemo<ConflictInfo[]>(() => detectConflicts(blocks), [blocks])
  const conflictBlockIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>()
    conflicts.forEach((c) => { ids.add(c.blockAId); ids.add(c.blockBId) })
    return ids
  }, [conflicts])

  // ── Planner signals ───────────────────────────────────────────────────────────
  const [showInsightsState, setShowInsightsState] = useState(true)
  const plannerSignals = useMemo<PlannerSignal[]>(() => {
    if (!showInsightsState) return []
    return summaryToSignals(generatePlannerSummary(tasks, blocks))
  }, [tasks, blocks, showInsightsState])

  // ── Rebuild day ───────────────────────────────────────────────────────────────
  function handleRebuildDay(date: string) {
    const result = rebuildDay(date, tasks, blocks)
    if (result.success && result.data) {
      applyRebuiltBlocks(result.data)
    }
  }

  function handleUnlink() {
    if (!selectedBlock) return
    if (selectedBlock.linkedTaskId) {
      usePlannerStore.getState().updateTask(selectedBlock.linkedTaskId, { scheduled: false, linkedCalendarBlockId: undefined })
    }
    updateBlock(selectedBlock.id, { linkedTaskId: undefined })
  }

  function handleDeleteBlock(id: string) {
    const b = blocks.find((bl) => bl.id === id)
    if (b?.linkedTaskId) {
      usePlannerStore.getState().updateTask(b.linkedTaskId, { scheduled: false, linkedCalendarBlockId: undefined })
    }
    deleteBlock(id)
    if (selectedBlockId === id) setSelectedBlockId(null)
  }

  function handleScheduleTask(date: string, startTime: string) {
    if (!scheduleTaskId) return
    scheduleTask(scheduleTaskId, date, startTime)
    setScheduleTaskId(null)
  }

  return (
    <div className="flex flex-col h-full font-mono" style={{ background: 'rgba(0,10,20,0.6)' }}>
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}
      >
        {/* Today + nav */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={goToday}
            className="px-2.5 py-1 rounded text-[8px] font-mono tracking-wider"
            style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}
          >
            TODAY
          </button>
          <button onClick={goPrev} className="p-1.5 rounded" style={{ color: 'rgba(0,212,255,0.5)' }}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={goNext} className="p-1.5 rounded" style={{ color: 'rgba(0,212,255,0.5)' }}>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.5)' }}>
            {rangeLabel}
          </span>
        </div>

        {/* Title */}
        <div className="flex items-center gap-2 flex-1 justify-center">
          <CalendarDays className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
          <h2 className="text-[11px] font-mono tracking-[0.2em]" style={{ color: 'rgba(0,212,255,0.9)' }}>CALENDAR</h2>
        </div>

        {/* View toggles + add */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className="flex items-center rounded overflow-hidden"
            style={{ border: '1px solid rgba(0,212,255,0.12)', background: 'rgba(0,10,20,0.5)' }}
          >
            {(['week', 'day', 'agenda'] as CalView[]).map((v) => (
              <button
                key={v}
                onClick={() => setCalView(v)}
                className="px-2.5 py-1.5 text-[8px] font-mono tracking-wider"
                style={{
                  background: calView === v ? 'rgba(0,212,255,0.1)' : 'transparent',
                  color: calView === v ? '#00d4ff' : 'rgba(74,122,138,0.5)',
                }}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5"
            style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[9px] font-mono tracking-wider">ADD EVENT</span>
          </button>
        </div>
      </div>

      {/* ── JARVIS Intelligence bar ── */}
      <AnimatePresence>
        {showInsightsState && plannerSignals.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden flex-shrink-0"
          >
            <div
              className="flex items-start gap-3 px-4 py-2"
              style={{ borderBottom: '1px solid rgba(0,212,255,0.06)', borderLeft: '3px solid rgba(0,212,255,0.35)', background: 'rgba(0,212,255,0.03)' }}
            >
              <Sparkles className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#00d4ff' }} />
              <div className="flex-1 flex items-center gap-4 flex-wrap">
                {conflicts.length > 0 && (
                  <span className="text-[9px] font-mono" style={{ color: '#ff6b35' }}>
                    <Zap className="inline w-2.5 h-2.5 mr-0.5" />
                    {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} detected
                  </span>
                )}
                {plannerSignals.map((sig) => (
                  <span
                    key={sig.id}
                    className="text-[9px] font-mono"
                    style={{
                      color: sig.severity === 'error' ? '#ff6b35' : sig.severity === 'warning' ? '#ffc84a' : 'rgba(0,212,255,0.65)',
                    }}
                  >
                    {sig.message}
                    {sig.type === 'overload' && typeof sig.actionData?.date === 'string' && (
                      <button
                        onClick={() => handleRebuildDay(sig.actionData!.date as string)}
                        className="ml-2 px-1.5 py-0.5 rounded text-[7px]"
                        style={{ background: 'rgba(255,196,74,0.1)', border: '1px solid rgba(255,196,74,0.2)', color: '#ffc84a' }}
                      >
                        REBUILD
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <button onClick={() => setShowInsightsState(false)} style={{ color: 'rgba(192,232,240,0.25)', flexShrink: 0 }}>
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left sidebar ── */}
        <div
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{ width: 192, borderRight: '1px solid rgba(0,212,255,0.08)', background: 'rgba(0,6,14,0.5)' }}
        >
          {/* Mini month calendar */}
          <div style={{ borderBottom: '1px solid rgba(0,212,255,0.07)' }}>
            <MiniMonthCalendar
              selectedDate={viewDate}
              dotDates={dotDates}
              onSelectDate={(d) => setViewDate(d)}
            />
          </div>

          {/* Unscheduled tasks */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-2 py-2">
              <p className="text-[8px] font-mono tracking-widest mb-2" style={{ color: 'rgba(0,212,255,0.4)' }}>
                UNSCHEDULED ({unscheduledTasks.length})
              </p>
              {unscheduledTasks.length === 0 && (
                <p className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.3)' }}>All clear!</p>
              )}
              <div className="space-y-1">
                {unscheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-1.5 group rounded px-1.5 py-1"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,212,255,0.06)' }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background:
                          task.priority === 'high' ? '#ff6b35' :
                          task.priority === 'medium' ? '#ffc84a' : '#4a7a8a',
                      }}
                    />
                    <span className="flex-1 text-[8px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.65)' }}>
                      {task.title}
                    </span>
                    <button
                      onClick={() => setScheduleTaskId(task.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-0.5 rounded"
                      style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.08)' }}
                      title="Quick schedule"
                    >
                      <CalendarPlus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Main calendar area ── */}
        {calView !== 'agenda' ? (
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <TimeGrid
              days={days}
              blocks={blocks}
              selectedId={selectedBlockId}
              currentTimeDate={td}
              conflictIds={conflictBlockIds}
              onBlockClick={(id) => setSelectedBlockId(selectedBlockId === id ? null : id)}
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <AgendaView
              blocks={blocks}
              tasks={tasks}
              selectedId={selectedBlockId}
              onBlockClick={(id) => setSelectedBlockId(selectedBlockId === id ? null : id)}
            />
          </div>
        )}

        {/* ── Block Inspector ── */}
        <AnimatePresence>
          {selectedBlock && (
            <BlockInspector
              block={selectedBlock}
              linkedTask={linkedTask}
              onClose={() => setSelectedBlockId(null)}
              onDelete={() => handleDeleteBlock(selectedBlock.id)}
              onUnlink={handleUnlink}
              onUpdate={(patch) => updateBlock(selectedBlock.id, patch)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showAddModal && (
          <AddEventModal
            defaultDate={viewDate}
            onClose={() => setShowAddModal(false)}
            onSave={addBlock}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scheduleTaskData && (
          <ScheduleModal
            taskTitle={scheduleTaskData.title}
            onClose={() => setScheduleTaskId(null)}
            onSchedule={handleScheduleTask}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
