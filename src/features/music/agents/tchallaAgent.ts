import type { AgentOutput } from '@/store/music'
import type { TrackBlueprint } from '@/features/music/types'
import type { SharedBandContext } from './stephenProducerAgent'
import { generateInstrument } from '@/services/musicService'

/**
 * T'Challa — Drums
 * Controlled, powerful, precise.
 * Generates rhythm and tempo patterns aligned to the blueprint BPM.
 * Adapts groove intensity to match Peter's guitar energy when available.
 */
export async function runTchallaAgent(
  prompt: string,
  blueprint: TrackBlueprint,
  context: SharedBandContext
): Promise<AgentOutput> {
  const base = await generateInstrument(prompt, 'Drums', blueprint.structure.length > 4 ? 'full' : 'loop', blueprint)

  if (context.guitar) {
    const guitarSnippet = context.guitar.description.slice(0, 40)
    return {
      ...base,
      description: `${base.description} — groove locked to Peter's riff energy (${guitarSnippet}…)`,
    }
  }

  return base
}
