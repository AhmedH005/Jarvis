import type { SpeechProvider } from '@/integrations/contracts/providers'
import type { ProviderDescriptor, ProviderOperationResult } from '@/integrations/contracts/base'
import {
  blockedResult,
  buildProviderFailure,
  failedResult,
  stagedResult,
  successResult,
} from '@/integrations/contracts/result-helpers'
import { loadSkillManifest } from '@/integrations/skills/loader'
import {
  stageAction,
  blockedByCapability,
  isCapabilityEnabled,
  computeProviderLiveStatus,
} from '@/integrations/runtime/safety'
import { DRY_RUN } from '@/shared/operational-safety'
import { enforce, toOperationResult } from '@/integrations/governance/governance-enforcer'

function now(): string {
  return new Date().toISOString()
}

export class DefaultSpeechProvider implements SpeechProvider {
  readonly key = 'creation-speech-provider'
  readonly label = 'Creation Speech Provider'

  async describe(): Promise<ProviderDescriptor<{
    tts: boolean
    stt: boolean
    nativeFallback: boolean
  }>> {
    const [tts, transcribe] = await Promise.all([
      loadSkillManifest('elevenlabs-tts'),
      loadSkillManifest('elevenlabs-transcribe'),
    ])

    let keyPresentInEnv = false
    let keyAccessible = false
    let voiceIdConfigured = false
    let speechMissing: string[] = []

    try {
      const diagnostics = await window.jarvis?.runtime?.getDiagnostics?.()
      if (diagnostics?.speech) {
        keyPresentInEnv = diagnostics.speech.keyPresentInEnv
        keyAccessible = diagnostics.speech.configured
        voiceIdConfigured = diagnostics.speech.voiceIdConfigured
        speechMissing = diagnostics.speech.missing
      } else {
        speechMissing = ['runtime diagnostics unavailable']
      }
    } catch (err) {
      speechMissing = [`diagnostics error: ${err instanceof Error ? err.message : String(err)}`]
    }

    const networkEnabled = isCapabilityEnabled('network')
    const executeEnabled = isCapabilityEnabled('execute')

    const liveStatus = computeProviderLiveStatus({
      runtimeAvailable: Boolean(window.jarvis?.tts),
      keyPresentInEnv,
      keyAccessible,
      networkEnabled,
      executeEnabled,
    })

    const ttsLive = liveStatus === 'LIVE_READ_ONLY' || liveStatus === 'LIVE'

    const missing: string[] = []
    if (!executeEnabled) missing.push('execute capability disabled')
    if (!networkEnabled) missing.push('network capability disabled')
    if (!keyPresentInEnv) missing.push('ELEVENLABS_API_KEY not set')
    else if (!keyAccessible) missing.push('ELEVENLABS_API_KEY present but blocked by NO_SECRETS_MODE')
    if (!voiceIdConfigured) missing.push('ELEVENLABS_VOICE_ID not set (will use default voice when live)')

    // Explain the precise blocker
    let blockerNote: string
    if (!keyPresentInEnv) {
      blockerNote = 'ElevenLabs API key is absent — add ELEVENLABS_API_KEY to .env.'
    } else if (!keyAccessible) {
      blockerNote = 'ElevenLabs API key is present in env but blocked by NO_SECRETS_MODE=true.'
    } else if (!executeEnabled || !networkEnabled) {
      blockerNote = `Blocked by capability gates: ${[!executeEnabled && 'execute=false', !networkEnabled && 'network=false'].filter(Boolean).join(', ')}.`
    } else {
      blockerNote = 'All prerequisites met.'
    }

    const healthDetail = [
      `${tts.label} [${liveStatus}] and ${transcribe.label} are selected for speech workflows.`,
      blockerNote,
      voiceIdConfigured ? '' : 'Default voice will be used (ELEVENLABS_VOICE_ID not set).',
    ].filter(Boolean).join(' ')

    console.log('[DefaultSpeechProvider] describe():', { liveStatus, keyPresentInEnv, keyAccessible })

    return {
      key: this.key,
      label: this.label,
      capabilities: {
        tts: ttsLive,
        stt: false,
        nativeFallback: false,
      },
      health: {
        state: ttsLive ? 'ready' : 'degraded',
        liveStatus,
        detail: healthDetail,
        missing,
        checkedAt: now(),
      },
    }
  }

