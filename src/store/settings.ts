import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LLMProvider = 'claude'
export type TTSProvider = 'basic' | 'elevenlabs'
export type VoiceProfile = 'private' | 'friends'

export const PROFILES: Record<VoiceProfile, { llmProvider: LLMProvider; ttsProvider: TTSProvider }> = {
  /** Daily solo use — free, no external TTS API needed */
  private: { llmProvider: 'claude', ttsProvider: 'basic' },
  /** Showcase mode — ElevenLabs for premium voice quality */
  friends: { llmProvider: 'claude', ttsProvider: 'elevenlabs' },
}

interface SettingsState {
  llmProvider: LLMProvider
  ttsProvider: TTSProvider
  setLLMProvider: (p: LLMProvider) => void
  setTTSProvider: (p: TTSProvider) => void
  /** Apply a named profile preset */
  applyProfile: (profile: VoiceProfile) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      llmProvider: 'claude',
      ttsProvider: 'basic',
      setLLMProvider: (llmProvider) => set({ llmProvider }),
      setTTSProvider: (ttsProvider) => set({ ttsProvider }),
      applyProfile: (profile) => set(PROFILES[profile]),
    }),
    { name: 'jarvis-settings' }
  )
)
