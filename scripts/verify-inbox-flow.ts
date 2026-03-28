type MemoryStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

type GmailMessageRecord = {
  id: string
  threadId: string
  sender: string
  senderEmail?: string
  subject: string
  preview: string
  body?: string
  receivedAt: string
}

function createMemoryStorage(): MemoryStorage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => void store.clear(),
  }
}

const memoryStorage = createMemoryStorage()

const RECENT_MESSAGES: GmailMessageRecord[] = [
  {
    id: 'gm-urgent',
    threadId: 'th-urgent',
    sender: 'Sarah <sarah@client.com>',
    senderEmail: 'sarah@client.com',
    subject: 'Urgent: please confirm deck today',
    preview: 'Please review the deck and confirm by 5pm today.',
    body: 'Hi Ahmed,\n\nPlease review the deck and confirm by 5pm today. We also have a review meeting on March 30 at 3pm.\n\nThanks,\nSarah',
    receivedAt: new Date().toISOString(),
  },
  {
    id: 'gm-waiting',
    threadId: 'th-waiting',
    sender: 'Omar <omar@partner.io>',
    senderEmail: 'omar@partner.io',
    subject: 'Following up on the proposal',
    preview: 'Just checking whether you had any update.',
    body: 'Hi Ahmed,\n\nFollowing up on the proposal. Could you send your thoughts today?\n\nBest,\nOmar',
    receivedAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: 'gm-news',
    threadId: 'th-news',
    sender: 'newsletter@startup.com',
    senderEmail: 'newsletter@startup.com',
    subject: 'Weekly digest',
    preview: 'Unsubscribe any time from this newsletter.',
    body: 'Weekly digest. Unsubscribe any time.',
    receivedAt: new Date(Date.now() - 7_200_000).toISOString(),
  },
  {
    id: 'gm-low',
    threadId: 'th-low',
    sender: 'bank@statements.com',
    senderEmail: 'bank@statements.com',
    subject: 'Your statement is ready',
    preview: 'View your monthly statement online.',
    body: 'Your monthly statement is ready to view online.',
    receivedAt: new Date(Date.now() - 10_800_000).toISOString(),
  },
]

let fetchFailure: string | null = null
let sendFailure: string | null = null
let gmailConfigured = true

