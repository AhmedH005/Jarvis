/**
 * Phone Bridge — shared types for main-process ↔ renderer IPC.
 *
 * These types flow through preload.ts and are used by:
 *   - electron/phone.ts  (main process)
 *   - phoneWorker.ts     (renderer, Zustand worker)
 *   - ConciergeTab.tsx   (renderer UI)
 */

// ── Outbound dial ──────────────────────────────────────────────────────────────

export interface PhoneDialInput {
  /** Internal request ID (maps to OutboundCallRequest.id in the store) */
  reqId: string
  /** E.164 target phone number, e.g. "+12125551234" */
  to: string
  /** Human-readable contact name for logging */
  contact: string
  /** Original natural-language instruction */
  instruction: string
  /** Call mode — controls voice style in TwiML */
  mode: 'serious' | 'demo'
  /** AI-generated call script (optional — falls back to instruction) */
  callScript?: {
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
}

export interface PhoneDialResult {
  ok: boolean
  /** Twilio Call SID ("CA...") when ok=true */
  callSid?: string
  /** Human-readable error string when ok=false */
  error?: string
  /** Which error category to surface in the UI */
  errorCode?: 'no_credentials' | 'no_from_number' | 'twilio_error' | 'no_webhook_url' | 'unknown'
}

// ── Call status update (pushed from main → renderer) ─────────────────────────

export type PhoneCallUpdateStatus =
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'busy'
  | 'no-answer'
  | 'canceled'

export interface PhoneCallUpdate {
  /** Twilio Call SID */
  callSid: string
  /** Maps to OutboundCallRequest.id in store (if known) */
  reqId?: string
  status: PhoneCallUpdateStatus
  /** Call duration in seconds (available on completed) */
  durationSecs?: number
  /** Twilio recording URL (if call was recorded) */
  recordingUrl?: string
  /** Twilio recording transcription (if available) */
  transcription?: string
  /** Twilio error message (if failed) */
  errorMessage?: string
}

// ── Webhook config (exposed to renderer for display) ─────────────────────────

export interface PhoneWebhookConfig {
  /** Local server port */
  port: number
  /** Public base URL (if configured) */
  publicBaseUrl: string | null
  /** Whether the server is running */
  running: boolean
  /** Whether Twilio credentials are configured */
  credentialsConfigured: boolean
  /** The configured Twilio phone number (E.164) */
  twilioNumber: string | null
}
