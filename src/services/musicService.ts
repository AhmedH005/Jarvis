import type { AgentOutput, TrackType } from '@/store/music'
import type { TrackBlueprint } from '@/features/music/types'
import { getMediaProvider } from '@/integrations/registry/providerRegistry'

/** Build the ElevenLabs prompt from blueprint + user intent. */
function buildApiPrompt(userPrompt: string, bp: TrackBlueprint): string {
  const c = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return `${c(bp.style)} music in ${bp.key} at ${bp.bpm} BPM, ${bp.mood} mood. ${userPrompt}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function jitter(base: number, spread = 400): number {
  return base + Math.floor(Math.random() * spread)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Blueprint context string ──────────────────────────────────────────────────

function blueprintCtx(blueprint: TrackBlueprint): string {
  return `${blueprint.style} · ${blueprint.key} · ${blueprint.bpm} BPM · ${blueprint.mood}`
}

// ── Description templates (blueprint-aware) ───────────────────────────────────

function buildDescription(
  instrument: string,
  type: TrackType,
  prompt: string,
  blueprint: TrackBlueprint
): string {
  const ctx = blueprintCtx(blueprint)
  const slug = prompt.slice(0, 36)
  const { mood, key, bpm, style, structure } = blueprint
  const sections = structure.slice(0, 3).join(' → ')
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  const templates: Record<string, string[]> = {
    Guitar: [
      `${cap(style)} ${type} in ${key} at ${bpm} BPM — expressive lead phrasing with a ${mood} character over ${sections}`,
      `Layered ${style} guitar ${type} (${ctx}) — finger-picked arpeggios shaped by "${slug}"`,
      `Driving ${type} in ${key}: ${style} chord stabs at ${bpm} BPM with a soaring lead line, ${mood} feel`,
    ],
    Drums: [
      `${cap(style)} ${type} locked at ${bpm} BPM — kick/snare pattern reinforcing the ${mood} energy of ${sections}`,
      `Syncopated ${style} ${type} (${ctx}) — hi-hat flutter and fills at key structural points`,
      `${cap(style)} groove at ${bpm} BPM for "${slug}" — ghost notes and dynamics matched to ${mood}`,
    ],
    Piano: [
      `${cap(style)} ${type} in ${key} at ${bpm} BPM — sustained ${mood} chord voicings over ${sections}`,
      `${cap(mood)} ${style} ${type} (${ctx}) — descending progression through ${sections}`,
      `Lush ${style} ${type} in ${key}: wide-voiced triads at ${bpm} BPM, shaping the ${mood} arc`,
    ],
    Voice: [
      `${cap(style)} vocal ${type} in ${key} at ${bpm} BPM — ${mood} phrasing for "${slug}", covering ${sections}`,
      `${cap(style)} hook and verse (${ctx}) — internal rhyme, mid-range delivery, ${mood} tone`,
      `${cap(mood)} ${style} lyric draft in ${key} at ${bpm} BPM: "${slug}"`,
    ],
    Studio: [
      `${cap(style)} final mix: all stems in ${key} · ${bpm} BPM · ${mood} — structure: ${structure.join(' → ')}`,
      `${cap(style)} master chain (${ctx}): EQ, side-chain compression, limiting at −1 dBFS across ${structure.length} sections`,
      `${cap(style)} arrangement (${ctx}) — unified ${mood} character across ${sections}`,
    ],
  }

  const pool = templates[instrument] ?? [
    `${instrument} ${type} (${ctx}) — generated for: ${slug}`,
  ]
  return pick(pool)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a single instrument layer.
 * Only the Studio pass has a real media backend today. Individual instrument
 * passes stay descriptive-only instead of fabricating silent audio.
 */
export async function generateInstrument(
  prompt: string,
  instrument: string,
  type: TrackType = 'riff',
  blueprint?: TrackBlueprint
): Promise<AgentOutput> {
  if (instrument === 'Studio') {
    return generateFullSong(prompt, blueprint)
  }

  const effectiveBlueprint: TrackBlueprint = blueprint ?? {
    key: 'C major',
    bpm: 100,
    mood: 'neutral',
    style: 'general',
    structure: ['intro', 'main', 'outro'],
  }

  return {
    type,
    description: `${buildDescription(instrument, type, prompt, effectiveBlueprint)}. No standalone ${instrument.toLowerCase()} generation provider is configured yet, so this layer is descriptive only.`,
    audioUrl: null,
  }
}

/**
 * Generate the final mix audio.
 * Routes through the media provider and reports truthful unavailability instead
 * of falling back to fake audio.
 */
export async function generateFullSong(
  prompt: string,
  blueprint?: TrackBlueprint
): Promise<AgentOutput> {
  const effectiveBlueprint: TrackBlueprint = blueprint ?? {
    key: 'C major',
    bpm: 100,
    mood: 'neutral',
    style: 'general',
    structure: ['intro', 'main', 'outro'],
  }

  const description = buildDescription('Studio', 'full', prompt, effectiveBlueprint)
  const result = await getMediaProvider().generateTrack(buildApiPrompt(prompt, effectiveBlueprint), effectiveBlueprint)

  if (!result.ok) {
    await delay(jitter(200, 100))
    return {
      type: 'full',
      description: `${description}. Audio generation unavailable: ${result.failure?.message ?? result.summary}`,
      audioUrl: null,
    }
  }

  return {
    type: 'full',
    description,
    audioUrl: result.data?.audioUrl ?? null,
  }
}
