import { create } from 'zustand'

export type AppMode = 'boot' | 'idle' | 'activating' | 'active'

interface UIState {
  mode: AppMode
  setMode: (mode: AppMode) => void
}

export const useUIState = create<UIState>((set) => ({
  mode: 'boot',
  setMode: (mode) => set({ mode }),
}))
