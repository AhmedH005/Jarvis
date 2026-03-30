import type {
  MemoryRecord,
  MemoryQuery,
  MemoryIngestRequest,
  MemoryWriteResult,
  MemoryStoreReport,
} from '@/shared/memory-types'
import type { BuilderExecutionHistorySnapshot, BuilderExecutionRun } from '@/adapters/builder-execution'
import type {
  BuilderExecutionDecisionAction,
  BuilderExecutionRequest,
} from '@/adapters/builder-execution-request'
import type { BuilderExecutionFinalizeDraft } from '@/adapters/builder-execution'
import type { BuilderPlanRequest, BuilderPlanResult } from '@/adapters/builder-plan'
import type { CheckerRunVerification } from '@/adapters/checker'
import type {
  BuilderTaskContext,
  BuilderTaskDecomposition,
  BuilderRemediationPlan,
  BuilderResultSummary,
  BuilderContextAttachment,
} from '@/shared/builder-action-types'
import type { GmailMessageRecord, GmailSendInput, GmailSendResult } from '@/shared/gmail-bridge'
import type {
  CalendarActionResult,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventPatch,
  CalendarFilter,
  RecurrenceRule,
} from '@/calendar/calendarTypes'
import type { BuilderWorkTarget } from '@/shared/builder-bridge'
import type { RuntimeDiagnostics } from '@/shared/runtime-bridge'
import type { TrackBlueprint } from '@/features/music/types'
import type {
  ActionRecord,
  ProviderContract,
  ProviderDescriptor,
  ProviderOperationResult,
  SharedActionState,
} from './base'

export type OrchestratorDomain =
  | 'direct'
  | 'concierge'
  | 'builder'
  | 'calendar'
  | 'memory'
  | 'media'
  | 'system'
  | 'research'

export type RouteConfidence = 'high' | 'medium' | 'low'

export interface OrchestratorRoute {
  id: string
  domain: OrchestratorDomain
  providerInterface:
    | 'OrchestratorProvider'
    | 'ConciergeProvider'
    | 'BuilderProvider'
    | 'CalendarProvider'
    | 'MemoryProvider'
    | 'MediaProvider'
    | 'RuntimeProvider'
  providerKey: string
  agentId: string
  agentName: string
  actionMode: string
  actionLabel: string
  targetHint: string | null
  targetId: string | null
  focusTarget: BuilderWorkTarget
  rationale: string
  confidence: RouteConfidence
  ambiguous: boolean
  requiresApproval: boolean
  executionState: Extract<SharedActionState, 'suggested' | 'unavailable'>
  fallbackNote: string | null
  unavailableReason?: string | null
}

export interface OrchestratorProvider extends ProviderContract<{
  routeCommands: boolean
  stageActions: boolean
  trackReceipts: boolean
}> {
  routeMission(input: string): OrchestratorRoute
  stageMission(route: OrchestratorRoute, missionText: string): ActionRecord<{ missionText: string }>
}

export interface MailProvider extends ProviderContract<{
  readInbox: boolean
  sendMail: boolean
  threadReplies: boolean
}> {
  fetchRecentMessages(): Promise<ProviderOperationResult<GmailMessageRecord[]>>
  sendMessage(input: GmailSendInput): Promise<ProviderOperationResult<GmailSendResult>>
}

export interface ConciergeProvider extends ProviderContract<{
  inbox: boolean
  phone: boolean
  reservations: boolean
  monitoring: boolean
  documents: boolean
  approvals: boolean
}> {
  approveAction(approvalId: string): Promise<void>
  rejectAction(approvalId: string): Promise<void>
  syncInboxFromGmail(): Promise<ProviderOperationResult<GmailMessageRecord[]>>
  generateDraftReplyForEmail(emailId: string): Promise<ProviderOperationResult<string | null>>
  queueDraftReplyForApproval(emailId: string): Promise<ProviderOperationResult<{ emailId: string }>>
  dispatchOutboundCall(
    contact: string,
    instruction: string,
    mode?: 'serious' | 'demo',
    phoneNumber?: string,
  ): Promise<ProviderOperationResult<{ contact: string }>>
  dispatchBookingRequest(
    type: string,
    request: string,
    constraints?: Record<string, unknown>,
  ): Promise<ProviderOperationResult<{ type: string }>>
}

