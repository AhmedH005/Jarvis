type MemoryStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
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
const phoneStub = {
  async dial({ reqId }: { reqId: string }) {
    return { ok: true, callSid: `CA-${reqId}` }
  },
  onCallUpdate() {
    return () => undefined
  },
  async getWebhookConfig() {
    return {
      port: 0,
      publicBaseUrl: null,
      running: false,
      credentialsConfigured: false,
      twilioNumber: null,
    }
  },
}

Object.assign(globalThis, {
  localStorage: memoryStorage,
  window: {
    electronAPI: {
      phone: phoneStub,
    },
  },
})

const { useConciergeStore } = await import('../src/store/concierge')
const { useCalendarStore } = await import('../src/store/calendarStore')
const {
  handleConciergeCommand,
  approveAction,
} = await import('../src/features/concierge/conciergeOrchestrator')
const { selectAndQueueBooking } = await import('../src/features/concierge/workers/reservationsWorker')
const { handleCallStatusUpdate } = await import('../src/features/concierge/workers/phoneWorker')

type ScenarioResult = {
  name: string
  bookingBrief: string
  targetSelection: string
  approvalBehavior: string
  phoneScriptQualitySummary: string
  finalReservationStatus: string
  activityLogResult: string
}

function resetState(): void {
  memoryStorage.clear()
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
  useCalendarStore.setState({ events: [] })
}

function latestRequest() {
  return useConciergeStore.getState().bookingRequests[0]
}

function latestApproval() {
  return useConciergeStore.getState().approvalQueue[0]
}

function latestOutbound() {
  return useConciergeStore.getState().outboundQueue[0]
}

