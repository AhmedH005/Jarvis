/**
 * Preload — secure bridge between Electron main and the React renderer.
 * Only explicitly exposed methods are accessible (contextBridge).
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { StreamEvent } from './openclaw'
import type {
  BuilderExecutionHistoryQuery,
  BuilderExecutionHistoryResult,
  BuilderExecutionFinalizeInput,
  BuilderExecutionFinalizeResult,
  BuilderExecutionRemediationRequestInput,
  BuilderExecutionRemediationRequestResult,
  BuilderExecutionRequestCreateInput,
  BuilderExecutionRequestCreateResult,
  BuilderExecutionRequestSettleInput,
  BuilderExecutionRequestSettleResult,
  BuilderExecutionStartInput,
  BuilderExecutionStartResult,
  BuilderPlanBridgeRequest,
  BuilderPlanBridgeResult,
  CheckerVerifyRunInput,
  CheckerVerifyRunResult,
} from '../src/shared/builder-bridge'

type LegacyTtsSpeakResult =
  | ArrayBuffer
  | Uint8Array
  | {
      type: 'Buffer'
      data: number[]
    }

type TtsSpeakResult =
  | LegacyTtsSpeakResult
  | {
      ok: true
      mimeType: string
      audioBase64: string
      bytes: number
    }
  | {
      ok: false
      error: string
      status?: number
    }

const jarvisAPI = {
  // ── Window controls ──────────────────────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close:    () => ipcRenderer.invoke('window:close'),
  },

  // ── OpenClaw ─────────────────────────────────────────────────────────────────
  openclaw: {
    /**
     * Send a message. Events arrive via `onStream`.
     * Returns when IPC invoke resolves (after stream completes or errors).
     */
    send: (
      message:        string,
      conversationId?: string,
      history?:       Array<{ role: string; content: string }>,
      agentId?:       string
    ) => ipcRenderer.invoke('openclaw:send', { message, conversationId, history, agentId }),

    /**
     * Unified stream listener.
     * Events: { type: 'start'|'token'|'end'|'error'|'log', payload, meta? }
     * Returns an unsubscribe function.
     */
    onStream: (cb: (event: StreamEvent) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, e: StreamEvent) => cb(e)
      ipcRenderer.on('openclaw:stream', handler)
      return () => ipcRenderer.removeListener('openclaw:stream', handler)
    },

    // ── Convenience wrappers (used by InputBar) ───────────────────────────────
    /** @deprecated Use onStream — kept for backward compat */
    onChunk: (cb: (chunk: { type: string; content: string }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, e: StreamEvent) => {
        if (e.type === 'token') cb({ type: 'text', content: e.payload })
        if (e.type === 'log' && e.meta?.isToolStart)
          cb({ type: 'tool_start', content: e.meta.toolName ?? '' })
        if (e.type === 'log' && e.meta?.isToolEnd)
          cb({ type: 'tool_end', content: e.meta.toolName ?? '' })
      }
      ipcRenderer.on('openclaw:stream', handler)
      return () => ipcRenderer.removeListener('openclaw:stream', handler)
    },
    /** @deprecated Use onStream */
    onDone: (cb: () => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, e: StreamEvent) => {
        if (e.type === 'end') cb()
      }
      ipcRenderer.on('openclaw:stream', handler)
      return () => ipcRenderer.removeListener('openclaw:stream', handler)
    },
    /** @deprecated Use onStream */
    onError: (cb: (msg: string) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, e: StreamEvent) => {
        if (e.type === 'error') cb(e.payload)
      }
      ipcRenderer.on('openclaw:stream', handler)
      return () => ipcRenderer.removeListener('openclaw:stream', handler)
    },

    /** Gateway health check */
    status: () => ipcRenderer.invoke('openclaw:status'),

    /** List enabled skills */
    skills: () => ipcRenderer.invoke('openclaw:skills'),
  },

  // ── Shell ────────────────────────────────────────────────────────────────────
  shell: {
    open: (url: string) => ipcRenderer.invoke('shell:open', url),
  },

  // ── FS: read backend markdown files ──────────────────────────────────────────
  fs: {
    readFile: (path: string): Promise<{ ok: boolean; content: string; error?: string }> =>
      ipcRenderer.invoke('fs:readFile', path),
  },

  // ── Builder bridge ───────────────────────────────────────────────────────────
  builderPlan: {
    planTask: (request: BuilderPlanBridgeRequest): Promise<BuilderPlanBridgeResult> =>
      ipcRenderer.invoke('builder:planTask', request),
  },

  builderExecutionRequest: {
    createRequest: (input: BuilderExecutionRequestCreateInput): Promise<BuilderExecutionRequestCreateResult> =>
      ipcRenderer.invoke('builder:createExecutionRequest', input),
    createRemediationRequest: (
      input: BuilderExecutionRemediationRequestInput
    ): Promise<BuilderExecutionRemediationRequestResult> =>
      ipcRenderer.invoke('builder:createRemediationRequest', input),
    settle: (input: BuilderExecutionRequestSettleInput): Promise<BuilderExecutionRequestSettleResult> =>
      ipcRenderer.invoke('builder:settleExecutionRequest', input),
  },

  builderExecution: {
    start: (input: BuilderExecutionStartInput): Promise<BuilderExecutionStartResult> =>
      ipcRenderer.invoke('builder:startExecution', input),
    finalize: (input: BuilderExecutionFinalizeInput): Promise<BuilderExecutionFinalizeResult> =>
      ipcRenderer.invoke('builder:finalizeExecution', input),
    listHistory: (query: BuilderExecutionHistoryQuery): Promise<BuilderExecutionHistoryResult> =>
      ipcRenderer.invoke('builder:listExecutionHistory', query),
  },

  checker: {
    verifyRun: (input: CheckerVerifyRunInput): Promise<CheckerVerifyRunResult> =>
      ipcRenderer.invoke('checker:verifyRun', input),
  },

  // ── LLM ──────────────────────────────────────────────────────────────────────
  llm: {
    /**
     * Send a message to the active LLM provider (Claude).
     * Tokens arrive via `onStream`; resolves when the stream ends or errors.
     */
    send: (
      message: string,
      history?: Array<{ role: string; content: string }>
    ) => ipcRenderer.invoke('llm:send', { message, history }),

    /** Stream listener — events: { type: 'token'|'end'|'error', payload: string } */
    onStream: (cb: (event: { type: string; payload: string }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, e: { type: string; payload: string }) => cb(e)
      ipcRenderer.on('llm:stream', handler)
      return () => ipcRenderer.removeListener('llm:stream', handler)
    },
  },

  // ── TTS ──────────────────────────────────────────────────────────────────────
  tts: {
    /** Returns ElevenLabs speech audio or an error payload from the main process. */
    speak: (text: string): Promise<TtsSpeakResult | null> =>
      ipcRenderer.invoke('tts:speak', { text }),
  },
}

contextBridge.exposeInMainWorld('jarvis', jarvisAPI)

export type JarvisAPI = typeof jarvisAPI
