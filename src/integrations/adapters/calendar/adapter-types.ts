import type { ProviderLiveStatus } from '@/integrations/contracts/live-status'

/** Named adapter options in precedence order: google → ics → local */
export type CalendarAdapterName = 'google' | 'ics' | 'local'

/** Per-adapter runtime status snapshot */
export interface CalendarAdapterStatus {
  adapter: CalendarAdapterName
  liveStatus: ProviderLiveStatus
  detail: string
}

/** Summary returned by ComposedCalendarProvider.adapterStatus() */
export interface ComposedAdapterReport {
  activeAdapter: CalendarAdapterName
  adapters: CalendarAdapterStatus[]
}
