import { nanoid } from '@/lib/utils'
import type {
  BuilderExecutionHistorySnapshot,
  BuilderExecutionRun,
} from '@/adapters/builder-execution'
import type {
  BuilderExecutionDecisionAction,
  BuilderExecutionRequest,
} from '@/adapters/builder-execution-request'
import type { BuilderExecutionFinalizeDraft } from '@/adapters/builder-execution'
import type { BuilderPlanRequest, BuilderPlanResult } from '@/adapters/builder-plan'
import type { CheckerRunVerification } from '@/adapters/checker'
import type { BuilderProvider } from '@/integrations/contracts/providers'
import type { ProviderDescriptor, ProviderOperationResult } from '@/integrations/contracts/base'
import {
  blockedResult,
  buildProviderFailure,
  stagedResult,
  successResult,
} from '@/integrations/contracts/result-helpers'
import { loadSkillManifest } from '@/integrations/skills/loader'
import { stageAction } from '@/integrations/runtime/safety'
import { enforce, toOperationResult, type EnforcementResult } from '@/integrations/governance/governance-enforcer'
import { lookupProjectContext, lookupRecentExecutionReceipts } from '@/integrations/memory/hooks'
import {
  buildRemediationPlan,
  buildResultSummary,
  decomposePrompt,
} from './builder-heuristics'
import type {
  BuilderTaskContext,
  BuilderTaskDecomposition,
  BuilderRemediationPlan,
  BuilderResultSummary,
  BuilderContextAttachment,
} from '@/shared/builder-action-types'

function now(): string {
  return new Date().toISOString()
}

function stagedStatus(gov: EnforcementResult | null): 'staged' | 'blockedByDryRun' {
  return gov?.outcome === 'blocked_by_dry_run' ? 'blockedByDryRun' : 'staged'
}

function stagedBuilderResult<T>(
  action: string,
  summary: string,
  data?: T,
  options?: {
    stagedActionId?: string
    gov?: EnforcementResult | null
    notes?: string[]
    metadata?: Record<string, unknown>
  },
): ProviderOperationResult<T> {
  return stagedResult(
    {
      providerKey: 'builder-skill-provider',
      action,
      auditEntryId: options?.gov?.auditEntryId,
      stagedActionId: options?.stagedActionId,
      notes: options?.notes,
      metadata: options?.metadata,
    },
    summary,
    data,
    { status: stagedStatus(options?.gov ?? null) },
  )
}

// ── Context assembly ───────────────────────────────────────────────────────

/**
 * Assemble a BuilderTaskContext from memory hooks based on a task prompt.
 * Returns a lightweight context snapshot suitable for attaching to staged actions.
 */
async function assembleContext(prompt: string): Promise<BuilderTaskContext> {
  const keywords = prompt
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
    .slice(0, 6)

  const [projectRecords, executionRecords] = await Promise.all([
    lookupProjectContext(keywords, 6),
    lookupRecentExecutionReceipts(4),
  ])

  const allRecords = [...projectRecords, ...executionRecords]
  const matchedTags = Array.from(
    new Set(allRecords.flatMap((r) => r.tags ?? []).slice(0, 12))
  )

  return {
    projectNotes: projectRecords.map((r) => r.content).slice(0, 4),
    relevantFiles: [],
    matchedTags,
    memoryRecordIds: allRecords.map((r) => r.id),
    contextSummary:
      allRecords.length > 0
        ? `Assembled ${allRecords.length} record${allRecords.length === 1 ? '' : 's'} from project and execution memory.`
        : 'No memory context found for this task.',
    assembledAt: now(),
  }
}

// ── Provider ───────────────────────────────────────────────────────────────

export class BuilderBridgeProvider implements BuilderProvider {
  readonly key = 'builder-skill-provider'
  readonly label = 'Dev Skill Provider'

  async describe(): Promise<ProviderDescriptor<{
    planning: boolean
    executionRequests: boolean
    executionRuns: boolean
    verification: boolean
    runHistory: boolean
    taskDecomposition: boolean
    remediationShaping: boolean
    contextAttachment: boolean
    resultSummaries: boolean
  }>> {
    const taskManager = await loadSkillManifest('agent-task-manager')
    return {
      key: this.key,
      label: this.label,
      capabilities: {
        planning: true,
        executionRequests: true,
        executionRuns: false,
        verification: false,
        runHistory: false,
        taskDecomposition: true,
        remediationShaping: true,
        contextAttachment: true,
        resultSummaries: true,
      },
      health: {
        state: 'degraded',
        detail: `${taskManager.label} selected for queue/orchestration. Structured decomposition, remediation shaping, context attachment, and result summarization active. Execution is dry-run staged only.`,
        missing: ['DRY_RUN', 'execute=false', 'write=false'],
        checkedAt: now(),
      },
    }
  }

  // ── Existing methods ────────────────────────────────────────────────────

