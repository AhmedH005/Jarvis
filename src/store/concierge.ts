import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  WorkerId,
  WorkerStatus,
  InboxEmail,
  OutgoingMessage,
  PhoneCall,
  OutboundCallRequest,
  ConciergeNumberStatus,
  MonitorWatch,
  BookingRequest,
  BookingOption,
  DocumentItem,
  ApprovalItem,
  ApprovalStatus,
  ActivityEntry,
  ActivityStatus,
  ConciergeJob,
  JobStatus,
} from '@/features/concierge/conciergeTypes'

// ── State shape ───────────────────────────────────────────────────────────────

interface ConciergeState {
  // ── Inbox ──────────────────────────────────────────────────────────────────
  emails: InboxEmail[]
  outgoingMessages: OutgoingMessage[]
  addEmail: (email: InboxEmail) => void
  setEmails: (emails: InboxEmail[]) => void
  updateEmail: (id: string, updates: Partial<InboxEmail>) => void
  addOutgoingMessage: (msg: OutgoingMessage) => void
  updateOutgoingMessage: (id: string, updates: Partial<OutgoingMessage>) => void

  // ── Phone ──────────────────────────────────────────────────────────────────
  calls: PhoneCall[]
  outboundQueue: OutboundCallRequest[]
  conciergeNumberStatus: ConciergeNumberStatus
  conciergeNumber: string | null
  addCall: (call: PhoneCall) => void
  updateCall: (id: string, updates: Partial<PhoneCall>) => void
  addOutboundRequest: (req: OutboundCallRequest) => void
  updateOutboundRequest: (id: string, updates: Partial<OutboundCallRequest>) => void
  setConciergeNumber: (number: string, status: ConciergeNumberStatus) => void

  // ── Monitoring ─────────────────────────────────────────────────────────────
  watches: MonitorWatch[]
  addWatch: (watch: MonitorWatch) => void
  updateWatch: (id: string, updates: Partial<MonitorWatch>) => void
  removeWatch: (id: string) => void

  // ── Reservations ───────────────────────────────────────────────────────────
  bookingRequests: BookingRequest[]
  addBookingRequest: (req: BookingRequest) => void
  updateBookingRequest: (id: string, updates: Partial<BookingRequest>) => void
  setBookingOptions: (id: string, options: BookingOption[]) => void

  // ── Documents ──────────────────────────────────────────────────────────────
  documents: DocumentItem[]
  addDocument: (doc: DocumentItem) => void
  updateDocument: (id: string, updates: Partial<DocumentItem>) => void

  // ── Approvals ──────────────────────────────────────────────────────────────
  approvalQueue: ApprovalItem[]
  addApproval: (item: ApprovalItem) => void
  resolveApproval: (id: string, status: ApprovalStatus) => void
  pendingApprovalCount: () => number

  // ── Activity Log ───────────────────────────────────────────────────────────
  activityLog: ActivityEntry[]
  logActivity: (workerId: WorkerId, action: string, status: ActivityStatus, detail?: string) => void

  // ── Jobs ───────────────────────────────────────────────────────────────────
  jobs: ConciergeJob[]
  addJob: (job: ConciergeJob) => void
  updateJob: (id: string, status: JobStatus) => void

  // ── Worker statuses ────────────────────────────────────────────────────────
  workerStatus: Record<WorkerId, WorkerStatus>
  setWorkerStatus: (workerId: WorkerId, status: WorkerStatus) => void
}

// ── Seed data — must be defined BEFORE the store so create() can reference them ──

const SEED_EMAILS: InboxEmail[] = []
const SEED_CALLS: PhoneCall[] = []
const SEED_WATCHES: MonitorWatch[] = []
const SEED_BOOKINGS: BookingRequest[] = []
const SEED_DOCUMENTS: DocumentItem[] = []
const SEED_APPROVALS: ApprovalItem[] = []
const SEED_ACTIVITY: ActivityEntry[] = []

const LEGACY_SEED_IDS = new Set([
  'em-001',
  'em-002',
  'em-003',
  'call-001',
  'watch-001',
  'watch-002',
  'book-001',
  'doc-001',
  'appr-001',
  'act-seed-1',
  'act-seed-2',
  'act-seed-3',
])

