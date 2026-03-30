/**
 * Readiness Engine
 *
 * Evaluates each active provider/action against the full set of runtime
 * conditions and produces typed ReadinessCheckResults.
 *
 * Checks performed per action:
 *   1. Bridge / IPC path wired?
 *   2. Credentials / env vars present?
 *   3. NO_SECRETS_MODE blocks credential reads?
 *   4. CAPABILITIES.network / execute / write enabled?
 *   5. DRY_RUN blocks writes?
 *   6. Governance: trust level and permission scopes?
 *   7. Runtime verification signal present?
 *
 * Promotion rules are encoded explicitly — no guessing.
 * Every rule references the exact flag/condition it depends on.
 */

import { DRY_RUN, NO_SECRETS_MODE, CAPABILITIES } from '@/shared/operational-safety'
import { getGovernanceRecord } from '@/integrations/governance/skill-governance-store'
import { readSafeJson } from '@/integrations/runtime/files'
import type {
  ProviderReadinessLevel,
  ProviderBlocker,
  ProviderBlockerType,
  PromotionStage,
  ReadinessCheckResult,
  ProviderReadinessSummary,
  SystemReadinessReport,
} from '@/shared/readiness-types'
import type { ActivationState, ActivationProviderState } from '@/shared/activation-types'

function now(): string {
  return new Date().toISOString()
}

function blocker(type: ProviderBlockerType, reason: string, resolution: string): ProviderBlocker {
  return { type, reason, resolution }
}

// ── Shared condition helpers ───────────────────────────────────────────────

function dryRunBlocksWrite(): ProviderBlocker {
  return blocker('dry_run', 'DRY_RUN=true prevents write operations from executing.', 'Set DRY_RUN=false in src/shared/operational-safety.ts')
}

function networkDisabled(): ProviderBlocker {
  return blocker('network_disabled', 'CAPABILITIES.network=false — outbound calls are blocked.', 'Set CAPABILITIES.network=true in src/shared/operational-safety.ts')
}

function executeDisabled(): ProviderBlocker {
  return blocker('capability_disabled', 'CAPABILITIES.execute=false — execution is blocked.', 'Set CAPABILITIES.execute=true in src/shared/operational-safety.ts')
}

function writeDisabled(): ProviderBlocker {
  return blocker('capability_disabled', 'CAPABILITIES.write=false — file/state writes are blocked.', 'Set CAPABILITIES.write=true in src/shared/operational-safety.ts')
}

function noSecretsBlocks(keyName: string): ProviderBlocker {
  return blocker('safe_execution_not_verified', `${keyName} is present in env but NO_SECRETS_MODE=true prevents reading it via readSecret().`, 'Set NO_SECRETS_MODE=false in src/shared/operational-safety.ts')
}

function missingCredential(keyName: string, description: string): ProviderBlocker {
  return blocker('missing_credentials', `${keyName} is absent from the environment. ${description}`, `Set ${keyName} in .env`)
}

function missingConfig(varName: string, description: string): ProviderBlocker {
  return blocker('missing_config', `${varName} is not set. ${description}`, `Set ${varName} in .env`)
}

function bridgeAbsent(description: string): ProviderBlocker {
  return blocker('bridge_absent', `IPC bridge is absent. ${description}`, 'Run Jarvis in Electron — the bridge is only available in the desktop runtime.')
}

function notImplemented(reason: string, resolution: string): ProviderBlocker {
  return blocker('not_implemented', reason, resolution)
}

// ── Governance helper ──────────────────────────────────────────────────────

async function governanceBlocker(skillId: string): Promise<ProviderBlocker | null> {
  try {
    const record = await getGovernanceRecord(skillId)
    if (!record) return null
    if (record.trustLevel === 'blocked') {
      return blocker('governance_restricted', `Skill ${skillId} has trust level 'blocked' — no execution permitted.`, `Call blockSkill('${skillId}') with a reason, or re-evaluate the skill's trust level via markSkillVetted().`)
    }
    if (record.trustLevel === 'restricted') {
      return blocker('governance_restricted', `Skill ${skillId} has trust level 'restricted' — elevated approval required.`, `Provide explicit operator approval for ${skillId}, or upgrade trust via markSkillVetted() if the skill has been reviewed.`)
    }
    return null
  } catch {
    return null
  }
}

// ── Promotion stage derivation ─────────────────────────────────────────────