  async requestPlan(request: BuilderPlanRequest): Promise<ProviderOperationResult<BuilderPlanResult>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:requestPlan', ['dev_execution'], true)
    if (!gov.allowed) return toOperationResult(gov)
    const stagedActionId = stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: 'Stage dev plan',
      summary: `Dev planning request "${request.taskPrompt}" was staged.`,
      payload: request,
    })

    return stagedBuilderResult<BuilderPlanResult>('builder:requestPlan', 'Dev planning request staged.', undefined, {
      stagedActionId,
      gov,
      notes: ['Builder planning remains staged-only in the current runtime.'],
    })
  }

  async createExecutionRequest(plan: BuilderPlanResult): Promise<ProviderOperationResult<BuilderExecutionRequest>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:createExecution', ['dev_execution'], true)
    if (!gov.allowed) return toOperationResult(gov)
    const stagedActionId = stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: 'Stage execution request',
      summary: `Execution request for plan ${plan.id} was staged.`,
      payload: plan,
    })

    return stagedBuilderResult<BuilderExecutionRequest>('builder:createExecutionRequest', 'Execution request staged.', undefined, {
      stagedActionId,
      gov,
      metadata: { planId: plan.id },
    })
  }

  async settleExecutionRequest(
    request: BuilderExecutionRequest,
    action: BuilderExecutionDecisionAction,
    reason?: string,
  ): Promise<ProviderOperationResult<BuilderExecutionRequest>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:settleExecution', ['dev_execution'], true)
    if (!gov.allowed) return toOperationResult(gov)
    const stagedActionId = stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: `Stage execution request ${action}`,
      summary: `Execution request ${request.id} ${action} action was staged.`,
      payload: { request, action, reason },
    })

    return stagedBuilderResult<BuilderExecutionRequest>('builder:settleExecutionRequest', 'Execution request settlement staged.', undefined, {
      stagedActionId,
      gov,
      metadata: { requestId: request.id, action },
    })
  }

  async startExecution(request: BuilderExecutionRequest): Promise<ProviderOperationResult<BuilderExecutionRun>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:startExecution', ['dev_execution'], true)
    if (!gov.allowed) return toOperationResult(gov)
    const stagedActionId = stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: 'Stage execution start',
      summary: `Execution start for request ${request.id} was staged.`,
      payload: request,
    })

    return stagedBuilderResult<BuilderExecutionRun>('builder:startExecution', 'Execution start staged.', undefined, {
      stagedActionId,
      gov,
      metadata: { requestId: request.id },
      notes: ['Live builder execution remains unwired in the safe runtime.'],
    })
  }

  async finalizeExecution(
    run: BuilderExecutionRun,
    draft: BuilderExecutionFinalizeDraft,
  ): Promise<ProviderOperationResult<BuilderExecutionRun>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:finalizeExecution', ['dev_execution'], true)
    if (!gov.allowed) return toOperationResult(gov)
    const stagedActionId = stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: 'Stage execution finalization',
      summary: `Execution finalization for run ${run.runId} was staged.`,
      payload: { run, draft },
    })

    return stagedBuilderResult<BuilderExecutionRun>('builder:finalizeExecution', 'Execution finalization staged.', undefined, {
      stagedActionId,
      gov,
      metadata: { runId: run.runId },
    })
  }

  async loadHistory(): Promise<ProviderOperationResult<BuilderExecutionHistorySnapshot>> {
    return blockedResult(
      {
        providerKey: this.key,
        action: 'builder:loadHistory',
        notes: ['Canonical Builder history has not been wired into the safe runtime yet.'],
      },
      'Canonical Builder history is unavailable while the safe cross-platform runtime is not yet wired.',
      'unavailable',
      buildProviderFailure(
        'unavailable',
        'builder_history_unavailable',
        'Builder history is unavailable in the current dry-run runtime.',
        false,
      ),
    )
  }

  async verifyRun(runId: string, verificationPrompt?: string): Promise<ProviderOperationResult<CheckerRunVerification>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:verifyRun', ['dev_execution'], false)
    if (!gov.allowed) return toOperationResult(gov)
    const stagedActionId = stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: 'Stage run verification',
      summary: `Verification for run ${runId} was staged.`,
      payload: { runId, verificationPrompt },
    })

    return stagedBuilderResult<CheckerRunVerification>('builder:verifyRun', 'Run verification staged.', undefined, {
      stagedActionId,
      gov,
      metadata: { runId },
    })
  }

  // ── Structured methods (Phase 2+) ─────────────────────────────────────

  async decomposeTask(
    prompt: string,
    context?: BuilderTaskContext,
  ): Promise<ProviderOperationResult<BuilderTaskDecomposition>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:decomposeTask', ['dev_execution'], true)
    if (!gov.allowed) return toOperationResult(gov)

    const resolvedContext = context ?? await assembleContext(prompt)
    const decomposition = decomposePrompt(prompt, resolvedContext)

    const stagedActionId = stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: 'Stage task decomposition',
      summary: `Task "${prompt.slice(0, 60)}" decomposed into ${decomposition.taskCount} subtask${decomposition.taskCount === 1 ? '' : 's'}.`,
      payload: { decomposition, context: resolvedContext },
    })

    return stagedBuilderResult(
      'builder:decomposeTask',
      `Task decomposed into ${decomposition.taskCount} subtask${decomposition.taskCount === 1 ? '' : 's'}.`,
      decomposition,
      {
        stagedActionId,
        gov,
        metadata: { taskCount: decomposition.taskCount, promptLength: prompt.length },
      },
    )
  }

  async shapeFixRequest(
    runId: string,
    errorSummary: string,
    context?: BuilderTaskContext,
  ): Promise<ProviderOperationResult<BuilderRemediationPlan>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:shapeFixRequest', ['dev_execution'], true)
    if (!gov.allowed) return toOperationResult(gov)

    const resolvedContext = context ?? await assembleContext(errorSummary)
    const plan = buildRemediationPlan(runId, errorSummary, resolvedContext)

    const stagedActionId = stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: 'Stage remediation plan',
      summary: `Fix request for run ${runId} shaped as ${plan.kind.replace(/_/g, ' ')} remediation.`,
      payload: { plan, context: resolvedContext },
    })

    return stagedBuilderResult(`builder:shapeFixRequest`, `Remediation plan (${plan.kind}) staged for run ${runId}.`, plan, {
      stagedActionId,
      gov,
      metadata: { runId, kind: plan.kind },
    })
  }

  async attachContext(
    planId: string,
    context: BuilderTaskContext,
  ): Promise<ProviderOperationResult<BuilderContextAttachment>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:attachContext', ['dev_execution'], true)
    if (!gov.allowed) return toOperationResult(gov)

    const attachment: BuilderContextAttachment = {
      id: `ctx_${nanoid()}`,
      planId,
      context,
      memoryRecordsAttached: context.memoryRecordIds.length,
      relevantFilesCount: context.relevantFiles.length,
      attachedAt: now(),
    }

    const stagedActionId = stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: 'Stage context attachment',
      summary: `Context attached to plan ${planId}: ${context.memoryRecordIds.length} memory record${context.memoryRecordIds.length === 1 ? '' : 's'}, ${context.relevantFiles.length} file${context.relevantFiles.length === 1 ? '' : 's'}.`,
      payload: attachment,
    })

    return stagedBuilderResult(
      'builder:attachContext',
      `Context attachment staged for plan ${planId} (${context.memoryRecordIds.length} records, ${context.relevantFiles.length} files).`,
      attachment,
      {
        stagedActionId,
        gov,
        metadata: { planId, memoryRecords: context.memoryRecordIds.length, relevantFiles: context.relevantFiles.length },
      },
    )
  }

  async summarizeResult(run: BuilderExecutionRun): Promise<ProviderOperationResult<BuilderResultSummary>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:summarizeResult', ['dev_execution'], false)
    if (!gov.allowed) return toOperationResult(gov)

    const summary = buildResultSummary(run)

    stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: 'Stage result summary',
      summary: `Run ${run.runId} summarized: ${summary.verdict.toUpperCase()} — ${summary.headline}`,
      payload: summary,
    })

    return successResult(
      {
        providerKey: this.key,
        action: 'builder:summarizeResult',
        auditEntryId: gov.auditEntryId,
        metadata: { runId: run.runId, verdict: summary.verdict },
      },
      `Run ${run.runId} summarized: ${summary.verdict.toUpperCase()}.`,
      summary,
      'readOnlySuccess',
    )
  }

  async createRemediationPlan(
    runId: string,
    prompt: string,
    context?: BuilderTaskContext,
  ): Promise<ProviderOperationResult<BuilderRemediationPlan>> {
    const gov = await enforce('agent-task-manager', this.key, 'builder:createRemediationPlan', ['dev_execution'], true)
    if (!gov.allowed) return toOperationResult(gov)

    const resolvedContext = context ?? await assembleContext(prompt)
    const plan = buildRemediationPlan(runId, prompt, resolvedContext, prompt)

    const stagedActionId = stageAction({
      domain: 'builder',
      providerKey: this.key,
      title: 'Stage full remediation plan',
      summary: `Remediation plan created for run ${runId}: ${plan.steps.length} steps, kind=${plan.kind}.`,
      payload: { plan, context: resolvedContext },
    })

    return stagedBuilderResult(
      'builder:createRemediationPlan',
      `Full remediation plan staged for run ${runId} (${plan.steps.length} steps, ${plan.kind.replace(/_/g, ' ')}).`,
      plan,
      {
        stagedActionId,
        gov,
        metadata: { runId, steps: plan.steps.length, kind: plan.kind },
      },
    )
  }
}
