import { create } from 'zustand'
import {
  type BuilderExecutionFinalizeDraft,
  type BuilderExecutionRun,
} from '@/adapters/builder-execution'
import type { BuilderExecutionRequest } from '@/adapters/builder-execution-request'
import { getBuilderProvider } from '@/integrations/registry/providerRegistry'

type BuilderExecutionPhase = 'idle' | 'loading' | 'ready' | 'error'
type BatchStartPhase = 'idle' | 'running' | 'done' | 'error'

interface BuilderExecutionState {
  phase: BuilderExecutionPhase
  pendingAction: 'start' | 'finalize' | null
  run: BuilderExecutionRun | null
  error: string | null
  /** Feedback state for the last batch start operation */
  batchStartPhase: BatchStartPhase
  batchStartCount: number

  startExecution: (request: BuilderExecutionRequest) => Promise<void>
  /**
   * Start multiple approved requests sequentially against the bridge.
   * `run` is updated to the most recently started run.
   * All starts are real bridge calls — no fake parallelism.
   * The store holds one active run at a time; earlier started runs
   * are registered with the bridge and appear in history after finalization.
   */
  batchStart: (requests: BuilderExecutionRequest[]) => Promise<void>
  clearBatchStartFeedback: () => void
  finalizeExecution: (draft: BuilderExecutionFinalizeDraft) => Promise<void>
  clearRun: () => void
}

export const useBuilderExecutionStore = create<BuilderExecutionState>((set, get) => ({
  phase: 'idle',
  pendingAction: null,
  run: null,
  error: null,
  batchStartPhase: 'idle',
  batchStartCount: 0,

  startExecution: async (request) => {
    if (get().phase === 'loading') return

    set({ phase: 'loading', pendingAction: 'start', error: null })

    try {
      const result = await getBuilderProvider().startExecution(request)
      if (!result.ok) {
        throw new Error(result.failure?.message ?? result.summary)
      }
      set({
        phase: 'ready',
        pendingAction: null,
        run: result.data,
        error: null,
      })
    } catch (error) {
      set({
        phase: 'error',
        pendingAction: null,
        error: error instanceof Error ? error.message : 'Builder execution start failed.',
      })
    }
  },

  batchStart: async (requests) => {
    // Only operate on approved requests — skip anything else silently
    const approved = requests.filter((r) => r.approvalState === 'approved')
    if (approved.length === 0) return

    set({ batchStartPhase: 'running', pendingAction: 'start' })

    let started = 0
    let lastRun: BuilderExecutionRun | null = null

    for (const request of approved) {
      try {
        const result = await getBuilderProvider().startExecution(request)
        if (!result.ok || !result.data) continue
        lastRun = result.data
        started++
      } catch {
        // Skip failed starts — do not cascade-fail the batch
      }
    }

    set({
      // Update run to the most recently started one; keep existing if all failed
      run:             lastRun ?? get().run,
      phase:           lastRun ? 'ready' : get().phase,
      pendingAction:   null,
      batchStartPhase: started > 0 ? 'done' : 'error',
      batchStartCount: started,
    })
  },

  clearBatchStartFeedback: () => set({ batchStartPhase: 'idle', batchStartCount: 0 }),

  finalizeExecution: async (draft) => {
    const run = get().run
    if (!run || get().phase === 'loading') return

    set({ phase: 'loading', pendingAction: 'finalize', error: null })

    try {
      const result = await getBuilderProvider().finalizeExecution(run, draft)
      if (!result.ok) {
        throw new Error(result.failure?.message ?? result.summary)
      }
      set({
        phase: 'ready',
        pendingAction: null,
        run: result.data,
        error: null,
      })
    } catch (error) {
      set({
        phase: 'error',
        pendingAction: null,
        error: error instanceof Error ? error.message : 'Builder execution finalization failed.',
      })
    }
  },

  clearRun: () => set({ run: null, error: null, phase: 'idle', pendingAction: null }),
}))
