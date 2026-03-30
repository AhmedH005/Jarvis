import { loadSkillManifest } from '@/integrations/skills/loader'
import { stageAction, isCapabilityEnabled } from '@/integrations/runtime/safety'
import { useActionRuntimeStore } from '@/store/action-runtime'
import { enforce, toOperationResult } from '@/integrations/governance/governance-enforcer'
import type { ConciergeProvider, MailProvider } from '@/integrations/contracts/providers'
import type { ProviderDescriptor, ProviderOperationResult } from '@/integrations/contracts/base'
import { stagedResult } from '@/integrations/contracts/result-helpers'
import type { GmailMessageRecord } from '@/shared/gmail-bridge'
import { DRY_RUN } from '@/shared/operational-safety'

function now(): string {
  return new Date().toISOString()
}

export class DefaultConciergeProvider implements ConciergeProvider {
  readonly key = 'concierge-skill-provider'
  readonly label = 'Concierge Skill Provider'

  constructor(private readonly mailProvider: MailProvider) {}

  async describe(): Promise<ProviderDescriptor<{
    inbox: boolean
    phone: boolean
    reservations: boolean
    monitoring: boolean
    documents: boolean
    approvals: boolean
  }>> {
    const [mailDescriptor, bookingsManifest] = await Promise.all([
      this.mailProvider.describe(),
      loadSkillManifest('bookameeting'),
    ])

    const inboxLive = mailDescriptor.capabilities.readInbox

    const missing: string[] = []
    if (!mailDescriptor.capabilities.readInbox) {
      missing.push(...mailDescriptor.health.missing.filter((m) => !missing.includes(m)))
    }
    missing.push('phone=false (Twilio not configured)')
    missing.push('reservations=false (bookameeting not wired)')
    if (DRY_RUN) missing.push('sendMail=false (DRY_RUN)')

    const healthDetail = [
      `${mailDescriptor.label} [${mailDescriptor.health.liveStatus ?? mailDescriptor.health.state}] and ${bookingsManifest.label} selected for Concierge.`,
      inboxLive
        ? 'Inbox reads are live via Gmail.'
        : `Inbox reads blocked: ${mailDescriptor.health.missing.slice(0, 2).join('; ')}.`,
      'Phone and booking remain staged. Sends blocked by DRY_RUN.',
    ].join(' ')

    return {
      key: this.key,
      label: this.label,
      capabilities: {
        inbox: inboxLive,
        phone: false,
        reservations: false,
        monitoring: false,
        documents: false,
        approvals: true,
      },
      health: {
        state: inboxLive ? 'ready' : 'degraded',
        liveStatus: mailDescriptor.health.liveStatus,
        detail: healthDetail,
        missing,
        checkedAt: now(),
      },
    }
  }

  async approveAction(approvalId: string): Promise<void> {
    useActionRuntimeStore.getState().resolveApproval(approvalId, 'approved')
  }

  async rejectAction(approvalId: string): Promise<void> {
    useActionRuntimeStore.getState().resolveApproval(approvalId, 'rejected')
  }

  /**
   * Sync inbox from Gmail via the real mail provider.
   *
   * Previously this read from local JSON and always returned staged data.
   * Now it delegates to the mail provider's real invocation path, which
   * calls window.jarvis.gmail.fetchRecent() when network capability is enabled.
   *
   * Result is gated by the same capability rules as the mail provider itself.
   */
  async syncInboxFromGmail(): Promise<ProviderOperationResult<GmailMessageRecord[]>> {
    console.log('[DefaultConciergeProvider] syncInboxFromGmail() — delegating to mail provider')

    const result = await this.mailProvider.fetchRecentMessages()

    console.log('[DefaultConciergeProvider] syncInboxFromGmail result:', {
      ok: result.ok,
      state: result.state,
    })

    // Pass the result through; no local fallback, no fake data
    return result
  }

