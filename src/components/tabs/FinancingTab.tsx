import { useMemo, useState } from 'react'
import { Landmark, PieChart, TrendingUp, Wallet } from 'lucide-react'
import type { DemoSection } from '@/adapters/backend-files'
import { TruthBadge } from './TruthBadge'
import { Card, FieldRow, ItemList, WarningBanner, StaggerItem, StaggerList } from './shared'

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0)
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value))
}

export function FinancingTab({ section }: { section: DemoSection }) {
  const [cashReserve, setCashReserve] = useState(24000)
  const [monthlyBurn, setMonthlyBurn] = useState(3200)
  const [monthlyOffset, setMonthlyOffset] = useState(900)
  const [startingCapital, setStartingCapital] = useState(12000)
  const [monthlyContribution, setMonthlyContribution] = useState(500)
  const [annualRate, setAnnualRate] = useState(8)
  const [years, setYears] = useState(5)
  const [emergencyPct, setEmergencyPct] = useState(35)
  const [growthPct, setGrowthPct] = useState(45)
  const [opsPct, setOpsPct] = useState(20)

  const netBurn = Math.max(monthlyBurn - monthlyOffset, 0)
  const runwayMonths = netBurn > 0 ? cashReserve / netBurn : Number.POSITIVE_INFINITY

  const compoundProjection = useMemo(() => {
    const monthlyRate = annualRate / 100 / 12
    const periods = years * 12
    let total = startingCapital
    for (let i = 0; i < periods; i += 1) {
      total = total * (1 + monthlyRate) + monthlyContribution
    }
    const contributions = startingCapital + monthlyContribution * periods
    const growth = Math.max(total - contributions, 0)
    return { total, contributions, growth }
  }, [annualRate, monthlyContribution, startingCapital, years])

  const allocation = useMemo(() => {
    const total = emergencyPct + growthPct + opsPct || 1
    return {
      emergency: (emergencyPct / total) * 100,
      growth: (growthPct / total) * 100,
      ops: (opsPct / total) * 100,
    }
  }, [emergencyPct, growthPct, opsPct])

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-3 pb-1">
        <div
          className="rounded flex items-center justify-center flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.18)',
          }}
        >
          <Landmark className="w-4 h-4" style={{ color: '#00d4ff' }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm" style={{ color: 'rgba(192,232,240,0.92)' }}>{section.title}</p>
            <TruthBadge label={section.status} />
          </div>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(192,232,240,0.38)' }}>
            Local finance planning tools with no fake bank sync, market feed, or brokerage execution.
          </p>
        </div>
      </div>

      <StaggerList>
        <StaggerItem>
          <Card title="FINANCE MODE" accent="rgba(0,212,255,0.24)">
            <FieldRow label="Mode" value="Local-only calculators" valueColor="#00d4ff" />
            <FieldRow label="Market feed" value="Unavailable" valueColor="#ff6b35" />
            <FieldRow label="Account sync" value="Unavailable" valueColor="#ff6b35" />
            <FieldRow label="Orders" value="Not supported" valueColor="#ff6b35" />
            <div className="mt-3">
              <ItemList items={section.coreCapabilities} color="#00d4ff" />
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="RUNWAY ESTIMATOR" accent="rgba(0,255,136,0.22)">
              <div className="mb-1 flex items-center gap-2">
                <Wallet className="w-3.5 h-3.5" style={{ color: '#00ff88' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(0,255,136,0.68)' }}>
                  local planning widget
                </span>
              </div>
              <NumberField label="Cash reserve" value={cashReserve} onChange={setCashReserve} step={500} />
              <NumberField label="Monthly burn" value={monthlyBurn} onChange={setMonthlyBurn} step={100} />
              <NumberField label="Monthly offset" value={monthlyOffset} onChange={setMonthlyOffset} step={100} />
              <div className="mt-2 rounded px-3 py-2" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.12)' }}>
                <FieldRow label="Net burn" value={money(netBurn)} valueColor="#00ff88" mono />
                <FieldRow
                  label="Runway"
                  value={Number.isFinite(runwayMonths) ? `${runwayMonths.toFixed(1)} months` : 'No burn detected'}
                  valueColor={runwayMonths > 9 ? '#00ff88' : runwayMonths > 4 ? '#ffc84a' : '#ff6b35'}
                  mono
                />
              </div>
            </Card>

            <Card title="COMPOUND PREVIEW" accent="rgba(0,212,255,0.22)">
              <div className="mb-1 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" style={{ color: '#00d4ff' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(0,212,255,0.68)' }}>
                  monthly compounding model
                </span>
              </div>
              <NumberField label="Starting capital" value={startingCapital} onChange={setStartingCapital} step={500} />
              <NumberField label="Monthly add" value={monthlyContribution} onChange={setMonthlyContribution} step={50} />
              <NumberField label="APR %" value={annualRate} onChange={setAnnualRate} step={0.5} />
              <NumberField label="Years" value={years} onChange={setYears} step={1} />
              <div className="mt-2 rounded px-3 py-2" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.12)' }}>
                <FieldRow label="Projected" value={money(compoundProjection.total)} valueColor="#00d4ff" mono />
                <FieldRow label="Contributed" value={money(compoundProjection.contributions)} mono />
                <FieldRow label="Growth" value={money(compoundProjection.growth)} valueColor="#00ff88" mono />
              </div>
            </Card>
          </div>
        </StaggerItem>

        <StaggerItem>
          <Card title="ALLOCATION MIX" accent="rgba(255,200,74,0.22)">
            <div className="mb-2 flex items-center gap-2">
              <PieChart className="w-3.5 h-3.5" style={{ color: '#ffc84a' }} />
              <span className="text-[10px] font-mono" style={{ color: 'rgba(255,200,74,0.72)' }}>
                normalize your split live
              </span>
            </div>
            <SliderField label="Emergency" value={emergencyPct} onChange={setEmergencyPct} color="#00ff88" />
            <SliderField label="Growth" value={growthPct} onChange={setGrowthPct} color="#00d4ff" />
            <SliderField label="Ops" value={opsPct} onChange={setOpsPct} color="#ffc84a" />
            <div className="mt-2 overflow-hidden rounded-full" style={{ height: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.08)' }}>
              <div className="flex h-full">
                <div style={{ width: `${allocation.emergency}%`, background: 'linear-gradient(90deg, rgba(0,255,136,0.5), rgba(0,255,136,0.88))' }} />
                <div style={{ width: `${allocation.growth}%`, background: 'linear-gradient(90deg, rgba(0,212,255,0.5), rgba(0,212,255,0.88))' }} />
                <div style={{ width: `${allocation.ops}%`, background: 'linear-gradient(90deg, rgba(255,200,74,0.46), rgba(255,200,74,0.88))' }} />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
              <MiniStat label="Emergency" value={`${allocation.emergency.toFixed(0)}%`} color="#00ff88" />
              <MiniStat label="Growth" value={`${allocation.growth.toFixed(0)}%`} color="#00d4ff" />
              <MiniStat label="Ops" value={`${allocation.ops.toFixed(0)}%`} color="#ffc84a" />
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

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step: number
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.46)' }}>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="w-[128px] rounded px-2 py-1 text-right text-[10px] font-mono outline-none"
        style={{
          background: 'rgba(2,12,18,0.9)',
          color: 'rgba(192,232,240,0.88)',
          border: '1px solid rgba(0,212,255,0.14)',
        }}
      />
    </label>
  )
}

function SliderField({
  label,
  value,
  onChange,
  color,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  color: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.46)' }}>{label}</span>
        <span className="text-[10px] font-mono" style={{ color }}>{clampPercent(value)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={clampPercent(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ accentColor: color }}
      />
    </label>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,212,255,0.08)' }}>
      <p className="text-[9px] font-mono tracking-[0.14em]" style={{ color: 'rgba(192,232,240,0.4)' }}>{label.toUpperCase()}</p>
      <p className="mt-1 text-[13px] font-mono" style={{ color }}>{value}</p>
    </div>
  )
}
