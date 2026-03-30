import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'cron-scheduling',
  label: 'Cron Scheduling',
  domain: 'time',
  packageName: 'cron-scheduling',
  purpose: 'Recurring automation helper for Time and System.',
  summaryLines: [
    'Owns recurring job definitions and run scheduling.',
    'Keeps automation state separate from pure calendar events.',
  ],
  requires: {
    execute: true,
    write: true,
  },
}

export default manifest
