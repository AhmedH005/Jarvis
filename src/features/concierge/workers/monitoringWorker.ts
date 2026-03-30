/**
 * Monitoring / Deals Worker
 *
 * Responsibilities:
 *   - monitor flights, hotels, tickets, price drops, renewals
 *   - surface alerts into the Concierge tab
 *
 * V1 is read-only + alerting only.
 * Does NOT auto-book or auto-purchase under any circumstances.
 */

import { useConciergeStore } from '@/store/concierge'
import type { MonitorWatch, WatchType } from '../conciergeTypes'

// ── Add / remove watches ──────────────────────────────────────────────────────

export function addWatch(params: {
  type: WatchType
  label: string
  target: string
  threshold?: string
}): MonitorWatch {
  const store = useConciergeStore.getState()
  const watch: MonitorWatch = {
    id: `watch-${Date.now()}`,
    ...params,
    status: 'active',
    createdAt: new Date().toISOString(),
  }
  store.addWatch(watch)
  store.logActivity(
    'monitoring',
    `Watch added: ${params.label}`,
    'success',
    params.threshold ? `Threshold: ${params.threshold}` : undefined,
  )
  return watch
}

export function removeWatch(watchId: string): void {
  const store = useConciergeStore.getState()
  const watch = store.watches.find((w) => w.id === watchId)
  store.removeWatch(watchId)
  store.logActivity('monitoring', `Watch removed: ${watch?.label ?? watchId}`, 'info')
}

// ── Check / alert ─────────────────────────────────────────────────────────────

/**
 * Record a check result for a watch.
 * If the threshold is met, mark as triggered and add an alert.
 */
export function recordCheckResult(
  watchId: string,
  currentValue: string,
  triggered: boolean,
): void {
  const store = useConciergeStore.getState()
  const watch = store.watches.find((w) => w.id === watchId)
  if (!watch) return

  store.updateWatch(watchId, {
    lastChecked: new Date().toISOString(),
    status: triggered ? 'triggered' : 'active',
    alert: triggered ? `Alert: ${currentValue}` : undefined,
  })

  store.logActivity(
    'monitoring',
    triggered ? `Alert triggered: ${watch.label}` : `Check complete: ${watch.label}`,
    triggered ? 'success' : 'info',
    `Current value: ${currentValue}`,
  )
}

/**
 * Convenience: check all active watches.
 * In V1 this is a stub — real checks are made via Electron IPC to external APIs.
 * Each integration (Skyscanner, Google Flights, etc.) populates this via
 * recordCheckResult() when results arrive.
 */
export function checkAllWatches(): void {
  const store = useConciergeStore.getState()
  const activeWatches = store.watches.filter((w) => w.status === 'active')

  if (activeWatches.length === 0) return

  store.setWorkerStatus('monitoring', 'error')
  store.logActivity(
    'monitoring',
    `Monitoring unavailable for ${activeWatches.length} watch${activeWatches.length !== 1 ? 'es' : ''}`,
    'failed',
    'No real monitoring provider is configured yet, so Jarvis cannot truthfully check these watches.',
  )
}
