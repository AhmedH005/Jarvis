import { useState, useEffect, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Mail,
  MapPin,
  Mic,
  Phone,
  PhoneCall as PhoneCallIcon,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingDown,
  X,
} from 'lucide-react'
import { useConciergeStore } from '@/store/concierge'
import {
  approveAction,
  rejectAction,
  markEmailRead,
  queueOutboundCall,
  addWatch,
  checkAllWatches,
  selectAndQueueBooking,
  prepareDraft,
  queueSubmission,
  syncInboxFromGmail,
  generateDraftReplyForEmail,
  queueDraftReplyForApproval,
} from '@/features/concierge/conciergeOrchestrator'
import { handleCallStatusUpdate } from '@/features/concierge/workers/phoneWorker'
import type { PhoneCallUpdate, PhoneWebhookConfig } from '@/shared/phone-bridge'
import type { GmailStatus } from '@/shared/gmail-bridge'
import type {
  WorkerId,
  EmailCategory,
  ApprovalItem,
  ActivityEntry,
  InboxEmail,
  PhoneCall as ConciergeCall,
  OutboundCallRequest,
  MonitorWatch,
  BookingRequest,
  DocumentItem,
  WatchType,
} from '@/features/concierge/conciergeTypes'

// ── Section tab definitions ────────────────────────────────────────────────────

type ConciergeSection = 'inbox' | 'phone' | 'monitoring' | 'reservations' | 'documents' | 'approvals'

const SECTIONS: Array<{ id: ConciergeSection; label: string; icon: typeof Mail; accent: string }> = [
  { id: 'inbox',        label: 'Inbox',        icon: Mail,      accent: '#c084fc' },
  { id: 'phone',        label: 'Phone',         icon: Phone,     accent: '#00d4ff' },
  { id: 'monitoring',   label: 'Monitoring',    icon: Eye,       accent: '#ffc84a' },
  { id: 'reservations', label: 'Reservations',  icon: MapPin,    accent: '#00ff88' },
  { id: 'documents',    label: 'Documents',     icon: FileText,  accent: '#9ad1ff' },
  { id: 'approvals',    label: 'Approvals',     icon: Shield,    accent: '#ff6b35' },
]

// ── Colours / helpers ──────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<EmailCategory, string> = {
  urgent:       '#ff6b35',
  waiting_on_me: '#ffc84a',
  newsletter:   'rgba(192,232,240,0.3)',
  low_priority: 'rgba(192,232,240,0.3)',
}

const CATEGORY_LABEL: Record<EmailCategory, string> = {
  urgent:       'URGENT',
  waiting_on_me: 'WAITING',
  newsletter:   'NEWS',
  low_priority: 'LOW',
}

