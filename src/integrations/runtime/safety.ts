import type { ActionDomain, ProviderDescriptor, ProviderOperationResult } from '@/integrations/contracts/base'
import type { ProviderLiveStatus } from '@/integrations/contracts/live-status'
import { blockedResult, buildProviderFailure } from '@/integrations/contracts/result-helpers'
import { CAPABILITIES, DRY_RUN, NO_SECRETS_MODE, getRuntimeSafetySnapshot } from '@/shared/operational-safety'
import { useActionRuntimeStore } from '@/store/action-runtime'

export function blockedByCapability<TData = void>(
  providerKey: string,
  action: string,
  capability: keyof typeof CAPABILITIES,
  summary: string,
): ProviderOperationResult<TData> {
  return blockedResult(
    {
      providerKey,
      action,
      metadata: { capability },
    },
    summary,
    'blockedByCapability',
    buildProviderFailure(
      'blockedByCapability',
      `capability_${capability}_disabled`,
      `${capability} capability is disabled.`,
      false,
      { capability },
    ),
  )
}

export function isCapabilityEnabled(capability: keyof typeof CAPABILITIES): boolean {
  return CAPABILITIES[capability]
}

export function stageAction(input: {
  domain: ActionDomain
  providerKey: string
  title: string
  summary: string
  payload?: unknown
}) {
  return useActionRuntimeStore.getState().recordAction({
    domain: input.domain,
    providerKey: input.providerKey,
    state: 'staged',
    title: input.title,
    summary: input.summary,
    payload: input.payload,
  })
}

export function safetyDetailLines(): string[] {
  const snapshot = getRuntimeSafetySnapshot()
  return [
    snapshot.dryRun ? 'Dry run is enabled.' : 'Dry run is disabled.',
    snapshot.noSecretsMode ? 'No secrets mode is enabled.' : 'Secrets mode is enabled.',
    `Capability execute: ${snapshot.capabilities.execute ? 'enabled' : 'disabled'}`,
    `Capability write: ${snapshot.capabilities.write ? 'enabled' : 'disabled'}`,
    `Capability network: ${snapshot.capabilities.network ? 'enabled' : 'disabled'}`,
  ]
}

/**
 * Compute a ProviderLiveStatus from a set of runtime conditions.
 *
 * Priority order (first match wins):
 *  1. No runtime bridge → UNAVAILABLE
 *  2. Key not present in env at all → STAGED_PENDING_CREDENTIALS
 *  3. Key present in env but blocked by NO_SECRETS_MODE → STAGED_PENDING_SAFE_EXECUTION_SUPPORT
 *  4. Network capability disabled → WIRED_BLOCKED_BY_CAPABILITY
 *  5. Execute capability disabled → WIRED_BLOCKED_BY_CAPABILITY
 *  6. Write operation + DRY_RUN → WIRED_BLOCKED_BY_DRY_RUN
 *  7. Skill/binary not installed → STAGED_PENDING_BINARY
 *  8. All conditions met → LIVE or LIVE_READ_ONLY
 */
export function computeProviderLiveStatus(conditions: {
  /** Bridge / IPC is present and reachable */
  runtimeAvailable: boolean
  /** Key exists directly in process.env (not via readSecret) */
  keyPresentInEnv: boolean
  /** Key is accessible via readSecret() (false when NO_SECRETS_MODE=true) */
  keyAccessible: boolean
  networkEnabled: boolean
  executeEnabled: boolean
  /** Only applies when checking a write/mutation operation */
  writeOperation?: boolean
  /** Skill/binary dependency is installed and reachable */
  binaryAvailable?: boolean
}): ProviderLiveStatus {
  const {
    runtimeAvailable,
    keyPresentInEnv,
    keyAccessible,
    networkEnabled,
    executeEnabled,
    writeOperation = false,
    binaryAvailable = true,
  } = conditions

  if (!runtimeAvailable) return 'UNAVAILABLE'
  if (!keyPresentInEnv) return 'STAGED_PENDING_CREDENTIALS'
  if (!keyAccessible) return 'STAGED_PENDING_SAFE_EXECUTION_SUPPORT'
  if (!networkEnabled) return 'WIRED_BLOCKED_BY_CAPABILITY'
  if (!executeEnabled) return 'WIRED_BLOCKED_BY_CAPABILITY'
  if (!binaryAvailable) return 'STAGED_PENDING_BINARY'
  if (writeOperation && DRY_RUN) return 'WIRED_BLOCKED_BY_DRY_RUN'
  return writeOperation ? 'LIVE' : 'LIVE_READ_ONLY'
}

/**
 * Compute a ProviderLiveStatus for skill-based providers (OpenClaw-routed).
 * These don't need explicit credentials but do require the skill to be installed.
 */
export function computeSkillProviderLiveStatus(conditions: {
  runtimeAvailable: boolean
  gatewayOnline: boolean
  skillDiscovered: boolean
  networkEnabled: boolean
  writeOperation?: boolean
}): ProviderLiveStatus {
  const { runtimeAvailable, gatewayOnline, skillDiscovered, networkEnabled, writeOperation = false } = conditions

  if (!runtimeAvailable) return 'UNAVAILABLE'
  if (!gatewayOnline) return 'UNAVAILABLE'
  if (!skillDiscovered) return 'STAGED_PENDING_BINARY'
  if (!networkEnabled) return 'WIRED_BLOCKED_BY_CAPABILITY'
  if (writeOperation && DRY_RUN) return 'WIRED_BLOCKED_BY_DRY_RUN'
  return writeOperation ? 'LIVE' : 'LIVE_READ_ONLY'
}
