/**
 * Heuristic command router — the fallback path used when the model classifier
 * is unavailable, returns an error, or produces a low-confidence result.
 *
 * This is a pure function: no side effects, no async I/O. It exists solely to
 * ensure routing always returns a usable result even without a live LLM.
 *
 * The original heuristic logic lived inside HeuristicOrchestratorProvider.
 * Extracting it here lets both the model router and the provider share one
 * authoritative fallback implementation.
 */

import type {
  RouterDomain,
  RouterConfidence,
  RouterExtractedEntities,
  TypedRouteResult,
} from './router-types'
import { APPROVAL_REQUIRED_DOMAINS, UNAVAILABLE_DOMAINS } from './router-types'

// ── Signal table ──────────────────────────────────────────────────────────────

interface DomainEntry {
  domain: RouterDomain
  signals: string[]
  intent: string
}

const DOMAIN_SIGNAL_TABLE: DomainEntry[] = [
  {
    domain: 'time',
    signals: ['schedule', 'calendar', 'meeting', 'task', 'todo', 'automation', 'reminder', 'deadline', 'recurring', 'cron', 'event'],
    intent: 'Manage schedule, tasks, or automations',
  },
  {
    domain: 'concierge',
    signals: ['email', 'mail', 'reply', 'booking', 'book', 'reservation', 'follow up', 'follow-up', 'admin', 'inbox', 'send', 'draft'],
    intent: 'Handle email, bookings, or personal admin',
  },
  {
    domain: 'creation',
    signals: ['voice', 'audio', 'transcribe', 'tts', 'music', 'media', 'speech', 'generate audio', 'sound', 'track'],
    intent: 'Generate voice, audio, or media',
  },
  {
    domain: 'dev',
    signals: ['code', 'build', 'implement', 'fix', 'refactor', 'debug', 'dev', 'repository', 'function', 'class', 'module', 'test', 'deploy'],
    intent: 'Plan or execute a development task',
  },
  {
    domain: 'memory',
    signals: ['memory', 'remember', 'recall', 'context', 'note', 'brainrepo', 'store', 'save this', 'record'],
    intent: 'Read or write structured memory',
  },
  {
    domain: 'finance',
    signals: ['finance', 'budget', 'money', 'expense', 'account', 'transaction', 'spending', 'cost'],
    intent: 'Access financial information',
  },
  {
    domain: 'command',
    signals: ['system', 'runtime', 'approval', 'receipt', 'connector', 'health', 'status', 'diagnostic', 'capability'],
    intent: 'System or runtime query',
  },
]

// ── Signal scoring ────────────────────────────────────────────────────────────

function scoreSignals(input: string, signals: string[]): number {
  const lower = input.toLowerCase()
  return signals.filter((signal) => lower.includes(signal)).length
}

function mapScoreToConfidence(score: number): RouterConfidence {
  if (score >= 2) return 'high'
  if (score === 1) return 'medium'
  return 'low'
}

// ── Entity extraction ─────────────────────────────────────────────────────────

function extractKeywords(input: string, signals: string[]): string[] {
  const lower = input.toLowerCase()
  return signals.filter((signal) => lower.includes(signal))
}

function extractDates(input: string): string[] {
  // Simple pattern: look for date-like words/phrases
  const patterns = [
    /\b(today|tomorrow|yesterday)\b/gi,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}\b/gi,
    /\bnext (?:week|month|year|monday|tuesday|wednesday|thursday|friday)\b/gi,
    /\bat \d{1,2}(?::\d{2})? ?(?:am|pm)\b/gi,
  ]
  const found = new Set<string>()
  for (const pattern of patterns) {
    const matches = input.match(pattern) ?? []
    for (const m of matches) found.add(m.trim())
  }
  return [...found]
}

function extractContacts(input: string): string[] {
  // Match quoted names or @-mentions
  const patterns = [
    /"([^"]{2,40})"/g,
    /'([^']{2,40})'/g,
    /\b@(\w+)/g,
  ]
  const found = new Set<string>()
  for (const pattern of patterns) {
    let m
    while ((m = pattern.exec(input)) !== null) {
      if (m[1]) found.add(m[1])
    }
  }
  return [...found]
}

// ── Core heuristic ────────────────────────────────────────────────────────────

export function heuristicClassify(
  input: string,
  fallbackReason: string,
): TypedRouteResult {
  const scores = DOMAIN_SIGNAL_TABLE.map((entry) => ({
    entry,
    score: scoreSignals(input, entry.signals),
    matchedSignals: entry.signals.filter((s) => input.toLowerCase().includes(s)),
  })).sort((a, b) => b.score - a.score)

  const top = scores[0]
  const second = scores[1]
  const ambiguous = Boolean(top && second && top.score > 0 && top.score === second.score)
  const hasMatch = Boolean(top && top.score > 0)

  const winner = hasMatch ? top.entry : null
  const domain: RouterDomain = winner?.domain ?? 'unknown'
  const confidence = hasMatch ? mapScoreToConfidence(top!.score) : 'low'

  const entities: RouterExtractedEntities = {
    dates: extractDates(input),
    contacts: extractContacts(input),
    keywords: winner ? extractKeywords(input, winner.signals) : [],
  }

  const requiresApproval = APPROVAL_REQUIRED_DOMAINS.includes(domain)
  const isUnavailable = UNAVAILABLE_DOMAINS.includes(domain)

  let suggestedAction: TypedRouteResult['suggestedAction']
  if (isUnavailable) {
    suggestedAction = 'unavailable'
  } else if (!hasMatch || domain === 'unknown') {
    suggestedAction = 'clarify'
  } else if (requiresApproval) {
    suggestedAction = 'approve_and_stage'
  } else {
    suggestedAction = 'stage'
  }

  let rationale: string
  if (!hasMatch) {
    rationale = 'No domain signal matched — staging for command review.'
  } else if (ambiguous) {
    rationale = `Ambiguous signal: both "${top!.entry.domain}" and "${second!.entry.domain}" matched equally. Staged for review.`
  } else {
    rationale = `Matched signals [${top!.matchedSignals.slice(0, 3).join(', ')}] against the ${domain} module.`
  }

  const routedBy = (domain === 'unknown' || (!hasMatch))
    ? 'manual_review_required'
    : (confidence === 'low'
      ? 'routed_with_low_confidence'
      : 'routed_by_fallback')

  return {
    targetDomain: domain,
    intent: winner?.intent ?? 'Intent could not be determined — manual review required.',
    confidence,
    routedBy,
    requiresApproval,
    suggestedAction,
    extractedEntities: entities,
    rationale,
    fallbackReason,
  }
}
