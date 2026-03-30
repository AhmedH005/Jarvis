import type { GmailMessageRecord, GmailSendInput, GmailSendResult } from '@/shared/gmail-bridge'
import type { MailProvider } from '@/integrations/contracts/providers'
import type { ProviderDescriptor, ProviderOperationResult } from '@/integrations/contracts/base'
import {
  blockedResult,
  buildProviderFailure,
  failedResult,
  stagedResult,
  successResult,
} from '@/integrations/contracts/result-helpers'
import { loadSkillManifest } from '@/integrations/skills/loader'
import { stageAction, blockedByCapability, isCapabilityEnabled, computeProviderLiveStatus } from '@/integrations/runtime/safety'
import { DRY_RUN } from '@/shared/operational-safety'
import { enforce, toOperationResult } from '@/integrations/governance/governance-enforcer'

function now(): string {
  return new Date().toISOString()
}

/**
 * Classify a Gmail API error string into a stable failure code.
 *
 * Failure codes:
 *   oauth_failure        — OAuth token refresh failed (invalid grant / expired)
 *   credentials_missing  — One or more required env vars absent
 *   api_disabled         — Gmail API not enabled in Google Cloud Console
 *   rate_limited         — 429 / quotaExceeded
 *   transport_failure    — Network-level error (timeout, DNS, etc.)
 *   gmail_error          — Any other API-level error
 */
function classifyGmailError(message: string): {
  code: string
  retryable: boolean
} {
  const lower = message.toLowerCase()
  if (/invalid_grant|invalid credentials|unauthenticated|oauth token refresh failed/i.test(message)) {
    return { code: 'oauth_failure', retryable: false }
  }
  if (/gmail auth missing|not configured/i.test(message)) {
    return { code: 'credentials_missing', retryable: false }
  }
  if (/api has not been used|is disabled|service_disabled/i.test(message)) {
    return { code: 'api_disabled', retryable: false }
  }
  if (/quota|rate.?limit|429/i.test(message) || lower.includes('toomanyrequests')) {
    return { code: 'rate_limited', retryable: true }
  }
  if (/fetch failed|network|econnrefused|timeout|enotfound/i.test(message)) {
    return { code: 'transport_failure', retryable: true }
  }
  return { code: 'gmail_error', retryable: true }
}

export class GmailMailProvider implements MailProvider {
  readonly key = 'concierge-mail-skill'
  readonly label = 'Agent Mail CLI'

  async describe(): Promise<ProviderDescriptor<{
    readInbox: boolean
    sendMail: boolean
    threadReplies: boolean
  }>> {
    const manifest = await loadSkillManifest('agent-mail-cli')

    let gmailConfigured = false
    let gmailAddress: string | undefined
    let gmailMissing: string[] = []

    try {
      const status = await window.jarvis?.gmail?.status?.()
      if (status) {
        gmailConfigured = status.configured
        gmailAddress = status.address
        gmailMissing = status.missing
      } else {
        gmailMissing = ['jarvis.gmail bridge not available']
      }
    } catch (err) {
      gmailMissing = [`Gmail status check error: ${err instanceof Error ? err.message : String(err)}`]
    }

    const networkEnabled = isCapabilityEnabled('network')

    // Gmail credentials are read from process.env directly (not readSecret), so
    // they are always accessible regardless of NO_SECRETS_MODE. keyPresentInEnv
    // is effectively the same as gmailConfigured for this provider.
    const liveStatus = computeProviderLiveStatus({
      runtimeAvailable: Boolean(window.jarvis?.gmail),
      keyPresentInEnv: gmailConfigured,     // gmail.ts reads process.env directly
      keyAccessible: gmailConfigured,       // not gated by NO_SECRETS_MODE
      networkEnabled,
      executeEnabled: true,                 // inbox reads don't need execute
    })

    const readInbox = gmailConfigured && networkEnabled
    const missing: string[] = []
    if (!networkEnabled) missing.push('network capability disabled')
    if (!gmailConfigured) missing.push(...gmailMissing)
    missing.push('sendMail=false (DRY_RUN)')

    const healthDetail = [
      `${manifest.label} [${liveStatus}] is selected for Concierge mail workflows.`,
      gmailConfigured
        ? `Gmail configured for ${gmailAddress ?? 'unknown address'}.`
        : `Gmail not configured: ${gmailMissing.join(', ')}.`,
      networkEnabled
        ? 'Network capability enabled — inbox reads are live.'
        : 'Network capability disabled — reads blocked by capability gate.',
      'Sends remain blocked by DRY_RUN.',
    ].join(' ')

    console.log('[GmailMailProvider] describe():', { gmailConfigured, gmailAddress, liveStatus })

    return {
      key: this.key,
      label: this.label,
      capabilities: {
        readInbox,
        sendMail: false,
        threadReplies: false,
      },
      health: {
        state: readInbox ? 'ready' : 'degraded',
        liveStatus,
        detail: healthDetail,
        missing,
        checkedAt: now(),
      },
    }
  }

