/**
 * Concierge Agent Bridge
 *
 * Typed interface for calling the five OpenClaw concierge specialist agents
 * from the Jarvis renderer process.
 *
 * Each function:
 *  1. Serialises the structured request as JSON
 *  2. Calls window.electronAPI.openclaw.send with the target agentId
 *  3. Collects streaming tokens from the openclaw:stream IPC channel
 *  4. Parses and returns the final JSON response
 *
 * All calls are serialised through a mutex so concurrent requests don't
 * bleed tokens into each other (the OpenClaw stream has no per-request ID).
 *
 * Agents:
 *   concierge-inbox        — email triage, drafts, extraction
 *   concierge-phone        — call scripts, summaries, assessments
 *   concierge-monitoring   — watch evaluation, alerts
 *   concierge-reservations — booking research, comparison, recommendation
 *   concierge-documents    — field extraction, next steps, form drafts
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InboxTriageResult {
  results: Array<{
    emailId: string
    category: 'urgent' | 'waiting_on_me' | 'newsletter' | 'low_priority'
    extractedTasks: string[]
    extractedEvents: string[]
    draftReply?: string
    confidence: number
    reasoning: string
  }>
  summary: string
  source: 'ai'
}

export interface InboxDraftResult {
  emailId: string
  draftReply: string
  tone: 'professional' | 'warm' | 'brief'
  confidence: number
  source: 'ai'
}

export interface InboxExtractResult {
  emailId: string
  extractedTasks: string[]
  extractedEvents: string[]
  confidence: number
  source: 'ai'
}

export interface PhoneScriptResult {
  callScript: {
    opening: string
    objectives: string[]
    keyPoints: string[]
    closing: string
    estimatedDuration: string
  }
  approvalRequired: true
  riskLevel: 'low' | 'medium' | 'high'
  notes: string
  source: 'ai'
}

export interface PhoneSummaryResult {
  summary: string
  outcomes: string[]
  commitments: string[]
  followUps: string[]
  referenceNumbers: Record<string, string>
  keyDates: string[]
  success: boolean
  confidence: number
  source: 'ai'
}

export interface PhoneAssessResult {
  feasible: boolean
  riskLevel: 'low' | 'medium' | 'high'
  requiredInfo: string[]
  missingInfo: string[]
  recommendation: string
  approvalRequired: true
  source: 'ai'
}

export interface MonitoringHitResult {
  watchId: string
  hitDetected: boolean
  confidence: number
  alertMessage: string
  recommendation: string
  nextCheckSuggestion: string
  source: 'ai'
}

export interface MonitoringSummaryResult {
  summary: string
  triggered: string[]
  pending: string[]
  source: 'ai'
}

export interface ReservationsResearchResult {
  searchCriteria: {
    what: string
    when: string
    partySize?: number
    budget?: string
    mustHave: string[]
    niceToHave: string[]
  }
  suggestedOptions: Array<{ name: string; reason: string }>
  requiresPhoneCall: boolean
  notes: string
  source: 'ai'
}

export interface ReservationsCompareResult {
  rankedOptions: Array<{
    optionId: string
    rank: number
    score: number
    pros: string[]
    cons: string[]
    matchesCriteria: boolean
  }>
  recommendation: { optionId: string; rationale: string }
  requiresPhoneCall: boolean
  phoneInstruction?: string
  source: 'ai'
}

export interface ReservationsRecommendResult {
  topChoice: { optionId: string; name: string; rationale: string }
  alternatives: Array<{ optionId: string; name: string }>
  approvalRequired: true
  bookingMethod: 'phone' | 'online'
  phoneInstruction?: string
  source: 'ai'
}

export interface DocumentsExtractResult {
  documentId?: string
  extractedFields: Record<string, string | boolean | null>
  missingFields: string[]
  confidence: number
  warnings: string[]
  source: 'ai'
}

export interface DocumentsNextStepsResult {
  nextSteps: string[]
  urgency: 'low' | 'medium' | 'high'
  deadlineFlag?: string
  submissionMethod: string
  approvalRequired: boolean
  source: 'ai'
}

export interface DocumentsDraftResult {
  draftContent: string
  filledFields: Record<string, string>
  unfilledFields: string[]
  readyForSubmission: boolean
  warnings: string[]
  reviewFlags?: string[]
  source: 'ai'
}

export interface AgentError {
  error: string
  source: 'ai'
}

// ── Stream collection ─────────────────────────────────────────────────────────

/** Serialised queue so concurrent calls don't bleed stream tokens. */
let _pending: Promise<unknown> = Promise.resolve()

