/**
 * Reservations / Booking Worker
 *
 * Responsibilities:
 *   - turn natural-language requests into structured booking briefs
 *   - keep shortlist options attached to each request
 *   - queue approval-safe booking actions
 *   - generate phone handoff payloads for the phone worker
 *   - process final phone outcomes back into Concierge + Calendar
 *
 * V1 safety rule: never books or calls without explicit approval.
 */

import { createEvent } from '@/calendar/calendarActions'
import { useConciergeStore } from '@/store/concierge'
import type {
  BookingBrief,
  BookingExecutionResult,
  BookingOption,
  BookingRequest,
  BookingType,
  ReservationPhoneHandoff,
} from '../conciergeTypes'

interface BusinessDirectoryEntry {
  canonicalName: string
  aliases: string[]
  phoneNumber?: string
  location: string
  category: BookingType
  area?: string
  notes?: string
}

const BUSINESS_DIRECTORY: BusinessDirectoryEntry[] = [
  {
    canonicalName: 'Nobu',
    aliases: ['nobu', 'nobu london', 'nobu old park lane'],
    phoneNumber: '+442074479874',
    location: '19 Old Park Lane, Mayfair',
    category: 'restaurant',
    area: 'Mayfair',
    notes: 'Japanese-Peruvian restaurant in the Metropolitan Hotel.',
  },
  {
    canonicalName: 'Nobu Hotel Shoreditch',
    aliases: ['nobu hotel shoreditch', 'nobu shoreditch', 'nobu hotel'],
    location: '10-50 Willow Street, Shoreditch',
    category: 'hotel',
    area: 'Shoreditch',
    notes: 'East London Nobu hotel property.',
  },
  {
    canonicalName: 'Nobu Hotel Portman Square',
    aliases: ['nobu hotel portman square', 'nobu portman square', 'nobu hotel'],
    location: '22 Portman Square, Marylebone',
    category: 'hotel',
    area: 'Marylebone',
    notes: 'West End Nobu hotel property.',
  },
  {
    canonicalName: "Scott's",
    aliases: ["scott's", 'scotts', "scott's mayfair"],
    phoneNumber: '+442073070777',
    location: 'Mount Street, Mayfair',
    category: 'restaurant',
    area: 'Mayfair',
    notes: 'Classic Mayfair seafood room.',
  },
  {
    canonicalName: 'Sexy Fish',
    aliases: ['sexy fish', 'sexy fish mayfair'],
    phoneNumber: '+442037644488',
    location: 'Berkeley Square, Mayfair',
    category: 'restaurant',
    area: 'Mayfair',
    notes: 'High-energy Mayfair dining room.',
  },
  {
    canonicalName: 'Bocca di Lupo',
    aliases: ['bocca di lupo', 'bocca', 'bocca soho'],
    phoneNumber: '+442077341222',
    location: 'Archer Street, Soho',
    category: 'restaurant',
    area: 'Soho',
    notes: 'Italian favorite in Soho.',
  },
  {
    canonicalName: 'Lina Stores',
    aliases: ['lina stores', 'lina stores soho'],
    location: 'Brewer Street, Soho',
    category: 'restaurant',
    area: 'Soho',
    notes: 'Casual Italian option in Soho.',
  },
  {
    canonicalName: 'Norma',
    aliases: ['norma', 'norma charlotte street'],
    location: 'Charlotte Street',
    category: 'restaurant',
    area: 'Soho',
    notes: 'Sicilian-leaning option near Soho.',
  },
  {
    canonicalName: "Claridge's",
    aliases: ["claridge's", 'claridges', 'claridges hotel'],
    phoneNumber: '+442076294886',
    location: 'Brook Street, Mayfair',
    category: 'hotel',
    area: 'Mayfair',
    notes: 'Luxury hotel with strong guest services.',
  },
  {
    canonicalName: 'The Connaught',
    aliases: ['the connaught', 'connaught', 'connaught hotel'],
    phoneNumber: '+442074992000',
    location: 'Carlos Place, Mayfair',
    category: 'hotel',
    area: 'Mayfair',
    notes: 'Luxury Mayfair hotel.',
  },
]

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function nextWeekday(base: Date, weekday: number): Date {
  const next = new Date(base)
  const diff = (weekday - next.getDay() + 7) % 7 || 7
  next.setDate(next.getDate() + diff)
  return next
}

function inferBookingType(input: string, typeHint?: BookingType): BookingType {
  if (typeHint && typeHint !== 'other') return typeHint
  const text = input.toLowerCase()
  if (/restaurant|dinner|lunch|breakfast|table|eat|italian/.test(text)) return 'restaurant'
  if (/hotel|room|checkout|check[- ]?in|suite/.test(text)) return 'hotel'
  if (/appointment|doctor|dentist|hair|salon/.test(text)) return 'appointment'
  if (/flight|train|travel/.test(text)) return 'travel'
  return 'other'
}

