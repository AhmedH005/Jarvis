/**
 * Concierge Orchestrator
 *
 * The single control surface for the Concierge system.
 *
 * Architecture:
 *   - Classifies incoming commands and dispatches to the right OpenClaw specialist agent
 *   - Collects structured agent results and applies them to the Zustand store via workers
 *   - Routes approval-required actions into the approval queue
 *   - Logs all activity consistently
 *
 * Five OpenClaw specialist agents (dispatched via conciergeAgentBridge):
 *   concierge-inbox         — email triage, drafts, extraction
 *   concierge-phone         — call scripts, summaries, assessments
 *   concierge-monitoring    — watch evaluation, alerts
 *   concierge-reservations  — booking research, comparison, recommendation
 *   concierge-documents     — field extraction, next steps, form drafts
 *
 * Global safety rules (enforced here, not in workers):
 *   ✗ no silent sending
 *   ✗ no silent calling
 *   ✗ no silent booking
 *   ✗ no silent submission
 *   ✗ no silent spending
 *
 * Read-only scans and summaries run automatically.
 * Anything risky must enter the approval queue and be explicitly approved.
 */

import { useConciergeStore } from '@/store/concierge'
import {
  triageInbox,
  markEmailRead,
  queueOutgoingMessage,
  fetchRecentInboxMessages,
  sendOutgoingMessage,
  storeDraftReply,
  queueDraftReply,
  buildFallbackDraftReply,
} from './workers/inboxWorker'
import {
  setConciergeNumber,
  queueOutboundCall,
  executeOutboundCall,
  completeOutboundCall,
  queueReservationCall,
} from './workers/phoneWorker'
import { addWatch, removeWatch, checkAllWatches, recordCheckResult } from './workers/monitoringWorker'
import {
  applyBookingPreferenceUpdate,
  buildPhoneHandoff,
  createBookingRequest,
  generateBookingOptions,
  setBookingOptions,
  selectAndQueueBooking,
  confirmBooking,
} from './workers/reservationsWorker'
import { ingestDocument, prepareDraft, queueSubmission } from './workers/documentsWorker'
import {
  inboxAgent,
  phoneAgent,
  monitoringAgent,
  reservationsAgent,
  documentsAgent,
  isAgentError,
  today,
} from './conciergeAgentBridge'
import type { BookingOption, BookingType, WatchType, DocumentType, InboxEmail } from './conciergeTypes'

export type { BookingOption, BookingType, WatchType, DocumentType }

// ── Re-export workers for direct access from UI ───────────────────────────────

export {
  triageInbox,
  markEmailRead,
  queueOutgoingMessage,
  fetchRecentInboxMessages,
  setConciergeNumber,
  queueOutboundCall,
  executeOutboundCall,
  completeOutboundCall,
  addWatch,
  removeWatch,
  checkAllWatches,
  recordCheckResult,
  createBookingRequest,
  setBookingOptions,
  selectAndQueueBooking,
  confirmBooking,
  ingestDocument,
  prepareDraft,
  queueSubmission,
}

// ── Approval flow ─────────────────────────────────────────────────────────────

/**
 * Approve an action from the approval queue.
 * The orchestrator routes execution based on the actionRef.
 */
export function approveAction(approvalId: string): void {
  const store = useConciergeStore.getState()
  const approval = store.approvalQueue.find((a) => a.id === approvalId)
  if (!approval || approval.status !== 'pending') return

  store.resolveApproval(approvalId, 'approved')
  store.logActivity(approval.workerId, `Approved: ${approval.title}`, 'success')

  _executeApprovedAction(approval.actionRef, approval.payload)
}

/**
 * Reject an action — permanently blocks this specific action.
 */
export function rejectAction(approvalId: string): void {
  const store = useConciergeStore.getState()
  const approval = store.approvalQueue.find((a) => a.id === approvalId)
  if (!approval || approval.status !== 'pending') return

  store.resolveApproval(approvalId, 'rejected')
  store.logActivity(approval.workerId, `Rejected: ${approval.title}`, 'info')

  _rejectSourceEntity(approval.actionRef)
}

