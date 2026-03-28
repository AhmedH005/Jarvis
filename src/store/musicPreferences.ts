import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TrackBlueprint, CreativeIdentity } from '@/features/music/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MusicPreferencesState {
  /** How many times each style has been generated */
  preferredStyles: Record<string, number>
  /** How many times each mood has been generated */
  preferredMoods: Record<string, number>
  /** Running average BPM across all generated tracks */
  avgBpm: number
  /** Total tracks generated — used for averaging and bias threshold */
  totalTracks: number
  /** Whether the user more often skips vocals (Scott not active) */
  prefersInstrumental: boolean
  /** Internal counter for instrumental tracks */
  instrumentalCount: number

  updatePreferences: (blueprint: TrackBlueprint, agentsUsed: string[]) => void
  reset: () => void
}

const INITIAL: Pick<
  MusicPreferencesState,
  | 'preferredStyles'
  | 'preferredMoods'
  | 'avgBpm'
  | 'totalTracks'
  | 'prefersInstrumental'
  | 'instrumentalCount'
> = {
  preferredStyles: {},
  preferredMoods: {},
  avgBpm: 0,
  totalTracks: 0,
  prefersInstrumental: false,
  instrumentalCount: 0,
}

// ── Identity generation ───────────────────────────────────────────────────────

interface PrefsSnapshot {
  preferredStyles: Record<string, number>
  preferredMoods: Record<string, number>
  avgBpm: number
  totalTracks: number
  prefersInstrumental: boolean
}

function topKey(counts: Record<string, number>): string | undefined {
  const entries = Object.entries(counts).filter(([, v]) => v > 0)
  if (entries.length === 0) return undefined
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

function bpmCharacter(bpm: number): string {
  if (bpm < 80)  return 'slow and spacious'
  if (bpm < 110) return 'mid-tempo'
  if (bpm < 130) return 'uptempo'
  return 'fast and driven'
}

/**
 * Derives a one-sentence creative identity from accumulated preference data.
 * Requires at least 3 tracks before returning a meaningful summary.
 */
export function generateIdentity(prefs: PrefsSnapshot): CreativeIdentity {
  const dominantStyle  = topKey(prefs.preferredStyles)
  const dominantMood   = topKey(prefs.preferredMoods)
  const avgBpm         = prefs.avgBpm > 0 ? prefs.avgBpm : undefined
  const prefersInstrumental = prefs.prefersInstrumental

  if (prefs.totalTracks < 3) {
    return { summary: 'Still forming your sound — keep generating.' }
  }

  const instrumental = prefersInstrumental ? ', usually without vocals' : ''
  const bpmNote      = avgBpm ? ` around ${avgBpm} BPM` : ''

  let summary: string

  if (dominantStyle && dominantMood) {
    summary = `Your sound leans ${dominantStyle} — often ${dominantMood}${bpmNote}${instrumental}.`
  } else if (dominantStyle) {
    summary = `You tend to work in ${dominantStyle} production${bpmNote}${instrumental}.`
  } else if (dominantMood) {
    summary = `Most of what you make feels ${dominantMood}${bpmNote}${instrumental}.`
  } else {
    summary = `Your style is still taking shape — ${prefs.totalTracks} tracks in.`
  }

  return { summary, dominantStyle, dominantMood, avgBpm, prefersInstrumental }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useMusicPreferencesStore = create<MusicPreferencesState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      updatePreferences(blueprint, agentsUsed) {
        const s = get()
        const n = s.totalTracks + 1

        // Style frequency
        const preferredStyles = {
          ...s.preferredStyles,
          [blueprint.style]: (s.preferredStyles[blueprint.style] ?? 0) + 1,
        }

        // Mood frequency
        const preferredMoods = {
          ...s.preferredMoods,
          [blueprint.mood]: (s.preferredMoods[blueprint.mood] ?? 0) + 1,
        }

        // Running BPM average
        const avgBpm = s.avgBpm === 0
          ? blueprint.bpm
          : Math.round((s.avgBpm * s.totalTracks + blueprint.bpm) / n)

        // Instrumental preference
        const wasInstrumental = !agentsUsed.includes('scott')
        const instrumentalCount = s.instrumentalCount + (wasInstrumental ? 1 : 0)
        const prefersInstrumental = instrumentalCount > n / 2

        set({ preferredStyles, preferredMoods, avgBpm, totalTracks: n, prefersInstrumental, instrumentalCount })
      },

      reset() {
        set(INITIAL)
      },
    }),
    {
      name: 'jarvis-music-preferences',
      partialize: (s) => ({
        preferredStyles: s.preferredStyles,
        preferredMoods: s.preferredMoods,
        avgBpm: s.avgBpm,
        totalTracks: s.totalTracks,
        prefersInstrumental: s.prefersInstrumental,
        instrumentalCount: s.instrumentalCount,
      }),
    }
  )
)
