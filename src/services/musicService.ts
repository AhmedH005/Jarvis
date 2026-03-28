import type { AgentOutput, TrackType } from '@/store/music'
import type { TrackBlueprint } from '@/features/music/types'

// ── Audio helpers ─────────────────────────────────────────────────────────────

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

function mockAudioUrl(): string {
  return SILENT_WAV
}

/** Decode a base64 audio string into a blob URL playable by an <audio> element. */
function base64ToBlobUrl(base64: string, mimeType: string): string {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}

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
 * The Studio pass routes to generateFullSong (real API) so the final mix
 * always has real audio. Individual instrument passes stay mock.
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

  await delay(jitter(800, 600))

  const effectiveBlueprint: TrackBlueprint = blueprint ?? {
    key: 'C major',
    bpm: 100,
    mood: 'neutral',
    style: 'general',
    structure: ['intro', 'main', 'outro'],
  }

  return {
    type,
    description: buildDescription(instrument, type, prompt, effectiveBlueprint),
    audioUrl: mockAudioUrl(),
  }
}

/**
 * Generate the final mix audio.
 * Calls ElevenLabs Sound Generation via IPC when the API key is configured.
 * Falls back to mock audio if the key is absent or the call fails.
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

  // ── ElevenLabs via IPC ────────────────────────────────────────────────────
  const musicBridge = window.jarvis?.music
  if (musicBridge) {
    try {
      const apiPrompt = buildApiPrompt(prompt, effectiveBlueprint)
      const result = await musicBridge.generate(apiPrompt)
      if (result.ok) {
        console.log('[musicService] ElevenLabs audio ready', { bytes: result.bytes })
        return { type: 'full', description, audioUrl: base64ToBlobUrl(result.audioBase64, result.mimeType) }
      }
      console.warn('[musicService] ElevenLabs returned error:', result.error)
    } catch (err) {
      console.warn('[musicService] ElevenLabs call failed, using mock:', err)
    }
  }

  // ── Fallback: mock ────────────────────────────────────────────────────────
  await delay(jitter(1800, 800))
  return { type: 'full', description, audioUrl: mockAudioUrl() }
}
