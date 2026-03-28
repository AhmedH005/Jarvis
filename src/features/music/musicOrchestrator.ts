import { useMusicStore } from '@/store/music'
import { useMusicPreferencesStore, generateIdentity } from '@/store/musicPreferences'
import type { AgentOutput, Track, TrackType } from '@/store/music'
import {
  analyzePrompt,
  biasBlueprint,
  refineBlueprint,
  runStephenProducerAgent,
  generateSuggestions,
  type AgentKey,
  type ProductionPlan,
} from './agents/stephenProducerAgent'

// ── Utilities ─────────────────────────────────────────────────────────────────

function makeTrackId() {
  return `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function tick(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

const NEW_TRACK_PHRASES = [
  'new track', 'start over', 'fresh track', 'different track',
  'new song', 'start fresh', 'create new', 'make a new', 'completely different',
]

function isRefinementRequest(prompt: string): boolean {
  const lower = prompt.toLowerCase()
  if (NEW_TRACK_PHRASES.some((p) => lower.includes(p))) return false
  return useMusicStore.getState().currentBlueprint !== null
}

// ── Shared production runner ──────────────────────────────────────────────────

async function runProduction(prompt: string, plan: ProductionPlan): Promise<Track> {
  const store = useMusicStore.getState()

  let result
  try {
    result = await runStephenProducerAgent(
      prompt,
      plan,
      (key: AgentKey) => {
        store.setAgentStatus(key, 'generating')
        const name = useMusicStore.getState().band[key]?.name ?? key
        store.addLog(name, `Generating ${plan.type} in ${plan.blueprint.key}…`, 'info')
      },
      (key: AgentKey, output: AgentOutput) => {
        store.setAgentOutput(key, output)
        const name = useMusicStore.getState().band[key]?.name ?? key
        store.addLog(name, output.description, 'success')
      },
      (message: string) => {
        store.addLog('Stephen', message, 'info')
      }
    )
  } catch {
    store.setGenerationStatus('error')
    store.setAgentStatus('stephen', 'error')
    store.addLog('Stephen', 'Production failed. Check logs above.', 'warn')
    throw new Error('Band production failed')
  }

  store.setAgentOutput('stephen', result.finalOutput)
  store.addLog('Stephen', result.finalOutput.description, 'success')
  store.addLog('Stephen', 'Track complete.', 'success')

  const track: Track = {
    id: makeTrackId(),
    prompt,
    type: plan.type,
    description: result.finalOutput.description,
    audioUrl: result.finalOutput.audioUrl,
    generatedAt: Date.now(),
    components: result.components,
  }

  store.setCurrentTrack(track)
  store.setGenerationStatus('complete')

  // ── Record preferences after every completed track ─────────────────────────
  const prefs = useMusicPreferencesStore.getState()
  prefs.updatePreferences(plan.blueprint, plan.activeAgents)

  // ── Generate contextual suggestions + identity (reads updated prefs) ────────
  const updatedPrefs = useMusicPreferencesStore.getState()

  const identity = generateIdentity(updatedPrefs)
  store.setCreativeIdentity(identity)

  const suggestions = generateSuggestions(plan.blueprint, plan.activeAgents, updatedPrefs, identity)
  if (suggestions.length > 0) {
    store.setSuggestions(suggestions)
    store.addLog('Stephen', `${suggestions.length} suggestion${suggestions.length > 1 ? 's' : ''} ready.`, 'info')
  }

  return track
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function generateMusic(prompt: string): Promise<Track> {
  const store = useMusicStore.getState()
  if (isRefinementRequest(prompt)) return runRefinement(prompt, store)
  return runNewTrack(prompt, store)
}

// ── New-track path ────────────────────────────────────────────────────────────

async function runNewTrack(
  prompt: string,
  store: ReturnType<typeof useMusicStore.getState>
): Promise<Track> {
  store.reset()
  store.setSessionMode('new')
  store.setGenerationStatus('processing')
  store.setAgentStatus('stephen', 'generating')
  store.addLog('Stephen', 'Analysing request…', 'info')

  await tick(300)

  let plan: ProductionPlan
  try {
    plan = analyzePrompt(prompt)
  } catch {
    store.setGenerationStatus('error')
    store.setAgentStatus('stephen', 'error')
    store.addLog('Stephen', 'Failed to analyse prompt.', 'warn')
    throw new Error('Prompt analysis failed')
  }

  // ── Apply preference bias to the fresh blueprint ───────────────────────────
  const prefs = useMusicPreferencesStore.getState()
  const biasResult = biasBlueprint(plan.blueprint, prompt, prefs)

  if (biasResult.personalised) {
    plan = { ...plan, blueprint: biasResult.blueprint }
    store.addLog('Stephen', 'Personalised to your history.', 'info')
    store.setBlueprintPersonalised(true)
  }

  store.setCurrentBlueprint(plan.blueprint)
  store.addLog('Stephen', `Style: ${plan.blueprint.style}`, 'info')
  store.addLog('Stephen', `Key: ${plan.blueprint.key} | BPM: ${plan.blueprint.bpm} | Mood: ${plan.blueprint.mood}`, 'info')
  store.addLog('Stephen', `Structure: ${plan.blueprint.structure.join(' → ')}`, 'info')
  store.addLog('Stephen', plan.rationale, 'info')
  store.setActiveAgents(plan.activeAgents)

  for (const key of plan.activeAgents) {
    const name = useMusicStore.getState().band[key]?.name ?? key
    store.addLog('Stephen', `Activating ${name}…`, 'info')
  }

  await tick(200)
  return runProduction(prompt, plan)
}

// ── Refinement path ───────────────────────────────────────────────────────────

async function runRefinement(
  prompt: string,
  store: ReturnType<typeof useMusicStore.getState>
): Promise<Track> {
  const previousBlueprint = store.currentBlueprint!
  const previousTrack = store.currentTrack
  const previousActiveAgents = [...store.activeAgents] as AgentKey[]

  if (previousTrack) store.pushHistory(previousTrack, previousBlueprint)

  store.softReset()
  store.setSessionMode('refining')
  store.setGenerationStatus('processing')
  store.setAgentStatus('stephen', 'generating')

  store.addLog('Stephen', '── Refinement ──', 'info')
  store.addLog('Stephen', 'Refining previous track…', 'info')

  await tick(300)

  let refinementResult
  try {
    refinementResult = refineBlueprint(previousBlueprint, prompt)
  } catch {
    store.setGenerationStatus('error')
    store.setAgentStatus('stephen', 'error')
    store.addLog('Stephen', 'Refinement analysis failed.', 'warn')
    throw new Error('Refinement analysis failed')
  }

  for (const change of refinementResult.changes) {
    store.addLog('Stephen', `Refinement: ${change}`, 'info')
  }

  let agents: AgentKey[] = [...previousActiveAgents]
  for (const [key, add] of Object.entries(refinementResult.agentOverrides) as [AgentKey, boolean][]) {
    if (add && !agents.includes(key)) agents.push(key)
    else if (!add) agents = agents.filter((a) => a !== key)
  }
  if (agents.length === 0) {
    agents = previousActiveAgents.length > 0 ? previousActiveAgents : ['peter', 'tchalla']
  }

  const plan: ProductionPlan = {
    type: (previousTrack?.type ?? 'full') as TrackType,
    activeAgents: agents,
    blueprint: refinementResult.blueprint,
    rationale: `Refined — ${refinementResult.changes.length} change${refinementResult.changes.length === 1 ? '' : 's'} applied`,
  }

  store.setCurrentBlueprint(plan.blueprint)
  store.setActiveAgents(plan.activeAgents)

  store.addLog('Stephen', `Key: ${plan.blueprint.key} | BPM: ${plan.blueprint.bpm} | Mood: ${plan.blueprint.mood}`, 'info')
  store.addLog('Stephen', plan.rationale, 'info')

  for (const key of plan.activeAgents) {
    const name = useMusicStore.getState().band[key]?.name ?? key
    store.addLog('Stephen', `Activating ${name}…`, 'info')
  }

  await tick(200)
  return runProduction(prompt, plan)
}
