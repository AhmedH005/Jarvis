import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'brainrepo',
  label: 'Brainrepo',
  domain: 'memory',
  packageName: 'brainrepo',
  purpose: 'Grounded file-backed memory store for project and personal knowledge.',
  summaryLines: [
    'Provides explicit, source-aware memory files inside the safe runtime root.',
  ],
  requires: {
    write: true,
  },
}

export default manifest
