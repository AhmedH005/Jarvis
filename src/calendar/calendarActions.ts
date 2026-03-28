/**
 * Calendar Action API — the single interface for all calendar mutations.
 *
 * Rules:
 * - Operates on the portable CalendarEvent model only
 * - Every operation validates before mutating
 * - Returns CalendarActionResult<T> — never throws
 * - No UI logic here; Jarvis drives this layer
 */

import { uid } from '@/lib/dateUtils'
import { useCalendarStore } from '@/store/calendarStore'
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventPatch,
  CalendarFilter,
  CalendarActionResult,
  RecurrenceRule,
} from './calendarTypes'

// ── Helpers ────────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function isValidDatetime(s: string): boolean {
  return !isNaN(Date.parse(s))
}

function matchesFilter(event: CalendarEvent, filter: CalendarFilter): boolean {
  if (filter.from && event.start.slice(0, 10) < filter.from) return false
  if (filter.to   && event.start.slice(0, 10) > filter.to)   return false
  if (filter.titleContains && !event.title.toLowerCase().includes(filter.titleContains.toLowerCase())) return false
  if (filter.source !== undefined && event.source !== filter.source) return false
  if (filter.locked !== undefined && event.locked !== filter.locked) return false
  return true
}

function addDaysToISO(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().replace(/\.\d{3}Z$/, '')
}

function addWeeksToISO(isoDate: string, weeks: number): string {
  return addDaysToISO(isoDate, weeks * 7)
}

function addMonthsToISO(isoDate: string, months: number): string {
  const d = new Date(isoDate)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().replace(/\.\d{3}Z$/, '')
}

function shiftISO(iso: string, offsetMs: number): string {
  const d = new Date(iso)
  d.setTime(d.getTime() + offsetMs)
  return d.toISOString().replace(/\.\d{3}Z$/, '')
}

// ── Create ─────────────────────────────────────────────────────────────────────

export function createEvent(input: CalendarEventInput): CalendarActionResult<CalendarEvent> {
  if (!input.title?.trim()) return { success: false, error: 'title is required' }
  if (!input.start || !isValidDatetime(input.start)) return { success: false, error: 'valid start datetime is required' }
  if (!input.end   || !isValidDatetime(input.end))   return { success: false, error: 'valid end datetime is required' }
  if (new Date(input.end) < new Date(input.start))   return { success: false, error: 'end must be after start' }

  const event: CalendarEvent = {
    id: uid('ev'),
    title: input.title.trim(),
    start: input.start,
    end: input.end,
    allDay: input.allDay ?? false,
    notes: input.notes,
    location: input.location,
    color: input.color,
    recurrence: input.recurrence,
    locked: input.locked ?? false,
    source: input.source ?? 'manual',
    metadata: input.metadata,
    createdAt: now(),
    updatedAt: now(),
  }

  useCalendarStore.getState().addEvent(event)
  return { success: true, data: event }
}

// ── Update ─────────────────────────────────────────────────────────────────────

export function updateEvent(id: string, patch: CalendarEventPatch): CalendarActionResult<CalendarEvent> {
  const { events, updateEvent: storeUpdate } = useCalendarStore.getState()
  const event = events.find((e) => e.id === id)
  if (!event) return { success: false, error: `event ${id} not found` }
  if (event.locked) return { success: false, error: `event "${event.title}" is locked and cannot be modified` }

  if (patch.start && !isValidDatetime(patch.start)) return { success: false, error: 'invalid start datetime' }
  if (patch.end   && !isValidDatetime(patch.end))   return { success: false, error: 'invalid end datetime' }

  const newStart = patch.start ?? event.start
  const newEnd   = patch.end   ?? event.end
  if (new Date(newEnd) < new Date(newStart)) return { success: false, error: 'end must be after start' }

  const { recurrence: _recurrence, ...restPatch } = patch
  const cleanPatch: Partial<CalendarEvent> = {
    ...restPatch,
    ...(patch.recurrence !== undefined ? { recurrence: patch.recurrence ?? undefined } : {}),
  }

  storeUpdate(id, cleanPatch)
  const updated = { ...event, ...cleanPatch, updatedAt: now() }
  return { success: true, data: updated }
}

