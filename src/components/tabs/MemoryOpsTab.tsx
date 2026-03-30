import { useEffect, useState } from 'react'
import { BookOpen, Brain, Search } from 'lucide-react'
import { getMemoryProvider } from '@/integrations/registry/providerRegistry'
import type { GroundedMemoryEntry, MemorySnapshot } from '@/integrations/contracts/providers'
import type { MemoryStoreReport } from '@/shared/memory-types'
import { Card, EmptyPanel, FieldRow, ItemList, PanelHeader } from './shared'

export function MemoryOpsTab() {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null)
  const [searchResults, setSearchResults] = useState<GroundedMemoryEntry[]>([])
  const [storeReport, setStoreReport] = useState<MemoryStoreReport | null>(null)

  useEffect(() => {
    const load = async () => {
      const provider = getMemoryProvider()
      const [snapshotResult, reportResult] = await Promise.all([
        provider.snapshot(),
        provider.storeReport(),
      ])
      if (snapshotResult.ok && snapshotResult.data) setSnapshot(snapshotResult.data)
      if (reportResult.ok && reportResult.data) setStoreReport(reportResult.data)
    }

    void load()
  }, [])

  const handleSearch = async () => {
    const result = await getMemoryProvider().search('brainrepo')
    if (result.ok && result.data) setSearchResults(result.data)
  }

  const handleStageWrite = async () => {
    await getMemoryProvider().write('project', 'Dry-run memory write', 'Stage a memory write inside brainrepo', 'command')
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PanelHeader
        Icon={Brain}
        title="MEMORY"
        sublabel="Structured memory and retrieval grounded in safe-root files"
        iconColor="#00ff88"
        iconBg="rgba(0,255,136,0.10)"
        iconBorder="rgba(0,255,136,0.22)"
      />

      <div className="px-4 py-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card title="MEMORY STACK" accent="rgba(0,255,136,0.24)">
            <FieldRow label="Store" value="brainrepo" valueColor="#00ff88" mono />
            <FieldRow label="Context" value="context-anchor" valueColor="#00ff88" mono />
            <FieldRow label="Write mode" value="staged only" valueColor="#ffc84a" />
          </Card>

          <Card title="SAFE ACTIONS" accent="rgba(0,212,255,0.18)">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void handleSearch()} className="rounded px-3 py-1.5 text-[10px] font-mono" style={{ color: '#00d4ff', border: '1px solid rgba(0,212,255,0.24)', background: 'rgba(0,212,255,0.08)' }}>
                <span className="inline-flex items-center gap-1"><Search className="w-3 h-3" /> Search Memory</span>
              </button>
              <button onClick={() => void handleStageWrite()} className="rounded px-3 py-1.5 text-[10px] font-mono" style={{ color: '#00d4ff', border: '1px solid rgba(0,212,255,0.24)', background: 'rgba(0,212,255,0.08)' }}>
                <span className="inline-flex items-center gap-1"><BookOpen className="w-3 h-3" /> Stage Write</span>
              </button>
            </div>
            <ItemList
              items={[
                'Reads are grounded in SAFE_ROOT',
                'Writes are staged, not committed',
                'Receipts remain part of operational memory',
              ]}
              color="#00d4ff"
            />
          </Card>

          <Card title="STATUS" accent="rgba(255,200,74,0.18)">
            <FieldRow label="Daily note" value={snapshot?.dailyMemoryExists ? 'present' : 'empty'} valueColor={snapshot?.dailyMemoryExists ? '#00ff88' : '#ffc84a'} mono />
            <FieldRow label="Records" value={`${storeReport?.totalRecords ?? 0}`} valueColor="#ffc84a" mono />
            <FieldRow label="Receipts" value={`${snapshot?.operationalReceipts.length ?? 0}`} valueColor="#ffc84a" mono />
            {storeReport && storeReport.domains.length > 0 && storeReport.domains.map((d) => (
              <FieldRow key={d.domain} label={d.domain} value={`${d.count}`} valueColor="#00ff88" mono />
            ))}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card title="RECENT MEMORY" accent="rgba(0,255,136,0.18)">
            {snapshot && snapshot.recentSummary.length > 0 ? (
              <ItemList items={snapshot.recentSummary} color="#00ff88" />
            ) : (
              <EmptyPanel title="No recent memory lines yet" note="brainrepo and context-anchor are mounted, but no user memory has been written into SAFE_ROOT yet." />
            )}
          </Card>

          <Card title="SEARCH RESULTS" accent="rgba(0,212,255,0.18)">
            {searchResults.length > 0 ? (
              <ItemList items={searchResults.map((entry) => `${entry.title} · ${entry.source}`)} color="#00d4ff" />
            ) : (
              <EmptyPanel title="No search results yet" note="Run a memory search or start writing grounded notes once dry run is lifted." />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