  async fetchRecentMessages(): Promise<ProviderOperationResult<GmailMessageRecord[]>> {
    console.log('[GmailMailProvider] fetchRecentMessages() invoked')
    const action = 'mail:fetchRecentMessages'

    const gov = await enforce(
      'agent-mail-cli', this.key, 'gmail:fetchRecent',
      ['external_api', 'network'], false,
    )
    if (!gov.allowed) return toOperationResult(gov)

    if (!isCapabilityEnabled('network')) {
      console.log('[GmailMailProvider] blocked: network capability disabled')
      return blockedByCapability(this.key, action, 'network', 'Gmail inbox fetch blocked: network capability is disabled.')
    }

    if (!window.jarvis?.gmail?.fetchRecent) {
      return blockedResult(
        { providerKey: this.key, action },
        'Gmail bridge not available (no Electron context).',
        'unavailable',
        buildProviderFailure('unavailable', 'no_bridge', 'window.jarvis.gmail.fetchRecent not present', false),
      )
    }

    try {
      const result = await window.jarvis.gmail.fetchRecent()
      console.log('[GmailMailProvider] fetchRecent:', { ok: result.ok, count: result.messages?.length })

      if (!result.ok) {
        const { code, retryable } = classifyGmailError(result.error ?? '')
        const status = code === 'transport_failure' ? 'transportFailure' : 'providerFailure'
        return failedResult(
          { providerKey: this.key, action },
          result.error ?? 'Gmail fetch failed',
          status,
          buildProviderFailure(status, code, result.error ?? 'unknown Gmail error', retryable),
        )
      }

      const messages = result.messages ?? []
      return successResult(
        { providerKey: this.key, action, metadata: { count: messages.length } },
        `Fetched ${messages.length} message${messages.length === 1 ? '' : 's'} from Gmail.`,
        messages,
        'readOnlySuccess',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[GmailMailProvider] fetchRecentMessages error:', message)
      const { code, retryable } = classifyGmailError(message)
      const status = code === 'transport_failure' ? 'transportFailure' : 'providerFailure'
      return failedResult(
        { providerKey: this.key, action },
        `Gmail fetch error: ${message}`,
        status,
        buildProviderFailure(status, code, message, retryable),
      )
    }
  }

  async sendMessage(input: GmailSendInput): Promise<ProviderOperationResult<GmailSendResult>> {
    console.log('[GmailMailProvider] sendMessage() invoked — staging under DRY_RUN')
    const action = 'mail:sendMessage'

    const gov = await enforce(
      'agent-mail-cli', this.key, 'gmail:sendMessage',
      ['email', 'external_api', 'network'], true,
    )
    if (!gov.allowed) return toOperationResult(gov)

    if (DRY_RUN) {
      const stagedActionId = stageAction({
        domain: 'concierge',
        providerKey: this.key,
        title: 'Stage outbound mail',
        summary: `Outbound mail to ${input.to} (subject: "${input.subject}") staged for agent-mail-cli.`,
        payload: input,
      })
      return stagedResult(
        {
          providerKey: this.key,
          action,
          stagedActionId,
          metadata: { to: input.to, subject: input.subject },
        },
        'Outbound mail staged. Send will not execute until DRY_RUN is disabled.',
        { ok: false, error: 'Blocked (dry run)' },
        {
          status: 'blockedByDryRun',
          notes: ['DRY_RUN prevents live email sends.'],
        },
      )
    }

    if (!isCapabilityEnabled('network')) {
      return blockedByCapability(this.key, action, 'network', 'Gmail send blocked: network capability is disabled.')
    }

    if (!window.jarvis?.gmail?.sendMessage) {
      return blockedResult(
        { providerKey: this.key, action },
        'Gmail bridge not available (no Electron context).',
        'unavailable',
        buildProviderFailure('unavailable', 'no_bridge', 'window.jarvis.gmail.sendMessage not present', false),
      )
    }

    try {
      const result = await window.jarvis.gmail.sendMessage(input)
      console.log('[GmailMailProvider] sendMessage:', result)

      if (!result.ok) {
        const { code, retryable } = classifyGmailError(result.error ?? '')
        const status = code === 'transport_failure' ? 'transportFailure' : 'providerFailure'
        return failedResult(
          { providerKey: this.key, action, metadata: { to: input.to } },
          result.error ?? 'Gmail send failed',
          status,
          buildProviderFailure(status, code, result.error ?? 'unknown', retryable),
        )
      }

      return successResult(
        {
          providerKey: this.key,
          action,
          metadata: { to: input.to, messageId: result.id ?? null },
        },
        `Mail sent to ${input.to} via Gmail (id: ${result.id ?? 'unknown'}).`,
        result,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[GmailMailProvider] sendMessage error:', message)
      const { code, retryable } = classifyGmailError(message)
      const status = code === 'transport_failure' ? 'transportFailure' : 'providerFailure'
      return failedResult(
        { providerKey: this.key, action, metadata: { to: input.to } },
        `Gmail send error: ${message}`,
        status,
        buildProviderFailure(status, code, message, retryable),
      )
    }
  }
}
