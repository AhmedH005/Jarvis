/**
 * Phone Worker
 *
 * Manages the concierge phone lifecycle:
 *   - Record inbound calls from Twilio webhook data
 *   - Queue outbound call requests for approval (never dials silently)
 *   - Execute approved outbound calls via Twilio through the Electron IPC bridge
 *   - Handle real-time call status updates pushed from main process
 *   - Support "serious" and "demo/party trick" modes
 *
 * V1: Twilio backbone live. ElevenLabs voice available via resolveVoiceProvider()
 * in electron/voice.ts — TwiML uses Polly by default with ElevenLabs as upgrade.
 */

import { useConciergeStore } from '@/store/concierge'
import { phoneAgent, isAgentError, today } from '../conciergeAgentBridge'
import { applyBookingExecutionResult, markBookingCalling } from './reservationsWorker'
import type {
  CallScript,
  OutboundCallRequest,
  PhoneCall,
  ReservationPhoneHandoff,
} from '../conciergeTypes'
import type { PhoneCallUpdate } from '@/shared/phone-bridge'

function failLinkedBookingFromCallStart(
  req: OutboundCallRequest,
  linkedCallId: string,
  summary: string,
  failureReason: string,
  nextBestStep: string,
  status: 'failed' | 'needs_follow_up' = 'failed',
): void {
  if (!req.linkedBookingRequestId) return
  void applyBookingExecutionResult(req.linkedBookingRequestId, {
    id: `booking-result-${req.id}`,
    bookingRequestId: req.linkedBookingRequestId,
    status,
    summary,
    failureReason,
    linkedCallId,
    completedAt: new Date().toISOString(),
    nextBestStep,
  })
}

function buildReservationCallScript(
  handoff: ReservationPhoneHandoff,
  mode: 'serious' | 'demo',
): CallScript {
  const onBehalfOf = mode === 'demo'
    ? `I'm JARVIS calling for Ahmed`
    : `I'm calling on behalf of Ahmed`

  const opening = mode === 'demo'
    ? `Hi there, ${onBehalfOf}. I know that's a little unusual, but I can keep this quick.`
    : `Hello, ${onBehalfOf}. I was hoping to help with a reservation.`

  const reservationRequest = handoff.category === 'hotel'
    ? `Could I ask about the cheapest available room${handoff.date ? ` for ${handoff.date}` : ''}${handoff.specialNotes ? `, and ${handoff.specialNotes.toLowerCase()}` : ''}?`
    : `I'd like to request ${handoff.partySize ? `a table for ${handoff.partySize}` : 'a reservation'}${handoff.date ? ` on ${handoff.date}` : ''}${handoff.preferredTime ? ` at ${handoff.preferredTime}` : ''}.`

  const fallbackOffers = [
    handoff.fallbackTimes.length > 0 ? `If that slot is gone, I can offer ${handoff.fallbackTimes.join(', ')}.` : '',
    handoff.fallbackDateOptions.length > 0 ? `If dinner is full, ${handoff.fallbackDateOptions.join(', ')} could work instead.` : '',
  ].filter(Boolean)

  const specialRequests = handoff.specialNotes
    ? [handoff.specialNotes]
    : []

  const confirmationChecklist = handoff.confirmationChecklist

  const close = mode === 'demo'
    ? `Perfect, thank you. I just wanted to make sure I have the details exactly right for Ahmed.`
    : `Thank you, that's really helpful. Let me quickly repeat the details to make sure I have everything correct.`

  return {
    opening,
    reservationRequest,
    fallbackOffers,
    specialRequests,
    confirmationChecklist,
    close,
    objectives: [reservationRequest, ...handoff.keyQuestions],
    keyPoints: [
      ...fallbackOffers,
      ...specialRequests,
      `Please confirm: ${confirmationChecklist.join('; ')}.`,
    ],
    closing: close,
    estimatedDuration: handoff.category === 'hotel' ? '3-4 min' : '2-3 min',
  }
}

