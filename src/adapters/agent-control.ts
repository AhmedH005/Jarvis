import type { TruthLabel } from './backend-files'
import type { AgentOperationalData } from './agent-operations'
import type { BuilderExecutionHistorySnapshot } from './builder-execution'
import { buildBuilderRepoTarget, normalizeBuilderWorkTarget, type BuilderWorkTarget } from '@/shared/builder-bridge'

export type AgentPersonaId = 'alex' | 'researcher' | 'kai' | 'maya' | 'noah'
export type AgentControlMode = 'active' | 'paused' | 'constrained'
export type AgentBackingState = 'real-backed' | 'partially real-backed' | 'doc/demo-backed'

export interface AgentControlConfig {
  roleTitle: string
  mission: string
  responsibilities: string[]
  focusTarget: BuilderWorkTarget
  mode: AgentControlMode
  visibleCapabilities: string[]
  notes: string
}

export interface AgentFocusOption {
  id: string
  label: string
  description: string
  pathNote: string
  target: BuilderWorkTarget
}

export interface AgentControlSurface {
  id: AgentPersonaId
  name: string
  roleTitle: string
  purpose: string
  mission: string
  responsibilities: string[]
  mode: AgentControlMode
  truthStatus: TruthLabel
  backingState: AgentBackingState
  backingNote: string
  sourceBindingLabel: string
  sourceAgent: AgentOperationalData
  focusTarget: BuilderWorkTarget
  focusOptionId: string | null
  focusPathNote: string
  visibleCapabilities: string[]
  availableCapabilities: string[]
  blockedCapabilities: string[]
  notes: string
  lastMeaningfulActivity: string
  lastActivityAt?: string
  lastActivityStatus?: AgentOperationalData['lastRun'] extends infer T
    ? T extends { status: infer S }
      ? S
      : never
    : never
  lastActivitySourceLabel: string
  sourceNote: string
  nextUsefulUse: string
}

interface PersonaDefinition {
  id: AgentPersonaId
  name: string
  sourceTitle: string
  sourceBindingLabel: string
  defaultRoleTitle: string
  purpose: string
  defaultMission: string
  defaultResponsibilities: string[]
  defaultFocusOptionId: string
  defaultNotes: string
}

function createFocusTarget(
  targetType: BuilderWorkTarget['targetType'],
  targetId: string,
  targetLabel: string,
  targetPaths: string[]
): BuilderWorkTarget {
  return normalizeBuilderWorkTarget(
    {
      targetType,
      targetId,
      targetLabel,
      targetPaths,
    },
    targetPaths
  )
}

export const AGENT_FOCUS_OPTIONS: AgentFocusOption[] = [
  {
    id: 'repo-wide',
    label: 'repo-wide',
    description: 'Broad operator scope across the current JARVIS repo.',
    pathNote: 'Maps directly to the whole checked-out repo scope.',
    target: buildBuilderRepoTarget(),
  },
  {
    id: 'app/calendar',
    label: 'app/calendar',
    description: 'Calendar-facing surfaces and their connected flow files.',
    pathNote: 'Operator label mapped onto the current calendar module and shell files in this repo.',
    target: createFocusTarget('app', 'app/calendar', 'app/calendar', [
      'src/modules/calendar',
      'src/components/tabs/CalendarTab.tsx',
      'src/flows/health-to-calendar.ts',
      'src/flows/mental-to-calendar.ts',
    ]),
  },
  {
    id: 'app/health',
    label: 'app/health',
    description: 'Health-facing logic and module-level surfaces.',
    pathNote: 'Operator label mapped onto the health module files that exist in this repo today.',
    target: createFocusTarget('app', 'app/health', 'app/health', [
      'src/modules/health',
      'src/flows/health-to-calendar.ts',
    ]),
  },
  {
    id: 'package/scheduler',
    label: 'package/scheduler',
    description: 'Scheduling logic spanning time, work, and execution coordination surfaces.',
    pathNote: 'Operator label mapped onto the closest current scheduling and execution paths in this repo.',
    target: createFocusTarget('package', 'package/scheduler', 'package/scheduler', [
      'src/components/tabs/TimeTab.tsx',
      'src/components/tabs/WorkTab.tsx',
      'src/modules/execution',
    ]),
  },
  {
    id: 'docs/product',
    label: 'docs/product',
    description: 'Product-facing shell language, demo-state framing, and operator copy.',
    pathNote: 'Operator label mapped onto the current product shell files because this repo snapshot has no dedicated docs folder.',
    target: createFocusTarget('docs', 'docs/product', 'docs/product', [
      'src/components/tabs/AgentsTab.tsx',
      'jarvis-local-demo/demo-state-extension.md',
      'jarvis-local-demo/tab-extension.md',
    ]),
  },
]

