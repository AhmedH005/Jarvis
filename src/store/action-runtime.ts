import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ActionDomain,
  ActionRecord,
  ApprovalRequestRecord,
  ExecutionReceipt,
  ProviderFailure,
  SharedActionState,
} from '@/integrations/contracts/base'

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

interface ActionRuntimeState {
  actions: ActionRecord[]
  approvals: ApprovalRequestRecord[]
  receipts: ExecutionReceipt[]
  recordAction: <TPayload>(input: {
    domain: ActionDomain
    providerKey: string
    state: SharedActionState
    title: string
    summary: string
    payload?: TPayload
    approval?: Omit<ApprovalRequestRecord, 'id' | 'actionId' | 'createdAt'>
  }) => string
  transitionAction: (
    actionId: string,
    state: SharedActionState,
    summary: string,
    failure?: ProviderFailure,
  ) => void
  attachReceipt: (
    actionId: string,
    input: Omit<ExecutionReceipt, 'id' | 'actionId' | 'createdAt'>,
  ) => string
  resolveApproval: (approvalId: string, status: 'approved' | 'rejected') => void
}

export const useActionRuntimeStore = create<ActionRuntimeState>()(
  persist(
    (set) => ({
      actions: [],
      approvals: [],
      receipts: [],

      recordAction: ({ domain, providerKey, state, title, summary, payload, approval }) => {
        const now = new Date().toISOString()
        const actionId = makeId('act')
        const approvalRecord: ApprovalRequestRecord | undefined = approval
          ? {
              id: makeId('appr'),
              actionId,
              createdAt: now,
              ...approval,
            }
          : undefined

        set((current) => ({
          actions: [
            {
              id: actionId,
              domain,
              providerKey,
              state,
              title,
              summary,
              payload,
              approval: approvalRecord,
              createdAt: now,
              updatedAt: now,
            },
            ...current.actions,
          ].slice(0, 300),
          approvals: approvalRecord
            ? [approvalRecord, ...current.approvals].slice(0, 300)
            : current.approvals,
        }))

        return actionId
      },

      transitionAction: (actionId, state, summary, failure) => {
        const now = new Date().toISOString()
        set((current) => ({
          actions: current.actions.map((action) =>
            action.id === actionId
              ? {
                  ...action,
                  state,
                  summary,
                  failure,
                  updatedAt: now,
                }
              : action,
          ),
        }))
      },

      attachReceipt: (actionId, input) => {
        const now = new Date().toISOString()
        const receiptId = makeId('rcpt')
        const receipt: ExecutionReceipt = {
          id: receiptId,
          actionId,
          createdAt: now,
          ...input,
        }

        set((current) => ({
          receipts: [receipt, ...current.receipts].slice(0, 300),
          actions: current.actions.map((action) =>
            action.id === actionId
              ? {
                  ...action,
                  receiptId,
                  updatedAt: now,
                }
              : action,
          ),
        }))

        return receiptId
      },

      resolveApproval: (approvalId, status) => {
        const now = new Date().toISOString()
        set((current) => ({
          approvals: current.approvals.map((approval) =>
            approval.id === approvalId
              ? {
                  ...approval,
                  status,
                  resolvedAt: now,
                }
              : approval,
          ),
          actions: current.actions.map((action) =>
            action.approval?.id === approvalId
              ? {
                  ...action,
                  approval: {
                    ...action.approval,
                    status,
                    resolvedAt: now,
                  },
                  updatedAt: now,
                }
              : action,
          ),
        }))
      },
    }),
    {
      name: 'jarvis-action-runtime',
      version: 1,
      partialize: (state) => ({
        actions: state.actions.slice(0, 100),
        approvals: state.approvals.slice(0, 100),
        receipts: state.receipts.slice(0, 100),
      }),
    },
  ),
)