export function derivePromotionStage(blockers: ProviderBlocker[], isWriteOp: boolean): PromotionStage {
  const types = new Set(blockers.map((b) => b.type))
  const isGovernanceBlocked = types.has('governance_restricted')
  const isCredentialBlocked = types.has('missing_credentials') || types.has('safe_execution_not_verified')
  const isCapabilityBlocked = types.has('capability_disabled') || types.has('network_disabled')
  const isNotImplemented = types.has('not_implemented')
  const isDryRunOnly = blockers.length === 1 && types.has('dry_run')

  if (isGovernanceBlocked) return 'staged_only'
  if (isNotImplemented) return 'staged_only'
  if (isCredentialBlocked) return 'staged_only'
  if (blockers.length === 0) return isWriteOp ? 'fully_live_candidate' : 'read_only_live_candidate'
  if (isDryRunOnly) return isWriteOp ? 'write_live_candidate' : 'read_only_live_candidate'
  if (isCapabilityBlocked && !isWriteOp) return 'read_only_live_candidate'
  return 'staged_only'
}

export function deriveReadinessLevel(blockers: ProviderBlocker[]): ProviderReadinessLevel {
  if (blockers.length === 0) return 'write_ready'
  const types = new Set(blockers.map((b) => b.type))
  if (types.has('governance_restricted')) return 'blocked'
  if (types.has('bridge_absent')) return 'not_wired'
  if (types.has('missing_binary')) return 'wired'
  if (types.has('not_implemented')) return 'wired'
  if (types.has('missing_credentials') || types.has('safe_execution_not_verified')) return 'wired'
  if (types.has('missing_config')) return 'wired'
  // Only dry_run or capability blocks remain — path is wired, runtime verified
  return 'runtime_verified'
}

function buildResult(
  provider: string,
  action: string,
  isWriteOp: boolean,
  blockers: ProviderBlocker[],
  requiredSteps: string[],
): ReadinessCheckResult {
  return {
    provider,
    action,
    isWriteOp,
    readinessLevel: deriveReadinessLevel(blockers),
    blockers,
    promotionStage: derivePromotionStage(blockers, isWriteOp),
    requiredSteps,
    lastCheckedAt: now(),
  }
}

// ── ENV helpers (safe — reads only process.env keys, not values) ───────────

function envKeyPresent(key: string): boolean {
  return Boolean(process.env[key]?.trim())
}

// ── Provider readiness definitions ────────────────────────────────────────

// ---- Calendar ---------------------------------------------------------------

async function calendarReadiness(): Promise<ReadinessCheckResult[]> {
  const provider = 'composed-calendar-provider'
  const gcalPresent =
    envKeyPresent('GCAL_CLIENT_ID') &&
    envKeyPresent('GCAL_CLIENT_SECRET') &&
    envKeyPresent('GCAL_REFRESH_TOKEN')
  const icsUrlPresent = envKeyPresent('ICS_CALENDAR_URL')
  const govBlock = await governanceBlocker('advanced-calendar')
  const cronGovBlock = await governanceBlocker('cron-scheduling')

  const listBlockers: ProviderBlocker[] = []
  if (!CAPABILITIES.network) listBlockers.push(networkDisabled())
  if (!gcalPresent && !icsUrlPresent) {
    listBlockers.push(missingConfig('GCAL_CLIENT_ID / ICS_CALENDAR_URL', 'At least one calendar source (Google or ICS URL) must be configured for live reads. ICS local file (jarvis-runtime/time/calendar.ics) works without credentials.'))
  }
  if (govBlock) listBlockers.push(govBlock)

  const writeBlockers: ProviderBlocker[] = [...listBlockers]
  if (!CAPABILITIES.write) writeBlockers.push(writeDisabled())
  if (DRY_RUN) writeBlockers.push(dryRunBlocksWrite())
  writeBlockers.push(notImplemented(
    'Live calendar writes are not wired in the composed calendar provider yet; writes currently stage against the local provider only.',
    'Implement a live calendar write bridge before promoting calendar:createEvent.',
  ))

  const recurringWriteBlockers: ProviderBlocker[] = [...writeBlockers]
  if (cronGovBlock) recurringWriteBlockers.push(cronGovBlock)
  recurringWriteBlockers.push(notImplemented(
    'Live recurring calendar writes are not wired yet; recurring requests currently stage against the local provider only.',
    'Implement a live recurring calendar execution path before promotion.',
  ))

  return [
    buildResult(provider, 'calendar:listEvents', false, listBlockers, [
      ...(!CAPABILITIES.network ? ['Set CAPABILITIES.network=true'] : []),
      ...(!gcalPresent && !icsUrlPresent ? ['Set GCAL_CLIENT_ID / GCAL_CLIENT_SECRET / GCAL_REFRESH_TOKEN, or set ICS_CALENDAR_URL, or drop calendar.ics at jarvis-runtime/time/calendar.ics'] : []),
    ]),
    buildResult(provider, 'calendar:createEvent', true, writeBlockers, [
      ...(!CAPABILITIES.network ? ['Set CAPABILITIES.network=true'] : []),
      ...(!gcalPresent && !icsUrlPresent ? ['Configure a calendar source'] : []),
      ...(!CAPABILITIES.write ? ['Set CAPABILITIES.write=true'] : []),
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
      'Implement a live calendar write bridge',
    ]),
    buildResult(provider, 'calendar:createRecurringEvents', true, recurringWriteBlockers, [
      ...(!CAPABILITIES.network ? ['Set CAPABILITIES.network=true'] : []),
      ...(!gcalPresent && !icsUrlPresent ? ['Configure a calendar source'] : []),
      ...(!CAPABILITIES.write ? ['Set CAPABILITIES.write=true'] : []),
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
      ...(cronGovBlock ? [`Vet cron-scheduling skill via markSkillVetted('cron-scheduling')`] : []),
      'Implement a live recurring calendar execution path',
    ]),
  ]
}