const PERSONA_DEFINITIONS: PersonaDefinition[] = [
  {
    id: 'alex',
    name: 'Alex',
    sourceTitle: 'Planner Agent',
    sourceBindingLabel: 'Planner Agent overlay',
    defaultRoleTitle: 'Architect',
    purpose: 'Shapes scope, target boundaries, and acceptance criteria before implementation moves.',
    defaultMission: 'Turn ambiguous requests into bounded architecture, target focus, and verification-ready plans.',
    defaultResponsibilities: [
      'define implementation boundaries before code mutation',
      'translate user intent into a scoped focus area',
      'surface risks, dependencies, and verification shape early',
    ],
    defaultFocusOptionId: 'repo-wide',
    defaultNotes: 'Calm, precise, and skeptical of vague scope.',
  },
  {
    id: 'kai',
    name: 'Kai',
    sourceTitle: 'Builder Agent',
    sourceBindingLabel: 'Builder Agent bridge',
    defaultRoleTitle: 'Senior Developer',
    purpose: 'Executes approved implementation work on the single disciplined Builder spine.',
    defaultMission: 'Ship bounded repo changes through the real Builder request, approval, execution, and finalization flow.',
    defaultResponsibilities: [
      'prepare plan-only passes before execution',
      'carry approved work through the real Builder lifecycle',
      'report files changed, commands run, and explicit outcomes',
    ],
    defaultFocusOptionId: 'app/calendar',
    defaultNotes: 'Execution-first, detail-oriented, and explicit about what is real versus pending.',
  },
  {
    id: 'maya',
    name: 'Maya',
    sourceTitle: 'Checker Agent',
    sourceBindingLabel: 'Checker Agent verification overlay',
    defaultRoleTitle: 'Checker',
    purpose: 'Verifies Builder output against approved scope without implying autonomous repair.',
    defaultMission: 'Keep the execution spine honest by attaching explicit verification decisions to completed Builder work.',
    defaultResponsibilities: [
      'review finalized Builder runs against acceptance criteria',
      'separate verification from implementation history',
      'recommend the smallest safe next action when work fails review',
    ],
    defaultFocusOptionId: 'app/calendar',
    defaultNotes: 'Disciplined, evidence-led, and strict about scope drift.',
  },
  {
    id: 'noah',
    name: 'Noah',
    sourceTitle: 'Ops Agent',
    sourceBindingLabel: 'Ops Agent shell overlay',
    defaultRoleTitle: 'Ops',
    purpose: 'Surfaces runtime health, blockers, and operating constraints for the current shell.',
    defaultMission: 'Expose system-state truth and operating blockers before we misread the state of the product.',
    defaultResponsibilities: [
      'watch gateway and runtime health signals',
      'surface blocked states without masking them',
      'keep repo-level operational context visible to the team',
    ],
    defaultFocusOptionId: 'app/health',
    defaultNotes: 'Operational, direct, and biased toward truthful status over optimism.',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    sourceTitle: 'Researcher Agent',
    sourceBindingLabel: 'Research context overlay',
    defaultRoleTitle: 'Researcher',
    purpose: 'Gathers context, compares approaches, and answers "how should we do this?" before execution begins.',
    defaultMission: 'Surface relevant context, prior decisions, and approach tradeoffs before a scoped execution begins.',
    defaultResponsibilities: [
      'gather context relevant to a stated problem',
      'compare implementation approaches and surface tradeoffs',
      'answer "how should we approach this?" without executing',
    ],
    defaultFocusOptionId: 'repo-wide',
    defaultNotes: 'Context-gathering only. Does not execute code or trigger pipeline actions.',
  },
]

