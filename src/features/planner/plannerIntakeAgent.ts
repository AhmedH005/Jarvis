import { addDays } from '@/lib/dateUtils'
import type { PlannerIntakeContext, PlannerIntakeEntity, PlannerIntakeResponse } from './plannerIntakeTypes'

// ── Keyword detection ──────────────────────────────────────────────────────────

const EVENT_KEYWORDS =
  /\b(meeting|meetings|call|calls|appointment|appointments|dentist|doctor|class|classes|event|events|interview|session|seminar|lecture|standup|stand-up|sync|check-in|exam|presentation|demo)\b/i

const TASK_KEYWORDS =
  /\b(due|deadline|homework|assignment|essay|submit|finish|report|complete|turn\s+in|hand\s+in|project)\b/i

// Planner optimizer commands — these must NOT be captured by the intake agent
const PLANNER_COMMANDS =
  /\b(schedule\s+my|optimize|rearrange|rebuild|plan\s+my|protect\s+(focus|my)|focus\s+time)\b/i

// Month lookup
const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

// Day names in order
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// ── Date extraction ────────────────────────────────────────────────────────────

function parseDate(segment: string, currentDate: string): string | null {
  const s = segment.toLowerCase()
  const base = new Date(currentDate + 'T12:00:00')

  if (s.includes('today'))    return currentDate
  if (s.includes('tomorrow')) return addDays(currentDate, 1)
  if (s.includes('next week')) return addDays(currentDate, 7)
  if (s.includes('this week')) return addDays(currentDate, 3) // mid-week heuristic

  // Named weekdays: "Monday", "next Monday", "this Friday"
  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (s.includes(DAY_NAMES[i])) {
      const d = new Date(base)
      let diff = i - d.getDay()
      if (diff <= 0) diff += 7  // always go to next future occurrence
      d.setDate(d.getDate() + diff)
      return d.toISOString().split('T')[0]
    }
  }

  // "April 4th", "April 4", "May 7", "apr 3"
  const m1 = s.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  )
  if (m1) {
    const month = MONTH_MAP[m1[1]]
    const day   = parseInt(m1[2])
    const year  = base.getFullYear()
    const d     = new Date(year, month, day)
    // If the date has passed, use next year
    if (d.getTime() < base.getTime() - 86400000) d.setFullYear(year + 1)
    return d.toISOString().split('T')[0]
  }

  // "7th of May", "7 May", "7th may"
  const m2 = s.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/,
  )
  if (m2) {
    const day   = parseInt(m2[1])
    const month = MONTH_MAP[m2[2]]
    const year  = base.getFullYear()
    const d     = new Date(year, month, day)
    if (d.getTime() < base.getTime() - 86400000) d.setFullYear(year + 1)
    return d.toISOString().split('T')[0]
  }

  return null
}

// ── Time extraction ────────────────────────────────────────────────────────────