function workerAccent(id: WorkerId): string {
  return SECTIONS.find((s) => s.id === id)?.accent ?? '#00d4ff'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function isGmailApiDisabled(detail?: string | null): boolean {
  return Boolean(detail && /gmail api is disabled|enable the gmail api/i.test(detail))
}

// ── Root component ─────────────────────────────────────────────────────────────

export function ConciergeTab() {
  const [activeSection, setActiveSection] = useState<ConciergeSection>('inbox')
  const approvalQueue = useConciergeStore((s) => s.approvalQueue)
  const workerStatus  = useConciergeStore((s) => s.workerStatus)
  const pendingCount  = approvalQueue.filter((a) => a.status === 'pending').length

  // Subscribe to real-time call status updates from Twilio webhooks
  useEffect(() => {
    if (!window.electronAPI?.phone) return
    return window.electronAPI.phone.onCallUpdate((update: PhoneCallUpdate) => {
      handleCallStatusUpdate(update)
    })
  }, [])

  const now     = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
            <h2 className="text-[11px] font-mono tracking-[0.18em]" style={{ color: 'rgba(192,232,240,0.9)' }}>
              CONCIERGE
            </h2>
          </div>
          <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.5)' }}>
            {dateStr} · {now}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Worker status dots */}
          {(['inbox', 'phone', 'monitoring', 'reservations', 'documents'] as WorkerId[]).map((id) => (
            <div key={id} className="flex items-center gap-1">
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: workerStatus[id] === 'running' ? workerAccent(id) : 'rgba(255,255,255,0.12)' }}
                animate={workerStatus[id] === 'running' ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Section nav ── */}
      <div className="flex gap-1 px-4 pb-3 flex-shrink-0 overflow-x-auto">
        {SECTIONS.map((sec) => {
          const active = activeSection === sec.id
          const isPending = sec.id === 'approvals' && pendingCount > 0
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-mono tracking-wide whitespace-nowrap transition-all"
              style={{
                background: active ? `${sec.accent}18` : 'transparent',
                border: `1px solid ${active ? `${sec.accent}40` : 'rgba(255,255,255,0.06)'}`,
                color: active ? sec.accent : 'rgba(192,232,240,0.45)',
              }}
            >
              <sec.icon className="w-3 h-3" />
              {sec.label.toUpperCase()}
              {isPending && (
                <span
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[7px] font-mono flex items-center justify-center"
                  style={{ background: '#ff6b35', color: '#000' }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Section content ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-3"
          >
            {activeSection === 'inbox'        && <InboxSection />}
            {activeSection === 'phone'        && <PhoneSection />}
            {activeSection === 'monitoring'   && <MonitoringSection />}
            {activeSection === 'reservations' && <ReservationsSection />}
            {activeSection === 'documents'    && <DocumentsSection />}
            {activeSection === 'approvals'    && <ApprovalsSection />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── 1. INBOX ──────────────────────────────────────────────────────────────────

function InboxSection() {
  const emails = useConciergeStore((s) => s.emails)
  const outgoing = useConciergeStore((s) => s.outgoingMessages)
  const activityLog = useConciergeStore((s) => s.activityLog)
  const inboxWorkerStatus = useConciergeStore((s) => s.workerStatus.inbox)
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const urgent = emails.filter((e) => e.category === 'urgent')
  const waiting = emails.filter((e) => e.category === 'waiting_on_me')
  const newsletters = emails.filter((e) => e.category === 'newsletter')
  const lowPriority = emails.filter((e) => e.category === 'low_priority')
  const drafts = emails.filter((e) => e.draftReply)
  const followUps = emails.filter((e) => e.followUpCandidate)
  const extractedItems = emails.flatMap((e) => [
    ...e.extractedTasks.map((task) => ({ type: 'task' as const, value: task, from: e.sender, emailId: e.id })),
    ...e.extractedEvents.map((event) => ({ type: 'event' as const, value: event, from: e.sender, emailId: e.id })),
  ])
  const latestInboxFailure = activityLog.find((entry) => entry.workerId === 'inbox' && entry.status === 'failed')
  const liveSyncError = syncError ?? latestInboxFailure?.detail ?? null
  const liveSyncFailed = inboxWorkerStatus === 'error' || Boolean(liveSyncError)
  const showingCachedMessages = liveSyncFailed && emails.length > 0

  async function refreshInbox() {
    setSyncing(true)
    setSyncError(null)
    try {
      const status = await (window.electronAPI?.gmail?.status?.() ?? window.jarvis?.gmail?.status?.() ?? null)
      setGmailStatus(status)
      if (!status?.configured) {
        setSyncing(false)
        return
      }
      await syncInboxFromGmail()
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error))
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    void refreshInbox()
  }, [])

  return (
    <>
      <SectionCard
        title="Inbox Sync"
        icon={<RefreshCw className="w-3.5 h-3.5" />}
        accent="#00d4ff"
        action={
          <button
            onClick={() => void refreshInbox()}
            className="flex items-center gap-1 text-[9px] font-mono rounded px-2 py-1"
            style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.18)', color: '#00d4ff' }}
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing' : 'Refresh'}
          </button>
        }
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>
              {gmailStatus?.configured
                ? liveSyncFailed
                  ? `Configured${gmailStatus.address ? ` for ${gmailStatus.address}` : ''}`
                  : `Connected${gmailStatus.address ? ` as ${gmailStatus.address}` : ''}`
                : 'Gmail not configured'}
            </p>
            <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.55)' }}>
              {gmailStatus?.configured
                ? liveSyncFailed
                  ? showingCachedMessages
                    ? `${emails.length} cached messages · live Gmail sync failed`
                    : 'No live Gmail messages loaded'
                  : `${emails.length} live Gmail messages loaded`
                : gmailStatus?.missing?.length
                  ? `Missing: ${gmailStatus.missing.join(', ')}`
                  : 'Check Gmail auth env vars to enable live inbox sync.'}
            </p>
          </div>
          <StatusBadge status={gmailStatus?.configured ? (liveSyncFailed ? 'failed' : inboxWorkerStatus === 'running' ? 'running' : 'active') : 'failed'} />
        </div>
        {liveSyncError && (
          <p className="text-[10px] font-mono" style={{ color: '#ff6b35' }}>
            {liveSyncError}
          </p>
        )}
        {isGmailApiDisabled(liveSyncError) && (
          <p className="text-[9px] font-mono" style={{ color: 'rgba(255,200,74,0.8)' }}>
            Action needed: enable Gmail API for the Google Cloud project linked to these credentials, then press Refresh.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Urgent" icon={<AlertTriangle className="w-3.5 h-3.5" />} accent="#ff6b35" count={urgent.length}>
        {urgent.length === 0
          ? <EmptyState label="No urgent emails" />
          : urgent.map((e) => <EmailRow key={e.id} email={e} />)
        }
      </SectionCard>

      <SectionCard title="Waiting on Me" icon={<Clock className="w-3.5 h-3.5" />} accent="#ffc84a" count={waiting.length}>
        {waiting.length === 0
          ? <EmptyState label="Nothing waiting" />
          : waiting.map((e) => <EmailRow key={e.id} email={e} />)
        }
      </SectionCard>

      <SectionCard title="Newsletters" icon={<Mail className="w-3.5 h-3.5" />} accent="#9ad1ff" count={newsletters.length}>
        {newsletters.length === 0
          ? <EmptyState label="No newsletters in the latest sync" />
          : newsletters.map((e) => <EmailRow key={e.id} email={e} />)
        }
      </SectionCard>

      <SectionCard title="Low Priority" icon={<Clock className="w-3.5 h-3.5" />} accent="rgba(192,232,240,0.5)" count={lowPriority.length}>
        {lowPriority.length === 0
          ? <EmptyState label="No low-priority messages" />
          : lowPriority.map((e) => <EmailRow key={e.id} email={e} />)
        }
      </SectionCard>

      <SectionCard title="Draft Replies" icon={<Mail className="w-3.5 h-3.5" />} accent="#c084fc" count={drafts.length}>
        {drafts.length === 0
          ? <EmptyState label="No drafts" />
          : drafts.filter((e) => e.draftReply).map((e) => (
            <DraftRow key={e.id} email={e} />
          ))
        }
      </SectionCard>

      <SectionCard title="Extracted Tasks / Events" icon={<Sparkles className="w-3.5 h-3.5" />} accent="#9ad1ff" count={extractedItems.length}>
        {extractedItems.length === 0
          ? <EmptyState label="No tasks or events extracted" />
          : extractedItems.map((item) => (
            <div
              key={`${item.emailId}-${item.type}-${item.value}`}
              className="flex items-start gap-2 rounded-lg px-3 py-2"
              style={{ background: 'rgba(154,209,255,0.04)', border: '1px solid rgba(154,209,255,0.08)' }}
            >
              <Check className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: '#9ad1ff' }} />
              <div>
                <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>{item.value}</p>
                <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.55)' }}>
                  {item.type.toUpperCase()} · from {item.from}
                </p>
              </div>
            </div>
          ))
        }
      </SectionCard>

      <SectionCard title="Follow-up Candidates" icon={<Bell className="w-3.5 h-3.5" />} accent="#ffc84a" count={followUps.length}>
        {followUps.length === 0
          ? <EmptyState label="No follow-up candidates surfaced" />
          : followUps.map((email) => <EmailRow key={`follow-${email.id}`} email={email} />)
        }
      </SectionCard>

      {outgoing.length > 0 && (
        <SectionCard title="Outgoing Queue" icon={<ChevronRight className="w-3.5 h-3.5" />} accent="#c084fc" count={outgoing.filter(m => m.status === 'pending_approval').length}>
          {outgoing.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2"
              style={{ background: 'rgba(192,132,252,0.04)', border: '1px solid rgba(192,132,252,0.1)' }}
            >
              <div className="flex-1">
                <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.7)' }}>To: {m.to}</p>
                <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.85)' }}>{m.subject}</p>
                {m.failureReason && (
                  <p className="text-[9px] font-mono mt-0.5" style={{ color: '#ff6b35' }}>{m.failureReason}</p>
                )}
              </div>
              <StatusBadge status={m.status === 'pending_approval' ? 'needs_approval' : m.status === 'sent' ? 'completed' : m.status} />
            </div>
          ))}
        </SectionCard>
      )}
    </>
  )
}