  async speak(text: string): Promise<ProviderOperationResult<{ provider: string }>> {
    console.log('[DefaultSpeechProvider] speak() invoked', { textLength: text.length })
    const action = 'speech:speak'

    const gov = await enforce(
      'elevenlabs-tts', this.key, 'speech:speak',
      ['external_api', 'media_generation'], true,
    )
    if (!gov.allowed) return toOperationResult(gov)

    if (DRY_RUN) {
      const stagedActionId = stageAction({
        domain: 'speech',
        providerKey: this.key,
        title: 'Stage speech synthesis',
        summary: `Speech synthesis for "${text.slice(0, 48)}…" staged for elevenlabs-tts.`,
        payload: { text },
      })
      return stagedResult(
        {
          providerKey: this.key,
          action,
          stagedActionId,
          metadata: { textLength: text.length },
        },
        'Speech synthesis staged.',
        { provider: 'elevenlabs-tts' },
        { status: 'blockedByDryRun', notes: ['DRY_RUN prevents live TTS synthesis.'] },
      )
    }

    if (!isCapabilityEnabled('execute')) {
      console.log('[DefaultSpeechProvider] blocked: execute capability disabled')
      return blockedByCapability(this.key, action, 'execute', 'TTS blocked: execute capability is disabled.')
    }

    if (!isCapabilityEnabled('network')) {
      console.log('[DefaultSpeechProvider] blocked: network capability disabled')
      return blockedByCapability(this.key, action, 'network', 'TTS blocked: network capability is disabled.')
    }

    if (!window.jarvis?.tts?.speak) {
      return blockedResult(
        { providerKey: this.key, action },
        'TTS bridge not available (no Electron context).',
        'unavailable',
        buildProviderFailure('unavailable', 'no_bridge', 'window.jarvis.tts.speak not present', false),
      )
    }

    try {
      const result = await window.jarvis.tts.speak(text)
      console.log('[DefaultSpeechProvider] tts.speak result type:', typeof result)

      if (!result) {
        return blockedResult(
          { providerKey: this.key, action },
          'TTS returned null — ELEVENLABS_API_KEY likely missing or blocked by NO_SECRETS_MODE.',
          'unavailable',
          buildProviderFailure('unavailable', 'tts_null_result', 'null result from bridge', false),
        )
      }

      if ('ok' in result) {
        if (!result.ok) {
          const errResult = result as { ok: false; error: string; status?: number }
          const isKeyError = /api.key|not set|unauthorized|401/i.test(errResult.error ?? '')
          const status = isKeyError ? 'providerFailure' : 'transportFailure'
          return failedResult(
            { providerKey: this.key, action },
            errResult.error ?? 'TTS failed',
            status,
            buildProviderFailure(
              status,
              isKeyError ? 'credentials_missing' : 'elevenlabs_error',
              errResult.error ?? 'unknown ElevenLabs error',
              (errResult.status ?? 0) >= 500,
            ),
          )
        }
        const okResult = result as { ok: true; mimeType: string; audioBase64: string; bytes: number }
        return successResult(
          {
            providerKey: this.key,
            action,
            metadata: { bytes: okResult.bytes, mimeType: okResult.mimeType },
          },
          `ElevenLabs TTS generated ${okResult.bytes} bytes (${okResult.mimeType}).`,
          { provider: 'elevenlabs-tts' },
        )
      }

      // Legacy buffer result (ArrayBuffer / Uint8Array / { type: 'Buffer', data: number[] })
      return successResult(
        { providerKey: this.key, action, notes: ['Legacy buffer response path used.'] },
        'ElevenLabs TTS generated audio (legacy buffer format).',
        { provider: 'elevenlabs-tts' },
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[DefaultSpeechProvider] speak error:', message)
      return failedResult(
        { providerKey: this.key, action },
        `TTS error: ${message}`,
        'transportFailure',
        buildProviderFailure('transportFailure', 'tts_error', message, true),
      )
    }
  }
}
