import type { CalendarProvider, ReminderProvider } from '@/integrations/contracts/providers'
import type { ProviderDescriptor, ProviderFailure, ProviderResultStatus } from '@/integrations/contracts/base'
import type {
  CalendarActionResult,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventPatch,
  CalendarFilter,
  RecurrenceRule,
} from '@/calendar/calendarTypes'
import type { SkillCallabilityResult } from '@/integrations/contracts/live-status'
import {
  buildProviderFailure,
  calendarFailureResult,
  calendarSuccessResult,
} from '@/integrations/contracts/result-helpers'
import type { ComposedAdapterReport, CalendarAdapterStatus } from '@/integrations/adapters/calendar/adapter-types'
import { resolveActiveCalendarAdapter } from '@/integrations/adapters/calendar/composed-resolution'
import { GoogleCalendarAdapter } from '@/integrations/adapters/calendar/google-calendar-adapter'
import { ICSCalendarAdapter } from '@/integrations/adapters/calendar/ics-adapter'
import { loadSkillManifest } from '@/integrations/skills/loader'
import { readSafeJson } from '@/integrations/runtime/files'
import {
  stageAction,
  blockedByCapability,
  isCapabilityEnabled,
  computeSkillProviderLiveStatus,
} from '@/integrations/runtime/safety'
import { enforce, toCalendarResult } from '@/integrations/governance/governance-enforcer'

function now(): string {
  return new Date().toISOString()
}

function failure<T = never>(
  providerKey: string,
  action: string,
  error: string,
  status: Exclude<ProviderResultStatus, 'success' | 'readOnlySuccess'> = 'unavailable',
  failureDetail?: ProviderFailure,
  extra?: {
    stagedActionId?: string
    notes?: string[]
    metadata?: Record<string, unknown>
  },
): CalendarActionResult<T> {
  return calendarFailureResult(
    {
      providerKey,
      action,
      stagedActionId: extra?.stagedActionId,
      notes: extra?.notes,
      metadata: extra?.metadata,
    },
    error,
    status,
    failureDetail,
  )
}

function matchesFilter(event: CalendarEvent, filter?: CalendarFilter): boolean {
  if (!filter) return true
  if (filter.from && event.start.slice(0, 10) < filter.from) return false
  if (filter.to && event.start.slice(0, 10) > filter.to) return false
  if (filter.titleContains && !event.title.toLowerCase().includes(filter.titleContains.toLowerCase())) return false
  if (filter.source && event.source !== filter.source) return false
  if (filter.locked !== undefined && Boolean(event.locked) !== filter.locked) return false
  return true
}

async function loadEvents(): Promise<CalendarEvent[]> {
  return readSafeJson<CalendarEvent[]>('time/events.json', [])
}

/**
 * Probe OpenClaw gateway and classify each required skill's callability level.
 * Distinguishes: gateway_offline → not_discovered → discovered_blocked_by_capability → callable
 */
async function probeSkillCallability(): Promise<{
  gatewayOnline: boolean
  advancedCalendar: SkillCallabilityResult
  cronScheduling: SkillCallabilityResult
}> {
  const networkEnabled = isCapabilityEnabled('network')

  if (!window.jarvis?.openclaw) {
    const offlineResult = (skill: string): SkillCallabilityResult => ({
      skill,
      level: 'gateway_offline',
      reason: 'OpenClaw bridge not available (no Electron context).',
    })
    return {
      gatewayOnline: false,
      advancedCalendar: offlineResult('advanced-calendar'),
      cronScheduling: offlineResult('cron-scheduling'),
    }
  }

  // Check gateway health
  const status = await window.jarvis.openclaw.status().catch(() => ({
    online: false,
    error: 'status check failed',
  }))

  if (!status.online) {
    const reason = `OpenClaw gateway offline: ${status.error ?? 'no response'}.`
    const offlineResult = (skill: string): SkillCallabilityResult => ({
      skill,
      level: 'gateway_offline',
      reason,
    })
    return {
      gatewayOnline: false,
      advancedCalendar: offlineResult('advanced-calendar'),
      cronScheduling: offlineResult('cron-scheduling'),
    }
  }

  // Fetch actual skill list
  const skills = await window.jarvis.openclaw.skills().catch(
    () => [] as Array<{ name: string; enabled: boolean; description?: string }>
  )

  const enabledNames = new Set(skills.filter((s) => s.enabled).map((s) => s.name))

  const classifySkill = (skillName: string): SkillCallabilityResult => {
    if (!enabledNames.has(skillName)) {
      return {
        skill: skillName,
        level: 'not_discovered',
        reason: `"${skillName}" is not in the enabled skills list returned by OpenClaw /v1/skills.`,
      }
    }
    if (!networkEnabled) {
      return {
        skill: skillName,
        level: 'discovered_blocked_by_capability',
        reason: `"${skillName}" is discovered and enabled in OpenClaw, but invocation is blocked by CAPABILITIES.network=false.`,
      }
    }
    return {
      skill: skillName,
      level: 'callable',
      reason: `"${skillName}" is discovered, enabled, and the network capability gate is open — invocable via OpenClaw.`,
    }
  }

  return {
    gatewayOnline: true,
    advancedCalendar: classifySkill('advanced-calendar'),
    cronScheduling: classifySkill('cron-scheduling'),
  }
}