function fallbackSourceAgent(title: string): AgentOperationalData {
  return {
    id: title.toLowerCase().replace(/[^\w]+/g, '-'),
    title,
    status: 'partial',
    truthSource: 'doc-derived',
    operationalSummary: 'No operational source was available for this persona binding.',
    currentCapabilities: [],
    blockedCapabilities: [],
    approvalModel: [],
    nextUsefulUse: 'No truthful next-use guidance is available yet.',
    nextUseSource: 'ui-fallback',
    lastKnownResult: 'No recorded activity is available in the current source set.',
    lastRunSourceLabel: 'no recorded run',
    sourceNote: 'Fallback source only. This persona currently has no direct underlying role data.',
  }
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }

  return out
}

function summarizeActivity(agent: AgentOperationalData): {
  summary: string
  timestamp?: string
  status?: AgentControlSurface['lastActivityStatus']
  sourceLabel: string
} {
  if (agent.lastRun) {
    return {
      summary: agent.lastRun.taskSummary || agent.lastKnownResult,
      timestamp: agent.lastRun.timestamp,
      status: agent.lastRun.status,
      sourceLabel: agent.lastRunSourceLabel,
    }
  }

  return {
    summary: agent.lastKnownResult,
    sourceLabel: agent.lastRunSourceLabel,
  }
}

function resolveFocusOption(target: BuilderWorkTarget): AgentFocusOption | null {
  return AGENT_FOCUS_OPTIONS.find((option) => option.target.targetId === target.targetId) ?? null
}

function normalizePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '').trim()
}

function pathMatchesScope(scopePath: string, candidatePath: string): boolean {
  const normalizedScope = normalizePath(scopePath)
  const normalizedCandidate = normalizePath(candidatePath)

  if (!normalizedScope || normalizedScope === '.') return true
  if (!normalizedCandidate || normalizedCandidate === '.') return false

  return (
    normalizedCandidate === normalizedScope ||
    normalizedCandidate.startsWith(`${normalizedScope}/`) ||
    normalizedScope.startsWith(`${normalizedCandidate}/`)
  )
}

export function focusMatchesPaths(focusTarget: BuilderWorkTarget, candidatePaths: string[]): boolean {
  if (focusTarget.targetType === 'repo' || focusTarget.targetId === 'repo') return true
  if (candidatePaths.length === 0) return false

  return focusTarget.targetPaths.some((scopePath) =>
    candidatePaths.some((candidatePath) => pathMatchesScope(scopePath, candidatePath))
  )
}

export function focusMatchesTarget(
  focusTarget: BuilderWorkTarget,
  candidateTarget?: BuilderWorkTarget | null,
  fallbackPaths: string[] = []
): boolean {
  if (focusTarget.targetType === 'repo' || focusTarget.targetId === 'repo') return true
  if (!candidateTarget) return focusMatchesPaths(focusTarget, fallbackPaths)
  if (candidateTarget.targetType === 'repo' || candidateTarget.targetId === 'repo') {
    return focusMatchesPaths(focusTarget, fallbackPaths)
  }
  if (candidateTarget.targetId === focusTarget.targetId) return true

  const candidatePaths = candidateTarget.targetPaths.length > 0 ? candidateTarget.targetPaths : fallbackPaths
  return focusMatchesPaths(focusTarget, candidatePaths)
}

function resolveBackingState(
  definition: PersonaDefinition,
  agent: AgentOperationalData,
  builderExecutionHistory: BuilderExecutionHistorySnapshot
): { state: AgentBackingState; note: string } {
  if (definition.id === 'kai') {
    if (builderExecutionHistory.source === 'real-bridge') {
      return {
        state: 'real-backed',
        note: 'Kai reads directly from the canonical Builder execution history and the live approval/execution bridge.',
      }
    }

    return {
      state: 'partially real-backed',
      note: 'Kai keeps the real Builder control model, but this shell is currently falling back to local demo execution evidence.',
    }
  }

  if (definition.id === 'maya') {
    if (builderExecutionHistory.source === 'real-bridge' && agent.lastRunSourceLabel === 'real bridge') {
      return {
        state: 'real-backed',
        note: 'Maya is reading real bridge-backed verification history attached to canonical Builder runs.',
      }
    }

    if (builderExecutionHistory.source === 'real-bridge') {
      return {
        state: 'partially real-backed',
        note: 'The Checker bridge is present, but this shell has little or no attached manual verification history yet.',
      }
    }
  }

  if (definition.id === 'noah') {
    return {
      state: 'partially real-backed',
      note: 'Noah is grounded in current system-state and module health notes, but not a dedicated autonomous runtime.',
    }
  }

  if (definition.id === 'researcher') {
    return {
      state: 'doc/demo-backed',
      note: 'Researcher is a context-gathering overlay. No dedicated execution bridge or runtime history exists for this role.',
    }
  }

  if (agent.lastRunSourceLabel === 'workspace log') {
    return {
      state: 'partially real-backed',
      note: 'Alex is partially grounded in recorded workspace run history, but still depends on role-doc overlays rather than a dedicated live bridge.',
    }
  }

  if (agent.truthSource === 'doc-derived') {
    return {
      state: 'doc/demo-backed',
      note: 'This persona is currently assembled from role docs and shell metadata only.',
    }
  }

  return {
    state: 'partially real-backed',
    note: 'This persona is grounded in the current shell state, but not a dedicated bridge-backed execution runtime.',
  }
}

