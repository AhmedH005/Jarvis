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

const SEED_EMAILS: InboxEmail[] = [
  {
    id: 'em-001',
    sender: 'partner@acme.io',
    subject: 'Re: Contract review — please confirm by Friday',
    preview: 'Hey, just following up on the contract. We need your sign-off by end of week\u2026',
    category: 'urgent',
    extractedTasks: ['Review and sign Acme contract before Friday'],
    extractedEvents: [],
    receivedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    read: false,
  },
  {
    id: 'em-002',
    sender: 'bank@statements.hsbc.com',
    subject: 'Your March statement is ready',
    preview: 'View your March statement in online banking\u2026',
    category: 'low_priority',
    extractedTasks: [],
    extractedEvents: [],
    receivedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    read: true,
  },
  {
    id: 'em-003',
    sender: 'sarah@design.co',
    subject: 'Mockups sent — waiting on your feedback',
    preview: "Hi, I've shared the new mockups via Figma. Let me know what you think\u2026",
    category: 'waiting_on_me',
    extractedTasks: ['Review Figma mockups from Sarah'],
    extractedEvents: [],
    receivedAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
    read: true,
  },
]

const SEED_CALLS: PhoneCall[] = [
  {
    id: 'call-001',
    direction: 'inbound',
    contact: 'Unknown (+44 7700 123 456)',
    summary: 'Caller asked about appointment availability next Tuesday.',
    status: 'voicemail',
    durationSecs: 42,
    timestamp: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
]

const SEED_WATCHES: MonitorWatch[] = [
  {
    id: 'watch-001',
    type: 'flight',
    label: 'LHR \u2192 JFK — price watch',
    target: 'BA178',
    threshold: '< \u00a3450',
    status: 'active',
    lastChecked: new Date(Date.now() - 30 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
  },
  {
    id: 'watch-002',
    type: 'hotel',
    label: 'Claridges — availability watch',
    target: 'Claridges London',
    threshold: 'Any room 14\u201316 April',
    status: 'active',
    lastChecked: new Date(Date.now() - 60 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 86400_000).toISOString(),
  },
]

const SEED_BOOKINGS: BookingRequest[] = [
  {
    id: 'book-001',
    type: 'restaurant',
    description: 'Dinner for 4 in Mayfair, tomorrow at 8pm',
    brief: {
      id: 'brief-001',
      category: 'restaurant',
      requestText: 'Dinner for 4 in Mayfair, tomorrow at 8pm',
      title: 'Dinner reservation',
      location: 'Mayfair',
      date: new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10),
      preferredTime: '20:00',
      fallbackTimes: ['20:30'],
      fallbackDateOptions: [],
      partySize: 4,
      specialRequests: [],
      negotiationNotes: [],
      targetingStatus: 'shortlist',
      source: 'user_request',
    },
    options: [
      {
        id: 'opt-a',
        category: 'restaurant',
        title: "Scott's - 8pm",
        placeName: "Scott's",
        location: 'Mount Street, Mayfair',
        preferredTime: '20:00',
        partySize: 4,
        notes: 'Classic seafood room.',
        source: 'seed',
        status: 'shortlisted',
        detail: 'Mount Street, Mayfair · ££££',
        available: true,
      },
      {
        id: 'opt-b',
        category: 'restaurant',
        title: 'Sexy Fish - 8:30pm',
        placeName: 'Sexy Fish',
        location: 'Berkeley Square',
        preferredTime: '20:30',
        partySize: 4,
        notes: 'Lively option if Scott\'s is full.',
        source: 'seed',
        status: 'shortlisted',
        detail: 'Berkeley Square · ££££',
        available: true,
      },
      {
        id: 'opt-c',
        category: 'restaurant',
        title: 'Nobu - 7:30pm',
        placeName: 'Nobu',
        location: 'Metropolitan Hotel',
        preferredTime: '19:30',
        partySize: 4,
        source: 'seed',
        status: 'shortlisted',
        detail: 'Metropolitan Hotel · £££',
        available: true,
      },
    ],
    status: 'ready_for_approval',
    requiresPhoneCall: true,
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
]

const SEED_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc-001',
    name: 'NDA_Acme_Draft.pdf',
    type: 'form',
    extractedFields: {
      Parties: 'Ahmed H. / Acme Inc.',
      'Effective date': '1 April 2026',
      Term: '2 years',
      'Governing law': 'England & Wales',
    },
    summary: 'Standard mutual NDA. No unusual clauses. Effective 1 April 2026 for 2 years.',
    nextSteps: ['Review governing law clause', 'Sign and return before Friday'],
    draftReady: false,
    status: 'reviewed',
    uploadedAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
  },
]

const SEED_APPROVALS: ApprovalItem[] = [
  {
    id: 'appr-001',
    workerId: 'reservations',
    title: "Call Scott's to book dinner for 4",
    description: "Jarvis will call Scott's Mount Street and request a table for 4 at 8pm tomorrow. If unavailable, will try 8:30pm.",
    riskLevel: 'low',
    status: 'pending',
    actionRef: 'reservations:call-restaurant:book-001:opt-a',
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
]

const SEED_ACTIVITY: ActivityEntry[] = [
  {
    id: 'act-seed-1',
    workerId: 'inbox',
    action: 'Inbox triaged',
    detail: '3 emails classified: 1 urgent, 1 waiting, 1 low priority',
    status: 'success',
    timestamp: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: 'act-seed-2',
    workerId: 'monitoring',
    action: 'Flight watch checked',
    detail: 'BA178 LHR\u2192JFK \u2014 \u00a3512 (above \u00a3450 threshold)',
    status: 'info',
    timestamp: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
  {
    id: 'act-seed-3',
    workerId: 'reservations',
    action: 'Booking options prepared',
    detail: 'Found 3 restaurant options for Mayfair dinner \u2014 pending your selection',
    status: 'pending',
    timestamp: new Date(Date.now() - 3600_000).toISOString(),
  },
]

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
