import type { AgentCardData, TruthLabel } from './backend-files'
import type { AgentRunEntry, RunHistorySnapshot } from './run-history'
import type { BuilderExecutionHistoryEntry, BuilderExecutionHistorySnapshot } from './builder-execution'

export type AgentTruthSource = 'demo-state' | 'merged' | 'doc-derived'
export type NextUseSource = 'demo-state' | 'backend-doc' | 'ui-fallback'

export interface AgentOperationalData {
  id: string
  title: string
  status: TruthLabel
  truthSource: AgentTruthSource
  operationalSummary: string
  currentCapabilities: string[]
  blockedCapabilities: string[]
  approvalModel: string[]
  nextUsefulUse: string
  nextUseSource: NextUseSource
  lastRun?: AgentRunEntry
  lastKnownResult: string
  lastRunSourceLabel: string
  sourceNote: string
  fallbackNote?: string
}

interface AgentOperationalInputs {
  agentCards: AgentCardData[]
  runHistory: RunHistorySnapshot
  builderExecutionHistory: BuilderExecutionHistorySnapshot
  moduleRegistryRaw?: string
  plannerAgentRaw?: string
  builderAgentApprovalRaw?: string
  checkerAgentRaw?: string
  memoryRoleRaw?: string
  researchRoleRaw?: string
  systemState: string[]
}

const TARGET_AGENT_ORDER = [
  'Planner Agent',
  'Builder Agent',
  'Checker Agent',
  'Memory Agent',
  'Ops Agent',
  'Researcher Agent',
  'News Agent',
] as const

function cleanValue(value: string): string {
  return value.replace(/^`|`$/g, '').replace(/^"(.*)"$/, '$1').trim()
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '')
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const item of items.map((entry) => entry.trim()).filter(Boolean)) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }

  return out
}

function extractBulletsAfterMarker(raw: string | undefined, marker: string): string[] {
  if (!raw) return []

  const lines = raw.split(/\r?\n/)
  const out: string[] = []
  let collecting = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === marker) {
      collecting = true
      continue
    }

    if (!collecting) continue
    if (/^## /.test(trimmed) || /^### /.test(trimmed)) break
    if (/^[A-Z][^:]+:$/.test(trimmed)) break

    const bullet = line.match(/^\s*-\s+(.*)$/)
    if (bullet) out.push(cleanValue(bullet[1]))
  }

  return out
}

function extractBulletsUnderHeading(raw: string | undefined, heading: string): string[] {
  if (!raw) return []

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
    if ((/^## /.test(trimmed) || /^### /.test(trimmed)) && trimmed !== heading) break

    const bullet = line.match(/^\s*-\s+(.*)$/)
    if (bullet) out.push(cleanValue(bullet[1]))
  }

  return out
}

function parseModuleLiveStatus(raw: string | undefined, moduleName: string): string | undefined {
  if (!raw) return undefined

  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue
    if (line.includes('| Module |') || line.includes('---')) continue

    const cells = line.split('|').slice(1, -1).map((cell) => cleanValue(cell))
    if (cells.length < 4) continue
    if (cells[0].toLowerCase() !== moduleName.toLowerCase()) continue
    return cells[3]
  }

  return undefined
}

function latestRunForAgent(runHistory: RunHistorySnapshot, title: string): AgentRunEntry | undefined {
  const key = normalizeKey(title)
  return runHistory.runs.find((run) => normalizeKey(run.agent) === key)
}

function toAgentRunStatus(
  state: BuilderExecutionHistoryEntry['executionState']
): AgentRunEntry['status'] {
  switch (state) {
    case 'started':
      return 'started'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'blocked':
    default:
      return 'blocked'
  }
}

function latestBuilderExecutionRun(
  builderExecutionHistory: BuilderExecutionHistorySnapshot
): AgentRunEntry | undefined {
  const latest = builderExecutionHistory.entries[0]
  if (!latest) return undefined

  return {
    id: latest.runId,
    agent: 'Builder Agent',
    taskSummary: latest.taskSummary || latest.summary || `Builder execution run ${latest.runId}`,
    status: toAgentRunStatus(latest.executionState),
    filesChanged: latest.filesChanged ?? [],
    commandsRun: latest.commandsRun ?? [],
    verificationResult: latest.summary || latest.note,
    timestamp: latest.finishedAt || latest.startedAt || latest.createdAt,
  }
}