export const DEFAULT_AGENT_CONTROL_CONFIGS: Record<AgentPersonaId, AgentControlConfig> = PERSONA_DEFINITIONS.reduce(
  (acc, definition) => {
    const focusOption = AGENT_FOCUS_OPTIONS.find((option) => option.id === definition.defaultFocusOptionId)

    acc[definition.id] = {
      roleTitle: definition.defaultRoleTitle,
      mission: definition.defaultMission,
      responsibilities: definition.defaultResponsibilities,
      focusTarget: focusOption?.target ?? buildBuilderRepoTarget(),
      mode: 'active',
      visibleCapabilities: [],
      notes: definition.defaultNotes,
    }

    return acc
  },
  {} as Record<AgentPersonaId, AgentControlConfig>
)

export function buildAgentControlSurfaces({
  agents,
  builderExecutionHistory,
  configs,
}: {
  agents: AgentOperationalData[]
  builderExecutionHistory: BuilderExecutionHistorySnapshot
  configs: Record<AgentPersonaId, AgentControlConfig>
}): AgentControlSurface[] {
  const byTitle = new Map(agents.map((agent) => [agent.title, agent]))

  return PERSONA_DEFINITIONS.map((definition) => {
    const sourceAgent = byTitle.get(definition.sourceTitle) ?? fallbackSourceAgent(definition.sourceTitle)
    // Always merge stored config on top of defaults so every field is present,
    // even if the persisted shape predates a field being added.
    const config: AgentControlConfig = {
      ...DEFAULT_AGENT_CONTROL_CONFIGS[definition.id],
      ...(configs[definition.id] ?? {}),
    }
    const focusTarget = normalizeBuilderWorkTarget(config.focusTarget, config.focusTarget?.targetPaths ?? ['.'])
    const focusOption = resolveFocusOption(focusTarget)
    const activity = summarizeActivity(sourceAgent)
    const visibleCapabilities = dedupe(
      config.visibleCapabilities.length > 0
        ? config.visibleCapabilities.filter((capability) => sourceAgent.currentCapabilities.includes(capability))
        : sourceAgent.currentCapabilities.slice(0, 4)
    )
    const backing = resolveBackingState(definition, sourceAgent, builderExecutionHistory)

    return {
      id: definition.id,
      name: definition.name,
      roleTitle: config.roleTitle,
      purpose: definition.purpose,
      mission: config.mission,
      responsibilities: config.responsibilities,
      mode: config.mode,
      truthStatus: sourceAgent.status,
      backingState: backing.state,
      backingNote: backing.note,
      sourceBindingLabel: definition.sourceBindingLabel,
      sourceAgent,
      focusTarget,
      focusOptionId: focusOption?.id ?? null,
      focusPathNote: focusOption?.pathNote ?? 'Custom focus target mapped onto the current repo paths.',
      visibleCapabilities,
      availableCapabilities: sourceAgent.currentCapabilities,
      blockedCapabilities: sourceAgent.blockedCapabilities,
      notes: config.notes,
      lastMeaningfulActivity: activity.summary,
      lastActivityAt: activity.timestamp,
      lastActivityStatus: activity.status,
      lastActivitySourceLabel: activity.sourceLabel,
      sourceNote: sourceAgent.sourceNote,
      nextUsefulUse: sourceAgent.nextUsefulUse,
    }
  })
}