// ── Inbound call handling ─────────────────────────────────────────────────────

/** Record a completed inbound call (populated from Twilio webhook data). */
export function recordInboundCall(params: {
  callSid: string
  from: string
  durationSecs: number
  transcript?: string
  summary?: string
  voicemail?: boolean
}): PhoneCall {
  const store = useConciergeStore.getState()
  const call: PhoneCall = {
    id:          `call-${params.callSid}`,
    direction:   'inbound',
    contact:     params.from,
    transcript:  params.transcript,
    summary:     params.summary,
    status:      params.voicemail ? 'voicemail' : 'completed',
    durationSecs: params.durationSecs,
    callSid:     params.callSid,
    timestamp:   new Date().toISOString(),
  }
  store.addCall(call)
  store.setWorkerStatus('phone', 'idle')
  store.logActivity(
    'phone',
    params.voicemail ? 'Voicemail received' : 'Inbound call completed',
    'success',
    `From: ${params.from} · ${params.durationSecs}s${params.summary ? ` · "${params.summary}"` : ''}`,
  )
  return call
}

// ── Outbound call queue ───────────────────────────────────────────────────────

interface QueueOutboundCallOptions {
  skipApproval?: boolean
  linkedBookingRequestId?: string
  linkedBookingOptionId?: string
  reservationHandoff?: ReservationPhoneHandoff
}

/**
 * Queue an outbound call for approval.
 * NEVER dials automatically — all outbound calls must be approved.
 */
export function queueOutboundCall(
  contact: string,
  number: string | undefined,
  instruction: string,
  mode: 'serious' | 'demo' = 'serious',
  callObjective?: string,
  callScript?: CallScript,
  options: QueueOutboundCallOptions = {},
): OutboundCallRequest {
  const store = useConciergeStore.getState()
  const req: OutboundCallRequest = {
    id:            `obcall-${Date.now()}`,
    contact,
    number,
    instruction,
    mode,
    status:        'pending_approval',
    callObjective,
    callScript,
    createdAt:     new Date().toISOString(),
    linkedBookingRequestId: options.linkedBookingRequestId,
    linkedBookingOptionId: options.linkedBookingOptionId,
    reservationHandoff: options.reservationHandoff,
  }
  if (options.skipApproval) req.status = 'approved'
  store.addOutboundRequest(req)

  const scriptSummary = callScript
    ? `Script ready (${callScript.estimatedDuration})`
    : 'No script — will use instruction directly'

  if (!options.skipApproval) {
    store.addApproval({
      id:          `appr-${req.id}`,
      workerId:    'phone',
      title:       `Call ${contact}`,
      description: [
        `Instruction: "${instruction}"`,
        number ? `Number: ${number}` : 'Number: not yet provided',
        `Mode: ${mode}`,
        scriptSummary,
      ].join('\n'),
      riskLevel:  'medium',
      status:     'pending',
      actionRef:  `phone:dial:${req.id}`,
      payload:    req,
      createdAt:  new Date().toISOString(),
    })
  }
  store.logActivity(
    'phone',
    `Outbound call queued: ${contact}`,
    'pending',
    `Instruction: "${instruction}"${callObjective ? ` · Objective: ${callObjective}` : ''}`,
  )
  return req
}

// ── Approved call execution ───────────────────────────────────────────────────

/**
 * Execute an approved outbound call via Twilio through the Electron IPC bridge.
 * Called by the orchestrator after approval is granted.
 *
 * Safety checks:
 *   - Requires a phone number (fails clearly if missing)
 *   - Requires Twilio credentials to be configured
 *   - Requires CONCIERGE_PHONE_WEBHOOK_URL to be set
 */
