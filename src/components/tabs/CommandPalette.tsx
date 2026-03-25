import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from 'lucide-react'
import type { AgentPersonaId } from '@/adapters/agent-control'
import { useMissionHandoffStore } from '@/store/mission-handoff'
import { useBuilderExecutionRequestStore } from '@/store/builder-execution-request'
import { useBuilderExecutionStore } from '@/store/builder-execution'

// ── Command model ──────────────────────────────────────────────────────────────

interface PaletteCommand {
  id:       string
  label:    string
  hint?:    string
  category: 'NAVIGATION' | 'MISSION' | 'BATCH'
  action:   () => void
}

// ── Category accent ────────────────────────────────────────────────────────────

const CAT_COLOR: Record<PaletteCommand['category'], string> = {
  NAVIGATION: 'rgba(154,209,255,0.50)',
  MISSION:    'rgba(0,212,255,0.55)',
  BATCH:      'rgba(0,255,136,0.50)',
}

// ── Agents ────────────────────────────────────────────────────────────────────

const AGENTS: Array<{ id: AgentPersonaId; name: string }> = [
  { id: 'researcher', name: 'Bruce'   },
  { id: 'alex',       name: 'Tony'    },
  { id: 'kai',        name: 'Steve'   },
  { id: 'maya',       name: 'Natasha' },
  { id: 'noah',       name: 'Nick'    },
]