// ---- Mail -------------------------------------------------------------------

async function mailReadiness(): Promise<ReadinessCheckResult[]> {
  const provider = 'concierge-mail-skill'
  const gmailPresent = envKeyPresent('GMAIL_CLIENT_ID') || envKeyPresent('GOOGLE_OAUTH_CLIENT_ID')
  const govReadBlock = await governanceBlocker('agent-mail-cli')
  const govWriteBlock = govReadBlock

  const readBlockers: ProviderBlocker[] = []
  if (!CAPABILITIES.network) readBlockers.push(networkDisabled())
  if (!gmailPresent) readBlockers.push(missingCredential('GMAIL_CLIENT_ID', 'Gmail OAuth credentials required for inbox reads.'))
  if (govReadBlock) readBlockers.push(govReadBlock)

  const writeBlockers: ProviderBlocker[] = [...readBlockers]
  if (!CAPABILITIES.write) writeBlockers.push(writeDisabled())
  if (DRY_RUN) writeBlockers.push(dryRunBlocksWrite())
  if (NO_SECRETS_MODE && gmailPresent) writeBlockers.push(noSecretsBlocks('GMAIL credentials'))
  if (govWriteBlock && !readBlockers.includes(govWriteBlock)) writeBlockers.push(govWriteBlock)

  return [
    buildResult(provider, 'mail:fetchRecentMessages', false, readBlockers, [
      ...(!CAPABILITIES.network ? ['Set CAPABILITIES.network=true'] : []),
      ...(!gmailPresent ? ['Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in .env'] : []),
    ]),
    buildResult(provider, 'mail:sendMessage', true, writeBlockers, [
      ...(!CAPABILITIES.network ? ['Set CAPABILITIES.network=true'] : []),
      ...(!gmailPresent ? ['Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in .env'] : []),
      ...(NO_SECRETS_MODE && gmailPresent ? ['Set NO_SECRETS_MODE=false'] : []),
      ...(!CAPABILITIES.write ? ['Set CAPABILITIES.write=true'] : []),
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
    ]),
  ]
}

// ---- Concierge --------------------------------------------------------------

