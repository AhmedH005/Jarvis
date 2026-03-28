import type { AgentOutput } from '@/store/music'
import type { TrackBlueprint } from '@/features/music/types'
import type { SharedBandContext } from './stephenProducerAgent'
import { generateInstrument } from '@/services/musicService'

/**
 * Scott — Vocals
 * Human, relatable, adaptive tone.
 * Generates lyrics and vocal phrasing shaped by the blueprint mood and key.
 * Adapts vocal delivery to all active instruments in the shared context.
 */
export async function runScottAgent(
  prompt: string,
  blueprint: TrackBlueprint,
  context: SharedBandContext
): Promise<AgentOutput> {
  const base = await generateInstrument(prompt, 'Voice', blueprint.structure.length > 4 ? 'full' : 'riff', blueprint)

  const activeParts: string[] = []
  if (context.guitar) activeParts.push('guitar')
  if (context.drums) activeParts.push('drums')
  if (context.keys) activeParts.push('keys')

  if (activeParts.length > 0) {
    const partList = activeParts.join(', ')
    return {
      ...base,
      description: `${base.description} — vocal tone and phrasing shaped around ${partList}`,
    }
  }

  return base
}
