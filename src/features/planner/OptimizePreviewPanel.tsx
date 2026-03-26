import { useEffect, useState } from 'react'
import { Brain, CheckCircle2, RefreshCw, Scissors, Shield, Wand2, X, Zap } from 'lucide-react'
import { usePlannerStore } from '@/store/planner'
import { useJarvisStore } from '@/store/jarvis'
import type {
  ActionProtectFocusWindow,
  ActionSplitTask,
  ExecutionResult,
  OptimizeDayResult,
  OptimizeWeekResult,
  PlanningAction,
} from './planningOrchestrator'
import { rerunPlanWithConstraints } from './plannerRefinement'
import { describeRefinementConstraints, hasActiveRefinementConstraints } from './plannerRefinementTypes'

export function OptimizePreviewPanel({
  result,
  optimizeType,
  onDismiss,
}: {
  result: OptimizeDayResult | OptimizeWeekResult
  optimizeType: 'day' | 'week'
  onDismiss?: () => void
}) {
  const tasks = usePlannerStore((state) => state.tasks)
  const blocks = usePlannerStore((state) => state.blocks)
  const applyPlanningActions = usePlannerStore((state) => state.applyPlanningActions)
  const undoLastPlanningExecution = usePlannerStore((state) => state.undoLastPlanningExecution)
  const undoSnapshot = usePlannerStore((state) => state.undoSnapshot)
  const plannerPreview = useJarvisStore((state) => state.plannerPreview)
  const setPlannerPreview = useJarvisStore((state) => state.setPlannerPreview)
  const activePlanSession = useJarvisStore((state) => state.activePlanSession)
  const setActivePlanSession = useJarvisStore((state) => state.setActivePlanSession)

  const [actionStatus, setActionStatus] = useState<Map<number, 'applied' | 'failed'>>(new Map())
  const [lastExecResult, setLastExecResult] = useState<ExecutionResult | null>(null)
  const [isClearingRefinements, setIsClearingRefinements] = useState(false)

  useEffect(() => {
    setActionStatus(new Map())
    setLastExecResult(null)
  }, [result])

  const sessionMatchesPreview = Boolean(activePlanSession && plannerPreview?.result === result)
  const refinementLabels = sessionMatchesPreview
    ? describeRefinementConstraints(activePlanSession?.refinementConstraints)
    : []
  const hasRefinements = sessionMatchesPreview && hasActiveRefinementConstraints(activePlanSession?.refinementConstraints)

  function handleApplyAction(action: PlanningAction, index: number) {
    if (actionStatus.get(index) === 'applied') return
    const execResult = applyPlanningActions([action], result, {
      source: 'apply_action',
      summary: `Apply: ${action.type}${'rationale' in action ? ` — ${action.rationale}` : ''}`,
      confidence: result.confidence,
      plannerSource: result.source,
    })
    setLastExecResult(execResult)
    setActionStatus((current) => {
      const next = new Map(current)
      next.set(index, execResult.success ? 'applied' : 'failed')
      return next
    })
  }

  function handleApplyAll() {
    const unapplied = result.actions.filter((action, index) => action.type !== 'flag_risk' && actionStatus.get(index) !== 'applied')
    if (unapplied.length === 0) return
    const execResult = applyPlanningActions(unapplied, result, {
      source: 'apply_all',
      summary: result.summary,
      confidence: result.confidence,
      plannerSource: result.source,
    })
    setLastExecResult(execResult)
    setActionStatus((current) => {
      const next = new Map(current)
      result.actions.forEach((action, index) => {
        if (action.type !== 'flag_risk' && next.get(index) !== 'applied') {
          next.set(index, execResult.success ? 'applied' : 'failed')
        }
      })
      return next
    })
  }

  async function handleClearRefinements() {
    if (!activePlanSession || !sessionMatchesPreview || isClearingRefinements) return
    setIsClearingRefinements(true)
    try {
      const clearedResponse = await rerunPlanWithConstraints(
        activePlanSession,
        {},
        {
          currentDate: new Date().toISOString().split('T')[0],
          selectedDate: new Date().toISOString().split('T')[0],
          tasks,
          blocks,
        },
        activePlanSession.command,
      )
      setPlannerPreview(clearedResponse)
      if (clearedResponse.result) {
        setActivePlanSession({
          result: clearedResponse.result,
          command: activePlanSession.command,
          timestamp: new Date().toISOString(),
          refinementConstraints: {},
          refinementHistory: [
            ...activePlanSession.refinementHistory,
            {
              input: 'Clear refinements',
              timestamp: new Date().toISOString(),
              constraints: {},
            },
          ],
        })
      }
    } finally {
      setIsClearingRefinements(false)
    }
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-3 h-3 flex-shrink-0" style={{ color: '#9d4edd' }} />
          <span className="text-[9px] font-mono tracking-wider" style={{ color: '#9d4edd' }}>
            {optimizeType === 'week' ? 'WEEK PLAN' : 'DAY PLAN'}
            {' · '}
            <span style={{ color: result.source === 'ai' ? '#9d4edd' : 'rgba(157,78,221,0.5)' }}>
              {result.source === 'ai' ? 'AI' : 'AUTO'}
            </span>
          </span>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} style={{ color: 'rgba(192,232,240,0.3)', flexShrink: 0 }}>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <p className="text-[9px] font-mono leading-relaxed" style={{ color: 'rgba(157,78,221,0.7)' }}>
        {result.summary}
      </p>

      {hasRefinements && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-wrap gap-1">
            {refinementLabels.map((label) => (
              <span
                key={label}
                className="px-1.5 py-0.5 rounded text-[7px] font-mono tracking-wider"
                style={{
                  background: 'rgba(0,212,255,0.08)',
                  border: '1px solid rgba(0,212,255,0.18)',
                  color: 'rgba(0,212,255,0.75)',
                }}
              >
                {label.toUpperCase()}
              </span>
            ))}
          </div>
          <button
            onClick={() => { void handleClearRefinements() }}
            disabled={isClearingRefinements}
            className="flex-shrink-0 px-1.5 py-0.5 rounded text-[7px] font-mono tracking-wider"
            style={{
              background: isClearingRefinements ? 'rgba(255,196,74,0.04)' : 'rgba(255,196,74,0.08)',
              border: '1px solid rgba(255,196,74,0.18)',
              color: isClearingRefinements ? 'rgba(255,196,74,0.45)' : '#ffc84a',
            }}
          >
            {isClearingRefinements ? 'CLEARING…' : 'CLEAR REFINEMENTS'}
          </button>
        </div>
      )}

      {result.warnings?.[0] && (
        <p className="text-[8px] font-mono" style={{ color: '#ffc84a' }}>
          ⚠ {result.warnings[0]}
        </p>
      )}

      {lastExecResult && (
        <div
          className="flex items-center gap-2 px-2 py-1.5 rounded"
          style={{
            background: lastExecResult.success ? 'rgba(0,255,136,0.06)' : 'rgba(255,107,53,0.06)',
            border: `1px solid ${lastExecResult.success ? 'rgba(0,255,136,0.2)' : 'rgba(255,107,53,0.2)'}`,
          }}
        >
          {lastExecResult.success
            ? <CheckCircle2 className="w-2.5 h-2.5 flex-shrink-0" style={{ color: '#00ff88' }} />
            : <Zap className="w-2.5 h-2.5 flex-shrink-0" style={{ color: '#ff6b35' }} />}
          <span className="text-[8px] font-mono flex-1" style={{ color: lastExecResult.success ? '#00ff88' : '#ff6b35' }}>
            {lastExecResult.success
              ? `${lastExecResult.appliedActionIds.length} action${lastExecResult.appliedActionIds.length !== 1 ? 's' : ''} applied`
              : lastExecResult.error ?? `${lastExecResult.failedActionIds.length} action(s) failed`}
          </span>
          {lastExecResult.rollbackAvailable && undoSnapshot && (
            <button
              onClick={() => { undoLastPlanningExecution(); setActionStatus(new Map()); setLastExecResult(null) }}
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-[7px] font-mono tracking-wider flex items-center gap-1"
              style={{ background: 'rgba(255,196,74,0.1)', border: '1px solid rgba(255,196,74,0.25)', color: '#ffc84a' }}
            >
              <RefreshCw className="w-2 h-2" />
              UNDO
            </button>
          )}
        </div>
      )}

      {result.actions.length === 0 && (
        <p className="text-[8px] font-mono" style={{ color: 'rgba(0,255,136,0.55)' }}>
          ✓ Nothing to change — your schedule looks good.
        </p>
      )}

      {result.actions.length > 0 && (() => {
        const allApplied = result.actions.every((a, i) => a.type === 'flag_risk' || actionStatus.get(i) === 'applied')
        if (allApplied) return (
          <div
            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded"
            style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)' }}
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-2.5 h-2.5 flex-shrink-0" style={{ color: '#00ff88' }} />
              <span className="text-[8px] font-mono" style={{ color: '#00ff88' }}>All changes applied</span>
            </div>
            {undoSnapshot && (
              <button
                onClick={() => { undoLastPlanningExecution(); setActionStatus(new Map()); setLastExecResult(null) }}
                className="flex-shrink-0 px-1.5 py-0.5 rounded text-[7px] font-mono tracking-wider flex items-center gap-1"
                style={{ background: 'rgba(255,196,74,0.1)', border: '1px solid rgba(255,196,74,0.25)', color: '#ffc84a' }}
              >
                <RefreshCw className="w-2 h-2" />
                UNDO
              </button>
            )}
          </div>
        )
        return null
      })()}

      {result.actions.length > 0 && !result.actions.every((a, i) => a.type === 'flag_risk' || actionStatus.get(i) === 'applied') && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {result.actions.map((action, index) => {
            const status = actionStatus.get(index)
            const isRisk = action.type === 'flag_risk'
            const isProtect = action.type === 'protect_focus_window'
            const taskTitle = (action.type === 'schedule_task' || action.type === 'defer_task' || action.type === 'split_task')
              ? (tasks.find((task) => task.id === action.taskId)?.title ?? action.taskId)
              : null
            const blockTitle = (action.type === 'move_block' || action.type === 'lock_block' || action.type === 'preserve_block')
              ? (blocks.find((block) => block.id === (action as { blockId: string }).blockId)?.title ?? (action as { blockId: string }).blockId)
              : null
            const label =
              action.type === 'schedule_task' ? `Schedule "${taskTitle}"` :
              action.type === 'move_block' ? `Move "${blockTitle}" → new slot` :
              action.type === 'defer_task' ? `Defer "${taskTitle}" → ${action.toDate}` :
              action.type === 'lock_block' ? `Lock "${blockTitle}"` :
              action.type === 'preserve_block' ? `Preserve "${blockTitle}"` :
              action.type === 'split_task' ? `Split "${taskTitle}" into ${(action as ActionSplitTask).chunks.length} chunks (${(action as ActionSplitTask).chunks.map((chunk) => `${chunk.durationMinutes}min`).join(' + ')})` :
              action.type === 'protect_focus_window' ? `Protect ${(action as ActionProtectFocusWindow).startTime}–${(action as ActionProtectFocusWindow).endTime} for deep work` :
              action.type === 'flag_risk' ? action.message :
              'Unknown action'

            const accentColor = isRisk ? '#ffc84a' : isProtect ? '#00d4ff' : '#9d4edd'
            const rowBg =
              status === 'applied' ? 'rgba(0,255,136,0.05)' :
              status === 'failed' ? 'rgba(255,107,53,0.05)' :
              isRisk ? 'rgba(255,196,74,0.04)' :
              isProtect ? 'rgba(0,212,255,0.04)' :
              'rgba(157,78,221,0.05)'
            const rowBorder =
              status === 'applied' ? 'rgba(0,255,136,0.15)' :
              status === 'failed' ? 'rgba(255,107,53,0.2)' :
              isRisk ? 'rgba(255,196,74,0.15)' :
              isProtect ? 'rgba(0,212,255,0.15)' :
              'rgba(157,78,221,0.14)'
            const ActionIcon =
              status === 'applied' ? CheckCircle2 :
              status === 'failed' ? Zap :
              isRisk ? Zap :
              isProtect ? Shield :
              action.type === 'split_task' ? Scissors :
              Brain

            return (
              <div
                key={`${action.type}-${index}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded"
                style={{ background: rowBg, border: `1px solid ${rowBorder}` }}
              >
                <ActionIcon className="w-2.5 h-2.5 flex-shrink-0" style={{ color: status === 'applied' ? '#00ff88' : status === 'failed' ? '#ff6b35' : accentColor }} />
                <span className="flex-1 text-[8px] font-mono truncate" style={{ color: status === 'failed' ? '#ff6b35' : 'rgba(192,232,240,0.7)' }}>
                  {label}
                </span>
                <span className="text-[7px] font-mono" style={{ color: isRisk ? 'rgba(255,196,74,0.55)' : 'rgba(0,255,136,0.45)' }}>
                  {isRisk ? 'PREVIEW' : 'READY'}
                </span>
                {!status && action.type !== 'flag_risk' && (
                  <button
                    onClick={() => handleApplyAction(action, index)}
                    className="flex-shrink-0 px-1.5 py-0.5 rounded text-[7px] font-mono tracking-wider"
                    style={{ background: `rgba(${isProtect ? '0,212,255' : '157,78,221'},0.12)`, border: `1px solid rgba(${isProtect ? '0,212,255' : '157,78,221'},0.25)`, color: accentColor }}
                  >
                    {isProtect ? 'PROTECT' : 'APPLY'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        {result.actions.some((action, index) => action.type !== 'flag_risk' && actionStatus.get(index) !== 'applied') && (
          <button
            onClick={handleApplyAll}
            className="flex-1 py-1 rounded text-[8px] font-mono tracking-wider flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(157,78,221,0.1)', border: '1px solid rgba(157,78,221,0.25)', color: '#9d4edd' }}
          >
            <Wand2 className="w-3 h-3" />
            APPLY ALL
          </button>
        )}
        {undoSnapshot && !lastExecResult && (
          <button
            onClick={undoLastPlanningExecution}
            className="flex-1 py-1 rounded text-[8px] font-mono tracking-wider flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(255,196,74,0.07)', border: '1px solid rgba(255,196,74,0.2)', color: '#ffc84a' }}
          >
            <RefreshCw className="w-3 h-3" />
            UNDO LAST
          </button>
        )}
      </div>
    </div>
  )
}
