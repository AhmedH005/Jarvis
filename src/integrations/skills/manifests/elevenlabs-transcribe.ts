import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'elevenlabs-transcribe',
  label: 'ElevenLabs Transcribe',
  domain: 'creation',
  packageName: 'elevenlabs-transcribe',
  purpose: 'Audio transcription backend for the Creation module.',
  summaryLines: [
    'Primary transcription target for voice and media workflows.',
  ],
  requires: {
    execute: true,
    network: true,
  },
}

export default manifest
