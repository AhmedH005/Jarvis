import { Bot, Command, Layers3, Shield } from 'lucide-react'
import { MessageList } from '@/components/chat/MessageList'
import { InputBar } from '@/components/chat/InputBar'
import { useActionRuntimeStore } from '@/store/action-runtime'
import { useRuntimeStore } from '@/store/runtime'
import { Card, CapabilityList, EmptyPanel, FieldRow, ItemList, PanelHeader } from './shared'

const MODULE_MAP = [
  'Command → agent-task-manager',
  'Time → advanced-calendar + cron-scheduling',
  'Concierge → agent-mail-cli + bookameeting',
  'Creation → elevenlabs-* + eachlabs-music',
  'Dev → Builder + agent-task-manager',
  'Memory → brainrepo + context-anchor',
  'Finance → actual-budget or unavailable',
  'System → runtime + approvals + receipts',
]

export function CommandTab() {
  const snapshot = useRuntimeStore((state) => state.snapshot)
  const actions = useActionRuntimeStore((state) => state.actions.slice(0, 6))
  const router = snapshot?.providers.orchestrator

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader
        Icon={Command}
        title="COMMAND"
        sublabel="Natural language intake routed through the staged orchestrator"
        iconColor="#00d4ff"
        iconBg="rgba(0,212,255,0.10)"
        iconBorder="rgba(0,212,255,0.22)"
      />

      <div className="flex-shrink-0 px-4 py-3" style={{ borderBottom: '1px solid rgba(0,212,255,0.07)' }}>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card title="ROUTER" accent="rgba(0,212,255,0.28)">
            <FieldRow label="Provider" value={router?.label ?? 'Loading…'} valueColor="#00d4ff" />
            <FieldRow label="Health" value={router?.health.state ?? 'idle'} valueColor={router?.health.state === 'ready' ? '#00ff88' : '#ffc84a'} mono />
            <CapabilityList
              items={[
                'suggested → staged',
                'approval-aware routing',
                'receipt tracking',
              ]}
              color="#00d4ff"
            />
          </Card>

          <Card title="SAFETY" accent="rgba(255,200,74,0.24)">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-3.5 h-3.5" style={{ color: '#ffc84a' }} />
              <span className="text-[10px] font-mono" style={{ color: 'rgba(255,200,74,0.74)' }}>
                nothing executes yet
              </span>
            </div>
            <ItemList
              items={[
                'Global DRY_RUN blocks execution',
                'execute / write / network capabilities are disabled',
                'all actionable routes stage instead of running',
              ]}
              color="#ffc84a"
            />
          </Card>

          <Card title="MODULE MAP" accent="rgba(0,255,136,0.22)">
            <div className="flex items-center gap-2 mb-1">
              <Layers3 className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
              <span className="text-[10px] font-mono" style={{ color: 'rgba(0,255,136,0.72)' }}>
                cross-platform targets
              </span>
            </div>
            <ItemList items={MODULE_MAP} color="#00ff88" />
          </Card>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-3">
          <Card title="RECENT STAGED MISSIONS" accent="rgba(0,212,255,0.16)">
            {actions.length > 0 ? (
              <ItemList
                items={actions.map((action) => `${action.state.toUpperCase()} · ${action.title} · ${action.summary}`)}
                color="#00d4ff"
              />
            ) : (
              <EmptyPanel
                icon={Bot}
                title="No staged command actions yet"
                note="Send a command below and Jarvis will classify it, select the target module, and stage it safely."
              />
            )}
          </Card>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <MessageList />
        </div>
        <div className="flex-shrink-0">
          <InputBar />
        </div>
      </div>
    </div>
  )
}
