import { homedir } from '@/lib/platform'
import { BUILDER_REPO_SCOPE } from '@/shared/builder-bridge'
import { buildAgentOperationalData, type AgentOperationalData } from './agent-operations'
import {
  loadBuilderExecutionHistory,
  type BuilderExecutionHistorySnapshot,
} from './builder-execution'
import { EMPTY_RUN_HISTORY, loadRunHistory, type RunHistorySnapshot } from './run-history'
import localTabExtensionRaw from '../../jarvis-local-demo/tab-extension.md?raw'
import localDemoStateExtensionRaw from '../../jarvis-local-demo/demo-state-extension.md?raw'

function currentDailyMemoryPath(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${homedir()}/.openclaw/workspace/memory/${year}-${month}-${day}.md`
}

export const BACKEND_PATHS = {
  tabManifest:     () => `${homedir()}/.openclaw/workspace/jarvis-system/demo/tab-manifest.md`,
  demoState:       () => `${homedir()}/.openclaw/workspace/jarvis-system/demo/demo-state.md`,
  moduleRegistry:  () => `${homedir()}/.openclaw/workspace/jarvis-system/module-registry.md`,
  decisions:       () => `${homedir()}/.openclaw/workspace/jarvis-system/shared/decisions.md`,
  weeklyStructure: () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/time/weekly-structure.md`,
  candidateBlocks: () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/time/candidate-blocks.md`,
  demandLedger:    () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/work/demand-ledger.md`,
  systemState:     () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/system/state.md`,
  plannerAgent:    () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/agents/planner-agent.md`,
  builderApproval: () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/agents/builder-agent-approval-model.md`,
  checkerAgent:    () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/agents/checker-agent.md`,
  researchState:   () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/research/state.md`,
  researchRole:    () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/research/role.md`,
  calendarState:   () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/calendar/state.md`,
  memoryState:     () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/memory/state.md`,
  memoryRole:      () => `${homedir()}/.openclaw/workspace/jarvis-system/modules/memory/role.md`,
  dailyMemory:     () => currentDailyMemoryPath(),
} as const

export type TruthLabel = 'live' | 'partial' | 'blocked' | 'future'
export type TabId =
  | 'chat'
  | 'tasks'
  | 'calendar'
  | 'automations'
  | 'dashboard'
  | 'concierge'
  | 'coding'
  | 'music'

export interface TabMeta {
  id: string
  label: string
  truthLabel: TruthLabel
  sourceLayer: 'official-openclaw' | 'local-extension'
  backendSource: string
  demoIntent: string
}

export interface DemoSection {
  id: string
  title: string
  status: TruthLabel
  coreCapabilities: string[]
  blockedCapabilities: string[]
  recommendedUiContent: string[]
  warningLabels: string[]
}

export interface AgentCardData {
  id: string
  title: string
  status: TruthLabel
  currentCapabilities: string[]
  blockedCapabilities: string[]
  approvalModel: string[]
  recommendedUiContent: string[]
  warningLabels: string[]
}

export interface WeeklySlot {
  title: string
  label: string
  primaryWorkItem?: string
  primaryBlock?: string
  fallbackBlock?: string
  purpose?: string
  why: string[]
  missPolicy: string[]
  escalationTriggers: string[]
}

export interface CandidateBlock {
  title: string
  blockId: string
  linkedWorkItemId: string
  purpose: string
  blockState: 'protected' | 'tentative' | 'missed'
  blockKind: 'deep-focus' | 'admin-light'
  plannedDuration: string
  suggestedWindow: string
  priorityContext: string
  rescheduleCandidate: boolean
  overloadFlag: boolean
  conflictNotes: string
  notes: string
}

export interface WorkItem {
  itemId: string
  subspace: string
  title: string
  type: string
  status: string
  urgency: string
  importance: string
  effortEstimate: string
  deadlineOrTimePressure: string
  preferredWorkMode: string
  dependenciesBlockers: string[]
  notes: string
  schedulingRelevance: string
  sourceOfTruthConfidence: string
  completionState: string
  partialProgress: string
  linkedTimeBlocks: string[]
  missedBlockRefs: string[]
  rescheduleRefs: string[]
}

