/**
 * ICS / CalDAV calendar adapter.
 *
 * Read sources in priority order:
 *   1. Remote ICS URL (via ICS_CALENDAR_URL env → ics:fetchUrl IPC)
 *   2. Local safe-root ICS file (jarvis-runtime/time/calendar.ics — always live)
 *
 * CalDAV: classified as STAGED_PENDING_CREDENTIALS (not implemented).
 * Writes: always staged under DRY_RUN.
 */

import type { CalendarProvider } from '@/integrations/contracts/providers'
import type { ProviderDescriptor } from '@/integrations/contracts/base'
import type {
  CalendarActionResult,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventPatch,
  CalendarFilter,
  RecurrenceRule,
} from '@/calendar/calendarTypes'
import type { ProviderLiveStatus } from '@/integrations/contracts/live-status'
import {
  buildProviderFailure,
  calendarFailureResult,
  calendarSuccessResult,
} from '@/integrations/contracts/result-helpers'
import {
  stageAction,
  isCapabilityEnabled,
} from '@/integrations/runtime/safety'
import { readSafeFile } from '@/integrations/runtime/files'

// ── Minimal ICS parser ───────────────────────────────────────────────────────

interface ParsedVEvent {
  uid:        string
  summary:    string
  dtstart:    string
  dtend:      string
  description?: string
  location?:   string
  rrule?:      string
}