export class LocalCalendarProvider implements CalendarProvider {
  readonly key = 'time-skill-provider'
  readonly label = 'Time Skill Provider'

  async describe(): Promise<ProviderDescriptor<{
    readCalendar: boolean
    writeCalendar: boolean
    recurringEvents: boolean
  }>> {
    const [calendarManifest, cronManifest, probe] = await Promise.all([
      loadSkillManifest('advanced-calendar'),
      loadSkillManifest('cron-scheduling'),
      probeSkillCallability(),
    ])

    const networkEnabled = isCapabilityEnabled('network')

    const calendarCallable = probe.advancedCalendar.level === 'callable'
    const cronCallable = probe.cronScheduling.level === 'callable'

    // Local safe-root reads are always live regardless of capability gates
    const localReadLive = true

    // OpenClaw-backed read is only live when the skill is callable
    const readCalendar = localReadLive // safe-root is always available
    const recurringEvents = cronCallable

    const liveStatus = computeSkillProviderLiveStatus({
      runtimeAvailable: Boolean(window.jarvis?.openclaw),
      gatewayOnline: probe.gatewayOnline,
      skillDiscovered: probe.advancedCalendar.level !== 'not_discovered' && probe.advancedCalendar.level !== 'gateway_offline',
      networkEnabled,
    })

    const missing: string[] = []
    if (!probe.gatewayOnline) missing.push(probe.advancedCalendar.reason)
    else {
      if (!calendarCallable) missing.push(probe.advancedCalendar.reason)
      if (!cronCallable) missing.push(probe.cronScheduling.reason)
    }
    if (!isCapabilityEnabled('write')) missing.push('write capability disabled (DRY_RUN)')

    const healthDetail = [
      `${calendarManifest.label} [${probe.advancedCalendar.level}] and ${cronManifest.label} [${probe.cronScheduling.level}] are the selected Time skills.`,
      `Local safe-root read (jarvis-runtime/time/events.json) is always live.`,
      calendarCallable
        ? 'advanced-calendar is callable via OpenClaw.'
        : `advanced-calendar is not callable: ${probe.advancedCalendar.reason}`,
    ].join(' ')

    console.log('[LocalCalendarProvider] describe() probe:', {
      gatewayOnline: probe.gatewayOnline,
      advancedCalendar: probe.advancedCalendar.level,
      cronScheduling: probe.cronScheduling.level,
      liveStatus,
    })

    return {
      key: this.key,
      label: this.label,
      capabilities: {
        readCalendar,
        writeCalendar: false,
        recurringEvents,
      },
      health: {
        state: calendarCallable ? 'ready' : 'degraded',
        liveStatus,
        detail: healthDetail,
        missing,
        checkedAt: now(),
      },
    }
  }