export interface WorkLedger {
  rules: string[]
  schoolGap: string
  businessGap: string
  items: WorkItem[]
}

export interface MemorySnapshot {
  stateLines: string[]
  recentSummary: string[]
  decisions: string[]
  dailyMemoryExists: boolean
  dailyMemoryPath: string
}

export interface DemoSnapshot {
  tabs: TabMeta[]
  sections: Record<string, DemoSection>
  agents: AgentCardData[]
  agentOperations: AgentOperationalData[]
  weeklySlots: WeeklySlot[]
  candidateBlocks: CandidateBlock[]
  workLedger: WorkLedger
  decisions: string[]
  systemState: string[]
  researchState: string[]
  calendarState: string[]
  memory: MemorySnapshot
  runHistory: RunHistorySnapshot
  builderExecutionHistory: BuilderExecutionHistorySnapshot
  refreshedAt: string
  errors: string[]
}

type RawFiles = Record<keyof typeof BACKEND_PATHS, string>

const EMPTY_SNAPSHOT: DemoSnapshot = {
  tabs: [],
  sections: {},
  agents: [],
  agentOperations: [],
  weeklySlots: [],
  candidateBlocks: [],
  workLedger: {
    rules: [],
    schoolGap: 'No data loaded.',
    businessGap: 'No data loaded.',
    items: [],
  },
  decisions: [],
  systemState: [],
  researchState: [],
  calendarState: [],
  memory: {
    stateLines: [],
    recentSummary: [],
    decisions: [],
    dailyMemoryExists: false,
    dailyMemoryPath: BACKEND_PATHS.dailyMemory(),
  },
  runHistory: EMPTY_RUN_HISTORY,
  builderExecutionHistory: {
    scope: BUILDER_REPO_SCOPE,
    entries: [],
    source: 'local-demo-fallback',
    sourceLabel: 'no-bridge',
    status: 'blocked',
    note: 'No Builder execution history is available yet.',
  },
  refreshedAt: '',
  errors: [],
}

function normalizeLine(line: string): string {
  return line.replace(/^\s+|\s+$/g, '')
}

function cleanValue(value: string): string {
  return value.replace(/^`|`$/g, '').replace(/^"(.*)"$/, '$1').trim()
}

function slugifyTabId(label: string): string {
  return label.trim().toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
}

function mergeTabs(primary: TabMeta[], secondary: TabMeta[]): TabMeta[] {
  const seen = new Set<string>()
  const merged: TabMeta[] = []

  for (const tab of [...primary, ...secondary]) {
    if (seen.has(tab.id)) continue
    seen.add(tab.id)
    merged.push(tab)
  }

  return merged
}

function mergeSections(
  primary: Array<{ title: string; body: string }>,
  secondary: Array<{ title: string; body: string }>
): Array<{ title: string; body: string }> {
  const byId = new Map<string, { title: string; body: string }>()

  for (const section of [...primary, ...secondary]) {
    byId.set(slugifyTabId(section.title), section)
  }

  return Array.from(byId.values())
}

function splitByHeading(raw: string, prefix: '## ' | '### '): Array<{ title: string; body: string }> {
  const lines = raw.split(/\r?\n/)
  const sections: Array<{ title: string; body: string }> = []
  let currentTitle: string | null = null
  let currentBody: string[] = []

  for (const line of lines) {
    const isHeading = prefix === '## '
      ? line.startsWith('## ') && !line.startsWith('### ')
      : line.startsWith('### ')

    if (isHeading) {
      if (currentTitle) {
        sections.push({ title: currentTitle, body: currentBody.join('\n').trim() })
      }
      currentTitle = line.slice(prefix.length).trim()
      currentBody = []
      continue
    }

    if (currentTitle) currentBody.push(line)
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, body: currentBody.join('\n').trim() })
  }

  return sections
}

function parseIndentedList(body: string, fieldLabel: string): string[] {
  const lines = body.split(/\r?\n/)
  const out: string[] = []
  let collecting = false

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ')
    const trimmed = line.trim()

    if (trimmed === `- ${fieldLabel}:`) {
      collecting = true
      continue
    }

    if (!collecting) continue
    if (/^- [^:]+:\s*/.test(trimmed)) break
    if (/^## /.test(trimmed) || /^### /.test(trimmed)) break

    const itemMatch = line.match(/^\s*-\s+(.*)$/)
    if (itemMatch) out.push(cleanValue(itemMatch[1]))
  }

  return out
}

