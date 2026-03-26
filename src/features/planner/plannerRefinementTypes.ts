export interface RefinementBlockedWindow {
  date: string
  startTime: string
  endTime: string
  reason: string
}

export interface ActiveRefinementConstraints {
  earliestStartTime?: string | null
  latestEndTime?: string | null
  blockedWindows?: RefinementBlockedWindow[]
  preserveMovedBlocks?: boolean
  protectMorning?: boolean
  deepWorkMorningOnly?: boolean
  preferLaterScheduling?: boolean
  minBufferMinutes?: number | null
  avoidDeferringDueSoon?: boolean
  notes?: string[]
}

export function mergeRefinementConstraints(
  base: ActiveRefinementConstraints | undefined,
  delta: ActiveRefinementConstraints,
): ActiveRefinementConstraints {
  return {
    earliestStartTime: delta.earliestStartTime ?? base?.earliestStartTime ?? null,
    latestEndTime: delta.latestEndTime ?? base?.latestEndTime ?? null,
    blockedWindows: dedupeBlockedWindows([...(base?.blockedWindows ?? []), ...(delta.blockedWindows ?? [])]),
    preserveMovedBlocks: delta.preserveMovedBlocks ?? base?.preserveMovedBlocks ?? false,
    protectMorning: delta.protectMorning ?? base?.protectMorning ?? false,
    deepWorkMorningOnly: delta.deepWorkMorningOnly ?? base?.deepWorkMorningOnly ?? false,
    preferLaterScheduling: delta.preferLaterScheduling ?? base?.preferLaterScheduling ?? false,
    minBufferMinutes: delta.minBufferMinutes ?? base?.minBufferMinutes ?? null,
    avoidDeferringDueSoon: delta.avoidDeferringDueSoon ?? base?.avoidDeferringDueSoon ?? false,
    notes: dedupeStrings([...(base?.notes ?? []), ...(delta.notes ?? [])]),
  }
}

export function hasActiveRefinementConstraints(constraints: ActiveRefinementConstraints | undefined | null): boolean {
  if (!constraints) return false
  return Boolean(
    constraints.earliestStartTime ||
    constraints.latestEndTime ||
    (constraints.blockedWindows && constraints.blockedWindows.length > 0) ||
    constraints.preserveMovedBlocks ||
    constraints.protectMorning ||
    constraints.deepWorkMorningOnly ||
    constraints.preferLaterScheduling ||
    constraints.minBufferMinutes ||
    constraints.avoidDeferringDueSoon ||
    (constraints.notes && constraints.notes.length > 0),
  )
}

export function describeRefinementConstraints(constraints: ActiveRefinementConstraints | undefined | null): string[] {
  if (!constraints) return []
  const labels: string[] = []
  if (constraints.protectMorning) labels.push('Morning protected')
  if (constraints.preferLaterScheduling) labels.push('Prefer later scheduling')
  if (constraints.preserveMovedBlocks) labels.push('Moved blocks preserved')
  if (constraints.deepWorkMorningOnly) labels.push('Deep work in mornings')
  if (constraints.earliestStartTime) labels.push(`No starts before ${constraints.earliestStartTime}`)
  if (constraints.latestEndTime) labels.push(`Finish by ${constraints.latestEndTime}`)
  if (constraints.avoidDeferringDueSoon) labels.push('Avoid deferring due-soon work')
  return dedupeStrings([...labels, ...(constraints.notes ?? [])])
}

function dedupeBlockedWindows(windows: RefinementBlockedWindow[]): RefinementBlockedWindow[] {
  const seen = new Set<string>()
  return windows.filter((window) => {
    const key = `${window.date}:${window.startTime}:${window.endTime}:${window.reason}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dedupeStrings(items: string[]): string[] {
  return [...new Set(items.filter((item) => item.trim().length > 0))]
}