// ── Action routing (internal) ─────────────────────────────────────────────────

function _executeApprovedAction(actionRef: string, payload?: unknown): void {
  const parts  = actionRef.split(':')
  const worker = parts[0]
  const action = parts[1]
  const args   = parts.slice(2)

  if (worker === 'inbox' && action === 'send-message') {
    const msgId = args[0]
    if (!msgId) return
    void sendOutgoingMessage(msgId)
  }

  if (worker === 'phone' && action === 'dial') {
    const reqId = args[0]
    if (!reqId) return
    void executeOutboundCall(reqId)  // async — fire and forget; status updates via phone:callUpdate
  }

  if (worker === 'reservations' && (action === 'execute' || action === 'call-restaurant')) {
    const requestId = args[0]
    const optionId  = args[1]
    if (!requestId || !optionId) return
    const handoff = buildPhoneHandoff(requestId, optionId)
    if (!handoff) return

    const queueAndDial = async () => {
      try {
        const scriptResult = await phoneAgent.generateScript(
          handoff.targetBusiness,
          handoff.reservationObjective,
          'serious',
          today(),
          handoff.phoneNumber,
          handoff.specialNotes,
        )
        const callReq = await queueReservationCall(
          handoff,
          isAgentError(scriptResult) ? undefined : scriptResult.callScript,
        )
        await executeOutboundCall(callReq.id)
      } catch {
        const callReq = await queueReservationCall(handoff)
        await executeOutboundCall(callReq.id)
      }
    }

    void queueAndDial()
  }

  if (worker === 'documents' && action === 'submit') {
    const docId = args[0]
    if (!docId) return
    useConciergeStore.getState().updateDocument(docId, { status: 'submitted' })
    useConciergeStore.getState().logActivity('documents', 'Document submitted', 'success')
    // TODO: window.electronAPI?.documents?.submit(docId)
  }
}

function _rejectSourceEntity(actionRef: string): void {
  const parts  = actionRef.split(':')
  const worker = parts[0]
  const action = parts[1]
  const args   = parts.slice(2)
  const store  = useConciergeStore.getState()

  if (worker === 'inbox' && action === 'send-message' && args[0]) {
    store.updateOutgoingMessage(args[0], { status: 'rejected' })
  }
  if (worker === 'phone' && action === 'dial' && args[0]) {
    store.updateOutboundRequest(args[0], { status: 'rejected' })
  }
  if (worker === 'reservations' && (action === 'execute' || action === 'call-restaurant') && args[0]) {
    store.updateBookingRequest(args[0], { status: 'failed', notes: 'Rejected by user' })
  }
  if (worker === 'documents' && action === 'submit' && args[0]) {
    store.updateDocument(args[0], { status: 'reviewed' })
  }
}

// ── OpenClaw-powered dispatch ─────────────────────────────────────────────────

/**
 * AI-powered inbox triage via concierge-inbox agent.
 * Falls back to local heuristics if OpenClaw is unavailable.
 */
export async function dispatchInboxTriage(
  emails: Array<{ id: string; sender: string; subject: string; preview: string; body?: string; receivedAt: string; threadId?: string; senderEmail?: string }>
): Promise<void> {
  const store = useConciergeStore.getState()
  store.setWorkerStatus('inbox', 'running')

  try {
    const result = await inboxAgent.triage(emails, today())

    if (isAgentError(result)) {
      // Fall back to local heuristics
      store.logActivity('inbox', 'AI triage unavailable — using local classifier', 'info')
      triageInbox(emails)
      return
    }

    const mappedEmails: InboxEmail[] = result.results.flatMap((r) => {
      const raw = emails.find((e) => e.id === r.emailId)
      if (!raw) return []
      const fullText = `${raw.subject} ${raw.body ?? raw.preview}`
      return [{
        ...raw,
        body: raw.body ?? raw.preview,
        senderEmail: raw.senderEmail ?? raw.sender.match(/<([^>]+)>/)?.[1],
        threadId: raw.threadId ?? raw.id,
        category: r.category,
        extractedTasks: r.extractedTasks,
        extractedEvents: r.extractedEvents,
        draftReply: r.draftReply,
        replyNeeded: r.category === 'urgent' || r.category === 'waiting_on_me',
        followUpCandidate: r.category === 'waiting_on_me' || /follow up|circle back|reminder/i.test(fullText),
        read: false,
      }]
    })

    store.setEmails(mappedEmails)

    store.setWorkerStatus('inbox', 'idle')
    store.logActivity('inbox', `AI triage complete — ${result.summary}`, 'success')
  } catch {
    // Fallback
    triageInbox(emails)
  }
}

