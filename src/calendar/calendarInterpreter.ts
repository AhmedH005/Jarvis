/**
 * Multi-intent calendar interpreter.
 *
 * Primary path: LLM-powered (uses window.jarvis.llm to get structured JSON).
 * Fallback path: deterministic rule-based interpreter for when LLM is unavailable.
 *
 * The interpreter ONLY produces action plans — it does NOT execute them.
 * Execution happens in calendarNLP.ts via calendarActions.ts.
 */

import { today, addDays } from '@/lib/dateUtils'
import type { RecurrenceRule } from './calendarTypes'
import type { CalendarSession } from './calendarContext'

// ── Action plan types ──────────────────────────────────────────────────────────

export type PlannedActionType =
  | 'create_event'
  | 'create_task'
  | 'create_recurring'
  | 'update_event'
  | 'delete_event'
  | 'bulk_move'
  | 'list_events'

export interface CreateEventPlan {
  type: 'create_event'
  title: string
  date: string          // YYYY-MM-DD
  time?: string         // HH:MM 24h — undefined triggers clarification
  duration: number      // minutes
  notes?: string
}

export interface CreateTaskPlan {
  type: 'create_task'
  title: string
  dueDate: string       // YYYY-MM-DD
  notes?: string
}

export interface CreateRecurringPlan {
  type: 'create_recurring'
  title: string
  startDate: string
  time: string          // HH:MM 24h
  duration: number
  rule: RecurrenceRule
}

export interface UpdateEventPlan {
  type: 'update_event'
  /** IDs from session context, if resolved */
  eventIds?: string[]
  /** Fuzzy title to find event when ID is unknown */
  titleHint?: string
  /** Shift start/end by this many minutes */
  offsetMinutes?: number
  /** Move to this exact time HH:MM */
  newTime?: string
}

export interface DeleteEventPlan {
  type: 'delete_event'
  titleHint: string
  dateHint?: string
}

export interface BulkMovePlan {
  type: 'bulk_move'
  dateFrom: string
  dateTo: string
  timeRange?: 'morning' | 'afternoon' | 'evening' | null
  excludePatterns?: string[]
  /** Shift each event by this many minutes (used when no explicit targetTime) */
  offsetMinutes?: number
  /** Move events to this clock time HH:MM (computed per-event) */
  targetTime?: string | null
}

export interface ListEventsPlan {
  type: 'list_events'
  dateFrom: string
  dateTo: string
}

export type PlannedAction =
  | CreateEventPlan
  | CreateTaskPlan
  | CreateRecurringPlan
  | UpdateEventPlan
  | DeleteEventPlan
  | BulkMovePlan
  | ListEventsPlan

export interface InterpreterResult {
  success: boolean
  actions: PlannedAction[]
  warnings: string[]
  needsClarification: boolean
  clarificationQuestion?: string
  /** true if the LLM path was used */
  usedLLM?: boolean
}

// ── LLM interpretation path ────────────────────────────────────────────────────

