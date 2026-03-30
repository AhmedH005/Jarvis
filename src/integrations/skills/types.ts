export type SkillKey =
  | 'agent-task-manager'
  | 'agent-orchestrator'
  | 'advanced-calendar'
  | 'cron-scheduling'
  | 'agent-mail-cli'
  | 'bookameeting'
  | 'elevenlabs-tts'
  | 'elevenlabs-transcribe'
  | 'eachlabs-music'
  | 'brainrepo'
  | 'context-anchor'
  | 'actual-budget'

export type SkillDomain =
  | 'orchestration'
  | 'time'
  | 'concierge'
  | 'creation'
  | 'dev'
  | 'memory'
  | 'finance'
  | 'system'

export interface SkillManifest {
  key: SkillKey
  label: string
  domain: SkillDomain
  packageName: string
  purpose: string
  summaryLines: string[]
  requires: {
    execute?: boolean
    write?: boolean
    network?: boolean
  }
}