export async function executeOutboundCall(reqId: string): Promise<void> {
  const store = useConciergeStore.getState()
  const req   = store.outboundQueue.find((r) => r.id === reqId)
  if (!req) return

  store.updateOutboundRequest(reqId, { status: 'in_progress' })
  if (req.linkedBookingRequestId) {
    markBookingCalling(req.linkedBookingRequestId, reqId)
  }
  store.setWorkerStatus('phone', 'running')
  store.logActivity('phone', `Outbound call starting: ${req.contact}`, 'pending')

  if (!req.number) {
    store.updateOutboundRequest(reqId, {
      status:        'failed',
      failureReason: 'No phone number provided. Add a number to the call request before approving.',
    })
    store.setWorkerStatus('phone', 'error')
    store.logActivity(
      'phone',
      `Call failed — no number: ${req.contact}`,
      'failed',
      'Provide a phone number and re-queue the call.',
    )
    failLinkedBookingFromCallStart(
      req,
      reqId,
      'Phone call could not be placed because no phone number was available.',
      'No phone number provided for the target business.',
      'Add the business phone number, then retry the approved call.',
      'needs_follow_up',
    )
    return
  }

  if (!window.electronAPI?.phone) {
    store.updateOutboundRequest(reqId, {
      status:        'failed',
      failureReason: 'Phone IPC bridge not available (preload not loaded).',
    })
    store.setWorkerStatus('phone', 'error')
    store.logActivity('phone', 'Call failed — phone bridge unavailable', 'failed')
    failLinkedBookingFromCallStart(
      req,
      reqId,
      'Phone bridge unavailable, so the reservation call could not start.',
      'Phone IPC bridge not available.',
      'Restore the phone bridge, then retry the approved call.',
    )
    return
  }

  try {
    const result = await window.electronAPI.phone.dial({
      reqId:       req.id,
      to:          req.number,
      contact:     req.contact,
      instruction: req.instruction,
      mode:        req.mode,
      callScript:  req.callScript,
    })

    if (!result.ok) {
      store.updateOutboundRequest(reqId, {
        status:        'failed',
        failureReason: result.error ?? 'Twilio dial failed',
      })
      store.setWorkerStatus('phone', 'error')
      store.logActivity(
        'phone',
        `Call failed: ${req.contact}`,
        'failed',
        result.error,
      )
      failLinkedBookingFromCallStart(
        req,
        result.callSid ?? reqId,
        'The phone provider rejected the reservation call before it started.',
        result.error ?? 'Twilio dial failed',
        'Retry the call or choose another reservation option.',
        'needs_follow_up',
      )
      return
    }

    // Call initiated — update SID, wait for status callbacks
    store.updateOutboundRequest(reqId, { callSid: result.callSid })
    store.logActivity(
      'phone',
      `Call initiated: ${req.contact}`,
      'pending',
      `Twilio SID: ${result.callSid}`,
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    store.updateOutboundRequest(reqId, {
      status:        'failed',
      failureReason: `Exception: ${msg}`,
    })
    store.setWorkerStatus('phone', 'error')
    store.logActivity('phone', `Call exception: ${req.contact}`, 'failed', msg)
    failLinkedBookingFromCallStart(
      req,
      reqId,
      'The reservation call hit an exception before it could complete.',
      `Exception: ${msg}`,
      'Retry the call once the phone integration is healthy.',
      'needs_follow_up',
    )
  }
}

// ── Call status updates (from Twilio webhooks via main process) ───────────────

/**
 * Process a real-time call status update pushed from the Electron main process.
 * Called by the renderer-side listener set up in ConciergeTab / store subscriber.
 */
export function handleCallStatusUpdate(update: PhoneCallUpdate): void {
  const store = useConciergeStore.getState()
  const { callSid, reqId, status, durationSecs, transcription, recordingUrl, errorMessage } = update

  // Update the outbound request if we have a reqId
  if (reqId) {
    const req = store.outboundQueue.find((r) => r.id === reqId)
    if (req) {
      const newStatus = _mapTwilioStatus(status)
      store.updateOutboundRequest(reqId, {
        status:        newStatus,
        callSid,
        transcript:    transcription ?? req.transcript,
        ...(newStatus === 'failed' ? { failureReason: errorMessage ?? status } : {}),
      })
    }
  }

  // Update or create the call record
  const existingCall = store.calls.find(
    (c) => c.callSid === callSid || (reqId && c.id === `call-${reqId}`)
  )

  if (existingCall) {
    store.updateCall(existingCall.id, {
      status:       _mapCallRecordStatus(status),
      durationSecs: durationSecs ?? existingCall.durationSecs,
      transcript:   transcription ?? existingCall.transcript,
      recordingUrl: recordingUrl  ?? existingCall.recordingUrl,
      failureReason: errorMessage,
    })
  } else if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(status)) {
    // Create a call record for this SID
    const req = reqId ? store.outboundQueue.find((r) => r.id === reqId) : undefined
    store.addCall({
      id:           `call-${callSid}`,
      callSid,
      direction:    'outbound',
      contact:      req?.contact ?? 'Unknown',
      number:       req?.number,
      status:       _mapCallRecordStatus(status),
      summary:      transcription ? `Transcript: ${transcription.slice(0, 120)}` : undefined,
      transcript:   transcription,
      recordingUrl,
      durationSecs,
      failureReason: errorMessage,
      linkedBookingRequestId: req?.linkedBookingRequestId,
      linkedOutboundRequestId: reqId,
      timestamp:    new Date().toISOString(),
    })
  }

  // Activity log
  const contactLabel = reqId
    ? store.outboundQueue.find((r) => r.id === reqId)?.contact ?? callSid
    : callSid

  const activityStatus = status === 'completed' ? 'success'
    : status === 'failed' || status === 'busy' || status === 'no-answer' ? 'failed'
    : 'pending'

  store.logActivity(
    'phone',
    `Call ${status}: ${contactLabel}`,
    activityStatus,
    [
      durationSecs ? `${durationSecs}s` : '',
      errorMessage ?? '',
      transcription ? `Transcript received` : '',
    ].filter(Boolean).join(' · ') || undefined,
  )

  // Reset worker status when terminal
  const terminal = ['completed', 'failed', 'busy', 'no-answer', 'canceled']
  if (terminal.includes(status)) {
    store.setWorkerStatus('phone', status === 'completed' ? 'idle' : 'error')
    if (reqId) {
      void finalizeLinkedBookingCall(reqId, update)
    }
  }
}