function EmailRow({ email }: { email: InboxEmail }) {
  const [expanded, setExpanded] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const outgoing = useConciergeStore((s) => s.outgoingMessages)
  const color = CATEGORY_COLOR[email.category]
  const linkedOutgoing = outgoing.find((item) => item.sourceEmailId === email.id && item.status !== 'rejected')

  async function handleGenerateDraft(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    setDrafting(true)
    try {
      await generateDraftReplyForEmail(email.id)
    } finally {
      setDrafting(false)
    }
  }

  function handleQueueDraft(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    queueDraftReplyForApproval(email.id)
  }

  function handleMarkRead(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    markEmailRead(email.id)
  }

  return (
    <div
      className="rounded-lg overflow-hidden cursor-pointer"
      style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${color}22` }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-2.5 px-3 py-2">
        <div className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[9px] font-mono" style={{ color }}>{CATEGORY_LABEL[email.category]}</span>
            <span className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>· {relativeTime(email.receivedAt)}</span>
          </div>
          <p className="text-[10px] font-mono" style={{ color: 'rgba(74,122,138,0.7)' }}>{email.sender}</p>
          <p className="text-[11px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.85)' }}>{email.subject}</p>
        </div>
        <ChevronDown
          className="w-3 h-3 flex-shrink-0 mt-1 transition-transform"
          style={{ color: 'rgba(192,232,240,0.25)', transform: expanded ? 'rotate(180deg)' : undefined }}
        />
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: `${color}15` }}>
          <p className="text-[10px] font-mono whitespace-pre-wrap" style={{ color: 'rgba(192,232,240,0.55)' }}>
            {email.body ?? email.preview}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {email.replyNeeded && <StatusBadge status="needs_approval" />}
            {email.followUpCandidate && <StatusBadge status="needs_follow_up" />}
            {linkedOutgoing && <StatusBadge status={linkedOutgoing.status === 'pending_approval' ? 'needs_approval' : linkedOutgoing.status} />}
          </div>
          {email.extractedTasks.length > 0 && (
            <div className="mt-2">
              <p className="text-[8px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.6)' }}>EXTRACTED TASKS</p>
              {email.extractedTasks.map((t, i) => (
                <p key={i} className="text-[10px] font-mono" style={{ color: '#9ad1ff' }}>· {t}</p>
              ))}
            </div>
          )}
          {email.extractedEvents.length > 0 && (
            <div className="mt-2">
              <p className="text-[8px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.6)' }}>EXTRACTED EVENTS</p>
              {email.extractedEvents.map((eventItem, i) => (
                <p key={i} className="text-[10px] font-mono" style={{ color: '#9ad1ff' }}>· {eventItem}</p>
              ))}
            </div>
          )}
          {email.draftReply && (
            <div className="mt-2 rounded-lg p-2" style={{ background: 'rgba(192,132,252,0.05)', border: '1px solid rgba(192,132,252,0.1)' }}>
              <p className="text-[8px] font-mono mb-1" style={{ color: '#c084fc' }}>DRAFT REPLY</p>
              <pre className="text-[10px] font-mono whitespace-pre-wrap" style={{ color: 'rgba(192,232,240,0.62)' }}>
                {email.draftReply}
              </pre>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={handleGenerateDraft}
              className="px-2.5 py-1 rounded text-[9px] font-mono"
              style={{ background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.2)', color: '#c084fc' }}
            >
              {drafting ? 'Drafting…' : 'Generate draft'}
            </button>
            <button
              onClick={handleQueueDraft}
              disabled={!email.draftReply}
              className="px-2.5 py-1 rounded text-[9px] font-mono disabled:opacity-40"
              style={{ background: 'rgba(255,200,74,0.1)', border: '1px solid rgba(255,200,74,0.2)', color: '#ffc84a' }}
            >
              Queue for approval
            </button>
            {!email.read && (
              <button
                onClick={handleMarkRead}
                className="px-2.5 py-1 rounded text-[9px] font-mono"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(192,232,240,0.65)' }}
              >
                Mark read
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DraftRow({ email }: { email: InboxEmail }) {
  const [expanded, setExpanded] = useState(false)
  const outgoing = useConciergeStore((s) => s.outgoingMessages)
  const linkedOutgoing = outgoing.find((item) => item.sourceEmailId === email.id && item.status !== 'rejected')
  return (
    <div
      className="rounded-lg overflow-hidden cursor-pointer"
      style={{ background: 'rgba(192,132,252,0.05)', border: '1px solid rgba(192,132,252,0.12)' }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Mail className="w-3 h-3 flex-shrink-0" style={{ color: '#c084fc' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.65)' }}>Draft → {email.sender}</p>
          <p className="text-[11px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.85)' }}>{email.subject}</p>
        </div>
        <ChevronDown
          className="w-3 h-3 flex-shrink-0 transition-transform"
          style={{ color: 'rgba(192,232,240,0.25)', transform: expanded ? 'rotate(180deg)' : undefined }}
        />
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'rgba(192,132,252,0.1)' }}>
          <pre className="text-[10px] font-mono whitespace-pre-wrap" style={{ color: 'rgba(192,232,240,0.65)' }}>
            {email.draftReply}
          </pre>
          <div className="flex items-center justify-between gap-3 mt-2">
            <p className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.4)' }}>
              Approval required before sending
            </p>
            {linkedOutgoing && <StatusBadge status={linkedOutgoing.status === 'pending_approval' ? 'needs_approval' : linkedOutgoing.status} />}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={(event) => {
                event.stopPropagation()
                queueDraftReplyForApproval(email.id)
              }}
              className="px-2.5 py-1 rounded text-[9px] font-mono"
              style={{ background: 'rgba(255,200,74,0.1)', border: '1px solid rgba(255,200,74,0.2)', color: '#ffc84a' }}
            >
              Queue for approval
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 2. PHONE ──────────────────────────────────────────────────────────────────

function PhoneSection() {
  const calls            = useConciergeStore((s) => s.calls)
  const outboundQueue    = useConciergeStore((s) => s.outboundQueue)
  const numberStatus     = useConciergeStore((s) => s.conciergeNumberStatus)
  const number           = useConciergeStore((s) => s.conciergeNumber)
  const updateOutbound   = useConciergeStore((s) => s.updateOutboundRequest)

  const [showCallForm, setShowCallForm]   = useState(false)
  const [callContact, setCallContact]     = useState('')
  const [callNumber, setCallNumber]       = useState('')
  const [callInstruction, setCallInstruction] = useState('')
  const [callMode, setCallMode]           = useState<'serious' | 'demo'>('serious')
  const [webhookPort, setWebhookPort]     = useState<number | null>(null)

  const voicemails  = calls.filter((c) => c.status === 'voicemail')
  const recent      = calls.filter((c) => c.status !== 'voicemail').slice(0, 6)
  const pendingCalls = outboundQueue.filter((r) => r.status === 'pending_approval')
  const activeCalls  = outboundQueue.filter((r) => r.status === 'in_progress')
  const failedCalls  = outboundQueue.filter((r) => r.status === 'failed').slice(0, 3)

  useEffect(() => {
    window.electronAPI?.phone?.getWebhookConfig().then((cfg: PhoneWebhookConfig) => {
      setWebhookPort(cfg.port)
    }).catch(() => {})
  }, [])

  function submitCall() {
    if (!callContact.trim() || !callInstruction.trim()) return
    queueOutboundCall(callContact.trim(), callNumber.trim() || undefined, callInstruction.trim(), callMode)
    setCallContact('')
    setCallNumber('')
    setCallInstruction('')
    setShowCallForm(false)
  }

  return (
    <>
      {/* Number status */}
      <SectionCard title="Concierge Number" icon={<Radio className="w-3.5 h-3.5" />} accent="#00d4ff">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>
              {number ?? 'No number configured'}
            </p>
            <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.5)' }}>
              Backbone: Twilio · Voice: Polly / ElevenLabs
              {webhookPort ? ` · Webhook :${webhookPort}` : ''}
            </p>
          </div>
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{
              background: numberStatus === 'active' ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${numberStatus === 'active' ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <motion.div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: numberStatus === 'active' ? '#00ff88' : 'rgba(255,255,255,0.2)' }}
              animate={numberStatus === 'active' ? { opacity: [0.5, 1, 0.5] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-[9px] font-mono" style={{ color: numberStatus === 'active' ? '#00ff88' : 'rgba(192,232,240,0.4)' }}>
              {numberStatus === 'active' ? 'ACTIVE' : numberStatus === 'inactive' ? 'INACTIVE' : 'NOT CONFIGURED'}
            </span>
          </div>
        </div>
      </SectionCard>

      {/* Active calls */}
      {activeCalls.length > 0 && (
        <SectionCard title="In Progress" icon={<PhoneCallIcon className="w-3.5 h-3.5" />} accent="#00ff88" count={activeCalls.length}>
          {activeCalls.map((r) => <OutboundCallRow key={r.id} req={r} onNumberSave={(n) => updateOutbound(r.id, { number: n })} />)}
        </SectionCard>
      )}

      {/* Outbound queue */}
      <SectionCard
        title="Outbound Queue"
        icon={<PhoneOutgoing className="w-3.5 h-3.5" />}
        accent="#ffc84a"
        count={pendingCalls.length}
        action={
          <button
            onClick={() => setShowCallForm((v) => !v)}
            className="flex items-center gap-1 text-[9px] font-mono rounded px-2 py-1"
            style={{ background: 'rgba(255,200,74,0.1)', border: '1px solid rgba(255,200,74,0.2)', color: '#ffc84a' }}
          >
            <Plus className="w-3 h-3" /> New call
          </button>
        }
      >
        {showCallForm && (
          <div className="mb-2 flex flex-col gap-1.5">
            <div className="flex gap-2">
              <input
                value={callContact}
                onChange={(e) => setCallContact(e.target.value)}
                placeholder="Contact name"
                className="flex-1 rounded-lg px-3 py-2 text-[10px] font-mono outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,200,74,0.2)', color: 'rgba(192,232,240,0.9)' }}
              />
              <input
                value={callNumber}
                onChange={(e) => setCallNumber(e.target.value)}
                placeholder="+1 212 555 0100"
                className="w-36 rounded-lg px-3 py-2 text-[10px] font-mono outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,200,74,0.2)', color: 'rgba(192,232,240,0.9)' }}
              />
            </div>
            <input
              value={callInstruction}
              onChange={(e) => setCallInstruction(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCall()}
              placeholder="Instruction — e.g. ask if late checkout is available"
              className="w-full rounded-lg px-3 py-2 text-[10px] font-mono outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,200,74,0.2)', color: 'rgba(192,232,240,0.9)' }}
            />
            <div className="flex gap-2 items-center">
              <select
                value={callMode}
                onChange={(e) => setCallMode(e.target.value as 'serious' | 'demo')}
                className="rounded-lg px-2 py-1.5 text-[10px] font-mono outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,200,74,0.2)', color: 'rgba(192,232,240,0.8)' }}
              >
                <option value="serious">Serious</option>
                <option value="demo">Demo / Party</option>
              </select>
              <button
                onClick={submitCall}
                className="ml-auto px-3 rounded-lg text-[10px] font-mono"
                style={{ background: 'rgba(255,200,74,0.15)', border: '1px solid rgba(255,200,74,0.3)', color: '#ffc84a' }}
              >
                Queue
              </button>
            </div>
          </div>
        )}
        {pendingCalls.length === 0
          ? <EmptyState label="No queued calls" />
          : pendingCalls.map((r) => (
            <OutboundCallRow key={r.id} req={r} onNumberSave={(n) => updateOutbound(r.id, { number: n })} />
          ))
        }
      </SectionCard>

      {/* Failed calls */}
      {failedCalls.length > 0 && (
        <SectionCard title="Failed" icon={<X className="w-3.5 h-3.5" />} accent="#ff6b35" count={failedCalls.length}>
          {failedCalls.map((r) => (
            <OutboundCallRow key={r.id} req={r} onNumberSave={(n) => updateOutbound(r.id, { number: n })} />
          ))}
        </SectionCard>
      )}

      {/* Voicemails */}
      <SectionCard title="Voicemails" icon={<Mic className="w-3.5 h-3.5" />} accent="#00d4ff" count={voicemails.length}>
        {voicemails.length === 0
          ? <EmptyState label="No voicemails" />
          : voicemails.map((c) => <CallRow key={c.id} call={c} />)
        }
      </SectionCard>

      {/* Recent calls */}
      <SectionCard title="Recent Calls" icon={<PhoneCallIcon className="w-3.5 h-3.5" />} accent="#00d4ff" count={recent.length}>
        {recent.length === 0
          ? <EmptyState label="No recent calls" />
          : recent.map((c) => <CallRow key={c.id} call={c} />)
        }
      </SectionCard>
    </>
  )
}

function CallRow({ call }: { call: ConciergeCall }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = call.direction === 'inbound'
    ? call.status === 'voicemail' ? PhoneMissed : PhoneIncoming
    : PhoneOutgoing
  const color = call.direction === 'inbound' ? '#00d4ff' : '#ffc84a'

  return (
    <div
      className="rounded-lg overflow-hidden cursor-pointer"
      style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid rgba(255,255,255,0.06)` }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.82)' }}>{call.contact}</p>
          <p className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>
            {relativeTime(call.timestamp)}{call.durationSecs ? ` · ${fmtDuration(call.durationSecs)}` : ''}
            {call.callSid ? ` · ${call.callSid.slice(0, 12)}…` : ''}
          </p>
        </div>
        {call.status === 'voicemail' && (
          <span className="text-[8px] font-mono rounded px-1.5 py-0.5" style={{ background: 'rgba(255,107,53,0.1)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.2)' }}>VM</span>
        )}
        {call.status === 'failed' && (
          <span className="text-[8px] font-mono rounded px-1.5 py-0.5" style={{ background: 'rgba(255,107,53,0.1)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.2)' }}>FAIL</span>
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {call.summary && <p className="text-[10px] font-mono mb-1" style={{ color: 'rgba(192,232,240,0.6)' }}>{call.summary}</p>}
          {call.failureReason && (
            <p className="text-[9px] font-mono" style={{ color: '#ff6b35' }}>Error: {call.failureReason}</p>
          )}
          {call.transcript && (
            <details className="mt-1">
              <summary className="text-[8px] font-mono cursor-pointer" style={{ color: 'rgba(74,122,138,0.6)' }}>Transcript</summary>
              <p className="text-[9px] font-mono mt-1 whitespace-pre-wrap" style={{ color: 'rgba(192,232,240,0.5)' }}>{call.transcript}</p>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

function OutboundCallRow({ req, onNumberSave }: { req: OutboundCallRequest; onNumberSave?: (n: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [editNumber, setEditNumber] = useState(false)
  const [numInput, setNumInput]     = useState(req.number ?? '')

  const statusColor =
    req.status === 'failed'          ? '#ff6b35' :
    req.status === 'in_progress'     ? '#00ff88' :
    req.status === 'completed'       ? 'rgba(192,232,240,0.4)' :
    req.status === 'pending_approval'? '#ffc84a' : 'rgba(192,232,240,0.3)'

  const modeBadgeBg = req.mode === 'demo'
    ? 'rgba(192,132,252,0.12)'
    : 'rgba(0,212,255,0.08)'
  const modeBadgeColor = req.mode === 'demo' ? '#c084fc' : '#00d4ff'

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: 'rgba(255,200,74,0.04)', border: `1px solid rgba(255,200,74,0.1)` }}
    >
      <div
        className="flex items-start gap-2.5 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <PhoneOutgoing className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: statusColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>{req.contact}</p>
            <span
              className="text-[8px] font-mono rounded px-1.5 py-0.5"
              style={{ background: modeBadgeBg, color: modeBadgeColor, border: `1px solid ${modeBadgeColor}22` }}
            >
              {req.mode.toUpperCase()}
            </span>
          </div>
          {req.callObjective
            ? <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.55)' }}>{req.callObjective}</p>
            : <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.45)' }}>{req.instruction}</p>
          }
          {req.failureReason && (
            <p className="text-[9px] font-mono mt-0.5" style={{ color: '#ff6b35' }}>⚠ {req.failureReason}</p>
          )}
          {!req.number && req.status === 'pending_approval' && (
            <p className="text-[9px] font-mono mt-0.5" style={{ color: '#ffc84a' }}>Number required before approval</p>
          )}
          <p className="text-[8px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.45)' }}>
            {relativeTime(req.createdAt)}{req.callSid ? ` · ${req.callSid.slice(0, 12)}…` : ''}
          </p>
        </div>
        <StatusBadge status={req.status === 'pending_approval' ? 'needs_approval' : req.status === 'completed' ? 'completed' : req.status} />
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'rgba(255,200,74,0.08)' }}>

          {/* Phone number entry / display */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>Number:</span>
            {editNumber ? (
              <>
                <input
                  value={numInput}
                  onChange={(e) => setNumInput(e.target.value)}
                  placeholder="+1 212 555 0100"
                  className="flex-1 rounded px-2 py-1 text-[10px] font-mono outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,200,74,0.3)', color: 'rgba(192,232,240,0.9)' }}
                  autoFocus
                />
                <button
                  onClick={() => { onNumberSave?.(numInput); setEditNumber(false) }}
                  className="text-[9px] font-mono px-2 py-1 rounded"
                  style={{ background: 'rgba(255,200,74,0.15)', color: '#ffc84a' }}
                >Save</button>
              </>
            ) : (
              <>
                <span className="text-[10px] font-mono flex-1" style={{ color: req.number ? 'rgba(192,232,240,0.8)' : 'rgba(192,232,240,0.3)' }}>
                  {req.number ?? 'not set'}
                </span>
                {req.status === 'pending_approval' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditNumber(true) }}
                    className="text-[9px] font-mono px-2 py-1 rounded"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(192,232,240,0.5)' }}
                  >Edit</button>
                )}
              </>
            )}
          </div>

          {/* Script preview */}
          {req.callScript && (
            <div className="rounded-lg p-2 mb-2" style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.08)' }}>
              <p className="text-[8px] font-mono mb-1" style={{ color: 'rgba(0,212,255,0.5)' }}>AI SCRIPT</p>
              <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.7)' }}>{req.callScript.opening}</p>
              {req.callScript.objectives.length > 0 && (
                <ul className="mt-1 list-disc list-inside">
                  {req.callScript.objectives.map((o, i) => (
                    <li key={i} className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.55)' }}>{o}</li>
                  ))}
                </ul>
              )}
              <p className="text-[9px] font-mono mt-1" style={{ color: 'rgba(74,122,138,0.6)' }}>Est. {req.callScript.estimatedDuration}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 3. MONITORING ─────────────────────────────────────────────────────────────

