import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Cpu, Wrench, CheckCircle2, AlertCircle } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'
import { cn } from '@/lib/utils'
import type { Message, ToolCall } from '@/types'

export function MessageList() {
  const messages    = useJarvisStore((s) => s.messages)
  const isStreaming = useJarvisStore((s) => s.isStreaming)
  const bottomRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MessageBubble msg={msg} />
            {msg.toolCalls?.map((tc) => (
              <ToolCallCard key={tc.id} tc={tc} />
            ))}
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={cn(
        'w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5',
        isUser
          ? 'bg-jarvis-secondary/20 border border-jarvis-secondary/30'
          : 'bg-jarvis-primary/10 border border-jarvis-primary/20'
      )}>
        {isUser
          ? <User className="w-3.5 h-3.5 text-jarvis-secondary" />
          : <Cpu className="w-3.5 h-3.5 text-jarvis-primary" />
        }
      </div>

      {/* Content */}
      <div className={cn('max-w-[75%]', isUser ? 'items-end' : 'items-start', 'flex flex-col gap-1')}>
        <div className={cn(
          'px-3 py-2 rounded text-sm leading-relaxed font-mono',
          isUser
            ? 'bg-jarvis-secondary/10 border border-jarvis-secondary/20 text-jarvis-text'
            : 'bg-jarvis-surface border border-jarvis-border text-jarvis-text',
          msg.streaming && !isUser && 'streaming-text'
        )}>
          {msg.content || (msg.streaming ? '' : '…')}
        </div>
        <span className="text-[10px] text-jarvis-muted font-mono">
          {msg.timestamp.toLocaleTimeString()}
        </span>
      </div>
    </div>
  )
}

function ToolCallCard({ tc }: { tc: ToolCall }) {
  const icons = {
    running: <motion.div
      className="w-3 h-3 rounded-full border border-jarvis-primary border-t-transparent"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
    />,
    done:    <CheckCircle2 className="w-3 h-3 text-jarvis-accent" />,
    error:   <AlertCircle  className="w-3 h-3 text-jarvis-warn"   />,
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="ml-10 mt-1 border border-jarvis-border rounded px-3 py-1.5 flex items-center gap-2 text-[11px] font-mono"
    >
      <Wrench className="w-3 h-3 text-jarvis-muted flex-shrink-0" />
      <span className="text-jarvis-primary">{tc.name}</span>
      <div className="ml-auto">{icons[tc.status]}</div>
    </motion.div>
  )
}