function stripSeedRecords(state: Record<string, unknown>): Record<string, unknown> {
  const record = { ...state }

  const emails = Array.isArray(record['emails']) ? record['emails'] as InboxEmail[] : []
  const calls = Array.isArray(record['calls']) ? record['calls'] as PhoneCall[] : []
  const watches = Array.isArray(record['watches']) ? record['watches'] as MonitorWatch[] : []
  const bookingRequests = Array.isArray(record['bookingRequests']) ? record['bookingRequests'] as BookingRequest[] : []
  const documents = Array.isArray(record['documents']) ? record['documents'] as DocumentItem[] : []
  const approvalQueue = Array.isArray(record['approvalQueue']) ? record['approvalQueue'] as ApprovalItem[] : []
  const activityLog = Array.isArray(record['activityLog']) ? record['activityLog'] as ActivityEntry[] : []

  return {
    ...record,
    emails: emails.filter((item) => !LEGACY_SEED_IDS.has(item.id)),
    calls: calls.filter((item) => !LEGACY_SEED_IDS.has(item.id)),
    watches: watches.filter((item) => !LEGACY_SEED_IDS.has(item.id)),
    bookingRequests: bookingRequests.filter((item) => !LEGACY_SEED_IDS.has(item.id)),
    documents: documents.filter((item) => !LEGACY_SEED_IDS.has(item.id)),
    approvalQueue: approvalQueue.filter((item) => !LEGACY_SEED_IDS.has(item.id)),
    activityLog: activityLog.filter((item) => !LEGACY_SEED_IDS.has(item.id)),
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useConciergeStore = create<ConciergeState>()(
  persist(
    (set, get) => ({
      // ── Inbox ────────────────────────────────────────────────────────────────
      emails: SEED_EMAILS,
      outgoingMessages: [],

      addEmail: (email) => set((s) => ({ emails: [email, ...s.emails] })),
      setEmails: (emails) => set({ emails }),
      updateEmail: (id, updates) =>
        set((s) => ({ emails: s.emails.map((e) => (e.id === id ? { ...e, ...updates } : e)) })),

      addOutgoingMessage: (msg) =>
        set((s) => ({ outgoingMessages: [msg, ...s.outgoingMessages] })),
      updateOutgoingMessage: (id, updates) =>
        set((s) => ({
          outgoingMessages: s.outgoingMessages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        })),

      // ── Phone ────────────────────────────────────────────────────────────────
      calls: SEED_CALLS,
      outboundQueue: [],
      conciergeNumberStatus: 'not_configured',
      conciergeNumber: null,

      addCall: (call) => set((s) => ({ calls: [call, ...s.calls] })),
      updateCall: (id, updates) =>
        set((s) => ({ calls: s.calls.map((c) => (c.id === id ? { ...c, ...updates } : c)) })),
      addOutboundRequest: (req) =>
        set((s) => ({ outboundQueue: [req, ...s.outboundQueue] })),
      updateOutboundRequest: (id, updates) =>
        set((s) => ({
          outboundQueue: s.outboundQueue.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),
      setConciergeNumber: (number, status) =>
        set({ conciergeNumber: number, conciergeNumberStatus: status }),

      // ── Monitoring ───────────────────────────────────────────────────────────
      watches: SEED_WATCHES,

      addWatch: (watch) => set((s) => ({ watches: [watch, ...s.watches] })),
      updateWatch: (id, updates) =>
        set((s) => ({ watches: s.watches.map((w) => (w.id === id ? { ...w, ...updates } : w)) })),
      removeWatch: (id) => set((s) => ({ watches: s.watches.filter((w) => w.id !== id) })),

      // ── Reservations ─────────────────────────────────────────────────────────
      bookingRequests: SEED_BOOKINGS,

      addBookingRequest: (req) =>
        set((s) => ({ bookingRequests: [req, ...s.bookingRequests] })),
      updateBookingRequest: (id, updates) =>
        set((s) => ({
          bookingRequests: s.bookingRequests.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),
      setBookingOptions: (id, options) =>
        set((s) => ({
          bookingRequests: s.bookingRequests.map((r) =>
            r.id === id ? { ...r, options, status: 'ready_for_approval' } : r
          ),
        })),

      // ── Documents ────────────────────────────────────────────────────────────
      documents: SEED_DOCUMENTS,

      addDocument: (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
      updateDocument: (id, updates) =>
        set((s) => ({
          documents: s.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        })),

      // ── Approvals ────────────────────────────────────────────────────────────
      approvalQueue: SEED_APPROVALS,

      addApproval: (item) =>
        set((s) => ({ approvalQueue: [item, ...s.approvalQueue] })),
      resolveApproval: (id, status) =>
        set((s) => ({
          approvalQueue: s.approvalQueue.map((a) =>
            a.id === id ? { ...a, status, resolvedAt: new Date().toISOString() } : a
          ),
        })),
      pendingApprovalCount: () =>
        get().approvalQueue.filter((a) => a.status === 'pending').length,

      // ── Activity Log ─────────────────────────────────────────────────────────
      activityLog: SEED_ACTIVITY,

      logActivity: (workerId, action, status, detail) =>
        set((s) => ({
          activityLog: [
            {
              id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              workerId,
              action,
              detail,
              status,
              timestamp: new Date().toISOString(),
            },
            ...s.activityLog.slice(0, 199),
          ],
        })),

      // ── Jobs ─────────────────────────────────────────────────────────────────
      jobs: [],

      addJob: (job) => set((s) => ({ jobs: [job, ...s.jobs] })),
      updateJob: (id, status) =>
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id ? { ...j, status, updatedAt: new Date().toISOString() } : j
          ),
        })),

      // ── Worker statuses ──────────────────────────────────────────────────────
      workerStatus: {
        inbox: 'idle',
        phone: 'idle',
        monitoring: 'idle',
        reservations: 'idle',
        documents: 'idle',
      },

      setWorkerStatus: (workerId, status) =>
        set((s) => ({ workerStatus: { ...s.workerStatus, [workerId]: status } })),
    }),
    {
      name: 'jarvis-concierge',
      version: 2,
      migrate: (persistedState) => stripSeedRecords((persistedState ?? {}) as Record<string, unknown>),
      // Only persist structural data, not transient worker statuses
      partialize: (s) => ({
        emails: s.emails,
        outgoingMessages: s.outgoingMessages,
        calls: s.calls,
        outboundQueue: s.outboundQueue,
        conciergeNumber: s.conciergeNumber,
        conciergeNumberStatus: s.conciergeNumberStatus,
        watches: s.watches,
        bookingRequests: s.bookingRequests,
        documents: s.documents,
        approvalQueue: s.approvalQueue,
        activityLog: s.activityLog.slice(0, 50),
      }),
    }
  )
)