const WATCH_ICONS: Record<string, typeof Eye> = {
  flight: TrendingDown,
  hotel: MapPin,
  ticket: Bell,
  renewal: Clock,
  price_drop: TrendingDown,
}

function MonitoringSection() {
  const watches  = useConciergeStore((s) => s.watches)
  const [showAddForm, setShowAddForm] = useState(false)
  const [watchInput, setWatchInput]   = useState('')
  const [watchType, setWatchType]     = useState<WatchType>('flight')

  const triggered = watches.filter((w) => w.status === 'triggered')
  const active    = watches.filter((w) => w.status === 'active')

  function addNewWatch() {
    if (!watchInput.trim()) return
    addWatch({ type: watchType, label: watchInput.trim(), target: watchInput.trim() })
    setWatchInput('')
    setShowAddForm(false)
  }

  return (
    <>
      {triggered.length > 0 && (
        <SectionCard title="Alerts" icon={<Bell className="w-3.5 h-3.5" />} accent="#ff6b35" count={triggered.length}>
          {triggered.map((w) => <WatchRow key={w.id} watch={w} />)}
        </SectionCard>
      )}

      <SectionCard
        title="Active Watches"
        icon={<Eye className="w-3.5 h-3.5" />}
        accent="#ffc84a"
        count={active.length}
        action={
          <div className="flex gap-1.5">
            <button
              onClick={() => checkAllWatches()}
              className="flex items-center gap-1 text-[9px] font-mono rounded px-2 py-1"
              style={{ background: 'rgba(255,200,74,0.08)', border: '1px solid rgba(255,200,74,0.15)', color: '#ffc84a' }}
            >
              <RefreshCw className="w-3 h-3" /> Check all
            </button>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1 text-[9px] font-mono rounded px-2 py-1"
              style={{ background: 'rgba(255,200,74,0.08)', border: '1px solid rgba(255,200,74,0.15)', color: '#ffc84a' }}
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        }
      >
        {showAddForm && (
          <div className="mb-2 flex gap-2 flex-wrap">
            <select
              value={watchType}
              onChange={(e) => setWatchType(e.target.value as WatchType)}
              className="rounded-lg px-2 py-1.5 text-[10px] font-mono outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,200,74,0.2)', color: 'rgba(192,232,240,0.8)' }}
            >
              <option value="flight">Flight</option>
              <option value="hotel">Hotel</option>
              <option value="ticket">Ticket</option>
              <option value="renewal">Renewal</option>
              <option value="price_drop">Price drop</option>
            </select>
            <input
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNewWatch()}
              placeholder="e.g. LHR → JFK under £400"
              className="flex-1 min-w-32 rounded-lg px-3 py-1.5 text-[10px] font-mono outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,200,74,0.2)', color: 'rgba(192,232,240,0.9)' }}
            />
            <button onClick={addNewWatch} className="px-3 rounded-lg text-[10px] font-mono" style={{ background: 'rgba(255,200,74,0.15)', border: '1px solid rgba(255,200,74,0.3)', color: '#ffc84a' }}>
              Add
            </button>
          </div>
        )}
        {active.length === 0
          ? <EmptyState label="No active watches" />
          : active.map((w) => <WatchRow key={w.id} watch={w} />)
        }
      </SectionCard>
    </>
  )
}