  async listEvents(filter?: CalendarFilter): Promise<CalendarActionResult<CalendarEvent[]>> {
    console.log('[LocalCalendarProvider] listEvents() — reading from safe-root')
    const events = await loadEvents()
    const filtered = events.filter((event) => matchesFilter(event, filter))
    return calendarSuccessResult(
      { providerKey: this.key, action: 'calendar:listEvents', metadata: { count: filtered.length } },
      filtered,
      `Loaded ${filtered.length} local calendar event${filtered.length === 1 ? '' : 's'}.`,
      'readOnlySuccess',
    )
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarActionResult<CalendarEvent>> {
    if (!isCapabilityEnabled('write')) {
      const stagedActionId = stageAction({
        domain: 'calendar',
        providerKey: this.key,
        title: 'Stage calendar event',
        summary: `Requested event "${input.title}" staged for advanced-calendar.`,
        payload: input,
      })
      return failure(
        this.key,
        'calendar:createEvent',
        'Calendar write blocked because CAPABILITIES.write=false.',
        'blockedByCapability',
        buildProviderFailure('blockedByCapability', 'capability_write_disabled', 'write capability is disabled.', false),
        { stagedActionId, metadata: { title: input.title } },
      )
    }
    return failure(this.key, 'calendar:createEvent', 'advanced-calendar write not yet implemented for live execution', 'staged')
  }

  async updateEvent(id: string, patch: CalendarEventPatch): Promise<CalendarActionResult<CalendarEvent>> {
    if (!isCapabilityEnabled('write')) {
      const stagedActionId = stageAction({
        domain: 'calendar',
        providerKey: this.key,
        title: 'Stage calendar update',
        summary: `Requested update for event ${id} staged for advanced-calendar.`,
        payload: { id, patch },
      })
      return failure(
        this.key,
        'calendar:updateEvent',
        'Calendar update blocked because CAPABILITIES.write=false.',
        'blockedByCapability',
        buildProviderFailure('blockedByCapability', 'capability_write_disabled', 'write capability is disabled.', false),
        { stagedActionId, metadata: { id } },
      )
    }
    return failure(this.key, 'calendar:updateEvent', 'advanced-calendar update not yet implemented for live execution', 'staged')
  }

  async moveEvent(id: string, newStart: string, newEnd: string): Promise<CalendarActionResult<CalendarEvent>> {
    if (!isCapabilityEnabled('write')) {
      const stagedActionId = stageAction({
        domain: 'calendar',
        providerKey: this.key,
        title: 'Stage event move',
        summary: `Requested move for event ${id} staged for advanced-calendar.`,
        payload: { id, newStart, newEnd },
      })
      return failure(
        this.key,
        'calendar:moveEvent',
        'Calendar move blocked because CAPABILITIES.write=false.',
        'blockedByCapability',
        buildProviderFailure('blockedByCapability', 'capability_write_disabled', 'write capability is disabled.', false),
        { stagedActionId, metadata: { id } },
      )
    }
    return failure(this.key, 'calendar:moveEvent', 'advanced-calendar move not yet implemented for live execution', 'staged')
  }

  async deleteEvent(id: string): Promise<CalendarActionResult<{ id: string }>> {
    if (!isCapabilityEnabled('write')) {
      const stagedActionId = stageAction({
        domain: 'calendar',
        providerKey: this.key,
        title: 'Stage event delete',
        summary: `Requested deletion for event ${id} staged for advanced-calendar.`,
        payload: { id },
      })
      return failure(
        this.key,
        'calendar:deleteEvent',
        'Calendar delete blocked because CAPABILITIES.write=false.',
        'blockedByCapability',
        buildProviderFailure('blockedByCapability', 'capability_write_disabled', 'write capability is disabled.', false),
        { stagedActionId, metadata: { id } },
      )
    }
    return failure(this.key, 'calendar:deleteEvent', 'advanced-calendar delete not yet implemented for live execution', 'staged')
  }

  async createRecurringEvents(
    template: CalendarEventInput,
    rule: RecurrenceRule,
  ): Promise<CalendarActionResult<CalendarEvent[]>> {
    if (!isCapabilityEnabled('write')) {
      const stagedActionId = stageAction({
        domain: 'calendar',
        providerKey: this.key,
        title: 'Stage recurring schedule',
        summary: `Requested recurring event "${template.title}" staged for cron-scheduling.`,
        payload: { template, rule },
      })
      return failure(
        this.key,
        'calendar:createRecurringEvents',
        'Recurring calendar write blocked because CAPABILITIES.write=false.',
        'blockedByCapability',
        buildProviderFailure('blockedByCapability', 'capability_write_disabled', 'write capability is disabled.', false),
        { stagedActionId, metadata: { title: template.title } },
      )
    }
    return failure(this.key, 'calendar:createRecurringEvents', 'cron-scheduling recurring events not yet implemented for live execution', 'staged')
  }
}

// ── ComposedCalendarProvider ─────────────────────────────────────────────────
// Adapter precedence: Google Calendar → ICS → local safe-root JSON

export class ComposedCalendarProvider implements CalendarProvider {
  readonly key   = 'composed-calendar-provider'
  readonly label = 'Calendar (Composed)'

