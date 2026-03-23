import { create } from 'zustand'
import {
  BUILDER_PLAN_SCOPE,
  requestBuilderPlan,
  type BuilderPlanResult,
} from '@/adapters/builder-plan'

type BuilderPlanPhase = 'idle' | 'loading' | 'ready' | 'error'

interface BuilderPlanState {
  prompt: string
  phase: BuilderPlanPhase
  result: BuilderPlanResult | null
  error: string | null
  setPrompt: (prompt: string) => void
  submitPlan: () => Promise<void>
  clearResult: () => void
}

export const useBuilderPlanStore = create<BuilderPlanState>((set, get) => ({
  prompt: '',
  phase: 'idle',
  result: null,
  error: null,

  setPrompt: (prompt) => set({ prompt }),

  submitPlan: async () => {
    const prompt = get().prompt.trim()
    if (!prompt || get().phase === 'loading') return

    set({ phase: 'loading', error: null })

    try {
      const result = await requestBuilderPlan({
        taskPrompt: prompt,
        scope: BUILDER_PLAN_SCOPE,
        mode: 'plan-only',
      })

      set({
        phase: 'ready',
        result,
        error: null,
      })
    } catch (error) {
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Builder planning failed.',
      })
    }
  },

  clearResult: () => set({ result: null, error: null, phase: 'idle' }),
}))
