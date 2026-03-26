import { useState } from 'react'
import { AlertTriangle, Calendar, Check, CheckSquare, ChevronRight, Plus, X } from 'lucide-react'
import { usePlannerStore }  from '@/store/planner'
import { useJarvisStore }   from '@/store/jarvis'
import { nanoid }           from '@/lib/utils'
import { formatDayLabel }   from '@/lib/dateUtils'
import { handlePlannerCommand } from './plannerCommandRouter'
import type { PlannerIntakeResponse, PlannerIntakeEntity } from './plannerIntakeTypes'
import type { IntakeEventData, IntakeTaskData } from '@/store/planner'
import type { Message } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm   = h >= 12 ? 'PM' : 'AM'
  const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function entitySubline(entity: PlannerIntakeEntity): string {
  if (entity.type === 'event') {
    const parts = [formatDayLabel(entity.date), fmtTime(entity.startTime)]
    if (entity.durationMinutes) parts.push(`${entity.durationMinutes}min`)
    return parts.join(' · ')
  }
  return entity.dueDate ? `due ${formatDayLabel(entity.dueDate)}` : 'no due date'
}

// ── Component ──────────────────────────────────────────────────────────────────

export function IntakePreviewPanel({
  response,
  onDismiss,
}: {
  response: PlannerIntakeResponse
  onDismiss?: () => void
}) {
  const createManyFromIntake    = usePlannerStore((s) => s.createManyFromIntake)
  const setPlannerPreview       = useJarvisStore((s) => s.setPlannerPreview)
  const setActivePlanSession    = useJarvisStore((s) => s.setActivePlanSession)
  const setIntakePreview        = useJarvisStore((s) => s.setIntakePreview)
  const addMessage              = useJarvisStore((s) => s.addMessage)
  const pushLog                 = useJarvisStore((s) => s.pushLog)

  const [applied,            setApplied]          = useState(false)
  const [createdTaskTitles,  setCreatedTaskTitles] = useState<string[]>([])
  const [isScheduling,       setIsScheduling]      = useState(false)
  const [handoffDismissed,   setHandoffDismissed]  = useState(false)

  // ── Apply all entities to planner store ────────────────────────────────────

  function handleApplyAll() {
    const events: IntakeEventData[] = response.entities
      .filter((e): e is PlannerIntakeEntity & { type: 'event' } => e.type === 'event')
      .map((e) => ({
        title:           e.title,
        date:            e.date,
        startTime:       e.startTime,
        durationMinutes: e.durationMinutes ?? 60,
        locked:          e.locked,
        notes:           e.notes,
      }))

    const taskEntities = response.entities.filter(
      (e): e is PlannerIntakeEntity & { type: 'task' } => e.type === 'task',
    )
    const tasks: IntakeTaskData[] = taskEntities.map((e) => ({
      title:           e.title,
      dueDate:         e.dueDate,
      durationMinutes: e.durationMinutes,
      priority:        e.priority,
      energyType:      e.energyType,
      notes:           e.notes,
    }))

    createManyFromIntake(events, tasks)
    setCreatedTaskTitles(taskEntities.map((e) => e.title))
    setApplied(true)
    pushLog(`Intake applied · ${response.entities.length} item(s) added to planner`, 'success')
  }

  // ── Follow-up: schedule newly created tasks ────────────────────────────────

  async function handleScheduleFollowUp() {
    if (isScheduling) return
    setIsScheduling(true)
    try {
      const { tasks, blocks } = usePlannerStore.getState()
      const currentDate = new Date().toISOString().split('T')[0]
      const plannerContext = { currentDate, selectedDate: currentDate, tasks, blocks }

      const plannerResponse = await handlePlannerCommand('schedule unscheduled tasks', plannerContext)

      if (plannerResponse.result) {
        setPlannerPreview(plannerResponse)
        setActivePlanSession({
          result:                plannerResponse.result,
          command:               plannerResponse.command,
          timestamp:             new Date().toISOString(),
          refinementConstraints: {},
          refinementHistory:     [],
        })
        addMessage({
          id:        nanoid(),
          role:      'assistant',
          content:   plannerResponse.summary,
          timestamp: new Date(),
        } as Message)
      } else {
        addMessage({
          id:        nanoid(),
          role:      'assistant',
          content:   'No unscheduled tasks found to plan — you\'re all set.',
          timestamp: new Date(),
        } as Message)
      }

      setIntakePreview(null)
    } catch {
      pushLog('Schedule follow-up failed — try again', 'error')
      addMessage({
        id:        nanoid(),
        role:      'assistant',
        content:   'Something went wrong while scheduling. Try saying "schedule my tasks".',
        timestamp: new Date(),
      } as Message)
      setIntakePreview(null)
    } finally {
      setIsScheduling(false)
    }
  }

  const onlyEvents     = response.entities.every((e) => e.type === 'event')
  const hasTasksToOffer = applied && createdTaskTitles.length > 0 && !handoffDismissed

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-3 space-y-2">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plus className="w-3 h-3 flex-shrink-0" style={{ color: '#00ff88' }} />
          <span className="text-[9px] font-mono tracking-wider" style={{ color: '#00ff88' }}>
            {applied ? 'ADDED TO PLANNER' : 'CONFIRM NEW ITEMS'}
            {!applied && (
              <>
                {' · '}
                <span style={{ color: 'rgba(0,255,136,0.5)' }}>
                  {response.entities.length} {response.entities.length === 1 ? 'item' : 'items'}
                </span>
              </>
            )}
          </span>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} style={{ color: 'rgba(192,232,240,0.3)', flexShrink: 0 }}>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Warnings */}
      {response.warnings.map((w, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" style={{ color: '#ffc84a' }} />
          <span className="text-[8px] font-mono" style={{ color: '#ffc84a' }}>{w}</span>
        </div>
      ))}

      {/* Entity cards */}
      <div className="space-y-1">
        {response.entities.map((entity, i) => {
          const isEvent     = entity.type === 'event'
          const accentRgb   = isEvent ? '0,212,255' : '157,78,221'
          const accentColor = isEvent ? '#00d4ff' : '#9d4edd'
          const Icon        = isEvent ? Calendar : CheckSquare
          const badge       = applied ? 'ADDED' : isEvent ? 'EVENT' : 'TASK'
          const badgeColor  = applied ? '#00ff88' : accentColor
          const bgAlpha     = applied ? 'rgba(0,255,136,0.05)'     : `rgba(${accentRgb},0.05)`
          const borderAlpha = applied ? 'rgba(0,255,136,0.2)'      : `rgba(${accentRgb},0.2)`

          return (
            <div
              key={i}
              className="flex items-start gap-2 px-2 py-1.5 rounded"
              style={{ background: bgAlpha, border: `1px solid ${borderAlpha}` }}
            >
              <Icon
                className="w-2.5 h-2.5 flex-shrink-0 mt-0.5"
                style={{ color: applied ? '#00ff88' : accentColor }}
              />
              <div className="flex-1 min-w-0">
                <span className="text-[8px] font-mono block truncate" style={{ color: 'rgba(192,232,240,0.88)' }}>
                  {entity.title}
                </span>
                <span className="text-[7px] font-mono" style={{ color: 'rgba(192,232,240,0.42)' }}>
                  {entitySubline(entity)}
                </span>
              </div>
              <span className="text-[7px] font-mono flex-shrink-0" style={{ color: badgeColor }}>
                {badge}
              </span>
            </div>
          )
        })}
      </div>

      {/* Post-apply: event-only confirmation */}
      {applied && onlyEvents && (
        <p className="text-[8px] font-mono" style={{ color: 'rgba(0,255,136,0.65)' }}>
          ✓ Added to your calendar. You're all set.
        </p>
      )}

      {/* Post-apply: task scheduling handoff */}
      {hasTasksToOffer && (
        <div
          className="px-2 py-2 rounded space-y-2"
          style={{
            background: 'rgba(157,78,221,0.06)',
            border:     '1px solid rgba(157,78,221,0.22)',
          }}
        >
          <p className="text-[8px] font-mono leading-relaxed" style={{ color: 'rgba(157,78,221,0.9)' }}>
            {createdTaskTitles.length === 1
              ? `Want me to find a time for "${createdTaskTitles[0]}"?`
              : `Want me to schedule time for these ${createdTaskTitles.length} tasks?`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { void handleScheduleFollowUp() }}
              disabled={isScheduling}
              className="flex-1 py-1 rounded text-[8px] font-mono tracking-wider flex items-center justify-center gap-1.5"
              style={{
                background: isScheduling ? 'rgba(157,78,221,0.06)' : 'rgba(157,78,221,0.14)',
                border:     '1px solid rgba(157,78,221,0.3)',
                color:      isScheduling ? 'rgba(157,78,221,0.45)' : '#9d4edd',
                cursor:     isScheduling ? 'not-allowed' : 'pointer',
              }}
            >
              {isScheduling ? (
                'SCHEDULING…'
              ) : (
                <>
                  <ChevronRight className="w-2.5 h-2.5" />
                  SCHEDULE IT
                </>
              )}
            </button>
            <button
              onClick={() => setHandoffDismissed(true)}
              disabled={isScheduling}
              className="px-3 py-1 rounded text-[8px] font-mono tracking-wider"
              style={{
                background: 'rgba(74,122,138,0.06)',
                border:     '1px solid rgba(74,122,138,0.18)',
                color:      'rgba(74,122,138,0.7)',
                cursor:     isScheduling ? 'not-allowed' : 'pointer',
              }}
            >
              NOT NOW
            </button>
          </div>
        </div>
      )}

      {/* Post-apply: tasks added, handoff dismissed */}
      {applied && !onlyEvents && handoffDismissed && (
        <p className="text-[8px] font-mono" style={{ color: 'rgba(0,255,136,0.65)' }}>
          ✓ Tasks added. Say "schedule my tasks" whenever you're ready.
        </p>
      )}

      {/* Pre-apply: confirm / cancel row */}
      {!applied && (
        <div className="flex gap-2">
          <button
            onClick={handleApplyAll}
            className="flex-1 py-1 rounded text-[8px] font-mono tracking-wider flex items-center justify-center gap-1.5"
            style={{
              background: 'rgba(0,255,136,0.08)',
              border:     '1px solid rgba(0,255,136,0.22)',
              color:      '#00ff88',
            }}
          >
            <Check className="w-3 h-3" />
            ADD TO PLANNER
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="px-3 py-1 rounded text-[8px] font-mono tracking-wider"
              style={{
                background: 'rgba(255,107,53,0.06)',
                border:     '1px solid rgba(255,107,53,0.18)',
                color:      'rgba(255,107,53,0.6)',
              }}
            >
              CANCEL
            </button>
          )}
        </div>
      )}
    </div>
  )
}
