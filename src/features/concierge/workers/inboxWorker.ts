/**
 * Inbox / Comms Worker
 *
 * Responsibilities:
 *   - triage inbox and classify emails
 *   - draft reply suggestions
 *   - extract tasks and events from emails
 *   - queue outgoing messages for approval (never auto-sends)
 *
 * V1: operates on structured email data fed from Gmail or manual input.
 * Auto-sending is permanently blocked — all outgoing goes through approvals.
 */

import { useConciergeStore } from '@/store/concierge'
import type { GmailMessageRecord, GmailStatus } from '@/shared/gmail-bridge'
import type { InboxEmail, EmailCategory, OutgoingMessage } from '../conciergeTypes'

// ── Classification ────────────────────────────────────────────────────────────

const URGENT_SIGNALS = [
  'urgent', 'asap', 'immediately', 'deadline', 'confirm by', 'please respond',
  'action required', 'time sensitive', 'today', 'by friday', 'by eod',
]

const WAITING_SIGNALS = [
  'waiting on', 'following up', 'just checking', 'any update', 'reminder',
  'feedback', 'let me know', 'your thoughts',
]

const NEWSLETTER_SIGNALS = [
  'unsubscribe', 'newsletter', 'weekly digest', 'monthly update', 'no-reply',
  'noreply', 'marketing', 'offers', 'deals', 'promotion',
]

function classifyEmail(email: Pick<InboxEmail, 'subject' | 'preview' | 'sender'>): EmailCategory {
  const text = `${email.subject} ${email.preview} ${email.sender}`.toLowerCase()

  if (NEWSLETTER_SIGNALS.some((s) => text.includes(s))) return 'newsletter'
  if (URGENT_SIGNALS.some((s) => text.includes(s))) return 'urgent'
  if (WAITING_SIGNALS.some((s) => text.includes(s))) return 'waiting_on_me'
  return 'low_priority'
}

// ── Task / Event extraction ───────────────────────────────────────────────────

const TASK_PATTERNS = [
  /please (?:review|sign|confirm|complete|fill|return|send)\s+(.+?)(?:\.|$)/gi,
  /action required[:\s]+(.+?)(?:\.|$)/gi,
  /(?:can you|could you|would you)\s+(.+?)(?:\?|$)/gi,
]

const EVENT_PATTERNS = [
  /(?:meeting|call|sync|review|demo)\s+(?:on|at|scheduled for)\s+(.+?)(?:\.|$)/gi,
  /(\w+ \d+(?:st|nd|rd|th)?(?:,?\s+\d{4})?\s+at\s+\d+(?::\d+)?\s*(?:am|pm))/gi,
]

function extractTasks(text: string): string[] {
  const tasks: string[] = []
  for (const pattern of TASK_PATTERNS) {
    const matches = [...text.matchAll(pattern)]
    tasks.push(...matches.map((m) => m[1].trim()).filter(Boolean))
  }
  return [...new Set(tasks)].slice(0, 3)
}

function extractEvents(text: string): string[] {
  const events: string[] = []
  for (const pattern of EVENT_PATTERNS) {
    const matches = [...text.matchAll(pattern)]
    events.push(...matches.map((m) => m[1].trim()).filter(Boolean))
  }
  return [...new Set(events)].slice(0, 2)
}

// ── Draft reply generation (local heuristics — no LLM in V1) ──────────────────

export function buildFallbackDraftReply(email: Pick<InboxEmail, 'category' | 'sender' | 'subject'>): string {
  const { category, sender, subject } = email
  const firstName = sender.split('@')[0].split('.')[0]
  const cap = firstName.charAt(0).toUpperCase() + firstName.slice(1)

  if (category === 'urgent') {
    return `Hi ${cap},\n\nThanks for reaching out — I've seen this and will review it shortly. I'll get back to you by end of day.\n\nBest,\nAhmed`
  }
  if (category === 'waiting_on_me') {
    return `Hi ${cap},\n\nApologies for the delay on "${subject}". I'll look into this today and follow up shortly.\n\nBest,\nAhmed`
  }
  return `Hi ${cap},\n\nThanks for the message — I'll take a look when I get a chance.\n\nBest,\nAhmed`
}

function generateDraftReply(email: InboxEmail): string {
  return buildFallbackDraftReply(email)
}

