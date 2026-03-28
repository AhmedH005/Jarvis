// ── Track Blueprint ────────────────────────────────────────────────────────────
// A shared contract produced by Stephen (Producer) before any agent starts.
// Every agent receives a copy and must align its output to these parameters.

export type TrackMood =
  | 'melancholic'
  | 'uplifting'
  | 'intense'
  | 'ambient'
  | 'energetic'
  | 'romantic'
  | 'neutral'

export interface TrackBlueprint {
  /** Musical key — e.g. "A minor", "C major" */
  key: string
  /** Beats per minute */
  bpm: number
  /** Emotional character of the track */
  mood: TrackMood
  /** Ordered list of sections the track should contain */
  structure: string[]
  /** Genre / production style — e.g. "trap", "jazz", "cinematic" */
  style: string
}

// ── Creative identity ──────────────────────────────────────────────────────────

export interface CreativeIdentity {
  /** Single-sentence description of the user's evolving sound */
  summary: string
  dominantStyle?: string
  dominantMood?: string
  avgBpm?: number
  prefersInstrumental?: boolean
}

// ── Suggestions ────────────────────────────────────────────────────────────────

export type SuggestionType = 'bpm' | 'style' | 'mood' | 'instrument'

export interface Suggestion {
  /** Human-readable suggestion shown in the UI */
  message: string
  /** Category of the suggestion */
  type: SuggestionType
  /** Refinement command sent to the orchestrator when clicked */
  prompt: string
}
