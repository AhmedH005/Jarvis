export const JARVIS_PLANNER_BRIDGE_OFFLINE_MESSAGE =
  'Jarvis planner bridge is offline right now, so I can’t write this into your Electron calendar at the moment.'

export interface PlannerBridgeResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface PlannerCreateEventPayload {
  title: string
  date: string
  startTime: string
  durationMinutes?: number | null
  locked: boolean
  notes?: string
}

export interface PlannerCreateTaskPayload {
  title: string
  dueDate?: string | null
  durationMinutes?: number | null
  priority?: 'low' | 'medium' | 'high' | null
  energyType?: 'light' | 'moderate' | 'deep' | null
  notes?: string
}

export interface PlannerCreateManyFromIntakePayload {
  events: PlannerCreateEventPayload[]
  tasks: PlannerCreateTaskPayload[]
}

export interface PlannerApplyPlanningActionsPayload {
  actions: unknown[]
  result: unknown
  options: {
    source: 'manual' | 'optimize_day' | 'optimize_week' | 'apply_action' | 'apply_all'
    summary: string
    confidence?: number
    plannerSource?: 'ai' | 'fallback'
  }
}

export interface PlannerBridgeExecutionResult {
  success: boolean
  appliedActionIds: string[]
  failedActionIds: string[]
  warnings: string[]
  error?: string
  rollbackAvailable: boolean
}