/**
 * Call an OpenClaw agent and return the accumulated response as a parsed JSON
 * object of type T. Rejects if the agent returns an error frame or if JSON
 * parsing fails.
 */
function callAgent<T>(agentId: string, payload: object): Promise<T> {
  const call = (): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const message = JSON.stringify(payload)
      let accumulated = ''
      let settled = false

      const settle = (result: T | null, err?: string) => {
        if (settled) return
        settled = true
        unsub()
        if (err) reject(new Error(err))
        else resolve(result as T)
      }

      const unsub = window.electronAPI.openclaw.onStream((event: StreamEvent) => {
        if (event.type === 'token') {
          accumulated += event.payload
        } else if (event.type === 'end') {
          try {
            const parsed = JSON.parse(accumulated.trim()) as T
            settle(parsed)
          } catch {
            settle(null, `concierge-agent [${agentId}] returned non-JSON: ${accumulated.slice(0, 200)}`)
          }
        } else if (event.type === 'error') {
          settle(null, `concierge-agent [${agentId}] stream error: ${event.payload}`)
        }
      })

      // conversationId: use agentId so each specialist has an isolated session
      window.electronAPI.openclaw
        .send(message, agentId, [], agentId)
        .catch((err: unknown) => {
          settle(null, `IPC error calling [${agentId}]: ${String(err)}`)
        })

      // Safety timeout — 30s per agent call
      const t = setTimeout(() => settle(null, `concierge-agent [${agentId}] timed out`), 30_000)
      const origSettle = settle
      // extend the settle to clear timeout too
      ;(settle as unknown as { _t: ReturnType<typeof setTimeout> })._t = t
      void origSettle // suppress lint
    })

  // Serialise so concurrent calls don't interfere
  const next = _pending.then(() => call(), () => call())
  _pending = next.then(() => undefined, () => undefined)
  return next
}

// ── Inbox agent ───────────────────────────────────────────────────────────────

export const inboxAgent = {
  triage(
    emails: Array<{ id: string; sender: string; subject: string; preview: string; body?: string; receivedAt: string }>,
    currentDate: string,
  ): Promise<InboxTriageResult | AgentError> {
    return callAgent('concierge-inbox', { action: 'triage', emails, context: { currentDate } })
  },

  draftReply(
    email: { id: string; sender: string; subject: string; body: string; category: string },
    currentDate: string,
  ): Promise<InboxDraftResult | AgentError> {
    return callAgent('concierge-inbox', { action: 'draft-reply', email, context: { currentDate } })
  },

  extractItems(
    email: { id: string; subject: string; body: string },
    currentDate: string,
  ): Promise<InboxExtractResult | AgentError> {
    return callAgent('concierge-inbox', { action: 'extract-items', email, context: { currentDate } })
  },
}

// ── Phone agent ───────────────────────────────────────────────────────────────

export const phoneAgent = {
  generateScript(
    contact: string,
    instruction: string,
    mode: 'serious' | 'demo',
    currentDate: string,
    phoneNumber?: string,
    additionalContext?: string,
  ): Promise<PhoneScriptResult | AgentError> {
    return callAgent('concierge-phone', {
      action: 'generate-script',
      contact,
      phoneNumber,
      instruction,
      mode,
      context: { currentDate, callerName: 'Ahmed', additionalContext },
    })
  },

  summarizeCall(
    contact: string,
    transcript: string,
    originalInstruction: string,
    currentDate: string,
  ): Promise<PhoneSummaryResult | AgentError> {
    return callAgent('concierge-phone', {
      action: 'summarize-call',
      contact,
      transcript,
      originalInstruction,
      context: { currentDate },
    })
  },

  assessRequest(
    contact: string,
    instruction: string,
    currentDate: string,
  ): Promise<PhoneAssessResult | AgentError> {
    return callAgent('concierge-phone', {
      action: 'assess-request',
      contact,
      instruction,
      context: { currentDate },
    })
  },
}

