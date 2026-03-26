import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Message, ToolCall, OpenClawStatus, JarvisConfig,
  StreamChunk, StreamEvent, StreamPhase,
} from '@/types'
import { DEFAULT_CONFIG } from '@/types'
import type { PlannerAgentResponse, PlannerCommand } from '@/features/planner/plannerCommandRouter'
import type { PlannerIntakeResponse } from '@/features/planner/plannerIntakeTypes'
import type { OptimizeDayResult, OptimizeWeekResult } from '@/features/planner/planningOrchestrator'
import type { ActiveRefinementConstraints } from '@/features/planner/plannerRefinementTypes'

export interface ActivePlanSession {
  result: OptimizeDayResult | OptimizeWeekResult
  command: PlannerCommand
  timestamp: string
  refinementConstraints: ActiveRefinementConstraints
  refinementHistory: Array<{ input: string; timestamp: string; constraints: ActiveRefinementConstraints }>
}

interface JarvisState {
  // ── Messages ──────────────────────────────────────────────────────────────────
  messages: Message[]
  conversationId: string | undefined
  addMessage:      (msg: Message) => void
  /** Process a unified StreamEvent and update the active assistant message */
  applyStreamEvent: (id: string, event: StreamEvent) => void
  /** Legacy chunk path — kept for backward compat */
  appendChunk:     (id: string, chunk: StreamChunk) => void
  finalizeMessage: (id: string) => void
  clearMessages:   () => void
  plannerPreview: PlannerAgentResponse | null
  setPlannerPreview: (response: PlannerAgentResponse | null) => void
  activePlanSession: ActivePlanSession | null
  setActivePlanSession: (session: ActivePlanSession | null) => void
  intakePreview: PlannerIntakeResponse | null
  setIntakePreview: (response: PlannerIntakeResponse | null) => void

  // ── Status ────────────────────────────────────────────────────────────────────
  ocStatus:    OpenClawStatus
  statusChecked: boolean
  setOcStatus: (s: OpenClawStatus) => void

  // ── Stream phase (drives ALL UI animation states) ─────────────────────────────
  streamPhase:    StreamPhase
  setStreamPhase: (p: StreamPhase) => void
  reactorVisualLive: boolean
  setReactorVisualLive: (value: boolean) => void
  tokenCount:     number            // running count of tokens received this turn
  /** Convenience: still supported by old code */
  isStreaming:    boolean
  setIsStreaming:  (v: boolean) => void

  // ── Tool calls ────────────────────────────────────────────────────────────────
  activeToolCalls: ToolCall[]
  addToolCall:     (tc: ToolCall) => void
  updateToolCall:  (id: string, updates: Partial<ToolCall>) => void

  // ── Config ────────────────────────────────────────────────────────────────────
  config:    JarvisConfig
  setConfig: (c: Partial<JarvisConfig>) => void

  // ── Logs ──────────────────────────────────────────────────────────────────────
  systemLogs: string[]
  pushLog:    (line: string, level?: 'info' | 'warn' | 'error' | 'success') => void

  // ── Session ───────────────────────────────────────────────────────────────────
  sessionStart: Date
}