function parseKeyedBullets(raw: string, startHeading: string): string[] {
  const lines = raw.split(/\r?\n/)
  const out: string[] = []
  let collecting = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === startHeading) {
      collecting = true
      continue
    }
    if (!collecting) continue
    if (/^## /.test(trimmed)) break

    const match = line.match(/^\s*-\s+(.*)$/)
    if (match) out.push(cleanValue(match[1]))
  }

  return out
}

function parseSectionSummary(body: string, title: string): DemoSection {
  const status = cleanValue(body.match(/^- status:\s*(.+)$/m)?.[1] ?? 'partial') as TruthLabel

  return {
    id: slugifyTabId(title),
    title: cleanValue(body.match(/^- title:\s*(.+)$/m)?.[1] ?? title),
    status,
    coreCapabilities: parseIndentedList(body, 'core capabilities'),
    blockedCapabilities: parseIndentedList(body, 'blocked capabilities'),
    recommendedUiContent: parseIndentedList(body, 'recommended UI content'),
    warningLabels: parseIndentedList(body, 'warning labels if needed'),
  }
}

function parseAgentsSection(body: string): AgentCardData[] {
  return splitByHeading(body, '### ').map((section) => {
    const parsed = parseSectionSummary(section.body, section.title)
    return {
      id: section.title.trim().toLowerCase().replace(/[^\w]+/g, '-'),
      title: parsed.title,
      status: parsed.status,
      currentCapabilities: parseIndentedList(section.body, 'current capabilities'),
      blockedCapabilities: parsed.blockedCapabilities,
      approvalModel: parseIndentedList(section.body, 'approval model'),
      recommendedUiContent: parsed.recommendedUiContent,
      warningLabels: parsed.warningLabels,
    }
  })
}

function parseTabManifest(raw: string, sourceLayer: TabMeta['sourceLayer']): TabMeta[] {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|') && !line.includes('---') && !line.includes('| Tab |'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cleanValue(cell)))
    .filter((cells) => cells.length >= 4)
    .map(([label, truthLabel, backendSource, demoIntent]) => ({
      id: slugifyTabId(label),
      label,
      truthLabel: truthLabel as TruthLabel,
      sourceLayer,
      backendSource,
      demoIntent,
    }))
}

function parseFlatYamlBlock(block: string): Record<string, string | boolean | string[]> {
  const data: Record<string, string | boolean | string[]> = {}
  let currentArrayKey: string | null = null

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue

    const arrayItemMatch = line.match(/^\s*-\s+(.*)$/)
    if (arrayItemMatch && currentArrayKey) {
      const existing = data[currentArrayKey]
      if (Array.isArray(existing)) existing.push(cleanValue(arrayItemMatch[1]))
      continue
    }

    const pairMatch = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!pairMatch) continue

    const [, key, rawValue] = pairMatch
    const value = cleanValue(rawValue)
    if (!value) {
      data[key] = []
      currentArrayKey = key
      continue
    }

    currentArrayKey = null
    if (value === 'true' || value === 'false') {
      data[key] = value === 'true'
    } else {
      data[key] = value
    }
  }

  return data
}

function parseTitledYamlBlocks(raw: string): Array<{ title: string; data: Record<string, string | boolean | string[]> }> {
  const sections = splitByHeading(raw, '### ')
  return sections
    .map((section) => {
      const yaml = section.body.match(/```yaml\n([\s\S]*?)```/)
      if (!yaml) return null
      return { title: section.title, data: parseFlatYamlBlock(yaml[1]) }
    })
    .filter((entry): entry is { title: string; data: Record<string, string | boolean | string[]> } => Boolean(entry))
}

