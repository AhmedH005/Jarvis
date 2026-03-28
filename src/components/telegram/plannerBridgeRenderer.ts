import { usePlannerStore, type ExecutionResult, type ExecutionSource } from '@/store/planner'
import type { OptimizeDayResult, OptimizeWeekResult, PlanningAction } from '@/features/planner/planningTypes'
import type {
  PlannerApplyPlanningActionsPayload,
  PlannerBridgeResult,
  PlannerCreateManyFromIntakePayload,
  PlannerCreateTaskPayload,
} from '@/shared/planner-bridge'

const EMPTY_EXECUTION_RESULT: ExecutionResult = {
  success: true,
  appliedActionIds: [],
  failedActionIds: [],
  warnings: [],
  rollbackAvailable: false,
}

export function executePlannerBridgeCommand(method: string, data: unknown): PlannerBridgeResult {
  const store = usePlannerStore.getState()

  if (method === 'ping') {
    return { success: true }
  }

  if (method === 'createEvent') {
    const payload = data as Parameters<typeof store.createEventBlockFromIntake>[0]
    store.createEventBlockFromIntake(payload)
    return { success: true }
  }

  if (method === 'createTask') {
    const payload = data as PlannerCreateTaskPayload
    store.createTaskFromIntake(payload)
    return { success: true }
  }

  if (method === 'createManyFromIntake') {
    const payload = data as PlannerCreateManyFromIntakePayload
    store.createManyFromIntake(payload.events, payload.tasks)
    return { success: true }
  }

  if (method === 'listEvents') {
    return { success: true, data: store.blocks }
  }

  if (method === 'updateEvent') {
    const { id: blockId, ...patch } = data as { id: string } & Record<string, unknown>
    store.updateBlock(blockId, patch as Parameters<typeof store.updateBlock>[1])
    return { success: true }
  }

  if (method === 'deleteEvent') {
    const { id: blockId } = data as { id: string }
    store.deleteBlock(blockId)
    return { success: true }
  }

  if (method === 'applyPlanningActions') {
    const payload = data as PlannerApplyPlanningActionsPayload
    const actions = payload.actions as PlanningAction[]
    const result = payload.result as OptimizeDayResult | OptimizeWeekResult
    const options = payload.options as {
      source: ExecutionSource
      summary: string
      confidence?: number
      plannerSource?: 'ai' | 'fallback'
    }
    const mutableActions = actions.filter((action) => action.type !== 'flag_risk')

    if (mutableActions.length === 0) {
      return { success: true, data: EMPTY_EXECUTION_RESULT }
    }

    const execution = store.applyPlanningActions(mutableActions, result, options)
    if (execution.success) {
      return { success: true, data: execution }
    }

    return {
      success: false,
      error: execution.error ?? 'Planner execution failed',
      data: execution,
    }
  }

  return { success: false, error: `Unknown bridge method: ${method}` }
}
