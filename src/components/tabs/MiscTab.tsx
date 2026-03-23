import { useEffect, useMemo, useState } from 'react'
import { Compass, Dices, Sparkles, TimerReset } from 'lucide-react'
import type { DemoSection } from '@/adapters/backend-files'
import { TruthBadge } from './TruthBadge'
import { Card, FieldRow, ItemList, WarningBanner, StaggerItem, StaggerList } from './shared'

const CLOCK_ZONES = [
  { label: 'Local', zone: undefined as string | undefined },
  { label: 'New York', zone: 'America/New_York' },
  { label: 'Dubai', zone: 'Asia/Dubai' },
  { label: 'Tokyo', zone: 'Asia/Tokyo' },
]

const PROMPTS = [
  'Ship one tiny useful improvement before lunch.',
  'Pick the messiest tab and reduce one source of friction.',
  'Rename something confusing and make the whole app calmer.',
  'Document one hidden system rule so future-you stops guessing.',
  'Turn one manual step into a reusable tool or preset.',
]

const CODENAMES = ['NOVA-7', 'EMBER-12', 'POLAR-3', 'ORBIT-9', 'HALCYON-4', 'VECTOR-1']
const FOCUS_PRESETS = [
  { title: 'Deep Build', duration: '52 min', note: 'Silence notifications and finish one hard thing.' },
  { title: 'Admin Sweep', duration: '18 min', note: 'Burn down low-energy tasks fast.' },
  { title: 'Research Sprint', duration: '35 min', note: 'Collect signal, skip perfection.' },
  { title: 'Reset Block', duration: '12 min', note: 'Water, stretch, rewrite the next action clearly.' },
]

function formatClock(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
    hour12: false,
  }).format(date)
}

export function MiscTab({ section }: { section: DemoSection }) {
  const [now, setNow] = useState(() => new Date())
  const [promptIndex, setPromptIndex] = useState(0)
  const [codenameIndex, setCodenameIndex] = useState(0)
  const [presetIndex, setPresetIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const clockRows = useMemo(
    () => CLOCK_ZONES.map((item) => ({ ...item, value: formatClock(now, item.zone) })),
    [now]
  )

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-3 pb-1">
        <div
          className="rounded flex items-center justify-center flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            background: 'rgba(255,200,74,0.08)',
            border: '1px solid rgba(255,200,74,0.2)',
          }}
        >
          <Sparkles className="w-4 h-4" style={{ color: '#ffc84a' }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm" style={{ color: 'rgba(192,232,240,0.92)' }}>{section.title}</p>
            <TruthBadge label={section.status} />
          </div>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(192,232,240,0.38)' }}>
            Local-only utilities and playful experiments that add personality without pretending to be backend magic.
          </p>
        </div>
      </div>

      <StaggerList>
        <StaggerItem>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="WORLD CLOCKS" accent="rgba(0,212,255,0.22)">
              <div className="mb-2 flex items-center gap-2">
                <Compass className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(0,212,255,0.68)' }}>
                  live local utility
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {clockRows.map((clock) => (
                  <div
                    key={clock.label}
                    className="rounded px-3 py-2"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,212,255,0.08)' }}
                  >
                    <FieldRow label={clock.label} value={clock.value} valueColor="#00d4ff" mono />
                  </div>
                ))}
              </div>
            </Card>

            <Card title="SIGNAL ROLL" accent="rgba(255,200,74,0.22)">
              <div className="mb-2 flex items-center gap-2">
                <Dices className="w-3.5 h-3.5" style={{ color: '#ffc84a' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(255,200,74,0.72)' }}>
                  local randomizer
                </span>
              </div>
              <FieldRow label="Codename" value={CODENAMES[codenameIndex]} valueColor="#ffc84a" mono />
              <p className="mt-1 text-[11px] leading-snug" style={{ color: 'rgba(192,232,240,0.76)' }}>
                {PROMPTS[promptIndex]}
              </p>
              <button
                onClick={() => {
                  setPromptIndex(Math.floor(Math.random() * PROMPTS.length))
                  setCodenameIndex(Math.floor(Math.random() * CODENAMES.length))
                }}
                className="mt-2 rounded px-3 py-2 text-[10px] font-mono"
                style={{
                  background: 'rgba(255,200,74,0.08)',
                  border: '1px solid rgba(255,200,74,0.18)',
                  color: '#ffc84a',
                  alignSelf: 'flex-start',
                }}
              >
                ROLL NEW SIGNAL
              </button>
            </Card>
          </div>
        </StaggerItem>

        <StaggerItem>
          <Card title="FOCUS PRESET GENERATOR" accent="rgba(0,255,136,0.22)">
            <div className="mb-2 flex items-center gap-2">
              <TimerReset className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
              <span className="text-[10px] font-mono" style={{ color: 'rgba(0,255,136,0.68)' }}>
                quick session chooser
              </span>
            </div>
            <div className="rounded px-3 py-3" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.12)' }}>
              <FieldRow label="Preset" value={FOCUS_PRESETS[presetIndex].title} valueColor="#00ff88" mono />
              <FieldRow label="Length" value={FOCUS_PRESETS[presetIndex].duration} mono />
              <p className="mt-2 text-[11px] leading-snug" style={{ color: 'rgba(192,232,240,0.72)' }}>
                {FOCUS_PRESETS[presetIndex].note}
              </p>
            </div>
            <button
              onClick={() => setPresetIndex(Math.floor(Math.random() * FOCUS_PRESETS.length))}
              className="mt-3 rounded px-3 py-2 text-[10px] font-mono"
              style={{
                background: 'rgba(0,255,136,0.08)',
                border: '1px solid rgba(0,255,136,0.18)',
                color: '#00ff88',
                alignSelf: 'flex-start',
              }}
            >
              GENERATE PRESET
            </button>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card title="WHAT THIS TAB IS" accent="rgba(0,212,255,0.16)">
            <ItemList items={section.coreCapabilities} color="#00d4ff" />
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
