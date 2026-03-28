import { create } from 'zustand'
import type { TrackBlueprint, Suggestion, CreativeIdentity } from '@/features/music/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type { TrackBlueprint, Suggestion, CreativeIdentity }

export type AgentStatus = 'idle' | 'generating' | 'done' | 'error'
export type GenerationStatus = 'idle' | 'processing' | 'complete' | 'error'
export type SessionMode = 'new' | 'refining'
export type TrackType = 'riff' | 'loop' | 'full'

export interface AgentOutput {
  type: TrackType
  description: string
  audioUrl: string | null
}

export interface BandMember {
  name: string
  role: string
  instrument: string
  personality: string
  status: AgentStatus
  output: AgentOutput | null
}

export interface MusicLog {
  id: string
  timestamp: number
  agent: string
  message: string
  level: 'info' | 'success' | 'warn'
}

export interface Track {
  id: string
  prompt: string
  type: TrackType
  description: string
  audioUrl: string | null
  generatedAt: number
  components: Partial<Record<string, AgentOutput>>
}

// ── Initial band roster ───────────────────────────────────────────────────────

const INITIAL_BAND: Record<string, BandMember> = {
  peter: {
    name: 'Peter',
    role: 'Lead Guitar',
    instrument: 'Guitar',
    personality: 'Creative, expressive, slightly fast-paced',
    status: 'idle',
    output: null,
  },
  tchalla: {
    name: "T'Challa",
    role: 'Drums',
    instrument: 'Drums',
    personality: 'Controlled, powerful, precise',
    status: 'idle',
    output: null,
  },
  wanda: {
    name: 'Wanda',
    role: 'Keys / Piano',
    instrument: 'Piano',
    personality: 'Emotional, layered, atmospheric',
    status: 'idle',
    output: null,
  },
  scott: {
    name: 'Scott',
    role: 'Vocals',
    instrument: 'Voice',
    personality: 'Human, relatable, adaptive tone',
    status: 'idle',
    output: null,
  },
  stephen: {
    name: 'Stephen',
    role: 'Producer',
    instrument: 'Studio',
    personality: 'Strategic, composed, analytical',
    status: 'idle',
    output: null,
  },
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface MusicState {
  // Current session
  currentTrack: Track | null
  currentBlueprint: TrackBlueprint | null
  generationStatus: GenerationStatus
  sessionMode: SessionMode
  /** True when the current blueprint was influenced by preference history */
  blueprintPersonalised: boolean
  activeAgents: string[]
  logs: MusicLog[]
  band: Record<string, BandMember>

  // Iteration history (current session only — cleared on full reset)
  previousTracks: Track[]
  previousBlueprints: TrackBlueprint[]

  /** Up to 2 contextual suggestions from Stephen after each completed track */
  suggestions: Suggestion[]
  /** Derived creative identity — updated after each completed track */
  creativeIdentity: CreativeIdentity | null

  // ── Actions ────────────────────────────────────────────────────────────────
  setGenerationStatus: (status: GenerationStatus) => void
  setSessionMode: (mode: SessionMode) => void
  setBlueprintPersonalised: (val: boolean) => void
  setAgentStatus: (key: string, status: AgentStatus) => void
  setAgentOutput: (key: string, output: AgentOutput) => void
  setActiveAgents: (keys: string[]) => void
  addLog: (agent: string, message: string, level?: MusicLog['level']) => void
  setCurrentTrack: (track: Track | null) => void
  setCurrentBlueprint: (blueprint: TrackBlueprint | null) => void
  setSuggestions: (suggestions: Suggestion[]) => void
  setCreativeIdentity: (identity: CreativeIdentity | null) => void

  /** Archive the current track + blueprint into history before a refinement. */
  pushHistory: (track: Track, blueprint: TrackBlueprint) => void

  /**
   * Soft-reset: clears band statuses and generation state only.
   * Preserves logs, current track/blueprint, active agents, and history.
   * Used at the start of a refinement pass.
   */
  softReset: () => void

  /** Full reset — wipes everything including history. */
  reset: () => void
}

function makeLogId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function freshBand(): Record<string, BandMember> {
  return Object.fromEntries(
    Object.entries(INITIAL_BAND).map(([k, v]) => [k, { ...v, status: 'idle', output: null }])
  )
}

export const useMusicStore = create<MusicState>((set) => ({
  currentTrack: null,
  currentBlueprint: null,
  generationStatus: 'idle',
  sessionMode: 'new',
  blueprintPersonalised: false,
  activeAgents: [],
  logs: [],
  band: INITIAL_BAND,
  previousTracks: [],
  previousBlueprints: [],
  suggestions: [],
  creativeIdentity: null,

  setGenerationStatus: (status) => set({ generationStatus: status }),
  setSessionMode: (mode) => set({ sessionMode: mode }),
  setBlueprintPersonalised: (val) => set({ blueprintPersonalised: val }),

  setAgentStatus: (key, status) =>
    set((s) => ({ band: { ...s.band, [key]: { ...s.band[key], status } } })),

  setAgentOutput: (key, output) =>
    set((s) => ({ band: { ...s.band, [key]: { ...s.band[key], output, status: 'done' } } })),

  setActiveAgents: (keys) => set({ activeAgents: keys }),

  addLog: (agent, message, level = 'info') =>
    set((s) => ({
      logs: [
        ...s.logs,
        { id: makeLogId(), timestamp: Date.now(), agent, message, level },
      ].slice(-120),
    })),

  setCurrentTrack: (track) => set({ currentTrack: track }),
  setCurrentBlueprint: (blueprint) => set({ currentBlueprint: blueprint }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setCreativeIdentity: (identity) => set({ creativeIdentity: identity }),

  pushHistory: (track, blueprint) =>
    set((s) => ({
      previousTracks: [...s.previousTracks, track].slice(-10),
      previousBlueprints: [...s.previousBlueprints, blueprint].slice(-10),
    })),

  softReset: () =>
    set({
      generationStatus: 'idle',
      blueprintPersonalised: false,
      suggestions: [],
      band: freshBand(),
      // Intentionally preserved: currentTrack, currentBlueprint, activeAgents,
      // logs, previousTracks, previousBlueprints
    }),

  reset: () =>
    set({
      currentTrack: null,
      currentBlueprint: null,
      generationStatus: 'idle',
      sessionMode: 'new',
      blueprintPersonalised: false,
      activeAgents: [],
      logs: [],
      band: freshBand(),
      previousTracks: [],
      previousBlueprints: [],
      suggestions: [],
      creativeIdentity: null,
    }),
}))
