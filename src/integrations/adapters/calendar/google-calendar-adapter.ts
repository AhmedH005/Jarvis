/**
 * Google Calendar adapter — implements CalendarProvider via the gcal IPC bridge.
 *
 * Reads are live when:
 *   GCAL_CLIENT_ID + GCAL_CLIENT_SECRET + GCAL_REFRESH_TOKEN set
 *   AND CAPABILITIES.network = true
 *
 * Writes are always staged under DRY_RUN.
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
import type { GCalEventRecord } from '@/shared/gcal-bridge'
import {
  stageAction,
  isCapabilityEnabled,
  computeProviderLiveStatus,
} from '@/integrations/runtime/safety'

function now(): string {
  return new Date().toISOString()
}

function classifyCalendarError(message: string): 'providerFailure' | 'transportFailure' {
  return /timeout|network|econnrefused|enotfound|fetch failed/i.test(message)
    ? 'transportFailure'
    : 'providerFailure'
}

/** Convert a Google Calendar event record to a canonical CalendarEvent */
function gcalToCalendarEvent(raw: GCalEventRecord): CalendarEvent {
  const start = raw.start.dateTime ?? `${raw.start.date ?? ''}T00:00:00Z`
  const end   = raw.end.dateTime   ?? `${raw.end.date   ?? ''}T23:59:59Z`
  return {
    id:          raw.id,
    title:       raw.summary ?? '(no title)',
    start,
    end,
    allDay:      !raw.start.dateTime,
    notes:       raw.description,
    location:    raw.location,
    source:      'external',
    locked:      false,
    recurrence:  raw.recurringEventId ? { frequency: 'weekly', interval: 1 } : undefined,
    createdAt:   raw.created ?? new Date().toISOString(),
    updatedAt:   raw.updated ?? new Date().toISOString(),
    metadata:    { googleId: raw.id, htmlLink: raw.htmlLink },
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

export class GoogleCalendarAdapter implements CalendarProvider {
  readonly key   = 'google-calendar-adapter'
  readonly label = 'Google Calendar'

  async describe(): Promise<ProviderDescriptor<{
    readCalendar: boolean
    writeCalendar: boolean
    recurringEvents: boolean
  }>> {
    const networkEnabled = isCapabilityEnabled('network')
    const bridge = window.jarvis?.gcal
    const bridgePresent = typeof bridge?.status === 'function'

    let gcalConfigured = false
    let gcalMissing: string[] = []

    if (bridgePresent) {
      try {
        const status = await bridge!.status()
        gcalConfigured = status.configured
        gcalMissing    = status.missing
      } catch {
        gcalConfigured = false
        gcalMissing = ['gcal:status IPC call failed']
      }
    } else {
      gcalMissing = ['gcal bridge unavailable (no Electron context)']
    }

    const keyPresentInEnv = gcalConfigured   // gcalConfig reads process.env directly
    const liveStatus: ProviderLiveStatus = computeProviderLiveStatus({
      runtimeAvailable: bridgePresent,
      keyPresentInEnv,
      keyAccessible:    gcalConfigured,
      networkEnabled,
      executeEnabled:   true,   // reads don't need execute
    })

    const missing: string[] = [
      ...gcalMissing,
      ...(!networkEnabled ? ['CAPABILITIES.network=false'] : []),
    ]

    return {
      key:   this.key,
      label: this.label,
      capabilities: {
        readCalendar:    gcalConfigured && networkEnabled,
        writeCalendar:   false,
        recurringEvents: false,
      },
      health: {
        state:     gcalConfigured && networkEnabled ? 'ready' : 'degraded',
        liveStatus,
        detail:    gcalConfigured
          ? networkEnabled
            ? 'Google Calendar reads are live. Writes remain staged (DRY_RUN).'
            : 'Google Calendar credentials configured. Reads blocked by CAPABILITIES.network=false.'
          : `Google Calendar credentials missing: ${gcalMissing.join(', ')}.`,
        missing,
        checkedAt: now(),
      },
    }
  }

  async listEvents(filter?: CalendarFilter): Promise<CalendarActionResult<CalendarEvent[]>> {
    const action = 'calendar:listEvents'
    if (!isCapabilityEnabled('network')) {
      return calendarFailureResult(
        { providerKey: this.key, action, metadata: { filterProvided: Boolean(filter) } },
        'Blocked (CAPABILITIES.network=false)',
        'blockedByCapability',
        buildProviderFailure('blockedByCapability', 'capability_network_disabled', 'network capability is disabled.', false),
      )
    }

    const bridge = window.jarvis?.gcal
    if (typeof bridge?.listEvents !== 'function') {
      return calendarFailureResult(
        { providerKey: this.key, action },
        'Google Calendar IPC bridge unavailable',
        'unavailable',
        buildProviderFailure('unavailable', 'no_bridge', 'Google Calendar IPC bridge unavailable', false),
      )
    }

    const params: { timeMin?: string; timeMax?: string; maxResults?: number } = {
      maxResults: 100,
    }
    if (filter?.from) params.timeMin = `${filter.from}T00:00:00Z`
    if (filter?.to)   params.timeMax = `${filter.to}T23:59:59Z`

    const result = await bridge.listEvents(params)
    if (!result.ok) {
      const error = `Google Calendar list failed: ${result.error}`
      const status = classifyCalendarError(result.error ?? '')
      return calendarFailureResult(
        { providerKey: this.key, action },
        error,
        status,
        buildProviderFailure(status, 'google_calendar_list_failed', result.error ?? 'unknown Google Calendar error', status === 'transportFailure'),
      )
    }

    const events = result.events.map(gcalToCalendarEvent).filter((e) => matchesFilter(e, filter))
    console.log(`[GoogleCalendarAdapter] listEvents() → ${events.length} events`)
    return calendarSuccessResult(
      { providerKey: this.key, action, metadata: { count: events.length } },
      events,
      `Loaded ${events.length} Google Calendar event${events.length === 1 ? '' : 's'}.`,
      'readOnlySuccess',
    )
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarActionResult<CalendarEvent>> {
    const stagedActionId = stageAction({
      domain:      'calendar',
      providerKey: this.key,
      title:       'Stage Google Calendar event',
      summary:     `Requested event "${input.title}" staged for Google Calendar (DRY_RUN).`,
      payload:     input,
    })
    return calendarFailureResult(
      { providerKey: this.key, action: 'calendar:createEvent', stagedActionId, metadata: { title: input.title } },
      'Google Calendar write staged; live write execution is not enabled in this runtime.',
      'staged',
    )
  }

  async updateEvent(id: string, patch: CalendarEventPatch): Promise<CalendarActionResult<CalendarEvent>> {
    const stagedActionId = stageAction({
      domain:      'calendar',
      providerKey: this.key,
      title:       'Stage Google Calendar event update',
      summary:     `Requested update for event ${id} staged for Google Calendar (DRY_RUN).`,
      payload:     { id, patch },
    })
    return calendarFailureResult(
      { providerKey: this.key, action: 'calendar:updateEvent', stagedActionId, metadata: { id } },
      'Google Calendar update staged; live write execution is not enabled in this runtime.',
      'staged',
    )
  }

  async moveEvent(id: string, newStart: string, newEnd: string): Promise<CalendarActionResult<CalendarEvent>> {
    const stagedActionId = stageAction({
      domain:      'calendar',
      providerKey: this.key,
      title:       'Stage Google Calendar event move',
      summary:     `Requested move for event ${id} staged for Google Calendar (DRY_RUN).`,
      payload:     { id, newStart, newEnd },
    })
    return calendarFailureResult(
      { providerKey: this.key, action: 'calendar:moveEvent', stagedActionId, metadata: { id } },
      'Google Calendar move staged; live write execution is not enabled in this runtime.',
      'staged',
    )
  }

  async deleteEvent(id: string): Promise<CalendarActionResult<{ id: string }>> {
    const stagedActionId = stageAction({
      domain:      'calendar',
      providerKey: this.key,
      title:       'Stage Google Calendar event deletion',
      summary:     `Requested deletion of event ${id} staged for Google Calendar (DRY_RUN).`,
      payload:     { id },
    })
    return calendarFailureResult(
      { providerKey: this.key, action: 'calendar:deleteEvent', stagedActionId, metadata: { id } },
      'Google Calendar delete staged; live write execution is not enabled in this runtime.',
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
      title:       'Stage recurring Google Calendar events',
      summary:     `Requested recurring event "${template.title}" staged for Google Calendar (DRY_RUN).`,
      payload:     { template, rule },
    })
    return calendarFailureResult(
      { providerKey: this.key, action: 'calendar:createRecurringEvents', stagedActionId, metadata: { title: template.title } },
      'Recurring Google Calendar write staged; live recurring writes are not enabled in this runtime.',
      'staged',
    )
  }
}