/**
 * AI-powered draft reply via concierge-inbox agent.
 */
export async function dispatchDraftReply(
  email: { id: string; sender: string; subject: string; body: string; category: string }
): Promise<string | null> {
  try {
    const result = await inboxAgent.draftReply(email, today())
    if (isAgentError(result)) return null
    return result.draftReply
  } catch {
    return null
  }
}

export async function syncInboxFromGmail(): Promise<void> {
  const messages = await fetchRecentInboxMessages()
  if (messages.length === 0) return
  await dispatchInboxTriage(messages)
}

export async function generateDraftReplyForEmail(emailId: string): Promise<string | null> {
  const store = useConciergeStore.getState()
  const email = store.emails.find((item) => item.id === emailId)
  if (!email) return null

  store.setWorkerStatus('inbox', 'running')

  try {
    const draft =
      await dispatchDraftReply({
        id: email.id,
        sender: email.sender,
        subject: email.subject,
        body: email.body ?? email.preview,
        category: email.category,
      })

    const finalDraft = draft ?? email.draftReply ?? buildFallbackDraftReply(email)
    storeDraftReply(emailId, finalDraft)
    store.setWorkerStatus('inbox', 'idle')
    return finalDraft
  } catch {
    const fallbackDraft = email.draftReply ?? buildFallbackDraftReply(email)
    storeDraftReply(emailId, fallbackDraft)
    store.setWorkerStatus('inbox', 'idle')
    return fallbackDraft
  }
}

export function queueDraftReplyForApproval(emailId: string): void {
  const store = useConciergeStore.getState()
  const queued = queueDraftReply(emailId)
  if (!queued) {
    store.logActivity('inbox', 'Draft queue failed', 'failed', 'No draft reply exists for this email yet.')
  }
}

/**
 * Queue an outbound call — generates AI call script first, then queues for approval.
 */
export async function dispatchOutboundCall(
  contact: string,
  instruction: string,
  mode: 'serious' | 'demo' = 'serious',
  phoneNumber?: string,
): Promise<void> {
  const store = useConciergeStore.getState()

  try {
    const result = await phoneAgent.generateScript(contact, instruction, mode, today(), phoneNumber)

    if (isAgentError(result)) {
      // Fall back to basic queue without AI script
      queueOutboundCall(contact, phoneNumber, instruction, mode)
      store.logActivity('phone', 'Queued call (no AI script — fallback)', 'info')
      return
    }

    // Queue with the full AI-generated call script
    const callObjective = result.callScript.objectives[0] ?? instruction
    queueOutboundCall(contact, phoneNumber, instruction, mode, callObjective, result.callScript)
    store.logActivity(
      'phone',
      `Call script generated for ${contact} — queued for approval`,
      'pending',
      `Risk: ${result.riskLevel} · Est. ${result.callScript.estimatedDuration}`,
    )
  } catch {
    queueOutboundCall(contact, phoneNumber, instruction, mode)
  }
}

/**
 * Start a booking request with AI research guidance.
 */
