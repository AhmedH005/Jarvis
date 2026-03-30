import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'actual-budget',
  label: 'Actual Budget',
  domain: 'finance',
  packageName: 'actual-budget',
  purpose: 'Cross-platform finance provider target for the Finance module.',
  summaryLines: [
    'Only becomes active when a real Actual Budget instance is configured.',
  ],
  requires: {
    execute: true,
    write: true,
  },
}

export default manifest
