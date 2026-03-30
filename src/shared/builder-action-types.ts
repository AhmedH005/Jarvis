/**
 * Typed builder action model.
 *
 * These types represent the structured inputs and outputs for all
 * BuilderProvider actions — from planning to decomposition to remediation.
 *
 * All outputs are staged under DRY_RUN; none reach the bridge until
 * safety flags change and explicit approval is given.
 */

// ── Action type discriminant ───────────────────────────────────────────────

export type BuilderActionType =
  | 'plan_work'
  | 'decompose_task'
  | 'shape_fix_request'
  | 'stage_execution'
  | 'summarize_result'
  | 'attach_context'
  | 'create_remediation_plan'

// ── Context ────────────────────────────────────────────────────────────────

/**
 * Contextual information attached to a builder action.
 * Assembled from memory hooks + project state before staging.
 */
export interface BuilderTaskContext {
  /** Free-text project notes or architecture constraints */
  projectNotes: string[]
  /** File paths believed to be relevant */
  relevantFiles: string[]
  /** Tags that influenced context selection */
  matchedTags: string[]
  /** IDs of memory records used to build this context */
  memoryRecordIds: string[]
  /** Short summary of the context selection rationale */
  contextSummary: string
  /** ISO timestamp when context was assembled */
  assembledAt: string
}

// ── Task decomposition ─────────────────────────────────────────────────────

export interface BuilderSubtask {
  id: string
  /** Short imperative description: "Add validation to form handler" */
  label: string
  /** Likely files affected */
  likelyFiles: string[]
  /** Estimated relative complexity */
  complexity: 'low' | 'medium' | 'high'
  /** IDs of subtasks this depends on */
  dependsOn: string[]
  /** Priority rank (1 = highest) */
  priority: number
}

export interface BuilderTaskDecomposition {
  id: string
  sourcePrompt: string
  subtasks: BuilderSubtask[]
  /** Total subtask count */
  taskCount: number
  /** High-level rationale for the decomposition */
  decompositionSummary: string
  /** Context used during decomposition, if any */
  contextAttached: boolean
  createdAt: string
}

// ── Remediation plan ───────────────────────────────────────────────────────

export type BuilderRemediationKind =
  | 'fix_failing_test'
  | 'fix_type_error'
  | 'fix_runtime_error'
  | 'fix_build_failure'
  | 'fix_logic_error'
  | 'address_review_feedback'
  | 'general_remediation'

export interface BuilderRemediationStep {
  stepId: string
  /** Description of what needs to change */
  action: string
  /** Files to modify */
  targetFiles: string[]
  /** Why this step is needed */
  rationale: string
}

export interface BuilderRemediationPlan {
  id: string
  /** The run ID that triggered this remediation */
  sourceRunId: string
  kind: BuilderRemediationKind
  /** One-line problem statement */
  problemStatement: string
  /** Ordered remediation steps */
  steps: BuilderRemediationStep[]
  /** Files most likely to need changes */
  affectedFiles: string[]
  /** Suggested verification command or check */
  verificationSuggestion: string
  /** Context used during shaping, if any */
  contextAttached: boolean
  createdAt: string
}

// ── Result summary ─────────────────────────────────────────────────────────

export type BuilderResultVerdict =
  | 'success'
  | 'partial'
  | 'failed'
  | 'blocked'
  | 'unknown'

export interface BuilderResultSummary {
  id: string
  runId: string
  verdict: BuilderResultVerdict
  /** One-line summary of what happened */
  headline: string
  /** Files that were changed */
  filesChanged: string[]
  /** Commands that were run */
  commandsRun: string[]
  /** Verification status and detail */
  verificationStatus: string
  verificationDetail: string
  /** What should happen next */
  nextStepRecommendation: string
  /** Governance outcome logged for this run */
  governanceOutcome: string
  createdAt: string
}

// ── Context attachment ─────────────────────────────────────────────────────

export interface BuilderContextAttachment {
  id: string
  planId: string
  context: BuilderTaskContext
  /** How many memory records were attached */
  memoryRecordsAttached: number
  /** How many relevant files identified */
  relevantFilesCount: number
  attachedAt: string
}