function parseSenderEmail(sender: string): string | undefined {
  return sender.match(/<([^>]+)>/)?.[1] ?? (sender.includes('@') ? sender.trim() : undefined)
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Process a raw email object: classify, extract, optionally draft a reply. */
export function processEmail(
  raw: Pick<InboxEmail, 'id' | 'sender' | 'subject' | 'preview' | 'body' | 'receivedAt'>
): InboxEmail {
  const store = useConciergeStore.getState()
  const category = classifyEmail(raw)
  const fullText = `${raw.subject} ${raw.body ?? raw.preview}`
  const email: InboxEmail = {
    ...raw,
    senderEmail: parseSenderEmail(raw.sender),
    category,
    extractedTasks: extractTasks(fullText),
    extractedEvents: extractEvents(fullText),
    draftReply: category !== 'newsletter' && category !== 'low_priority'
      ? generateDraftReply({ ...raw, category, extractedTasks: [], extractedEvents: [], read: false })
      : undefined,
    replyNeeded: category === 'urgent' || category === 'waiting_on_me',
    followUpCandidate: category === 'waiting_on_me' || /follow up|circle back|reminder/i.test(fullText),
    read: false,
  }

  store.addEmail(email)
  store.setWorkerStatus('inbox', 'idle')
  store.logActivity(
    'inbox',
    `Email classified: "${raw.subject}"`,
    'success',
    `Category: ${category}`,
  )

  return email
}

/** Triage a batch of emails. */
export function triageInbox(
  raws: Pick<InboxEmail, 'id' | 'sender' | 'subject' | 'preview' | 'body' | 'receivedAt'>[]
): void {
  const store = useConciergeStore.getState()
  store.setWorkerStatus('inbox', 'running')
  store.setEmails([])

  const counts: Record<string, number> = { urgent: 0, waiting_on_me: 0, newsletter: 0, low_priority: 0 }
  for (const raw of raws) {
    const email = processEmail(raw)
    counts[email.category]++
  }

  store.setWorkerStatus('inbox', 'idle')
  store.logActivity(
    'inbox',
    'Inbox triaged',
    'success',
    `${raws.length} emails — urgent: ${counts.urgent}, waiting: ${counts.waiting_on_me}, newsletters: ${counts.newsletter}`,
  )
}

/**
 * Queue an outgoing message for approval.
 * NEVER sends automatically.
 */
export function queueOutgoingMessage(
  to: string,
  subject: string,
  body: string,
  sourceEmailId?: string,
  threadId?: string,
): OutgoingMessage {
  const store = useConciergeStore.getState()
  const existing = store.outgoingMessages.find((msg) =>
    msg.to === to &&
    msg.subject === subject &&
    msg.body === body &&
    msg.sourceEmailId === sourceEmailId &&
    msg.threadId === threadId &&
    msg.status !== 'rejected' &&
    msg.status !== 'failed',
  )
  if (existing) {
    return existing
  }

  const msg: OutgoingMessage = {
    id: `out-${Date.now()}`,
    to,
    subject,
    body,
    status: 'pending_approval',
    sourceEmailId,
    threadId,
    createdAt: new Date().toISOString(),
  }
  store.addOutgoingMessage(msg)
  store.addApproval({
    id: `appr-out-${msg.id}`,
    workerId: 'inbox',
    title: `Send email to ${to}`,
    description: `Subject: "${subject}"\n\n${body.slice(0, 120)}…`,
    riskLevel: 'low',
    status: 'pending',
    actionRef: `inbox:send-message:${msg.id}`,
    createdAt: new Date().toISOString(),
  })
  store.logActivity('inbox', `Draft queued for approval`, 'pending', `To: ${to} — "${subject}"`)
  return msg
}

/** Mark email as read and update store. */
export function markEmailRead(emailId: string): void {
  useConciergeStore.getState().updateEmail(emailId, { read: true })
}

export function storeDraftReply(emailId: string, draftReply: string): void {
  const store = useConciergeStore.getState()
  const email = store.emails.find((item) => item.id === emailId)
  if (!email) return
  store.updateEmail(emailId, { draftReply })
  store.logActivity('inbox', `Draft generated for "${email.subject}"`, 'success')
}

export function queueDraftReply(emailId: string): OutgoingMessage | null {
  const store = useConciergeStore.getState()
  const email = store.emails.find((item) => item.id === emailId)
  if (!email?.draftReply) return null
  const to = email.senderEmail ?? email.sender
  return queueOutgoingMessage(to, `Re: ${email.subject}`, email.draftReply, email.id, email.threadId)
}

function gmailBridge() {
  return window.electronAPI?.gmail ?? window.jarvis?.gmail
}

export async function getGmailStatus(): Promise<GmailStatus | null> {
  const bridge = gmailBridge()
  if (!bridge) return null
  return bridge.status()
}

export async function fetchRecentInboxMessages(): Promise<GmailMessageRecord[]> {
  const store = useConciergeStore.getState()
  store.setWorkerStatus('inbox', 'running')
  const bridge = gmailBridge()

  if (!bridge) {
    store.setWorkerStatus('inbox', 'error')
    store.logActivity('inbox', 'Gmail unavailable', 'failed', 'Preload Gmail bridge not available.')
    return []
  }

  const result = await bridge.fetchRecent()
  if (!result.ok || !result.messages) {
    store.setWorkerStatus('inbox', 'error')
    store.logActivity('inbox', 'Gmail fetch failed', 'failed', result.error)
    return []
  }

  store.logActivity('inbox', 'Fetched recent Gmail messages', 'success', `${result.messages.length} messages`)
  return result.messages
}

export async function sendOutgoingMessage(msgId: string): Promise<boolean> {
  const store = useConciergeStore.getState()
  const msg = store.outgoingMessages.find((item) => item.id === msgId)
  if (!msg) return false
  const bridge = gmailBridge()

  if (!bridge) {
    store.updateOutgoingMessage(msgId, { status: 'failed', failureReason: 'Gmail bridge unavailable.' })
    store.logActivity('inbox', 'Email send failed', 'failed', 'Gmail bridge unavailable.')
    return false
  }

  store.updateOutgoingMessage(msgId, { status: 'approved' })
  const result = await bridge.sendMessage({
    to: msg.to,
    subject: msg.subject,
    body: msg.body,
    threadId: msg.threadId,
  })

  if (!result.ok) {
    store.updateOutgoingMessage(msgId, { status: 'failed', failureReason: result.error })
    store.logActivity('inbox', 'Email send failed', 'failed', result.error)
    return false
  }

  store.updateOutgoingMessage(msgId, { status: 'sent' })
  store.logActivity('inbox', 'Email sent', 'success', `To: ${msg.to}`)
  return true
}
