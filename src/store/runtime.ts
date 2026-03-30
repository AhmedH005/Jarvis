import { create } from 'zustand'
import { getRuntimeProvider } from '@/integrations/registry/providerRegistry'
import type { RuntimeSnapshot } from '@/integrations/contracts/providers'

interface RuntimeState {
  snapshot: RuntimeSnapshot | null
  phase: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  refresh: () => Promise<void>
}

export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  snapshot: null,
  phase: 'idle',
  error: null,

  refresh: async () => {
    if (get().phase === 'loading') return

    set({ phase: 'loading', error: null })

    try {
      const snapshot = await getRuntimeProvider().getSnapshot()
      set({ snapshot, phase: 'ready', error: null })
    } catch (error) {
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },
}))
