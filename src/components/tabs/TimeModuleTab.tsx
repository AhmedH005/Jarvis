import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, Plus, Repeat, TimerReset } from 'lucide-react'
import { getCalendarProvider } from '@/integrations/registry/providerRegistry'
import type { ComposedCalendarProvider } from '@/integrations/providers/calendar-provider'
import type { ComposedAdapterReport } from '@/integrations/adapters/calendar/adapter-types'
import { loadTimeRuntimeSnapshot, type TimeRuntimeSnapshot } from '@/features/modules/runtimeViews'
import { useActionRuntimeStore } from '@/store/action-runtime'
import { Card, EmptyPanel, FieldRow, ItemList, PanelHeader } from './shared'

const EMPTY_TIME_SNAPSHOT: TimeRuntimeSnapshot = {
  events: [],
  automations: [],
}

export function TimeModuleTab() {
  const [data, setData] = useState<TimeRuntimeSnapshot>(EMPTY_TIME_SNAPSHOT)
  const [providerNote, setProviderNote] = useState<string>('Loading…')
  const [adapterReport, setAdapterReport] = useState<ComposedAdapterReport | null>(null)
  const actions = useActionRuntimeStore((state) => state.actions.filter((action) => action.domain === 'calendar').slice(0, 6))

  useEffect(() => {
    const load = async () => {
      const provider = getCalendarProvider()
      const [desc, runtimeData] = await Promise.all([
        provider.describe(),
        loadTimeRuntimeSnapshot(),
      ])
      setProviderNote(desc.health.detail)
      setData(runtimeData)

      // Surface per-adapter status if available (ComposedCalendarProvider)
      const composed = provider as unknown as ComposedCalendarProvider
      if (typeof composed.adapterStatus === 'function') {
        const report = await composed.adapterStatus().catch(() => null)
        setAdapterReport(report)
      }
    }

    void load()
  }, [])

  const stageEvent = async () => {
    await getCalendarProvider().createEvent({
      title: 'Dry-run calendar event',
      start: new Date().toISOString(),
      end: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      source: 'jarvis',
    })
  }

  const stageRecurring = async () => {
    await getCalendarProvider().createRecurringEvents(
      {
        title: 'Dry-run recurring automation',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        source: 'jarvis',
      },
      { frequency: 'weekly', interval: 1 },
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PanelHeader
        Icon={Clock3}
        title="TIME"
        sublabel="Scheduling, tasks, and recurring automations through cross-platform providers"
        iconColor="#ffc84a"
        iconBg="rgba(255,200,74,0.10)"
        iconBorder="rgba(255,200,74,0.22)"
      />

      <div className="px-4 py-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card title="TIME BACKBONE" accent="rgba(255,200,74,0.24)">
            {adapterReport ? (
              <>
                <FieldRow
                  label="Active adapter"
                  value={adapterReport.activeAdapter.toUpperCase()}
                  valueColor="#ffc84a"
                  mono
                />
                {adapterReport.adapters.map((a) => (
                  <FieldRow
                    key={a.adapter}
                    label={a.adapter}
                    value={a.liveStatus}
                    valueColor={
                      a.liveStatus === 'LIVE' || a.liveStatus === 'LIVE_READ_ONLY'
                        ? '#00ff88'
                        : a.liveStatus.startsWith('WIRED')
                        ? '#ffc84a'
                        : 'rgba(192,232,240,0.55)'
                    }
                    mono
                  />
                ))}
              </>
            ) : (
              <>
                <FieldRow label="Calendar" value="advanced-calendar" valueColor="#ffc84a" mono />
                <FieldRow label="Recurring jobs" value="cron-scheduling" valueColor="#ffc84a" mono />
              </>
            )}
            <p className="text-[10px] leading-snug mt-1" style={{ color: 'rgba(192,232,240,0.55)' }}>
              {providerNote}
            </p>
          </Card>

          <Card title="SAFE ACTIONS" accent="rgba(0,212,255,0.18)">
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => void stageEvent()} className="rounded px-3 py-1.5 text-[10px] font-mono" style={{ color: '#00d4ff', border: '1px solid rgba(0,212,255,0.24)', background: 'rgba(0,212,255,0.08)' }}>
                <span className="inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Stage Event</span>
              </button>
              <button onClick={() => void stageRecurring()} className="rounded px-3 py-1.5 text-[10px] font-mono" style={{ color: '#00d4ff', border: '1px solid rgba(0,212,255,0.24)', background: 'rgba(0,212,255,0.08)' }}>
                <span className="inline-flex items-center gap-1"><Repeat className="w-3 h-3" /> Stage Recurring</span>
              </button>
            </div>
            <ItemList
              items={[
                'All writes return Blocked (dry run)',
                'No seeded tasks or fake automations remain',
              ]}
              color="#00d4ff"
            />
          </Card>

          <Card title="SAFE RUNTIME" accent="rgba(0,255,136,0.18)">
            <FieldRow label="Events" value={`${data.events.length}`} valueColor="#00ff88" mono />
            <FieldRow label="Automations" value={`${data.automations.length}`} valueColor="#00ff88" mono />
            <FieldRow label="Tasks" value="unified into Time actions" valueColor="#00ff88" />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card title="SCHEDULE" accent="rgba(255,200,74,0.18)">
            {data.events.length > 0 ? (
              <ItemList
                items={data.events.map((event) => `${event.title} · ${event.start}`)}
                color="#ffc84a"
              />
            ) : (
              <EmptyPanel
                icon={CalendarDays}
                title="No safe-root events yet"
                note="Once a real time provider is wired, this room will read live schedule data instead of seeded planner items."
              />
            )}
          </Card>

          <Card title="RECURRING AUTOMATIONS" accent="rgba(0,212,255,0.18)">
            {data.automations.length > 0 ? (
              <ItemList
                items={data.automations.map((job) => `${job.label} · ${job.schedule} · ${job.state}`)}
                color="#00d4ff"
              />
            ) : (
              <EmptyPanel
                icon={TimerReset}
                title="No recurring jobs staged yet"
                note="cron-scheduling is selected, but Jarvis will not create or run jobs until dry run is disabled."
              />
            )}
          </Card>
        </div>

        <Card title="TIME ACTION LOG" accent="rgba(255,200,74,0.16)">
          {actions.length > 0 ? (
            <ItemList
              items={actions.map((action) => `${action.state.toUpperCase()} · ${action.title} · ${action.summary}`)}
              color="#ffc84a"
            />
          ) : (
            <EmptyPanel
              title="No staged time actions yet"
              note="Use the stage controls above to queue safe time operations."
            />
          )}
        </Card>
      </div>
    </div>
  )
}