export async function dispatchBookingRequest(
  type: BookingType,
  request: string,
  constraints: Record<string, unknown> = {},
): Promise<void> {
  const store = useConciergeStore.getState()
  const req = createBookingRequest(type, request, type === 'restaurant')
  const reqId = req.id

  store.logActivity('reservations', `Booking request created — researching ${type} options`, 'info')

  try {
    const result = await reservationsAgent.research(type, request, constraints, today())
    const options: BookingOption[] = isAgentError(result)
      ? generateBookingOptions(reqId)
      : generateBookingOptions(reqId, result.suggestedOptions)

    if (options.length > 0) {
      setBookingOptions(reqId, options)
      store.logActivity(
        'reservations',
        `${options.length} options ready for review`,
        'success',
        isAgentError(result) ? 'Fallback shortlist generated locally.' : result.notes,
      )
    }
  } catch {
    const options = generateBookingOptions(reqId)
    if (options.length > 0) {
      setBookingOptions(reqId, options)
      store.logActivity('reservations', `${options.length} fallback options ready for review`, 'info')
    }
  }
}

/**
 * Evaluate a watch hit using the monitoring agent.
 */
export async function dispatchWatchEvaluation(
  watchId: string,
  checkData: Record<string, unknown>,
): Promise<void> {
  const store = useConciergeStore.getState()
  const watch = store.watches.find((w) => w.id === watchId)
  if (!watch) return

  try {
    const result = await monitoringAgent.evaluateHit(
      { id: watch.id, type: watch.type, label: watch.label, target: watch.target },
      checkData,
      today(),
    )

    if (isAgentError(result)) return

    recordCheckResult(watchId, result.alertMessage, result.hitDetected)

    if (result.hitDetected) {
      store.logActivity(
        'monitoring',
        `Watch triggered: ${watch.label}`,
        'success',
        result.alertMessage,
      )
    }
  } catch {
    // silent — monitoring is best-effort
  }
}

/**
 * Process a document with AI field extraction.
 */
export async function dispatchDocumentIngestion(
  docId: string,
  type: DocumentType,
  title: string,
  content: string,
): Promise<void> {
  const store = useConciergeStore.getState()

  try {
    const result = await documentsAgent.extractFields(type, title, content, today())
    if (isAgentError(result)) return

    // Update the document with AI-extracted fields
    store.updateDocument(docId, {
      extractedFields: result.extractedFields as Record<string, string>,
      status: 'processing',
    })

    store.logActivity(
      'documents',
      `Fields extracted from "${title}"`,
      'success',
      `${Object.keys(result.extractedFields).length} fields — ${result.warnings.length} warnings`,
    )

    // Infer next steps
    const nextStepsResult = await documentsAgent.inferNextSteps(
      type,
      title,
      result.extractedFields,
      'ingested',
      today(),
    )

    if (!isAgentError(nextStepsResult)) {
      store.updateDocument(docId, {
        nextSteps: nextStepsResult.nextSteps,
      })
    }
  } catch {
    // silent — document was already ingested by local worker
  }
}

// ── Natural-language command parsing ─────────────────────────────────────────

export interface ConciergeCommandResult {
  handled: boolean
  reply: string
  worker?: string
}

/**
 * Parse a user command and route it to the right OpenClaw specialist agent.
 * Falls back to local heuristics for simple patterns when OpenClaw is busy.
 */