function WatchRow({ watch }: { watch: MonitorWatch }) {
  const Icon = WATCH_ICONS[watch.type] ?? Eye
  const isTriggered = watch.status === 'triggered'

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2"
      style={{
        background: isTriggered ? 'rgba(255,107,53,0.07)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${isTriggered ? 'rgba(255,107,53,0.2)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: isTriggered ? '#ff6b35' : '#ffc84a' }} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.82)' }}>{watch.label}</p>
        {watch.threshold && (
          <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.6)' }}>Threshold: {watch.threshold}</p>
        )}
        {watch.alert && (
          <p className="text-[10px] font-mono mt-0.5" style={{ color: '#ff6b35' }}>{watch.alert}</p>
        )}
        {watch.lastChecked && (
          <p className="text-[8px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.4)' }}>Checked {relativeTime(watch.lastChecked)}</p>
        )}
      </div>
      <span
        className="text-[8px] font-mono rounded px-1.5 py-0.5 flex-shrink-0"
        style={{
          background: isTriggered ? 'rgba(255,107,53,0.12)' : 'rgba(0,212,255,0.08)',
          color: isTriggered ? '#ff6b35' : '#00d4ff',
          border: `1px solid ${isTriggered ? 'rgba(255,107,53,0.25)' : 'rgba(0,212,255,0.15)'}`,
        }}
      >
        {isTriggered ? 'ALERT' : watch.type.toUpperCase()}
      </span>
    </div>
  )
}

// ── 4. RESERVATIONS ───────────────────────────────────────────────────────────