function buildLLMPrompt(input: string, currentDate: string, currentTime: string): string {
  return `You are a calendar assistant for JARVIS. Parse the user's request into structured calendar actions.

Today: ${currentDate}. Current time: ${currentTime}. Current day: ${new Date(currentDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })}.

Output ONLY valid JSON — no markdown, no explanation. Schema:
{
  "actions": [
    // create_event: single event
    { "type": "create_event", "title": "string", "date": "YYYY-MM-DD", "time": "HH:MM or null if unknown", "duration": 60 },
    // create_task: task with due date (for homework, assignments, reminders, "buy X", "finish X")
    { "type": "create_task", "title": "string", "dueDate": "YYYY-MM-DD" },
    // create_recurring: repeating event
    { "type": "create_recurring", "title": "string", "startDate": "YYYY-MM-DD", "time": "HH:MM", "duration": 60, "rule": { "frequency": "daily|weekly", "interval": 1, "count": 7, "daysOfWeek": [0,1,2,3,4,5,6] } },
    // update_event: move/adjust a specific event (use session context for "that"/"it")
    { "type": "update_event", "titleHint": "string or null", "offsetMinutes": 30, "newTime": "HH:MM or null" },
    // delete_event: remove an event
    { "type": "delete_event", "titleHint": "string", "dateHint": "YYYY-MM-DD or null" },
    // bulk_move: move multiple events matching a filter
    { "type": "bulk_move", "dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD", "timeRange": "morning|afternoon|evening|null", "excludePatterns": ["meeting"], "offsetMinutes": 60, "targetTime": "HH:MM or null" },
    // list_events: show events
    { "type": "list_events", "dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD" }
  ],
  "needsClarification": false,
  "clarificationQuestion": null,
  "warnings": []
}

RULES:
- "every day" or "daily" → frequency: "daily", daysOfWeek omitted
- "every weekday" → frequency: "weekly", daysOfWeek: [1,2,3,4,5]
- "every weekend" → frequency: "weekly", daysOfWeek: [0,6]
- "every Monday and Wednesday" → frequency: "weekly", daysOfWeek: [1,3]
- "for the next N days" → count: N (daily recurrence)
- "for the next N weeks" with daily → count: N*7
- "for the next N weeks" with weekday → count: N*5
- "due [date]" always → create_task, NOT create_event
- "homework", "assignment", "submit", "deadline" → create_task if a date is given
- "gift reminder", "remind me to buy", "buy X" → create_task
- "birthday dinner", "lunch", "gym", "prayer", "standup" → create_event
- "morning" time range = events starting before 12:00
- "afternoon" time range = events starting 12:00-17:00
- "evening" = events starting after 17:00
- When moving to "the afternoon", targetTime: "13:00"
- "later" without specific time → offsetMinutes: 60
- "30 minutes later" → offsetMinutes: 30
- "don't touch X" → add X (lowercased) to excludePatterns of bulk_move
- If time is missing for a non-task event with a vague date → set needsClarification: true
- "8pm" = "20:00", "9am" = "09:00", "noon" = "12:00"
- Day names (Monday–Sunday): resolve to the NEXT occurrence from today
- "this Friday" → next occurrence of Friday (same rule)
- "next Friday" → FOLLOWING week's Friday (nextWeekday + 7 days, NOT the nearest occurrence)
- Compound inputs (comma-separated clauses) → emit one action per clause; do NOT merge separate requests into one action
- Example compound: "set X every day at 9pm for 5 days, add meeting tomorrow at 3, schedule Y every weekday at 6pm for 2 weeks, move morning events to afternoon but don't touch meetings, and add assignment due next Friday" → 5 actions

User request: "${input}"`.trim()
}

async function collectLLMStream(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.jarvis?.llm) {
      reject(new Error('LLM bridge unavailable'))
      return
    }

    let buffer = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        unsub()
        resolve(buffer)  // resolve with partial if we have something
      }
    }, 12_000)

    const unsub = window.jarvis.llm.onStream((event) => {
      if (settled) return
      if (event.type === 'token') buffer += event.payload
      if (event.type === 'end') {
        settled = true
        clearTimeout(timeout)
        unsub()
        resolve(buffer)
      }
      if (event.type === 'error') {
        settled = true
        clearTimeout(timeout)
        unsub()
        reject(new Error(event.payload))
      }
    })

    window.jarvis.llm.send(prompt).catch((err: unknown) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        unsub()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  })
}

function extractJSON(text: string): unknown {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const jsonStr = fenced ? fenced[1] : text.trim()
  // Find the first { ... } block
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found')
  return JSON.parse(jsonStr.slice(start, end + 1))
}