function parseWeeklyStructure(raw: string): WeeklySlot[] {
  return splitByHeading(raw, '### ').map((section) => {
    const label = cleanValue(section.body.match(/^- label:\s*(.+)$/m)?.[1] ?? '')
    const primaryWorkItem = cleanValue(section.body.match(/^- primary work item:\s*(.+)$/m)?.[1] ?? '')
    const primaryBlock = cleanValue(section.body.match(/^- primary block:\s*(.+)$/m)?.[1] ?? '')
    const fallbackBlock = cleanValue(section.body.match(/^- fallback block:\s*(.+)$/m)?.[1] ?? '')
    const purpose = cleanValue(section.body.match(/^- purpose:\s*(.+)$/m)?.[1] ?? '')

    const why = extractBulletsAfterMarker(section.body, 'Why this slot exists:')
    const missPolicy =
      extractBulletsAfterMarker(section.body, 'If this slot is missed:').length > 0
        ? extractBulletsAfterMarker(section.body, 'If this slot is missed:')
        : extractBulletsAfterMarker(section.body, 'If this slot is lost:').length > 0
          ? extractBulletsAfterMarker(section.body, 'If this slot is lost:')
          : extractBulletsAfterMarker(section.body, 'Fallback use rule:')

    const escalationTriggers = extractBulletsAfterMarker(section.body, 'When escalation becomes necessary:')

    return {
      title: section.title,
      label,
      primaryWorkItem: primaryWorkItem || undefined,
      primaryBlock: primaryBlock || undefined,
      fallbackBlock: fallbackBlock || undefined,
      purpose: purpose || undefined,
      why,
      missPolicy,
      escalationTriggers,
    }
  })
}

function extractBulletsAfterMarker(body: string, marker: string): string[] {
  const lines = body.split(/\r?\n/)
  const out: string[] = []
  let collecting = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === marker) {
      collecting = true
      continue
    }
    if (!collecting) continue
    if (!trimmed) {
      if (out.length > 0) break
      continue
    }
    if (/^[A-Z][^:]+:$/.test(trimmed) || /^## /.test(trimmed) || /^### /.test(trimmed)) break

    const bullet = line.match(/^\s*-\s+(.*)$/)
    if (bullet) out.push(cleanValue(bullet[1]))
  }

  return out
}

function parseCandidateBlocks(raw: string): CandidateBlock[] {
  return parseTitledYamlBlocks(raw).map(({ title, data }) => ({
    title,
    blockId: String(data['block_id'] ?? ''),
    linkedWorkItemId: String(data['linked_work_item_id'] ?? ''),
    purpose: String(data['purpose'] ?? ''),
    blockState: String(data['block_state'] ?? 'tentative') as CandidateBlock['blockState'],
    blockKind: String(data['block_kind'] ?? 'admin-light') as CandidateBlock['blockKind'],
    plannedDuration: String(data['planned_duration'] ?? ''),
    suggestedWindow: String(data['suggested_window'] ?? ''),
    priorityContext: String(data['priority_context'] ?? ''),
    rescheduleCandidate: Boolean(data['reschedule_candidate']),
    overloadFlag: Boolean(data['overload_flag']),
    conflictNotes: String(data['conflict_notes'] ?? ''),
    notes: String(data['notes'] ?? ''),
  }))
}

function parseDemandLedger(raw: string): WorkLedger {
  const rules = parseKeyedBullets(raw, '## Ledger rules')
  const schoolGap = extractParagraphUnderHeading(raw, '### School gap')
  const businessGap = extractParagraphUnderHeading(raw, '### Business gap')

  const items = parseTitledYamlBlocks(raw).map(({ data }) => ({
    itemId: String(data['item_id'] ?? ''),
    subspace: String(data['subspace'] ?? ''),
    title: String(data['title'] ?? ''),
    type: String(data['type'] ?? ''),
    status: String(data['status'] ?? ''),
    urgency: String(data['urgency'] ?? ''),
    importance: String(data['importance'] ?? ''),
    effortEstimate: String(data['effort_estimate'] ?? ''),
    deadlineOrTimePressure: String(data['deadline_or_time_pressure'] ?? ''),
    preferredWorkMode: String(data['preferred_work_mode'] ?? ''),
    dependenciesBlockers: Array.isArray(data['dependencies_blockers']) ? data['dependencies_blockers'] : [],
    notes: String(data['notes'] ?? ''),
    schedulingRelevance: String(data['scheduling_relevance'] ?? ''),
    sourceOfTruthConfidence: String(data['source_of_truth_confidence'] ?? ''),
    completionState: String(data['completion_state'] ?? ''),
    partialProgress: String(data['partial_progress'] ?? ''),
    linkedTimeBlocks: Array.isArray(data['linked_time_blocks']) ? data['linked_time_blocks'] : [],
    missedBlockRefs: Array.isArray(data['missed_block_refs']) ? data['missed_block_refs'] : [],
    rescheduleRefs: Array.isArray(data['reschedule_refs']) ? data['reschedule_refs'] : [],
  }))

  return { rules, schoolGap, businessGap, items }
}

