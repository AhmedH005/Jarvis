/**
 * Google Calendar IPC bridge types.
 * Shared between electron/gcal.ts (main) and the renderer-side adapters.
 */

export interface GCalConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  calendarId: string
}

export interface GCalStatus {
  configured: boolean
  calendarId?: string
  missing: string[]
}

/** Raw Google Calendar API v3 event record */
export interface GCalEventRecord {
  id: string
  summary?: string
  description?: string
  location?: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  start: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  end: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  created?: string
  updated?: string
  recurringEventId?: string
  htmlLink?: string
}

/** Result of gcal:listEvents */
export type GCalListEventsResult =
  | { ok: true; events: GCalEventRecord[] }
  | { ok: false; error: string; code: string }

/** Result of gcal:status */
export type GCalStatusResult = GCalStatus
