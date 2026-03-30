import { Code2, FileCode2, ShieldCheck, TerminalSquare, Wrench, Layers, GitBranch } from 'lucide-react'
import { getBuilderProvider } from '@/integrations/registry/providerRegistry'
import { useActionRuntimeStore } from '@/store/action-runtime'
import { Card, EmptyPanel, FieldRow, ItemList, PanelHeader } from './shared'

// Map builder action titles → display action type labels
function inferActionType(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('decompos'))      return 'decompose_task'
  if (t.includes('remediation'))   return 'create_remediation_plan'
  if (t.includes('fix request'))   return 'shape_fix_request'
  if (t.includes('context attach')) return 'attach_context'
  if (t.includes('result summary')) return 'summarize_result'
  if (t.includes('plan'))          return 'plan_work'
  if (t.includes('execution'))     return 'stage_execution'
  if (t.includes('verification'))  return 'verify_run'
  return 'builder_action'
}

export function DevTab() {
  const actions = useActionRuntimeStore((state) =>
    state.actions.filter((action) => action.domain === 'builder').slice(0, 12)
  )

  const stagePlan = async () => {
    await getBuilderProvider().requestPlan({
      taskPrompt: 'Prepare a dry-run implementation plan',
      scope: 'repo',
      mode: 'plan-only',
    })
  }

  const stageDecompose = async () => {
    await getBuilderProvider().decomposeTask(
      'Decompose: review the current module structure and identify refactoring opportunities'
    )
  }

  const stageRemediation = async () => {
    await getBuilderProvider().shapeFixRequest(
      'dry-run-test-run',
      'TypeScript type error in build output — expected string, received undefined'
    )
  }

  // Action type breakdown for truth surfacing
  const actionTypeCounts = actions.reduce<Record<string, number>>((acc, action) => {
    const type = inferActionType(action.title)
    acc[type] = (acc[type] ?? 0) + 1
    return acc
  }, {})

  const contextAttached = actions.filter((a) => a.title.toLowerCase().includes('context')).length
  const stagedCount     = actions.filter((a) => a.state === 'staged').length
  const blockedCount    = actions.filter((a) => a.state === 'failed').length

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PanelHeader
        Icon={Code2}
        title="DEV"
        sublabel="Builder-backed development work staged safely through the shared orchestrator"
        iconColor="#00d4ff"
        iconBg="rgba(0,212,255,0.10)"
        iconBorder="rgba(0,212,255,0.22)"
      />

      <div className="px-4 py-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card title="DEV BACKEND" accent="rgba(0,212,255,0.22)">
            <FieldRow label="Execution"       value="existing OpenClaw Builder"  valueColor="#00d4ff" />
            <FieldRow label="Queue"           value="agent-task-manager"         valueColor="#00d4ff" mono />
            <FieldRow label="Mode"            value="approval-gated"             valueColor="#ffc84a" mono />
            <FieldRow label="Decomposition"   value="local structural heuristic" valueColor="#a3e635" mono />
            <FieldRow label="Remediation"     value="local shaping + memory"     valueColor="#a3e635" mono />
            <FieldRow label="Context"         value="memory hooks (dev domain)"  valueColor="#a3e635" mono />
          </Card>

          <Card title="SAFE ACTIONS" accent="rgba(255,200,74,0.24)">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void stagePlan()}
                className="rounded px-3 py-1.5 text-[10px] font-mono"
                style={{ color: '#ffc84a', border: '1px solid rgba(255,200,74,0.24)', background: 'rgba(255,200,74,0.08)' }}
              >
                <span className="inline-flex items-center gap-1"><FileCode2 className="w-3 h-3" /> Stage Plan</span>
              </button>
              <button
                onClick={() => void stageDecompose()}
                className="rounded px-3 py-1.5 text-[10px] font-mono"
                style={{ color: '#a3e635', border: '1px solid rgba(163,230,53,0.24)', background: 'rgba(163,230,53,0.08)' }}
              >
                <span className="inline-flex items-center gap-1"><Layers className="w-3 h-3" /> Decompose Task</span>
              </button>
              <button
                onClick={() => void stageRemediation()}
                className="rounded px-3 py-1.5 text-[10px] font-mono"
                style={{ color: '#fb923c', border: '1px solid rgba(251,146,60,0.24)', background: 'rgba(251,146,60,0.08)' }}
              >
                <span className="inline-flex items-center gap-1"><Wrench className="w-3 h-3" /> Shape Fix</span>
              </button>
            </div>
            <ItemList
              items={[
                'No fake multi-agent theatrics',
                'No execution start while dry run is enabled',
                'Verification remains staged too',
              ]}
              color="#ffc84a"
            />
          </Card>

          <Card title="APPROVALS" accent="rgba(255,107,53,0.18)">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#ff6b35' }} />
              <span className="text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.74)' }}>
                execution requires explicit approval later
              </span>
            </div>
            <ItemList
              items={[
                'plan → staged',
                'decompose → staged',
                'shape fix → staged',
                'execution request → staged',
                'run → blocked until safety flags change',
              ]}
              color="#ff6b35"
            />
          </Card>
        </div>

        {actions.length > 0 && (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Card title="ACTION BREAKDOWN" accent="rgba(163,230,53,0.18)">
              <div className="flex items-center gap-1.5 mb-2">
                <GitBranch className="w-3 h-3" style={{ color: '#a3e635' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(163,230,53,0.7)' }}>
                  {actions.length} builder action{actions.length === 1 ? '' : 's'} in session
                </span>
              </div>
              <FieldRow label="Staged"          value={String(stagedCount)}   valueColor="#a3e635" mono />
              <FieldRow label="Blocked"         value={String(blockedCount)}  valueColor={blockedCount > 0 ? '#ff6b35' : '#a3e635'} mono />
              <FieldRow label="Context attached" value={String(contextAttached)} valueColor="#00d4ff" mono />
              {Object.entries(actionTypeCounts).map(([type, count]) => (
                <FieldRow
                  key={type}
                  label={type.replace(/_/g, ' ')}
                  value={`×${count}`}
                  valueColor="#a3e635"
                  mono
                />
              ))}
            </Card>

            <Card title="DEV ACTION LOG" accent="rgba(0,212,255,0.18)">
              <ItemList
                items={actions.map((action) => {
                  const type = inferActionType(action.title)
                  return `${action.state.toUpperCase()} · ${type} · ${action.summary}`
                })}
                color="#00d4ff"
              />
            </Card>
          </div>
        )}

        {actions.length === 0 && (
          <Card title="DEV ACTION LOG" accent="rgba(0,212,255,0.18)">
            <EmptyPanel
              icon={Code2}
              title="No staged dev actions yet"
              note="Use Stage Plan, Decompose Task, or Shape Fix to create structured builder actions."
            />
          </Card>
        )}
      </div>
    </div>
  )
}