// ── Monitoring agent ──────────────────────────────────────────────────────────

export const monitoringAgent = {
  evaluateHit(
    watch: { id: string; type: string; label: string; target: string; criteria?: string },
    checkData: Record<string, unknown>,
    currentDate: string,
  ): Promise<MonitoringHitResult | AgentError> {
    return callAgent('concierge-monitoring', {
      action: 'evaluate-hit',
      watch,
      checkData,
      context: { currentDate },
    })
  },

  summarizeWatches(
    watches: Array<{ id: string; type: string; label: string; lastChecked?: string; lastResult?: string; alertCount: number }>,
    currentDate: string,
  ): Promise<MonitoringSummaryResult | AgentError> {
    return callAgent('concierge-monitoring', {
      action: 'summarize-watches',
      watches,
      context: { currentDate },
    })
  },
}

// ── Reservations agent ────────────────────────────────────────────────────────

export const reservationsAgent = {
  research(
    bookingType: string,
    request: string,
    constraints: Record<string, unknown>,
    currentDate: string,
  ): Promise<ReservationsResearchResult | AgentError> {
    return callAgent('concierge-reservations', {
      action: 'research',
      bookingType,
      request,
      constraints,
      context: { currentDate },
    })
  },

  compare(
    bookingType: string,
    request: string,
    options: Array<{ id: string; name: string; details: string; pros?: string[]; cons?: string[] }>,
    constraints: Record<string, unknown>,
    currentDate: string,
  ): Promise<ReservationsCompareResult | AgentError> {
    return callAgent('concierge-reservations', {
      action: 'compare',
      bookingType,
      request,
      options,
      constraints,
      context: { currentDate },
    })
  },

  recommend(
    bookingType: string,
    shortlist: unknown[],
    currentDate: string,
  ): Promise<ReservationsRecommendResult | AgentError> {
    return callAgent('concierge-reservations', {
      action: 'recommend',
      bookingType,
      shortlist,
      context: { currentDate },
    })
  },
}

// ── Documents agent ───────────────────────────────────────────────────────────

export const documentsAgent = {
  extractFields(
    documentType: string,
    title: string,
    content: string,
    currentDate: string,
  ): Promise<DocumentsExtractResult | AgentError> {
    return callAgent('concierge-documents', {
      action: 'extract-fields',
      documentType,
      title,
      content,
      context: { currentDate },
    })
  },

  inferNextSteps(
    documentType: string,
    title: string,
    extractedFields: Record<string, unknown>,
    status: string,
    currentDate: string,
  ): Promise<DocumentsNextStepsResult | AgentError> {
    return callAgent('concierge-documents', {
      action: 'infer-next-steps',
      documentType,
      title,
      extractedFields,
      status,
      context: { currentDate },
    })
  },

  prepareDraft(
    documentType: string,
    title: string,
    content: string,
    extractedFields: Record<string, unknown>,
    currentDate: string,
  ): Promise<DocumentsDraftResult | AgentError> {
    return callAgent('concierge-documents', {
      action: 'prepare-draft',
      documentType,
      title,
      content,
      extractedFields,
      userInfo: { name: 'Ahmed' },
      context: { currentDate },
    })
  },
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Type guard: check if an agent response is an error. */
export function isAgentError(result: unknown): result is AgentError {
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof (result as AgentError).error === 'string'
  )
}

/** Get today's date as YYYY-MM-DD for agent context. */
export function today(): string {
  return new Date().toISOString().split('T')[0]
}
import type { StreamEvent } from '@/types'
