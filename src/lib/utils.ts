import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { OpenClawStatus, StreamEvent } from '@/types'
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
} from '@/shared/builder-bridge'
import type {
  PlannerApplyPlanningActionsPayload,
  PlannerBridgeResult,
  PlannerBridgeExecutionResult,
  PlannerCreateEventPayload,
  PlannerCreateTaskPayload,
} from '@/shared/planner-bridge'
import type {
  PhoneDialInput,
  PhoneDialResult,
  PhoneCallUpdate,
  PhoneWebhookConfig,
} from '@/shared/phone-bridge'
import type {
  GmailFetchResult,
  GmailSendInput,
  GmailSendResult,
  GmailStatus,
} from '@/shared/gmail-bridge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function nanoid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

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

/** Declare the window.jarvis API exposed by the Electron preload */
declare global {
  interface Window {
    electronAPI?: any
    jarvis?: {
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
      }
      openclaw: {
        send: (
          message: string,
          conversationId?: string,
          history?: Array<{ role: string; content: string }>,
          agentId?: string
        ) => Promise<void>
        onStream: (cb: (event: StreamEvent) => void) => (() => void)
        onChunk: (cb: (chunk: { type: string; content: string }) => void) => (() => void)
        onDone: (cb: () => void) => (() => void)
        onError: (cb: (msg: string) => void) => (() => void)
        status: () => Promise<OpenClawStatus>
        skills: () => Promise<Array<{ name: string; enabled: boolean; description?: string }>>
      }
      telegram: {
        onMessage: (
          cb: (message: { chatId: string; text: string; messageId: number; username?: string; firstName?: string }) => void
        ) => (() => void)
        reply: (chatId: string, text: string) => Promise<{ ok: boolean; error?: string }>
      }
      shell: {
        open: (url: string) => Promise<void>
      }
      fs: {
        readFile: (path: string) => Promise<{ ok: boolean; content: string; error?: string }>
      }
      builderPlan: {
        planTask: (request: BuilderPlanBridgeRequest) => Promise<BuilderPlanBridgeResult>
      }
      builderExecutionRequest: {
        createRequest: (input: BuilderExecutionRequestCreateInput) => Promise<BuilderExecutionRequestCreateResult>
        createRemediationRequest: (
          input: BuilderExecutionRemediationRequestInput
        ) => Promise<BuilderExecutionRemediationRequestResult>
        settle: (input: BuilderExecutionRequestSettleInput) => Promise<BuilderExecutionRequestSettleResult>
      }
      builderExecution: {
        start: (input: BuilderExecutionStartInput) => Promise<BuilderExecutionStartResult>
        finalize: (input: BuilderExecutionFinalizeInput) => Promise<BuilderExecutionFinalizeResult>
        listHistory: (query: BuilderExecutionHistoryQuery) => Promise<BuilderExecutionHistoryResult>
      }
      checker: {
        verifyRun: (input: CheckerVerifyRunInput) => Promise<CheckerVerifyRunResult>
      }
      llm: {
        send: (
          message: string,
          history?: Array<{ role: string; content: string }>
        ) => Promise<void>
        onStream: (cb: (event: { type: string; payload: string }) => void) => (() => void)
      }
      music: {
        generate: (prompt: string) => Promise<
          | { ok: true; mimeType: string; audioBase64: string; bytes: number }
          | { ok: false; error: string; status?: number }
        >
      }
      tts: {
        speak: (text: string) => Promise<TtsSpeakResult | null>
      }
      phone: {
        dial: (input: PhoneDialInput) => Promise<PhoneDialResult>
        onCallUpdate: (cb: (update: PhoneCallUpdate) => void) => (() => void)
        getWebhookConfig: () => Promise<PhoneWebhookConfig>
      }
      gmail: {
        fetchRecent: () => Promise<GmailFetchResult>
        sendMessage: (input: GmailSendInput) => Promise<GmailSendResult>
        status: () => Promise<GmailStatus>
      }
      planner: {
        ping: () => Promise<PlannerBridgeResult>
        createEvent: (data: PlannerCreateEventPayload) => Promise<PlannerBridgeResult>
        createTask: (data: PlannerCreateTaskPayload) => Promise<PlannerBridgeResult>
        createManyFromIntake: (events: PlannerCreateEventPayload[], tasks: PlannerCreateTaskPayload[]) => Promise<PlannerBridgeResult>
        listEvents: () => Promise<PlannerBridgeResult<unknown[]>>
        updateEvent: (id: string, patch: Record<string, unknown>) => Promise<PlannerBridgeResult>
        deleteEvent: (id: string) => Promise<PlannerBridgeResult>
        applyPlanningActions: (payload: PlannerApplyPlanningActionsPayload) => Promise<PlannerBridgeResult<PlannerBridgeExecutionResult>>
        _onBridgeCommand: (cb: (cmd: { id: string; method: string; data: unknown }) => void) => (() => void)
        _bridgeResult: (id: string, result: PlannerBridgeResult) => void
      }
    }
  }
}
