import type { SkillKey, SkillManifest } from './types'

export async function loadSkillManifest(skill: SkillKey): Promise<SkillManifest> {
  switch (skill) {
    case 'agent-task-manager':
      return (await import('./manifests/agent-task-manager')).default
    case 'agent-orchestrator':
      return (await import('./manifests/agent-orchestrator')).default
    case 'advanced-calendar':
      return (await import('./manifests/advanced-calendar')).default
    case 'cron-scheduling':
      return (await import('./manifests/cron-scheduling')).default
    case 'agent-mail-cli':
      return (await import('./manifests/agent-mail-cli')).default
    case 'bookameeting':
      return (await import('./manifests/bookameeting')).default
    case 'elevenlabs-tts':
      return (await import('./manifests/elevenlabs-tts')).default
    case 'elevenlabs-transcribe':
      return (await import('./manifests/elevenlabs-transcribe')).default
    case 'eachlabs-music':
      return (await import('./manifests/eachlabs-music')).default
    case 'brainrepo':
      return (await import('./manifests/brainrepo')).default
    case 'context-anchor':
      return (await import('./manifests/context-anchor')).default
    case 'actual-budget':
      return (await import('./manifests/actual-budget')).default
  }
}
