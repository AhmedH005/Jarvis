/**
 * ApprovalGate — mirrors orchestrator/approval-model.md
 *
 * All mutations must pass through this gate before execution module is invoked.
 * jarvis-prime is responsible for calling gate.request() and waiting for the result.
 *
 * The gate is in-memory in the renderer process.
 * In production, pending approvals are surfaced to the UI for user confirmation.
 */

import { nanoid } from '@/lib/utils'
import type { ApprovalRequest, ApprovalResult, Priority } from '@/shared/types'

type ApprovalCallback = (result: ApprovalResult) => void

class ApprovalGate {
  private pending = new Map<string, {
    request:  ApprovalRequest
    resolve:  ApprovalCallback
  }>()

  /**
   * Submit an approval request.
   * Returns a Promise that resolves when the user approves or rejects.
   * The caller (jarvis-prime) awaits this before invoking execution.
   */
  request(params: {
    requestedBy:     import('@/shared/types').ModuleId
    intent:          string
    scope:           string[]
    plan:            string
    expectedOutcome: string
    rollback:        string
    priority?:       Priority
  }): Promise<ApprovalResult> {
    const approvalId = nanoid()
    const req: ApprovalRequest = {
      approvalId,
      requestedBy:     params.requestedBy,
      intent:          params.intent,
      scope:           params.scope,
      plan:            params.plan,
      expectedOutcome: params.expectedOutcome,
      rollback:        params.rollback,
      priority:        params.priority ?? 'normal',
      createdAt:       new Date().toISOString(),
    }

    return new Promise<ApprovalResult>((resolve) => {
      this.pending.set(approvalId, { request: req, resolve })
      // Notify listeners (e.g. UI) that an approval is waiting
      this.emit('pending', req)
    })
  }

  /** Called by UI when user approves */
  approve(approvalId: string, reason?: string): void {
    this._settle(approvalId, true, reason)
  }

  /** Called by UI when user rejects */
  reject(approvalId: string, reason?: string): void {
    this._settle(approvalId, false, reason)
  }

  private _settle(approvalId: string, approved: boolean, reason?: string): void {
    const entry = this.pending.get(approvalId)
    if (!entry) return
    this.pending.delete(approvalId)

    const result: ApprovalResult = {
      approvalId,
      approved,
      reason,
      decidedAt: new Date().toISOString(),
    }

    entry.resolve(result)
    this.emit('settled', result)
  }

  getPending(): ApprovalRequest[] {
    return Array.from(this.pending.values()).map((e) => e.request)
  }

  // ── Simple event emitter ───────────────────────────────────────────────────

  private listeners = new Map<string, Set<(data: unknown) => void>>()

  on(event: 'pending' | 'settled', cb: (data: ApprovalRequest | ApprovalResult) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(cb as (data: unknown) => void)
    return () => this.listeners.get(event)?.delete(cb as (data: unknown) => void)
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(data))
  }
}

/** Singleton gate shared across the process */
export const approvalGate = new ApprovalGate()