function ReservationsSection() {
  const requests = useConciergeStore((s) => s.bookingRequests)

  const researching = requests.filter((r) => r.status === 'researching')
  const ready       = requests.filter((r) => ['ready_for_approval', 'options_ready', 'pending_approval'].includes(r.status))
  const active      = requests.filter((r) => ['queued_for_call', 'calling'].includes(r.status))
  const resolved    = requests.filter((r) => ['confirmed', 'booked', 'failed', 'needs_follow_up'].includes(r.status))

  return (
    <>
      {ready.length > 0 && (
        <SectionCard title="Ready for Approval" icon={<BookOpen className="w-3.5 h-3.5" />} accent="#00ff88" count={ready.length}>
          {ready.map((r) => <BookingRequestRow key={r.id} req={r} />)}
        </SectionCard>
      )}

      {researching.length > 0 && (
        <SectionCard title="Researching" icon={<RefreshCw className="w-3.5 h-3.5" />} accent="#ffc84a" count={researching.length}>
          {researching.map((r) => <BookingRequestRow key={r.id} req={r} />)}
        </SectionCard>
      )}

      {active.length > 0 && (
        <SectionCard title="Queued / Calling" icon={<PhoneCallIcon className="w-3.5 h-3.5" />} accent="#00d4ff" count={active.length}>
          {active.map((r) => <BookingRequestRow key={r.id} req={r} />)}
        </SectionCard>
      )}

      {resolved.length > 0 && (
        <SectionCard title="Outcomes" icon={<Check className="w-3.5 h-3.5" />} accent="#9ad1ff" count={resolved.length}>
          {resolved.map((r) => <BookingRequestRow key={r.id} req={r} />)}
        </SectionCard>
      )}

      {requests.length === 0 && (
        <SectionCard title="Booking Requests" icon={<MapPin className="w-3.5 h-3.5" />} accent="#00ff88">
          <EmptyState label='Try: "Book dinner for 4 in Mayfair tomorrow at 8pm"' />
        </SectionCard>
      )}
    </>
  )
}

function BookingRequestRow({ req }: { req: BookingRequest }) {
  const calls = useConciergeStore((s) => s.calls)
  const outboundQueue = useConciergeStore((s) => s.outboundQueue)
  const brief = {
    category: req.brief?.category ?? req.type ?? 'other',
    partySize: req.brief?.partySize,
    location: req.brief?.location,
    date: req.brief?.date,
    preferredTime: req.brief?.preferredTime,
    fallbackTimes: req.brief?.fallbackTimes ?? [],
    fallbackDateOptions: req.brief?.fallbackDateOptions ?? [],
    targetBusiness: req.brief?.targetBusiness,
    specialRequests: req.brief?.specialRequests ?? [],
    targetingStatus: req.brief?.targetingStatus ?? 'shortlist',
    ambiguityNote: req.brief?.ambiguityNote,
    negotiationNotes: req.brief?.negotiationNotes ?? [],
  }
  const [expanded, setExpanded] = useState(['ready_for_approval', 'options_ready', 'pending_approval'].includes(req.status))
  const STATUS_COLOR: Record<string, string> = {
    researching: '#ffc84a',
    ready_for_approval: '#00ff88',
    options_ready: '#00ff88',
    pending_approval: '#ffc84a',
    queued_for_call: '#ffc84a',
    calling: '#00d4ff',
    confirmed: '#00ff88',
    booked: '#00ff88',
    needs_follow_up: '#ffc84a',
    failed: '#ff6b35',
  }
  const linkedCall = calls.find((call) => call.id === req.linkedCallId || call.linkedOutboundRequestId === req.linkedCallId)
  const linkedOutbound = outboundQueue.find((call) => call.id === req.linkedCallId)
  const selectedOption = req.selectedOption ?? req.options.find((opt) => opt.id === req.selectedOptionId)

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${STATUS_COLOR[req.status] ?? '#00d4ff'}18` }}
    >
      <div className="flex items-start gap-2.5 px-3 py-2 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: STATUS_COLOR[req.status] }} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.85)' }}>{req.description}</p>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
            <p className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>
              {brief.category} {brief.partySize ? `· party ${brief.partySize}` : ''}
            </p>
            {brief.location && (
              <p className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>· {brief.location}</p>
            )}
            <p className="text-[9px] font-mono" style={{ color: brief.targetingStatus === 'targeted' ? '#00ff88' : brief.targetingStatus === 'ambiguous' ? '#ffc84a' : 'rgba(74,122,138,0.6)' }}>
              · {brief.targetingStatus.replace('_', ' ')}
            </p>
            {req.requiresPhoneCall && (
              <p className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>· phone flow</p>
            )}
          </div>
          {selectedOption && (
            <p className="text-[9px] font-mono mt-0.5" style={{ color: '#9ad1ff' }}>
              Selected: {selectedOption.placeName}{selectedOption.preferredTime ? ` · ${selectedOption.preferredTime}` : ''}
            </p>
          )}
          {req.executionResult?.summary && (
            <p className="text-[10px] font-mono mt-0.5" style={{ color: req.status === 'confirmed' ? '#00ff88' : '#ffc84a' }}>
              {req.executionResult.summary}
            </p>
          )}
          {req.confirmation && req.status !== 'confirmed' && (
            <p className="text-[10px] font-mono mt-0.5" style={{ color: '#00ff88' }}>{req.confirmation}</p>
          )}
        </div>
        <StatusBadge status={req.status as any} />
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="grid grid-cols-2 gap-2 mt-2 mb-2">
            <BriefField label="Date" value={brief.date ?? 'TBD'} />
            <BriefField label="Preferred" value={brief.preferredTime ?? 'TBD'} />
            <BriefField label="Fallbacks" value={brief.fallbackTimes.join(', ') || 'None'} />
            <BriefField label="Target" value={brief.targetBusiness ?? 'Shortlist'} />
          </div>

          {brief.fallbackDateOptions.length > 0 && (
            <p className="text-[9px] font-mono mb-2" style={{ color: 'rgba(192,232,240,0.58)' }}>
              Alternate timing: {brief.fallbackDateOptions.join(', ')}
            </p>
          )}

          {brief.specialRequests.length > 0 && (
            <p className="text-[9px] font-mono mb-2" style={{ color: 'rgba(192,232,240,0.58)' }}>
              Special requests: {brief.specialRequests.join(', ')}
            </p>
          )}

          {brief.negotiationNotes.length > 0 && (
            <p className="text-[9px] font-mono mb-2" style={{ color: 'rgba(192,232,240,0.58)' }}>
              Negotiation: {brief.negotiationNotes.join(' ')}
            </p>
          )}

          {brief.ambiguityNote && (
            <p className="text-[9px] font-mono mb-2" style={{ color: '#ffc84a' }}>
              Clarification needed: {brief.ambiguityNote}
            </p>
          )}

          {req.options.length > 0 && (
            <>
              <p className="text-[8px] font-mono mt-2 mb-1.5" style={{ color: 'rgba(74,122,138,0.6)' }}>SHORTLIST</p>
              <div className="space-y-1.5">
                {req.options.map((opt) => (
                  <div
                    key={opt.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-all hover:brightness-110"
                    style={{
                      background: req.selectedOptionId === opt.id ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${req.selectedOptionId === opt.id ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.07)'}`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (['ready_for_approval', 'options_ready'].includes(req.status)) {
                        selectAndQueueBooking(req.id, opt.id)
                      }
                    }}
                  >
                    <div className="flex-1">
                      <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.85)' }}>
                        {opt.placeName}{opt.preferredTime ? ` · ${opt.preferredTime}` : ''}
                      </p>
                      <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.55)' }}>
                        {[opt.location, opt.detail, opt.phoneNumber].filter(Boolean).join(' · ')}
                      </p>
                      {(opt.rankingReason || opt.ambiguityNote || opt.requiresPhoneLookup || opt.matchConfidence !== undefined) && (
                        <p className="text-[9px] font-mono mt-1" style={{ color: opt.status === 'ambiguous' ? '#ffc84a' : opt.requiresPhoneLookup ? '#ff6b35' : '#9ad1ff' }}>
                          {[
                            opt.rankingReason,
                            opt.matchConfidence !== undefined ? `match ${(opt.matchConfidence * 100).toFixed(0)}%` : '',
                            opt.requiresPhoneLookup ? 'phone lookup needed' : '',
                            opt.ambiguityNote,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {opt.price && <span className="text-[10px] font-mono" style={{ color: '#00ff88' }}>{opt.price}</span>}
                    {req.selectedOptionId === opt.id && <Check className="w-3 h-3" style={{ color: '#00ff88' }} />}
                  </div>
                ))}
              </div>
            </>
          )}

          {req.phoneHandoff && (
            <div className="mt-2 rounded-lg px-3 py-2" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.12)' }}>
              <p className="text-[8px] font-mono mb-1" style={{ color: '#00d4ff' }}>PHONE HANDOFF</p>
              <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.78)' }}>{req.phoneHandoff.reservationObjective}</p>
              <p className="text-[9px] font-mono mt-1" style={{ color: 'rgba(74,122,138,0.58)' }}>
                {[req.phoneHandoff.phoneNumber ?? 'number needed', req.phoneHandoff.fallbackTimes.join(', ')].filter(Boolean).join(' · ')}
              </p>
              {req.phoneHandoff.negotiationStrategy.length > 0 && (
                <p className="text-[9px] font-mono mt-1" style={{ color: 'rgba(192,232,240,0.58)' }}>
                  Strategy: {req.phoneHandoff.negotiationStrategy.join(' ')}
                </p>
              )}
            </div>
          )}

          {(linkedOutbound?.summary || linkedCall?.summary || req.executionResult?.transcript) && (
            <div className="mt-2 rounded-lg px-3 py-2" style={{ background: 'rgba(154,209,255,0.05)', border: '1px solid rgba(154,209,255,0.12)' }}>
              <p className="text-[8px] font-mono mb-1" style={{ color: '#9ad1ff' }}>CALL RESULT</p>
              <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.74)' }}>
                {linkedOutbound?.summary ?? linkedCall?.summary ?? req.executionResult?.summary}
              </p>
            </div>
          )}

          {['ready_for_approval', 'options_ready', 'pending_approval'].includes(req.status) && (
            <p className="text-[8px] font-mono mt-2" style={{ color: 'rgba(74,122,138,0.4)' }}>
              Tap an option to keep the approval request pointed at the best target.
            </p>
          )}

          {req.executionResult?.confirmedDetails && Object.keys(req.executionResult.confirmedDetails).length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {Object.entries(req.executionResult.confirmedDetails).map(([key, value]) => (
                <BriefField key={key} label={key} value={value} />
              ))}
            </div>
          )}

          {(req.executionResult?.fallbackUsed || req.executionResult?.conditions?.length || req.executionResult?.nextBestStep || req.notes) && (
            <div className="mt-2 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-[8px] font-mono mb-1" style={{ color: '#ffc84a' }}>OUTCOME NOTES</p>
              {req.executionResult?.fallbackUsed && (
                <p className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.72)' }}>Fallback used: {req.executionResult.fallbackUsed}</p>
              )}
              {req.executionResult?.conditions && req.executionResult.conditions.length > 0 && (
                <p className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.72)' }}>Conditions: {req.executionResult.conditions.join(', ')}</p>
              )}
              {(req.executionResult?.ambiguityReason || req.executionResult?.nextBestStep || req.notes) && (
                <p className="text-[9px] font-mono mt-1" style={{ color: 'rgba(192,232,240,0.58)' }}>
                  {req.executionResult?.ambiguityReason ?? req.executionResult?.nextBestStep ?? req.notes}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BriefField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <p className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>{label.toUpperCase()}</p>
      <p className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(192,232,240,0.76)' }}>{value}</p>
    </div>
  )
}