export function handleConciergeCommand(input: string): ConciergeCommandResult {
  const text = input.toLowerCase()

  if (/^call\s+this\s+hotel/i.test(text) || (/^call\s+.+\s+and\s+ask/i.test(text) && /(hotel|room|checkout|suite)/i.test(text))) {
    void dispatchBookingRequest('hotel', input, {})
    return {
      handled: true,
      reply: `Hotel inquiry captured. I’ll prepare the booking brief, surface the call target, and queue the phone action for approval before anything is dialed.`,
      worker: 'reservations',
    }
  }

  // ── Phone commands ────────────────────────────────────────────────────────
  if (/call\s+.+\s+and\s+(say|ask|tell|book|reserve)/i.test(input)) {
    const match = input.match(/call\s+(.+?)\s+and\s+(.+)/i)
    if (match) {
      const [, contact, instruction] = match
      // Async — generate AI script in background, then queue
      void dispatchOutboundCall(contact.trim(), instruction.trim(), 'serious')
      return {
        handled: true,
        reply: `Generating call script for **${contact.trim()}** and queuing for your approval. Check the Phone section.`,
        worker: 'phone',
      }
    }
  }

  // "ask X if/whether/about Y" → phone
  if (/^ask\s+(.+?)\s+(if|whether|about|for)\s+/i.test(input)) {
    const match = input.match(/^ask\s+(.+?)\s+(if|whether|about|for)\s+(.+)/i)
    if (match) {
      const [, contact, , ask] = match
      void dispatchOutboundCall(contact.trim(), `Ask: ${ask.trim()}`, 'serious')
      return {
        handled: true,
        reply: `Preparing a call to **${contact.trim()}** to ask: "${ask.trim()}". Generating script and queuing for approval.`,
        worker: 'phone',
      }
    }
  }

  // ── Booking commands ──────────────────────────────────────────────────────
  if (/^try\s+\d/i.test(text) || /\botherwise\b/i.test(text)) {
    const updated = applyBookingPreferenceUpdate(input)
    if (updated) {
      return {
        handled: true,
        reply: `Updated the latest booking request with preferred time ${updated.brief.preferredTime ?? 'unchanged'} and fallback options. Check Reservations for the refreshed brief.`,
        worker: 'reservations',
      }
    }
  }

  if (/book\s+(dinner|lunch|breakfast|a table|restaurant)/i.test(text)) {
    void dispatchBookingRequest('restaurant', input, {})
    return {
      handled: true,
      reply: `Booking request created. Researching restaurant options for: "${input}". I'll present options for your approval.`,
      worker: 'reservations',
    }
  }

  if (/^book\s+.+\bhotel\b/i.test(text)) {
    void dispatchBookingRequest('hotel', input, {})
    return {
      handled: true,
      reply: `Booking request created. I’m treating this as a targeted hotel request and preparing the follow-up flow.`,
      worker: 'reservations',
    }
  }

  if ((/^book\s+at\s+/i.test(text) || /^book\s+.+\s+(?:tomorrow|tonight|today|at\s+\d)/i.test(text)) && !/\b(hotel|room|flight)\b/i.test(text)) {
    void dispatchBookingRequest('restaurant', input, {})
    return {
      handled: true,
      reply: `Booking request created. I’m treating this as a targeted reservation and preparing the approval-ready flow.`,
      worker: 'reservations',
    }
  }

  if (/book\s+(a\s+)?(hotel|room|flight)/i.test(text)) {
    const type: BookingType = /hotel|room/.test(text) ? 'hotel' : 'travel'
    void dispatchBookingRequest(type, input, {})
    return {
      handled: true,
      reply: `Booking request created for: "${input}". Searching options — will present before booking anything.`,
      worker: 'reservations',
    }
  }

  // ── Monitoring commands ───────────────────────────────────────────────────
  if (/watch\s+(flight|hotel|ticket|price)/i.test(text) || /monitor\s+(flight|hotel|ticket)/i.test(text)) {
    const typeMatch = text.match(/(flight|hotel|ticket|price)/)
    const type = (typeMatch?.[1] ?? 'price') as WatchType
    addWatch({ type, label: input, target: input })
    return {
      handled: true,
      reply: `Watch added for: "${input}". I'll alert you when conditions are met.`,
      worker: 'monitoring',
    }
  }

  // ── Inbox commands ────────────────────────────────────────────────────────
  if (/check\s+(my\s+)?emails?|triage\s+(my\s+)?inbox/i.test(text)) {
    return {
      handled: true,
      reply: `Inbox is shown in the Concierge tab. Open Concierge → Inbox to review your classified emails.`,
      worker: 'inbox',
    }
  }

  return { handled: false, reply: '' }
}
