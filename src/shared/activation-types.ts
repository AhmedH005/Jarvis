/**
 * Activation State Types
 *
 * These types describe the machine-readable activation tracking structure
 * persisted at jarvis-runtime/activation/activation-state.json.
 *
 * This is tracking only — reading and surfacing activation state.
 * Nothing here enables live execution.
 */

import type { PromotionStage } from './readiness-types'

export type SmokeTestResult = 'passed' | 'failed' | 'skipped'

export interface ActivationActionState {
  /** Action identifier (e.g. 'calendar:listEvents') */
  action: string
  /** Current promotion stage */
  currentStage: PromotionStage | 'activated'
  /** ISO timestamp when this action was promoted to live */
  activatedAt: string | null
  /** ISO timestamp of last smoke test */
  lastSmokeTestAt: string | null
  /** Result of last smoke test */
  lastSmokeTestResult: SmokeTestResult | null
  /** Whether rollback is possible (some reads are irreversible) */
  rollbackAvailable: boolean
  /** Human-readable operator notes */
  notes: string
}

export interface ActivationProviderState {
  provider: string
  label: string
  actions: ActivationActionState[]
}

export interface ActivationState {
  schemaVersion: string
  /** Identifier for this machine */
  machine: string
  updatedAt: string
  providers: ActivationProviderState[]
}
