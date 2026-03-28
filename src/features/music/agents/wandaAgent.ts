import type { AgentOutput } from '@/store/music'
import type { TrackBlueprint } from '@/features/music/types'
import type { SharedBandContext } from './stephenProducerAgent'
import { generateInstrument } from '@/services/musicService'

/**
 * Wanda — Keys / Piano
 * Emotional, layered, atmospheric.
 * Generates chords and harmonic transitions rooted in the blueprint key.
 * Aligns harmonic layers to guitar and/or drum texture when available.
 */
export async function runWandaAgent(
  prompt: string,
  blueprint: TrackBlueprint,
  context: SharedBandContext
): Promise<AgentOutput> {
  const base = await generateInstrument(prompt, 'Piano', blueprint.structure.length > 4 ? 'full' : 'riff', blueprint)

  const ref = context.guitar ?? context.drums
  if (ref) {
    const instrument = context.guitar ? 'guitar' : 'drum'
    const refSnippet = ref.description.slice(0, 40)
    return {
      ...base,
      description: `${base.description} — chord voicings harmonically aligned to ${instrument} texture (${refSnippet}…)`,
    }
  }

  return base
}
