import { Bot, GitBranch, Lock, Shield } from 'lucide-react'
import type { DemoSection } from '@/adapters/backend-files'
import { TruthBadge } from './TruthBadge'
import { Card, ItemList, WarningBanner, StaggerItem, StaggerList } from './shared'

export function JarvisTab({
  section,
  decisions,
}: {
  section: DemoSection
  decisions: string[]
}) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-3 pb-1">
        <div
          className="rounded flex items-center justify-center flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.2)',
          }}
        >
          <Bot className="w-4 h-4" style={{ color: '#00d4ff' }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm" style={{ color: 'rgba(192,232,240,0.92)' }}>{section.title}</p>
            <TruthBadge label={section.status} />
          </div>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(192,232,240,0.38)' }}>
            Truthful orchestration surface grounded in the current demo state.
          </p>
        </div>
      </div>

      <StaggerList>
        <StaggerItem>
          <Card title="ORCHESTRATION SUMMARY" accent="rgba(0,212,255,0.4)">
            <div className="flex items-center gap-1.5 mb-2">
              <Shield className="w-3 h-3" style={{ color: '#00d4ff' }} />
              <span className="text-[10px] font-mono" style={{ color: 'rgba(0,212,255,0.62)' }}>
                current live capabilities
              </span>
            </div>
            <ItemList items={section.coreCapabilities} color="#00d4ff" />
          </Card>
        </StaggerItem>

        <StaggerItem>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="ROUTING EXPLANATION" accent="rgba(0,212,255,0.2)">
              <div className="flex items-center gap-1.5 mb-2">
                <GitBranch className="w-3 h-3" style={{ color: 'rgba(0,212,255,0.5)' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.42)' }}>
                  from demo-state.md
                </span>
              </div>
              <ItemList items={section.recommendedUiContent} color="#00d4ff" />
            </Card>

            <Card title="BLOCKED / GUARDED" accent="rgba(255,107,53,0.24)">
              <ItemList items={section.blockedCapabilities} color="#ff6b35" />
            </Card>
          </div>
        </StaggerItem>

        <StaggerItem>
          <Card title="APPROVAL-GATED EXECUTION" accent="rgba(255,200,74,0.24)">
            <div className="flex items-start gap-2">
              <Lock className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#ffc84a' }} />
              <p className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.62)' }}>
                Jarvis can route planning and diagnostics, but any mutation or execution path still follows the normal approval gate. This demo shell is read-only and does not imply autonomous changes.
              </p>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card title="CURRENT DECISIONS" accent="rgba(0,255,136,0.2)">
            <ItemList items={decisions.slice(0, 8)} color="#00ff88" />
          </Card>
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
