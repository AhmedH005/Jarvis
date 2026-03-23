import { create } from 'zustand'
import {
  createBuilderExecutionRequest,
  settleBuilderExecutionRequest,
  type BuilderExecutionDecisionAction,
  type BuilderExecutionRequest,
} from '@/adapters/builder-execution-request'
import type { BuilderPlanResult } from '@/adapters/builder-plan'

type BuilderExecutionRequestPhase = 'idle' | 'loading' | 'ready' | 'error'
type BatchApprovePhase = 'idle' | 'running' | 'done' | 'error'

interface BuilderExecutionRequestState {
  phase: BuilderExecutionRequestPhase
  pendingAction: 'create' | BuilderExecutionDecisionAction | null
  request: BuilderExecutionRequest | null
  /** Additional requests staged alongside the active one (from multi-mission flow) */
  requestQueue: BuilderExecutionRequest[]
  error: string | null
  /** Feedback state for the last batch approve operation */
  batchApprovePhase: BatchApprovePhase
  batchApproveCount: number

  createRequestFromPlan: (plan: BuilderPlanResult) => Promise<void>
  adoptRequest: (request: BuilderExecutionRequest) => void
  /** Stage an additional request for batch approval (does not replace the active one) */
  queueRequest: (request: BuilderExecutionRequest) => void
  settleRequest: (action: BuilderExecutionDecisionAction, reason?: string) => Promise<void>
  /** Approve all awaiting-approval requests (active + queued) in one pass */
  batchApprove: () => Promise<void>
  /** Clear batch feedback after it has been seen */
  clearBatchFeedback: () => void
  clearRequest: () => void
}

export const useBuilderExecutionRequestStore = create<BuilderExecutionRequestState>((set, get) => ({
  phase: 'idle',
  pendingAction: null,
  request: null,
  requestQueue: [],
  error: null,
  batchApprovePhase: 'idle',
  batchApproveCount: 0,

  createRequestFromPlan: async (plan) => {
    if (get().phase === 'loading') return

    set({ phase: 'loading', pendingAction: 'create', error: null })

    try {
      const request = await createBuilderExecutionRequest(plan)
      set({
        phase: 'ready',
        pendingAction: null,
        request,
        error: null,
      })
    } catch (error) {
      set({
        phase: 'error',
        pendingAction: null,
        error: error instanceof Error ? error.message : 'Builder execution request failed.',
      })
    }
  },

  adoptRequest: (request) => set({
    phase: 'ready',
    pendingAction: null,
    request,
    error: null,
  }),

  queueRequest: (request) => set((s) => ({
    requestQueue: [...s.requestQueue, request],
  })),

  settleRequest: async (action, reason) => {
    const request = get().request
    if (!request || get().phase === 'loading') return

    set({ phase: 'loading', pendingAction: action, error: null })

    try {
      const settledRequest = await settleBuilderExecutionRequest(request, action, reason)
      set({
        phase: 'ready',
        pendingAction: null,
        request: settledRequest,
        error: null,
      })
    } catch (error) {
      set({
        phase: 'error',
        pendingAction: null,
        error: error instanceof Error ? error.message : 'Builder approval settlement failed.',
      })
    }
  },

  batchApprove: async () => {
    const { request, requestQueue } = get()

    // Collect all awaiting-approval requests — active first, then queued
    const candidates: BuilderExecutionRequest[] = [
      ...(request?.approvalState === 'awaiting-approval' ? [request] : []),
      ...requestQueue.filter((r) => r.approvalState === 'awaiting-approval'),
    ]

    if (candidates.length === 0) return

    set({ batchApprovePhase: 'running', pendingAction: 'approve' })

    let approved = 0
    let updatedRequest = get().request
    const updatedQueue = [...get().requestQueue]

    for (const candidate of candidates) {
      try {
        const settled = await settleBuilderExecutionRequest(candidate, 'approve')
        approved++
        if (candidate.id === updatedRequest?.id) {
          updatedRequest = settled
        } else {
          const qi = updatedQueue.findIndex((r) => r.id === candidate.id)
          if (qi >= 0) updatedQueue[qi] = settled
        }
      } catch {
        // Skip failed settlements — do not block the rest
      }
    }

    set({
      request:           updatedRequest,
      requestQueue:      updatedQueue,
      phase:             'ready',
      pendingAction:     null,
      batchApprovePhase: approved > 0 ? 'done' : 'error',
      batchApproveCount: approved,
    })
  },

  clearBatchFeedback: () => set({ batchApprovePhase: 'idle', batchApproveCount: 0 }),

  clearRequest: () => set({ request: null, error: null, phase: 'idle', pendingAction: null }),
}))
