import type {
  ProviderFailure,
  ProviderResultStatus,
  ProviderTrace,
} from '@/integrations/contracts/base'

/**
 * Portable calendar event model.
 * Provider-agnostic: no Apple, Google, or platform-specific fields.
 * Suitable for local storage, future provider adapters (Google, CalDAV), and cross-platform use.
 */

export interface CalendarEvent {
  id: string
  title: string
  start: string          // ISO 8601: "2026-03-26T09:00:00" or "2026-03-26" for allDay
  end: string            // ISO 8601: "2026-03-26T10:00:00" or "2026-03-27" for allDay
  allDay: boolean
  notes?: string
  location?: string
  color?: string         // hex or css color
  recurrence?: RecurrenceRule
  locked?: boolean       // cannot be moved by automated operations
  source?: 'manual' | 'jarvis' | 'external'
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval?: number      // every N frequencies, default 1
  count?: number         // max occurrences
  until?: string         // end date YYYY-MM-DD
  daysOfWeek?: number[]  // 0=Sun … 6=Sat, used for weekly
}

export interface CalendarEventInput {
  title: string
  start: string
  end: string
  allDay?: boolean
  notes?: string
  location?: string
  color?: string
  recurrence?: RecurrenceRule
  locked?: boolean
  source?: CalendarEvent['source']
  metadata?: Record<string, unknown>
}

export interface CalendarEventPatch {
  title?: string
  start?: string
  end?: string
  allDay?: boolean
  notes?: string
  location?: string
  color?: string
  recurrence?: RecurrenceRule | null
  locked?: boolean
}

export interface CalendarFilter {
  from?: string          // YYYY-MM-DD inclusive
  to?: string            // YYYY-MM-DD inclusive
  titleContains?: string // case-insensitive substring
  source?: CalendarEvent['source']
  locked?: boolean
}

export type CalendarActionResult<T = void> =
  | {
      success: true
      data: T
      status?: Extract<ProviderResultStatus, 'success' | 'readOnlySuccess'>
      summary?: string
      trace?: ProviderTrace
    }
  | {
      success: false
      error: string
      status?: Exclude<ProviderResultStatus, 'success' | 'readOnlySuccess'>
      summary?: string
      failure?: ProviderFailure
      trace?: ProviderTrace
    }
