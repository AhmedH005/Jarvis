import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { Send, Square, Mic } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'
import { nanoid } from '@/lib/utils'
import type { Message, StreamChunk } from '@/types'

export function InputBar() {
  const [text, setText]           = useState('')
  const textareaRef               = useRef<HTMLTextAreaElement>(null)
  const isStreaming               = useJarvisStore((s) => s.isStreaming)
  const setIsStreaming            = useJarvisStore((s) => s.setIsStreaming)
  const addMessage                = useJarvisStore((s) => s.addMessage)
  const appendChunk               = useJarvisStore((s) => s.appendChunk)
  const finalizeMessage           = useJarvisStore((s) => s.finalizeMessage)
  const pushLog                   = useJarvisStore((s) => s.pushLog)
  const conversationId            = useJarvisStore((s) => s.conversationId)
  const ocStatus                  = useJarvisStore((s) => s.ocStatus)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  const canSend = text.trim().length > 0 && !isStreaming && ocStatus.online

  const handleSend = async () => {
    if (!canSend) return
    const userText = text.trim()
    setText('')

    // Add user message
    const userMsg: Message = {
      id: nanoid(),
      role: 'user',
      content: userText,
      timestamp: new Date(),
    }
    addMessage(userMsg)

    // Prepare assistant message placeholder
    const asstId = nanoid()
    const asstMsg: Message = {
      id: asstId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    }
    addMessage(asstMsg)
    setIsStreaming(true)
    pushLog(`Sending: ${userText.slice(0, 60)}…`)

    // Register listeners before invoking send
    const unsubChunk = window.jarvis.openclaw.onChunk((chunk: StreamChunk) => {
      appendChunk(asstId, chunk)
    })
    const unsubDone = window.jarvis.openclaw.onDone(() => {
      finalizeMessage(asstId)
      setIsStreaming(false)
      pushLog('Response complete')
      cleanup()
    })
    const unsubError = window.jarvis.openclaw.onError((msg: string) => {
      finalizeMessage(asstId)
      setIsStreaming(false)
      pushLog(`Error: ${msg}`)
      cleanup()
    })

    const cleanup = () => {
      unsubChunk()
      unsubDone()
      unsubError()
    }

    try {
      await window.jarvis.openclaw.send(userText, conversationId)
    } catch (err) {
      pushLog(`Send failed: ${String(err)}`)
      finalizeMessage(asstId)
      setIsStreaming(false)
      cleanup()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="px-4 pb-4">
      <motion.div
        className="flex items-end gap-2 border rounded-lg p-2 bg-jarvis-surface"
        style={{ borderColor: isStreaming ? '#00d4ff44' : '#0d2137' }}
        animate={isStreaming ? { boxShadow: ['0 0 0px #00d4ff00', '0 0 16px #00d4ff33', '0 0 0px #00d4ff00'] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={ocStatus.online ? "Send a message… (Enter to send)" : "OpenClaw offline"}
          disabled={isStreaming || !ocStatus.online}
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-sm font-mono text-jarvis-text placeholder:text-jarvis-muted min-h-[24px] max-h-[120px] leading-6"
          style={{ userSelect: 'text' } as React.CSSProperties}
        />
        <div className="flex items-center gap-1 pb-0.5">
          <button
            className="w-7 h-7 rounded flex items-center justify-center text-jarvis-muted hover:text-jarvis-text hover:bg-white/5 transition-colors"
            title="Voice input (coming soon)"
            disabled
          >
            <Mic className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-7 h-7 rounded flex items-center justify-center transition-all"
            style={{
              background: canSend ? '#00d4ff22' : 'transparent',
              color: canSend ? '#00d4ff' : '#4a7a8a',
              boxShadow: canSend ? '0 0 8px #00d4ff33' : 'none',
            }}
          >
            {isStreaming
              ? <Square className="w-3.5 h-3.5" />
              : <Send  className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      </motion.div>
      <p className="text-[10px] text-jarvis-muted font-mono mt-1 text-center">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  )
}