function normalizeTime(raw: string): string | undefined {
  const trimmed = raw.trim().toLowerCase()
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!match) return undefined

  let hours = Number(match[1])
  const minutes = Number(match[2] ?? '0')
  const suffix = match[3]

  if (suffix === 'pm' && hours < 12) hours += 12
  if (suffix === 'am' && hours === 12) hours = 0
  if (!suffix && hours <= 11) {
    // Reservation requests without am/pm usually imply later-day bookings in V1.
    hours += 12
  }

  if (hours > 23 || minutes > 59) return undefined
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function extractTimeList(input: string): string[] {
  const matches = Array.from(input.matchAll(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/gi))
  const times: string[] = []
  for (const match of matches) {
    const normalized = normalizeTime(match[1])
    if (!normalized) continue
    if (!times.includes(normalized)) times.push(normalized)
  }
  return times
}

function extractPreferredAndFallbackTimes(input: string): { preferredTime?: string; fallbackTimes: string[] } {
  let preferredTime: string | undefined

  for (const pattern of [
    /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    /\btry\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    /\baround\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  ]) {
    const match = input.match(pattern)
    const normalized = match ? normalizeTime(match[1]) : undefined
    if (normalized) {
      preferredTime = normalized
      break
    }
  }

  if (!preferredTime && /tomorrow night|tonight|tomorrow evening|evening/i.test(input)) {
    preferredTime = '20:00'
  }

  const fallbackTimes: string[] = []
  const fallbackSection = input.match(/\botherwise\b(.+)$/i)?.[1]
  const alternativeSection = fallbackSection ?? input.match(/\bor\b(.+)$/i)?.[1]
  if (alternativeSection) {
    for (const time of extractTimeList(alternativeSection)) {
      if (time !== preferredTime && !fallbackTimes.includes(time)) {
        fallbackTimes.push(time)
      }
    }
  }

  return {
    preferredTime,
    fallbackTimes,
  }
}

function extractPartySize(input: string): number | undefined {
  const numeric = input.match(/\bfor\s+(\d{1,2})\b/i)
  if (numeric) return Number(numeric[1])

  const word = input.match(/\bfor\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/i)
  if (!word) return undefined
  return WORD_NUMBERS[word[1].toLowerCase()]
}

function extractDate(input: string, baseDate = new Date()): string | undefined {
  if (/tomorrow/i.test(input)) return addDays(baseDate, 1).toISOString().slice(0, 10)
  if (/tonight/i.test(input)) return baseDate.toISOString().slice(0, 10)
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
  const weekdayMatch = input.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)
  if (weekdayMatch) {
    const weekdayIndex = weekdays.indexOf(weekdayMatch[1].toLowerCase() as (typeof weekdays)[number])
    if (weekdayIndex >= 0) return nextWeekday(baseDate, weekdayIndex).toISOString().slice(0, 10)
  }
  return undefined
}

