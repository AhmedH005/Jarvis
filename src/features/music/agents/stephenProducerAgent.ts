import type { AgentOutput, TrackType } from '@/store/music'
import type { TrackBlueprint, TrackMood, Suggestion, CreativeIdentity } from '@/features/music/types'
import { generateInstrument } from '@/services/musicService'
import { runPeterAgent } from './peterAgent'
import { runTchallaAgent } from './tchallaAgent'
import { runWandaAgent } from './wandaAgent'
import { runScottAgent } from './scottAgent'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentKey = 'peter' | 'tchalla' | 'wanda' | 'scott'

export interface ProductionPlan {
  type: TrackType
  activeAgents: AgentKey[]
  blueprint: TrackBlueprint
  rationale: string
}

export interface ProductionResult {
  plan: ProductionPlan
  components: Partial<Record<AgentKey, AgentOutput>>
  finalOutput: AgentOutput
}

// ── Blueprint creation ────────────────────────────────────────────────────────

const MOOD_KEYWORDS: Array<[TrackMood, string[]]> = [
  ['melancholic', ['sad', 'dark', 'melanchol', 'grief', 'loss', 'heartbreak', 'lonely', 'sorrow', 'cold']],
  ['uplifting',   ['happy', 'bright', 'upbeat', 'joyful', 'fun', 'positive', 'cheer', 'hopeful', 'celebrat']],
  ['intense',     ['aggressive', 'intense', 'angry', 'heavy', 'metal', 'hard', 'power', 'rage', 'fierce']],
  ['ambient',     ['calm', 'peaceful', 'soft', 'ambient', 'gentle', 'relax', 'meditat', 'quiet', 'still']],
  ['energetic',   ['energy', 'energetic', 'fast', 'dance', 'club', 'party', 'hype', 'bounce', 'driving']],
  ['romantic',    ['romantic', 'love', 'tender', 'intimate', 'warm', 'sweet', 'sensual', 'passion']],
]

// BPM ranges [min, max] — a value is picked randomly within on each blueprint creation
const MOOD_BPM_RANGE: Record<TrackMood, [number, number]> = {
  melancholic: [60,  75],
  uplifting:   [110, 125],
  intense:     [140, 168],
  ambient:     [70,  85],
  energetic:   [125, 145],
  romantic:    [80,  96],
  neutral:     [88,  110],
}

// Candidate keys per mood — one is chosen randomly
const MOOD_KEYS: Record<TrackMood, string[]> = {
  melancholic: ['D minor', 'A minor', 'E minor'],
  uplifting:   ['C major', 'G major', 'D major'],
  intense:     ['E minor', 'B minor', 'F# minor'],
  ambient:     ['F major', 'E minor', 'Db major'],
  energetic:   ['A major', 'D major', 'E major'],
  romantic:    ['Bb major', 'F major', 'Ab major'],
  neutral:     ['G major', 'C major', 'A minor'],
}

// Style keyword detection — ordered by specificity
const STYLE_KEYWORDS: Array<[string, string[]]> = [
  ['cinematic',   ['cinematic', 'film', 'score', 'orchestral', 'epic', 'trailer']],
  ['trap',        ['trap']],
  ['drill',       ['drill']],
  ['jazz',        ['jazz', 'swing', 'bebop', 'bossa']],
  ['lofi',        ['lofi', 'lo-fi', 'lo fi', 'chill hop', 'chillhop']],
  ['hip-hop',     ['hip hop', 'hip-hop', 'hiphop', 'rap', 'boom bap']],
  ['electronic',  ['electronic', 'edm', 'synth', 'techno', 'house', 'dubstep']],
  ['rock',        ['rock', 'metal', 'punk', 'grunge', 'indie']],
  ['ambient',     ['ambient', 'atmospheric', 'drone', 'soundscape']],
  ['classical',   ['classical', 'orchestral', 'baroque', 'chamber']],
  ['blues',       ['blues', 'bluesy', 'soul', 'gospel', 'r&b']],
  ['folk',        ['folk', 'acoustic', 'country', 'americana']],
]

// ── Guardrail constants ───────────────────────────────────────────────────────

