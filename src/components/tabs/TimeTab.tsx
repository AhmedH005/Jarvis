import { Clock, RefreshCw, TimerReset } from 'lucide-react'
import type { CandidateBlock, DemoSection, WeeklySlot } from '@/adapters/backend-files'
import { TruthBadge } from './TruthBadge'
import { Card, FieldRow, ItemList, WarningBanner, StaggerItem, StaggerList } from './shared'

const BLOCK_COLORS: Record<CandidateBlock['blockState'], string> = {
  protected: '#00d4ff',
  tentative: '#ffc84a',
  missed: '#ff6b35',
}

export function TimeTab({
  section,
  weeklySlots,
  candidateBlocks,
}: {
  section: DemoSection
  weeklySlots: WeeklySlot[]
  candidateBlocks: CandidateBlock[]
}) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-3 pb-1">
        <div
          className="rounded flex items-center justify-center flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            background: 'rgba(255,200,74,0.08)',
            border: '1px solid rgba(255,200,74,0.22)',
          }}
        >
          <Clock className="w-4 h-4" style={{ color: '#ffc84a' }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm" style={{ color: 'rgba(192,232,240,0.92)' }}>{section.title}</p>
            <TruthBadge label={section.status} />
          </div>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(192,232,240,0.38)' }}>
            Conceptual planning layer only. No live calendar sync, event creation, or external availability check.
          </p>
        </div>
      </div>

      <StaggerList>
        <StaggerItem>
          <Card title="CAPABILITY TRUTH" accent="rgba(255,200,74,0.28)">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <span className="text-[9px] font-mono" style={{ color: '#00ff88' }}>CURRENT CAPABILITIES</span>
                <div className="mt-2">
                  <ItemList items={section.coreCapabilities} color="#00ff88" />
                </div>
              </div>
              <div>
                <span className="text-[9px] font-mono" style={{ color: '#ff6b35' }}>BLOCKED CAPABILITIES</span>
                <div className="mt-2">
                  <ItemList items={section.blockedCapabilities} color="#ff6b35" />
                </div>
              </div>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card title="WEEKLY STRUCTURE" accent="rgba(255,200,74,0.18)">
            <div className="flex flex-col gap-3">
              {weeklySlots.map((slot) => (
                <div
                  key={slot.title}
                  className="rounded-lg px-4 py-3"
                  style={{
                    background: 'rgba(0,212,255,0.03)',
                    border: '1px solid rgba(0,212,255,0.1)',
                  }}
                >
                  <p className="text-[11px] font-mono" style={{ color: 'rgba(0,212,255,0.84)' }}>{slot.title}</p>
                  <p className="mt-1 text-[10px]" style={{ color: 'rgba(192,232,240,0.48)' }}>{slot.label || slot.purpose}</p>
                  {slot.primaryWorkItem && <FieldRow label="Primary item" value={slot.primaryWorkItem} mono />}
                  {slot.primaryBlock && <FieldRow label="Primary block" value={slot.primaryBlock} mono />}
                  {slot.fallbackBlock && <FieldRow label="Fallback" value={slot.fallbackBlock} mono />}
                  {slot.why.length > 0 && (
                    <div className="mt-2">
                      <ItemList items={slot.why} color="#00d4ff" />
                    </div>
                  )}
                  {slot.missPolicy.length > 0 && (
                    <div className="mt-2 flex items-start gap-1.5">
                      <RefreshCw className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: 'rgba(192,232,240,0.36)' }} />
                      <div className="flex-1">
                        {slot.missPolicy.map((item, index) => (
                          <p key={index} className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.46)' }}>
                            {item}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card title="CANDIDATE BLOCKS" accent="rgba(255,200,74,0.16)">
            <div className="flex flex-col gap-3">
              {candidateBlocks.map((block) => (
                <div
                  key={block.blockId}
                  className="rounded-lg px-4 py-3"
                  style={{
                    background: `${BLOCK_COLORS[block.blockState]}10`,
                    border: `1px solid ${BLOCK_COLORS[block.blockState]}30`,
                  }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="rounded px-2 py-0.5 text-[9px] font-mono"
                      style={{
                        color: BLOCK_COLORS[block.blockState],
                        background: `${BLOCK_COLORS[block.blockState]}16`,
                        border: `1px solid ${BLOCK_COLORS[block.blockState]}28`,
                      }}
                    >
                      {block.blockState}
                    </span>
                    <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.4)' }}>{block.blockKind}</span>
                    <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.4)' }}>{block.plannedDuration}</span>
                  </div>
                  <p className="mt-2 text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.84)' }}>{block.title}</p>
                  <p className="mt-1 text-[10px]" style={{ color: 'rgba(192,232,240,0.56)' }}>{block.purpose}</p>
                  <FieldRow label="Work item" value={block.linkedWorkItemId} mono />
                  <FieldRow label="Window" value={block.suggestedWindow} />
                  <FieldRow label="Priority" value={block.priorityContext} />
                  {block.conflictNotes && (
                    <div className="mt-2 flex items-start gap-1.5">
                      <TimerReset className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: 'rgba(255,200,74,0.7)' }} />
                      <p className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.45)' }}>
                        {block.conflictNotes}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