/** Unfold ICS continuation lines (RFC 5545 §3.1) */
function unfold(text: string): string {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

/** Parse an ICS datetime string to ISO 8601. Handles DATE and DATE-TIME. */
function parseDtParam(value: string): string {
  // Value may be: 20240301T150000Z  or  20240301T150000  or  20240301
  const v = value.trim().replace(/;TZID=[^:]+:/i, '')  // strip TZID param
  if (v.length === 8) {
    // DATE only: YYYYMMDD
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00Z`
  }
  // DATE-TIME: YYYYMMDDTHHMMSS[Z]
  const y  = v.slice(0, 4)
  const mo = v.slice(4, 6)
  const d  = v.slice(6, 8)
  const h  = v.slice(9, 11)
  const mi = v.slice(11, 13)
  const s  = v.slice(13, 15)
  const z  = v.endsWith('Z') ? 'Z' : ''
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${z}`
}

export function parseICS(text: string): ParsedVEvent[] {
  const unfolded = unfold(text)
  const events: ParsedVEvent[] = []
  const lines = unfolded.split(/\r?\n/)

  let inVEvent = false
  let current: Partial<ParsedVEvent> = {}

  for (const raw of lines) {
    const line = raw.trim()
    if (line === 'BEGIN:VEVENT') {
      inVEvent = true
      current = {}
      continue
    }
    if (line === 'END:VEVENT') {
      inVEvent = false
      if (current.uid && current.dtstart && current.dtend) {
        events.push(current as ParsedVEvent)
      }
      continue
    }
    if (!inVEvent) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue

    const key   = line.slice(0, colon).toUpperCase()
    const value = line.slice(colon + 1)

    if (key === 'UID')                         current.uid         = value
    else if (key === 'SUMMARY')                current.summary     = value
    else if (key.startsWith('DTSTART'))        current.dtstart     = parseDtParam(value)
    else if (key.startsWith('DTEND'))          current.dtend       = parseDtParam(value)
    else if (key === 'DESCRIPTION')            current.description = value.replace(/\\n/g, '\n')
    else if (key === 'LOCATION')               current.location    = value
    else if (key === 'RRULE')                  current.rrule       = value
  }

  return events
}

function veventToCalendarEvent(v: ParsedVEvent): CalendarEvent {
  const now = new Date().toISOString()
  return {
    id:        v.uid,
    title:     v.summary || '(no title)',
    start:     v.dtstart,
    end:       v.dtend,
    allDay:    v.dtstart.length === 10, // DATE-only
    notes:     v.description,
    location:  v.location,
    source:    'external',
    locked:    false,
    recurrence: v.rrule ? { frequency: 'weekly', interval: 1 } : undefined,
    createdAt: now,
    updatedAt: now,
    metadata:  { icsUid: v.uid },
  }
}

function matchesFilter(event: CalendarEvent, filter?: CalendarFilter): boolean {
  if (!filter) return true
  if (filter.from && event.start.slice(0, 10) < filter.from) return false
  if (filter.to   && event.start.slice(0, 10) > filter.to)   return false
  if (filter.titleContains && !event.title.toLowerCase().includes(filter.titleContains.toLowerCase())) return false
  if (filter.source && event.source !== filter.source) return false
  if (filter.locked !== undefined && Boolean(event.locked) !== filter.locked) return false
  return true
}

// ── ICS source detection ─────────────────────────────────────────────────────

async function tryFetchRemoteICS(): Promise<string | null> {
  if (!isCapabilityEnabled('network')) return null
  const bridge = window.jarvis?.ics
  if (!bridge || typeof bridge.getConfig !== 'function' || typeof bridge.fetchUrl !== 'function') return null

  const cfg = await bridge.getConfig()
  if (!cfg.icsUrl) return null

  const result = await bridge.fetchUrl(cfg.icsUrl)
  if (!result.ok) {
    console.warn('[ICSCalendarAdapter] remote ICS fetch failed:', result.error)
    return null
  }
  return result.text
}

async function tryReadLocalICS(): Promise<string | null> {
  try {
    const result = await readSafeFile('time/calendar.ics')
    return result?.trim() || null
  } catch {
    return null
  }
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class ICSCalendarAdapter implements CalendarProvider {
  readonly key   = 'ics-calendar-adapter'
  readonly label = 'ICS Calendar'

  async describe(): Promise<ProviderDescriptor<{
    readCalendar: boolean
    writeCalendar: boolean
    recurringEvents: boolean
  }>> {
    const networkEnabled   = isCapabilityEnabled('network')
    const bridgePresent    = typeof window.jarvis?.ics?.getConfig === 'function'
    const localIcs = await tryReadLocalICS()
    const hasLocalIcs = Boolean(localIcs)

    let remoteIcsUrl: string | undefined
    let liveStatus: ProviderLiveStatus

    if (bridgePresent) {
      try {
        const cfg = await window.jarvis?.ics?.getConfig?.()
        remoteIcsUrl = cfg?.icsUrl
      } catch {
        /* bridge present but call failed — treat as no URL */
      }
    }

    const hasRemoteUrl   = Boolean(remoteIcsUrl)
    const remoteReachable = hasRemoteUrl && networkEnabled

    if (hasRemoteUrl && networkEnabled) {
      liveStatus = 'LIVE_READ_ONLY'
    } else if (hasRemoteUrl && !networkEnabled) {
      liveStatus = 'WIRED_BLOCKED_BY_CAPABILITY'
    } else if (hasLocalIcs) {
      liveStatus = 'LIVE_READ_ONLY'
    } else {
      liveStatus = 'UNAVAILABLE'
    }

    const detail = remoteReachable
      ? `Remote ICS feed configured (${remoteIcsUrl}). Local fallback: jarvis-runtime/time/calendar.ics.`
      : hasRemoteUrl
      ? `ICS URL configured but blocked by CAPABILITIES.network=false. Local fallback active.`
      : hasLocalIcs
      ? `No ICS_CALENDAR_URL configured. Local safe-root ICS file is active (jarvis-runtime/time/calendar.ics).`
      : `No ICS_CALENDAR_URL configured and no local ICS file found at jarvis-runtime/time/calendar.ics.`

    const missing: string[] = [
      ...(!networkEnabled && hasRemoteUrl ? ['CAPABILITIES.network=false (remote ICS blocked)'] : []),
      ...(!hasRemoteUrl && !hasLocalIcs ? ['No remote ICS URL or local ICS file available'] : []),
    ]

    return {
      key:   this.key,
      label: this.label,
      capabilities: {
        readCalendar:    remoteReachable || hasLocalIcs,
        writeCalendar:   false,
        recurringEvents: false,
      },
      health: {
        state:     remoteReachable || hasLocalIcs ? 'ready' : 'degraded',
        liveStatus,
        detail,
        missing,
        checkedAt: new Date().toISOString(),
      },
    }
  }

  async listEvents(filter?: CalendarFilter): Promise<CalendarActionResult<CalendarEvent[]>> {
    const action = 'calendar:listEvents'
    // 1. Try remote ICS
    const remoteText = await tryFetchRemoteICS()
    if (remoteText) {
      const parsed = parseICS(remoteText)
      const events = parsed.map(veventToCalendarEvent).filter((e) => matchesFilter(e, filter))
      console.log(`[ICSCalendarAdapter] listEvents() remote → ${events.length} events`)
      return calendarSuccessResult(
        { providerKey: this.key, action, metadata: { source: 'remote', count: events.length } },
        events,
        `Loaded ${events.length} ICS event${events.length === 1 ? '' : 's'} from the remote feed.`,
        'readOnlySuccess',
      )
    }

    // 2. Try local safe-root ICS
    const localText = await tryReadLocalICS()
    if (localText) {
      const parsed = parseICS(localText)
      const events = parsed.map(veventToCalendarEvent).filter((e) => matchesFilter(e, filter))
      console.log(`[ICSCalendarAdapter] listEvents() local → ${events.length} events`)
      return calendarSuccessResult(
        { providerKey: this.key, action, metadata: { source: 'local', count: events.length } },
        events,
        `Loaded ${events.length} ICS event${events.length === 1 ? '' : 's'} from the local SAFE_ROOT file.`,
        'readOnlySuccess',
      )
    }

    // No ICS data available — return empty (not an error; local JSON is handled upstream)
    console.log('[ICSCalendarAdapter] listEvents() — no ICS source available, returning empty')
    return calendarFailureResult(
      { providerKey: this.key, action },
      'No ICS source available.',
      'unavailable',
      buildProviderFailure('unavailable', 'ics_source_unavailable', 'No remote ICS URL or local ICS file is available.', false),
    )
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarActionResult<CalendarEvent>> {
    const stagedActionId = stageAction({
      domain:      'calendar',
      providerKey: this.key,
      title:       'Stage ICS calendar event',
      summary:     `Requested event "${input.title}" staged (ICS write not implemented).`,
      payload:     input,
    })
    return calendarFailureResult(
      { providerKey: this.key, action: 'calendar:createEvent', stagedActionId, metadata: { title: input.title } },
      'ICS calendar write staged; ICS writes are not supported in this runtime.',
      'staged',
    )
  }

  async updateEvent(id: string, patch: CalendarEventPatch): Promise<CalendarActionResult<CalendarEvent>> {
    const stagedActionId = stageAction({
      domain:      'calendar',
      providerKey: this.key,
      title:       'Stage ICS calendar event update',
      summary:     `Requested update for event ${id} staged (ICS write not implemented).`,
      payload:     { id, patch },
    })
    return calendarFailureResult(
      { providerKey: this.key, action: 'calendar:updateEvent', stagedActionId, metadata: { id } },
      'ICS calendar update staged; ICS writes are not supported in this runtime.',
      'staged',
    )
  }

  async moveEvent(id: string, newStart: string, newEnd: string): Promise<CalendarActionResult<CalendarEvent>> {
    const stagedActionId = stageAction({
      domain:      'calendar',
      providerKey: this.key,
      title:       'Stage ICS calendar event move',
      summary:     `Requested move for event ${id} staged.`,
      payload:     { id, newStart, newEnd },
    })
    return calendarFailureResult(
      { providerKey: this.key, action: 'calendar:moveEvent', stagedActionId, metadata: { id } },
      'ICS calendar move staged; ICS writes are not supported in this runtime.',
      'staged',
    )
  }

  async deleteEvent(id: string): Promise<CalendarActionResult<{ id: string }>> {
    const stagedActionId = stageAction({
      domain:      'calendar',
      providerKey: this.key,
      title:       'Stage ICS calendar event deletion',
      summary:     `Requested deletion of event ${id} staged.`,
      payload:     { id },
    })
    return calendarFailureResult(
      { providerKey: this.key, action: 'calendar:deleteEvent', stagedActionId, metadata: { id } },
      'ICS calendar delete staged; ICS writes are not supported in this runtime.',
      'staged',
    )
  }

  async createRecurringEvents(
    template: CalendarEventInput,
    rule: RecurrenceRule,
  ): Promise<CalendarActionResult<CalendarEvent[]>> {
    const stagedActionId = stageAction({
      domain:      'calendar',
      providerKey: this.key,
      title:       'Stage recurring ICS events',
      summary:     `Requested recurring event "${template.title}" staged.`,
      payload:     { template, rule },
    })
    return calendarFailureResult(
      { providerKey: this.key, action: 'calendar:createRecurringEvents', stagedActionId, metadata: { title: template.title } },
      'ICS recurring write staged; ICS writes are not supported in this runtime.',
      'staged',
    )
  }
}