function latestCheckerVerificationRun(
  builderExecutionHistory: BuilderExecutionHistorySnapshot
): AgentRunEntry | undefined {
  const latest = builderExecutionHistory.entries.find((entry) => Boolean(entry.verificationState))
  if (!latest?.verificationState) return undefined

  return {
    id: `checker-${latest.runId}`,
    agent: 'Checker Agent',
    taskSummary: latest.taskSummary || `Checker review for Builder run ${latest.runId}`,
    status:
      latest.verificationState === 'passed'
        ? 'completed'
        : latest.verificationState === 'failed'
          ? 'failed'
          : 'blocked',
    filesChanged: [],
    commandsRun: [],
    verificationResult: latest.verificationSummary || latest.note,
    timestamp: latest.checkedAt || latest.finishedAt || latest.startedAt || latest.createdAt,
  }
}

function defaultLastKnownResult(
  lastRun: AgentRunEntry | undefined,
  runHistory: RunHistorySnapshot,
  fallback: string
): { lastKnownResult: string; lastRunSourceLabel: string } {
  if (!lastRun) {
    return {
      lastKnownResult: fallback,
      lastRunSourceLabel: 'no recorded run',
    }
  }

  return {
    lastKnownResult: lastRun.verificationResult,
    lastRunSourceLabel: runHistory.sourceLabel,
  }
}

function fallbackCard(title: string, status: TruthLabel, id?: string): AgentCardData {
  return {
    id: id ?? normalizeKey(title),
    title,
    status,
    currentCapabilities: [],
    blockedCapabilities: [],
    approvalModel: [],
    recommendedUiContent: [],
    warningLabels: [],
  }
}

function mergedTruthSource(baseAgent: AgentCardData | undefined, mergedDocs: boolean): AgentTruthSource {
  if (baseAgent && mergedDocs) return 'merged'
  if (baseAgent) return 'demo-state'
  return 'doc-derived'
}

