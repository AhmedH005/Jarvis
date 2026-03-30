import { readSafeJson } from '@/integrations/runtime/files'
import type { CalendarEvent } from '@/calendar/calendarTypes'
import type { GmailMessageRecord } from '@/shared/gmail-bridge'

export interface TimeRuntimeSnapshot {
  events: CalendarEvent[]
  automations: Array<{
    id: string
    label: string
    schedule: string
    state: 'staged' | 'awaiting_approval' | 'executing' | 'completed' | 'failed' | 'unavailable'
  }>
}

export interface ConciergeRuntimeSnapshot {
  inbox: GmailMessageRecord[]
  bookings: Array<{
    id: string
    title: string
    status: string
  }>
}

export async function loadTimeRuntimeSnapshot(): Promise<TimeRuntimeSnapshot> {
  const [events, automations] = await Promise.all([
    readSafeJson<CalendarEvent[]>('time/events.json', []),
    readSafeJson<TimeRuntimeSnapshot['automations']>('time/automations.json', []),
  ])

  return { events, automations }
}

export async function loadConciergeRuntimeSnapshot(): Promise<ConciergeRuntimeSnapshot> {
  const [inbox, bookings] = await Promise.all([
    readSafeJson<GmailMessageRecord[]>('concierge/inbox.json', []),
    readSafeJson<ConciergeRuntimeSnapshot['bookings']>('concierge/bookings.json', []),
  ])

  return { inbox, bookings }
}
