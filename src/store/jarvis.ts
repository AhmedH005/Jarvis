import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Message, ToolCall, OpenClawStatus, JarvisConfig, StreamChunk } from '@/types'
import { DEFAULT_CONFIG } from '@/types'

interface JarvisState {
  // ── Messages ──────────────────────────────────────────────────────────────────
  messages: Message[]
  conversationId: string | undefined
  addMessage: (msg: Message) => void
  appendChunk: (id: string, chunk: StreamChunk) => void
  finalizeMessage: (id: string) => void
  clearMessages: () => void

  // ── Status ────────────────────────────────────────────────────────────────────
  ocStatus: OpenClawStatus
  setOcStatus: (s: OpenClawStatus) => void

  // ── Loading state ─────────────────────────────────────────────────────────────
  isStreaming: boolean
  setIsStreaming: (v: boolean) => void
  activeToolCalls: ToolCall[]
  addToolCall: (tc: ToolCall) => void
  updateToolCall: (id: string, updates: Partial<ToolCall>) => void

  // ── Config ────────────────────────────────────────────────────────────────────
  config: JarvisConfig
  setConfig: (c: Partial<JarvisConfig>) => void

  // ── Logs ──────────────────────────────────────────────────────────────────────
  systemLogs: string[]
  pushLog: (line: string) => void
}

export const useJarvisStore = create<JarvisState>()(
  persist(
    (set, get) => ({
      // Messages
      messages: [],
      conversationId: undefined,

      addMessage: (msg) =>
        set((s) => ({ messages: [...s.messages, msg] })),

      appendChunk: (id, chunk) =>
        set((s) => ({
          messages: s.messages.map((m) => {
            if (m.id !== id) return m
            if (chunk.type === 'text') {
              return { ...m, content: m.content + chunk.content }
            }
            if (chunk.type === 'tool_start') {
              const tc: ToolCall = {
                id: `tc-${Date.now()}`,
                name: chunk.toolName ?? chunk.content,
                input: chunk.toolInput,
                status: 'running',
                startedAt: new Date(),
              }
              return { ...m, toolCalls: [...(m.toolCalls ?? []), tc] }
            }
            if (chunk.type === 'tool_end') {
              return {
                ...m,
                toolCalls: (m.toolCalls ?? []).map((tc) =>
                  tc.name === chunk.toolName
                    ? { ...tc, output: chunk.toolOutput, status: 'done', completedAt: new Date() }
                    : tc
                ),
              }
            }
            return m
          }),
        })),

      finalizeMessage: (id) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, streaming: false } : m
          ),
        })),

      clearMessages: () => set({ messages: [], conversationId: undefined }),

      // Status
      ocStatus: { online: false },
      setOcStatus: (s) => set({ ocStatus: s }),

      // Streaming
      isStreaming: false,
      setIsStreaming: (v) => set({ isStreaming: v }),

      activeToolCalls: [],
      addToolCall: (tc) =>
        set((s) => ({ activeToolCalls: [...s.activeToolCalls, tc] })),
      updateToolCall: (id, updates) =>
        set((s) => ({
          activeToolCalls: s.activeToolCalls.map((tc) =>
            tc.id === id ? { ...tc, ...updates } : tc
          ),
        })),

      // Config
      config: DEFAULT_CONFIG,
      setConfig: (c) =>
        set((s) => ({
          config: {
            ...s.config,
            ...c,
            theme: { ...s.config.theme, ...(c.theme ?? {}) },
            layout: { ...s.config.layout, ...(c.layout ?? {}) },
            widgets: { ...s.config.widgets, ...(c.widgets ?? {}) },
          },
        })),

      // Logs
      systemLogs: [],
      pushLog: (line) =>
        set((s) => ({
          systemLogs: [...s.systemLogs.slice(-199), `[${new Date().toLocaleTimeString()}] ${line}`],
        })),
    }),
    {
      name: 'jarvis-store',
      partialize: (s) => ({ config: s.config, conversationId: s.conversationId }),
    }
  )
)