function _mapTwilioStatus(
  twilio: PhoneCallUpdate['status'],
): OutboundCallRequest['status'] {
  switch (twilio) {
    case 'initiated':
    case 'ringing':
    case 'in-progress': return 'in_progress'
    case 'completed':   return 'completed'
    case 'failed':
    case 'busy':
    case 'no-answer':
    case 'canceled':    return 'failed'
    default:            return 'in_progress'
  }
}

function _mapCallRecordStatus(
  twilio: PhoneCallUpdate['status'],
): PhoneCall['status'] {
  switch (twilio) {
    case 'completed':   return 'completed'
    case 'failed':
    case 'busy':
    case 'no-answer':
    case 'canceled':    return 'failed'
    default:            return 'active'
  }
}

// ── Record completed call result ──────────────────────────────────────────────

/** Record the result of a completed outbound call (legacy — now handled by handleCallStatusUpdate). */
export function completeOutboundCall(
  reqId: string,
  result: string,
  transcript?: string,
): void {
  const store = useConciergeStore.getState()
  store.updateOutboundRequest(reqId, { status: 'completed', result })

  const req = store.outboundQueue.find((r) => r.id === reqId)
  if (req) {
    const call: PhoneCall = {
      id:         `call-${reqId}`,
      direction:  'outbound',
      contact:    req.contact,
      number:     req.number,
      summary:    result,
      transcript,
      status:     'completed',
      timestamp:  new Date().toISOString(),
    }
    store.addCall(call)
  }

  store.setWorkerStatus('phone', 'idle')
  store.logActivity('phone', `Outbound call completed: ${req?.contact ?? reqId}`, 'success', result)
}