export interface BuilderProvider extends ProviderContract<{
  planning: boolean
  executionRequests: boolean
  executionRuns: boolean
  verification: boolean
  runHistory: boolean
  taskDecomposition: boolean
  remediationShaping: boolean
  contextAttachment: boolean
  resultSummaries: boolean
}> {
  // ── Existing methods ──────────────────────────────────────────────────────
  requestPlan(request: BuilderPlanRequest): Promise<ProviderOperationResult<BuilderPlanResult>>
  createExecutionRequest(plan: BuilderPlanResult): Promise<ProviderOperationResult<BuilderExecutionRequest>>
  settleExecutionRequest(
    request: BuilderExecutionRequest,
    action: BuilderExecutionDecisionAction,
    reason?: string,
  ): Promise<ProviderOperationResult<BuilderExecutionRequest>>
  startExecution(request: BuilderExecutionRequest): Promise<ProviderOperationResult<BuilderExecutionRun>>
  finalizeExecution(
    run: BuilderExecutionRun,
    draft: BuilderExecutionFinalizeDraft,
  ): Promise<ProviderOperationResult<BuilderExecutionRun>>
  loadHistory(): Promise<ProviderOperationResult<BuilderExecutionHistorySnapshot>>
  verifyRun(runId: string, verificationPrompt?: string): Promise<ProviderOperationResult<CheckerRunVerification>>

  // ── New structured methods ────────────────────────────────────────────────
  /** Break a task prompt into structured subtasks with priorities and dependencies */
  decomposeTask(prompt: string, context?: BuilderTaskContext): Promise<ProviderOperationResult<BuilderTaskDecomposition>>
  /** Transform a failing run + error summary into a structured remediation plan */
  shapeFixRequest(runId: string, errorSummary: string, context?: BuilderTaskContext): Promise<ProviderOperationResult<BuilderRemediationPlan>>
  /** Attach project/memory context to a staged plan */
  attachContext(planId: string, context: BuilderTaskContext): Promise<ProviderOperationResult<BuilderContextAttachment>>
  /** Produce a rich structured summary of a completed execution run */
  summarizeResult(run: BuilderExecutionRun): Promise<ProviderOperationResult<BuilderResultSummary>>
  /** Full remediation plan from run history + memory + explicit prompt */
  createRemediationPlan(runId: string, prompt: string, context?: BuilderTaskContext): Promise<ProviderOperationResult<BuilderRemediationPlan>>
}

export interface CalendarProvider extends ProviderContract<{
  readCalendar: boolean
  writeCalendar: boolean
  recurringEvents: boolean
}> {
  listEvents(filter?: CalendarFilter): Promise<CalendarActionResult<CalendarEvent[]>>
  createEvent(input: CalendarEventInput): Promise<CalendarActionResult<CalendarEvent>>
  updateEvent(id: string, patch: CalendarEventPatch): Promise<CalendarActionResult<CalendarEvent>>
  moveEvent(id: string, newStart: string, newEnd: string): Promise<CalendarActionResult<CalendarEvent>>
  deleteEvent(id: string): Promise<CalendarActionResult<{ id: string }>>
  createRecurringEvents(
    template: CalendarEventInput,
    rule: RecurrenceRule,
  ): Promise<CalendarActionResult<CalendarEvent[]>>
}

export interface ReminderProvider extends ProviderContract<{
  readReminders: boolean
  writeReminders: boolean
}> {}

export interface GroundedMemoryEntry {
  id: string
  scope: 'personal' | 'project' | 'receipt'
  title: string
  body: string
  source: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface MemorySnapshot {
  stateLines: string[]
  recentSummary: string[]
  decisions: string[]
  dailyMemoryExists: boolean
  dailyMemoryPath: string
  personalMemory: GroundedMemoryEntry[]
  projectMemory: GroundedMemoryEntry[]
  operationalReceipts: GroundedMemoryEntry[]
}

export interface MemoryProvider extends ProviderContract<{
  searchMemory: boolean
  writeMemory: boolean
  operationalReceipts: boolean
}> {
  // ── Legacy API (backward-compat) ─────────────────────────────────────────
  snapshot(): Promise<ProviderOperationResult<MemorySnapshot>>
  search(query: string): Promise<ProviderOperationResult<GroundedMemoryEntry[]>>
  write(
    scope: 'personal' | 'project',
    title: string,
    body: string,
    source: string,
  ): Promise<ProviderOperationResult<GroundedMemoryEntry>>

  // ── Structured API (new) ─────────────────────────────────────────────────
  /** Query records with domain/tag/freetext filters */
  query(filter: MemoryQuery): Promise<ProviderOperationResult<MemoryRecord[]>>
  /** Retrieve a single record by id */
  getById(id: string): Promise<ProviderOperationResult<MemoryRecord | null>>
  /** Ingest a new record (staged under DRY_RUN) */
  ingest(request: MemoryIngestRequest): Promise<ProviderOperationResult<MemoryWriteResult>>
  /** Get a summary of the store state for diagnostics */
  storeReport(): Promise<ProviderOperationResult<MemoryStoreReport>>
}

export interface SpeechProvider extends ProviderContract<{
  tts: boolean
  stt: boolean
  nativeFallback: boolean
}> {
  speak(text: string): Promise<ProviderOperationResult<{ provider: string }>>
}

export interface MediaGenerationData {
  audioUrl: string
  mimeType: string
  bytes: number
  prompt: string
  blueprint?: TrackBlueprint
}

export interface MediaProvider extends ProviderContract<{
  generateAudio: boolean
}> {
  generateTrack(
    prompt: string,
    blueprint?: TrackBlueprint,
  ): Promise<ProviderOperationResult<MediaGenerationData>>
}

export interface RuntimeSnapshot {
  checkedAt: string
  diagnostics: RuntimeDiagnostics | null
  providers: {
    orchestrator: ProviderDescriptor
    mail: ProviderDescriptor
    concierge: ProviderDescriptor
    builder: ProviderDescriptor
    calendar: ProviderDescriptor
    reminder: ProviderDescriptor
    memory: ProviderDescriptor
    speech: ProviderDescriptor
    media: ProviderDescriptor
  }
  issues: string[]
  systemStateLines: string[]
}

export interface RuntimeProvider extends ProviderContract<{
  diagnostics: boolean
  providerHealth: boolean
}> {
  getSnapshot(): Promise<RuntimeSnapshot>
}
