import { BUILDER_PLAN_SCOPE } from './builder-plan'
import type {
  CheckerVerifyRunInput,
  CheckerVerifyRunResult,
} from '@/shared/builder-bridge'

export interface CheckerRunVerification {
  runId: string
  scope: string
  verificationState: 'passed' | 'failed' | 'blocked'
  status: 'passed' | 'failed' | 'blocked'
  source: 'real-bridge' | 'local-demo-fallback'
  sourceLabel: string
  checkedAt: string
  verificationSummary: string
  note: string
}

interface CheckerBridge {
  verifyRun?: (input: CheckerVerifyRunInput) => Promise<CheckerVerifyRunResult>
}

function getCheckerBridge(): CheckerBridge | null {
  const jarvis = window.jarvis as (typeof window.jarvis & {
    checker?: CheckerBridge
  }) | undefined

  return jarvis?.checker ?? null
}

export async function verifyCheckerRun(
  runId: string,
  verificationPrompt?: string
): Promise<CheckerRunVerification> {
  const bridge = getCheckerBridge()
  if (bridge && typeof bridge.verifyRun === 'function') {
    return bridge.verifyRun({
      runId,
      scope: BUILDER_PLAN_SCOPE,
      mode: 'manual finalized-run verification',
      verificationPrompt,
    })
  }

  throw new Error(
    'Checker verification bridge is not available. Open Jarvis in Electron to run real verifications.'
  )
}
