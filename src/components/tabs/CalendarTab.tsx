import { ArrowRight, CalendarDays, Clock3 } from 'lucide-react'
import type { DemoSection } from '@/adapters/backend-files'
import { TruthBadge } from './TruthBadge'
import { Card, FutureBanner, ItemList, StaggerItem, StaggerList } from './shared'

export function CalendarTab({
  section,
  calendarState,
}: {
  section: DemoSection
  calendarState: string[]
}) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-3 pb-1">
        <div
          className="rounded flex items-center justify-center flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            background: 'rgba(192,232,240,0.04)',
            border: '1px solid rgba(192,232,240,0.12)',
          }}
        >
          <CalendarDays className="w-4 h-4" style={{ color: 'rgba(192,232,240,0.52)' }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm" style={{ color: 'rgba(192,232,240,0.92)' }}>{section.title}</p>
            <TruthBadge label={section.status} />
          </div>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(192,232,240,0.38)' }}>
            Future output surface only. Time remains the current planning brain.
          </p>
        </div>
      </div>

      <StaggerList>
        <StaggerItem>
          <div
            className="rounded-xl px-6 py-8 text-center"
            style={{
              background: 'rgba(192,232,240,0.02)',
              border: '1px solid rgba(192,232,240,0.08)',
            }}
          >
            <p className="text-[12px] font-mono tracking-[0.18em]" style={{ color: 'rgba(192,232,240,0.54)' }}>
              CALENDAR IS NOT LIVE
            </p>
            <p className="mt-2 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.42)' }}>
              This demo does not imply sync, read access, write access, or external event ownership.
            </p>
          </div>
        </StaggerItem>

        <StaggerItem>
          <Card title="TIME -> CALENDAR RELATIONSHIP" accent="rgba(192,232,240,0.14)">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4" style={{ color: '#ffc84a' }} />
                <span className="text-[10px] font-mono" style={{ color: '#ffc84a' }}>TIME</span>
              </div>
              <ArrowRight className="h-4 w-4" style={{ color: 'rgba(192,232,240,0.26)' }} />
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" style={{ color: 'rgba(192,232,240,0.46)' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.46)' }}>CALENDAR</span>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.58)' }}>
              Time produces candidate placement and internal scheduling logic. Calendar is the eventual confirmation and integration surface once a real backend is connected.
            </p>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="CURRENT STATE" accent="rgba(192,232,240,0.12)">
              <ItemList items={calendarState} color="rgba(192,232,240,0.5)" />
            </Card>
            <Card title="BLOCKED / FUTURE" accent="rgba(255,107,53,0.16)">
              <ItemList items={section.blockedCapabilities} color="#ff6b35" />
            </Card>
          </div>
        </StaggerItem>

        <StaggerItem>
          <FutureBanner text={section.warningLabels[0] ?? 'Calendar is not live; Time is generating conceptual schedules only.'} />
        </StaggerItem>
      </StaggerList>
    </div>
  )
}
