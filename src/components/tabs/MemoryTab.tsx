import { BookOpen, Brain, History } from 'lucide-react'
import type { DemoSection, MemorySnapshot } from '@/adapters/backend-files'
import { TruthBadge } from './TruthBadge'
import { Card, FieldRow, ItemList, WarningBanner, StaggerItem, StaggerList } from './shared'

function pathBasename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

export function MemoryTab({
  section,
  memory,
}: {
  section: DemoSection
  memory: MemorySnapshot
}) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-center gap-3 pb-1">
        <div
          className="rounded flex items-center justify-center flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            background: 'rgba(0,255,136,0.08)',
            border: '1px solid rgba(0,255,136,0.2)',
          }}
        >
          <Brain className="w-4 h-4" style={{ color: '#00ff88' }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm" style={{ color: 'rgba(192,232,240,0.92)' }}>{section.title}</p>
            <TruthBadge label={section.status} />
          </div>
          <p className="text-[10px] font-mono mt-0.5" style={{ color: 'rgba(192,232,240,0.38)' }}>
            Live retrieval surface backed by current workspace memory and documented memory rules.
          </p>
        </div>
      </div>

      <StaggerList>
        <StaggerItem>
          <Card title="MEMORY STATUS" accent="rgba(0,255,136,0.3)">
            <FieldRow label="Provider" value="Local embeddings" valueColor="#00ff88" />
            <FieldRow label="Daily note" value={memory.dailyMemoryExists ? 'Present' : 'Missing'} valueColor={memory.dailyMemoryExists ? '#00ff88' : '#ffc84a'} />
            <FieldRow label="Path" value={memory.dailyMemoryPath} mono />
            <div className="mt-3">
              <ItemList items={memory.stateLines} color="#00ff88" />
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="RECENT MEMORY SUMMARY" accent="rgba(0,212,255,0.18)">
              <div className="mb-2 flex items-center gap-1.5">
                <History className="w-3 h-3" style={{ color: '#00d4ff' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(0,212,255,0.58)' }}>
                  memory/{pathBasename(memory.dailyMemoryPath)}
                </span>
              </div>
              {memory.recentSummary.length > 0 ? (
                <ItemList items={memory.recentSummary.slice(0, 10)} color="#00d4ff" />
              ) : (
                <p className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.42)' }}>
                  No daily memory note was found at the current source path.
                </p>
              )}
            </Card>

            <Card title="DECISIONS / CONTEXT" accent="rgba(0,255,136,0.2)">
              <div className="mb-2 flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" style={{ color: '#00ff88' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(0,255,136,0.58)' }}>
                  shared/decisions.md
                </span>
              </div>
              <ItemList items={memory.decisions.slice(0, 8)} color="#00ff88" />
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