async function conciergeReadiness(): Promise<ReadinessCheckResult[]> {
  const provider = 'concierge-skill-provider'
  const mailResults = await mailReadiness()
  const mailReadBlockers = mailResults.find((r) => r.action === 'mail:fetchRecentMessages')?.blockers ?? []
  const mailWriteBlockers = mailResults.find((r) => r.action === 'mail:sendMessage')?.blockers ?? []
  const govBook = await governanceBlocker('bookameeting')
  const stagedDraftBlocker = notImplemented(
    'Live concierge draft generation is not implemented yet; the provider only stages draft requests.',
    'Implement a live draft-generation execution path before promoting this action.',
  )
  const stagedBookingBlocker = notImplemented(
    'Live concierge booking dispatch is not implemented yet; the provider only stages booking requests.',
    'Wire a live booking dispatcher before promoting this action.',
  )

  const bookBlockers: ProviderBlocker[] = []
  if (!CAPABILITIES.network) bookBlockers.push(networkDisabled())
  if (!CAPABILITIES.execute) bookBlockers.push(executeDisabled())
  if (!CAPABILITIES.write) bookBlockers.push(writeDisabled())
  if (DRY_RUN) bookBlockers.push(dryRunBlocksWrite())
  if (govBook) bookBlockers.push(govBook)
  bookBlockers.push(stagedBookingBlocker)

  return [
    buildResult(provider, 'concierge:syncInbox', false, mailReadBlockers, [
      ...(!CAPABILITIES.network ? ['Set CAPABILITIES.network=true'] : []),
    ]),
    buildResult(provider, 'concierge:generateDraftReply', true, [...mailWriteBlockers, stagedDraftBlocker], [
      ...(!CAPABILITIES.network ? ['Set CAPABILITIES.network=true'] : []),
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
      'Implement a live draft-generation execution path',
    ]),
    buildResult(provider, 'concierge:dispatchBooking', true, bookBlockers, [
      ...(!CAPABILITIES.network ? ['Set CAPABILITIES.network=true'] : []),
      ...(!CAPABILITIES.execute ? ['Set CAPABILITIES.execute=true'] : []),
      ...(!CAPABILITIES.write ? ['Set CAPABILITIES.write=true'] : []),
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
      ...(govBook ? [`Vet bookameeting skill via markSkillVetted('bookameeting')`] : []),
      'Implement a live booking dispatch path',
    ]),
  ]
}

// ---- Speech -----------------------------------------------------------------

async function speechReadiness(): Promise<ReadinessCheckResult[]> {
  const provider = 'creation-speech-provider'
  const keyPresent = envKeyPresent('ELEVENLABS_API_KEY')
  const govBlock = await governanceBlocker('elevenlabs-tts')

  const blockers: ProviderBlocker[] = []
  if (!keyPresent) blockers.push(missingCredential('ELEVENLABS_API_KEY', 'Required for ElevenLabs TTS synthesis.'))
  else if (NO_SECRETS_MODE) blockers.push(noSecretsBlocks('ELEVENLABS_API_KEY'))
  if (!CAPABILITIES.network) blockers.push(networkDisabled())
  if (!CAPABILITIES.execute) blockers.push(executeDisabled())
  if (DRY_RUN) blockers.push(dryRunBlocksWrite())
  if (govBlock) blockers.push(govBlock)

  return [
    buildResult(provider, 'speech:speak', true, blockers, [
      ...(!keyPresent ? ['Set ELEVENLABS_API_KEY in .env'] : []),
      ...(NO_SECRETS_MODE && keyPresent ? ['Set NO_SECRETS_MODE=false'] : []),
      ...(!CAPABILITIES.network ? ['Set CAPABILITIES.network=true'] : []),
      ...(!CAPABILITIES.execute ? ['Set CAPABILITIES.execute=true'] : []),
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
    ]),
  ]
}

// ---- Media ------------------------------------------------------------------

async function mediaReadiness(): Promise<ReadinessCheckResult[]> {
  const provider = 'creation-skill-provider'
  const keyPresent = envKeyPresent('ELEVENLABS_API_KEY')
  const govBlock = await governanceBlocker('eachlabs-music')

  const blockers: ProviderBlocker[] = []
  if (!keyPresent) blockers.push(missingCredential('ELEVENLABS_API_KEY', 'Required for EachLabs music generation (shared key).'))
  else if (NO_SECRETS_MODE) blockers.push(noSecretsBlocks('ELEVENLABS_API_KEY'))
  if (!CAPABILITIES.network) blockers.push(networkDisabled())
  if (!CAPABILITIES.execute) blockers.push(executeDisabled())
  if (DRY_RUN) blockers.push(dryRunBlocksWrite())
  if (govBlock) blockers.push(govBlock)

  return [
    buildResult(provider, 'media:generateTrack', true, blockers, [
      ...(!keyPresent ? ['Set ELEVENLABS_API_KEY in .env'] : []),
      ...(NO_SECRETS_MODE && keyPresent ? ['Set NO_SECRETS_MODE=false'] : []),
      ...(!CAPABILITIES.network ? ['Set CAPABILITIES.network=true'] : []),
      ...(!CAPABILITIES.execute ? ['Set CAPABILITIES.execute=true'] : []),
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
    ]),
  ]
}

