import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'elevenlabs-tts',
  label: 'ElevenLabs TTS',
  domain: 'creation',
  packageName: 'elevenlabs-tts',
  purpose: 'Text-to-speech backend for the Creation module.',
  summaryLines: [
    'Primary voice synthesis target.',
  ],
  requires: {
    execute: true,
    network: true,
  },
}

export default manifest
