import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'agent-mail-cli',
  label: 'Agent Mail CLI',
  domain: 'concierge',
  packageName: 'agent-mail-cli',
  purpose: 'Cross-platform staged mail handling for Concierge.',
  summaryLines: [
    'Supports inbox, draft, review, and send lifecycle.',
    'Replaces provider-specific custom mail logic.',
  ],
  requires: {
    execute: true,
    write: true,
    network: true,
  },
}

export default manifest