  private readonly google = new GoogleCalendarAdapter()
  private readonly ics    = new ICSCalendarAdapter()
  private readonly local  = new LocalCalendarProvider()

  /** Determine the best available read adapter at runtime */
  private async bestReadAdapter(): Promise<CalendarProvider> {
    const [googleDesc, icsDesc] = await Promise.all([
      this.google.describe().catch(() => null),
      this.ics.describe().catch(() => null),
    ])

    const googleReady = googleDesc?.capabilities.readCalendar === true
    if (googleReady) return this.google

    // ICS local is always readable; prefer it over bare local JSON
    if (icsDesc?.capabilities.readCalendar) return this.ics

    return this.local
  }

  async adapterStatus(): Promise<ComposedAdapterReport> {
    const [googleDesc, icsDesc, localDesc] = await Promise.all([
      this.google.describe().catch(() => null),
      this.ics.describe().catch(() => null),
      this.local.describe().catch(() => null),
    ])

    const adapters: CalendarAdapterStatus[] = [
      {
        adapter:    'google',
        liveStatus: googleDesc?.health.liveStatus ?? 'UNAVAILABLE',
        detail:     googleDesc?.health.detail ?? 'Google Calendar adapter unavailable',
      },
      {
        adapter:    'ics',
        liveStatus: icsDesc?.health.liveStatus ?? 'UNAVAILABLE',
        detail:     icsDesc?.health.detail ?? 'ICS adapter unavailable',
      },
      {
        adapter:    'local',
        liveStatus: localDesc?.health.liveStatus ?? 'LIVE_READ_ONLY',
        detail:     localDesc?.health.detail ?? 'Local safe-root read',
      },
    ]

    const activeAdapter = resolveActiveCalendarAdapter({
      googleReadable: googleDesc?.capabilities.readCalendar === true,
      icsReadable: icsDesc?.capabilities.readCalendar === true,
    })

    return { activeAdapter, adapters }
  }

  async describe(): Promise<ProviderDescriptor<{
    readCalendar: boolean
    writeCalendar: boolean
    recurringEvents: boolean
  }>> {
    const report = await this.adapterStatus()
    const active = report.adapters.find((a) => a.adapter === report.activeAdapter)

    const googleAdapter = report.adapters.find((a) => a.adapter === 'google')!
    const icsAdapter    = report.adapters.find((a) => a.adapter === 'ics')!

    const detail = [
      `Active adapter: ${report.activeAdapter.toUpperCase()}.`,
      `Google: ${googleAdapter.detail}`,
      `ICS: ${icsAdapter.detail}`,
    ].join(' | ')

    return {
      key:   this.key,
      label: this.label,
      capabilities: {
        readCalendar:    true,
        writeCalendar:   false,
        recurringEvents: false,
      },
      health: {
        state:     active?.liveStatus === 'LIVE' || active?.liveStatus === 'LIVE_READ_ONLY' ? 'ready' : 'degraded',
        liveStatus: active?.liveStatus ?? 'LIVE_READ_ONLY',
        detail,
        missing: [],
        checkedAt: now(),
      },
    }
  }

