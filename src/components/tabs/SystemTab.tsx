import { Activity, ShieldCheck, Wifi } from 'lucide-react'
import { useJarvisStore } from '@/store/jarvis'
import type { DemoSection } from '@/adapters/backend-files'
import type { BuilderExecutionHistorySnapshot } from '@/adapters/builder-execution'
import type { RunHistorySnapshot } from '@/adapters/run-history'
import { AgentRunHistoryPanel } from './AgentRunHistoryPanel'
import { ActivityFeedPanel } from './ActivityFeedPanel'
import { BuilderExecutionHistoryPanel } from './BuilderExecutionHistoryPanel'
import { WorkQueuePanel } from './WorkQueuePanel'
import { TruthBadge } from './TruthBadge'
import { Card, FieldRow, ItemList, WarningBanner, StaggerItem, StaggerList } from './shared'

export function SystemTab({
  section,
  systemState,
  runHistory,
  builderExecutionHistory,
}: {
  section: DemoSection
  systemState: string[]
  runHistory: RunHistorySnapshot
  builderExecutionHistory: BuilderExecutionHistorySnapshot
}) {
  const ocStatus = useJarvisStore((s) => s.ocStatus)
  const statusChecked = useJarvisStore((s) => s.statusChecked)
  const statusColor = !statusChecked ? '#ffc84a' : ocStatus.online ? '#00ff88' : '#ff6b35'
  const statusLabel = !statusChecked ? 'CHECKING' : ocStatus.online ? 'ONLINE' : 'OFFLINE'

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-3 pb-1">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{
            background: 'rgba(0,255,136,0.08)',
            border:     '1px solid rgba(0,255,136,0.2)',
          }}
        >
          <Activity className="w-4 h-4" style={{ color: '#00ff88' }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm" style={{ color: 'rgba(192,232,240,0.92)' }}>{section.title}</p>
            <TruthBadge label={section.status} />
          </div>
          <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(192,232,240,0.36)' }}>
            Queue · activity · run history · gateway status
          </p>
        </div>
      </div>

      <StaggerList>
        <StaggerItem>
          <WorkQueuePanel history={builderExecutionHistory} />
        </StaggerItem>

        <StaggerItem>
          <ActivityFeedPanel history={builderExecutionHistory} />
        </StaggerItem>

        <StaggerItem>
          <Card title="GATEWAY STATUS" accent="rgba(0,255,136,0.3)">
            <div className="mb-3 flex items-center gap-3">
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: !statusChecked ? 'rgba(255,200,74,0.08)' : ocStatus.online ? 'rgba(0,255,136,0.08)' : 'rgba(255,107,53,0.08)',
                  border:     `1px solid ${!statusChecked ? 'rgba(255,200,74,0.22)' : ocStatus.online ? 'rgba(0,255,136,0.22)' : 'rgba(255,107,53,0.22)'}`,
                }}
              >
                <Wifi className="w-4 h-4" style={{ color: statusColor }} />
              </div>
              <div>
                <p className="text-[11px] font-mono" style={{ color: statusColor }}>
                  {statusLabel}
                </p>
                <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.38)' }}>
                  {statusChecked ? 'localhost:18789' : 'probing local gateway'}
                </p>
              </div>
            </div>
            <FieldRow label="Model" value={ocStatus.model ?? '—'} />
            {ocStatus.version && <FieldRow label="Version" value={ocStatus.version} />}
            {ocStatus.error && <FieldRow label="Error" value={ocStatus.error} valueColor="#ff6b35" />}
          </Card>
        </StaggerItem>

        <StaggerItem>
          <AgentRunHistoryPanel runHistory={runHistory} />
        </StaggerItem>

        <StaggerItem>
          <BuilderExecutionHistoryPanel history={builderExecutionHistory} />
        </StaggerItem>

        <StaggerItem>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="CURRENT BACKEND / SYSTEM TRUTH" accent="rgba(0,212,255,0.18)">
              <ItemList items={systemState} color="#00d4ff" />
            </Card>

            <Card title="BLOCKED CAPABILITY SUMMARY" accent="rgba(255,107,53,0.24)">
              <div className="mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" style={{ color: '#ff6b35' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.64)' }}>
                  demo boundaries
                </span>
              </div>
              <ItemList items={section.blockedCapabilities} color="#ff6b35" />
            </Card>
          </div>
        </StaggerItem>

        {section.warningLabels[0] && (
          <StaggerItem>
            <WarningBanner text={section.warningLabels[0]} />
          </StaggerItem>
        )}
      </StaggerList>
    </div>
  )
}
