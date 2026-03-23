import { Globe2, Search } from 'lucide-react'
import type { DemoSection } from '@/adapters/backend-files'
import { TruthBadge } from './TruthBadge'
import { BlockedBanner, Card, ItemList, StaggerItem, StaggerList } from './shared'

export function ResearchTab({
  section,
  researchState,
}: {
  section: DemoSection
  researchState: string[]
}) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-3 pb-1">
        <div
          className="rounded flex items-center justify-center flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            background: 'rgba(255,107,53,0.08)',
            border: '1px solid rgba(255,107,53,0.22)',
          }}
        >
          <Search className="w-4 h-4" style={{ color: '#ff6b35' }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm" style={{ color: 'rgba(192,232,240,0.92)' }}>{section.title}</p>
            <TruthBadge label={section.status} />
          </div>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(192,232,240,0.38)' }}>
            Provider-ready boundary only. No fake web search, no fake news results.
          </p>
        </div>
      </div>

      <StaggerList>
        <StaggerItem>
          <div
            className="rounded-xl px-6 py-8 text-center"
            style={{
              background: 'rgba(255,107,53,0.035)',
              border: '1px solid rgba(255,107,53,0.16)',
            }}
          >
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{
                background: 'rgba(255,107,53,0.08)',
                border: '1px solid rgba(255,107,53,0.22)',
              }}
            >
              <Globe2 className="h-6 w-6" style={{ color: 'rgba(255,107,53,0.72)' }} />
            </div>
            <p className="text-[12px] font-mono tracking-[0.18em]" style={{ color: 'rgba(255,107,53,0.8)' }}>
              RESEARCH IS BLOCKED
            </p>
            <p className="mt-2 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.46)' }}>
              The shell is intentionally showing the blocked state honestly because the live provider is not configured.
            </p>
          </div>
        </StaggerItem>

        <StaggerItem>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="CURRENT STATE" accent="rgba(255,107,53,0.24)">
              <ItemList items={researchState} color="#ff6b35" />
            </Card>
            <Card title="BLOCKED CAPABILITIES" accent="rgba(255,107,53,0.2)">
              <ItemList items={section.blockedCapabilities} color="#ff6b35" />
            </Card>
          </div>
        </StaggerItem>

        <StaggerItem>
          <BlockedBanner text={section.warningLabels[0] ?? 'Live web research is intentionally not connected yet.'} />
        </StaggerItem>
      </StaggerList>
    </div>
  )
}