// ---- Builder ----------------------------------------------------------------

async function builderReadiness(): Promise<ReadinessCheckResult[]> {
  const provider = 'builder-skill-provider'
  const govBlock = await governanceBlocker('agent-task-manager')
  const stagedOnlyBlocker = notImplemented(
    'The builder provider is intentionally staged-only in the current runtime.',
    'Wire the real Builder bridge into the provider before promoting builder actions.',
  )

  // Planning: no network/execute needed, but DRY_RUN + governance apply
  const planBlockers: ProviderBlocker[] = []
  if (DRY_RUN) planBlockers.push(dryRunBlocksWrite())
  if (govBlock) planBlockers.push(govBlock)
  planBlockers.push(stagedOnlyBlocker)

  // Execution: needs execute + write capability + DRY_RUN off
  const execBlockers: ProviderBlocker[] = [...planBlockers]
  if (!CAPABILITIES.execute) execBlockers.push(executeDisabled())
  if (!CAPABILITIES.write) execBlockers.push(writeDisabled())

  // Bridge-dependent actions (start, finalize): also need IPC
  const bridgePresent = typeof window !== 'undefined' && Boolean((window as unknown as Record<string, unknown>)?.['jarvis'])
  const bridgeBlockers: ProviderBlocker[] = [...execBlockers]
  if (!bridgePresent) bridgeBlockers.push(bridgeAbsent('Builder execution IPC requires the Electron bridge.'))

  return [
    buildResult(provider, 'builder:requestPlan', true, planBlockers, [
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
      ...(govBlock ? [`Vet agent-task-manager via markSkillVetted('agent-task-manager')`] : []),
      'Wire the real Builder bridge into the provider',
    ]),
    buildResult(provider, 'builder:decomposeTask', true, planBlockers, [
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
      'Wire the real Builder bridge into the provider',
    ]),
    buildResult(provider, 'builder:startExecution', true, bridgeBlockers, [
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
      ...(!CAPABILITIES.execute ? ['Set CAPABILITIES.execute=true'] : []),
      ...(!CAPABILITIES.write ? ['Set CAPABILITIES.write=true'] : []),
      ...(!bridgePresent ? ['Run Jarvis in Electron'] : []),
      'Wire the real Builder bridge into the provider',
    ]),
    buildResult(provider, 'builder:createRemediationPlan', true, planBlockers, [
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
      'Wire the real Builder bridge into the provider',
    ]),
  ]
}

// ---- Memory -----------------------------------------------------------------

async function memoryReadiness(): Promise<ReadinessCheckResult[]> {
  const provider = 'memory-skill-provider'
  const govBlock = await governanceBlocker('brainrepo')
  const stagedWriteBlocker = notImplemented(
    'Structured memory writes still stage action records only; no live SAFE_ROOT write bridge exists yet.',
    'Implement a live SAFE_ROOT memory write path before promoting memory writes.',
  )

  const readBlockers: ProviderBlocker[] = []
  // Memory reads are always local — no network, no creds needed

  const writeBlockers: ProviderBlocker[] = []
  if (!CAPABILITIES.write) writeBlockers.push(writeDisabled())
  if (DRY_RUN) writeBlockers.push(dryRunBlocksWrite())
  if (govBlock) writeBlockers.push(govBlock)
  writeBlockers.push(stagedWriteBlocker)

  return [
    buildResult(provider, 'memory:snapshot', false, readBlockers, []),
    buildResult(provider, 'memory:search', false, readBlockers, []),
    buildResult(provider, 'memory:query', false, readBlockers, []),
    buildResult(provider, 'memory:write', true, writeBlockers, [
      ...(!CAPABILITIES.write ? ['Set CAPABILITIES.write=true'] : []),
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
      'Implement a live SAFE_ROOT memory write path',
    ]),
    buildResult(provider, 'memory:ingest', true, writeBlockers, [
      ...(!CAPABILITIES.write ? ['Set CAPABILITIES.write=true'] : []),
      ...(DRY_RUN ? ['Set DRY_RUN=false'] : []),
      'Implement a live SAFE_ROOT memory write path',
    ]),
  ]
}

