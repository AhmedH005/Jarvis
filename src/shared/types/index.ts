/**
 * Shared TypeScript contracts mirroring the jarvis-system backend schemas.
 * These are direct TypeScript equivalents of:
 *   - schemas/handoff-schema.md
 *   - schemas/decision-schema.md
 *   - schemas/module-state-schema.md
 *   - shared/world-state.md
 *   - shared/constraints.md
 */

// ── Module identity ────────────────────────────────────────────────────────────

export type ModuleId =
  | 'jarvis-prime'
  | 'research'
  | 'memory'
  | 'system'
  | 'calendar'
  | 'health'
  | 'mental'
  | 'execution'

export type ModuleStatus = 'live' | 'partial' | 'defined-only' | 'blocked'

export type Priority = 'low' | 'normal' | 'high' | 'urgent'

export type Confidence = 'low' | 'medium' | 'high'

// ── Module state ───────────────────────────────────────────────────────────────

/** Mirrors schemas/module-state-schema.md */
export interface ModuleState {
  module: ModuleId
  status: ModuleStatus
  ownedDomain: string[]
  currentConstraints: string[]
  blockedCapabilities: string[]
  lastUpdated: string       // ISO timestamp
  notes: string
}

// ── Constraints ────────────────────────────────────────────────────────────────

/** Mirrors shared/constraints.md constraint categories */
export interface HandoffConstraints {
  timeBudget?:    string   // e.g. "30 minutes", "2 hours"
  deadline?:      string   // ISO timestamp or human label
  energyCost?:    'low' | 'medium' | 'high'
  stressImpact?:  'low' | 'medium' | 'high'
  blockers?:      string[]
}

/** Platform / safety / user-preference constraint from shared/constraints.md */
export interface Constraint {
  id:       string
  category: 'platform' | 'safety' | 'user'
  rule:     string
  scope:    ModuleId[]   // which modules this applies to; empty = global
}

// ── Handoff ────────────────────────────────────────────────────────────────────

/** Mirrors schemas/handoff-schema.md */
export interface Handoff {
  handoffId:          string
  fromModule:         ModuleId
  toModule:           ModuleId
  intent:             string
  summary:            string
  requestedAction:    string
  constraints:        HandoffConstraints
  priority:           Priority
  confidence:         Confidence
  sourceRefs:         string[]
  needsUserApproval:  boolean
  notes?:             string
  /** Internal tracking — set by HandoffBus */
  status:             'pending' | 'accepted' | 'rejected' | 'completed'
  createdAt:          string   // ISO timestamp
}

// ── Decision ───────────────────────────────────────────────────────────────────

/** Mirrors schemas/decision-schema.md */
export interface Decision {
  decisionId:      string
  timestamp:       string        // ISO
  owner:           ModuleId | 'jarvis-prime'
  summary:         string
  accepted:        boolean
  reason:          string
  sourceRefs:      string[]
  impactedDomains: string[]
  followUp?:       string
}

// ── Approval ───────────────────────────────────────────────────────────────────

/** Mirrors orchestrator/approval-model.md */
export interface ApprovalRequest {
  approvalId:      string
  requestedBy:     ModuleId
  intent:          string
  scope:           string[]      // files, domains, or systems affected
  plan:            string        // human-readable plan description
  expectedOutcome: string
  rollback:        string        // how to undo if wrong
  priority:        Priority
  createdAt:       string        // ISO
}

export interface ApprovalResult {
  approvalId: string
  approved:   boolean
  reason?:    string
  decidedAt:  string            // ISO
}

// ── Module result ──────────────────────────────────────────────────────────────

/** Standardized output from any module handler */
export interface ModuleResult<T = unknown> {
  moduleId:            ModuleId
  success:             boolean
  data?:               T
  error?:              string
  blockedCapabilities: string[]   // capabilities that were unavailable
  handoffs:            Handoff[]  // follow-up handoffs this module wants to send
  decisions:           Decision[] // decisions this module logged
}

// ── World state ────────────────────────────────────────────────────────────────

/**
 * Cross-module shared state — mirrors shared/world-state.md.
 * This is the single source of truth that jarvis-prime reads before routing.
 */
export interface WorldState {
  identity: {
    name:      string
    timezone:  string
    locale:    string
  }
  operations: {
    activeModules:   ModuleId[]
    blockedModules:  ModuleId[]
    pendingHandoffs: Handoff[]
    pendingApprovals: ApprovalRequest[]
  }
  scheduleIntent: {
    /** Blocks of time requested by health / mental but not yet placed in calendar */
    pendingBlocks: ScheduleBlock[]
    /** Last known calendar state summary (calendar is defined-only) */
    lastKnownSchedule: string
  }
  healthPlan: {
    currentFocus:    string
    activeSessions:  string[]   // e.g. ['strength', 'mobility']
    constraints:     string[]
  }
  mentalState: {
    overloadFlag:   boolean
    bufferNeeded:   boolean
    currentMode:    'normal' | 'deep-work' | 'recovery' | 'reactive'
    notes:          string
  }
  memoryContext: {
    /** Most recent memory snippets retrieved for current conversation */
    recentSnippets: MemorySnippet[]
  }
  executionQueue: ApprovalRequest[]
  moduleStates:   Record<ModuleId, ModuleState>
}

// ── Supporting value objects ───────────────────────────────────────────────────

export interface ScheduleBlock {
  label:       string
  duration:    string    // e.g. "45 minutes"
  preferredAt: string    // time-of-day hint or ISO
  source:      ModuleId  // which module requested this block
  energyCost:  'low' | 'medium' | 'high'
  constraints: HandoffConstraints
}

export interface MemorySnippet {
  key:       string
  value:     string
  source:    string    // file path or tool that produced this
  relevance: Confidence
}

// ── Router decision ────────────────────────────────────────────────────────────

/** What jarvis-prime's router returns for each incoming request */
export interface RouteDecision {
  primary:     ModuleId | 'direct'
  secondaries: ModuleId[]   // additional modules to consult
  reason:      string
  requiresApproval: boolean
}

// ── Orchestrator context ───────────────────────────────────────────────────────

/** Everything jarvis-prime passes to a module when delegating */
export interface OrchestrationContext {
  requestId:    string
  userMessage:  string
  worldState:   WorldState
  constraints:  Constraint[]
  history:      Array<{ role: 'user' | 'assistant'; content: string }>
}
