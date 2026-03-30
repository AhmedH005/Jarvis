import type {
  BuilderProvider,
  CalendarProvider,
  ConciergeProvider,
  MailProvider,
  MediaProvider,
  MemoryProvider,
  OrchestratorProvider,
  ReminderProvider,
  RuntimeProvider,
  RuntimeSnapshot,
  SpeechProvider,
} from '@/integrations/contracts/providers'
import type { ProviderDescriptor } from '@/integrations/contracts/base'
import {
  detectActivationStateMismatches,
  evaluateSystemReadiness,
  loadActivationState,
} from '@/integrations/runtime/readiness-engine'
import { safetyDetailLines } from '@/integrations/runtime/safety'

type RuntimeProviders = {
  orchestrator: OrchestratorProvider
  mail: MailProvider
  concierge: ConciergeProvider
  builder: BuilderProvider
  calendar: CalendarProvider
  reminder: ReminderProvider
  memory: MemoryProvider
  speech: SpeechProvider
  media: MediaProvider
}

function now(): string {
  return new Date().toISOString()
}

function issueFromDescriptor(name: string, descriptor: ProviderDescriptor): string | null {
  if (descriptor.health.state === 'ready') return null
  const missing = descriptor.health.missing.length > 0
    ? ` Missing: ${descriptor.health.missing.join(', ')}.`
    : ''
  return `${name}: ${descriptor.health.detail}${missing}`
}

export class DefaultRuntimeProvider implements RuntimeProvider {
  readonly key = 'runtime-skill-provider'
  readonly label = 'Runtime Skill Provider'

  constructor(private readonly resolveProviders: () => RuntimeProviders) {}

  async describe() {
    return {
      key: this.key,
      label: this.label,
      capabilities: {
        diagnostics: true,
        providerHealth: true,
      },
      health: {
        state: 'ready' as const,
        detail: 'Runtime aggregates safety, selected skill providers, approvals, and receipts.',
        missing: [],
        checkedAt: now(),
      },
    }
  }

  async getSnapshot(): Promise<RuntimeSnapshot> {
    const providers = this.resolveProviders()
    const [orchestrator, mail, concierge, builder, calendar, reminder, memory, speech, media, diagnostics, readiness, activationState] =
      await Promise.all([
        providers.orchestrator.describe(),
        providers.mail.describe(),
        providers.concierge.describe(),
        providers.builder.describe(),
        providers.calendar.describe(),
        providers.reminder.describe(),
        providers.memory.describe(),
        providers.speech.describe(),
        providers.media.describe(),
        window.jarvis?.runtime?.getDiagnostics?.() ?? null,
        evaluateSystemReadiness(),
        loadActivationState(),
      ])

    const issues = [
      issueFromDescriptor('Orchestrator', orchestrator),
      issueFromDescriptor('Mail', mail),
      issueFromDescriptor('Concierge', concierge),
      issueFromDescriptor('Builder', builder),
      issueFromDescriptor('Calendar', calendar),
      issueFromDescriptor('Reminder', reminder),
      issueFromDescriptor('Memory', memory),
      issueFromDescriptor('Speech', speech),
      issueFromDescriptor('Media', media),
      ...detectActivationStateMismatches(readiness, activationState),
    ].filter((value): value is string => Boolean(value))

    return {
      checkedAt: now(),
      diagnostics,
      providers: {
        orchestrator,
        mail,
        concierge,
        builder,
        calendar,
        reminder,
        memory,
        speech,
        media,
      },
      issues,
      systemStateLines: [
        `Readiness summary · ${readiness.readReadyProviders.length} read-ready · ${readiness.writeReadyProviders.length} write-ready · ${readiness.stagedOnlyProviders.length} staged-only`,
        activationState
          ? `Activation state · ${activationState.machine} · ${activationState.providers.length} providers tracked`
          : 'Activation state · missing or unreadable',
        ...issues.slice(0, 3).map((issue) => `Diagnostic note · ${issue}`),
        ...(diagnostics?.safety
          ? [
              `SAFE_ROOT · ${diagnostics.safety.safeRoot}`,
              diagnostics.safety.dryRun ? 'Execution blocked by DRY_RUN' : 'Execution allowed',
              diagnostics.safety.noSecretsMode ? 'Secrets disabled globally' : 'Secrets enabled',
            ]
          : []),
        ...safetyDetailLines(),
        diagnostics?.openclaw.online
          ? `OpenClaw available · ${diagnostics.openclaw.model ?? 'connected'}`
          : `OpenClaw unavailable${diagnostics?.openclaw.error ? ` · ${diagnostics.openclaw.error}` : ''}`,
      ],
    }
  }
}