// ── Main component ─────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open,      setOpen]      = useState(false)
  const [query,     setQuery]     = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  // ── Store selectors ──────────────────────────────────────────────────────────
  const navigateToAgent  = useMissionHandoffStore(s => s.navigateToAgent)
  const handoffQueue     = useMissionHandoffStore(s => s.handoffQueue)
  const activeHandoff    = useMissionHandoffStore(s => s.activeHandoff)
  const setActiveHandoff = useMissionHandoffStore(s => s.setActiveHandoff)

  const request      = useBuilderExecutionRequestStore(s => s.request)
  const requestQueue = useBuilderExecutionRequestStore(s => s.requestQueue)
  const batchApprove = useBuilderExecutionRequestStore(s => s.batchApprove)

  const batchStart = useBuilderExecutionStore(s => s.batchStart)

  // ── Derived command list ─────────────────────────────────────────────────────
  const commands = useMemo<PaletteCommand[]>(() => {
    const close = () => setOpen(false)
    const cmds: PaletteCommand[] = []

    // ── Navigation ─────────────────────────────────────────────────────────────
    for (const agent of AGENTS) {
      cmds.push({
        id:       `nav-${agent.id}`,
        label:    `Go to ${agent.name}`,
        category: 'NAVIGATION',
        action:   () => { navigateToAgent(agent.id); close() },
      })
    }

    // ── Mission ────────────────────────────────────────────────────────────────
    // "Open next mission" — only when queue has a standby item
    if (activeHandoff === null && handoffQueue.length > 0) {
      const next = handoffQueue[0]
      cmds.push({
        id:       'mission-next',
        label:    'Open next mission',
        hint:     `${next.agentName}  ·  ${next.missionText.slice(0, 48)}${next.missionText.length > 48 ? '…' : ''}`,
        category: 'MISSION',
        action:   () => { setActiveHandoff(next); navigateToAgent(next.agentId); close() },
      })
    }

    // ── Batch ──────────────────────────────────────────────────────────────────
    // Approve all — only when there are requests awaiting approval
    const awaitingCount = [
      request?.approvalState === 'awaiting-approval' ? 1 : 0,
      requestQueue.filter(r => r.approvalState === 'awaiting-approval').length,
    ].reduce((a, b) => a + b, 0)

    if (awaitingCount > 0) {
      cmds.push({
        id:       'batch-approve',
        label:    `Approve all requests`,
        hint:     `${awaitingCount} awaiting`,
        category: 'BATCH',
        action:   () => { void batchApprove(); navigateToAgent('kai'); close() },
      })
    }

    // Start all approved — only when there are approved requests
    const approvedRequests = [
      ...(request?.approvalState === 'approved' ? [request] : []),
      ...requestQueue.filter(r => r.approvalState === 'approved'),
    ]

    if (approvedRequests.length > 0) {
      cmds.push({
        id:       'batch-start',
        label:    `Start all approved`,
        hint:     `${approvedRequests.length} ready`,
        category: 'BATCH',
        action:   () => { void batchStart(approvedRequests); navigateToAgent('kai'); close() },
      })
    }

    // Verify all runs — navigate to Maya where batch verify button exists
    cmds.push({
      id:       'batch-verify',
      label:    'Verify all runs',
      hint:     'Go to Maya',
      category: 'BATCH',
      action:   () => { navigateToAgent('maya'); close() },
    })

    // Create remediations — navigate to Kai where batch remediate button exists
    cmds.push({
      id:       'batch-remediate',
      label:    'Create remediations',
      hint:     'Go to Kai',
      category: 'BATCH',
      action:   () => { navigateToAgent('kai'); close() },
    })

    return cmds
  }, [
    navigateToAgent,
    handoffQueue, activeHandoff, setActiveHandoff,
    request, requestQueue, batchApprove,
    batchStart,
  ])

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return commands
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      (c.hint ?? '').toLowerCase().includes(q)
    )
  }, [commands, query])

  // Reset index when query or open state changes
  useEffect(() => { setActiveIdx(0) }, [query, open])

  // ── Global ⌘K / Ctrl+K ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input when opened; clear query
  useEffect(() => {
    if (open) {
      setQuery('')
      // Defer so the element is mounted
      const id = setTimeout(() => inputRef.current?.focus(), 16)
      return () => clearTimeout(id)
    }
  }, [open])

  // ── Keyboard navigation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx(i => {
          const next = Math.min(i + 1, filtered.length - 1)
          scrollToIdx(next)
          return next
        })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx(i => {
          const next = Math.max(i - 1, 0)
          scrollToIdx(next)
          return next
        })
        return
      }
      if (e.key === 'Enter') {
        const cmd = filtered[activeIdx]
        if (cmd) cmd.action()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, filtered, activeIdx])

  function scrollToIdx(idx: number) {
    const list = listRef.current
    if (!list) return
    const item = list.querySelector(`[data-idx="${idx}"]`) as HTMLElement | null
    item?.scrollIntoView({ block: 'nearest' })
  }

  // ── Group by category for rendering ─────────────────────────────────────────
  const categories = useMemo(
    () => [...new Set(filtered.map(c => c.category))] as PaletteCommand['category'][],
    [filtered]
  )

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)' }}
        onClick={() => setOpen(false)}
      />

      {/* Palette modal */}
      <div
        className="fixed left-1/2 z-[70] flex flex-col overflow-hidden rounded-2xl"
        style={{
          top:        '28%',
          transform:  'translate(-50%, -50%)',
          width:      'min(580px, 92vw)',
          maxHeight:  '58vh',
          background: 'rgba(4,10,18,0.98)',
          border:     '1px solid rgba(0,212,255,0.20)',
          boxShadow:  '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,212,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* ── Input row ─────────────────────────────────────────────────────── */}
        <div
          className="flex flex-shrink-0 items-center gap-3 px-4 py-3.5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <Terminal className="h-4 w-4 flex-shrink-0" style={{ color: 'rgba(0,212,255,0.65)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command…"
            className="min-w-0 flex-1 bg-transparent text-[13px] leading-none outline-none"
            style={{
              color:      'rgba(244,248,252,0.93)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              caretColor: '#00d4ff',
            }}
          />
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <kbd
              className="rounded px-1.5 py-0.5 text-[8px] font-mono"
              style={{
                color:      'rgba(192,232,240,0.32)',
                background: 'rgba(255,255,255,0.05)',
                border:     '1px solid rgba(255,255,255,0.09)',
              }}
            >
              ↑↓
            </kbd>
            <kbd
              className="rounded px-1.5 py-0.5 text-[8px] font-mono"
              style={{
                color:      'rgba(192,232,240,0.32)',
                background: 'rgba(255,255,255,0.05)',
                border:     '1px solid rgba(255,255,255,0.09)',
              }}
            >
              ESC
            </kbd>
          </div>
        </div>

        {/* ── Command list ──────────────────────────────────────────────────── */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p
              className="px-4 py-8 text-center text-[11px] font-mono"
              style={{ color: 'rgba(192,232,240,0.28)' }}
            >
              No commands match.
            </p>
          ) : (
            categories.map(cat => {
              const catCmds = filtered.filter(c => c.category === cat)

              return (
                <div key={cat}>
                  {/* Category label */}
                  <div className="flex items-center gap-2 px-4 pb-1 pt-2">
                    <span
                      className="text-[8px] font-mono tracking-[0.20em]"
                      style={{ color: CAT_COLOR[cat] }}
                    >
                      {cat}
                    </span>
                  </div>

                  {/* Commands in category */}
                  {catCmds.map(cmd => {
                    const globalIdx = filtered.indexOf(cmd)
                    const isActive  = globalIdx === activeIdx

                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        data-idx={globalIdx}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                        onClick={cmd.action}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                        style={{
                          background:  isActive ? 'rgba(0,212,255,0.07)' : 'transparent',
                          borderLeft:  `2px solid ${isActive ? 'rgba(0,212,255,0.40)' : 'transparent'}`,
                          cursor:      'pointer',
                          transition:  'background 0.07s',
                        }}
                      >
                        <span
                          className="min-w-0 flex-1 text-[12px] leading-snug"
                          style={{ color: isActive ? 'rgba(244,248,252,0.96)' : 'rgba(192,232,240,0.72)' }}
                        >
                          {cmd.label}
                        </span>

                        {cmd.hint && (
                          <span
                            className="flex-shrink-0 text-[10px] font-mono leading-none"
                            style={{ color: isActive ? 'rgba(0,212,255,0.60)' : 'rgba(192,232,240,0.28)' }}
                          >
                            {cmd.hint}
                          </span>
                        )}

                        {isActive && (
                          <kbd
                            className="ml-1 flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono"
                            style={{
                              color:      'rgba(0,212,255,0.55)',
                              background: 'rgba(0,212,255,0.07)',
                              border:     '1px solid rgba(0,212,255,0.16)',
                            }}
                          >
                            ↵
                          </kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div
          className="flex flex-shrink-0 items-center justify-between px-4 py-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <span className="text-[8px] font-mono tracking-[0.14em]" style={{ color: 'rgba(192,232,240,0.20)' }}>
            ⌘K  COMMAND PALETTE
          </span>
          <span className="text-[8px] font-mono" style={{ color: 'rgba(192,232,240,0.20)' }}>
            {filtered.length} command{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </>
  )
}
