import { Clock3, FileCode2, ShieldCheck, TerminalSquare } from 'lucide-react'
import type { AgentRunEntry, RunHistorySnapshot } from '@/adapters/run-history'
import { Card, FieldRow, WarningBanner } from './shared'
import { RunStatusBadge } from './RunStatusBadge'

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function MonoList({
  icon: Icon,
  title,
  items,
  accent,
}: {
  icon: typeof FileCode2
  title: string
  items: string[]
  accent: string
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3 w-3" style={{ color: accent }} />
        <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: accent }}>
          {title}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <code
            key={item}
            className="rounded px-2 py-1 text-[10px] leading-snug"
            style={{
              color: 'rgba(192,232,240,0.82)',
              background: 'rgba(4,10,18,0.72)',
              border: '1px solid rgba(0,212,255,0.08)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              wordBreak: 'break-word',
            }}
          >
            {item}
          </code>
        ))}
      </div>
    </div>
  )
}

function RunHistoryRow({ run }: { run: AgentRunEntry }) {
  return (
    <details
      className="rounded"
      style={{
        background: 'rgba(4,10,18,0.62)',
        border: '1px solid rgba(0,212,255,0.08)',
      }}
    >
      <summary
        className="cursor-pointer px-3 py-3"
        style={{ listStyle: 'none' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-mono tracking-[0.18em]" style={{ color: 'rgba(0,212,255,0.68)' }}>
                {run.agent.toUpperCase()}
              </span>
              <span className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.34)' }}>
                {formatTimestamp(run.timestamp)}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug" style={{ color: 'rgba(192,232,240,0.9)' }}>
              {run.taskSummary}
            </p>
            <p className="mt-1 text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.32)' }}>
              Expand for files changed, commands run, and verification.
            </p>
          </div>
          <RunStatusBadge status={run.status} />
        </div>
      </summary>

      <div
        className="px-3 pb-3 pt-1"
        style={{ borderTop: '1px solid rgba(0,212,255,0.06)' }}
      >
        <FieldRow
          label="Verification"
          value={run.verificationResult}
          valueColor="rgba(192,232,240,0.78)"
        />

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <MonoList
            icon={FileCode2}
            title="FILES CHANGED"
            items={run.filesChanged}
            accent="#00d4ff"
          />
          <MonoList
            icon={TerminalSquare}
            title="COMMANDS RUN"
            items={run.commandsRun}
            accent="#ffc84a"
          />
        </div>
      </div>
    </details>
  )
}

export function AgentRunHistoryPanel({ runHistory }: { runHistory: RunHistorySnapshot }) {
  return (
    <Card title="AGENT RUN HISTORY" accent="rgba(0,212,255,0.24)">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#00d4ff' }} />
            <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.8)' }}>
              Recent Planner / Builder / Checker runs
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.4)' }}>
            Expand a run to inspect changed files, executed commands, and recorded verification.
          </p>
        </div>
        <span
          className="rounded px-2 py-1 text-[9px] font-mono tracking-[0.16em]"
          style={{
            color: runHistory.source === 'workspace-log' ? '#00ff88' : '#ffc84a',
            background: runHistory.source === 'workspace-log' ? 'rgba(0,255,136,0.08)' : 'rgba(255,200,74,0.08)',
            border: `1px solid ${runHistory.source === 'workspace-log' ? 'rgba(0,255,136,0.18)' : 'rgba(255,200,74,0.18)'}`,
            flexShrink: 0,
          }}
        >
          {runHistory.sourceLabel.toUpperCase()}
        </span>
      </div>

      {runHistory.note && <WarningBanner text={runHistory.note} />}

      <div
        className="rounded px-3 py-2"
        style={{
          background: 'rgba(0,212,255,0.02)',
          border: '1px solid rgba(0,212,255,0.08)',
        }}
      >
        <div className="flex items-center gap-2">
          <Clock3 className="h-3 w-3" style={{ color: 'rgba(0,212,255,0.56)' }} />
          <span className="text-[9px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,212,255,0.56)' }}>
            SOURCE PATH
          </span>
        </div>
        <code
          className="mt-1 block text-[10px] leading-snug"
          style={{
            color: 'rgba(192,232,240,0.72)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            wordBreak: 'break-all',
          }}
        >
          {runHistory.sourcePath}
        </code>
      </div>

      {runHistory.runs.length === 0 ? (
        <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.38)' }}>
          No agent runs available yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {runHistory.runs.map((run) => (
            <RunHistoryRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </Card>
  )
}