  async listEvents(filter?: CalendarFilter): Promise<CalendarActionResult<CalendarEvent[]>> {
    const gov = await enforce('advanced-calendar', this.key, 'calendar:listEvents', ['calendar'], false)
    if (!gov.allowed) return toCalendarResult(gov)
    const adapter = await this.bestReadAdapter()
    console.log(`[ComposedCalendarProvider] listEvents() via ${adapter.key}`)

    const result = await adapter.listEvents(filter)
    if (result.success && result.data.length > 0) return result

    // If primary adapter returned empty or failed, merge in local safe-root
    const localResult = adapter === this.local ? result : await this.local.listEvents(filter)
    if (!result.success) return localResult
    // Merge: primary (possibly empty) + local
    const primaryData   = result.success   ? result.data   : []
    const localData     = localResult.success ? localResult.data : []
    const merged = [...primaryData, ...localData]
    // Deduplicate by id
    const seen = new Set<string>()
    const deduped = merged.filter((e) => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })
    deduped.sort((left, right) => left.start.localeCompare(right.start) || left.id.localeCompare(right.id))
    return calendarSuccessResult(
      {
        providerKey: this.key,
        action: 'calendar:listEvents',
        metadata: { activeAdapter: adapter.key, mergedCount: deduped.length },
      },
      deduped,
      `Loaded ${deduped.length} calendar event${deduped.length === 1 ? '' : 's'} via the composed calendar provider.`,
      'readOnlySuccess',
    )
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarActionResult<CalendarEvent>> {
    const gov = await enforce('advanced-calendar', this.key, 'calendar:createEvent', ['calendar', 'write_files'], true)
    if (!gov.allowed) return toCalendarResult(gov)
    const adapter = this.local
    return adapter.createEvent(input)
  }

  async updateEvent(id: string, patch: CalendarEventPatch): Promise<CalendarActionResult<CalendarEvent>> {
    const gov = await enforce('advanced-calendar', this.key, 'calendar:updateEvent', ['calendar', 'write_files'], true)
    if (!gov.allowed) return toCalendarResult(gov)
    const adapter = this.local
    return adapter.updateEvent(id, patch)
  }

  async moveEvent(id: string, newStart: string, newEnd: string): Promise<CalendarActionResult<CalendarEvent>> {
    const gov = await enforce('advanced-calendar', this.key, 'calendar:moveEvent', ['calendar', 'write_files'], true)
    if (!gov.allowed) return toCalendarResult(gov)
    const adapter = this.local
    return adapter.moveEvent(id, newStart, newEnd)
  }

  async deleteEvent(id: string): Promise<CalendarActionResult<{ id: string }>> {
    const gov = await enforce('advanced-calendar', this.key, 'calendar:deleteEvent', ['calendar', 'write_files'], true)
    if (!gov.allowed) return toCalendarResult(gov)
    const adapter = this.local
    return adapter.deleteEvent(id)
  }

  async createRecurringEvents(
    template: CalendarEventInput,
    rule: RecurrenceRule,
  ): Promise<CalendarActionResult<CalendarEvent[]>> {
    const gov = await enforce('cron-scheduling', this.key, 'calendar:createRecurring', ['calendar', 'write_files', 'dev_execution'], true)
    if (!gov.allowed) return toCalendarResult(gov)
    const adapter = this.local
    return adapter.createRecurringEvents(template, rule)
  }
}

export class LocalReminderProvider implements ReminderProvider {
  readonly key = 'time-reminder-provider'
  readonly label = 'Time Reminder Provider'

  async describe(): Promise<ProviderDescriptor<{
    readReminders: boolean
    writeReminders: boolean
  }>> {
    const [cron, probe] = await Promise.all([
      loadSkillManifest('cron-scheduling'),
      probeSkillCallability(),
    ])

    const cronCallable = probe.cronScheduling.level === 'callable'
    const liveStatus = computeSkillProviderLiveStatus({
      runtimeAvailable: Boolean(window.jarvis?.openclaw),
      gatewayOnline: probe.gatewayOnline,
      skillDiscovered: probe.cronScheduling.level !== 'not_discovered' && probe.cronScheduling.level !== 'gateway_offline',
      networkEnabled: isCapabilityEnabled('network'),
    })

    return {
      key: this.key,
      label: this.label,
      capabilities: {
        readReminders: cronCallable,
        writeReminders: false,
      },
      health: {
        state: cronCallable ? 'ready' : 'degraded',
        liveStatus,
        detail: `${cron.label} [${probe.cronScheduling.level}] selected for recurring reminders. ${probe.cronScheduling.reason} Writes remain blocked by DRY_RUN.`,
        missing: cronCallable ? ['write=false'] : [probe.cronScheduling.reason, 'write=false'],
        checkedAt: now(),
      },
    }
  }
}
