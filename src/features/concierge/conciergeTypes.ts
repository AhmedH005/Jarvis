// ── Concierge System Types ────────────────────────────────────────────────────

export type WorkerId = 'inbox' | 'phone' | 'monitoring' | 'reservations' | 'documents'

export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'needs_approval'
  | 'approved'
  | 'rejected'

export type WorkerStatus = 'idle' | 'running' | 'error'

// ── Inbox / Comms ─────────────────────────────────────────────────────────────

export type EmailCategory = 'urgent' | 'waiting_on_me' | 'newsletter' | 'low_priority'

export interface InboxEmail {
  id: string
  sender: string
  senderEmail?: string
  subject: string
  preview: string
  body?: string
  threadId?: string
  category: EmailCategory
  draftReply?: string
  extractedTasks: string[]
  extractedEvents: string[]
  replyNeeded?: boolean
  followUpCandidate?: boolean
  receivedAt: string
  read: boolean
}

export interface OutgoingMessage {
  id: string
  to: string
  subject: string
  body: string
  status: 'pending_approval' | 'approved' | 'sent' | 'rejected' | 'failed'
  threadId?: string
  sourceEmailId?: string
  failureReason?: string
  createdAt: string
}

// ── Phone ─────────────────────────────────────────────────────────────────────

export type CallDirection = 'inbound' | 'outbound'
export type CallStatus = 'active' | 'completed' | 'voicemail' | 'pending_approval' | 'failed'

export interface CallScript {
  opening: string
  reservationRequest?: string
  fallbackOffers?: string[]
  specialRequests?: string[]
  confirmationChecklist?: string[]
  close?: string
  objectives: string[]
  keyPoints: string[]
  closing: string
  estimatedDuration: string
}

export interface PhoneCall {
  id: string
  direction: CallDirection
  contact: string
  number?: string
  summary?: string
  transcript?: string
  status: CallStatus
  durationSecs?: number
  timestamp: string
  // Telephony metadata
  callSid?: string        // Twilio Call SID ("CA...")
  callObjective?: string  // What the call was meant to accomplish
  mode?: 'serious' | 'demo'
  approvalId?: string     // Linked approval item ID (outbound)
  failureReason?: string  // Human-readable failure description
  recordingUrl?: string   // Twilio recording URL
  providerMeta?: Record<string, string>  // Arbitrary provider metadata
  linkedBookingRequestId?: string
  linkedOutboundRequestId?: string
}

export type OutboundCallRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'

export interface OutboundCallRequest {
  id: string
  contact: string
  number?: string
  instruction: string
  mode: 'serious' | 'demo'
  status: OutboundCallRequestStatus
  result?: string
  createdAt: string
  // V2 telephony fields
  callObjective?: string   // Short natural-language objective (1 sentence)
  callScript?: CallScript  // AI-generated structured script
  callSid?: string         // Twilio Call SID once dialed
  failureReason?: string   // Human-readable error if status='failed'
  summary?: string
  transcript?: string
  linkedBookingRequestId?: string
  linkedBookingOptionId?: string
  reservationHandoff?: ReservationPhoneHandoff
}

export type ConciergeNumberStatus = 'active' | 'inactive' | 'not_configured'

// ── Monitoring / Deals ────────────────────────────────────────────────────────

export type WatchType = 'flight' | 'hotel' | 'ticket' | 'renewal' | 'price_drop'

export interface MonitorWatch {
  id: string
  type: WatchType
  label: string
  target: string
  threshold?: string
  status: 'active' | 'triggered' | 'expired'
  lastChecked?: string
  alert?: string
  createdAt: string
}

// ── Reservations / Booking ────────────────────────────────────────────────────

export type BookingType = 'restaurant' | 'hotel' | 'appointment' | 'travel' | 'other'
export type BookingStatus =
  | 'researching'
  | 'ready_for_approval'
  | 'queued_for_call'
  | 'calling'
  | 'confirmed'
  | 'needs_follow_up'
  | 'failed'