/** Hard floor/ceiling applied to any BPM before it leaves this module */
export const BPM_MIN = 60
export const BPM_MAX = 180
/** No track structure should have more sections than this */
const MAX_STRUCTURE_SECTIONS = 8
/** Regex that a valid musical key must satisfy */
const VALID_KEY = /^[A-G][#b]?\s+(major|minor)$/

export function clampBpm(bpm: number): number {
  return Math.max(BPM_MIN, Math.min(BPM_MAX, bpm))
}

function pickBpm(mood: TrackMood): number {
  const [min, max] = MOOD_BPM_RANGE[mood]
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pickKey(mood: TrackMood): string {
  const keys = MOOD_KEYS[mood]
  return keys[Math.floor(Math.random() * keys.length)]
}

function detectStyle(lower: string): string {
  for (const [style, keywords] of STYLE_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return style
  }
  return 'general'
}

const STRUCTURE_BY_TYPE: Record<TrackType, string[]> = {
  riff:  ['intro', 'theme', 'variation', 'outro'],
  loop:  ['setup', 'groove', 'fill', 'groove'],
  full:  ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
}

/**
 * Stephen analyses the user prompt and produces a TrackBlueprint — a shared
 * contract that every band agent must honour when generating their part.
 */
export function createBlueprint(prompt: string, type: TrackType): TrackBlueprint {
  const lower = prompt.toLowerCase()

  // Infer mood
  let mood: TrackMood = 'neutral'
  for (const [candidate, keywords] of MOOD_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      mood = candidate
      break
    }
  }

  // BPM — range-randomised per mood, explicit prompt value overrides
  let bpm = pickBpm(mood)
  const bpmMatch = lower.match(/(\d{2,3})\s*bpm/)
  if (bpmMatch) {
    const parsed = parseInt(bpmMatch[1], 10)
    if (parsed >= 40 && parsed <= 240) bpm = parsed
  }

  return {
    key: pickKey(mood),
    bpm,
    mood,
    structure: STRUCTURE_BY_TYPE[type],
    style: detectStyle(lower),
  }
}

// ── Blueprint refinement ──────────────────────────────────────────────────────

export interface RefinementResult {
  blueprint: TrackBlueprint
  /** Per-agent: true = activate, false = deactivate */
  agentOverrides: Partial<Record<AgentKey, boolean>>
  /** Human-readable description of every change made */
  changes: string[]
}

/**
 * Stephen mutates an existing blueprint based on natural-language instructions.
 * Keeps changes deterministic — no new randomness beyond explicit BPM deltas.
 */
export function refineBlueprint(
  previous: TrackBlueprint,
  instruction: string
): RefinementResult {
  const lower = instruction.toLowerCase()
  const changes: string[] = []
  const agentOverrides: Partial<Record<AgentKey, boolean>> = {}

  let { key, bpm, mood, style, structure } = { ...previous }

  // ── BPM adjustments ───────────────────────────────────────────────────────

  const muchFaster =
    lower.includes('much faster') || lower.includes('a lot faster') || lower.includes('way faster')
  const muchSlower =
    lower.includes('much slower') || lower.includes('a lot slower') || lower.includes('way slower')
  const faster =
    !muchFaster && (lower.includes('faster') || lower.includes('speed up') || lower.includes('quicker'))
  const slower =
    !muchSlower && (lower.includes('slower') || lower.includes('slow down') || lower.includes('more chill'))

  if (muchFaster) {
    const delta = 30 + Math.floor(Math.random() * 11)
    const prev = bpm
    bpm = Math.min(240, bpm + delta)
    changes.push(`increasing BPM from ${prev} → ${bpm}`)
  } else if (faster) {
    const delta = 15 + Math.floor(Math.random() * 11)
    const prev = bpm
    bpm = Math.min(240, bpm + delta)
    changes.push(`increasing BPM from ${prev} → ${bpm}`)
  } else if (muchSlower) {
    const delta = 30 + Math.floor(Math.random() * 11)
    const prev = bpm
    bpm = Math.max(40, bpm - delta)
    changes.push(`decreasing BPM from ${prev} → ${bpm}`)
  } else if (slower) {
    const delta = 15 + Math.floor(Math.random() * 11)
    const prev = bpm
    bpm = Math.max(40, bpm - delta)
    changes.push(`decreasing BPM from ${prev} → ${bpm}`)
  }

  // Explicit BPM override ("at 140 bpm", "120 bpm")
  const bpmMatch = lower.match(/(\d{2,3})\s*bpm/)
  if (bpmMatch) {
    const parsed = parseInt(bpmMatch[1], 10)
    if (parsed >= 40 && parsed <= 240 && parsed !== bpm) {
      changes.push(`setting BPM to ${parsed}`)
      bpm = parsed
    }
  }

  // ── Mood + key changes ────────────────────────────────────────────────────

  let newMood: TrackMood | null = null

  if (lower.includes('darker') || lower.includes('more dark') || lower.includes('more gloomy')) {
    newMood = mood === 'intense' ? 'melancholic' : 'intense'
  } else if (
    lower.includes('happier') || lower.includes('more happy') ||
    lower.includes('brighter') || lower.includes('lighter') || lower.includes('more positive')
  ) {
    newMood = 'uplifting'
  } else if (
    lower.includes('sadder') || lower.includes('more sad') ||
    lower.includes('more emotional') || lower.includes('more melancholic')
  ) {
    newMood = 'melancholic'
  } else if (
    lower.includes('more energy') || lower.includes('more energetic') ||
    lower.includes('more hype') || lower.includes('more bounce')
  ) {
    newMood = 'energetic'
    bpm = Math.min(240, bpm + 10)
  } else if (
    lower.includes('more intense') || lower.includes('heavier') || lower.includes('more aggressive')
  ) {
    newMood = 'intense'
    bpm = Math.min(240, bpm + 10)
  } else if (
    lower.includes('calmer') || lower.includes('more calm') ||
    lower.includes('more ambient') || lower.includes('more atmospheric')
  ) {
    newMood = 'ambient'
    bpm = Math.max(40, bpm - 10)
  } else if (lower.includes('more romantic') || lower.includes('more intimate') || lower.includes('more tender')) {
    newMood = 'romantic'
  }

  if (newMood && newMood !== mood) {
    changes.push(`switching mood from ${mood} → ${newMood}`)
    mood = newMood
    const newKey = pickKey(newMood)
    if (newKey !== key) {
      changes.push(`adjusting key to ${newKey}`)
      key = newKey
    }
  }

  // Explicit key override ("in D minor", "use E major")
  const keyMatch = lower.match(/\bin\s+([a-g]#?b?)\s+(major|minor)\b/)
    ?? lower.match(/\buse\s+([a-g]#?b?)\s+(major|minor)\b/)
  if (keyMatch) {
    const note = keyMatch[1].charAt(0).toUpperCase() + keyMatch[1].slice(1)
    const newKey = `${note} ${keyMatch[2]}`
    if (newKey !== key) {
      changes.push(`setting key to ${newKey}`)
      key = newKey
    }
  }

  // ── Style changes ─────────────────────────────────────────────────────────

  const detectedStyle = detectStyle(lower)
  if (detectedStyle !== 'general' && detectedStyle !== style) {
    changes.push(`switching style from ${style} → ${detectedStyle}`)
    style = detectedStyle
  }

  // ── Agent overrides ───────────────────────────────────────────────────────

  if (
    lower.includes('remove vocals') || lower.includes('no vocals') ||
    lower.includes('without vocals') || lower.includes('instrumental')
  ) {
    agentOverrides.scott = false
    changes.push('removing Scott (vocals)')
  } else if (lower.includes('add vocals') || lower.includes('with vocals') || lower.includes('add singing')) {
    agentOverrides.scott = true
    changes.push('adding Scott (vocals)')
  }

  if (lower.includes('add piano') || lower.includes('with piano') || lower.includes('add keys')) {
    agentOverrides.wanda = true
    changes.push('adding Wanda (keys)')
  } else if (
    lower.includes('remove piano') || lower.includes('no piano') ||
    lower.includes('remove keys') || lower.includes('no keys')
  ) {
    agentOverrides.wanda = false
    changes.push('removing Wanda (keys)')
  }

  if (lower.includes('add guitar') || lower.includes('with guitar')) {
    agentOverrides.peter = true
    changes.push('adding Peter (guitar)')
  } else if (lower.includes('remove guitar') || lower.includes('no guitar')) {
    agentOverrides.peter = false
    changes.push('removing Peter (guitar)')
  }

  if (lower.includes('add drums') || lower.includes('with drums')) {
    agentOverrides.tchalla = true
    changes.push("adding T'Challa (drums)")
  } else if (
    lower.includes('remove drums') || lower.includes('no drums') || lower.includes('without drums')
  ) {
    agentOverrides.tchalla = false
    changes.push("removing T'Challa (drums)")
  }

  if (changes.length === 0) {
    changes.push('refining arrangement — keeping existing blueprint parameters')
  }

  // ── Guardrails ────────────────────────────────────────────────────────────
  // Applied unconditionally — prevents drift across many refinement iterations.

  const clampedBpm = clampBpm(bpm)
  if (clampedBpm !== bpm) {
    changes.push(`BPM clamped from ${bpm} → ${clampedBpm}`)
    bpm = clampedBpm
  }

  if (structure.length > MAX_STRUCTURE_SECTIONS) {
    structure = structure.slice(0, MAX_STRUCTURE_SECTIONS)
  }

  if (!VALID_KEY.test(key)) {
    const fallback = pickKey(mood)
    changes.push(`invalid key "${key}" — reset to ${fallback}`)
    key = fallback
  }

  return {
    blueprint: { key, bpm, mood, style, structure },
    agentOverrides,
    changes,
  }
}

// ── Prompt analysis ───────────────────────────────────────────────────────────

/**
 * Stephen analyses the prompt to determine track type, active agents, and
 * produces the shared TrackBlueprint that unifies the session.
 */
export function analyzePrompt(prompt: string): ProductionPlan {
  const lower = prompt.toLowerCase()

  // Detect track type
  let type: TrackType = 'full'
  if (lower.includes('riff') || lower.includes('lead') || lower.includes('solo') || lower.includes('lick')) {
    type = 'riff'
  } else if (
    lower.includes('loop') ||
    lower.includes('beat') ||
    lower.includes('drum') ||
    lower.includes('groove') ||
    lower.includes('rhythm')
  ) {
    type = 'loop'
  }

  // Decide which agents are needed
  const agents: AgentKey[] = []

  const needsGuitar =
    type === 'riff' ||
    lower.includes('guitar') ||
    lower.includes('rock') ||
    lower.includes('metal') ||
    lower.includes('blues') ||
    lower.includes('acoustic') ||
    type === 'full'

  const needsDrums =
    type === 'loop' ||
    lower.includes('drum') ||
    lower.includes('beat') ||
    lower.includes('rhythm') ||
    lower.includes('percuss') ||
    type === 'full'

  const needsKeys =
    lower.includes('piano') ||
    lower.includes('keys') ||
    lower.includes('chord') ||
    lower.includes('jazz') ||
    lower.includes('ambient') ||
    lower.includes('atmospheric') ||
    lower.includes('melanchol') ||
    lower.includes('emotional') ||
    type === 'full'

  const needsVocals =
    type === 'full' ||
    lower.includes('vocal') ||
    lower.includes('lyric') ||
    lower.includes('sing') ||
    lower.includes('hook') ||
    lower.includes('verse') ||
    lower.includes('chorus')

  if (needsGuitar) agents.push('peter')
  if (needsDrums)  agents.push('tchalla')
  if (needsKeys)   agents.push('wanda')
  if (needsVocals) agents.push('scott')

  if (agents.length === 0) agents.push('peter', 'tchalla')
  if (agents.length === 1) agents.push(agents[0] === 'peter' ? 'tchalla' : 'peter')

  const blueprint = createBlueprint(prompt, type)

  const partNames = agents.map((a) => ({
    peter:   'Peter (guitar)',
    tchalla: "T'Challa (drums)",
    wanda:   'Wanda (keys)',
    scott:   'Scott (vocals)',
  }[a]))

  const rationale =
    `Producing a ${blueprint.style} ${type} — ${blueprint.key} · ${blueprint.bpm} BPM · ${blueprint.mood}. ` +
    `Activating ${partNames.join(', ')}.`

  return { type, activeAgents: agents, blueprint, rationale }
}

// ── Shared band context ───────────────────────────────────────────────────────

/**
 * Accumulated outputs from band members already finished.
 * Passed to each agent in generation order so later agents can adapt.
 */
export interface SharedBandContext {
  guitar?: AgentOutput
  drums?: AgentOutput
  keys?: AgentOutput
  vocals?: AgentOutput
}

// ── Runner map ────────────────────────────────────────────────────────────────

type AgentRunner = (
  prompt: string,
  blueprint: TrackBlueprint,
  context: SharedBandContext
) => Promise<AgentOutput>

const AGENT_RUNNERS: Record<AgentKey, AgentRunner> = {
  peter:   runPeterAgent,
  tchalla: runTchallaAgent,
  wanda:   runWandaAgent,
  scott:   runScottAgent,
}

/** Fixed generation order — earlier agents set the tone for later ones. */
const GENERATION_ORDER: AgentKey[] = ['peter', 'tchalla', 'wanda', 'scott']

/** Maps each agent to the SharedBandContext key it populates when done. */
const CONTEXT_SLOT: Record<AgentKey, keyof SharedBandContext> = {
  peter:   'guitar',
  tchalla: 'drums',
  wanda:   'keys',
  scott:   'vocals',
}

/** Log message fired just before an agent runs if it has context to adapt to. */
function adaptationLog(key: AgentKey, ctx: SharedBandContext): string | null {
  if (key === 'tchalla' && ctx.guitar)
    return "T'Challa syncing rhythm to riff"
  if (key === 'wanda' && (ctx.guitar ?? ctx.drums))
    return 'Wanda adapting to guitar tone'
  if (key === 'scott' && (ctx.guitar ?? ctx.drums ?? ctx.keys))
    return 'Scott aligning vocals to mood and structure'
  return null
}

// ── Main producer function ────────────────────────────────────────────────────

/**
 * Stephen orchestrates the band in order, building a shared context that each
 * agent receives so it can adapt its output to what came before.
 */
export async function runStephenProducerAgent(
  prompt: string,
  plan: ProductionPlan,
  onAgentStart: (key: AgentKey) => void,
  onAgentDone: (key: AgentKey, output: AgentOutput) => void,
  onAdapt: (message: string) => void
): Promise<ProductionResult> {
  const components: Partial<Record<AgentKey, AgentOutput>> = {}
  const context: SharedBandContext = {}

  // Run agents in fixed order — each receives accumulated context from prior agents
  const orderedAgents = GENERATION_ORDER.filter((k) => plan.activeAgents.includes(k))

  for (const key of orderedAgents) {
    // Fire adaptation log before starting if context is available
    const adaptMsg = adaptationLog(key, context)
    if (adaptMsg) onAdapt(adaptMsg)

    onAgentStart(key)
    const output = await AGENT_RUNNERS[key](prompt, plan.blueprint, context)
    components[key] = output
    context[CONTEXT_SLOT[key]] = output
    onAgentDone(key, output)
  }

  // Stephen's final production pass — sees the full completed context
  const finalOutput = await generateInstrument(prompt, 'Studio', plan.type, plan.blueprint)

  return { plan, components, finalOutput }
}

// ── Preference bias ───────────────────────────────────────────────────────────

export interface MusicPreferencesSnapshot {
  preferredStyles: Record<string, number>
  preferredMoods: Record<string, number>
  avgBpm: number
  totalTracks: number
  prefersInstrumental: boolean
}

function getTopKey(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts).filter(([, v]) => v > 0)
  if (entries.length === 0) return null
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * Applies a soft user-history bias to a freshly-created blueprint.
 * Prompt signal always takes priority — bias is only applied when the
 * blueprint has a neutral/general value that the prompt didn't specify.
 *
 * Requires at least 3 tracks of history before any bias is applied.
 */
export function biasBlueprint(
  blueprint: TrackBlueprint,
  prompt: string,
  prefs: MusicPreferencesSnapshot
): { blueprint: TrackBlueprint; personalised: boolean } {
  if (prefs.totalTracks < 3) return { blueprint, personalised: false }

  let applied = false
  let { style, mood, bpm, key } = blueprint
  const lower = prompt.toLowerCase()

  // Style bias — only when prompt produced no genre signal
  if (style === 'general') {
    const topStyle = getTopKey(prefs.preferredStyles)
    if (topStyle && (prefs.preferredStyles[topStyle] ?? 0) >= 2) {
      style = topStyle
      applied = true
    }
  }

  // Mood bias — only when prompt defaulted to neutral
  if (mood === 'neutral') {
    const topMood = getTopKey(prefs.preferredMoods) as TrackMood | null
    if (topMood && (prefs.preferredMoods[topMood] ?? 0) >= 2) {
      mood = topMood
      key = pickKey(topMood)   // keep key consistent with new mood
      applied = true
    }
  }

  // BPM bias — soft 30 % nudge toward user average, skipped if prompt was explicit
  const hasExplicitBpm = /\d{2,3}\s*bpm/.test(lower)
  if (!hasExplicitBpm && prefs.avgBpm > 0) {
    const nudged = Math.round(bpm * 0.7 + prefs.avgBpm * 0.3)
    const clamped = clampBpm(nudged)
    if (Math.abs(clamped - bpm) >= 4) {   // ignore sub-4 BPM changes as noise
      bpm = clamped
      applied = true
    }
  }

  if (!applied) return { blueprint, personalised: false }
  return { blueprint: { ...blueprint, style, mood, bpm, key }, personalised: true }
}

// ── Suggestion generation ─────────────────────────────────────────────────────

// Phrasing pools — pick() selects one at random to vary tone across sessions
const BPM_PHRASES = {
  faster: [
    (avg: number) => `This could hit harder around ${avg} BPM — want me to push it?`,
    (avg: number) => `I'd move this up closer to ${avg} BPM — want to try that?`,
    (avg: number) => `Feels a touch slow for your style. Pushing toward ${avg} BPM could open it up.`,
  ],
  slower: [
    (avg: number) => `Slowing this down to around ${avg} BPM might give it more space — worth trying?`,
    (avg: number) => `This is running fast for your usual range. Pulling back to ${avg} BPM could settle it.`,
    (avg: number) => `Around ${avg} BPM tends to suit your tracks better — want me to bring it down?`,
  ],
} as const

const INSTRUMENT_PHRASES = [
  "You've been leaning instrumental lately — want to strip the vocals and let it breathe?",
  'Most of your recent tracks skip vocals. Want me to pull Scott out and keep this pure?',
  "Your instinct lately is instrumental — want to drop the vocals and see how it sits?",
]

const STYLE_PHRASES = [
  (style: string) => `Your recent tracks lean ${style} — want me to take this in that direction?`,
  (style: string) => `I'm hearing ${style} in a lot of what you've made. Want to pull this that way too?`,
  (style: string) => `This could work well as ${style}. You've been drawn to it — want to try?`,
]

const MOOD_PHRASES = [
  (mood: string) => `This could feel heavier and more ${mood} — want me to push it there?`,
  (mood: string) => `You've been going ${mood} a lot. Want to lean into that here?`,
  (mood: string) => `A ${mood} shift might suit this better — interested in exploring that?`,
]

function pickPhrase<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Stephen analyses the completed blueprint against user history and returns
 * up to 2 actionable suggestions for the next iteration.
 * Returns an empty array until at least 3 tracks have been recorded.
 */
export function generateSuggestions(
  blueprint: TrackBlueprint,
  activeAgents: AgentKey[],
  prefs: MusicPreferencesSnapshot,
  identity?: CreativeIdentity
): Suggestion[] {
  if (prefs.totalTracks < 3) return []

  const results: Suggestion[] = []

  // BPM: nudge when current BPM is more than 20 away from the user's average
  if (prefs.avgBpm > 0 && Math.abs(blueprint.bpm - prefs.avgBpm) > 20) {
    const dir = blueprint.bpm > prefs.avgBpm ? 'slower' : 'faster'
    const template = pickPhrase(BPM_PHRASES[dir])
    results.push({
      type: 'bpm',
      message: template(prefs.avgBpm),
      prompt: `make it ${dir}`,
    })
  }

  // Instrument: vocals active but user leans instrumental
  if (activeAgents.includes('scott') && prefs.prefersInstrumental) {
    results.push({
      type: 'instrument',
      message: pickPhrase(INSTRUMENT_PHRASES),
      prompt: 'remove vocals',
    })
  }

  // Style: current style differs from user's most-generated style
  const topStyle = getTopKey(prefs.preferredStyles)
  if (
    topStyle &&
    topStyle !== blueprint.style &&
    (prefs.preferredStyles[topStyle] ?? 0) >= 2
  ) {
    // 1-in-3 chance: reference the user's full identity summary in the phrasing
    const useIdentity = identity && Math.random() < 0.33
    const message = useIdentity
      ? `${identity!.summary} Want to keep leaning that way?`
      : pickPhrase(STYLE_PHRASES)(topStyle)
    results.push({ type: 'style', message, prompt: `make it ${topStyle}` })
  }

  // Mood: top preference differs from current mood
  const topMood = getTopKey(prefs.preferredMoods)
  if (
    topMood &&
    topMood !== blueprint.mood &&
    (prefs.preferredMoods[topMood] ?? 0) >= 3
  ) {
    const useIdentity = identity?.dominantMood && Math.random() < 0.33
    const message = useIdentity
      ? `${identity!.summary} Want to push the mood there?`
      : pickPhrase(MOOD_PHRASES)(topMood)
    results.push({ type: 'mood', message, prompt: `make it more ${topMood}` })
  }

  return results.slice(0, 2)
}
