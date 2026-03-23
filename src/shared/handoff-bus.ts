/**
 * HandoffBus — mirrors shared/handoffs.md
 *
 * Module-to-module communication channel.
 * jarvis-prime dispatches handoffs; target modules read from bus.
 * All handoffs are logged for traceability.
 */

import type { Handoff, ModuleId } from './types'

type HandoffListener = (handoff: Handoff) => void

class HandoffBus {
  private history: Handoff[] = []
  private listeners = new Map<ModuleId, Set<HandoffListener>>()

  /** Dispatch one or more handoffs from a source module */
  dispatch(handoffs: Handoff[]): void {
    handoffs.forEach((h) => {
      this.history.push(h)
      this.listeners.get(h.toModule)?.forEach((cb) => cb(h))
    })
  }

  /** Subscribe a module to receive its inbound handoffs */
  subscribe(moduleId: ModuleId, cb: HandoffListener): () => void {
    if (!this.listeners.has(moduleId)) this.listeners.set(moduleId, new Set())
    this.listeners.get(moduleId)!.add(cb)
    return () => this.listeners.get(moduleId)?.delete(cb)
  }

  /** All handoffs for a given destination */
  pendingFor(moduleId: ModuleId): Handoff[] {
    return this.history.filter(
      (h) => h.toModule === moduleId && h.status === 'pending',
    )
  }

  markCompleted(handoffId: string): void {
    const h = this.history.find((x) => x.handoffId === handoffId)
    if (h) h.status = 'completed'
  }

  markRejected(handoffId: string): void {
    const h = this.history.find((x) => x.handoffId === handoffId)
    if (h) h.status = 'rejected'
  }

  getHistory(): Handoff[] {
    return [...this.history]
  }

  clear(): void {
    this.history = []
    this.listeners.clear()
  }
}

export const handoffBus = new HandoffBus()
