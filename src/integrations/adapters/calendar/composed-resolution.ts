import type { CalendarAdapterName } from './adapter-types'

export interface CalendarAdapterAvailability {
  googleReadable: boolean
  icsReadable: boolean
}

export function resolveActiveCalendarAdapter(
  availability: CalendarAdapterAvailability,
): CalendarAdapterName {
  if (availability.googleReadable) return 'google'
  if (availability.icsReadable) return 'ics'
  return 'local'
}