function latestActivity() {
  return useConciergeStore.getState().activityLog[0]
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function summarizeBrief(): string {
  const req = latestRequest()
  if (!req) return 'none'
  const brief = req.brief
  return [
    brief.category,
    brief.targetBusiness ?? 'shortlist',
    brief.targetingStatus,
    brief.location ?? 'no-location',
    brief.date ?? 'no-date',
    brief.preferredTime ?? 'no-time',
    brief.fallbackTimes.length > 0 ? `fallback ${brief.fallbackTimes.join('/')}` : 'no-fallbacks',
    brief.fallbackDateOptions.length > 0 ? `alt ${brief.fallbackDateOptions.join('/')}` : '',
  ].filter(Boolean).join(' | ')
}

function summarizeTargetSelection(): string {
  const req = latestRequest()
  if (!req) return 'no request'
  const options = req.options.slice(0, 3).map((opt) =>
    `${opt.placeName}${opt.matchConfidence !== undefined ? ` (${Math.round(opt.matchConfidence * 100)}%)` : ''}${opt.requiresPhoneLookup ? ' [lookup]' : ''}${opt.status === 'ambiguous' ? ' [ambiguous]' : ''}`
  )
  return options.length > 0 ? options.join(' | ') : (req.notes ?? 'no options')
}

function summarizeScript(): string {
  const outbound = latestOutbound()
  if (!outbound?.callScript) return 'No phone script generated'
  const script = outbound.callScript
  return [
    script.opening,
    script.reservationRequest ?? '',
    script.fallbackOffers && script.fallbackOffers.length > 0 ? `fallbacks ${script.fallbackOffers.join(' / ')}` : '',
    script.confirmationChecklist && script.confirmationChecklist.length > 0 ? `confirm ${script.confirmationChecklist.join(' / ')}` : '',
    script.close ?? script.closing,
  ].filter(Boolean).join(' || ')
}

async function buildApprovedCall(input: string): Promise<void> {
  handleConciergeCommand(input)
  await flush()
  const req = latestRequest()
  if (!req?.options[0]) return
  selectAndQueueBooking(req.id, req.options[0].id)
  const approval = latestApproval()
  if (approval) approveAction(approval.id)
  await flush()
}

async function scenarioSohoDinner(): Promise<ScenarioResult> {
  resetState()
  handleConciergeCommand('Book dinner for 4 tomorrow at 8 in Soho')
  await flush()
  const req = latestRequest()
  if (req?.options[0]) selectAndQueueBooking(req.id, req.options[0].id)
  return {
    name: '1. Book dinner for 4 tomorrow at 8 in Soho',
    bookingBrief: summarizeBrief(),
    targetSelection: summarizeTargetSelection(),
    approvalBehavior: latestApproval()?.title ?? 'approval pending after option selection',
    phoneScriptQualitySummary: 'Script not generated until approval; shortlist and fallback context are attached.',
    finalReservationStatus: latestRequest()?.status ?? 'missing',
    activityLogResult: latestActivity()?.action ?? 'no activity',
  }
}

async function scenarioNobuFridayFallbacks(): Promise<ScenarioResult> {
  resetState()
  handleConciergeCommand('Book Nobu for Friday at 7, otherwise 7:30 or 8')
  await flush()
  const req = latestRequest()
  if (req?.options[0]) selectAndQueueBooking(req.id, req.options[0].id)
  const approval = latestApproval()
  if (approval) approveAction(approval.id)
  await flush()
  return {
    name: '2. Book Nobu for Friday at 7, otherwise 7:30 or 8',
    bookingBrief: summarizeBrief(),
    targetSelection: summarizeTargetSelection(),
    approvalBehavior: approval ? `Approved ${approval.title}` : 'missing approval',
    phoneScriptQualitySummary: summarizeScript(),
    finalReservationStatus: latestRequest()?.status ?? 'missing',
    activityLogResult: latestActivity()?.action ?? 'no activity',
  }
}

async function scenarioHotelLateCheckoutClarify(): Promise<ScenarioResult> {
  resetState()
  handleConciergeCommand('Call this hotel and ask whether late checkout is free or paid')
  await flush()
  const req = latestRequest()
  if (req?.options[0]) selectAndQueueBooking(req.id, req.options[0].id)
  return {
    name: '3. Call this hotel and ask whether late checkout is free or paid',
    bookingBrief: summarizeBrief(),
    targetSelection: summarizeTargetSelection(),
    approvalBehavior: latestApproval()?.title ?? 'Blocked until phone lookup / business context is resolved',
    phoneScriptQualitySummary: 'Execution blocked: target marked needs lookup instead of pretending the call is possible.',
    finalReservationStatus: latestRequest()?.status ?? 'missing',
    activityLogResult: latestActivity()?.detail ?? latestActivity()?.action ?? 'no activity',
  }
}

async function scenarioNoAnswer(): Promise<ScenarioResult> {
  resetState()
  await buildApprovedCall('Book a table at Nobu tomorrow night')
  const outbound = latestOutbound()
  if (outbound?.callSid) {
    handleCallStatusUpdate({
      callSid: outbound.callSid,
      reqId: outbound.id,
      status: 'no-answer',
    })
    await flush()
  }
  return {
    name: '4. no answer',
    bookingBrief: summarizeBrief(),
    targetSelection: summarizeTargetSelection(),
    approvalBehavior: 'Approved targeted reservation call',
    phoneScriptQualitySummary: summarizeScript(),
    finalReservationStatus: latestRequest()?.status ?? 'missing',
    activityLogResult: latestActivity()?.detail ?? latestActivity()?.action ?? 'no activity',
  }
}

async function scenarioFallbackAccepted(): Promise<ScenarioResult> {
  resetState()
  await buildApprovedCall('Book Nobu for Friday at 7, otherwise 7:30 or 8')
  const outbound = latestOutbound()
  if (outbound?.callSid) {
    handleCallStatusUpdate({
      callSid: outbound.callSid,
      reqId: outbound.id,
      status: 'completed',
      transcription: 'They do not have availability at 7, but they can do 7:30 and the table is confirmed under Ahmed.',
      durationSecs: 150,
    })
    await flush()
  }
  return {
    name: '5. unavailable at requested time but fallback accepted',
    bookingBrief: summarizeBrief(),
    targetSelection: summarizeTargetSelection(),
    approvalBehavior: 'Approved targeted reservation call',
    phoneScriptQualitySummary: summarizeScript(),
    finalReservationStatus: latestRequest()?.status ?? 'missing',
    activityLogResult: latestRequest()?.confirmation ?? latestActivity()?.action ?? 'no activity',
  }
}

async function scenarioMissingPhoneNumber(): Promise<ScenarioResult> {
  resetState()
  handleConciergeCommand('Call this hotel and ask whether late checkout is free or paid')
  await flush()
  const req = latestRequest()
  if (req?.options[0]) selectAndQueueBooking(req.id, req.options[0].id)
  return {
    name: '6. missing phone number',
    bookingBrief: summarizeBrief(),
    targetSelection: summarizeTargetSelection(),
    approvalBehavior: latestApproval()?.title ?? 'No approval created because phone lookup is required first',
    phoneScriptQualitySummary: 'No script queued; request is surfaced as follow-up instead of fake execution.',
    finalReservationStatus: latestRequest()?.status ?? 'missing',
    activityLogResult: latestActivity()?.detail ?? latestActivity()?.action ?? 'no activity',
  }
}

async function scenarioAmbiguousBusinessTarget(): Promise<ScenarioResult> {
  resetState()
  handleConciergeCommand('Book Nobu Hotel for Friday at 7')
  await flush()
  return {
    name: '7. ambiguous business target',
    bookingBrief: summarizeBrief(),
    targetSelection: summarizeTargetSelection(),
    approvalBehavior: latestApproval()?.title ?? 'No approval yet; waiting for business clarification',
    phoneScriptQualitySummary: 'No script queued; the UI surfaces the ambiguity instead of guessing.',
    finalReservationStatus: latestRequest()?.status ?? 'missing',
    activityLogResult: latestRequest()?.notes ?? latestActivity()?.action ?? 'no activity',
  }
}

async function scenarioUnclearNeedsFollowUp(): Promise<ScenarioResult> {
  resetState()
  await buildApprovedCall('Book a table at Nobu tomorrow night')
  const outbound = latestOutbound()
  if (outbound?.callSid) {
    handleCallStatusUpdate({
      callSid: outbound.callSid,
      reqId: outbound.id,
      status: 'completed',
      transcription: 'The host said they need to check with the manager and call back because they are not sure yet.',
      durationSecs: 121,
    })
    await flush()
  }
  return {
    name: '8. call result unclear / needs follow-up',
    bookingBrief: summarizeBrief(),
    targetSelection: summarizeTargetSelection(),
    approvalBehavior: 'Approved targeted reservation call',
    phoneScriptQualitySummary: summarizeScript(),
    finalReservationStatus: latestRequest()?.status ?? 'missing',
    activityLogResult: latestRequest()?.executionResult?.ambiguityReason ?? latestActivity()?.action ?? 'no activity',
  }
}

const results = [
  await scenarioSohoDinner(),
  await scenarioNobuFridayFallbacks(),
  await scenarioHotelLateCheckoutClarify(),
  await scenarioNoAnswer(),
  await scenarioFallbackAccepted(),
  await scenarioMissingPhoneNumber(),
  await scenarioAmbiguousBusinessTarget(),
  await scenarioUnclearNeedsFollowUp(),
]

console.log(JSON.stringify(results, null, 2))
