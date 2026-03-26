import type { Task, CalendarBlock } from '@/store/planner'

// ── Entities ───────────────────────────────────────────────────────────────────

export type PlannerIntakeEntity =
  | {
      type: 'event'
      title: string
      date: string            // YYYY-MM-DD
      startTime: string       // HH:MM
      endTime?: string | null
      durationMinutes?: number | null
      locked: boolean
      notes?: string
      confidence: number
    }
  | {
      type: 'task'
      title: string
      dueDate?: string | null   // YYYY-MM-DD
      durationMinutes?: number | null
      priority?: 'low' | 'medium' | 'high' | null
      energyType?: 'light' | 'moderate' | 'deep' | null
      notes?: string
      confidence: number
    }

// ── Response ───────────────────────────────────────────────────────────────────

export interface PlannerIntakeResponse {
  kind: 'event' | 'task' | 'mixed' | 'unknown'
  entities: PlannerIntakeEntity[]
  summary: string
  requiresConfirmation: boolean
  warnings: string[]
  source: 'ai' | 'fallback'
}

// ── Context ────────────────────────────────────────────────────────────────────

export interface PlannerIntakeContext {
  currentDate: string   // YYYY-MM-DD
  selectedDate: string  // YYYY-MM-DD
  tasks: Task[]
  blocks: CalendarBlock[]
  timezone?: string
}