// ── 5. DOCUMENTS ──────────────────────────────────────────────────────────────

function DocumentsSection() {
  const documents = useConciergeStore((s) => s.documents)

  const processing = documents.filter((d) => d.status === 'processing')
  const reviewed   = documents.filter((d) => d.status === 'reviewed')
  const drafts     = documents.filter((d) => d.draftReady && d.status !== 'submitted')
  const submitted  = documents.filter((d) => d.status === 'submitted')

  return (
    <>
      {reviewed.length > 0 && (
        <SectionCard title="Reviewed" icon={<FileText className="w-3.5 h-3.5" />} accent="#9ad1ff" count={reviewed.length}>
          {reviewed.map((d) => <DocumentRow key={d.id} doc={d} />)}
        </SectionCard>
      )}

      {drafts.length > 0 && (
        <SectionCard title="Draft Ready" icon={<Check className="w-3.5 h-3.5" />} accent="#00ff88" count={drafts.length}>
          {drafts.map((d) => <DocumentRow key={d.id} doc={d} />)}
        </SectionCard>
      )}

      {processing.length > 0 && (
        <SectionCard title="Processing" icon={<RefreshCw className="w-3.5 h-3.5" />} accent="#ffc84a" count={processing.length}>
          {processing.map((d) => <DocumentRow key={d.id} doc={d} />)}
        </SectionCard>
      )}

      {submitted.length > 0 && (
        <SectionCard title="Submitted" icon={<Check className="w-3.5 h-3.5" />} accent="#00d4ff" count={submitted.length}>
          {submitted.map((d) => <DocumentRow key={d.id} doc={d} />)}
        </SectionCard>
      )}

      {documents.length === 0 && (
        <SectionCard title="Documents" icon={<FileText className="w-3.5 h-3.5" />} accent="#9ad1ff">
          <EmptyState label="No documents uploaded yet" />
        </SectionCard>
      )}
    </>
  )
}

