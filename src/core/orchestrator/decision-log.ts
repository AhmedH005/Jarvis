/**
 * DecisionLog — mirrors shared/decisions.md
 *
 * Append-only log of all decisions made by any module during a session.
 * jarvis-prime reads this to maintain audit trail and avoid contradictions.
 */

import type { Decision, ModuleId } from '@/shared/types'

class DecisionLog {
  private entries: Decision[] = []

  append(decision: Decision): void {
    this.entries.push(decision)
  }

  appendMany(decisions: Decision[]): void {
    this.entries.push(...decisions)
  }

  /** All decisions made by a specific module */
  byModule(moduleId: ModuleId): Decision[] {
    return this.entries.filter((d) => d.owner === moduleId)
  }

  /** Most recent N decisions */
  recent(n = 10): Decision[] {
    return this.entries.slice(-n)
  }

  /** All accepted decisions */
  accepted(): Decision[] {
    return this.entries.filter((d) => d.accepted)
  }

  /** All rejected decisions */
  rejected(): Decision[] {
    return this.entries.filter((d) => !d.accepted)
  }

  /** Clear log (e.g. new conversation session) */
  clear(): void {
    this.entries = []
  }

  getAll(): Decision[] {
    return [...this.entries]
  }
}

/** Singleton log shared across orchestration session */
export const decisionLog = new DecisionLog()