export function buildAgentOperationalData({
  agentCards,
  runHistory,
  builderExecutionHistory,
  moduleRegistryRaw,
  plannerAgentRaw,
  builderAgentApprovalRaw,
  checkerAgentRaw,
  memoryRoleRaw,
  researchRoleRaw,
  systemState,
}: AgentOperationalInputs): AgentOperationalData[] {
  const byTitle = new Map(agentCards.map((agent) => [agent.title, agent]))

  const plannerBase = byTitle.get('Planner Agent')
  const builderBase = byTitle.get('Builder Agent')
  const checkerBase = byTitle.get('Checker Agent')
  const memoryBase = byTitle.get('Memory Agent')
  const opsBase = byTitle.get('Ops Agent')
  const researcherBase = byTitle.get('Researcher Agent')
  const newsBase = byTitle.get('News Agent')

  const plannerDocCapabilities = extractBulletsAfterMarker(plannerAgentRaw, 'Allowed:')
  const plannerDocBlocked = extractBulletsAfterMarker(plannerAgentRaw, 'Blocked:')
  const checkerDocCapabilities = extractBulletsAfterMarker(checkerAgentRaw, 'Allowed:')
  const checkerDocBlocked = extractBulletsAfterMarker(checkerAgentRaw, 'Blocked:')
  const builderSafeActions = extractBulletsUnderHeading(builderAgentApprovalRaw, '### 1. Pre-approved safe actions')
  const builderApprovalNeeded = extractBulletsUnderHeading(builderAgentApprovalRaw, '### 2. Approval-needed actions')
  const builderEscalations = extractBulletsUnderHeading(builderAgentApprovalRaw, '### 3. Escalation-required actions')
  const memoryBlockedTools = extractBulletsUnderHeading(memoryRoleRaw, '## Blocked tools / missing dependencies')
  const researchBlockedTools = extractBulletsUnderHeading(researchRoleRaw, '## Blocked tools / missing dependencies')

  const memoryModuleStatus = parseModuleLiveStatus(moduleRegistryRaw, 'memory')
  const systemModuleStatus = parseModuleLiveStatus(moduleRegistryRaw, 'system')
  const researchModuleStatus = parseModuleLiveStatus(moduleRegistryRaw, 'research')

  const plannerRun = latestRunForAgent(runHistory, 'Planner Agent')
  const builderRun = builderExecutionHistory.source === 'real-bridge'
    ? latestBuilderExecutionRun(builderExecutionHistory)
    : latestRunForAgent(runHistory, 'Builder Agent')
  const checkerRun = builderExecutionHistory.source === 'real-bridge'
    ? latestCheckerVerificationRun(builderExecutionHistory) ?? latestRunForAgent(runHistory, 'Checker Agent')
    : latestRunForAgent(runHistory, 'Checker Agent')
  const memoryRun = latestRunForAgent(runHistory, 'Memory Agent')
  const opsRun = latestRunForAgent(runHistory, 'Ops Agent')
  const researcherRun = latestRunForAgent(runHistory, 'Researcher Agent')
  const newsRun = latestRunForAgent(runHistory, 'News Agent')
  const plannerLast = defaultLastKnownResult(
    plannerRun,
    runHistory,
    'No recorded Planner run yet. Current card is derived from backend role docs rather than a workspace run log.'
  )
  const builderLast = defaultLastKnownResult(
    builderRun,
    builderExecutionHistory.source === 'real-bridge'
      ? {
          ...runHistory,
          sourceLabel: builderExecutionHistory.sourceLabel,
        }
      : runHistory,
    builderExecutionHistory.source === 'real-bridge'
      ? 'No real Builder runs have been recorded in the persistent local request/run stores yet.'
      : 'No recorded Builder run yet in the current agent-run-history source.'
  )
  const checkerLast = defaultLastKnownResult(
    checkerRun,
    builderExecutionHistory.source === 'real-bridge' && checkerRun
      ? {
          ...runHistory,
          sourceLabel: builderExecutionHistory.sourceLabel,
        }
      : runHistory,
    builderExecutionHistory.source === 'real-bridge'
      ? 'No real Checker verification has been attached to a finalized Builder run yet.'
      : 'No recorded Checker run yet. Current card is derived from backend role docs rather than a workspace run log.'
  )

  const plannerAgent: AgentOperationalData = {
    ...fallbackCard('Planner Agent', runHistory.source === 'workspace-log' && plannerRun ? 'live' : 'partial'),
    ...(plannerBase ?? {}),
    status: plannerBase?.status ?? (runHistory.source === 'workspace-log' && plannerRun ? 'live' : 'partial'),
    truthSource: mergedTruthSource(plannerBase, true),
    operationalSummary: 'Read-only planning worker for the current Planner → Builder → Checker pipeline.',
    currentCapabilities: dedupe([
      ...plannerDocCapabilities,
      ...(plannerBase?.currentCapabilities ?? []),
      'define acceptance criteria',
      'recommend a verification path',
    ]),
    blockedCapabilities: dedupe([
      ...plannerDocBlocked,
      ...(plannerBase?.blockedCapabilities ?? []),
    ]),
    approvalModel: dedupe([
      'repo inspection and planning are allowed inside /Users/ahmedh005/Jarvis',
      'mutation stays blocked until Builder receives an approved run',
      'scope ambiguity, repo expansion, or destructive work escalates back to Jarvis Prime',
      ...(plannerBase?.approvalModel ?? []),
    ]),
    nextUsefulUse: 'Use before code changes when a Jarvis repo request needs scoped files, acceptance criteria, and a verification plan.',
    nextUseSource: plannerAgentRaw ? 'backend-doc' : 'ui-fallback',
    lastRun: plannerRun,
    lastKnownResult: plannerLast.lastKnownResult,
    lastRunSourceLabel: plannerLast.lastRunSourceLabel,
    sourceNote: 'Role doc-backed card. Planner is documented in backend worker files but is not yet exposed as its own demo-state block.',
    fallbackNote: 'Planner details are doc-derived on this surface because demo-state currently enumerates five agents, not the full sequential dev-team loop.',
  }

  const builderAgent: AgentOperationalData = {
    ...fallbackCard('Builder Agent', 'live'),
    ...(builderBase ?? {}),
    status: builderBase?.status ?? 'live',
    truthSource: mergedTruthSource(builderBase, true),
    operationalSummary: 'Repo-scoped implementation worker with bounded autonomy inside approved Jarvis runs.',
    currentCapabilities: dedupe([
      ...(builderBase?.currentCapabilities ?? []),
      builderExecutionHistory.source === 'real-bridge'
        ? 'plan-only task intake from the Agents tab through the real local Builder bridge'
        : 'plan-only task intake from the Agents tab using a clearly labeled local demo fallback when no live Builder bridge exists',
      'approval-gated execution request packaging from the current Builder plan without implying code mutation',
      'truthful execution reports with files changed, commands run, and verification results',
    ]),
    blockedCapabilities: dedupe([
      ...(builderBase?.blockedCapabilities ?? []),
    ]),
    approvalModel: dedupe([
      builderSafeActions[0] ? 'read, inspect, and plan work inside /Users/ahmedh005/Jarvis are pre-approved safe actions' : '',
      builderApprovalNeeded[0] ? 'file mutation and repo-mutating commands require an approved run scope' : '',
      builderEscalations[0] ? 'destructive, scope-expanding, or secret-sensitive steps always escalate' : '',
      ...(builderBase?.approvalModel ?? []),
    ]),
    nextUsefulUse: 'Use this card for a safe plan-only pass first, then package a scoped approval-gated execution request before any approved repo change or bounded verification run.',
    nextUseSource: builderAgentApprovalRaw ? 'backend-doc' : 'demo-state',
    lastRun: builderRun,
    lastKnownResult: builderLast.lastKnownResult,
    lastRunSourceLabel: builderLast.lastRunSourceLabel,
    sourceNote: builderExecutionHistory.source === 'real-bridge'
      ? 'Demo-state live role, cross-checked against the live Builder bridge, approval model, and persistent request/run stores.'
      : 'Demo-state live role, cross-checked against the Builder approval model and current worker-run history.',
    fallbackNote: builderExecutionHistory.source !== 'real-bridge' && runHistory.source === 'local-demo-fallback'
      ? 'Recorded Builder activity is currently coming from the local demo fallback log, not a workspace-backed runtime file.'
      : undefined,
  }

  const checkerAgent: AgentOperationalData = {
    ...fallbackCard('Checker Agent', runHistory.source === 'workspace-log' && checkerRun ? 'live' : 'partial'),
    ...(checkerBase ?? {}),
    status: checkerBase?.status ?? (runHistory.source === 'workspace-log' && checkerRun ? 'live' : 'partial'),
    truthSource: mergedTruthSource(checkerBase, true),
    operationalSummary: 'Verification gate that checks Builder output against the approved plan and acceptance criteria.',
    currentCapabilities: dedupe([
      ...checkerDocCapabilities,
      ...(checkerBase?.currentCapabilities ?? []),
      builderExecutionHistory.source === 'real-bridge'
        ? 'manual verification attachment for finalized Builder runs through the local Checker bridge'
        : '',
      'summarize failures clearly',
      'recommend the smallest next action',
    ]),
    blockedCapabilities: dedupe([
      ...checkerDocBlocked,
      ...(checkerBase?.blockedCapabilities ?? []),
    ]),
    approvalModel: dedupe([
      'verification commands only run inside the approved repo envelope',
      'focused repair can hand back to Builder only when scope and acceptance criteria stay unchanged',
      'new approval classes or broader redesign escalate back to Jarvis Prime',
      ...(checkerBase?.approvalModel ?? []),
    ]),
    nextUsefulUse: 'Use after Builder finishes when you need a pass, fail, or partial call tied to explicit acceptance criteria.',
    nextUseSource: checkerAgentRaw ? 'backend-doc' : 'ui-fallback',
    lastRun: checkerRun,
    lastKnownResult: checkerLast.lastKnownResult,
    lastRunSourceLabel: checkerLast.lastRunSourceLabel,
    sourceNote: builderExecutionHistory.source === 'real-bridge'
      ? 'Role doc-backed card, now cross-checked against manual Checker verification attached to the real Builder run store.'
      : 'Role doc-backed card. Checker is documented in backend worker files but is not yet exposed as its own demo-state block.',
    fallbackNote: builderExecutionHistory.source === 'real-bridge'
      ? undefined
      : 'Checker details are doc-derived on this surface because demo-state currently enumerates five agents, not the full sequential dev-team loop.',
  }

  const memoryNoRunFallback = memoryModuleStatus
    ? `No recorded Memory Agent run yet. Module registry currently marks memory as ${memoryModuleStatus}.`
    : 'No recorded Memory Agent run yet in the current agent-run-history source.'

  const memoryAgent: AgentOperationalData = {
    ...fallbackCard('Memory Agent', 'live'),
    ...(memoryBase ?? {}),
    status: memoryBase?.status ?? 'live',
    truthSource: mergedTruthSource(memoryBase, true),
    operationalSummary: 'Live context retrieval worker backed by workspace memory files and current memory tools.',
    currentCapabilities: dedupe([
      ...(memoryBase?.currentCapabilities ?? []),
    ]),
    blockedCapabilities: dedupe([
      ...(memoryBase?.blockedCapabilities ?? []),
      ...memoryBlockedTools,
    ]),
    approvalModel: dedupe([
      ...(memoryBase?.approvalModel ?? []),
      'retrieval is allowed; durable writeback follows memory workflow rules',
    ]),
    nextUsefulUse: 'Use when a task depends on prior context, daily memory, or curated project recall before acting.',
    nextUseSource: memoryRoleRaw ? 'backend-doc' : 'demo-state',
    lastRun: memoryRun,
    lastKnownResult: memoryNoRunFallback,
    lastRunSourceLabel: memoryRun ? runHistory.sourceLabel : 'no recorded run',
    sourceNote: 'Demo-state live role, cross-checked against the memory module contract and tool boundaries.',
  }

  const opsFallbackState = systemState.slice(0, 2).join('; ')
  const opsAgent: AgentOperationalData = {
    ...fallbackCard('Ops Agent', 'live'),
    ...(opsBase ?? {}),
    status: opsBase?.status ?? 'live',
    truthSource: mergedTruthSource(opsBase, true),
    operationalSummary: 'Diagnostic worker for gateway/runtime truth, surfaced blockers, and backend health notes.',
    currentCapabilities: dedupe([
      ...(opsBase?.currentCapabilities ?? []),
    ]),
    blockedCapabilities: dedupe([
      ...(opsBase?.blockedCapabilities ?? []),
    ]),
    approvalModel: dedupe([
      ...(opsBase?.approvalModel ?? []),
      'diagnostics are allowed; mutations remain approval-gated',
    ]),
    nextUsefulUse: 'Use when gateway status, runtime blockers, or backend-health context needs to be surfaced before taking action.',
    nextUseSource: 'demo-state',
    lastRun: opsRun,
    lastKnownResult: opsFallbackState
      ? `No recorded Ops Agent run yet. Current system state says: ${opsFallbackState}.`
      : `No recorded Ops Agent run yet.${systemModuleStatus ? ` Module registry marks system as ${systemModuleStatus}.` : ''}`,
    lastRunSourceLabel: opsRun ? runHistory.sourceLabel : 'no recorded run',
    sourceNote: 'Demo-state live role, cross-checked against live system-module truth and current system state files.',
  }

  const researcherAgent: AgentOperationalData = {
    ...fallbackCard('Researcher Agent', 'partial'),
    ...(researcherBase ?? {}),
    status: researcherBase?.status ?? 'partial',
    truthSource: researcherBase ? 'demo-state' : 'doc-derived',
    operationalSummary: 'Context-gathering role for approach comparison and prior decision surfacing before execution begins.',
    currentCapabilities: dedupe([
      ...(researcherBase?.currentCapabilities ?? []),
      'gather context relevant to a stated problem',
      'compare implementation approaches and surface tradeoffs',
      'answer approach questions without executing',
    ]),
    blockedCapabilities: dedupe([
      ...(researcherBase?.blockedCapabilities ?? []),
      'code execution',
      'Builder pipeline access',
      'direct repo mutation',
    ]),
    approvalModel: dedupe([
      ...(researcherBase?.approvalModel ?? []),
    ]),
    nextUsefulUse: 'Use before a scoped execution when you need to compare approaches, surface prior context, or answer "how should we approach this?"',
    nextUseSource: 'demo-state',
    lastRun: researcherRun,
    lastKnownResult: 'No recorded Researcher activity yet. This role surfaces context and approach guidance, not execution history.',
    lastRunSourceLabel: researcherRun ? runHistory.sourceLabel : 'no recorded run',
    sourceNote: 'Context-gathering overlay only. No dedicated backend worker or execution bridge.',
    fallbackNote: 'Researcher capabilities come from the role overlay — no separate backend worker file exists for this role yet.',
  }

  const newsAgent: AgentOperationalData = {
    ...fallbackCard('News Agent', 'blocked'),
    ...(newsBase ?? {}),
    status: newsBase?.status ?? 'blocked',
    truthSource: mergedTruthSource(newsBase, true),
    operationalSummary: 'Research boundary only until provider-backed live search is connected.',
    currentCapabilities: dedupe([
      ...(newsBase?.currentCapabilities ?? []),
    ]),
    blockedCapabilities: dedupe([
      ...(newsBase?.blockedCapabilities ?? []),
      ...researchBlockedTools,
    ]),
    approvalModel: dedupe([
      ...(newsBase?.approvalModel ?? []),
    ]),
    nextUsefulUse: 'Use to explain the current research block honestly or to resume live news gathering once provider configuration exists.',
    nextUseSource: researchRoleRaw ? 'backend-doc' : 'demo-state',
    lastRun: newsRun,
    lastKnownResult: `No recorded News Agent run yet.${researchModuleStatus ? ` Research is currently ${researchModuleStatus}.` : ''}`,
    lastRunSourceLabel: newsRun ? runHistory.sourceLabel : 'no recorded run',
    sourceNote: 'Demo-state blocked role, cross-checked against the research module blocked-state contract.',
  }

  const built = new Map(
    [
      plannerAgent,
      builderAgent,
      checkerAgent,
      memoryAgent,
      opsAgent,
      researcherAgent,
      newsAgent,
    ].map((agent) => [agent.title, agent] as const)
  )

  return TARGET_AGENT_ORDER
    .map((title) => built.get(title))
    .filter((agent): agent is AgentOperationalData => Boolean(agent))
}
