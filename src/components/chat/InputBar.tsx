import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'
import { usePlannerStore } from '@/store/planner'
import { nanoid } from '@/lib/utils'
import { playSendTone, resumeAudio } from '@/lib/audio'
import { getReactorDisplayStatus } from '@/lib/reactor-display'
import { handlePlannerCommand, isPlannerIntent } from '@/features/planner/plannerCommandRouter'
import { handlePlanRefinement, isPlanRefinementIntent } from '@/features/planner/plannerRefinement'
import { handlePlannerIntake, isIntakeIntent } from '@/features/planner/plannerIntakeAgent'
import type { Message, StreamEvent } from '@/types'

export function InputBar() {
  const [text,    setText]    = useState('')
  const [focused, setFocused] = useState(false)
  const [flash,   setFlash]   = useState(false)
  const textareaRef           = useRef<HTMLTextAreaElement>(null)

  const streamPhase     = useJarvisStore((s) => s.streamPhase)
  const setStreamPhase  = useJarvisStore((s) => s.setStreamPhase)
  const addMessage      = useJarvisStore((s) => s.addMessage)
  const applyStreamEvent = useJarvisStore((s) => s.applyStreamEvent)
  const pushLog         = useJarvisStore((s) => s.pushLog)
  const conversationId  = useJarvisStore((s) => s.conversationId)
  const ocStatus        = useJarvisStore((s) => s.ocStatus)
  const statusChecked   = useJarvisStore((s) => s.statusChecked)
  const reactorVisualLive = useJarvisStore((s) => s.reactorVisualLive)
  const config          = useJarvisStore((s) => s.config)
  const messages        = useJarvisStore((s) => s.messages)
  const plannerPreview = useJarvisStore((s) => s.plannerPreview)
  const setPlannerPreview = useJarvisStore((s) => s.setPlannerPreview)
  const activePlanSession = useJarvisStore((s) => s.activePlanSession)
  const setActivePlanSession = useJarvisStore((s) => s.setActivePlanSession)
  const setIntakePreview = useJarvisStore((s) => s.setIntakePreview)
  const tasks = usePlannerStore((s) => s.tasks)
  const blocks = usePlannerStore((s) => s.blocks)

  const isStreaming = streamPhase === 'streaming' || streamPhase === 'start'
  // Allow sending any time we have text and aren't already streaming
  const canSend     = text.trim().length > 0 && !isStreaming

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`
  }, [text])

  // Focus on mount
  useEffect(() => {
    if (!isStreaming) textareaRef.current?.focus()
  }, [isStreaming])

  const handleSend = async () => {
    if (!canSend) return
    resumeAudio()
    if (config.theme.soundEnabled) playSendTone()

    const userText = text.trim()
    setText('')

    setFlash(true)
    setTimeout(() => setFlash(false), 300)

    // Build history for OpenAI context (last 12 turns)
    const history = messages.slice(-12).map((m) => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Add user message
    addMessage({ id: nanoid(), role: 'user', content: userText, timestamp: new Date() } as Message)

    const plannerDate = new Date().toISOString().split('T')[0]
    const plannerContext = {
      currentDate: plannerDate,
      selectedDate: plannerDate,
      tasks,
      blocks,
    }

    // ── Route 1: Refinement (requires active plan session) ───────────────────
    if (activePlanSession && plannerPreview?.result && isPlanRefinementIntent(userText)) {
      pushLog(`[route:refinement] ${userText.slice(0, 50)}`)
      const plannerResponse = await handlePlanRefinement(userText, activePlanSession, plannerContext)
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
              input: userText,
              timestamp: new Date().toISOString(),
              constraints: plannerResponse.refinementConstraints ?? activePlanSession.refinementConstraints,
            },
          ],
        })
      }
      addMessage({ id: nanoid(), role: 'assistant', content: plannerResponse.summary, timestamp: new Date() } as Message)
      setStreamPhase('complete')
      setTimeout(() => setStreamPhase('idle'), 600)
      return
    }

    // ── Route 2: Planner command (optimize/protect/schedule) ─────────────────
    if (isPlannerIntent(userText)) {
      pushLog(`[route:planner] ${userText.slice(0, 50)}`)
      const plannerResponse = await handlePlannerCommand(userText, plannerContext)

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
        setTimeout(() => setStreamPhase('idle'), 600)
        return
      }

      pushLog('[route:planner] command unknown · continuing to intake check')
    }

    // ── Route 3: Intake (life events / tasks with dates) ─────────────────────
    if (isIntakeIntent(userText)) {
      pushLog(`[route:intake] ${userText.slice(0, 50)}`)
      const intakeResponse = await handlePlannerIntake(userText, plannerContext)

      if (intakeResponse.kind !== 'unknown') {
        setIntakePreview(intakeResponse)
        setPlannerPreview(null)
        setActivePlanSession(null)
        addMessage({ id: nanoid(), role: 'assistant', content: intakeResponse.summary, timestamp: new Date() } as Message)
        setStreamPhase('complete')
        setTimeout(() => setStreamPhase('idle'), 600)
        return
      }

      pushLog('[route:intake] nothing extracted · continuing to chat')
    }

    // ── Route 4: Normal chat via OpenClaw main agent ──────────────────────────
    pushLog(`[route:chat] ${userText.slice(0, 50)}`)
    setPlannerPreview(null)
    setIntakePreview(null)
    setActivePlanSession(null)

    // Placeholder assistant message
    const asstId = nanoid()
    addMessage({ id: asstId, role: 'assistant', content: '', timestamp: new Date(), streaming: true })
    pushLog(`→ ${userText.slice(0, 60)}${userText.length > 60 ? '…' : ''}`)

    if (!window.jarvis) {
      applyStreamEvent(asstId, { type: 'error', payload: 'No Electron bridge — run inside the app' })
      setStreamPhase('error')
      return
    }

    let cleaned = false
    const cleanup = () => {
      if (!cleaned) { cleaned = true; unsub() }
    }

    const unsub = window.jarvis.openclaw.onStream((event: StreamEvent) => {
      applyStreamEvent(asstId, event)
      if (event.type === 'log')   pushLog(event.payload, event.meta?.isToolStart ? 'info' : 'success')
      if (event.type === 'end')   { pushLog('← complete', 'success'); cleanup() }
      if (event.type === 'error') { pushLog(`✗ ${event.payload}`, 'error'); cleanup() }
    })

    try {
      await window.jarvis.openclaw.send(userText, conversationId, history)
    } catch (err) {
      const msg = String(err)
      pushLog(`Send failed: ${msg}`, 'error')
      applyStreamEvent(asstId, { type: 'error', payload: msg })
      setStreamPhase('error')
      cleanup()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const borderColor = isStreaming ? 'rgba(0,212,255,0.4)'
    : focused       ? 'rgba(0,212,255,0.28)'
    :                 'rgba(0,212,255,0.14)'

  const displayStatus = getReactorDisplayStatus({ reactorVisualLive, statusChecked, ocStatus })
  const gatewayOffline = statusChecked && !ocStatus.online

  return (
    <div className="px-4 pb-2 pt-1">
      <motion.div
        className="flex items-end gap-3 px-4 py-2 rounded"
        style={{
          border:     `1px solid ${borderColor}`,
          background: 'rgba(0,212,255,0.03)',
          boxShadow:  isStreaming ? '0 0 20px rgba(0,212,255,0.1)'
            : focused ? '0 0 10px rgba(0,212,255,0.06)' : 'none',
          transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            isStreaming ? 'Waiting for response…'
            : !reactorVisualLive ? 'Reactor offline — click the orb to bring JARVIS online…'
            : gatewayOffline ? 'JARVIS online — gateway may still fail…'
            : 'Ask JARVIS… (Enter to send)'
          }
          disabled={isStreaming}
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none font-mono text-sm leading-6"
          style={{
            color:      'rgba(192,232,240,0.9)',
            caretColor: '#00d4ff',
            minHeight:  24,
            maxHeight:  100,
            userSelect: 'text',
          } as React.CSSProperties}
        />

        <motion.button
          onClick={handleSend}
          disabled={!canSend}
          animate={flash ? { scale: [1, 0.82, 1] } : { scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{
            width:          28,
            height:         28,
            borderRadius:   4,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            background:     canSend ? 'rgba(0,212,255,0.14)' : 'transparent',
            color:          canSend ? '#00d4ff' : 'rgba(0,212,255,0.25)',
            border:         `1px solid ${canSend ? 'rgba(0,212,255,0.35)' : 'rgba(0,212,255,0.08)'}`,
            boxShadow:      canSend ? '0 0 8px rgba(0,212,255,0.2)' : 'none',
            transition:     'all 0.25s ease',
            flexShrink:     0,
            cursor:         canSend ? 'pointer' : 'not-allowed',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div key="send" initial={{ scale: 0.7 }} animate={{ scale: 1 }} exit={{ scale: 0.7 }}>
              <Send className="w-3.5 h-3.5" />
            </motion.div>
          </AnimatePresence>
        </motion.button>
      </motion.div>

      <div className="flex items-center justify-center mt-1">
        <p className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.55)' }}>
          {isStreaming
            ? <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity }}>
                ● JARVIS IS RESPONDING
              </motion.span>
            : !reactorVisualLive
              ? <span style={{ color: 'rgba(255,154,84,0.72)' }}>○ reactor offline · click orb to activate</span>
            : gatewayOffline
              ? <span style={{ color: 'rgba(255,200,74,0.72)' }}>◌ reactor online · gateway unavailable</span>
              : <span style={{ color: displayStatus.color }}>Enter ↵ to send  ·  Shift+Enter for newline</span>
          }
        </p>
      </div>
    </div>
  )
}
