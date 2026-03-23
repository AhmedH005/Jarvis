/**
 * OpenClaw Output Parser
 *
 * Parses the raw string output from OpenClaw tool calls and stream events
 * into typed structures that the orchestrator and modules expect.
 *
 * OpenClaw returns raw text from tool calls; this layer normalizes it.
 */

import type { MemorySnippet } from '@/shared/types'

// ── Memory output ──────────────────────────────────────────────────────────────

export interface ParsedMemoryOutput {
  found:    boolean
  snippets: MemorySnippet[]
  raw:      string
}

export function parseMemorySearchOutput(raw: string): ParsedMemoryOutput {
  if (!raw || raw.trim() === '' || raw.toLowerCase().includes('no results')) {
    return { found: false, snippets: [], raw }
  }

  // memory_search returns freeform text; wrap as single snippet
  const snippets: MemorySnippet[] = [{
    key:       'memory_search_result',
    value:     raw.trim(),
    source:    'memory_search',
    relevance: raw.length > 200 ? 'high' : 'medium',
  }]

  return { found: true, snippets, raw }
}

// ── System / session output ────────────────────────────────────────────────────

export function parseSessionStatusOutput(raw: string): { gatewayOnline: boolean; activeSessionIds: string[]; diagnosticNotes: string } {
  const text    = raw.toLowerCase()
  const online  = !text.includes('offline') && !text.includes('error') && raw.trim().length > 0

  // Extract session IDs — simple pattern: lines starting with 'session' or UUID-like strings
  const sessionLines = raw
    .split('\n')
    .filter((line) => /session|[0-9a-f]{8}-[0-9a-f]{4}/i.test(line))
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    gatewayOnline:    online,
    activeSessionIds: sessionLines,
    diagnosticNotes:  raw.slice(0, 500),
  }
}

// ── Generic tool output ────────────────────────────────────────────────────────

export interface ToolCallResult {
  tool:    string
  success: boolean
  output:  string
  error?:  string
}

/**
 * Parse a raw tool call result string.
 * OpenClaw wraps tool errors with error markers.
 */
export function parseToolResult(tool: string, raw: string): ToolCallResult {
  const errorMarkers = ['error:', 'failed:', 'exception:', 'traceback']
  const isError = errorMarkers.some((m) => raw.toLowerCase().startsWith(m))

  return {
    tool,
    success: !isError,
    output:  isError ? '' : raw,
    error:   isError ? raw : undefined,
  }
}

// ── Stream event normalization ─────────────────────────────────────────────────

/** Normalize OpenClaw stream delta into plain text */
export function extractTextFromDelta(delta: string): string {
  return delta ?? ''
}