function extractParagraphUnderHeading(raw: string, heading: string): string {
  const lines = raw.split(/\r?\n/)
  const out: string[] = []
  let collecting = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === heading) {
      collecting = true
      continue
    }
    if (!collecting) continue
    if (/^### /.test(trimmed) || /^## /.test(trimmed)) break
    if (!trimmed && out.length > 0) break
    if (trimmed) out.push(trimmed)
  }

  return out.join(' ')
}

function parseSimpleBullets(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.startsWith('- '))
    .map((line) => cleanValue(line.slice(2)))
}

function parseCurrentDecisions(raw: string): string[] {
  const match = raw.match(/## Current decisions([\s\S]*)$/)
  return parseSimpleBullets(match?.[1] ?? raw)
}

function parseMemorySnapshot(memoryStateRaw: string, decisionsRaw: string, dailyMemoryRaw?: string): MemorySnapshot {
  const stateLines = parseSimpleBullets(memoryStateRaw)
  const recentSummary = dailyMemoryRaw ? parseSimpleBullets(dailyMemoryRaw) : []

  return {
    stateLines,
    recentSummary,
    decisions: parseCurrentDecisions(decisionsRaw),
    dailyMemoryExists: Boolean(dailyMemoryRaw),
    dailyMemoryPath: BACKEND_PATHS.dailyMemory(),
  }
}

function buildFallbackAgentsSection(
  runHistory: RunHistorySnapshot,
  builderExecutionHistory: BuilderExecutionHistorySnapshot
): DemoSection {
  const status: TruthLabel = builderExecutionHistory.source === 'real-bridge'
    ? 'live'
    : runHistory.source === 'workspace-log'
      ? 'partial'
      : 'partial'

  return {
    id: 'agents' as string,
    title: 'Agents',
    status,
    coreCapabilities: [
      'named operator personas over one disciplined Builder and Checker execution spine',
      'editable role, scope, visibility, and operating-state controls in the shell',
      'truthful source labels that distinguish bridge-backed, partial, and doc/demo surfaces',
    ],
    blockedCapabilities: [
      'no autonomous multi-agent execution',
      'no fabricated runtime activity',
      'non-backed agents remain metadata and control overlays until real bridges exist',
    ],
    recommendedUiContent: [
      'agent grid',
      'detail drawer',
      'truth/source map',
      'canonical Builder execution history',
    ],
    warningLabels: [
      'Fallback Agents section generated locally because the backend demo-state did not expose an Agents block.',
    ],
  }
}

function parseDemoSnapshot(
  raw: Partial<RawFiles>,
  errors: string[],
  refreshedAt: string,
  runHistory: RunHistorySnapshot,
  builderExecutionHistory: BuilderExecutionHistorySnapshot
): DemoSnapshot {
  const tabs = mergeTabs(
    parseTabManifest(raw.tabManifest ?? '', 'official-openclaw'),
    parseTabManifest(localTabExtensionRaw, 'local-extension')
  )
  const topLevelSections = mergeSections(
    splitByHeading(raw.demoState ?? '', '## '),
    splitByHeading(localDemoStateExtensionRaw, '## ')
  )

  const parsedSections = topLevelSections.reduce<Record<string, DemoSection>>((acc, section) => {
    const id = slugifyTabId(section.title)
    acc[id] = parseSectionSummary(section.body, section.title)
    return acc
  }, {})

  const agentsSection = topLevelSections.find((section) => section.title === 'Agents')
  const agents = agentsSection ? parseAgentsSection(agentsSection.body) : []
  const systemState = parseSimpleBullets(raw.systemState ?? '')
  const agentOperations = buildAgentOperationalData({
    agentCards: agents,
    runHistory,
    builderExecutionHistory,
    moduleRegistryRaw: raw.moduleRegistry,
    plannerAgentRaw: raw.plannerAgent,
    builderAgentApprovalRaw: raw.builderApproval,
    checkerAgentRaw: raw.checkerAgent,
    memoryRoleRaw: raw.memoryRole,
    researchRoleRaw: raw.researchRole,
    systemState,
  })
  const sections: Record<string, DemoSection> = {
    ...parsedSections,
    agents: parsedSections['agents'] ?? buildFallbackAgentsSection(runHistory, builderExecutionHistory),
  }

  return {
    tabs,
    sections,
    agents,
    agentOperations,
    weeklySlots: parseWeeklyStructure(raw.weeklyStructure ?? ''),
    candidateBlocks: parseCandidateBlocks(raw.candidateBlocks ?? ''),
    workLedger: parseDemandLedger(raw.demandLedger ?? ''),
    decisions: parseCurrentDecisions(raw.decisions ?? ''),
    systemState,
    researchState: parseSimpleBullets(raw.researchState ?? ''),
    calendarState: parseSimpleBullets(raw.calendarState ?? ''),
    memory: parseMemorySnapshot(raw.memoryState ?? '', raw.decisions ?? '', raw.dailyMemory),
    runHistory,
    builderExecutionHistory,
    refreshedAt,
    errors,
  }
}

export async function refreshBackendFiles(): Promise<DemoSnapshot> {
  if (!window.jarvis?.fs) {
    console.warn('[JARVIS] refreshBackendFiles: no Electron bridge (window.jarvis?.fs is falsy)')
    return {
      ...EMPTY_SNAPSHOT,
      refreshedAt: new Date().toISOString(),
      errors: ['No Electron bridge'],
    }
  }

  const keys = Object.keys(BACKEND_PATHS) as Array<keyof typeof BACKEND_PATHS>
  const raw: Partial<RawFiles> = {}
  const errors: string[] = []

  const EMPTY_BUILDER_HISTORY: BuilderExecutionHistorySnapshot = {
    scope: BUILDER_REPO_SCOPE,
    entries: [],
    source: 'local-demo-fallback',
    sourceLabel: 'unavailable',
    status: 'blocked',
    note: 'Builder execution history could not be loaded.',
  }

  const runHistoryPromise = loadRunHistory().catch((error: unknown) => {
    errors.push(
      `runHistory: ${error instanceof Error ? error.message : 'history load failed'}`
    )
    return EMPTY_RUN_HISTORY
  })
  const builderExecutionHistoryPromise = loadBuilderExecutionHistory().catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : 'builder execution history load failed'
    console.error('[JARVIS] loadBuilderExecutionHistory threw unexpectedly:', msg)
    errors.push(`builderExecutionHistory: ${msg}`)
    return EMPTY_BUILDER_HISTORY
  })

  await Promise.all(
    keys.map(async (key) => {
      try {
        const result = await window.jarvis!.fs.readFile(BACKEND_PATHS[key]())
        if (result.ok) {
          raw[key] = result.content
        } else {
          errors.push(`${key}: ${result.error ?? 'read failed'}`)
        }
      } catch (error) {
        errors.push(`${key}: ${error instanceof Error ? error.message : 'read failed'}`)
      }
    })
  )

  const runHistory = await runHistoryPromise
  const builderExecutionHistory = await builderExecutionHistoryPromise

  try {
    return parseDemoSnapshot(raw, errors, new Date().toISOString(), runHistory, builderExecutionHistory)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'snapshot parse failed'
    console.error('[JARVIS] parseDemoSnapshot threw:', msg)
    return {
      ...EMPTY_SNAPSHOT,
      refreshedAt: new Date().toISOString(),
      builderExecutionHistory,
      runHistory,
      errors: [...errors, `parse: ${msg}`],
    }
  }
}

export async function loadDemoSnapshot(): Promise<DemoSnapshot> {
  return refreshBackendFiles()
}