function normalizeLLMAction(raw: Record<string, unknown>): PlannedAction | null {
  const type = raw.type as string
  switch (type) {
    case 'create_event':
      if (!raw.title || !raw.date) return null
      return {
        type: 'create_event',
        title: String(raw.title),
        date: String(raw.date),
        time: raw.time ? String(raw.time) : undefined,
        duration: typeof raw.duration === 'number' ? raw.duration : 60,
        notes: raw.notes ? String(raw.notes) : undefined,
      }
    case 'create_task':
      if (!raw.title || !raw.dueDate) return null
      return {
        type: 'create_task',
        title: String(raw.title),
        dueDate: String(raw.dueDate),
        notes: raw.notes ? String(raw.notes) : undefined,
      }
    case 'create_recurring': {
      if (!raw.title || !raw.startDate || !raw.time) return null
      const rawRule = raw.rule as Record<string, unknown> | undefined
      const rule: RecurrenceRule = {
        frequency: (rawRule?.frequency as RecurrenceRule['frequency']) ?? 'daily',
        interval: typeof rawRule?.interval === 'number' ? rawRule.interval : 1,
        count: typeof rawRule?.count === 'number' ? rawRule.count : undefined,
        until: rawRule?.until ? String(rawRule.until) : undefined,
        daysOfWeek: Array.isArray(rawRule?.daysOfWeek)
          ? (rawRule.daysOfWeek as number[])
          : undefined,
      }
      return {
        type: 'create_recurring',
        title: String(raw.title),
        startDate: String(raw.startDate),
        time: String(raw.time),
        duration: typeof raw.duration === 'number' ? raw.duration : 60,
        rule,
      }
    }
    case 'update_event':
      return {
        type: 'update_event',
        titleHint: raw.titleHint ? String(raw.titleHint) : undefined,
        offsetMinutes: typeof raw.offsetMinutes === 'number' ? raw.offsetMinutes : undefined,
        newTime: raw.newTime ? String(raw.newTime) : undefined,
      }
    case 'delete_event':
      if (!raw.titleHint) return null
      return {
        type: 'delete_event',
        titleHint: String(raw.titleHint),
        dateHint: raw.dateHint ? String(raw.dateHint) : undefined,
      }
    case 'bulk_move':
      if (!raw.dateFrom || !raw.dateTo) return null
      return {
        type: 'bulk_move',
        dateFrom: String(raw.dateFrom),
        dateTo: String(raw.dateTo),
        timeRange: (raw.timeRange as BulkMovePlan['timeRange']) ?? null,
        excludePatterns: Array.isArray(raw.excludePatterns)
          ? (raw.excludePatterns as string[])
          : undefined,
        offsetMinutes: typeof raw.offsetMinutes === 'number' ? raw.offsetMinutes : undefined,
        targetTime: raw.targetTime ? String(raw.targetTime) : null,
      }
    case 'list_events':
      if (!raw.dateFrom || !raw.dateTo) return null
      return {
        type: 'list_events',
        dateFrom: String(raw.dateFrom),
        dateTo: String(raw.dateTo),
      }
    default:
      return null
  }
}

async function interpretWithLLM(
  input: string,
  session: CalendarSession | null
): Promise<InterpreterResult | null> {
  try {
    const currentDate = today()
    const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    const prompt = buildLLMPrompt(input, currentDate, currentTime)

    // Inject session context into prompt if available
    const contextNote = session?.lastEvents?.length
      ? `\n\nSession context (last events for pronoun resolution): ${session.lastEvents.map(e => `"${e.title}" on ${e.start.slice(0, 10)}`).join(', ')}`
      : ''

    const raw = await collectLLMStream(prompt + contextNote)
    const parsed = extractJSON(raw) as Record<string, unknown>

    if (typeof parsed !== 'object' || !Array.isArray(parsed.actions)) {
      return null
    }

    const actions: PlannedAction[] = []
    for (const rawAction of parsed.actions as Record<string, unknown>[]) {
      const action = normalizeLLMAction(rawAction)
      if (action) actions.push(action)
    }

    return {
      success: parsed.needsClarification ? false : actions.length > 0,
      actions,
      warnings: Array.isArray(parsed.warnings) ? (parsed.warnings as string[]) : [],
      needsClarification: Boolean(parsed.needsClarification),
      clarificationQuestion: parsed.clarificationQuestion
        ? String(parsed.clarificationQuestion)
        : undefined,
      usedLLM: true,
    }
  } catch {
    return null
  }
}

// ── Deterministic fallback ─────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function nextWeekday(dayIndex: number, currentDate: string): string {
  const base = new Date(currentDate + 'T12:00:00')
  let diff = dayIndex - base.getDay()
  if (diff <= 0) diff += 7
  return addDays(currentDate, diff)
}