// ---- Orchestrator -----------------------------------------------------------

async function orchestratorReadiness(): Promise<ReadinessCheckResult[]> {
  const provider = 'agent-task-manager-router'
  const govBlock = await governanceBlocker('agent-task-manager')
  const stagedOnlyBlocker = notImplemented(
    'orchestrator:stageMission intentionally stages ActionRecords; no live execution path exists on this provider.',
    'Keep live execution responsibility in downstream providers rather than promoting orchestrator:stageMission.',
  )

  const routeBlockers: ProviderBlocker[] = []
  // routeMission is pure heuristic — no external calls, always live

  const stageBlockers: ProviderBlocker[] = []
  if (govBlock) stageBlockers.push(govBlock)
  stageBlockers.push(stagedOnlyBlocker)

  return [
    buildResult(provider, 'orchestrator:routeMission', false, routeBlockers, []),
    buildResult(provider, 'orchestrator:stageMission', true, stageBlockers, [
      ...(govBlock ? [`Vet agent-task-manager via markSkillVetted('agent-task-manager')`] : []),
      'Do not promote orchestrator:stageMission beyond staged-only; activate downstream providers instead',
    ]),
  ]
}

// ── Aggregation helpers ────────────────────────────────────────────────────

function uniqueBlockers(results: ReadinessCheckResult[]): ProviderBlocker[] {
  const seen = new Set<string>()
  const out: ProviderBlocker[] = []
  for (const r of results) {
    for (const b of r.blockers) {
      const key = `${b.type}::${b.reason}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push(b)
      }
    }
  }
  return out
}

function worstLevel(levels: ProviderReadinessLevel[]): ProviderReadinessLevel {
  const order: ProviderReadinessLevel[] = [
    'error', 'blocked', 'not_wired', 'wired', 'runtime_verified', 'read_only_ready', 'write_ready',
  ]
  let worst = levels[0] ?? 'write_ready'
  for (const l of levels) {
    if (order.indexOf(l) < order.indexOf(worst)) worst = l
  }
  return worst
}

function worstStage(stages: PromotionStage[]): PromotionStage {
  const order: PromotionStage[] = ['staged_only', 'read_only_live_candidate', 'write_live_candidate', 'fully_live_candidate']
  let worst = stages[0] ?? 'fully_live_candidate'
  for (const s of stages) {
    if (order.indexOf(s) < order.indexOf(worst)) worst = s
  }
  return worst
}

function summarize(
  key: string,
  label: string,
  actions: ReadinessCheckResult[],
): ProviderReadinessSummary {
  const overall = worstLevel(actions.map((a) => a.readinessLevel))
  const stage = worstStage(actions.map((a) => a.promotionStage))
  const allBlockers = uniqueBlockers(actions)

  const readyCount = actions.filter((a) => a.blockers.length === 0).length
  const blockedCount = actions.filter((a) => a.readinessLevel === 'blocked').length
  const headline =
    blockedCount > 0
      ? `${blockedCount} action${blockedCount === 1 ? '' : 's'} blocked by governance`
      : allBlockers.length === 0
      ? `All ${actions.length} action${actions.length === 1 ? '' : 's'} unblocked`
      : `${readyCount}/${actions.length} actions ready — ${allBlockers.length} blocker${allBlockers.length === 1 ? '' : 's'} active`

  return {
    providerKey: key,
    providerLabel: label,
    overallReadiness: overall,
    overallPromotion: stage,
    allBlockers,
    actions,
    headline,
    lastCheckedAt: now(),
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the full readiness evaluation across all active providers.
 * Returns a system-wide report.
 */
export async function evaluateSystemReadiness(): Promise<SystemReadinessReport> {
  const [
    calActions,
    mailActions,
    conciergeActions,
    speechActions,
    mediaActions,
    builderActions,
    memoryActions,
    orchestratorActions,
  ] = await Promise.all([
    calendarReadiness(),
    mailReadiness(),
    conciergeReadiness(),
    speechReadiness(),
    mediaReadiness(),
    builderReadiness(),
    memoryReadiness(),
    orchestratorReadiness(),
  ])

  const summaries: ProviderReadinessSummary[] = [
    summarize('composed-calendar-provider', 'Calendar', calActions),
    summarize('concierge-mail-skill', 'Mail', mailActions),
    summarize('concierge-skill-provider', 'Concierge', conciergeActions),
    summarize('creation-speech-provider', 'Speech', speechActions),
    summarize('creation-skill-provider', 'Media', mediaActions),
    summarize('builder-skill-provider', 'Builder', builderActions),
    summarize('memory-skill-provider', 'Memory', memoryActions),
    summarize('agent-task-manager-router', 'Orchestrator', orchestratorActions),
  ]

  const byReadinessLevel: Partial<Record<ProviderReadinessLevel, number>> = {}
  const byPromotionStage: Partial<Record<PromotionStage, number>> = {}
  const readReadyProviders: string[] = []
  const writeReadyProviders: string[] = []
  const stagedOnlyProviders: string[] = []
  const blockedProviders: string[] = []

  for (const s of summaries) {
    byReadinessLevel[s.overallReadiness] = (byReadinessLevel[s.overallReadiness] ?? 0) + 1
    byPromotionStage[s.overallPromotion] = (byPromotionStage[s.overallPromotion] ?? 0) + 1

    if (s.overallReadiness === 'blocked') blockedProviders.push(s.providerLabel)
    else if (s.overallReadiness === 'write_ready') writeReadyProviders.push(s.providerLabel)
    else if (s.overallReadiness === 'read_only_ready' || s.overallReadiness === 'runtime_verified') readReadyProviders.push(s.providerLabel)
    else stagedOnlyProviders.push(s.providerLabel)
  }

  return {
    totalProviders: summaries.length,
    byReadinessLevel,
    byPromotionStage,
    readReadyProviders,
    writeReadyProviders,
    stagedOnlyProviders,
    blockedProviders,
    providers: summaries,
    evaluatedAt: now(),
  }
}

/**
 * Evaluate readiness for a single provider by key.
 * Returns null if the provider key is not recognised.
 */
export async function evaluateProviderReadiness(providerKey: string): Promise<ProviderReadinessSummary | null> {
  const report = await evaluateSystemReadiness()
  return report.providers.find((p) => p.providerKey === providerKey) ?? null
}

/**
 * Load the machine-local activation state from SAFE_ROOT.
 * Returns null if the file does not exist or cannot be parsed.
 * This is read-only — does not modify activation state.
 */
export async function loadActivationState(): Promise<ActivationState | null> {
  const state = await readSafeJson<ActivationState | null>('activation/activation-state.json', null)
  return state
}

/**
 * Get the activation state for a specific provider.
 * Returns null if the provider is not found in the activation state.
 */
export async function getProviderActivationState(providerKey: string): Promise<ActivationProviderState | null> {
  const state = await loadActivationState()
  if (!state) return null
  return state.providers.find((p) => p.provider === providerKey) ?? null
}

export function detectActivationStateMismatches(
  readiness: SystemReadinessReport,
  activationState: ActivationState | null,
): string[] {
  if (!activationState) {
    return ['Activation state file is missing or unreadable.']
  }

  const readinessProviders = new Map(
    readiness.providers.map((provider) => [provider.providerKey, provider] as const),
  )
  const mismatches: string[] = []

  for (const providerState of activationState.providers) {
    const readinessProvider = readinessProviders.get(providerState.provider)
    if (!readinessProvider) {
      mismatches.push(`Activation tracks unknown provider ${providerState.provider}.`)
      continue
    }

    const readinessActions = new Map(
      readinessProvider.actions.map((action) => [action.action, action] as const),
    )

    for (const actionState of providerState.actions) {
      const readinessAction = readinessActions.get(actionState.action)
      if (!readinessAction) {
        mismatches.push(`${providerState.provider} tracks unknown action ${actionState.action}.`)
        continue
      }

      if (actionState.currentStage === 'activated' && readinessAction.blockers.length > 0) {
        mismatches.push(
          `${providerState.provider}/${actionState.action} is marked activated but readiness still reports blockers: ${readinessAction.blockers[0]?.type ?? 'unknown'}.`,
        )
      }
    }
  }

  for (const readinessProvider of readiness.providers) {
    if (!activationState.providers.some((provider) => provider.provider === readinessProvider.providerKey)) {
      mismatches.push(`Activation state does not track provider ${readinessProvider.providerKey}.`)
    }
  }

  return mismatches
}
