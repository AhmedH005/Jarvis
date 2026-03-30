/**
 * Calendar Action API — renderer-facing compatibility layer.
 *
 * All calendar mutations route through the provider registry so the existing UI
 * can keep importing these helpers while the backend implementation remains
 * swappable.
 */

import { getCalendarProvider } from '@/integrations/registry/providerRegistry'
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventPatch,
  CalendarFilter,
  CalendarActionResult,
  RecurrenceRule,
} from './calendarTypes'

export async function createEvent(input: CalendarEventInput): Promise<CalendarActionResult<CalendarEvent>> {
  return getCalendarProvider().createEvent(input)
}

export async function updateEvent(id: string, patch: CalendarEventPatch): Promise<CalendarActionResult<CalendarEvent>> {
  return getCalendarProvider().updateEvent(id, patch)
}

export async function moveEvent(id: string, newStart: string, newEnd: string): Promise<CalendarActionResult<CalendarEvent>> {
  return getCalendarProvider().moveEvent(id, newStart, newEnd)
}

export async function deleteEvent(id: string): Promise<CalendarActionResult<{ id: string }>> {
  return getCalendarProvider().deleteEvent(id)
}

export async function listEvents(filter?: CalendarFilter): Promise<CalendarActionResult<CalendarEvent[]>> {
  return getCalendarProvider().listEvents(filter)
}

export async function createRecurringEvents(
  template: CalendarEventInput,
  rule: RecurrenceRule,
): Promise<CalendarActionResult<CalendarEvent[]>> {
  return getCalendarProvider().createRecurringEvents(template, rule)
}

export async function bulkMoveEventsByFilter(
  filter: CalendarFilter,
  offsetMinutes: number,
): Promise<CalendarActionResult<{ moved: number; skipped: string[] }>> {
  const listed = await listEvents(filter)
  if (!listed.success) return listed

  const skipped: string[] = []
  let moved = 0

  for (const event of listed.data) {
    if (event.locked) {
      skipped.push(`"${event.title}" (locked)`)
      continue
    }

    const offsetMs = offsetMinutes * 60 * 1000
    const newStart = new Date(new Date(event.start).getTime() + offsetMs).toISOString().replace(/\.\d{3}Z$/, '')
    const newEnd = new Date(new Date(event.end).getTime() + offsetMs).toISOString().replace(/\.\d{3}Z$/, '')
    const result = await moveEvent(event.id, newStart, newEnd)
    if (result.success) {
      moved += 1
    } else {
      skipped.push(`"${event.title}" (${result.error})`)
    }
  }

  return { success: true, data: { moved, skipped } }
}