async function finalizeLinkedBookingCall(reqId: string, update: PhoneCallUpdate): Promise<void> {
  const store = useConciergeStore.getState()
  const req = store.outboundQueue.find((item) => item.id === reqId)
  if (!req?.linkedBookingRequestId) return

  const outcome = await extractReservationOutcome(req, update)
  const callRecord = store.calls.find((call) => call.callSid === update.callSid || call.linkedOutboundRequestId === reqId)
  const linkedCallId = callRecord?.id ?? reqId

  store.updateOutboundRequest(reqId, {
    result: outcome.summary,
    summary: outcome.summary,
    transcript: update.transcription ?? req.transcript,
  })

  await applyBookingExecutionResult(req.linkedBookingRequestId, {
    id: `booking-result-${reqId}`,
    bookingRequestId: req.linkedBookingRequestId,
    status: outcome.status,
    summary: outcome.summary,
    transcript: update.transcription ?? req.transcript,
    failureReason: outcome.failureReason,
    confirmedDetails: outcome.confirmedDetails,
    linkedCallId,
    completedAt: new Date().toISOString(),
    nextBestStep: outcome.nextBestStep,
    fallbackUsed: outcome.fallbackUsed,
    conditions: outcome.conditions,
    ambiguityReason: outcome.ambiguityReason,
    suggestedAlternatives: outcome.suggestedAlternatives,
  })
}

async function extractReservationOutcome(
  req: OutboundCallRequest,
  update: PhoneCallUpdate,
): Promise<{
  status: 'confirmed' | 'failed' | 'needs_follow_up'
  summary: string
  confirmedDetails?: Record<string, string>
  failureReason?: string
  nextBestStep?: string
  fallbackUsed?: string
  conditions?: string[]
  ambiguityReason?: string
  suggestedAlternatives?: string[]
}> {
  const handoff = req.reservationHandoff
  const transcript = update.transcription ?? req.transcript
  const heuristic = analyzeOutcomeHeuristics(req, update)

  try {
    if (!transcript) return heuristic
    const result = await phoneAgent.summarizeCall(
      req.contact,
      transcript,
      req.instruction,
      today(),
    )
    if (isAgentError(result)) return heuristic
    return {
      ...heuristic,
      summary: result.summary || heuristic.summary,
    }
  } catch {
    return heuristic
  }
}

