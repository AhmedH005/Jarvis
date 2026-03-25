import { create } from 'zustand'

export type VoicePhase = 'idle' | 'listening' | 'speaking'

interface VoiceState {
  voicePhase: VoicePhase
  setVoicePhase: (p: VoicePhase) => void
  isMuted: boolean
  toggleMute: () => void
  lastTranscript: string
  setLastTranscript: (t: string) => void
}

export const useVoiceStore = create<VoiceState>((set) => ({
  voicePhase: 'idle',
  setVoicePhase: (voicePhase) => set({ voicePhase }),
  isMuted: false,
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  lastTranscript: '',
  setLastTranscript: (lastTranscript) => set({ lastTranscript }),
}))
