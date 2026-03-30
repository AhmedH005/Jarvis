import { nanoid } from '@/lib/utils'
import type { BuilderExecutionRun } from '@/adapters/builder-execution'
import type {
  BuilderTaskContext,
  BuilderTaskDecomposition,
  BuilderRemediationPlan,
  BuilderRemediationKind,
  BuilderResultSummary,
  BuilderResultVerdict,
} from '@/shared/builder-action-types'

function now(): string {
  return new Date().toISOString()
}

export function decomposePrompt(prompt: string, context: BuilderTaskContext): BuilderTaskDecomposition {
  const sentences = prompt
    .split(/[.;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10)

  const subtasks = sentences.slice(0, 6).map((sentence, index) => ({
    id: `subtask_${index + 1}`,
    label: sentence.length > 80 ? sentence.slice(0, 77) + '…' : sentence,
    likelyFiles: context.relevantFiles.slice(0, 3),
    complexity: (
      sentence.length > 60 ? 'medium'
      : index === 0 ? 'high'
      : 'low'
    ) as 'low' | 'medium' | 'high',
    dependsOn: index > 0 ? [`subtask_${index}`] : [],
    priority: index + 1,
  }))

  if (subtasks.length === 0) {
    subtasks.push({
      id: 'subtask_1',
      label: prompt.slice(0, 80),
      likelyFiles: context.relevantFiles,
      complexity: 'medium',
      dependsOn: [],
      priority: 1,
    })
  }

  return {
    id: `decomp_${nanoid()}`,
    sourcePrompt: prompt,
    subtasks,
    taskCount: subtasks.length,
    decompositionSummary: `Decomposed into ${subtasks.length} structured subtask${subtasks.length === 1 ? '' : 's'}.${context.memoryRecordIds.length > 0 ? ` ${context.memoryRecordIds.length} memory record${context.memoryRecordIds.length === 1 ? '' : 's'} attached as context.` : ''}`,
    contextAttached: context.memoryRecordIds.length > 0,
    createdAt: now(),
  }
}

export function inferRemediationKind(errorSummary: string): BuilderRemediationKind {
  const lower = errorSummary.toLowerCase()
  if (lower.includes('type') || lower.includes('ts') || lower.includes('typescript')) return 'fix_type_error'
  if (lower.includes('test') || lower.includes('spec') || lower.includes('jest') || lower.includes('vitest')) return 'fix_failing_test'
  if (lower.includes('build') || lower.includes('compile') || lower.includes('bundle')) return 'fix_build_failure'
  if (lower.includes('runtime') || lower.includes('exception') || lower.includes('crash') || lower.includes('uncaught')) return 'fix_runtime_error'
  if (lower.includes('review') || lower.includes('feedback') || lower.includes('pr') || lower.includes('comment')) return 'address_review_feedback'
  if (lower.includes('logic') || lower.includes('wrong') || lower.includes('incorrect') || lower.includes('expected')) return 'fix_logic_error'
  return 'general_remediation'
}

export function buildRemediationPlan(
  runId: string,
  errorSummary: string,
  context: BuilderTaskContext,
  prompt?: string,
): BuilderRemediationPlan {
  const kind = inferRemediationKind(errorSummary)

  const problemStatement =
    errorSummary.length > 120 ? errorSummary.slice(0, 117) + '…' : errorSummary

  const steps = [
    {
      stepId: 'step_1',
      action: `Investigate root cause: ${problemStatement}`,
      targetFiles: context.relevantFiles.slice(0, 2),
      rationale: 'Understand what went wrong before making changes',
    },
    {
      stepId: 'step_2',
      action: prompt
        ? `Apply targeted fix: ${prompt.slice(0, 100)}`
        : `Fix the identified root cause of the ${kind.replace(/_/g, ' ')}`,
      targetFiles: context.relevantFiles,
      rationale: 'Directly address the failure',
    },
    {
      stepId: 'step_3',
      action: 'Verify the fix resolves the original failure without introducing regressions',
      targetFiles: [],
      rationale: 'Confirm the remediation is complete',
    },
  ]

  const verificationSuggestion =
    kind === 'fix_failing_test' || kind === 'fix_type_error' || kind === 'fix_build_failure'
      ? 'Run `npm run typecheck && npm run build` to verify'
      : 'Re-run the failing scenario and confirm expected behavior'

  return {
    id: `remediation_${nanoid()}`,
    sourceRunId: runId,
    kind,
    problemStatement,
    steps,
    affectedFiles: context.relevantFiles,
    verificationSuggestion,
    contextAttached: context.memoryRecordIds.length > 0,
    createdAt: now(),
  }
}

export function inferVerdict(run: BuilderExecutionRun): BuilderResultVerdict {
  if (run.executionState === 'completed') {
    if (run.verificationStatus === 'passed') return 'success'
    if (run.verificationStatus === 'failed') return 'partial'
    return 'success'
  }
  if (run.executionState === 'failed') return 'failed'
  if (run.executionState === 'blocked') return 'blocked'
  if (run.executionState === 'started') return 'partial'
  return 'unknown'
}

export function buildResultSummary(run: BuilderExecutionRun): BuilderResultSummary {
  const verdict = inferVerdict(run)

  const headline =
    verdict === 'success'
      ? `Run completed successfully — ${run.filesChanged.length} file${run.filesChanged.length === 1 ? '' : 's'} changed.`
      : verdict === 'partial'
      ? `Run finished but verification ${run.verificationStatus === 'failed' ? 'failed' : 'was not completed'}.`
      : verdict === 'failed'
      ? `Run failed: ${run.summary || 'no summary available'}`
      : verdict === 'blocked'
      ? `Run was blocked before execution started.`
      : `Run state is unknown or still in progress.`

  const nextStep =
    verdict === 'success'
      ? 'Review changed files, then finalize the execution request.'
      : verdict === 'partial'
      ? 'Investigate verification failure, then shape a remediation plan.'
      : verdict === 'failed'
      ? 'Use shapeFixRequest() to produce a structured remediation plan.'
      : verdict === 'blocked'
      ? 'Check governance and capability settings, then retry.'
      : 'Check run status and retry if appropriate.'

  return {
    id: `summary_${nanoid()}`,
    runId: run.runId,
    verdict,
    headline,
    filesChanged: run.filesChanged,
    commandsRun: run.commandsRun,
    verificationStatus: run.verificationStatus,
    verificationDetail: run.verificationSummary ?? '',
    nextStepRecommendation: nextStep,
    governanceOutcome: 'allowed_to_stage',
    createdAt: now(),
  }
}
