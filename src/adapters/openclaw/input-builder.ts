/**
 * OpenClaw Input Builder
 *
 * Converts orchestrator context into the message format OpenClaw expects.
 * Handles system-note injection for module context, memory snippets,
 * and blocked-module warnings.
 *
 * The builder does NOT call OpenClaw — it produces the string that the
 * adapter's send function will pass to openclaw.send().
 */

import type { OrchestrationContext, WorldState } from '@/shared/types'

export interface BuiltInput {
  message:    string
  systemNote: string
}

/**
 * Build the full message string for a direct orchestration call.
 * System notes (memory context, module states) are prepended.
 */
export function buildInput(
  message: string,
  ctx: OrchestrationContext,
): BuiltInput {
  const notes: string[] = []

  // Inject memory context if available
  const snippets = ctx.worldState.memoryContext.recentSnippets
  if (snippets.length > 0) {
    const snippetText = snippets
      .map((s) => `• [${s.key}] ${s.value}`)
      .join('\n')
    notes.push(`MEMORY CONTEXT:\n${snippetText}`)
  }

  // Warn about blocked modules if relevant
  const blocked = ctx.worldState.operations.blockedModules
  if (blocked.length > 0) {
    notes.push(`BLOCKED MODULES: ${blocked.join(', ')} (limited capability)`)
  }

  // Warn about mental state if overloaded
  if (ctx.worldState.mentalState.overloadFlag) {
    notes.push(`MENTAL STATE: Overload detected — ${ctx.worldState.mentalState.notes}`)
  }

  const systemNote = notes.length > 0
    ? `[SYSTEM]\n${notes.join('\n\n')}\n[/SYSTEM]`
    : ''

  const fullMessage = systemNote
    ? `${systemNote}\n\n${message}`
    : message

  return { message: fullMessage, systemNote }
}

/** Build tool call string for memory_search */
export function buildMemorySearchInput(query: string): string {
  return `memory_search: ${query}`
}

/** Build tool call string for session_status */
export function buildSessionStatusInput(): string {
  return 'session_status'
}

/**
 * Build the full context-aware message when world state is available.
 * Used by jarvis-prime.orchestrate() when constructing the final prompt.
 */
export function buildOrchestratorInput(
  userMessage: string,
  worldState:  WorldState,
): string {
  const parts: string[] = []

  if (worldState.memoryContext.recentSnippets.length > 0) {
    const mem = worldState.memoryContext.recentSnippets
      .map((s) => `• ${s.value}`)
      .join('\n')
    parts.push(`Prior context:\n${mem}`)
  }

  if (worldState.mentalState.overloadFlag) {
    parts.push(`Note: User may be experiencing overload. ${worldState.mentalState.notes}`)
  }

  if (worldState.operations.blockedModules.length > 0) {
    parts.push(`Limited capabilities: ${worldState.operations.blockedModules.join(', ')} unavailable`)
  }

  parts.push(userMessage)

  return parts.join('\n\n')
}