function parseTime(segment: string): string | null {
  const s = segment.toLowerCase()

  // "noon" → 12:00, "midnight" → 00:00
  if (/\bnoon\b/.test(s)) return '12:00'
  if (/\bmidnight\b/.test(s)) return '00:00'

  // "3pm", "3:30pm", "10:30am", "10am"
  const m1 = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  if (m1) {
    let h = parseInt(m1[1])
    const m = m1[2] ? parseInt(m1[2]) : 0
    if (m1[3] === 'pm' && h !== 12) h += 12
    if (m1[3] === 'am' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // "14:00", "09:30"
  const m2 = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  if (m2) return `${String(parseInt(m2[1])).padStart(2, '0')}:${m2[2]}`

  // "at 2", "at 3" — bare number after "at", assume PM for 1–11
  const m3 = s.match(/\bat\s+(\d{1,2})\b(?!\s*:)/)
  if (m3) {
    let h = parseInt(m3[1])
    if (h >= 1 && h <= 11) h += 12
    return `${String(h).padStart(2, '0')}:00`
  }

  return null
}

// ── Title extraction ───────────────────────────────────────────────────────────

function extractTitle(segment: string, kind: 'event' | 'task'): string {
  let s = segment.trim()

  // Strip leading phrases (case-insensitive, preserve original casing for the title)
  s = s.replace(
    /^(?:I have|I've got|I got|there's|there is|I need to|I have to|I am|I'm|reminder:?|add:?)\s+(?:a|an|my|the)?\s*/i,
    '',
  )

  // For tasks, strip trailing "due ...", "by ...", "deadline ..."
  if (kind === 'task') {
    s = s.replace(/\s+due\b.*/i, '')
    s = s.replace(/\s+by\b.*/i, '')
    s = s.replace(/\s+deadline\b.*/i, '')
  }

  // Strip date/time phrases — named weekdays
  s = s.replace(
    /\s+(?:on\s+)?(?:next\s+|this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*/i,
    '',
  )
  // today / tomorrow / next week / this week
  s = s.replace(/\s+(?:on\s+)?(?:today|tomorrow|next\s+week|this\s+week)\b.*/i, '')
  // "on April 4th", "on may 7"
  s = s.replace(
    /\s+(?:on\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d.*/i,
    '',
  )
  // "7th of May", "7 may"
  s = s.replace(/\s+(?:on\s+)?\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?\w+\b.*$/i, '')
  // "at 3pm", "at 14:00"
  s = s.replace(/\s+at\s+\d.*/i, '')
  // bare "HH:MM"
  s = s.replace(/\s+\d{1,2}:\d{2}\b.*/i, '')

  // Strip leading articles/possessives that are now exposed
  s = s.replace(/^(?:a|an|the|my)\s+/i, '')
  s = s.trim()

  if (!s) return kind === 'event' ? 'New Event' : 'New Task'

  // Capitalise first letter; preserve the rest of the original casing
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Segment classification ─────────────────────────────────────────────────────

function classifySegment(segment: string): 'event' | 'task' | 'unknown' {
  const s   = segment.toLowerCase()
  const hasEvent = EVENT_KEYWORDS.test(s)
  const hasTask  = TASK_KEYWORDS.test(s)
  const hasTime  = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\bat\s+\d{1,2}\b/.test(s)

  if (hasEvent && !hasTask) return 'event'
  if (hasTask  && !hasEvent) return 'task'
  // Both present: "due" keyword is the stronger signal for task
  if (hasEvent && hasTask) return /\bdue\b/i.test(s) ? 'task' : 'event'
  // A bare time reference with no task keywords leans event
  if (hasTime) return 'event'
  return 'unknown'
}

// ── Entity builder ─────────────────────────────────────────────────────────────

function buildEntity(
  segment: string,
  kind: 'event' | 'task',
  currentDate: string,
  warnings: string[],
): PlannerIntakeEntity | null {
  const date  = parseDate(segment, currentDate)
  const time  = parseTime(segment)
  const title = extractTitle(segment, kind)

  if (kind === 'event') {
    if (!date) {
      warnings.push(`Could not determine a date for "${title.slice(0, 30)}"`)
      return null
    }
    const startTime  = time ?? '09:00'
    const confidence = time ? 0.9 : 0.65
    if (!time) warnings.push(`No time found for "${title}" — defaulted to 09:00`)
    return {
      type: 'event',
      title,
      date,
      startTime,
      durationMinutes: 60,
      locked: true,
      confidence,
    }
  }

  // task
  const hasDueKeyword = /\bdue\b/i.test(segment)
  const confidence    = hasDueKeyword && date ? 0.9 : date ? 0.75 : 0.55
  return {
    type: 'task',
    title,
    dueDate: date ?? null,
    durationMinutes: null,
    priority: null,
    energyType: null,
    confidence,
  }
}

// ── Date formatting helpers (used for summary) ─────────────────────────────────

export function formatIntakeDateLabel(dateStr: string, currentDate: string): string {
  if (dateStr === currentDate)          return 'Today'
  if (dateStr === addDays(currentDate, 1)) return 'Tomorrow'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatIntakeTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── Intent detection ───────────────────────────────────────────────────────────

/**
 * Returns true when the input looks like life-input (events / tasks with dates)
 * rather than a planner optimizer command.
 */
export function isIntakeIntent(input: string): boolean {
  const s = input.toLowerCase().trim()

  // Let the planner command router handle optimizer phrases
  if (PLANNER_COMMANDS.test(s)) return false
  if (s.includes('?')) return false
  if (/^(what|when|where|why|who|how|can|could|would|should|do|does|did|is|are|am|show|list)\b/i.test(s)) {
    return false
  }

  const hasEvent = EVENT_KEYWORDS.test(s)
  const hasTask  = TASK_KEYWORDS.test(s)
  const hasDate  =
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(?:st|nd|rd|th)?\s+of\s+\w+|next\s+week|this\s+week)\b/i.test(s)

  return (hasEvent || hasTask) && hasDate
}

// ── Main entry point ───────────────────────────────────────────────────────────

/**
 * Parse free-form life input and return a previewable PlannerIntakeResponse.
 * Does NOT mutate any store — callers must apply after user confirmation.
 */
export async function handlePlannerIntake(
  input: string,
  context: PlannerIntakeContext,
): Promise<PlannerIntakeResponse> {
  const warnings: string[] = []
  const entities: PlannerIntakeEntity[] = []

  // Split on natural conjunctions to handle mixed inputs
  // e.g. "meeting tomorrow at 3 and homework due next week"
  const segments = input
    .split(/\s+and\s+|\s+also\s+|\s+plus\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)

  for (const seg of segments) {
    const kind = classifySegment(seg)
    if (kind === 'unknown') {
      // Don't warn on short filler words like "and" remnants
      if (seg.length > 10) warnings.push(`Unclear intent in: "${seg.slice(0, 40)}"`)
      continue
    }
    const entity = buildEntity(seg, kind, context.currentDate, warnings)
    if (entity) entities.push(entity)
  }

  if (entities.length === 0) {
    return {
      kind:                 'unknown',
      entities:             [],
      summary:              "I couldn't extract any events or tasks from that. Could you be more specific? Try: \"Meeting with Sarah on Friday at 2pm\" or \"Homework due next Monday\".",
      requiresConfirmation: false,
      warnings,
      source:               'fallback',
    }
  }

  const hasEvent = entities.some((e) => e.type === 'event')
  const hasTask  = entities.some((e) => e.type === 'task')
  const kind: PlannerIntakeResponse['kind'] =
    hasEvent && hasTask ? 'mixed' :
    hasEvent            ? 'event' :
    hasTask             ? 'task'  : 'unknown'

  const minConfidence  = Math.min(...entities.map((e) => e.confidence))
  const requiresConfirmation = minConfidence < 0.7 || warnings.length > 0

  // Build a chat-friendly summary using markdown
  const parts = entities.map((e) => {
    if (e.type === 'event') {
      const dateLabel = formatIntakeDateLabel(e.date, context.currentDate)
      return `**${e.title}** — ${dateLabel} at ${formatIntakeTime(e.startTime)}`
    }
    const dueLabel = e.dueDate
      ? `due ${formatIntakeDateLabel(e.dueDate, context.currentDate)}`
      : 'no due date set'
    return `**${e.title}** — ${dueLabel}`
  })

  const summary =
    entities.length === 1
      ? `Got it — here's what I found:\n${parts[0]}\n\nConfirm below to add it to your planner.`
      : `Got it — here are ${entities.length} items:\n${parts.map((p) => `· ${p}`).join('\n')}\n\nConfirm below to add them to your planner.`

  return {
    kind,
    entities,
    summary,
    requiresConfirmation,
    warnings,
    source: 'fallback',
  }
}