export interface BookingBrief {
  id: string
  category: BookingType
  requestText: string
  title: string
  placeName?: string
  location?: string
  date?: string
  preferredTime?: string
  fallbackTimes: string[]
  fallbackDateOptions: string[]
  partySize?: number
  notes?: string
  specialRequests: string[]
  negotiationNotes: string[]
  targetBusiness?: string
  targetingStatus: 'targeted' | 'shortlist' | 'ambiguous' | 'needs_lookup'
  ambiguityNote?: string
  source: 'user_request' | 'agent_research' | 'manual'
}

export interface BookingOption {
  id: string
  category: BookingType
  title: string
  placeName: string
  location?: string
  date?: string
  preferredTime?: string
  fallbackTimes?: string[]
  partySize?: number
  notes?: string
  specialRequests?: string[]
  phoneNumber?: string
  source: string
  status: 'shortlisted' | 'selected' | 'unavailable' | 'confirmed' | 'ambiguous' | 'needs_lookup'
  available: boolean
  price?: string
  detail?: string
  rankingReason?: string
  matchConfidence?: number
  requiresPhoneLookup?: boolean
  ambiguityNote?: string
}

export interface ReservationPhoneHandoff {
  id: string
  bookingRequestId: string
  bookingOptionId?: string
  category: BookingType
  targetBusiness: string
  phoneNumber?: string
  location?: string
  reservationObjective: string
  date?: string
  preferredTime?: string
  fallbackTimes: string[]
  fallbackDateOptions: string[]
  partySize?: number
  keyQuestions: string[]
  negotiationStrategy: string[]
  specialNotes?: string
  targetStatus: BookingBrief['targetingStatus']
  clarificationPrompt?: string
  mode: 'serious' | 'demo'
  callerIdentity: string
  confirmationChecklist: string[]
  desiredConfirmationFields: string[]
}

export interface BookingExecutionResult {
  id: string
  bookingRequestId: string
  status: 'confirmed' | 'failed' | 'needs_follow_up'
  summary: string
  transcript?: string
  failureReason?: string
  confirmedDetails?: Record<string, string>
  linkedCallId?: string
  linkedCalendarEventId?: string
  nextBestStep?: string
  fallbackUsed?: string
  conditions?: string[]
  ambiguityReason?: string
  suggestedAlternatives?: string[]
  completedAt: string
}

export interface BookingRequest {
  id: string
  type: BookingType
  description: string
  brief: BookingBrief
  options: BookingOption[]
  selectedOptionId?: string
  status: BookingStatus
  selectedOption?: BookingOption
  phoneHandoff?: ReservationPhoneHandoff
  executionResult?: BookingExecutionResult
  linkedCallId?: string
  linkedCalendarEventId?: string
  confirmation?: string
  notes?: string
  requiresPhoneCall: boolean
  createdAt: string
}

// ── Documents / Forms ─────────────────────────────────────────────────────────

export type DocumentType = 'form' | 'pdf' | 'application' | 'claim' | 'registration' | 'other'
export type DocumentStatus = 'uploaded' | 'processing' | 'reviewed' | 'pending_approval' | 'submitted'

export interface DocumentItem {
  id: string
  name: string
  type: DocumentType
  extractedFields: Record<string, string>
  summary?: string
  nextSteps: string[]
  draftReady: boolean
  status: DocumentStatus
  uploadedAt: string
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalItem {
  id: string
  workerId: WorkerId
  title: string
  description: string
  riskLevel: RiskLevel
  status: ApprovalStatus
  /** Opaque reference so the orchestrator knows what to execute on approval */
  actionRef: string
  payload?: unknown
  createdAt: string
  resolvedAt?: string
}

// ── Activity Log ──────────────────────────────────────────────────────────────

export type ActivityStatus = 'success' | 'failed' | 'pending' | 'info'

export interface ActivityEntry {
  id: string
  workerId: WorkerId
  action: string
  detail?: string
  status: ActivityStatus
  timestamp: string
}

// ── Jobs (internal orchestrator tracking) ─────────────────────────────────────

export interface ConciergeJob {
  id: string
  workerId: WorkerId
  type: string
  status: JobStatus
  title: string
  payload?: unknown
  createdAt: string
  updatedAt: string
}