  async generateDraftReplyForEmail(emailId: string): Promise<ProviderOperationResult<string | null>> {
    console.log('[DefaultConciergeProvider] generateDraftReplyForEmail() — staging (DRY_RUN)')
    const gov = await enforce('agent-mail-cli', this.key, 'concierge:generateDraft', ['email'], true)
    if (!gov.allowed) return toOperationResult(gov)
    const stagedActionId = stageAction({
      domain: 'concierge',
      providerKey: this.key,
      title: 'Stage draft reply',
      summary: `Draft reply generation for email ${emailId} staged for agent-mail-cli.`,
      payload: { emailId },
    })
    return stagedResult(
      { providerKey: this.key, action: 'concierge:generateDraftReply', stagedActionId, metadata: { emailId } },
      'Draft reply generation staged.',
      null,
      { status: 'blockedByDryRun', notes: ['DRY_RUN prevents live draft generation.'] },
    )
  }

  async queueDraftReplyForApproval(emailId: string): Promise<ProviderOperationResult<{ emailId: string }>> {
    console.log('[DefaultConciergeProvider] queueDraftReplyForApproval() — staging (DRY_RUN)')
    const gov = await enforce('agent-mail-cli', this.key, 'concierge:queueApproval', ['email'], true)
    if (!gov.allowed) return toOperationResult(gov)
    const stagedActionId = stageAction({
      domain: 'concierge',
      providerKey: this.key,
      title: 'Stage outbound approval',
      summary: `Approval-gated send for email ${emailId} staged.`,
      payload: { emailId },
    })
    return stagedResult(
      { providerKey: this.key, action: 'concierge:queueDraftReplyForApproval', stagedActionId, metadata: { emailId } },
      'Send queued for approval.',
      { emailId },
      { status: DRY_RUN ? 'blockedByDryRun' : 'staged' },
    )
  }

  async dispatchOutboundCall(
    contact: string,
    instruction: string,
    mode?: 'serious' | 'demo',
    phoneNumber?: string,
  ): Promise<ProviderOperationResult<{ contact: string }>> {
    console.log('[DefaultConciergeProvider] dispatchOutboundCall() — staging (DRY_RUN, phone not configured)')
    const gov = await enforce('bookameeting', this.key, 'concierge:outboundCall', ['external_api', 'network'], true)
    if (!gov.allowed) return toOperationResult(gov)
    const stagedActionId = stageAction({
      domain: 'concierge',
      providerKey: this.key,
      title: 'Stage outbound call',
      summary: `Outbound call to ${contact} staged for bookameeting/phone.`,
      payload: { contact, instruction, mode, phoneNumber },
    })
    return stagedResult(
      {
        providerKey: this.key,
        action: 'concierge:dispatchOutboundCall',
        stagedActionId,
        metadata: { contact, mode: mode ?? null, phoneNumber: phoneNumber ?? null },
      },
      'Outbound call staged. Phone provider not configured.',
      { contact },
    )
  }

  async dispatchBookingRequest(
    type: string,
    request: string,
    constraints: Record<string, unknown> = {},
  ): Promise<ProviderOperationResult<{ type: string }>> {
    console.log('[DefaultConciergeProvider] dispatchBookingRequest() — staging (DRY_RUN)')
    const gov = await enforce('bookameeting', this.key, 'concierge:bookingRequest', ['calendar', 'external_api', 'network'], true)
    if (!gov.allowed) return toOperationResult(gov)

    if (!isCapabilityEnabled('network')) {
      const stagedActionId = stageAction({
        domain: 'concierge',
        providerKey: this.key,
        title: 'Stage booking request',
        summary: `Booking request for ${type} staged (network capability disabled).`,
        payload: { type, request, constraints },
      })
      return stagedResult(
        {
          providerKey: this.key,
          action: 'concierge:dispatchBookingRequest',
          stagedActionId,
          metadata: { type },
        },
        'Booking request staged. Blocked by network capability gate.',
        { type },
        { status: 'blockedByCapability', notes: ['CAPABILITIES.network=false'] },
      )
    }

    const stagedActionId = stageAction({
      domain: 'concierge',
      providerKey: this.key,
      title: 'Stage booking request',
      summary: `Booking request for ${type} staged for bookameeting.`,
      payload: { type, request, constraints },
    })
    return stagedResult(
      { providerKey: this.key, action: 'concierge:dispatchBookingRequest', stagedActionId, metadata: { type } },
      'Booking request staged.',
      { type },
      { status: DRY_RUN ? 'blockedByDryRun' : 'staged' },
    )
  }
}
