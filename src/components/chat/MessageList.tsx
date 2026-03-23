import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Cpu, Wrench, CheckCircle2, AlertCircle } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'
import { cn } from '@/lib/utils'
import type { Message, ToolCall } from '@/types'

export function MessageList({ compact = false }: { compact?: boolean }) {
  const messages    = useJarvisStore((s) => s.messages)
  const streamPhase = useJarvisStore((s) => s.streamPhase)
  const bottomRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const visibleMessages = messages.filter((msg) => !isPendingAssistantPlaceholder(msg))
  const showTypingIndicator = streamPhase === 'start'

  return (
    <div className={`${compact ? 'h-full' : 'flex-1'} overflow-y-auto px-4 py-3 space-y-3 min-h-0`}>
      {/* Empty state */}
      {visibleMessages.length === 0 && !showTypingIndicator && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center h-full gap-3 pointer-events-none"
        >
          <p className="text-[11px] font-mono text-jarvis-muted tracking-widest">
            AWAITING YOUR COMMAND
          </p>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full bg-jarvis-muted"
                animate={{ opacity: [0.2, 0.8, 0.2] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
              />
            ))}
          </div>
        </motion.div>
      )}

      <AnimatePresence initial={false}>
        {visibleMessages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <MessageBubble msg={msg} />
            <AnimatePresence>
              {msg.toolCalls?.map((tc) => (
                <ToolCallCard key={tc.id} tc={tc} />
              ))}
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Typing indicator — shown during 'start' phase (before first token) */}
      <AnimatePresence>
        {showTypingIndicator && (
          <motion.div
            key="typing"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex gap-3"
          >
            {/* Avatar */}
            <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5 bg-jarvis-primary/10 border border-jarvis-primary/20">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Cpu className="w-3.5 h-3.5 text-jarvis-primary" />
              </motion.div>
            </div>
            {/* Dots */}
            <div className="flex items-center gap-1.5 px-3 py-2 rounded border border-jarvis-border bg-jarvis-surface">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-jarvis-primary"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                  transition={{
                    duration: 0.8,
                    repeat:   Infinity,
                    delay:    i * 0.18,
                    ease:     'easeInOut',
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={bottomRef} />
    </div>
  )
}

function isPendingAssistantPlaceholder(msg: Message) {
  return msg.role === 'assistant' && msg.streaming && msg.content.trim().length === 0
}

// ── MessageBubble ──────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={cn(
        'w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5',
        isUser
          ? 'bg-jarvis-secondary/20 border border-jarvis-secondary/30'
          : 'bg-jarvis-primary/10  border border-jarvis-primary/20'
      )}>
        {isUser
          ? <User className="w-3.5 h-3.5 text-jarvis-secondary" />
          : <Cpu  className="w-3.5 h-3.5 text-jarvis-primary"   />
        }
      </div>

      {/* Bubble */}
      <div className={cn('max-w-[76%] flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'px-3 py-2 rounded text-sm leading-relaxed font-mono',
            isUser
              ? 'bg-jarvis-secondary/10 border border-jarvis-secondary/20 text-jarvis-text'
              : 'bg-jarvis-surface border border-jarvis-border text-jarvis-text',
            msg.streaming && !isUser && 'streaming-text',
          )}
          style={!isUser && msg.streaming
            ? { borderColor: '#00d4ff33', boxShadow: '0 0 12px #00d4ff11' }
            : {}
          }
        >
          {msg.content || (msg.streaming ? '\u00a0' : '…')}
        </div>
        <span className="text-[9px] text-jarvis-muted font-mono">
          {msg.timestamp instanceof Date
            ? msg.timestamp.toLocaleTimeString('en-US', { hour12: false })
            : new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false })
          }
        </span>
      </div>
    </div>
  )
}

// ── ToolCallCard ───────────────────────────────────────────────────────────────

function ToolCallCard({ tc }: { tc: ToolCall }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="ml-10 mt-1 border border-jarvis-border rounded px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono overflow-hidden"
    >
      <Wrench className="w-3 h-3 text-jarvis-muted flex-shrink-0" />
      <span className="text-jarvis-primary">{tc.name}</span>
      {tc.status === 'running' && (
        <span className="text-jarvis-muted text-[10px]">running…</span>
      )}
      <div className="ml-auto">
        {tc.status === 'running' && (
          <motion.div
            className="w-3 h-3 rounded-full border border-jarvis-primary border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
          />
        )}
        {tc.status === 'done'  && <CheckCircle2 className="w-3 h-3 text-jarvis-accent" />}
        {tc.status === 'error' && <AlertCircle  className="w-3 h-3 text-jarvis-warn"  />}
      </div>
    </motion.div>
  )
}