function parseDate(text: string, currentDate: string): string | null {
  const s = text.toLowerCase()
  if (s.includes('today'))    return currentDate
  if (s.includes('tomorrow')) return addDays(currentDate, 1)

  // "next [dayname]" → FOLLOWING week's occurrence (not nearest)
  const nextDayMatch = s.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  if (nextDayMatch) {
    const dayIdx = DAY_NAMES.indexOf(nextDayMatch[1])
    return addDays(nextWeekday(dayIdx, currentDate), 7)
  }

  // Bare day name or "this [dayname]" → nearest upcoming occurrence
  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (new RegExp(`\\b(?:this\\s+)?${DAY_NAMES[i]}\\b`).test(s)) return nextWeekday(i, currentDate)
  }

  const m1 = s.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/
  )
  if (m1) {
    const month = MONTH_MAP[m1[1]]
    const day = parseInt(m1[2])
    const base = new Date(currentDate + 'T12:00:00')
    const d = new Date(base.getFullYear(), month, day)
    if (d.getTime() < base.getTime() - 86400000) d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().split('T')[0]
  }

  return null
}

function parseTime(text: string): string | null {
  const s = text.toLowerCase()
  // Use word boundary for noon to avoid matching "afternoon"
  if (/\bnoon\b/.test(s) || /\b12\s*pm\b/.test(s)) return '12:00'
  if (/\bmidnight\b/.test(s)) return '00:00'

  const isEveningContext = /\b(dinner|evening|tonight|party|celebration|drinks|supper|gala|birthday\s+dinner)\b/.test(s)

  function makeTime(h: number, min: number, period?: string): string | null {
    let hh = h
    if (period === 'pm' && hh < 12) hh += 12
    if (period === 'am' && hh === 12) hh = 0
    // Evening context: "dinner at 8" → 20:00
    if (!period && isEveningContext && hh >= 6 && hh <= 11) hh += 12
    // Otherwise: bare hours 1-6 → pm (afternoon meetings heuristic)
    else if (!period && hh >= 1 && hh <= 6) hh += 12
    if (hh > 23 || min > 59) return null
    return `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }

  // Priority 1: H:MM[am/pm] — colon format
  const colon = s.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/)
  if (colon) return makeTime(parseInt(colon[1]), parseInt(colon[2]), colon[3])

  // Priority 2: [at] H[am/pm] — explicit am/pm
  const explicit = s.match(/\b(\d{1,2})\s*(am|pm)\b/)
  if (explicit) return makeTime(parseInt(explicit[1]), 0, explicit[2])

  // Priority 3: "at N" — bare number preceded by "at"
  const atNum = s.match(/\bat\s+(\d{1,2})\b(?!\s*days?|\s*weeks?|\s*min|\s*hour)/)
  if (atNum) return makeTime(parseInt(atNum[1]), 0, undefined)

  return null
}

function parseDuration(text: string): number {
  const s = text.toLowerCase()
  if (/\b(quick|brief|short)\b/.test(s)) return 30
  if (/\b(long|extended|full)\b/.test(s)) return 90
  const m = s.match(/(\d+)\s*(hour|hr|h)\b/)
  if (m) return parseInt(m[1]) * 60
  return 60  // default 1 hour
}

function parseRecurrenceCount(text: string, frequency: 'daily' | 'weekly', daysOfWeek?: number[]): number | undefined {
  const s = text.toLowerCase()
  // "for the next N days"
  const days = s.match(/for\s+(?:the\s+)?next\s+(\d+)\s+days?/)
  if (days) return parseInt(days[1])
  // "for the next N weeks"
  const weeks = s.match(/for\s+(?:the\s+)?next\s+(\d+)\s+weeks?/)
  if (weeks) {
    const n = parseInt(weeks[1])
    if (frequency === 'daily') return n * 7
    if (daysOfWeek && daysOfWeek.length > 0) return n * daysOfWeek.length
    return n * 5  // weekday default
  }
  // "for N days"
  const forN = s.match(/for\s+(\d+)\s+days?/)
  if (forN) return parseInt(forN[1])
  return undefined
}

function parseRecurrenceRule(text: string, currentDate: string): {
  startDate: string
  time: string | null
  rule: RecurrenceRule
} | null {
  const s = text.toLowerCase()

  let startDate = parseDate(s, currentDate) ?? currentDate
  const time = parseTime(s)

  // "every weekday"
  if (/\bevery\s+weekday\b|\bweekdays?\b/.test(s)) {
    const rule: RecurrenceRule = { frequency: 'weekly', interval: 1, daysOfWeek: [1, 2, 3, 4, 5] }
    rule.count = parseRecurrenceCount(s, 'weekly', rule.daysOfWeek)
    return { startDate, time, rule }
  }

  // "every weekend"
  if (/\bevery\s+weekend\b/.test(s)) {
    const rule: RecurrenceRule = { frequency: 'weekly', interval: 1, daysOfWeek: [0, 6] }
    rule.count = parseRecurrenceCount(s, 'weekly', rule.daysOfWeek)
    return { startDate, time, rule }
  }

  // "every Monday and Wednesday" etc.
  const multiDay = s.match(/every\s+((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s*(?:and|,)\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))*)/i)
  if (multiDay) {
    const daysOfWeek: number[] = []
    for (let i = 0; i < DAY_NAMES.length; i++) {
      if (multiDay[1].includes(DAY_NAMES[i])) daysOfWeek.push(i)
    }
    if (daysOfWeek.length > 0) {
      const rule: RecurrenceRule = { frequency: 'weekly', interval: 1, daysOfWeek }
      rule.count = parseRecurrenceCount(s, 'weekly', daysOfWeek)
      if (!rule.count) rule.count = 8  // default: 8 occurrences
      return { startDate, time, rule }
    }
  }

  // "every [single day]" — e.g. "every Monday"
  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (new RegExp(`\\bevery\\s+${DAY_NAMES[i]}\\b`).test(s)) {
      startDate = nextWeekday(i, currentDate)
      const rule: RecurrenceRule = { frequency: 'weekly', interval: 1, daysOfWeek: [i] }
      rule.count = parseRecurrenceCount(s, 'weekly', [i]) ?? 8
      return { startDate, time, rule }
    }
  }

  // "every day" / "daily" / "each day"
  if (/\bevery\s+day\b|\bdaily\b|\beach\s+day\b/.test(s)) {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1 }
    rule.count = parseRecurrenceCount(s, 'daily')
    if (!rule.count) rule.count = 7  // default 1 week
    return { startDate, time, rule }
  }

  // "for the next N days" (implicitly daily even without "every")
  const nextNDays = s.match(/for\s+(?:the\s+)?next\s+(\d+)\s+days?/)
  if (nextNDays) {
    const rule: RecurrenceRule = { frequency: 'daily', interval: 1, count: parseInt(nextNDays[1]) }
    return { startDate, time, rule }
  }

  return null
}

function cleanTitle(text: string, type: 'event' | 'task' | 'recurring'): string {
  return text
    // Action verbs at start
    .replace(/^(set\s+(?:a\s+|an\s+)?|add\s+(?:a\s+|an\s+)?|create\s+(?:a\s+|an\s+)?|schedule\s+(?:a\s+|an\s+)?|book\s+(?:a\s+|an\s+)?|remind\s+me\s+(?:to\s+)?|block\s+(?:out\s+)?)/i, '')
    // Recurrence patterns
    .replace(/\bfor\s+(?:the\s+)?next\s+\d+\s+(days?|weeks?|months?)\b/gi, '')
    .replace(/\bevery\s+(day|week|month|weekday|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(\s*(and|,)\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday))*\b/gi, '')
    .replace(/\beach\s+(day|week)\b/gi, '')
    .replace(/\bdaily\b|\bweekly\b/gi, '')
    // Due date (for tasks)
    .replace(/\bdue\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*|\d{1,2}(?:st|nd|rd|th)?)\b/gi, '')
    .replace(/\bdeadline\s+.*/gi, '')
    // Times
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm|AM|PM)?\b/gi, '')
    .replace(/\b\d{1,2}:\d{2}\s*(am|pm|AM|PM)?\b/gi, '')
    .replace(/\b\d{1,2}\s*(am|pm)\b/gi, '')
    .replace(/\bnoon\b|\bmidnight\b/gi, '')
    // Dates
    .replace(/\b(today|tomorrow|yesterday)\b/gi, '')
    .replace(/\b(this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(next|this)\s+week\b/gi, '')
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, '')
    // Trailing/leading connecting words
    .replace(/^\s*(on|at|for|by|a|an|the)\s+/i, '')
    .replace(/\s+(on|at|for|by)$/i, '')
    // Extra spaces
    .replace(/\s{2,}/g, ' ')
    .trim() || (type === 'task' ? 'Task' : 'Event')
}

// ── Segmentation ───────────────────────────────────────────────────────────────

const ACTION_VERBS = /^(add|create|set|schedule|book|remind|block|move|shift|delete|remove|cancel|show|list|every|for\s+the\s+next)\b/i
const TASK_SIGNAL = /\bdue\b|\bdeadline\b|\bhomework\b|\bassignment\b|\bsubmit\b|\bfinish\b|\bturn\s+in\b|\bbuy\b|\bremind(er)?\b/i
const TIME_SIGNAL = /\bat\s+\d|\b\d{1,2}\s*(?:am|pm)\b/i
const EVENT_KEYWORDS = /\b(meeting|call|appointment|gym|prayer|standup|birthday|dinner|lunch|breakfast|event|class|session|interview|demo|sync|check.?in|seminar|webinar)\b/i

function looksLikeIndependentAction(segment: string): boolean {
  const s = segment.trim()
  if (ACTION_VERBS.test(s)) return true
  if (TASK_SIGNAL.test(s)) return true
  if (TIME_SIGNAL.test(s) && s.split(' ').length >= 2) return true
  if (EVENT_KEYWORDS.test(s)) return true
  return false
}

function isRecurrenceContinuation(right: string, left: string): boolean {
  const r = right.toLowerCase().trim()
  const l = left.toLowerCase()
  const isDayName = DAY_NAMES.some((d) => r === d || r === d + 's')
  const hasRecurrenceLeft = /\bevery\b|\beach\b|\bdaily\b/.test(l)
  return isDayName && hasRecurrenceLeft
}

function segmentInput(text: string): string[] {
  // Normalize semicolons and "also" to comma
  const normalized = text
    .replace(/;\s*/g, ', ')
    .replace(/,?\s+also\s+/gi, ', ')

  // Primary split: on ", " (comma-space)
  // "but [constraint]" stays attached to its preceding comma segment naturally
  const commaParts = normalized.split(/,\s+/).map((s) => s.trim()).filter(Boolean)

  const segments: string[] = []

  for (const part of commaParts) {
    // Strip leading "and " / "but and " that can appear after comma splits
    const stripped = part.replace(/^and\s+/i, '')

    // Within each comma part, try splitting on " and " only between independent actions
    const andParts = stripped.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean)

    if (andParts.length <= 1) {
      segments.push(stripped)
      continue
    }

    const merged: string[] = [andParts[0]]
    for (let i = 1; i < andParts.length; i++) {
      const right = andParts[i]
      const left = merged[merged.length - 1]

      if (isRecurrenceContinuation(right, left)) {
        // "every Monday and Wednesday" — keep together
        merged[merged.length - 1] += ' and ' + right
      } else if (looksLikeIndependentAction(right)) {
        merged.push(right)
      } else {
        // Coordinated noun phrase or constraint — keep with previous
        merged[merged.length - 1] += ' and ' + right
      }
    }
    segments.push(...merged)
  }

  return segments
}

// ── Single-segment interpretation ─────────────────────────────────────────────

type SegmentResult =
  | PlannedAction
  | { clarify: true; question: string }
  | null

function interpretSegment(
  text: string,
  currentDate: string,
  session: CalendarSession | null
): SegmentResult {
  const s = text.toLowerCase().trim()

  // ── Context follow-up ("move that", "push it", etc.) ──────────────────────
  const isFollowUp = /\b(that|it)\b/.test(s) && /\b(move|push|shift|add|make)\b/.test(s)
  if (isFollowUp) {
    if (!session?.lastEvents?.length) {
      return { clarify: true, question: 'Which event are you referring to? I don\'t have context from the last action.' }
    }
    const offsetMatch = s.match(/(\d+)\s*(min|minute|hour|hr)s?\s+(later|earlier)/)
    let offsetMinutes = 60  // default "later"
    if (offsetMatch) {
      const n = parseInt(offsetMatch[1])
      const unit = offsetMatch[2].startsWith('hour') || offsetMatch[2].startsWith('hr') ? 60 : 1
      const dir = offsetMatch[3] === 'earlier' ? -1 : 1
      offsetMinutes = n * unit * dir
    } else if (s.includes('earlier')) {
      offsetMinutes = -60
    }
    return {
      type: 'update_event',
      eventIds: session.lastEvents.map((e) => e.id),
      offsetMinutes,
    }
  }

  // ── Bulk move ──────────────────────────────────────────────────────────────
  const isBulk =
    /\b(move|shift|reschedule)\s+all\b/i.test(s) ||
    /\beverything(\s+else)?\b.*\b(later|to)\b/i.test(s) ||
    /\bdon'?t\s+touch\b/i.test(s)

  if (isBulk) {
    const excludePatterns: string[] = []
    const dontTouchMatch = s.match(/don'?t\s+touch\s+(\w+(?:\s+\w+)?)/i)
    if (dontTouchMatch) excludePatterns.push(dontTouchMatch[1].toLowerCase())

    let timeRange: BulkMovePlan['timeRange'] = null
    if (/\bmorning\b/.test(s)) timeRange = 'morning'
    else if (/\bafternoon\b/.test(s)) timeRange = 'afternoon'
    else if (/\bevening\b/.test(s)) timeRange = 'evening'

    let targetTime: string | null = null
    let offsetMinutes: number | undefined = undefined

    if (/to\s+(?:the\s+)?afternoon\b/.test(s)) targetTime = '13:00'
    else if (/to\s+(?:the\s+)?morning\b/.test(s)) targetTime = '09:00'
    else if (/to\s+(?:the\s+)?evening\b/.test(s)) targetTime = '18:00'
    else {
      const toTimeMatch = s.match(/to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)
      if (toTimeMatch) targetTime = parseTime(toTimeMatch[1]) ?? null
    }

    if (!targetTime) {
      const minsMatch = s.match(/(\d+)\s*(?:min|minutes?)\s+later/)
      if (minsMatch) offsetMinutes = parseInt(minsMatch[1])
      else if (/\blater\b/.test(s)) offsetMinutes = 60
    }

    const date = parseDate(s, currentDate) ?? currentDate
    return {
      type: 'bulk_move',
      dateFrom: date,
      dateTo: addDays(date, 30),
      timeRange,
      excludePatterns: excludePatterns.length ? excludePatterns : undefined,
      offsetMinutes,
      targetTime,
    }
  }

  // ── List ───────────────────────────────────────────────────────────────────
  if (/^(show|list|what('s|\s+is)|display|view|get)\b/.test(s)) {
    const date = parseDate(s, currentDate) ?? currentDate
    const isWeek = /\b(this\s+)?week\b/.test(s)
    return {
      type: 'list_events',
      dateFrom: date,
      dateTo: isWeek ? addDays(date, 6) : date,
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  if (/\b(delete|remove|cancel)\b/.test(s)) {
    const titleHint = s.replace(/\b(delete|remove|cancel)\b/i, '').trim()
    const dateHint = parseDate(s, currentDate) ?? undefined
    return {
      type: 'delete_event',
      titleHint: titleHint || 'event',
      dateHint,
    }
  }

  // ── Recurring ─────────────────────────────────────────────────────────────
  const isRecurring =
    /\bevery\b|\beach\b|\bdaily\b|\bweekly\b|\brepeat\b/i.test(s) ||
    /\bfor\s+(?:the\s+)?next\s+\d+\s+(days?|weeks?)\b/i.test(s)

  if (isRecurring) {
    const recurrence = parseRecurrenceRule(s, currentDate)
    if (!recurrence) {
      return { clarify: true, question: 'I couldn\'t parse the recurrence pattern. Can you rephrase? (e.g. "every day at 9am for 7 days")' }
    }
    if (!recurrence.time) {
      const title = cleanTitle(s, 'recurring')
      return {
        clarify: true,
        question: `What time should "${title}" repeat at?`,
      }
    }
    return {
      type: 'create_recurring',
      title: cleanTitle(s, 'recurring'),
      startDate: recurrence.startDate,
      time: recurrence.time,
      duration: parseDuration(s),
      rule: recurrence.rule,
    }
  }

  // ── Task ("due", "deadline", "homework", etc.) ────────────────────────────
  const isTask =
    /\bdue\b|\bdeadline\b/i.test(s) ||
    /\b(homework|assignment|essay|submit|finish|turn\s+in|hand\s+in)\b/i.test(s)

  if (isTask) {
    const dueDate = parseDate(s, currentDate)
    if (!dueDate) {
      return {
        clarify: true,
        question: `When is this due? (e.g. "due Friday" or "due April 10")`,
      }
    }
    return {
      type: 'create_task',
      title: cleanTitle(s, 'task'),
      dueDate,
    }
  }

  // ── Move specific event ────────────────────────────────────────────────────
  if (/\b(move|shift|reschedule|push)\b/.test(s) && !isBulk) {
    const newTime = parseTime(s)
    if (!newTime) {
      return { clarify: true, question: 'What time should I move the event to?' }
    }
    const titleHint = s
      .replace(/\b(move|shift|reschedule|push)\b/i, '')
      .replace(/\bto\s+\d.*$/i, '')
      .trim()
    return {
      type: 'update_event',
      titleHint: titleHint || undefined,
      newTime,
    }
  }

  // ── Create event (default) ─────────────────────────────────────────────────
  const date = parseDate(s, currentDate)
  const time = parseTime(s)
  const title = cleanTitle(s, 'event')

  if (!date) {
    // We have a title but no date — might still be a valid event if time is present
    if (!time) {
      // Not enough info
      return null
    }
    // Has time but no date — default to today
    return {
      type: 'create_event',
      title,
      date: currentDate,
      time,
      duration: parseDuration(s),
    }
  }

  if (!time) {
    // Has date, no time — ask if event (tasks don't need time)
    return {
      clarify: true,
      question: `What time is "${title}" on ${new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}?`,
    }
  }

  return {
    type: 'create_event',
    title,
    date,
    time,
    duration: parseDuration(s),
  }
}

// ── Deterministic fallback ─────────────────────────────────────────────────────

function interpretDeterministic(
  input: string,
  session: CalendarSession | null
): InterpreterResult {
  const currentDate = today()
  const segments = segmentInput(input)
  const actions: PlannedAction[] = []
  const warnings: string[] = []
  const clarifications: string[] = []

  for (const segment of segments) {
    const result = interpretSegment(segment, currentDate, session)
    if (!result) {
      warnings.push(`Could not interpret: "${segment}"`)
      continue
    }
    if ('clarify' in result) {
      // Collect but don't short-circuit — other segments may be unambiguous
      clarifications.push(result.question)
      warnings.push(`Needs clarification: ${result.question}`)
      continue
    }
    actions.push(result)
  }

  // Only pure-clarification when we have nothing else to act on
  if (actions.length === 0 && clarifications.length > 0) {
    return {
      success: false,
      actions: [],
      warnings,
      needsClarification: true,
      clarificationQuestion: clarifications[0],
    }
  }

  if (actions.length === 0) {
    return { success: false, actions: [], warnings, needsClarification: false }
  }

  return { success: true, actions, warnings, needsClarification: false }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Interpret natural language calendar input into a structured action plan.
 * Tries the LLM path first; falls back to the deterministic interpreter.
 * Does NOT execute any actions.
 */
export async function interpretCalendarInput(
  input: string,
  session: CalendarSession | null
): Promise<InterpreterResult> {
  const text = input.trim()
  if (!text) return { success: false, actions: [], warnings: [], needsClarification: false }

  // Try LLM first (handles complex compound requests, multi-intent, ambiguity)
  const llmResult = await interpretWithLLM(text, session)
  if (llmResult !== null) return llmResult

  // Deterministic fallback (handles clear patterns reliably)
  return interpretDeterministic(text, session)
}
