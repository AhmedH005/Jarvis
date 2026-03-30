import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'agent-orchestrator',
  label: 'Agent Orchestrator',
  domain: 'orchestration',
  packageName: 'agent-orchestrator',
  purpose: 'Deferred alternative orchestrator. Not selected as the active backbone.',
  summaryLines: [
    'Alternative orchestrator kept only as a documented fallback.',
  ],
  requires: {
    execute: true,
    write: true,
  },
}

export default manifest