function analyzeOutcomeHeuristics(
  req: OutboundCallRequest,
  update: PhoneCallUpdate,
): {
  status: 'confirmed' | 'failed' | 'needs_follow_up'
  summary: string
  confirmedDetails?: Record<string, string>
  failureReason?: string
  nextBestStep?: string
  fallbackUsed?: string
  conditions?: string[]
  ambiguityReason?: string
  suggestedAlternatives?: string[]
} {
  const handoff = req.reservationHandoff
  const transcript = (update.transcription ?? req.transcript ?? '').toLowerCase()
  const confirmedDetails = buildConfirmedDetails(handoff, req, update) ?? {}
  const target = handoff?.targetBusiness ?? req.contact

  if (update.status === 'busy') {
    return {
      status: 'needs_follow_up',
      summary: `${target} was busy when Jarvis called.`,
      failureReason: 'Business line was busy.',
      nextBestStep: 'Retry later or try an alternate option.',
    }
  }

  if (update.status === 'no-answer' || update.status === 'canceled') {
    return {
      status: 'needs_follow_up',
      summary: `${target} did not answer the reservation call.`,
      failureReason: update.status === 'canceled' ? 'Call was canceled.' : 'No answer from the business.',
      nextBestStep: 'Retry later or ask the user whether to try another option.',
    }
  }

  if (update.status === 'failed') {
    return {
      status: 'failed',
      summary: update.errorMessage ? `Call failed: ${update.errorMessage}` : `Call failed before Jarvis could complete the reservation.`,
      failureReason: update.errorMessage ?? req.failureReason ?? 'The call did not complete successfully.',
      nextBestStep: 'Retry the call or choose another option.',
    }
  }

  if (!transcript) {
    return {
      status: 'needs_follow_up',
      summary: `Call completed with ${target}, but the result is unclear.`,
      ambiguityReason: 'No transcript was available to confirm the final outcome.',
      nextBestStep: 'Review the recording or retry the business for a clean confirmation.',
      confirmedDetails,
    }
  }

  const confirmedTime = extractConfirmedTime(transcript, handoff?.preferredTime)
  const fallbackUsed = confirmedTime && handoff?.preferredTime && confirmedTime !== handoff.preferredTime
    ? confirmedTime
    : undefined
  const conditions = extractConditions(transcript)
  if (confirmedTime) confirmedDetails.time = confirmedTime
  if (conditions.length > 0) confirmedDetails.conditions = conditions.join(', ')

  if (/confirmed|booked|reserved|all set|have you down|can do (?:that|that time|you for)/.test(transcript)) {
    return {
      status: 'confirmed',
      summary: fallbackUsed
        ? `${target} confirmed the booking using fallback time ${fallbackUsed}.`
        : `${target} confirmed the booking.`,
      confirmedDetails,
      fallbackUsed,
      conditions,
    }
  }

  if (/no availability|fully booked|nothing at that time|don't have availability|do not have availability/.test(transcript)) {
    if (fallbackUsed) {
      return {
        status: 'confirmed',
        summary: `${target} could not do the preferred time but confirmed fallback time ${fallbackUsed}.`,
        confirmedDetails,
        fallbackUsed,
        conditions,
      }
    }

    return {
      status: 'needs_follow_up',
      summary: `${target} did not have availability at the requested time.`,
      failureReason: 'Business declined the preferred time.',
      nextBestStep: handoff?.fallbackTimes.length
        ? `Ask whether Jarvis should retry using fallback times: ${handoff.fallbackTimes.join(', ')}.`
        : 'Ask the user whether to try another time or venue.',
      suggestedAlternatives: handoff?.fallbackTimes ?? [],
    }
  }

  if (/call back|check and come back|not sure|maybe|might be able to/.test(transcript)) {
    return {
      status: 'needs_follow_up',
      summary: `Call completed with ${target}, but the business did not give a firm answer.`,
      ambiguityReason: 'Business response was partial or unclear.',
      nextBestStep: 'Review the call and decide whether to retry, clarify, or try another option.',
      confirmedDetails,
      conditions,
    }
  }

  return {
    status: 'needs_follow_up',
    summary: `Call completed with ${target}, but the reservation outcome is still unclear.`,
    ambiguityReason: 'The transcript did not clearly confirm or deny the reservation.',
    nextBestStep: 'Review the transcript or retry the business for a clearer confirmation.',
    confirmedDetails,
    conditions,
  }
}

function buildConfirmedDetails(
  handoff: ReservationPhoneHandoff | undefined,
  req: OutboundCallRequest,
  update: PhoneCallUpdate,
): Record<string, string> | undefined {
  if (update.status !== 'completed' || !handoff) return undefined

  const details: Record<string, string> = {
    businessName: handoff.targetBusiness,
  }
  if (handoff.date) details.date = handoff.date
  if (handoff.preferredTime) details.time = handoff.preferredTime
  if (handoff.partySize) details.partySize = String(handoff.partySize)
  if (handoff.specialNotes) details.notes = handoff.specialNotes
  if (req.callSid) details.callSid = req.callSid
  return details
}

