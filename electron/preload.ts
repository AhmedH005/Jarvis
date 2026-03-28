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
import type {
  PlannerApplyPlanningActionsPayload,
  PlannerBridgeResult,
  PlannerBridgeExecutionResult,
  PlannerCreateEventPayload,
  PlannerCreateTaskPayload,
} from '../src/shared/planner-bridge'
import type {
  PhoneDialInput,
  PhoneDialResult,
  PhoneCallUpdate,
  PhoneWebhookConfig,
} from '../src/shared/phone-bridge'
import type {
  GmailFetchResult,
  GmailSendInput,
  GmailSendResult,
  GmailStatus,
} from '../src/shared/gmail-bridge'

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

  telegram: {
    onMessage: (cb: (message: { chatId: string; text: string; messageId: number; username?: string; firstName?: string }) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, message: { chatId: string; text: string; messageId: number; username?: string; firstName?: string }) => cb(message)
      ipcRenderer.on('telegram:message', handler)
      return () => ipcRenderer.removeListener('telegram:message', handler)
    },
    reply: (chatId: string, text: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('telegram:reply', { chatId, text }),
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

  // ── Planner bridge ────────────────────────────────────────────────────────────
  planner: {
    /** Verify the fixed Electron planner bridge is reachable. */
    ping: (): Promise<PlannerBridgeResult> =>
      ipcRenderer.invoke('planner:ping'),

    /** Create a calendar event block in the live planner store. */
    createEvent: (data: PlannerCreateEventPayload): Promise<PlannerBridgeResult> =>
      ipcRenderer.invoke('planner:createEvent', data),

    /** Create a planner task in the live planner store. */
    createTask: (data: PlannerCreateTaskPayload): Promise<PlannerBridgeResult> =>
      ipcRenderer.invoke('planner:createTask', data),

    /** Create events/tasks atomically from intake parsing. */
    createManyFromIntake: (
      events: PlannerCreateEventPayload[],
      tasks: PlannerCreateTaskPayload[],
    ): Promise<PlannerBridgeResult> =>
      ipcRenderer.invoke('planner:createManyFromIntake', { events, tasks }),

    /** Return all calendar blocks from the live planner store. */
    listEvents: (): Promise<PlannerBridgeResult<unknown[]>> =>
      ipcRenderer.invoke('planner:listEvents'),

    /** Patch an existing calendar block by id. */
    updateEvent: (id: string, patch: Record<string, unknown>): Promise<PlannerBridgeResult> =>
      ipcRenderer.invoke('planner:updateEvent', { id, ...patch }),

    /** Delete a calendar block by id. */
    deleteEvent: (id: string): Promise<PlannerBridgeResult> =>
      ipcRenderer.invoke('planner:deleteEvent', { id }),

    /** Apply a planner result against the live planner store. */
    applyPlanningActions: (
      payload: PlannerApplyPlanningActionsPayload
    ): Promise<PlannerBridgeResult<PlannerBridgeExecutionResult>> =>
      ipcRenderer.invoke('planner:applyPlanningActions', payload),

    /**
     * Internal: renderer-side listener for bridge commands issued by main.
     * The TelegramPlannerBridge (or any store-aware component) subscribes here,
     * executes the requested store action, and calls _bridgeResult with the outcome.
     * Returns an unsubscribe function.
     */
    _onBridgeCommand: (
      cb: (cmd: { id: string; method: string; data: unknown }) => void
    ): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, cmd: { id: string; method: string; data: unknown }) => cb(cmd)
      ipcRenderer.on('planner:bridge:command', handler)
      return () => ipcRenderer.removeListener('planner:bridge:command', handler)
    },

    /** Internal: send the result of a bridge command back to main. */
    _bridgeResult: (id: string, result: PlannerBridgeResult): void => {
      ipcRenderer.send('planner:bridge:result', { id, result })
    },
  },

  // ── Music generation ─────────────────────────────────────────────────────────
  music: {
    /** Generate audio from a text prompt via ElevenLabs Sound Generation. */
    generate: (prompt: string): Promise<
      | { ok: true; mimeType: string; audioBase64: string; bytes: number }
      | { ok: false; error: string; status?: number }
    > => ipcRenderer.invoke('music:generate', { prompt }),
  },

  // ── TTS ──────────────────────────────────────────────────────────────────────
  tts: {
    /** Returns ElevenLabs speech audio or an error payload from the main process. */
    speak: (text: string): Promise<TtsSpeakResult | null> =>
      ipcRenderer.invoke('tts:speak', { text }),
  },

  // ── Phone ─────────────────────────────────────────────────────────────────────
  phone: {
    /**
     * Place an approved outbound call via Twilio.
     * Called by phoneWorker.executeOutboundCall() after approval is granted.
     */
    dial: (input: PhoneDialInput): Promise<PhoneDialResult> =>
      ipcRenderer.invoke('phone:dial', input),

    /**
     * Subscribe to call status updates pushed from main (Twilio webhooks).
     * Returns an unsubscribe function.
     */
    onCallUpdate: (cb: (update: PhoneCallUpdate) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, update: PhoneCallUpdate) => cb(update)
      ipcRenderer.on('phone:callUpdate', handler)
      return () => ipcRenderer.removeListener('phone:callUpdate', handler)
    },

    /** Get the webhook server config (port, public URL, credentials status). */
    getWebhookConfig: (): Promise<PhoneWebhookConfig> =>
      ipcRenderer.invoke('phone:webhook:config'),
  },

  // ── Gmail ─────────────────────────────────────────────────────────────────────
  gmail: {
    fetchRecent: (): Promise<GmailFetchResult> =>
      ipcRenderer.invoke('gmail:fetchRecent'),
    sendMessage: (input: GmailSendInput): Promise<GmailSendResult> =>
      ipcRenderer.invoke('gmail:sendMessage', input),
    status: (): Promise<GmailStatus> =>
      ipcRenderer.invoke('gmail:status'),
  },
}

contextBridge.exposeInMainWorld('jarvis', jarvisAPI)
contextBridge.exposeInMainWorld('electronAPI', jarvisAPI)

export type JarvisAPI = typeof jarvisAPI
