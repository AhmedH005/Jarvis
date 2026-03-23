import { BUILDER_REPO_SCOPE } from '@/shared/builder-bridge'
import type {
  BuilderWorkTarget,
  BuilderPlanBridgeRequest,
  BuilderPlanBridgeResult,
} from '@/shared/builder-bridge'
import {
  normalizeBuilderWorkTarget,
} from '@/shared/builder-bridge'

// Re-export under the legacy name so dependents don't need updating.
export { BUILDER_REPO_SCOPE as BUILDER_PLAN_SCOPE }

export type BuilderPlanMode = 'plan-only'
export type BuilderPlanSource = 'real-bridge' | 'local-demo-fallback'
export type BuilderPlanStatus = 'plan-ready' | 'blocked'

export interface BuilderPlanRequest {
  taskPrompt: string
  scope: string
  mode: BuilderPlanMode
}

export interface BuilderPlanResult {
  id: string
  taskPrompt: string
  scope: string
  mode: BuilderPlanMode
  status: BuilderPlanStatus
  planSummary: string
  target: BuilderWorkTarget
  likelyFiles: string[]
  acceptanceCriteria: string[]
  verificationPath: string[]
  source: BuilderPlanSource
  sourceLabel: string
  note: string
  createdAt: string
}

export interface BuilderPlanSurface {
  available: boolean
  source: BuilderPlanSource
  sourceLabel: string
  note: string
}

interface BuilderPlanBridge {
  planTask: (request: BuilderPlanBridgeRequest) => Promise<BuilderPlanBridgeResult>
}

function getBuilderPlanBridge(): BuilderPlanBridge | null {
  const jarvis = window.jarvis as (typeof window.jarvis & {
    builderPlan?: BuilderPlanBridge
  }) | undefined

  if (jarvis?.builderPlan && typeof jarvis.builderPlan.planTask === 'function') {
    return jarvis.builderPlan
  }

  return null
}

export function resolveBuilderPlanSurface(): BuilderPlanSurface {
  const bridge = getBuilderPlanBridge()
  if (bridge) {
    return {
      available: true,
      source: 'real-bridge',
      sourceLabel: 'real bridge',
      note: 'Plan-only requests are currently being served by a live local Builder bridge.',
    }
  }

  return {
    available: false,
    source: 'local-demo-fallback',
    sourceLabel: 'unavailable',
    note: 'Builder plan bridge is not available. Open Jarvis in Electron to use the real planning bridge.',
  }
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim()
}

function normalizeBridgePlanResult(
  result: BuilderPlanBridgeResult,
  request: BuilderPlanBridgeRequest
): BuilderPlanResult {
  return {
    id: result.id,
    taskPrompt: normalizePrompt(result.taskPrompt || request.taskPrompt),
    scope: result.scope || request.scope,
    mode: 'plan-only',
    status: result.status,
    planSummary: result.taskSummary,
    target: normalizeBuilderWorkTarget(result.target, result.likelyFiles),
    likelyFiles: result.likelyFiles,
    acceptanceCriteria: result.acceptanceCriteria,
    verificationPath: result.verificationPath,
    source: 'real-bridge',
    sourceLabel: result.sourceLabel || 'real bridge',
    note: result.note,
    createdAt: result.createdAt || new Date().toISOString(),
  }
}

export async function requestBuilderPlan(request: BuilderPlanRequest): Promise<BuilderPlanResult> {
  const normalizedRequest: BuilderPlanRequest = {
    ...request,
    taskPrompt: normalizePrompt(request.taskPrompt),
    scope: request.scope || BUILDER_REPO_SCOPE,
    mode: 'plan-only',
  }

  const bridge = getBuilderPlanBridge()
  if (!bridge) {
    throw new Error(
      'Builder plan bridge is not available. Open Jarvis in Electron to use the real planning bridge.'
    )
  }

  const bridgeRequest: BuilderPlanBridgeRequest = {
    taskPrompt: normalizedRequest.taskPrompt,
    scope: BUILDER_REPO_SCOPE,
    mode: 'plan-only',
  }

  const result = await bridge.planTask(bridgeRequest)
  return normalizeBridgePlanResult(result, bridgeRequest)
}