function extractLocation(input: string): string | undefined {
  const match = input.match(/\b(?:in|near)\s+([a-z0-9' -]+?)(?=\s+(?:tomorrow|tonight|today|at|for|with|otherwise|night)\b|[,.]|$)/i)
  return match?.[1]?.trim()
}

function extractTargetBusiness(input: string): string | undefined {
  const callMatch = input.match(/\bcall\s+(.+?)(?=\s+and\s+(?:ask|book|reserve)|$)/i)
  if (callMatch) return callMatch[1].trim()

  const bookAtMatch = input.match(/\bbook(?:\s+a\s+table)?\s+at\s+(.+?)(?=\s+(?:tomorrow|tonight|today|at|for|with|otherwise|night)\b|[,.]|$)/i)
  if (bookAtMatch) return bookAtMatch[1].trim()

  const directBookMatch = input.match(/\bbook\s+(.+?)\s+for\s+(?:\d|one|two|three|four|five|six|seven|eight|nine|ten|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i)
  if (directBookMatch) {
    const candidate = directBookMatch[1].trim()
    if (!/^(dinner|lunch|breakfast|a table|table|restaurant|hotel|room)\b/i.test(candidate)) {
      return candidate
    }
  }

  return undefined
}

function extractSpecialRequests(input: string): string[] {
  const requests: string[] = []
  if (/late checkout/i.test(input)) requests.push('Late checkout')
  if (/cheapest room/i.test(input)) requests.push('Cheapest available room')
  if (/free or paid/i.test(input)) requests.push('Clarify whether the condition is free or paid')
  if (/only if free/i.test(input)) requests.push('Only accept if the condition is free')

  const withMatch = input.match(/\bwith\s+(.+)$/i)
  if (withMatch) requests.push(withMatch[1].trim())

  return Array.from(new Set(requests))
}

function extractFallbackDateOptions(input: string, baseDate = new Date()): string[] {
  const options: string[] = []
  if (/tomorrow lunch/i.test(input)) {
    options.push(`${addDays(baseDate, 1).toISOString().slice(0, 10)} lunch`)
  }
  return options
}

function extractNegotiationNotes(input: string): string[] {
  const notes: string[] = []
  if (/otherwise/i.test(input)) notes.push('Offer fallback times in order.')
  if (/next best available time/i.test(input)) notes.push('Ask for the next best available time if the preferred slot is unavailable.')
  if (/tomorrow lunch/i.test(input)) notes.push('If dinner fails, ask whether tomorrow lunch works.')
  if (/only if free/i.test(input)) notes.push('Do not accept the condition if it carries an extra fee.')
  if (/free or paid/i.test(input)) notes.push('Clarify whether the requested condition is complimentary or paid.')
  return notes
}

function buildBriefTitle(category: BookingType, targetBusiness?: string): string {
  if (targetBusiness) return targetBusiness
  switch (category) {
    case 'restaurant': return 'Restaurant reservation'
    case 'hotel': return 'Hotel booking inquiry'
    case 'appointment': return 'Appointment booking'
    case 'travel': return 'Travel booking'
    default: return 'Booking request'
  }
}

function normalizeBusinessName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function similarityScore(target: string, candidate: string): number {
  const stopwords = new Set(['hotel', 'restaurant', 'place', 'venue'])
  const targetTokens = new Set(normalizeBusinessName(target).split(' ').filter((token) => token && !stopwords.has(token)))
  const candidateTokens = new Set(normalizeBusinessName(candidate).split(' ').filter((token) => token && !stopwords.has(token)))
  if (targetTokens.size === 0 || candidateTokens.size === 0) return 0

  let overlap = 0
  for (const token of targetTokens) {
    if (candidateTokens.has(token)) overlap++
  }

  return overlap / Math.max(targetTokens.size, candidateTokens.size)
}

function findDirectoryMatches(name?: string, category?: BookingType): BusinessDirectoryEntry[] {
  if (!name) return []
  if (/^(this|that|the)\s+(hotel|restaurant|place|venue)$/i.test(name.trim())) return []
  const normalizedTarget = normalizeBusinessName(name)

  return BUSINESS_DIRECTORY
    .filter((entry) => !category || entry.category === category)
    .map((entry) => {
      const exact = entry.aliases.some((alias) => normalizeBusinessName(alias) === normalizedTarget)
      const partial = Math.max(...entry.aliases.map((alias) => similarityScore(name, alias)))
      return { entry, score: exact ? 1 : partial }
    })
    .filter(({ score }) => score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry)
}

function resolveBusinessDirectory(name?: string, category?: BookingType): BusinessDirectoryEntry | undefined {
  return findDirectoryMatches(name, category)[0]
}

export function createBookingBriefFromText(
  input: string,
  typeHint?: BookingType,
  baseDate = new Date(),
): BookingBrief {
  const category = inferBookingType(input, typeHint)
  const { preferredTime, fallbackTimes } = extractPreferredAndFallbackTimes(input)
  const targetBusiness = extractTargetBusiness(input)
  const matches = findDirectoryMatches(targetBusiness, category)
  const directory = matches[0]
  const targetingStatus = !targetBusiness
    ? 'shortlist'
    : directory && matches.length === 1
      ? 'targeted'
      : matches.length > 1
        ? 'ambiguous'
        : 'needs_lookup'

  return {
    id: makeId('brief'),
    category: directory?.category ?? category,
    requestText: input,
    title: buildBriefTitle(directory?.category ?? category, targetBusiness),
    placeName: targetBusiness,
    location: extractLocation(input) ?? directory?.location,
    date: extractDate(input, baseDate),
    preferredTime,
    fallbackTimes,
    fallbackDateOptions: extractFallbackDateOptions(input, baseDate),
    partySize: extractPartySize(input),
    notes: /call this hotel/i.test(input) ? 'User referenced an existing hotel target.' : undefined,
    specialRequests: extractSpecialRequests(input),
    negotiationNotes: extractNegotiationNotes(input),
    targetBusiness,
    targetingStatus,
    ambiguityNote: matches.length > 1 ? `Multiple plausible matches found for "${targetBusiness}".` : undefined,
    source: 'user_request',
  }
}

function buildOption(
  brief: BookingBrief,
  option: Partial<BookingOption> & Pick<BookingOption, 'id' | 'title' | 'placeName'>,
): BookingOption {
  return {
    id: option.id,
    category: option.category ?? brief.category,
    title: option.title,
    placeName: option.placeName,
    location: option.location ?? brief.location,
    date: option.date ?? brief.date,
    preferredTime: option.preferredTime ?? brief.preferredTime,
    fallbackTimes: option.fallbackTimes ?? brief.fallbackTimes,
    partySize: option.partySize ?? brief.partySize,
    notes: option.notes,
    specialRequests: option.specialRequests ?? brief.specialRequests,
    phoneNumber: option.phoneNumber,
    source: option.source ?? 'heuristic',
    status: option.status ?? 'shortlisted',
    available: option.available ?? true,
    price: option.price,
    detail: option.detail,
  }
}

function heuristicShortlist(brief: BookingBrief): BookingOption[] {
  if (brief.targetBusiness) {
    const matches = findDirectoryMatches(brief.targetBusiness, brief.category)
    if (matches.length === 1) {
      const directory = matches[0]
      return [
        buildOption(brief, {
          id: makeId('opt'),
          title: directory.canonicalName,
          placeName: directory.canonicalName,
          location: directory.location,
          preferredTime: brief.preferredTime,
          phoneNumber: directory.phoneNumber,
          source: 'directory',
          detail: directory.notes ?? brief.requestText,
          matchConfidence: 0.98,
          rankingReason: 'Exact business match from the local directory.',
          requiresPhoneLookup: !directory.phoneNumber,
          status: directory.phoneNumber ? 'shortlisted' : 'needs_lookup',
        }),
      ]
    }

    if (matches.length > 1) {
      return matches.map((directory, index) =>
        buildOption(brief, {
          id: makeId(`opt-${index + 1}`),
          title: directory.canonicalName,
          placeName: directory.canonicalName,
          location: directory.location,
          preferredTime: brief.preferredTime,
          phoneNumber: directory.phoneNumber,
          source: 'directory',
          detail: directory.notes ?? 'Possible business match',
          matchConfidence: Math.max(0.55, 0.9 - index * 0.1),
          rankingReason: 'Ambiguous target match; needs user confirmation before calling.',
          ambiguityNote: brief.ambiguityNote ?? `Multiple businesses match "${brief.targetBusiness}".`,
          status: 'ambiguous',
        }),
      )
    }

    return [
      buildOption(brief, {
        id: makeId('opt'),
        title: brief.targetBusiness,
        placeName: brief.targetBusiness,
        location: brief.location,
        preferredTime: brief.preferredTime,
        source: 'user_target',
        detail: 'Target business needs phone lookup before calling.',
        requiresPhoneLookup: true,
        rankingReason: 'Business specified by the user, but no reliable phone number is stored locally.',
        status: 'needs_lookup',
        available: false,
      }),
    ]
  }

  if (brief.category === 'restaurant' && /mayfair/i.test(brief.location ?? '')) {
    return [
      buildOption(brief, {
        id: makeId('opt'),
        title: "Scott's",
        placeName: "Scott's",
        location: 'Mount Street, Mayfair',
        preferredTime: brief.preferredTime ?? '20:00',
        phoneNumber: resolveBusinessDirectory("Scott's", 'restaurant')?.phoneNumber,
        detail: 'Classic Mayfair dinner room',
        rankingReason: 'Closest match to a classic Mayfair dinner at the requested time.',
        matchConfidence: 0.9,
      }),
      buildOption(brief, {
        id: makeId('opt'),
        title: 'Nobu',
        placeName: 'Nobu',
        location: '19 Old Park Lane, Mayfair',
        preferredTime: brief.fallbackTimes[0] ?? '19:30',
        phoneNumber: resolveBusinessDirectory('Nobu', 'restaurant')?.phoneNumber,
        detail: 'Reliable fallback for later tables',
        rankingReason: 'Strong backup if a premium Mayfair option is needed.',
        matchConfidence: 0.84,
      }),
      buildOption(brief, {
        id: makeId('opt'),
        title: 'Sexy Fish',
        placeName: 'Sexy Fish',
        location: 'Berkeley Square, Mayfair',
        preferredTime: brief.fallbackTimes[1] ?? '20:30',
        phoneNumber: resolveBusinessDirectory('Sexy Fish', 'restaurant')?.phoneNumber,
        detail: 'High-energy backup nearby',
        rankingReason: 'Nearby alternative with a later fallback slot.',
        matchConfidence: 0.79,
      }),
    ]
  }

  if (brief.category === 'restaurant' && /soho/i.test(brief.location ?? '')) {
    return [
      buildOption(brief, {
        id: makeId('opt'),
        title: 'Bocca di Lupo',
        placeName: 'Bocca di Lupo',
        location: 'Archer Street, Soho',
        phoneNumber: resolveBusinessDirectory('Bocca di Lupo', 'restaurant')?.phoneNumber,
        detail: 'Italian favorite in Soho',
        rankingReason: 'Best Soho match for a focused Italian dinner request.',
        matchConfidence: 0.92,
      }),
      buildOption(brief, {
        id: makeId('opt'),
        title: 'Lina Stores',
        placeName: 'Lina Stores',
        location: 'Brewer Street, Soho',
        detail: 'Casual Italian option nearby',
        rankingReason: 'Good fallback if a lighter Soho option is acceptable.',
        matchConfidence: 0.78,
        requiresPhoneLookup: true,
      }),
      buildOption(brief, {
        id: makeId('opt'),
        title: 'Norma',
        placeName: 'Norma',
        location: 'Charlotte Street',
        detail: 'Sicilian-leaning option just north of Soho',
        rankingReason: 'Useful alternative if Soho proper is full.',
        matchConfidence: 0.7,
        requiresPhoneLookup: true,
      }),
    ]
  }

  if (brief.category === 'hotel') {
    return [
      buildOption(brief, {
        id: makeId('opt'),
        title: "Claridge's",
        placeName: "Claridge's",
        location: 'Brook Street, Mayfair',
        phoneNumber: resolveBusinessDirectory("Claridge's", 'hotel')?.phoneNumber,
        detail: 'Likely to handle late-checkout requests well',
        rankingReason: 'Best-known late-checkout handling among local luxury hotels.',
        matchConfidence: 0.88,
      }),
      buildOption(brief, {
        id: makeId('opt'),
        title: 'The Connaught',
        placeName: 'The Connaught',
        location: 'Carlos Place, Mayfair',
        phoneNumber: resolveBusinessDirectory('The Connaught', 'hotel')?.phoneNumber,
        detail: 'Luxury backup with strong concierge desk',
        rankingReason: 'Strong alternative if the top hotel cannot accommodate the request.',
        matchConfidence: 0.81,
      }),
    ]
  }

  return [
    buildOption(brief, {
      id: makeId('opt'),
      title: brief.title,
      placeName: brief.title,
      detail: 'Prepared from the booking brief',
    }),
  ]
}

function getBookingRequest(requestId: string): BookingRequest | undefined {
  return useConciergeStore.getState().bookingRequests.find((r) => r.id === requestId)
}

function resolvePendingReservationApprovals(requestId: string, keepOptionId?: string): void {
  const store = useConciergeStore.getState()
  for (const approval of store.approvalQueue) {
    if (
      approval.workerId === 'reservations' &&
      approval.status === 'pending' &&
      approval.actionRef.startsWith(`reservations:execute:${requestId}:`) &&
      (!keepOptionId || !approval.actionRef.endsWith(`:${keepOptionId}`))
    ) {
      store.resolveApproval(approval.id, 'rejected')
    }
  }
}

export function createBookingRequest(
  type: BookingType,
  description: string,
  requiresPhoneCall = false,
): BookingRequest {
  const store = useConciergeStore.getState()
  const brief = createBookingBriefFromText(description, type)
  const req: BookingRequest = {
    id: makeId('book'),
    type: brief.category,
    description,
    brief,
    options: [],
    status: 'researching',
    requiresPhoneCall: requiresPhoneCall || Boolean(brief.targetBusiness) || brief.category === 'restaurant' || brief.category === 'hotel',
    createdAt: nowIso(),
  }
  store.addBookingRequest(req)
  store.setWorkerStatus('reservations', 'running')
  store.logActivity('reservations', `Booking request created: ${brief.title}`, 'pending', description)
  return req
}

export function applyBookingPreferenceUpdate(updateText: string, requestId?: string): BookingRequest | null {
  const store = useConciergeStore.getState()
  const target = requestId
    ? store.bookingRequests.find((r) => r.id === requestId)
    : store.bookingRequests.find((r) => !['confirmed', 'failed'].includes(r.status))

  if (!target) return null

  const { preferredTime, fallbackTimes } = extractPreferredAndFallbackTimes(updateText)
  if (!preferredTime && fallbackTimes.length === 0) return null

  const nextBrief: BookingBrief = {
    ...target.brief,
    preferredTime: preferredTime ?? target.brief.preferredTime,
    fallbackTimes: fallbackTimes.length > 0 ? fallbackTimes : target.brief.fallbackTimes,
  }

  resolvePendingReservationApprovals(target.id)
  store.updateBookingRequest(target.id, {
    brief: nextBrief,
    options: [],
    selectedOptionId: undefined,
    selectedOption: undefined,
    phoneHandoff: undefined,
    executionResult: undefined,
    linkedCallId: undefined,
    confirmation: undefined,
    linkedCalendarEventId: undefined,
    status: 'researching',
  })
  store.logActivity(
    'reservations',
    `Updated booking timing preferences`,
    'info',
    [nextBrief.preferredTime ? `Preferred: ${nextBrief.preferredTime}` : '', nextBrief.fallbackTimes.length > 0 ? `Fallbacks: ${nextBrief.fallbackTimes.join(', ')}` : '']
      .filter(Boolean)
      .join(' · '),
  )

  const refreshedOptions = generateBookingOptions(target.id)
  if (refreshedOptions.length > 0) {
    setBookingOptions(target.id, refreshedOptions)
  }

  return getBookingRequest(target.id) ?? null
}

/** Called when research is complete and options are ready for the user to review. */
export function setBookingOptions(requestId: string, options: BookingOption[]): void {
  const store = useConciergeStore.getState()
  const request = getBookingRequest(requestId)
  const hasAmbiguousOnly = options.length > 0 && options.every((option) => option.status === 'ambiguous')
  const needsLookupOnly = options.length > 0 && options.every((option) => option.requiresPhoneLookup || option.status === 'needs_lookup')
  const nextStatus = hasAmbiguousOnly || needsLookupOnly ? 'needs_follow_up' : 'ready_for_approval'

  store.setBookingOptions(
    requestId,
    options.map((option) => ({
      ...option,
      status: option.status ?? 'shortlisted',
    })),
  )
  if (request) {
    store.updateBookingRequest(requestId, {
      status: nextStatus,
      notes: hasAmbiguousOnly
        ? request.brief.ambiguityNote ?? 'Clarify the exact target business before calling.'
        : needsLookupOnly
          ? 'Phone number lookup needed before a real call can be placed.'
          : request.notes,
    })
  }
  store.setWorkerStatus('reservations', 'idle')
  store.logActivity('reservations', `${options.length} booking options ready`, 'success', `Request: ${requestId}`)
}

export function generateBookingOptions(
  requestId: string,
  suggestions?: Array<{ name: string; reason: string }>,
): BookingOption[] {
  const request = getBookingRequest(requestId)
  if (!request) return []

  if (suggestions && suggestions.length > 0) {
    return suggestions.map((suggestion, index) =>
      buildOption(request.brief, {
        id: `${request.id}-opt-${index + 1}`,
        title: suggestion.name,
        placeName: suggestion.name,
        detail: suggestion.reason,
        phoneNumber: resolveBusinessDirectory(suggestion.name)?.phoneNumber,
        location: resolveBusinessDirectory(suggestion.name)?.location ?? request.brief.location,
        source: 'agent',
      }),
    )
  }

  return heuristicShortlist(request.brief)
}

/**
 * Queue a selected booking option into the approval queue.
 * Approval covers the actual downstream call/booking execution.
 */
export function selectAndQueueBooking(requestId: string, optionId: string): void {
  const store = useConciergeStore.getState()
  const req = getBookingRequest(requestId)
  if (!req) return

  const option = req.options.find((o) => o.id === optionId)
  if (!option) return
  if (option.status === 'ambiguous') {
    store.updateBookingRequest(requestId, {
      status: 'needs_follow_up',
      notes: option.ambiguityNote ?? 'Clarify the exact business before calling.',
    })
    store.logActivity('reservations', `Clarification needed for ${option.placeName}`, 'info', option.ambiguityNote)
    return
  }
  if (option.requiresPhoneLookup || option.status === 'needs_lookup') {
    store.updateBookingRequest(requestId, {
      status: 'needs_follow_up',
      notes: option.rankingReason ?? 'Phone lookup needed before calling this business.',
    })
    store.logActivity('reservations', `Phone lookup needed for ${option.placeName}`, 'info', option.rankingReason)
    return
  }
  const existingApproval = store.approvalQueue.find(
    (approval) =>
      approval.workerId === 'reservations' &&
      approval.status === 'pending' &&
      approval.actionRef === `reservations:execute:${requestId}:${optionId}`,
  )

  resolvePendingReservationApprovals(requestId, optionId)

  store.updateBookingRequest(requestId, {
    selectedOptionId: optionId,
    selectedOption: { ...option, status: 'selected' },
    phoneHandoff: undefined,
    executionResult: undefined,
    linkedCallId: undefined,
    linkedCalendarEventId: undefined,
    confirmation: undefined,
    status: 'ready_for_approval',
  })

  if (!existingApproval) {
    store.addApproval({
      id: `appr-book-${requestId}-${optionId}`,
      workerId: 'reservations',
      title: req.requiresPhoneCall
        ? `Approve call for ${option.placeName}`
        : `Approve booking for ${option.placeName}`,
      description: [
        `Request: "${req.description}"`,
        `Target: ${option.placeName}`,
        option.location ? `Location: ${option.location}` : '',
        option.preferredTime ? `Preferred time: ${option.preferredTime}` : '',
        option.fallbackTimes && option.fallbackTimes.length > 0 ? `Fallback times: ${option.fallbackTimes.join(', ')}` : '',
        req.brief.partySize ? `Party size: ${req.brief.partySize}` : '',
        req.brief.specialRequests.length > 0 ? `Special requests: ${req.brief.specialRequests.join(', ')}` : '',
      ].filter(Boolean).join('\n'),
      riskLevel: 'low',
      status: 'pending',
      actionRef: `reservations:execute:${requestId}:${optionId}`,
      payload: { requestId, optionId },
      createdAt: nowIso(),
    })
  }

  store.logActivity(
    'reservations',
    `Ready for approval: ${option.placeName}`,
    'pending',
    req.requiresPhoneCall ? 'Will hand off to Phone after approval.' : 'Will finalize after approval.',
  )
}

export function buildPhoneHandoff(requestId: string, optionId: string): ReservationPhoneHandoff | null {
  const store = useConciergeStore.getState()
  const req = getBookingRequest(requestId)
  if (!req) return null

  const option = req.options.find((o) => o.id === optionId) ?? req.selectedOption
  if (!option) return null

  const preferredTime = option.preferredTime ?? req.brief.preferredTime
  const fallbackTimes = option.fallbackTimes ?? req.brief.fallbackTimes
  const placeName = option.placeName || req.brief.targetBusiness || req.brief.title
  const confirmationChecklist = req.type === 'hotel'
    ? ['Confirm room type', 'Confirm nightly rate', 'Confirm whether late checkout is free or paid', 'Note any booking/reference number']
    : ['Confirm business name', 'Confirm final reservation time', 'Confirm party size', 'Note any booking/reference number']

  const keyQuestions = req.type === 'hotel'
    ? [
        'What is the cheapest available room that matches the request?',
        req.brief.specialRequests.some((item) => /free or paid|only accept if the condition is free/i.test(item))
          ? 'Is late checkout free or paid?'
          : 'Can the property offer late checkout?',
        'What is the final nightly rate and what is included?',
      ]
    : [
        'Do you have availability for the requested reservation?',
        fallbackTimes.length > 0 ? 'If the preferred time is unavailable, which fallback time can you confirm?' : 'If the preferred time is unavailable, what is the nearest alternative?',
        'What confirmation details should we note for the booking?',
      ]

  const desiredConfirmationFields = req.type === 'hotel'
    ? ['businessName', 'roomType', 'rate', 'lateCheckout', 'date', 'confirmationReference']
    : ['businessName', 'date', 'time', 'partySize', 'specialRequests', 'confirmationReference']

  const handoff: ReservationPhoneHandoff = {
    id: makeId('handoff'),
    bookingRequestId: req.id,
    bookingOptionId: option.id,
    category: req.type,
    targetBusiness: placeName,
    phoneNumber: option.phoneNumber,
    location: option.location ?? req.brief.location,
    reservationObjective: req.type === 'hotel'
      ? `Ask about the cheapest room and confirm whether late checkout is available${req.brief.date ? ` for ${req.brief.date}` : ''}.`
      : `Book a ${req.type === 'restaurant' ? 'table' : 'reservation'}${req.brief.partySize ? ` for ${req.brief.partySize}` : ''}${preferredTime ? ` at ${preferredTime}` : ''}${req.brief.date ? ` on ${req.brief.date}` : ''}.`,
    date: option.date ?? req.brief.date,
    preferredTime,
    fallbackTimes,
    fallbackDateOptions: req.brief.fallbackDateOptions,
    partySize: option.partySize ?? req.brief.partySize,
    keyQuestions,
    negotiationStrategy: [
      fallbackTimes.length > 0 ? `Offer fallback times in this order: ${fallbackTimes.join(', ')}` : '',
      req.brief.fallbackDateOptions.length > 0 ? `If needed, offer alternate timing: ${req.brief.fallbackDateOptions.join(', ')}` : '',
      ...req.brief.negotiationNotes,
    ].filter(Boolean),
    specialNotes: [req.brief.notes, ...(req.brief.specialRequests ?? []), option.notes].filter(Boolean).join(' · ') || undefined,
    targetStatus: req.brief.targetingStatus,
    clarificationPrompt: req.brief.ambiguityNote,
    mode: 'serious',
    callerIdentity: 'Ahmed',
    confirmationChecklist,
    desiredConfirmationFields,
  }

  store.updateBookingRequest(req.id, {
    selectedOptionId: option.id,
    selectedOption: { ...option, status: 'selected' },
    status: 'queued_for_call',
    phoneHandoff: handoff,
  })
  store.logActivity('reservations', `Phone handoff prepared for ${placeName}`, 'pending', handoff.reservationObjective)
  return handoff
}

export function markBookingCalling(requestId: string, linkedCallId?: string): void {
  const store = useConciergeStore.getState()
  store.updateBookingRequest(requestId, {
    status: 'calling',
    ...(linkedCallId ? { linkedCallId } : {}),
  })
}

async function buildCalendarEvent(result: BookingExecutionResult, request: BookingRequest): Promise<string | undefined> {
  const date = result.confirmedDetails?.date ?? request.brief.date
  const time = result.confirmedDetails?.time ?? request.brief.preferredTime
  if (!date || !time) return undefined

  const [hours, minutes] = time.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return undefined

  const start = new Date(`${date}T00:00:00`)
  start.setHours(hours, minutes, 0, 0)
  const end = new Date(start)
  end.setMinutes(end.getMinutes() + (request.type === 'appointment' ? 60 : 90))

  const event = await createEvent({
    title: request.selectedOption?.placeName ?? request.brief.title,
    start: start.toISOString(),
    end: end.toISOString(),
    location: request.selectedOption?.location ?? request.brief.location,
    notes: result.summary,
    source: 'jarvis',
    metadata: {
      bookingRequestId: request.id,
      linkedCallId: result.linkedCallId,
      category: request.type,
    },
  })

  return event.success ? event.data.id : undefined
}

export async function applyBookingExecutionResult(
  requestId: string,
  result: Omit<BookingExecutionResult, 'linkedCalendarEventId'>,
): Promise<BookingExecutionResult | null> {
  const store = useConciergeStore.getState()
  const request = getBookingRequest(requestId)
  if (!request) return null
  if (
    request.executionResult &&
    request.executionResult.linkedCallId === result.linkedCallId &&
    request.executionResult.status === result.status
  ) {
    return request.executionResult
  }

  const linkedCalendarEventId = result.status === 'confirmed'
    ? await buildCalendarEvent(result, request)
    : undefined
  const finalResult: BookingExecutionResult = {
    ...result,
    linkedCalendarEventId,
  }

  const status = result.status
  const confirmation = status === 'confirmed'
    ? [
        ...Object.entries(result.confirmedDetails ?? {}).map(([key, value]) => `${key}: ${value}`),
        result.fallbackUsed ? `fallback used: ${result.fallbackUsed}` : '',
        result.conditions && result.conditions.length > 0 ? `conditions: ${result.conditions.join(', ')}` : '',
      ].filter(Boolean).join(' · ')
    : result.failureReason ?? result.nextBestStep ?? result.summary

  store.updateBookingRequest(requestId, {
    status,
    executionResult: finalResult,
    confirmation,
    linkedCallId: result.linkedCallId,
    linkedCalendarEventId,
  })

  if (status === 'confirmed') {
    store.logActivity(
      'reservations',
      `Booking confirmed: ${request.selectedOption?.placeName ?? request.brief.title}`,
      'success',
      [result.summary, linkedCalendarEventId ? `Calendar event: ${linkedCalendarEventId}` : ''].filter(Boolean).join(' · '),
    )
  } else {
    store.logActivity(
      'reservations',
      `Booking ${status === 'failed' ? 'failed' : 'needs follow-up'}: ${request.selectedOption?.placeName ?? request.brief.title}`,
      status === 'failed' ? 'failed' : 'info',
      result.failureReason ?? result.nextBestStep ?? result.summary,
    )
  }

  store.setWorkerStatus('reservations', status === 'confirmed' ? 'idle' : 'error')
  return finalResult
}

/** Convenience wrapper used by tests and legacy callers. */
export function confirmBooking(requestId: string, confirmation: string): void {
  void applyBookingExecutionResult(requestId, {
    id: makeId('booking-result'),
    bookingRequestId: requestId,
    status: 'confirmed',
    summary: confirmation,
    confirmedDetails: { confirmation },
    completedAt: nowIso(),
  })
}
