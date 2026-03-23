import { nanoid } from '@/lib/utils'
import { BUILDER_PLAN_SCOPE, type BuilderPlanResult } from './builder-plan'
import type {
  BuilderWorkTarget,
  BuilderRemediationKind,
  BuilderExecutionHistoryEntry,
  BuilderExecutionRemediationRequestInput,
  BuilderExecutionRemediationRequestResult,
  BuilderExecutionRequestCreateInput,
  BuilderExecutionRequestCreateResult,
  BuilderExecutionRequestSettleInput,
  BuilderExecutionRequestSettleResult,
} from '@/shared/builder-bridge'
import {
  normalizeBuilderWorkTarget,
} from '@/shared/builder-bridge'

export type BuilderExecutionMode = 'approval-gated'
export type BuilderExecutionRequestStatus =
  | 'draft'
  | 'awaiting-approval'
  | 'approved'
  | 'denied'
  | 'blocked'
  | 'fallback-demo'

export type BuilderExecutionApprovalState =
  | 'not-submitted'
  | 'awaiting-approval'
  | 'approved'
  | 'denied'
  | 'blocked'

export interface BuilderExecutionRequest {
  id: string
  taskPrompt: string
  scope: string
  sourceRunId?: string
  remediationKind?: BuilderRemediationKind
  planSummary: string
  target: BuilderWorkTarget
  likelyFiles: string[]
  approvalState: BuilderExecutionApprovalState
  requestedAt: string
  settledAt?: string
  source: 'real-bridge' | 'local-demo-fallback'
  sourceLabel: string
  executionMode: BuilderExecutionMode
  status: BuilderExecutionRequestStatus
  note: string
}

export interface BuilderExecutionRequestSurface {
  available: boolean
  source: 'real-bridge' | 'local-demo-fallback'
  sourceLabel: string
  note: string
}

export type BuilderExecutionDecisionAction = 'approve' | 'deny'

interface BuilderExecutionRequestBridge {
  createRequest: (input: BuilderExecutionRequestCreateInput) => Promise<BuilderExecutionRequestCreateResult>
  createRemediationRequest: (
    input: BuilderExecutionRemediationRequestInput
  ) => Promise<BuilderExecutionRemediationRequestResult>
  settle: (input: BuilderExecutionRequestSettleInput) => Promise<BuilderExecutionRequestSettleResult>
}

function getExecutionRequestBridge(): BuilderExecutionRequestBridge | null {
  const jarvis = window.jarvis as (typeof window.jarvis & {
    builderExecutionRequest?: BuilderExecutionRequestBridge
  }) | undefined

  if (
    jarvis?.builderExecutionRequest &&
    typeof jarvis.builderExecutionRequest.createRequest === 'function' &&
    typeof jarvis.builderExecutionRequest.createRemediationRequest === 'function' &&
    typeof jarvis.builderExecutionRequest.settle === 'function'
  ) {
    return jarvis.builderExecutionRequest
  }

  return null
}

export function resolveExecutionRequestSurface(): BuilderExecutionRequestSurface {
  const bridge = getExecutionRequestBridge()
  if (bridge) {
    return {
      available: true,
      source: 'real-bridge',
      sourceLabel: 'real bridge',
      note: 'Execution-request creation, remediation-request packaging, and approval settlement are currently being served by a live local Builder bridge. Execution still happens later.',
    }
  }

  return {
    available: false,
    source: 'local-demo-fallback',
    sourceLabel: 'unavailable',
    note: 'Builder execution-request bridge is not available. Open Jarvis in Electron to create real requests.',
  }
}


function normalizeBridgeRequest(
  request: BuilderExecutionRequestCreateResult,
  plan: BuilderPlanResult
): BuilderExecutionRequest {
  return {
    id: request.requestId,
    taskPrompt: plan.taskPrompt,
    scope: request.scope || plan.scope,
    sourceRunId: request.sourceRunId,
    remediationKind: request.remediationKind,
    planSummary: request.summary || plan.planSummary,
    target: normalizeBuilderWorkTarget(request.target, request.likelyFiles?.length ? request.likelyFiles : plan.likelyFiles),
    likelyFiles: request.likelyFiles?.length ? request.likelyFiles : plan.likelyFiles,
    approvalState: request.approvalState,
    requestedAt: request.createdAt || new Date().toISOString(),
    source: 'real-bridge',
    sourceLabel: request.sourceLabel || 'real bridge',
    executionMode: 'approval-gated',
    status: request.status,
    note: request.note,
  }
}

