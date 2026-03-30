import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'eachlabs-music',
  label: 'EachLabs Music',
  domain: 'creation',
  packageName: 'eachlabs-music',
  purpose: 'Music generation backend for the Creation module.',
  summaryLines: [
    'Replaces pseudo-band generation with a real music provider target.',
  ],
  requires: {
    execute: true,
    network: true,
  },
}

export default manifest
