import type { AgentOutput } from '@/store/music'
import type { TrackBlueprint } from '@/features/music/types'
import type { SharedBandContext } from './stephenProducerAgent'
import { generateInstrument } from '@/services/musicService'

/**
 * Peter — Lead Guitar
 * Creative, expressive, slightly fast-paced.
 * Generates riffs, solos, and experimental layers aligned to the blueprint.
 * Goes first — no prior context to adapt to.
 */
export async function runPeterAgent(
  prompt: string,
  blueprint: TrackBlueprint,
  _context: SharedBandContext
): Promise<AgentOutput> {
  return generateInstrument(prompt, 'Guitar', blueprint.structure.length > 4 ? 'full' : 'riff', blueprint)
}