// ── Move ───────────────────────────────────────────────────────────────────────

export function moveEvent(id: string, newStart: string, newEnd: string): CalendarActionResult<CalendarEvent> {
  return updateEvent(id, { start: newStart, end: newEnd })
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export function deleteEvent(id: string): CalendarActionResult<{ id: string }> {
  const { events, removeEvent } = useCalendarStore.getState()
  const event = events.find((e) => e.id === id)
  if (!event) return { success: false, error: `event ${id} not found` }
  if (event.locked) return { success: false, error: `event "${event.title}" is locked and cannot be deleted` }

  removeEvent(id)
  return { success: true, data: { id } }
}

// ── List ───────────────────────────────────────────────────────────────────────

export function listEvents(filter?: CalendarFilter): CalendarActionResult<CalendarEvent[]> {
  const { events } = useCalendarStore.getState()
  const filtered = filter ? events.filter((e) => matchesFilter(e, filter)) : events
  const sorted = [...filtered].sort((a, b) => a.start.localeCompare(b.start))
  return { success: true, data: sorted }
}

// ── Create recurring events ────────────────────────────────────────────────────

export function createRecurringEvents(
  template: CalendarEventInput,
  rule: RecurrenceRule
): CalendarActionResult<CalendarEvent[]> {
  if (!template.title?.trim()) return { success: false, error: 'title is required' }
  if (!template.start || !isValidDatetime(template.start)) return { success: false, error: 'valid start is required' }
  if (!template.end   || !isValidDatetime(template.end))   return { success: false, error: 'valid end is required' }

  const interval = rule.interval ?? 1
  const maxOccurrences = rule.count ?? 52  // safety cap
  const until = rule.until ? new Date(rule.until + 'T23:59:59') : null

  const durationMs = new Date(template.end).getTime() - new Date(template.start).getTime()

  const created: CalendarEvent[] = []
  let currentStart = template.start
  let i = 0

  while (i < maxOccurrences) {
    const currentEnd = shiftISO(currentStart, durationMs)
    const startDate = new Date(currentStart)

    if (until && startDate > until) break

    // For weekly recurrence with daysOfWeek filter
    if (rule.frequency === 'weekly' && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      if (!rule.daysOfWeek.includes(startDate.getDay())) {
        // advance one day and retry
        currentStart = addDaysToISO(currentStart, 1)
        continue
      }
    }

    const result = createEvent({ ...template, start: currentStart, end: currentEnd })
    if (!result.success) return { success: false, error: result.error }
    created.push(result.data)
    i++

    // Advance to next occurrence
    switch (rule.frequency) {
      case 'daily':   currentStart = addDaysToISO(currentStart, interval);   break
      case 'weekly':  currentStart = addWeeksToISO(currentStart, interval);  break
      case 'monthly': currentStart = addMonthsToISO(currentStart, interval); break
      case 'yearly':  currentStart = addMonthsToISO(currentStart, interval * 12); break
    }
  }

  return { success: true, data: created }
}

// ── Bulk move by filter ────────────────────────────────────────────────────────

export function bulkMoveEventsByFilter(
  filter: CalendarFilter,
  offsetMinutes: number
): CalendarActionResult<{ moved: number; skipped: string[] }> {
  const listResult = listEvents(filter)
  if (!listResult.success) return listResult

  const offsetMs = offsetMinutes * 60 * 1000
  const skipped: string[] = []
  let moved = 0

  for (const event of listResult.data) {
    if (event.locked) {
      skipped.push(`"${event.title}" (locked)`)
      continue
    }
    const newStart = shiftISO(event.start, offsetMs)
    const newEnd   = shiftISO(event.end,   offsetMs)
    const result = moveEvent(event.id, newStart, newEnd)
    if (result.success) {
      moved++
    } else {
      skipped.push(`"${event.title}" (${result.error})`)
    }
  }

  return { success: true, data: { moved, skipped } }
}
