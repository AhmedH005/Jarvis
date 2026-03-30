export type ProviderHealthState = 'ready' | 'degraded' | 'unconfigured' | 'unavailable'

export type SharedActionState =
  | 'suggested'
  | 'staged'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'unavailable'

export type ActionDomain =
  | 'orchestration'
  | 'concierge'
  | 'builder'
  | 'calendar'
  | 'memory'
  | 'media'
  | 'speech'
  | 'system'

export type RiskLevel = 'low' | 'medium' | 'high'

export type CapabilityFlags = Record<string, boolean>

export interface ProviderHealth {
  state: ProviderHealthState
  /**
   * Structured live-status classification from the shared status model.
   * Optional so existing providers that have not yet been updated compile safely.
   * Consumers should prefer this over `state` when present.
   */
  liveStatus?: import('./live-status').ProviderLiveStatus
  detail: string
  missing: string[]
  checkedAt: string
}

export interface ProviderDescriptor<TCapabilities extends CapabilityFlags = CapabilityFlags> {
  key: string
  label: string
  capabilities: TCapabilities
  health: ProviderHealth
}

export interface ProviderFailure {
  code: string
  message: string
  retryable: boolean
  status?:
    | 'blockedByGovernance'
    | 'blockedByCapability'
    | 'blockedByDryRun'
    | 'unavailable'
    | 'providerFailure'
    | 'transportFailure'
  details?: Record<string, unknown>
}

export type ProviderResultStatus =
  | 'success'
  | 'readOnlySuccess'
  | 'staged'
  | 'blockedByGovernance'
  | 'blockedByCapability'
  | 'blockedByDryRun'
  | 'unavailable'
  | 'providerFailure'
  | 'transportFailure'

export interface ProviderTrace {
  traceId: string
  providerKey: string
  action: string
  occurredAt: string
  auditEntryId?: string
  stagedActionId?: string
  notes?: string[]
  metadata?: Record<string, unknown>
}

export interface ApprovalRequestRecord {
  id: string
  actionId: string
  title: string
  description: string
  riskLevel: RiskLevel
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  resolvedAt?: string
}

export interface ExecutionReceipt {
  id: string
  actionId: string
  domain: ActionDomain
  providerKey: string
  status: Extract<SharedActionState, 'completed' | 'failed' | 'unavailable'>
  summary: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface ActionRecord<TPayload = unknown> {
  id: string
  domain: ActionDomain
  providerKey: string
  state: SharedActionState
  title: string
  summary: string
  createdAt: string
  updatedAt: string
  payload?: TPayload
  failure?: ProviderFailure
  approval?: ApprovalRequestRecord
  receiptId?: string
}

export interface ProviderOperationResult<TData = void> {
  ok: boolean
  state: SharedActionState
  status: ProviderResultStatus
  summary: string
  data?: TData
  failure?: ProviderFailure
  trace?: ProviderTrace
}

export interface ProviderContract<TCapabilities extends CapabilityFlags = CapabilityFlags> {
  readonly key: string
  readonly label: string
  describe(): Promise<ProviderDescriptor<TCapabilities>>
}