export const useJarvisStore = create<JarvisState>()(
  persist(
    (set) => ({
      // ── Messages ────────────────────────────────────────────────────────────────
      messages:       [],
      conversationId: undefined,

      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      plannerPreview: null,
      setPlannerPreview: (plannerPreview) => set({ plannerPreview }),
      activePlanSession: null,
      setActivePlanSession: (activePlanSession) => set({ activePlanSession }),
      intakePreview: null,
      setIntakePreview: (intakePreview) => set({ intakePreview }),

      applyStreamEvent: (id, event) => set((s) => {
        if (event.type === 'start') {
          return {
            streamPhase: 'start' as StreamPhase,
            isStreaming: true,
            tokenCount:  0,
          }
        }

        if (event.type === 'token') {
          return {
            streamPhase: 'streaming' as StreamPhase,
            isStreaming: true,
            tokenCount:  s.tokenCount + 1,
            messages: s.messages.map((m) =>
              m.id === id ? { ...m, content: m.content + event.payload } : m
            ),
          }
        }

        if (event.type === 'log') {
          const meta = event.meta
          if (meta?.isToolStart) {
            const tc: ToolCall = {
              id:        `tc-${Date.now()}`,
              name:      meta.toolName ?? event.payload,
              input:     meta.toolInput,
              status:    'running',
              startedAt: new Date(),
            }
            return {
              messages: s.messages.map((m) =>
                m.id === id ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] } : m
              ),
            }
          }
          if (meta?.isToolEnd) {
            return {
              messages: s.messages.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      toolCalls: (m.toolCalls ?? []).map((tc) =>
                        tc.name === meta.toolName
                          ? { ...tc, output: meta.toolOutput, status: 'done', completedAt: new Date() }
                          : tc
                      ),
                    }
                  : m
              ),
            }
          }
          return {} // system log event, no message change
        }

        if (event.type === 'end') {
          return {
            streamPhase: 'complete' as StreamPhase,
            isStreaming: false,
            messages: s.messages.map((m) =>
              m.id === id
                ? { ...m, streaming: false, content: m.content || '(no response)' }
                : m
            ),
          }
        }

        if (event.type === 'error') {
          return {
            streamPhase: 'error' as StreamPhase,
            isStreaming: false,
            messages: s.messages.map((m) =>
              m.id === id
                ? { ...m, streaming: false, content: m.content || `⚠ ${event.payload}` }
                : m
            ),
          }
        }

        return {}
      }),

      appendChunk: (id, chunk) => set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== id) return m
          if (chunk.type === 'text') return { ...m, content: m.content + chunk.content }
          if (chunk.type === 'tool_start') {
            const tc: ToolCall = {
              id:        `tc-${Date.now()}`,
              name:      chunk.toolName ?? chunk.content,
              input:     chunk.toolInput,
              status:    'running',
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

      finalizeMessage: (id) => set((s) => ({
        streamPhase: 'idle' as StreamPhase,
        isStreaming: false,
        messages:    s.messages.map((m) => m.id === id ? { ...m, streaming: false } : m),
      })),

      clearMessages: () => set({ messages: [], conversationId: undefined, plannerPreview: null, activePlanSession: null, intakePreview: null }),

      // ── Status ──────────────────────────────────────────────────────────────────
      ocStatus:    { online: false },
      statusChecked: false,
      setOcStatus: (s) => set({ ocStatus: s, statusChecked: true }),

      // ── Stream phase ────────────────────────────────────────────────────────────
      streamPhase:    'idle',
      reactorVisualLive: false,
      tokenCount:     0,
      setStreamPhase: (p) => set({
        streamPhase: p,
        isStreaming: p === 'streaming' || p === 'start',
      }),
      setReactorVisualLive: (value) => set({ reactorVisualLive: value }),

      // Legacy isStreaming — kept in sync with streamPhase
      isStreaming:   false,
      setIsStreaming: (v) => set({
        streamPhase: v ? 'streaming' : 'idle',
        isStreaming:  v,
      }),

      // ── Tool calls ──────────────────────────────────────────────────────────────
      activeToolCalls: [],
      addToolCall:     (tc) => set((s) => ({ activeToolCalls: [...s.activeToolCalls, tc] })),
      updateToolCall:  (id, updates) => set((s) => ({
        activeToolCalls: s.activeToolCalls.map((tc) =>
          tc.id === id ? { ...tc, ...updates } : tc
        ),
      })),

      // ── Config ──────────────────────────────────────────────────────────────────
      config:    DEFAULT_CONFIG,
      setConfig: (c) => set((s) => ({
        config: {
          ...s.config, ...c,
          theme:   { ...s.config.theme,   ...(c.theme   ?? {}) },
          layout:  { ...s.config.layout,  ...(c.layout  ?? {}) },
          widgets: { ...s.config.widgets, ...(c.widgets ?? {}) },
        },
      })),

      // ── Logs ────────────────────────────────────────────────────────────────────
      systemLogs: [],
      pushLog: (line, level = 'info') => {
        const prefix = { info: '·', warn: '⚠', error: '✗', success: '✓' }[level]
        const ts     = new Date().toLocaleTimeString('en-US', { hour12: false })
        set((s) => ({
          systemLogs: [
            ...s.systemLogs.slice(-299),
            `[${ts}] ${prefix} ${line}`,
          ],
        }))
      },

      // ── Session ─────────────────────────────────────────────────────────────────
      sessionStart: new Date(),
    }),
    {
      name:       'jarvis-store',
      partialize: (s) => ({ config: s.config, conversationId: s.conversationId }),
    }
  )
)
