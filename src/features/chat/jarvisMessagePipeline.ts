import { nanoid } from '@/lib/utils'
import { useJarvisStore } from '@/store/jarvis'
import { usePlannerStore } from '@/store/planner'
import { handlePlannerCommand, isPlannerIntent } from '@/features/planner/plannerCommandRouter'
import { handlePlanRefinement, isPlanRefinementIntent } from '@/features/planner/plannerRefinement'
import { handlePlannerIntake, isIntakeIntent } from '@/features/planner/plannerIntakeAgent'
import { handleCalendarIntent, isCalendarIntent } from '@/calendar/calendarNLP'
import type { Message, StreamEvent } from '@/types'

export interface JarvisPipelineResult {
  replyText: string
  route: 'refinement' | 'intake' | 'planner' | 'calendar' | 'chat'
}

export async function submitJarvisMessage(userText: string): Promise<JarvisPipelineResult> {
  const text = userText.trim()
  if (!text) {
    return { replyText: '', route: 'chat' }
  }

  const jarvis = useJarvisStore.getState()
  const planner = usePlannerStore.getState()

  const {
    addMessage,
    applyStreamEvent,
    pushLog,
    conversationId,
    messages,
    plannerPreview,
    activePlanSession,
    setPlannerPreview,
    setActivePlanSession,
    setIntakePreview,
    setStreamPhase,
  } = jarvis

  const history = messages.slice(-12).map((message) => ({
    role: message.role as 'user' | 'assistant',
    content: message.content,
  }))

  addMessage({ id: nanoid(), role: 'user', content: text, timestamp: new Date() } as Message)

  const plannerDate = new Date().toISOString().split('T')[0]
  const plannerContext = {
    currentDate: plannerDate,
    selectedDate: plannerDate,
    tasks: planner.tasks,
    blocks: planner.blocks,
  }

  if (activePlanSession && plannerPreview?.result && isPlanRefinementIntent(text)) {
    pushLog(`[route:refinement] ${text.slice(0, 50)}`)
    const plannerResponse = await handlePlanRefinement(text, activePlanSession, plannerContext)
    setPlannerPreview(plannerResponse)
    if (plannerResponse.result) {
      setActivePlanSession({
        result: plannerResponse.result,
        command: activePlanSession.command,
        timestamp: new Date().toISOString(),
        refinementConstraints: plannerResponse.refinementConstraints ?? activePlanSession.refinementConstraints,
        refinementHistory: [
          ...activePlanSession.refinementHistory,
          {
            input: text,
            timestamp: new Date().toISOString(),
            constraints: plannerResponse.refinementConstraints ?? activePlanSession.refinementConstraints,
          },
        ],
      })
    }
    addMessage({ id: nanoid(), role: 'assistant', content: plannerResponse.summary, timestamp: new Date() } as Message)
    setStreamPhase('complete')
    setTimeout(() => useJarvisStore.getState().setStreamPhase('idle'), 600)
    return { replyText: plannerResponse.summary, route: 'refinement' }
  }

  // ── Calendar route (new action layer) ────────────────────────────────────────
  if (isCalendarIntent(text)) {
    pushLog(`[route:calendar] ${text.slice(0, 50)}`)
    const calResult = await handleCalendarIntent(text)

    if (calResult.handled) {
      addMessage({ id: nanoid(), role: 'assistant', content: calResult.summary, timestamp: new Date() } as Message)
      setStreamPhase('complete')
      setTimeout(() => useJarvisStore.getState().setStreamPhase('idle'), 600)
      return { replyText: calResult.summary, route: 'calendar' }
    }

    pushLog('[route:calendar] no match · continuing')
  }

  if (isIntakeIntent(text)) {
    pushLog(`[route:intake] ${text.slice(0, 50)}`)
    const intakeResponse = await handlePlannerIntake(text, plannerContext)

    if (intakeResponse.kind !== 'unknown') {
      setIntakePreview(intakeResponse)
      setPlannerPreview(null)
      setActivePlanSession(null)
      addMessage({ id: nanoid(), role: 'assistant', content: intakeResponse.summary, timestamp: new Date() } as Message)
      setStreamPhase('complete')
      setTimeout(() => useJarvisStore.getState().setStreamPhase('idle'), 600)
      return { replyText: intakeResponse.summary, route: 'intake' }
    }

    pushLog('[route:intake] nothing extracted · continuing to chat')
  }

  if (isPlannerIntent(text)) {
    pushLog(`[route:planner] ${text.slice(0, 50)}`)
    const plannerResponse = await handlePlannerCommand(text, plannerContext)

    if (plannerResponse.command.type !== 'unknown') {
      setPlannerPreview(plannerResponse)
      setIntakePreview(null)
      if (
        plannerResponse.result &&
        (plannerResponse.command.type === 'optimize_day' || plannerResponse.command.type === 'optimize_week')
      ) {
        setActivePlanSession({
          result: plannerResponse.result,
          command: plannerResponse.command,
          timestamp: new Date().toISOString(),
          refinementConstraints: plannerResponse.refinementConstraints ?? {},
          refinementHistory: [],
        })
      } else {
        setActivePlanSession(null)
      }
      addMessage({ id: nanoid(), role: 'assistant', content: plannerResponse.summary, timestamp: new Date() } as Message)
      setStreamPhase('complete')
      setTimeout(() => useJarvisStore.getState().setStreamPhase('idle'), 600)
      return { replyText: plannerResponse.summary, route: 'planner' }
    }

    pushLog('[route:planner] command unknown · continuing to chat')
  }

  pushLog(`[route:chat] ${text.slice(0, 50)}`)
  setPlannerPreview(null)
  setIntakePreview(null)
  setActivePlanSession(null)

  const assistantMessageId = nanoid()
  addMessage({ id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date(), streaming: true } as Message)
  pushLog(`→ ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`)

  if (!window.jarvis) {
    applyStreamEvent(assistantMessageId, { type: 'error', payload: 'No Electron bridge — run inside the app' })
    setStreamPhase('error')
    return { replyText: 'No Electron bridge — run inside the app', route: 'chat' }
  }

  let replyText = ''
  let cleaned = false
  const cleanup = (unsub: () => void) => {
    if (!cleaned) {
      cleaned = true
      unsub()
    }
  }

  await new Promise<void>((resolve) => {
    const unsub = window.jarvis!.openclaw.onStream((event: StreamEvent) => {
      applyStreamEvent(assistantMessageId, event)
      if (event.type === 'token') replyText += event.payload
      if (event.type === 'log') pushLog(event.payload, event.meta?.isToolStart ? 'info' : 'success')
      if (event.type === 'end') {
        pushLog('← complete', 'success')
        cleanup(unsub)
        resolve()
      }
      if (event.type === 'error') {
        replyText = event.payload
        pushLog(`✗ ${event.payload}`, 'error')
        cleanup(unsub)
        resolve()
      }
    })

    window.jarvis!.openclaw.send(text, conversationId, history).catch((error: unknown) => {
      const message = String(error)
      replyText = message
      pushLog(`Send failed: ${message}`, 'error')
      applyStreamEvent(assistantMessageId, { type: 'error', payload: message })
      setStreamPhase('error')
      cleanup(unsub)
      resolve()
    })
  })

  return { replyText: replyText || '(no response)', route: 'chat' }
}

export async function forwardTelegramToJarvis(userText: string): Promise<string> {
  const result = await submitJarvisMessage(userText)
  return result.replyText
}

