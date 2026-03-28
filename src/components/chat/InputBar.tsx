import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'
import { playSendTone, resumeAudio } from '@/lib/audio'
import { getReactorDisplayStatus } from '@/lib/reactor-display'
import { submitJarvisMessage } from '@/features/chat/jarvisMessagePipeline'

export function InputBar() {
  const [text,    setText]    = useState('')
  const [focused, setFocused] = useState(false)
  const [flash,   setFlash]   = useState(false)
  const textareaRef           = useRef<HTMLTextAreaElement>(null)

  const streamPhase     = useJarvisStore((s) => s.streamPhase)
  const setStreamPhase  = useJarvisStore((s) => s.setStreamPhase)
  const ocStatus        = useJarvisStore((s) => s.ocStatus)
  const statusChecked   = useJarvisStore((s) => s.statusChecked)
  const reactorVisualLive = useJarvisStore((s) => s.reactorVisualLive)
  const config          = useJarvisStore((s) => s.config)

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
    await submitJarvisMessage(userText)
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
