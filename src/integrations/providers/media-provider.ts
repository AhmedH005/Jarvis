import type { TrackBlueprint } from '@/features/music/types'
import type { MediaGenerationData, MediaProvider } from '@/integrations/contracts/providers'
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

export class ElevenLabsMediaProvider implements MediaProvider {
  readonly key = 'creation-skill-provider'
  readonly label = 'Creation Skill Provider'

  async describe(): Promise<ProviderDescriptor<{
    generateAudio: boolean
  }>> {
    const [tts, transcribe, music] = await Promise.all([
      loadSkillManifest('elevenlabs-tts'),
      loadSkillManifest('elevenlabs-transcribe'),
      loadSkillManifest('eachlabs-music'),
    ])

    let keyPresentInEnv = false
    let keyAccessible = false
    let mediaMissing: string[] = []

    try {
      const diagnostics = await window.jarvis?.runtime?.getDiagnostics?.()
      if (diagnostics?.media) {
        keyPresentInEnv = diagnostics.media.keyPresentInEnv
        keyAccessible = diagnostics.media.configured
        mediaMissing = diagnostics.media.missing
      } else {
        mediaMissing = ['runtime diagnostics unavailable']
      }
    } catch (err) {
      mediaMissing = [`diagnostics error: ${err instanceof Error ? err.message : String(err)}`]
    }

    const networkEnabled = isCapabilityEnabled('network')
    const executeEnabled = isCapabilityEnabled('execute')

    const liveStatus = computeProviderLiveStatus({
      runtimeAvailable: Boolean(window.jarvis?.music),
      keyPresentInEnv,
      keyAccessible,
      networkEnabled,
      executeEnabled,
    })

    const generateAudio = liveStatus === 'LIVE_READ_ONLY' || liveStatus === 'LIVE'

    const missing: string[] = []
    if (!executeEnabled) missing.push('execute capability disabled')
    if (!networkEnabled) missing.push('network capability disabled')
    if (!keyPresentInEnv) missing.push('ELEVENLABS_API_KEY not set')
    else if (!keyAccessible) missing.push('ELEVENLABS_API_KEY present but blocked by NO_SECRETS_MODE')

    // Describe the precise blocker
    let blockerNote: string
    if (!keyPresentInEnv) {
      blockerNote = 'ElevenLabs API key is absent — add ELEVENLABS_API_KEY to .env.'
    } else if (!keyAccessible) {
      blockerNote = 'ElevenLabs API key is present in env but blocked by NO_SECRETS_MODE=true.'
    } else if (!executeEnabled || !networkEnabled) {
      blockerNote = `Blocked by capability gates: ${[!executeEnabled && 'execute=false', !networkEnabled && 'network=false'].filter(Boolean).join(', ')}.`
    } else {
      blockerNote = 'All prerequisites met — generation calls are live.'
    }

    // Note: eachlabs-music targets Mureka AI; current wired backend is ElevenLabs Sound Generation.
    const healthDetail = [
      `${tts.label}, ${transcribe.label}, and ${music.label} [${liveStatus}] are the selected Creation skills.`,
      blockerNote,
      'Generation stays staged-only while DRY_RUN is active.',
    ].join(' ')

    console.log('[ElevenLabsMediaProvider] describe():', { liveStatus, keyPresentInEnv, keyAccessible })

    return {
      key: this.key,
      label: this.label,
      capabilities: {
        generateAudio,
      },
      health: {
        state: generateAudio ? 'ready' : 'degraded',
        liveStatus,
        detail: healthDetail,
        missing,
        checkedAt: now(),
      },
    }
  }

  async generateTrack(
    prompt: string,
    blueprint?: TrackBlueprint,
  ): Promise<ProviderOperationResult<MediaGenerationData>> {
    console.log('[ElevenLabsMediaProvider] generateTrack() invoked', { promptLength: prompt.length })
    const action = 'media:generateTrack'

    const gov = await enforce(
      'eachlabs-music', this.key, 'media:generateTrack',
      ['external_api', 'media_generation'], true,
    )
    if (!gov.allowed) return toOperationResult(gov)

    if (DRY_RUN) {
      const stagedActionId = stageAction({
        domain: 'media',
        providerKey: this.key,
        title: 'Stage media generation',
        summary: `Creation request "${prompt.slice(0, 64)}" staged for eachlabs-music.`,
        payload: { prompt, blueprint },
      })
      return stagedResult<MediaGenerationData>(
        {
          providerKey: this.key,
          action,
          stagedActionId,
          metadata: { promptLength: prompt.length, blueprintProvided: Boolean(blueprint) },
        },
        'Media generation staged.',
        undefined,
        { status: 'blockedByDryRun', notes: ['DRY_RUN prevents live media generation.'] },
      )
    }

    if (!isCapabilityEnabled('execute')) {
      console.log('[ElevenLabsMediaProvider] blocked: execute capability disabled')
      return blockedByCapability(this.key, action, 'execute', 'Media generation blocked: execute capability is disabled.')
    }

    if (!isCapabilityEnabled('network')) {
      console.log('[ElevenLabsMediaProvider] blocked: network capability disabled')
      return blockedByCapability(this.key, action, 'network', 'Media generation blocked: network capability is disabled.')
    }

    if (!window.jarvis?.music?.generate) {
      return blockedResult(
        { providerKey: this.key, action },
        'Music bridge not available (no Electron context).',
        'unavailable',
        buildProviderFailure('unavailable', 'no_bridge', 'window.jarvis.music.generate not present', false),
      )
    }

    try {
      const result = await window.jarvis.music.generate(prompt)
      console.log('[ElevenLabsMediaProvider] music.generate:', { ok: result.ok })

      if (!result.ok) {
        const errResult = result as { ok: false; error: string; status?: number }
        const isKeyError = /api.key|not set|unauthorized|401/i.test(errResult.error ?? '')
        const status = isKeyError ? 'providerFailure' : 'transportFailure'
        return failedResult(
          { providerKey: this.key, action },
          errResult.error ?? 'Media generation failed',
          status,
          buildProviderFailure(
            status,
            isKeyError ? 'credentials_missing' : 'elevenlabs_media_error',
            errResult.error ?? 'unknown ElevenLabs error',
            (errResult.status ?? 0) >= 500,
          ),
        )
      }

      const okResult = result as { ok: true; mimeType: string; audioBase64: string; bytes: number }
      const audioUrl = `data:${okResult.mimeType};base64,${okResult.audioBase64}`

      return successResult(
        {
          providerKey: this.key,
          action,
          metadata: { bytes: okResult.bytes, mimeType: okResult.mimeType },
        },
        `ElevenLabs Sound Generation produced ${okResult.bytes} bytes (${okResult.mimeType}).`,
        {
          audioUrl,
          mimeType: okResult.mimeType,
          bytes: okResult.bytes,
          prompt,
          blueprint,
        },
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[ElevenLabsMediaProvider] generateTrack error:', message)
      return failedResult(
        { providerKey: this.key, action },
        `Media generation error: ${message}`,
        'transportFailure',
        buildProviderFailure('transportFailure', 'media_error', message, true),
      )
    }
  }
}
