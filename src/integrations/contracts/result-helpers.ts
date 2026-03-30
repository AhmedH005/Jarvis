import type { CalendarActionResult } from '@/calendar/calendarTypes'
import type {
  ProviderFailure,
  ProviderOperationResult,
  ProviderResultStatus,
  ProviderTrace,
  SharedActionState,
} from './base'

export interface ProviderResultContext {
  providerKey: string
  action: string
  auditEntryId?: string
  stagedActionId?: string
  notes?: string[]
  metadata?: Record<string, unknown>
}

type FailureStatus = Extract<
  ProviderResultStatus,
  'blockedByGovernance' | 'blockedByCapability' | 'blockedByDryRun' | 'unavailable' | 'providerFailure' | 'transportFailure'
>

type SuccessStatus = Extract<ProviderResultStatus, 'success' | 'readOnlySuccess'>
type StageableStatus = Extract<ProviderResultStatus, 'staged' | 'blockedByCapability' | 'blockedByDryRun'>

function now(): string {
  return new Date().toISOString()
}

function makeTraceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function buildTrace(
  context: ProviderResultContext,
  overrides?: Partial<Pick<ProviderTrace, 'notes' | 'metadata'>>,
): ProviderTrace {
  return {
    traceId: makeTraceId(),
    providerKey: context.providerKey,
    action: context.action,
    occurredAt: now(),
    auditEntryId: context.auditEntryId,
    stagedActionId: context.stagedActionId,
    notes: overrides?.notes ?? context.notes,
    metadata: overrides?.metadata ?? context.metadata,
  }
}

function logLevelFor(status: ProviderResultStatus): 'info' | 'warn' | 'error' {
  if (status === 'providerFailure' || status === 'transportFailure') return 'error'
  if (
    status === 'blockedByGovernance' ||
    status === 'blockedByCapability' ||
    status === 'blockedByDryRun' ||
    status === 'unavailable'
  ) {
    return 'warn'
  }
  return 'info'
}

function logResult(
  status: ProviderResultStatus,
  summary: string,
  trace: ProviderTrace | undefined,
  failure?: ProviderFailure,
): void {
  const payload = {
    status,
    summary,
    traceId: trace?.traceId,
    providerKey: trace?.providerKey,
    action: trace?.action,
    auditEntryId: trace?.auditEntryId,
    stagedActionId: trace?.stagedActionId,
    notes: trace?.notes,
    metadata: trace?.metadata,
    failureCode: failure?.code,
  }
  const method = logLevelFor(status)
  console[method]('[provider-result]', payload)
}

export function buildProviderFailure(
  status: FailureStatus,
  code: string,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>,
): ProviderFailure {
  return {
    code,
    message,
    retryable,
    status,
    details,
  }
}

function buildOperationResult<TData>(input: {
  ok: boolean
  state: SharedActionState
  status: ProviderResultStatus
  summary: string
  data?: TData
  failure?: ProviderFailure
  trace?: ProviderTrace
}): ProviderOperationResult<TData> {
  logResult(input.status, input.summary, input.trace, input.failure)
  return input
}

export function successResult<TData>(
  context: ProviderResultContext,
  summary: string,
  data?: TData,
  status: SuccessStatus = 'success',
): ProviderOperationResult<TData> {
  return buildOperationResult({
    ok: true,
    state: 'completed',
    status,
    summary,
    data,
    trace: buildTrace(context),
  })
}

export function stagedResult<TData>(
  context: ProviderResultContext,
  summary: string,
  data?: TData,
  options?: {
    status?: StageableStatus
    state?: Extract<SharedActionState, 'suggested' | 'staged' | 'awaiting_approval'>
    notes?: string[]
    metadata?: Record<string, unknown>
  },
): ProviderOperationResult<TData> {
  return buildOperationResult({
    ok: true,
    state: options?.state ?? 'staged',
    status: options?.status ?? 'staged',
    summary,
    data,
    trace: buildTrace(context, {
      notes: options?.notes,
      metadata: options?.metadata,
    }),
  })
}

export function blockedResult<TData>(
  context: ProviderResultContext,
  summary: string,
  status: Extract<ProviderResultStatus, 'blockedByGovernance' | 'blockedByCapability' | 'unavailable'>,
  failure: ProviderFailure,
): ProviderOperationResult<TData> {
  return buildOperationResult({
    ok: false,
    state: 'unavailable',
    status,
    summary,
    failure,
    trace: buildTrace(context),
  })
}

export function failedResult<TData>(
  context: ProviderResultContext,
  summary: string,
  status: Extract<ProviderResultStatus, 'providerFailure' | 'transportFailure'>,
  failure: ProviderFailure,
): ProviderOperationResult<TData> {
  return buildOperationResult({
    ok: false,
    state: 'failed',
    status,
    summary,
    failure,
    trace: buildTrace(context),
  })
}

export function calendarSuccessResult<TData>(
  context: ProviderResultContext,
  data: TData,
  summary: string,
  status: SuccessStatus = 'readOnlySuccess',
): CalendarActionResult<TData> {
  const trace = buildTrace(context)
  logResult(status, summary, trace)
  return {
    success: true,
    data,
    status,
    summary,
    trace,
  }
}

export function calendarFailureResult<TData = never>(
  context: ProviderResultContext,
  error: string,
  status: Exclude<ProviderResultStatus, 'success' | 'readOnlySuccess'>,
  failure?: ProviderFailure,
): CalendarActionResult<TData> {
  const trace = buildTrace(context)
  logResult(status, error, trace, failure)
  return {
    success: false,
    error,
    status,
    summary: error,
    failure,
    trace,
  }
}