function normalizeBridgeRemediationRequest(
  request: BuilderExecutionRemediationRequestResult,
  remediationPrompt: string
): BuilderExecutionRequest {
  return {
    id: request.requestId,
    taskPrompt: remediationPrompt,
    scope: request.scope || BUILDER_PLAN_SCOPE,
    sourceRunId: request.sourceRunId,
    remediationKind: request.remediationKind,
    planSummary: request.summary,
    target: normalizeBuilderWorkTarget(request.target, request.likelyFiles),
    likelyFiles: request.likelyFiles ?? [],
    approvalState: request.approvalState,
    requestedAt: request.createdAt || new Date().toISOString(),
    source: 'real-bridge',
    sourceLabel: request.sourceLabel || 'real bridge',
    executionMode: 'approval-gated',
    status: request.status,
    note: request.note,
  }
}

function normalizeBridgeSettlement(
  result: BuilderExecutionRequestSettleResult,
  request: BuilderExecutionRequest
): BuilderExecutionRequest {
  return {
    ...request,
    scope: result.scope || request.scope,
    approvalState: result.approvalState,
    settledAt: result.settledAt || new Date().toISOString(),
    source: 'real-bridge',
    sourceLabel: result.sourceLabel || 'real bridge',
    status: result.status,
    note: result.note,
  }
}

export async function createBuilderExecutionRequest(plan: BuilderPlanResult): Promise<BuilderExecutionRequest> {
  const bridge = getExecutionRequestBridge()
  if (bridge) {
    if (plan.status !== 'plan-ready') {
      return {
        id: nanoid(),
        taskPrompt: plan.taskPrompt,
        scope: plan.scope || BUILDER_PLAN_SCOPE,
        planSummary: plan.planSummary,
        target: plan.target,
        likelyFiles: plan.likelyFiles,
        approvalState: 'blocked',
        requestedAt: new Date().toISOString(),
        source: 'real-bridge',
        sourceLabel: 'real bridge',
        executionMode: 'approval-gated',
        status: 'blocked',
        note: 'The Builder bridge did not create an execution request because the supplied plan is not plan-ready. No approval was settled and no execution happened.',
      }
    }

    const requestInput: BuilderExecutionRequestCreateInput = {
      approvedPlan: {
        id: plan.id,
        taskPrompt: plan.taskPrompt,
        scope: BUILDER_PLAN_SCOPE,
        mode: 'plan-only',
        taskSummary: plan.planSummary,
        target: plan.target,
        likelyFiles: plan.likelyFiles,
        acceptanceCriteria: plan.acceptanceCriteria,
        verificationPath: plan.verificationPath,
        source: plan.source,
        status: 'plan-ready',
      },
      scope: BUILDER_PLAN_SCOPE,
      mode: 'approval-gated execution request',
    }

    const request = await bridge.createRequest(requestInput)
    return normalizeBridgeRequest(request, plan)
  }

  throw new Error(
    'Builder execution-request bridge is not available. Open Jarvis in Electron to create real requests.'
  )
}

export async function settleBuilderExecutionRequest(
  request: BuilderExecutionRequest,
  action: BuilderExecutionDecisionAction,
  reason?: string
): Promise<BuilderExecutionRequest> {
  const bridge = getExecutionRequestBridge()
  if (bridge) {
    const result = await bridge.settle({
      requestId: request.id,
      scope: BUILDER_PLAN_SCOPE,
      action,
      decidedBy: 'ui-user',
      reason,
    })

    return normalizeBridgeSettlement(result, request)
  }

  throw new Error(
    'Builder execution-request bridge is not available. Open Jarvis in Electron to settle requests.'
  )
}

export async function createBuilderRemediationRequest(
  sourceRun: BuilderExecutionHistoryEntry,
  remediationPrompt: string
): Promise<BuilderExecutionRequest> {
  const bridge = getExecutionRequestBridge()
  const normalizedPrompt = remediationPrompt.trim()

  if (bridge) {
    const result = await bridge.createRemediationRequest({
      sourceRunId: sourceRun.runId,
      scope: BUILDER_PLAN_SCOPE,
      mode: 'manual remediation request',
      remediationPrompt: normalizedPrompt,
    })

    return normalizeBridgeRemediationRequest(result, normalizedPrompt)
  }

  throw new Error(
    'Builder execution-request bridge is not available. Open Jarvis in Electron to create remediation requests.'
  )
}
