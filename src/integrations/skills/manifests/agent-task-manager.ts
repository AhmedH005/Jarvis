import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'agent-task-manager',
  label: 'Agent Task Manager',
  domain: 'orchestration',
  packageName: 'agent-task-manager',
  purpose: 'Shared orchestration backbone for staged actions, approvals, queues, and receipts.',
  summaryLines: [
    'Single orchestrator backbone for Command, Time, Concierge, and Dev.',
    'Owns queued, staged, approval-gated, and completed task state.',
  ],
  requires: {
    execute: true,
    write: true,
  },
}

export default manifest