function extractConfirmedTime(transcript: string, fallback?: string): string | undefined {
  for (const pattern of [
    /\b(?:can do|could do|confirmed at|booked at|available at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
    /\binstead(?:\s+they)?\s+(?:can do|have)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i,
  ]) {
    const match = transcript.match(pattern)
    if (match) {
      const normalized = normalizeHeuristicTime(match[1])
      if (normalized) return normalized
    }
  }
  const explicit = transcript.match(/\b(?:at|for)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)
  if (explicit) {
    const normalized = normalizeHeuristicTime(explicit[1])
    if (normalized) return normalized
  }
  if (fallback) return fallback
  return undefined
}

function normalizeHeuristicTime(raw: string): string | undefined {
  const match = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!match) return undefined
  let hours = Number(match[1])
  const minutes = Number(match[2] ?? '0')
  const suffix = match[3]
  if (suffix === 'pm' && hours < 12) hours += 12
  if (suffix === 'am' && hours === 12) hours = 0
  if (!suffix && hours <= 11) hours += 12
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function extractConditions(transcript: string): string[] {
  const conditions: string[] = []
  if (/late checkout is free|complimentary late checkout/.test(transcript)) conditions.push('Late checkout is free')
  if (/late checkout is paid|late checkout carries a fee|paid late checkout/.test(transcript)) conditions.push('Late checkout is paid')
  if (/deposit required/.test(transcript)) conditions.push('Deposit required')
  return conditions
}

export async function queueReservationCall(
  handoff: ReservationPhoneHandoff,
  callScript?: CallScript,
  mode: 'serious' | 'demo' = 'serious',
): Promise<OutboundCallRequest> {
  const baseScript = buildReservationCallScript(handoff, mode)
  const resolvedScript: CallScript = {
    ...baseScript,
    ...callScript,
    reservationRequest: callScript?.reservationRequest ?? baseScript.reservationRequest,
    fallbackOffers: callScript?.fallbackOffers ?? baseScript.fallbackOffers,
    specialRequests: callScript?.specialRequests ?? baseScript.specialRequests,
    confirmationChecklist: callScript?.confirmationChecklist ?? baseScript.confirmationChecklist,
    close: callScript?.close ?? baseScript.close,
  }
  const fallbackOffers = resolvedScript.fallbackOffers ?? []
  const scriptSpecialRequests = resolvedScript.specialRequests ?? []
  const instruction = [
    handoff.reservationObjective,
    resolvedScript.reservationRequest ? `Reservation request: ${resolvedScript.reservationRequest}` : '',
    fallbackOffers.length > 0 ? `Fallback offers: ${fallbackOffers.join(' | ')}` : '',
    scriptSpecialRequests.length > 0 ? `Special requests: ${scriptSpecialRequests.join(' | ')}` : '',
    handoff.keyQuestions.length > 0 ? `Questions: ${handoff.keyQuestions.join(' | ')}` : '',
    handoff.specialNotes ? `Notes: ${handoff.specialNotes}` : '',
  ].filter(Boolean).join(' ')

  const req = queueOutboundCall(
    handoff.targetBusiness,
    handoff.phoneNumber,
    instruction,
    mode,
    handoff.reservationObjective,
    resolvedScript,
    {
      skipApproval: true,
      linkedBookingRequestId: handoff.bookingRequestId,
      linkedBookingOptionId: handoff.bookingOptionId,
      reservationHandoff: { ...handoff, mode },
    },
  )

  useConciergeStore.getState().updateOutboundRequest(req.id, { status: 'queued' })
  return req
}

// ── Number management ─────────────────────────────────────────────────────────

/** Register the concierge number (called during setup or Twilio provisioning). */
export function setConciergeNumber(number: string): void {
  const store = useConciergeStore.getState()
  store.setConciergeNumber(number, 'active')
  store.logActivity('phone', 'Concierge number configured', 'success', number)
}
