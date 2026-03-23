import { Briefcase, Link2 } from 'lucide-react'
import type { DemoSection, WorkLedger } from '@/adapters/backend-files'
import { TruthBadge } from './TruthBadge'
import { Card, FieldRow, WarningBanner, StaggerItem, StaggerList } from './shared'

const GROUP_ORDER = ['School', 'Business', 'Projects']

export function WorkTab({
  section,
  workLedger,
}: {
  section: DemoSection
  workLedger: WorkLedger
}) {
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: workLedger.items.filter((item) => item.subspace === group),
  }))

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
          <Briefcase className="w-4 h-4" style={{ color: '#ffc84a' }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm" style={{ color: 'rgba(192,232,240,0.92)' }}>{section.title}</p>
            <TruthBadge label={section.status} />
          </div>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(192,232,240,0.38)' }}>
            Canonical demand ledger that Time consumes. Real current work only, no fake sync.
          </p>
        </div>
      </div>

      <StaggerList>
        <StaggerItem>
          <Card title="LEDGER RULES" accent="rgba(255,200,74,0.3)">
            <div className="grid grid-cols-1 gap-1.5 xl:grid-cols-2">
              {workLedger.rules.map((rule, index) => (
                <p key={index} className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.58)' }}>
                  {rule}
                </p>
              ))}
            </div>
          </Card>
        </StaggerItem>

        {grouped.map(({ group, items }) => (
          <StaggerItem key={group}>
            <Card title={`${group.toUpperCase()} SUBSPACE`} accent={group === 'Projects' ? 'rgba(0,212,255,0.2)' : 'rgba(192,232,240,0.12)'}>
              {items.length === 0 ? (
                <p className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.42)' }}>
                  {group === 'School' ? workLedger.schoolGap : group === 'Business' ? workLedger.businessGap : 'No items present.'}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {items.map((item) => (
                    <div
                      key={item.itemId}
                      className="rounded-lg px-4 py-3"
                      style={{
                        background: 'rgba(0,212,255,0.025)',
                        border: '1px solid rgba(0,212,255,0.08)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-mono leading-snug" style={{ color: 'rgba(192,232,240,0.88)' }}>
                            {item.title}
                          </p>
                          <p className="mt-1 text-[9px] font-mono" style={{ color: 'rgba(0,212,255,0.46)' }}>
                            {item.itemId}
                          </p>
                        </div>
                        <span
                          className="rounded px-2 py-0.5 text-[9px] font-mono flex-shrink-0"
                          style={{
                            color: '#ffc84a',
                            background: 'rgba(255,200,74,0.08)',
                            border: '1px solid rgba(255,200,74,0.18)',
                          }}
                        >
                          {item.completionState}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 xl:grid-cols-2">
                        <FieldRow label="Urgency" value={item.urgency} />
                        <FieldRow label="Importance" value={item.importance} />
                        <FieldRow label="Effort" value={item.effortEstimate} />
                        <FieldRow label="Mode" value={item.preferredWorkMode} />
                      </div>

                      <div className="mt-3 rounded px-3 py-2" style={{ background: 'rgba(255,255,255,0.015)' }}>
                        <p className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.58)' }}>
                          {item.partialProgress}
                        </p>
                      </div>

                      <div className="mt-3 flex items-start gap-2">
                        <Link2 className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#00d4ff' }} />
                        <div className="flex flex-wrap gap-1.5">
                          {item.linkedTimeBlocks.map((block) => (
                            <span
                              key={block}
                              className="rounded px-2 py-0.5 text-[9px] font-mono"
                              style={{
                                color: '#00d4ff',
                                background: 'rgba(0,212,255,0.07)',
                                border: '1px solid rgba(0,212,255,0.16)',
                              }}
                            >
                              {block}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </StaggerItem>
        ))}

        {section.warningLabels[0] && (
          <StaggerItem>
            <WarningBanner text={section.warningLabels[0]} />
          </StaggerItem>
        )}
      </StaggerList>
    </div>
  )
}
