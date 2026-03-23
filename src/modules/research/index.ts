/**
 * research module
 *
 * Backend status: BLOCKED / PARTIAL
 * Reason: Brave Search API not configured in OpenClaw
 * Owned domain: external information, web search, factual lookups
 *
 * Per backend policy: research must declare blocked state and return
 * a clear explanation rather than hallucinating.
 *
 * Mirrors: jarvis-system/modules/research/
 */

import { nanoid } from '@/lib/utils'
import type {
  ModuleId,
  ModuleState,
  ModuleResult,
  Decision,
} from '@/shared/types'

export const MODULE_ID: ModuleId = 'research'

export const MODULE_STATE: ModuleState = {
  module:              'research',
  status:              'blocked',
  ownedDomain:         ['external information', 'web search', 'factual lookups'],
  currentConstraints:  [
    'Brave Search API not configured',
    'no live web access available',
  ],
  blockedCapabilities: ['web_search', 'brave_search', 'url_fetch'],
  lastUpdated:         new Date().toISOString(),
  notes:               'Returns blocked state with explanation. Configure Brave Search in OpenClaw to unlock.',
}

export const BLOCKED_EXPLANATION =
  'Research module is currently unavailable: Brave Search API is not configured ' +
  'in OpenClaw. To enable web search, add a Brave Search API key to your OpenClaw ' +
  'configuration. Without it, I can only draw on my training knowledge.'

export interface ResearchOutput {
  blocked:     true
  explanation: string
  query:       string
}

export function buildResearchResult(query: string): ModuleResult<ResearchOutput> {
  const decisions: Decision[] = [{
    decisionId:      nanoid(),
    timestamp:       new Date().toISOString(),
    owner:           MODULE_ID,
    summary:         'Research request received but module is blocked',
    accepted:        false,
    reason:          'Brave Search not configured — cannot perform live search',
    sourceRefs:      ['modules/research/state.md'],
    impactedDomains: ['external information'],
  }]

  return {
    moduleId: MODULE_ID,
    success:  false,
    data: {
      blocked:     true,
      explanation: BLOCKED_EXPLANATION,
      query,
    },
    error:               BLOCKED_EXPLANATION,
    blockedCapabilities: MODULE_STATE.blockedCapabilities,
    handoffs:            [],
    decisions,
  }
}