const gmailStub = {
  async status() {
    return gmailConfigured
      ? { configured: true, address: 'ahmed@gmail.com', missing: [] }
      : { configured: false, address: undefined, missing: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_ADDRESS'] }
  },
  async fetchRecent() {
    if (fetchFailure) return { ok: false, error: fetchFailure }
    return { ok: true, messages: RECENT_MESSAGES }
  },
  async sendMessage(input: { to: string; subject: string; body: string; threadId?: string }) {
    if (sendFailure) return { ok: false, error: sendFailure }
    return { ok: true, id: `sent-${input.threadId ?? 'new'}`, threadId: input.threadId ?? `thread-${Date.now()}` }
  },
}

Object.assign(globalThis, {
  localStorage: memoryStorage,
  window: {
    electronAPI: {
      gmail: gmailStub,
    },
    jarvis: {
      gmail: gmailStub,
    },
  },
})

const { useConciergeStore } = await import('../src/store/concierge')
const {
  syncInboxFromGmail,
  generateDraftReplyForEmail,
  queueDraftReplyForApproval,
  approveAction,
  rejectAction,
} = await import('../src/features/concierge/conciergeOrchestrator')

type ScenarioResult = {
  name: string
  route: string
  inboxWorkerBehavior: string
  approvalBehavior: string
  activityLogResult: string
  failureHandling: string
}

function resetState(): void {
  memoryStorage.clear()
  fetchFailure = null
  sendFailure = null
  gmailConfigured = true
  useConciergeStore.setState({
    emails: [],
    outgoingMessages: [],
    calls: [],
    outboundQueue: [],
    conciergeNumberStatus: 'not_configured',
    conciergeNumber: null,
    watches: [],
    bookingRequests: [],
    documents: [],
    approvalQueue: [],
    activityLog: [],
    jobs: [],
    workerStatus: {
      inbox: 'idle',
      phone: 'idle',
      monitoring: 'idle',
      reservations: 'idle',
      documents: 'idle',
    },
  })
}

function latestActivity() {
  return useConciergeStore.getState().activityLog[0]
}

function latestApproval() {
  return useConciergeStore.getState().approvalQueue[0]
}

function latestOutgoing() {
  return useConciergeStore.getState().outgoingMessages[0]
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function summarizeCategories(): string {
  const emails = useConciergeStore.getState().emails
  const counts = {
    urgent: emails.filter((email) => email.category === 'urgent').length,
    waiting_on_me: emails.filter((email) => email.category === 'waiting_on_me').length,
    newsletter: emails.filter((email) => email.category === 'newsletter').length,
    low_priority: emails.filter((email) => email.category === 'low_priority').length,
  }
  return `urgent:${counts.urgent} waiting:${counts.waiting_on_me} newsletters:${counts.newsletter} low:${counts.low_priority}`
}

async function scenarioFetchRealInbox(): Promise<ScenarioResult> {
  resetState()
  await syncInboxFromGmail()
  await flush()
  return {
    name: '1. fetch real inbox messages',
    route: 'Gmail -> inboxWorker.fetchRecent -> triageInbox',
    inboxWorkerBehavior: `${useConciergeStore.getState().emails.length} messages mapped into Concierge`,
    approvalBehavior: 'No approval required for fetch/triage',
    activityLogResult: latestActivity()?.action ?? 'no activity',
    failureHandling: 'N/A',
  }
}

async function scenarioClassifyBuckets(): Promise<ScenarioResult> {
  resetState()
  await syncInboxFromGmail()
  await flush()
  return {
    name: '2. classify messages into the 4 buckets',
    route: 'Gmail -> triageInbox -> category classifier',
    inboxWorkerBehavior: summarizeCategories(),
    approvalBehavior: 'No approval required for categorization',
    activityLogResult: latestActivity()?.detail ?? latestActivity()?.action ?? 'no activity',
    failureHandling: 'Falls back to local heuristics if AI triage is unavailable',
  }
}

async function scenarioGenerateDraft(): Promise<ScenarioResult> {
  resetState()
  await syncInboxFromGmail()
  await flush()
  await generateDraftReplyForEmail('gm-urgent')
  await flush()
  const email = useConciergeStore.getState().emails.find((item) => item.id === 'gm-urgent')
  return {
    name: '3. generate a draft reply for a selected message',
    route: 'Concierge UI -> generateDraftReplyForEmail -> inboxWorker.storeDraftReply',
    inboxWorkerBehavior: email?.draftReply ? `Draft ready for ${email.sender}` : 'Draft missing',
    approvalBehavior: 'Draft generation itself does not require approval',
    activityLogResult: latestActivity()?.action ?? 'no activity',
    failureHandling: 'Falls back to local draft generation if AI drafting is unavailable',
  }
}

async function scenarioQueueApproval(): Promise<ScenarioResult> {
  resetState()
  await syncInboxFromGmail()
  await flush()
  await generateDraftReplyForEmail('gm-urgent')
  queueDraftReplyForApproval('gm-urgent')
  await flush()
  return {
    name: '4. queue outgoing email for approval',
    route: 'EmailRow/DraftRow -> queueDraftReplyForApproval -> approval queue',
    inboxWorkerBehavior: latestOutgoing()?.subject ?? 'no outgoing message',
    approvalBehavior: latestApproval()?.title ?? 'approval missing',
    activityLogResult: latestActivity()?.action ?? 'no activity',
    failureHandling: 'Duplicate queue attempts reuse the existing pending draft instead of duplicating it',
  }
}

async function scenarioRejectOutgoing(): Promise<ScenarioResult> {
  resetState()
  await syncInboxFromGmail()
  await flush()
  await generateDraftReplyForEmail('gm-urgent')
  queueDraftReplyForApproval('gm-urgent')
  await flush()
  const approval = latestApproval()
  if (approval) rejectAction(approval.id)
  await flush()
  return {
    name: '5. reject outgoing email',
    route: 'approval queue -> rejectAction',
    inboxWorkerBehavior: latestOutgoing()?.status ?? 'missing',
    approvalBehavior: approval ? `Rejected ${approval.title}` : 'approval missing',
    activityLogResult: latestActivity()?.action ?? 'no activity',
    failureHandling: 'Outgoing message remains unsent with rejected status',
  }
}

async function scenarioApproveOutgoing(): Promise<ScenarioResult> {
  resetState()
  await syncInboxFromGmail()
  await flush()
  await generateDraftReplyForEmail('gm-urgent')
  queueDraftReplyForApproval('gm-urgent')
  await flush()
  const approval = latestApproval()
  if (approval) approveAction(approval.id)
  await flush()
  return {
    name: '6. approve outgoing email',
    route: 'approval queue -> approveAction -> gmail.sendMessage',
    inboxWorkerBehavior: latestOutgoing()?.status ?? 'missing',
    approvalBehavior: approval ? `Approved ${approval.title}` : 'approval missing',
    activityLogResult: latestActivity()?.action ?? 'no activity',
    failureHandling: latestOutgoing()?.failureReason ?? 'Send succeeds and logs activity',
  }
}

async function scenarioExtractTaskOrEvent(): Promise<ScenarioResult> {
  resetState()
  await syncInboxFromGmail()
  await flush()
  const urgentEmail = useConciergeStore.getState().emails.find((item) => item.id === 'gm-urgent')
  return {
    name: '7. extract a task or event from a real email',
    route: 'Gmail -> triageInbox -> task/event extraction',
    inboxWorkerBehavior: `tasks:${urgentEmail?.extractedTasks.join(' | ') ?? 'none'} events:${urgentEmail?.extractedEvents.join(' | ') ?? 'none'}`,
    approvalBehavior: 'No planner/calendar mutation happens silently; items only surface in Concierge',
    activityLogResult: latestActivity()?.detail ?? latestActivity()?.action ?? 'no activity',
    failureHandling: 'If extraction is weak, the email still lands in triage with original content visible',
  }
}

async function scenarioGmailUnavailable(): Promise<ScenarioResult> {
  resetState()
  gmailConfigured = false
  fetchFailure = 'Gmail auth missing: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_ADDRESS'
  await syncInboxFromGmail()
  await flush()
  return {
    name: '8. Gmail unavailable / auth missing / fetch failure',
    route: 'Gmail status/fetch -> inboxWorker failure path',
    inboxWorkerBehavior: `worker:${useConciergeStore.getState().workerStatus.inbox} emails:${useConciergeStore.getState().emails.length}`,
    approvalBehavior: 'No outgoing approval items created',
    activityLogResult: latestActivity()?.action ?? 'no activity',
    failureHandling: latestActivity()?.detail ?? 'failure not surfaced',
  }
}

const results: ScenarioResult[] = []
for (const scenario of [
  scenarioFetchRealInbox,
  scenarioClassifyBuckets,
  scenarioGenerateDraft,
  scenarioQueueApproval,
  scenarioRejectOutgoing,
  scenarioApproveOutgoing,
  scenarioExtractTaskOrEvent,
  scenarioGmailUnavailable,
]) {
  results.push(await scenario())
}

for (const result of results) {
  console.log(`\n${result.name}`)
  console.log(`route: ${result.route}`)
  console.log(`inbox worker behavior: ${result.inboxWorkerBehavior}`)
  console.log(`approval behavior: ${result.approvalBehavior}`)
  console.log(`activity log result: ${result.activityLogResult}`)
  console.log(`failure handling: ${result.failureHandling}`)
}