function DocumentRow({ doc }: { doc: DocumentItem }) {
  const [expanded, setExpanded] = useState(false)
  const STATUS_COLOR: Record<string, string> = {
    uploaded: 'rgba(192,232,240,0.3)',
    processing: '#ffc84a',
    reviewed: '#9ad1ff',
    pending_approval: '#ff6b35',
    submitted: '#00ff88',
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${STATUS_COLOR[doc.status] ?? '#9ad1ff'}18` }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: STATUS_COLOR[doc.status] }} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.85)' }}>{doc.name}</p>
          <p className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.5)' }}>
            {doc.type} · {relativeTime(doc.uploadedAt)}
          </p>
        </div>
        <StatusBadge status={doc.status as any} />
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {doc.summary && (
            <p className="text-[10px] font-mono mb-2" style={{ color: 'rgba(192,232,240,0.6)' }}>{doc.summary}</p>
          )}

          {Object.keys(doc.extractedFields).length > 0 && (
            <div className="mb-2">
              <p className="text-[8px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.6)' }}>EXTRACTED FIELDS</p>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(doc.extractedFields).map(([k, v]) => (
                  <div key={k} className="rounded px-2 py-1" style={{ background: 'rgba(154,209,255,0.06)' }}>
                    <p className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>{k}</p>
                    <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.8)' }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {doc.nextSteps.length > 0 && (
            <div className="mb-2">
              <p className="text-[8px] font-mono mb-1" style={{ color: 'rgba(74,122,138,0.6)' }}>NEXT STEPS</p>
              {doc.nextSteps.map((step, i) => (
                <p key={i} className="text-[10px] font-mono" style={{ color: '#9ad1ff' }}>· {step}</p>
              ))}
            </div>
          )}

          {doc.status === 'reviewed' && !doc.draftReady && (
            <button
              onClick={(e) => { e.stopPropagation(); prepareDraft(doc.id) }}
              className="text-[9px] font-mono rounded px-2.5 py-1 mr-2"
              style={{ background: 'rgba(154,209,255,0.1)', border: '1px solid rgba(154,209,255,0.2)', color: '#9ad1ff' }}
            >
              Prepare draft
            </button>
          )}
          {doc.draftReady && doc.status !== 'submitted' && doc.status !== 'pending_approval' && (
            <button
              onClick={(e) => { e.stopPropagation(); queueSubmission(doc.id) }}
              className="text-[9px] font-mono rounded px-2.5 py-1"
              style={{ background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.2)', color: '#ff6b35' }}
            >
              Queue submission
            </button>
          )}
          {doc.status === 'pending_approval' && (
            <p className="text-[9px] font-mono" style={{ color: 'rgba(255,107,53,0.7)' }}>Awaiting approval to submit</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── 6. APPROVALS + ACTIVITY ────────────────────────────────────────────────────

function ApprovalsSection() {
  const approvalQueue = useConciergeStore((s) => s.approvalQueue)
  const activityLog   = useConciergeStore((s) => s.activityLog)

  const pending  = approvalQueue.filter((a) => a.status === 'pending')
  const resolved = approvalQueue.filter((a) => a.status !== 'pending').slice(0, 10)

  const RISK_COLOR = { low: '#00ff88', medium: '#ffc84a', high: '#ff6b35' }

  return (
    <>
      <SectionCard title="Approval Queue" icon={<Shield className="w-3.5 h-3.5" />} accent="#ff6b35" count={pending.length}>
        {pending.length === 0
          ? <EmptyState label="No pending approvals" />
          : pending.map((item) => (
            <ApprovalRow key={item.id} item={item} />
          ))
        }
      </SectionCard>

      {resolved.length > 0 && (
        <SectionCard title="Recent Decisions" icon={<Check className="w-3.5 h-3.5" />} accent="rgba(192,232,240,0.3)">
          {resolved.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              {item.status === 'approved'
                ? <Check className="w-3 h-3 flex-shrink-0" style={{ color: '#00ff88' }} />
                : <X className="w-3 h-3 flex-shrink-0" style={{ color: '#ff6b35' }} />
              }
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-mono truncate" style={{ color: 'rgba(192,232,240,0.65)' }}>{item.title}</p>
              </div>
              <span className="text-[8px] font-mono flex-shrink-0" style={{ color: item.status === 'approved' ? '#00ff88' : '#ff6b35' }}>
                {item.status.toUpperCase()}
              </span>
            </div>
          ))}
        </SectionCard>
      )}

      <SectionCard title="Activity Timeline" icon={<Clock className="w-3.5 h-3.5" />} accent="#00d4ff" count={activityLog.length}>
        {activityLog.length === 0
          ? <EmptyState label="No activity yet" />
          : activityLog.slice(0, 20).map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))
        }
      </SectionCard>
    </>
  )
}

function ApprovalRow({ item }: { item: ApprovalItem }) {
  const RISK_COLOR = { low: '#00ff88', medium: '#ffc84a', high: '#ff6b35' }
  const workerAcc  = workerAccent(item.workerId)

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: 'rgba(255,107,53,0.06)', border: '1px solid rgba(255,107,53,0.15)' }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2 mb-1.5">
          <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#ff6b35' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.9)' }}>{item.title}</p>
              <span
                className="text-[7px] font-mono rounded px-1 py-0.5"
                style={{ background: `${RISK_COLOR[item.riskLevel]}15`, color: RISK_COLOR[item.riskLevel], border: `1px solid ${RISK_COLOR[item.riskLevel]}30` }}
              >
                {item.riskLevel.toUpperCase()} RISK
              </span>
            </div>
            <p className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.7)' }}>
              <span style={{ color: workerAcc }}>{item.workerId}</span> · {relativeTime(item.createdAt)}
            </p>
            <p className="text-[10px] font-mono mt-1 whitespace-pre-wrap" style={{ color: 'rgba(192,232,240,0.55)' }}>
              {item.description}
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => approveAction(item.id)}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[10px] font-mono transition-all hover:brightness-110"
            style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}
          >
            <Check className="w-3 h-3" /> Approve
          </button>
          <button
            onClick={() => rejectAction(item.id)}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[10px] font-mono transition-all hover:brightness-110"
            style={{ background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.2)', color: '#ff6b35' }}
          >
            <X className="w-3 h-3" /> Reject
          </button>
        </div>
      </div>
    </div>
  )
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const accent = workerAccent(entry.workerId)
  const STATUS_COLOR: Record<string, string> = {
    success: '#00ff88',
    failed: '#ff6b35',
    pending: '#ffc84a',
    info: '#00d4ff',
  }

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div
        className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: STATUS_COLOR[entry.status] }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono" style={{ color: accent }}>{entry.workerId}</span>
          <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.65)' }}>{entry.action}</span>
        </div>
        {entry.detail && (
          <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.55)' }}>{entry.detail}</p>
        )}
      </div>
      <span className="text-[8px] font-mono flex-shrink-0" style={{ color: 'rgba(74,122,138,0.4)' }}>
        {relativeTime(entry.timestamp)}
      </span>
    </div>
  )
}

// ── Shared primitives ──────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon,
  accent,
  count,
  action,
  children,
}: {
  title: string
  icon: React.ReactNode
  accent: string
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-xl px-4 py-3.5"
      style={{ background: 'rgba(4,12,20,0.65)', border: `1px solid ${accent}16` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: accent }}>{icon}</span>
        <span className="text-[9px] font-mono tracking-[0.18em]" style={{ color: accent }}>
          {title.toUpperCase()}
        </span>
        {count !== undefined && count > 0 && (
          <span
            className="text-[8px] font-mono rounded-full px-1.5 py-0.5 min-w-[18px] text-center"
            style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}28` }}
          >
            {count}
          </span>
        )}
        <div className="flex-1 h-px" style={{ background: `${accent}14` }} />
        {action && <div>{action}</div>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    needs_approval: { label: 'APPROVAL', color: '#ff6b35' },
    pending_approval: { label: 'APPROVAL', color: '#ff6b35' },
    queued:           { label: 'QUEUED',   color: '#ffc84a' },
    running:          { label: 'RUNNING',  color: '#00d4ff' },
    queued_for_call:  { label: 'QUEUED',   color: '#ffc84a' },
    in_progress:      { label: 'CALLING',  color: '#00d4ff' },
    calling:          { label: 'CALLING',  color: '#00d4ff' },
    completed:        { label: 'DONE',     color: '#00ff88' },
    confirmed:        { label: 'CONFIRMED', color: '#00ff88' },
    sent:             { label: 'SENT',     color: '#00ff88' },
    submitted:        { label: 'SENT',     color: '#00ff88' },
    approved:         { label: 'APPROVED', color: '#00ff88' },
    failed:           { label: 'FAILED',   color: '#ff6b35' },
    rejected:         { label: 'REJECTED', color: '#ff6b35' },
    researching:      { label: 'RESEARCH', color: '#ffc84a' },
    ready_for_approval: { label: 'READY',  color: '#00ff88' },
    needs_follow_up:  { label: 'FOLLOW-UP', color: '#ffc84a' },
    reviewed:         { label: 'REVIEWED', color: '#9ad1ff' },
    processing:       { label: 'PROC…',    color: '#ffc84a' },
    voicemail:        { label: 'VM',       color: '#ff6b35' },
    active:           { label: 'ACTIVE',   color: '#00d4ff' },
  }
  const { label, color } = map[status] ?? { label: status.toUpperCase(), color: 'rgba(192,232,240,0.3)' }
  return (
    <span
      className="text-[8px] font-mono rounded px-1.5 py-0.5 flex-shrink-0"
      style={{ background: `${color}12`, color, border: `1px solid ${color}28` }}
    >
      {label}
    </span>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-mono py-1" style={{ color: 'rgba(74,122,138,0.45)' }}>
      {label}
    </p>
  )
}
