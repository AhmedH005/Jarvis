/**
 * Voice Provider Abstraction
 *
 * Decouples TwiML generation and audio synthesis from the telephony layer.
 * Phone calls always go through Twilio; the voice layer is pluggable.
 *
 * V1 providers:
 *   TwilioBuiltinVoice — uses Twilio Polly Neural TTS via <Say> TwiML verb
 *                        (zero extra dependencies, always available)
 *   ElevenLabsVoice    — generates MP3 via ElevenLabs API, serves via local
 *                        HTTP server, uses <Play> TwiML verb
 *                        (requires ELEVENLABS_API_KEY + running phone server)
 *
 * Usage:
 *   const voice = resolveVoiceProvider(mode)
 *   const sayXml = voice.toSayVerb(text, mode)    // embed in TwiML <Response>
 *
 * ElevenLabs audio generation for calls is a V2 feature.
 * The groundwork is here — the interface is defined and the provider
 * class is scaffolded — but live call audio via ElevenLabs requires
 * streaming the MP3 to a Twilio-accessible URL, which is handled by
 * the phone server's /voice/audio/:id endpoint.
 */

// ── XML escape ────────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ── Voice provider interface ──────────────────────────────────────────────────

export interface VoiceProvider {
  readonly name: string
  /**
   * Return a TwiML <Say> (or <Play>) verb fragment for the given text.
   * The fragment is embedded inside a <Response> block.
   */
  toSayVerb(text: string, mode: 'serious' | 'demo'): string
  /**
   * Optionally pre-generate audio and return a URL path
   * that the phone server can serve via <Play>.
   * Returns null if this provider only uses <Say>.
   */
  prepareAudio?(
    text: string,
    mode: 'serious' | 'demo',
    audioId: string,
  ): Promise<{ localPath: string; mimeType: string } | null>
}

// ── Twilio built-in Polly voices ──────────────────────────────────────────────

/**
 * Uses Amazon Polly Neural voices via Twilio's <Say> verb.
 * No extra dependencies or API keys required.
 *
 * Serious mode: Joanna-Neural (professional, measured)
 * Demo mode:    Matthew-Neural (warmer, more engaging)
 */
export class TwilioBuiltinVoice implements VoiceProvider {
  readonly name = 'twilio-builtin'

  toSayVerb(text: string, mode: 'serious' | 'demo'): string {
    const voice = mode === 'demo' ? 'Polly.Matthew-Neural' : 'Polly.Joanna-Neural'
    return `<Say voice="${voice}">${escapeXml(text)}</Say>`
  }
}

// ── ElevenLabs voice (scaffolded — V2 feature) ────────────────────────────────

/**
 * Generates premium TTS audio via ElevenLabs and serves it to Twilio.
 *
 * V1 status: scaffolded. Audio generation works (same path as tts:speak IPC
 * handler in main.ts). Integration with live Twilio calls requires:
 *   - Phone server running with a public URL (ngrok / Tailscale / VPS)
 *   - Audio served at /voice/audio/:id and accessible by Twilio
 *
 * When ELEVENLABS_API_KEY is not set, falls back to TwilioBuiltinVoice.
 */
export class ElevenLabsVoice implements VoiceProvider {
  readonly name = 'elevenlabs'
  private readonly apiKey: string
  private readonly voiceId: string
  private readonly fallback = new TwilioBuiltinVoice()

  constructor(apiKey: string, voiceId?: string) {
    this.apiKey  = apiKey
    this.voiceId = voiceId ?? 'pNInz6obpgDQGcFmaJgB'  // Default ElevenLabs voice
  }

  toSayVerb(text: string, mode: 'serious' | 'demo'): string {
    // V1: fall back to Polly — audio URL integration is V2
    return this.fallback.toSayVerb(text, mode)
  }

  async prepareAudio(
    text: string,
    _mode: 'serious' | 'demo',
    audioId: string,
  ): Promise<{ localPath: string; mimeType: string } | null> {
    // V2: generate MP3 via ElevenLabs, write to temp dir, return path
    // The phone server serves these from /voice/audio/:id
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      })
      if (!res.ok) return null

      const { tmpdir } = await import('os')
      const { join }   = await import('path')
      const { writeFile } = await import('fs/promises')
      const audio = Buffer.from(await res.arrayBuffer())
      const localPath = join(tmpdir(), `jarvis-phone-${audioId}.mp3`)
      await writeFile(localPath, audio)
      return { localPath, mimeType: 'audio/mpeg' }
    } catch {
      return null
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Resolve the active voice provider.
 * Prefers ElevenLabs when the API key is present; falls back to Twilio built-in.
 */
export function resolveVoiceProvider(): VoiceProvider {
  const elKey = process.env['ELEVENLABS_API_KEY']
  if (elKey) {
    const voiceId = process.env['ELEVENLABS_VOICE_ID']
    return new ElevenLabsVoice(elKey, voiceId)
  }
  return new TwilioBuiltinVoice()
}

// ── TwiML helpers ─────────────────────────────────────────────────────────────

export { escapeXml }
