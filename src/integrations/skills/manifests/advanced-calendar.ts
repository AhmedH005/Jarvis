import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'advanced-calendar',
  label: 'Advanced Calendar',
  domain: 'time',
  packageName: 'advanced-calendar',
  purpose: 'Cross-platform event and schedule provider for the Time module.',
  summaryLines: [
    'Primary read/write schedule integration target.',
    'Replaces the custom local-only calendar engine.',
  ],
  requires: {
    execute: true,
    write: true,
  },
}

export default manifest
