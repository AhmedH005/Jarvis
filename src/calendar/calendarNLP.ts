/**
 * Calendar NLP coordination layer.
 *
 * Sits between the Jarvis message pipeline and the calendar action API.
 * Responsibilities:
 *  1. Detect calendar intent (fast heuristic, no async)
 *  2. Call the multi-intent interpreter (LLM → deterministic fallback)
 *  3. Execute the resulting action plan via calendarActions.ts
 *  4. Update the session context for follow-up commands
 *  5. Return a formatted text response
 */

import {
  createEvent,
  updateEvent,
  moveEvent,
  deleteEvent,
  listEvents,
  createRecurringEvents,
} from './calendarActions'
import { interpretCalendarInput } from './calendarInterpreter'
import type { PlannedAction, BulkMovePlan, UpdateEventPlan } from './calendarInterpreter'
import { getSession, patchSession, getPendingPlan, setPendingPlan, clearPendingPlan } from './calendarContext'
import type { PendingPlan } from './calendarContext'
import { useCalendarStore } from '@/store/calendarStore'
import type { CalendarEvent } from './calendarTypes'
import { today, addDays } from '@/lib/dateUtils'

// ── Intent detection (fast, synchronous) ──────────────────────────────────────

const CALENDAR_SIGNALS = [
  /\b(add|create|schedule|book|set\s+up|set)\b.*(meeting|call|event|appointment|reminder|block|standup|sync|class|session|demo|interview|prayer|gym|dinner|lunch|birthday)/i,
  /\b(add|create|schedule|book|set)\s+.+\s+(at|on|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /\b(move|shift|reschedule|push|change)\b.*(meeting|event|appointment|call|block|that|it)/i,
  /\b(delete|remove|cancel)\b.*(event|meeting|appointment|call)/i,
  /\b(show|list|what('s| is)|display|view|get)\b.*(event|meeting|schedule|calendar|today|tomorrow|this week)/i,
  /\b(every|each|daily|weekly|repeat|recurring)\b.*\b(day|week|weekday|morning|evening|monday|tuesday|wednesday|thursday|friday)/i,
  /\bfor\s+(?:the\s+)?next\s+\d+\s+(days?|weeks?)\b/i,
  /\b(move|shift)\s+all\b/i,
  /\beverything(\s+else)?\b.*\b(later|to)\b/i,
  /\bdon'?t\s+touch\b.*\b(move|shift|just)\b/i,
  /\b(assignment|homework|essay)\s+(due|by|on)\b/i,
  /\bdue\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
]

export function isCalendarIntent(input: string): boolean {
  // Always route to calendar handler when a pending plan awaits confirmation
  if (getPendingPlan()) return true
  return CALENDAR_SIGNALS.some((re) => re.test(input))
}

// ── Result type ────────────────────────────────────────────────────────────────

export interface CalendarNLPResult {
  handled: true
  summary: string
  events?: CalendarEvent[]
  requiresConfirmation?: boolean
  confirmationPrompt?: string
}

export interface CalendarNLPUnhandled {
  handled: false
}

export type CalendarNLPResponse = CalendarNLPResult | CalendarNLPUnhandled

// ── Execution helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const t = today()
  if (dateStr === t) return 'today'
  if (dateStr === addDays(t, 1)) return 'tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(isoOrHHMM: string): string {
  if (isoOrHHMM.includes('T')) {
    return new Date(isoOrHHMM).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  const [h, m] = isoOrHHMM.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

async function executeCreateEvent(action: Extract<PlannedAction, { type: 'create_event' }>): Promise<{ summary: string; events: CalendarEvent[] }> {
  const [h, m] = (action.time ?? '09:00').split(':').map(Number)
  const startDt = new Date(`${action.date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
  const endDt = new Date(startDt.getTime() + action.duration * 60_000)

  const result = createEvent({
    title: action.title,
    start: startDt.toISOString().replace(/\.\d{3}Z$/, ''),
    end: endDt.toISOString().replace(/\.\d{3}Z$/, ''),
    notes: action.notes,
    source: 'jarvis',
  })

  if (!result.success) return { summary: `Failed to create "${action.title}": ${result.error}`, events: [] }

  const timeLabel = action.time ? ` at ${formatTime(action.time)}` : ''
  return {
    summary: `Created "${action.title}" on ${formatDate(action.date)}${timeLabel}.`,
    events: [result.data],
  }
}

async function executeCreateTask(action: Extract<PlannedAction, { type: 'create_task' }>): Promise<{ summary: string }> {
  // Create as a CalendarEvent with allDay=true (portable, no planner store coupling)
  const result = createEvent({
    title: `📌 ${action.title}`,
    start: action.dueDate,
    end: action.dueDate,
    allDay: true,
    notes: action.notes,
    source: 'jarvis',
    metadata: { isTask: true, dueDate: action.dueDate },
  })

  if (!result.success) return { summary: `Failed to create task "${action.title}": ${result.error}` }
  return { summary: `Created task "${action.title}" due ${formatDate(action.dueDate)}.` }
}

async function executeCreateRecurring(action: Extract<PlannedAction, { type: 'create_recurring' }>): Promise<{ summary: string; events: CalendarEvent[] }> {
  const [h, m] = action.time.split(':').map(Number)
  const startDt = new Date(`${action.startDate}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
  const endDt = new Date(startDt.getTime() + action.duration * 60_000)

  const result = createRecurringEvents(
    {
      title: action.title,
      start: startDt.toISOString().replace(/\.\d{3}Z$/, ''),
      end: endDt.toISOString().replace(/\.\d{3}Z$/, ''),
      source: 'jarvis',
    },
    action.rule
  )

  if (!result.success) return { summary: `Failed to create recurring "${action.title}": ${result.error}`, events: [] }

  const count = result.data.length
  const ruleLabel = action.rule.daysOfWeek?.length
    ? `${action.rule.daysOfWeek.map((d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join('/')} `
    : action.rule.frequency === 'daily' ? 'daily ' : 'weekly '
  return {
    summary: `Created ${count} recurring "${action.title}" events (${ruleLabel}at ${formatTime(action.time)}).`,
    events: result.data,
  }
}

async function executeUpdateEvent(action: UpdateEventPlan, session: ReturnType<typeof getSession>): Promise<{ summary: string; events: CalendarEvent[] }> {
  const { events } = useCalendarStore.getState()

  // Resolve target events
  let targets: CalendarEvent[] = []

  if (action.eventIds?.length) {
    targets = events.filter((e) => action.eventIds!.includes(e.id))
  } else if (action.titleHint) {
    const hint = action.titleHint.toLowerCase()
    const candidate = events.find((e) => e.title.toLowerCase().includes(hint))
    if (candidate) targets = [candidate]
  } else if (session?.lastEvents?.length) {
    targets = session.lastEvents.filter((e) => events.some((ev) => ev.id === e.id))
  }

  if (!targets.length) {
    return { summary: 'Could not find the event to update. Can you be more specific?', events: [] }
  }

  const updated: CalendarEvent[] = []
  for (const ev of targets) {
    let newStart: string
    let newEnd: string
    const durationMs = new Date(ev.end).getTime() - new Date(ev.start).getTime()

    if (action.newTime) {
      const [h, m] = action.newTime.split(':').map(Number)
      const date = ev.start.slice(0, 10)
      newStart = `${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
      newEnd = new Date(new Date(newStart).getTime() + durationMs).toISOString().replace(/\.\d{3}Z$/, '')
    } else if (action.offsetMinutes !== undefined) {
      const offsetMs = action.offsetMinutes * 60_000
      newStart = new Date(new Date(ev.start).getTime() + offsetMs).toISOString().replace(/\.\d{3}Z$/, '')
      newEnd = new Date(new Date(ev.end).getTime() + offsetMs).toISOString().replace(/\.\d{3}Z$/, '')
    } else {
      continue
    }

    const result = moveEvent(ev.id, newStart, newEnd)
    if (result.success) updated.push(result.data)
  }

  if (!updated.length) return { summary: 'No events were updated.', events: [] }

  const label = updated.length === 1
    ? `"${updated[0].title}" moved to ${formatTime(updated[0].start)}`
    : `${updated.length} events updated`
  return { summary: `${label}.`, events: updated }
}

async function executeDeleteEvent(action: Extract<PlannedAction, { type: 'delete_event' }>): Promise<{ summary: string }> {
  const { events } = useCalendarStore.getState()
  const hint = action.titleHint.toLowerCase()
  const candidate = events.find((e) => {
    const titleMatch = e.title.toLowerCase().includes(hint)
    const dateMatch = !action.dateHint || e.start.startsWith(action.dateHint)
    return titleMatch && dateMatch
  })

  if (!candidate) {
    return { summary: `Could not find an event matching "${action.titleHint}". Be more specific?` }
  }

  const result = deleteEvent(candidate.id)
  if (!result.success) return { summary: `Failed to delete: ${result.error}` }
  return { summary: `Deleted "${candidate.title}" (${formatDate(candidate.start.slice(0, 10))}).` }
}

async function executeBulkMove(action: BulkMovePlan): Promise<{ summary: string; events: CalendarEvent[] }> {
  const { events } = useCalendarStore.getState()

  // Build candidate set
  let candidates = events.filter((e) => {
    if (e.allDay) return false
    const d = e.start.slice(0, 10)
    if (d < action.dateFrom || d > action.dateTo) return false
    return true
  })

  // Apply time range filter
  if (action.timeRange) {
    candidates = candidates.filter((e) => {
      const h = new Date(e.start).getHours()
      if (action.timeRange === 'morning')   return h >= 5 && h < 12
      if (action.timeRange === 'afternoon') return h >= 12 && h < 17
      if (action.timeRange === 'evening')   return h >= 17
      return true
    })
  }

  // Apply exclusion patterns
  if (action.excludePatterns?.length) {
    candidates = candidates.filter((e) =>
      !action.excludePatterns!.some((p) => e.title.toLowerCase().includes(p.toLowerCase()))
    )
  }

  // Skip locked events
  const skipped: string[] = []
  const toMove = candidates.filter((e) => {
    if (e.locked) { skipped.push(`"${e.title}" (locked)`); return false }
    return true
  })

  if (!toMove.length) {
    return {
      summary: skipped.length
        ? `No moveable events found (${skipped.length} skipped: ${skipped.join(', ')}).`
        : 'No matching events to move.',
      events: [],
    }
  }

  const moved: CalendarEvent[] = []

  for (const ev of toMove) {
    const durationMs = new Date(ev.end).getTime() - new Date(ev.start).getTime()
    let newStart: string

    if (action.targetTime) {
      const [h, m] = action.targetTime.split(':').map(Number)
      const date = ev.start.slice(0, 10)
      newStart = `${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
    } else if (action.offsetMinutes !== undefined) {
      newStart = new Date(new Date(ev.start).getTime() + action.offsetMinutes * 60_000)
        .toISOString().replace(/\.\d{3}Z$/, '')
    } else {
      continue
    }

    const newEnd = new Date(new Date(newStart).getTime() + durationMs)
      .toISOString().replace(/\.\d{3}Z$/, '')
    const result = moveEvent(ev.id, newStart, newEnd)
    if (result.success) moved.push(result.data)
  }

  const targetLabel = action.targetTime
    ? `to ${formatTime(action.targetTime)}`
    : action.offsetMinutes !== undefined
      ? `${action.offsetMinutes > 0 ? '+' : ''}${action.offsetMinutes} min`
      : 'later'

  const skipNote = skipped.length ? ` (${skipped.length} skipped)` : ''
  return {
    summary: `Moved ${moved.length} event${moved.length !== 1 ? 's' : ''} ${targetLabel}${skipNote}.`,
    events: moved,
  }
}

async function executeListEvents(action: Extract<PlannedAction, { type: 'list_events' }>): Promise<{ summary: string; events: CalendarEvent[] }> {
  const result = listEvents({ from: action.dateFrom, to: action.dateTo })
  if (!result.success) return { summary: 'Failed to list events.', events: [] }

  const evs = result.data
  if (!evs.length) {
    const label = action.dateFrom === action.dateTo ? formatDate(action.dateFrom) : `${formatDate(action.dateFrom)} – ${formatDate(action.dateTo)}`
    return { summary: `No events for ${label}.`, events: [] }
  }

  const label = action.dateFrom === action.dateTo
    ? formatDate(action.dateFrom)
    : `${formatDate(action.dateFrom)} – ${formatDate(action.dateTo)}`

  const lines = evs.map((e) => {
    const timeLabel = e.allDay ? 'all day' : formatTime(e.start)
    return `• ${e.title} — ${timeLabel}`
  })

  return {
    summary: `**${label}** (${evs.length} event${evs.length !== 1 ? 's' : ''}):\n${lines.join('\n')}`,
    events: evs,
  }
}

// ── Action preview formatter ────────────────────────────────────────────────────

function formatActionPreview(action: PlannedAction, index: number): string {
  switch (action.type) {
    case 'create_event':
      return `${index}. Create "${action.title}" on ${formatDate(action.date)}${action.time ? ` at ${formatTime(action.time)}` : ''}`
    case 'create_task':
      return `${index}. Task: "${action.title}" due ${formatDate(action.dueDate)}`
    case 'create_recurring': {
      const ruleLabel = action.rule.daysOfWeek?.length
        ? action.rule.daysOfWeek.map((d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join('/')
        : action.rule.frequency
      return `${index}. Recurring "${action.title}" (${ruleLabel} at ${formatTime(action.time)}, ×${action.rule.count ?? '?'})`
    }
    case 'update_event': {
      const who = action.titleHint ? ` "${action.titleHint}"` : ''
      if (action.newTime) return `${index}. Move${who} to ${formatTime(action.newTime)}`
      if (action.offsetMinutes !== undefined) return `${index}. Shift${who} ${action.offsetMinutes > 0 ? '+' : ''}${action.offsetMinutes} min`
      return `${index}. Update event${who}`
    }
    case 'delete_event':
      return `${index}. Delete "${action.titleHint}"${action.dateHint ? ` on ${formatDate(action.dateHint)}` : ''}`
    case 'bulk_move': {
      const rangeLabel = `${formatDate(action.dateFrom)}–${formatDate(action.dateTo)}`
      const toLabel = action.targetTime ? ` → ${formatTime(action.targetTime)}` : action.offsetMinutes !== undefined ? ` +${action.offsetMinutes}min` : ''
      const excl = action.excludePatterns?.length ? ` (skip: ${action.excludePatterns.join(', ')})` : ''
      return `${index}. Move ${action.timeRange ?? 'all'} events ${rangeLabel}${toLabel}${excl}`
    }
    case 'list_events':
      return `${index}. Show events ${formatDate(action.dateFrom)}–${formatDate(action.dateTo)}`
  }
}

// ── Shared execution helper ─────────────────────────────────────────────────────

async function executeActions(
  actions: PlannedAction[],
  warnings: string[],
  session: ReturnType<typeof getSession>
): Promise<{ summaries: string[]; allEvents: CalendarEvent[] }> {
  const summaries: string[] = []
  const allEvents: CalendarEvent[] = []

  for (const action of actions) {
    switch (action.type) {
      case 'create_event': {
        const r = await executeCreateEvent(action)
        summaries.push(r.summary)
        allEvents.push(...r.events)
        break
      }
      case 'create_task': {
        const r = await executeCreateTask(action)
        summaries.push(r.summary)
        break
      }
      case 'create_recurring': {
        const r = await executeCreateRecurring(action)
        summaries.push(r.summary)
        allEvents.push(...r.events)
        break
      }
      case 'update_event': {
        const r = await executeUpdateEvent(action, session)
        summaries.push(r.summary)
        allEvents.push(...r.events)
        break
      }
      case 'delete_event': {
        const r = await executeDeleteEvent(action)
        summaries.push(r.summary)
        break
      }
      case 'bulk_move': {
        const r = await executeBulkMove(action)
        summaries.push(r.summary)
        allEvents.push(...r.events)
        break
      }
      case 'list_events': {
        const r = await executeListEvents(action)
        summaries.push(r.summary)
        allEvents.push(...r.events)
        break
      }
    }
  }

  if (warnings.length) {
    summaries.push(`⚠ ${warnings.join('; ')}`)
  }

  return { summaries, allEvents }
}

// ── Main entry point ───────────────────────────────────────────────────────────

export async function handleCalendarIntent(input: string): Promise<CalendarNLPResponse> {
  const session = getSession()

  // ── Pending plan confirm/cancel ──────────────────────────────────────────────
  const pending = getPendingPlan()
  if (pending) {
    const trimmed = input.trim().toLowerCase()
    const isConfirm = /^(yes|confirm|do it|go ahead|ok|sure|proceed|yep|yeah)\.?$/i.test(trimmed)
    const isCancel  = /^(no|cancel|stop|nope|never mind|nevermind|abort)\.?$/i.test(trimmed)

    if (isConfirm) {
      clearPendingPlan()
      const { summaries, allEvents } = await executeActions(pending.actions, [], session)
      patchSession({ lastEvents: allEvents.slice(0, 10), lastActionTypes: pending.actions.map((a) => a.type) })
      return { handled: true, summary: summaries.join('\n'), events: allEvents.length ? allEvents : undefined }
    }
    if (isCancel) {
      clearPendingPlan()
      return { handled: true, summary: 'Cancelled. Nothing was changed.' }
    }
    // Not a confirm/cancel — fall through to interpret as a new request, clearing pending
    clearPendingPlan()
  }

  // ── Interpret ────────────────────────────────────────────────────────────────
  const interpretation = await interpretCalendarInput(input, session)

  // Clarification needed — return question without executing
  if (interpretation.needsClarification) {
    return {
      handled: true,
      summary: interpretation.clarificationQuestion ?? 'Can you be more specific?',
    }
  }

  // Nothing recognized
  if (!interpretation.success || !interpretation.actions.length) {
    return { handled: false }
  }

  // ── Preview for large plans (3+ actions) ────────────────────────────────────
  const PREVIEW_THRESHOLD = 3
  if (interpretation.actions.length >= PREVIEW_THRESHOLD) {
    const previewLines = interpretation.actions.map((a, i) => formatActionPreview(a, i + 1))
    const warnNote = interpretation.warnings.length ? `\n⚠ ${interpretation.warnings.join('; ')}` : ''
    const previewText = `Here's what I'll do:\n${previewLines.join('\n')}${warnNote}\n\nConfirm? (yes / no)`

    const plan: PendingPlan = {
      actions: interpretation.actions,
      originalInput: input,
      previewText,
      createdAt: Date.now(),
    }
    setPendingPlan(plan)

    return {
      handled: true,
      summary: previewText,
      requiresConfirmation: true,
      confirmationPrompt: previewText,
    }
  }

  // ── Execute (1–2 actions — run immediately) ──────────────────────────────────
  const { summaries, allEvents } = await executeActions(interpretation.actions, interpretation.warnings, session)

  // Update session context for follow-up commands
  patchSession({
    lastEvents: allEvents.slice(0, 10),
    lastActionTypes: interpretation.actions.map((a) => a.type),
  })

  return {
    handled: true,
    summary: summaries.join('\n'),
    events: allEvents.length ? allEvents : undefined,
  }
}
