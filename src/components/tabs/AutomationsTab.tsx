import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Pause, Play, Plus, Trash2, X, Zap } from 'lucide-react'

interface Automation {
  id: string
  name: string
  schedule: string      // cron expression or human label
  action: string
  enabled: boolean
  lastRun?: string
  status: 'idle' | 'running' | 'error'
}

const SEED_AUTOMATIONS: Automation[] = [
  { id: 'a1', name: 'Daily Summary',     schedule: '0 8 * * *',  action: 'Send daily brief to JARVIS chat',    enabled: true,  lastRun: new Date(Date.now() - 3600_000).toISOString(), status: 'idle' },
  { id: 'a2', name: 'Weekly Planning',   schedule: '0 9 * * 1',  action: 'Generate weekly task suggestions',   enabled: true,  lastRun: new Date(Date.now() - 86400_000 * 2).toISOString(), status: 'idle' },
  { id: 'a3', name: 'Budget Check',      schedule: '0 20 * * 5', action: 'Summarize weekly spending',          enabled: false, status: 'idle' },
  { id: 'a4', name: 'Health Check',      schedule: '*/5 * * * *',action: 'Ping OpenClaw gateway',              enabled: true,  lastRun: new Date(Date.now() - 60_000).toISOString(),   status: 'idle' },
]

function formatRelative(isoStr?: string) {
  if (!isoStr) return 'Never'
  const diff = Date.now() - new Date(isoStr).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86400_000)}d ago`
}

export function AutomationsTab() {
  const [automations, setAutomations] = useState<Automation[]>(SEED_AUTOMATIONS)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSchedule, setNewSchedule] = useState('0 9 * * *')
  const [newAction, setNewAction] = useState('')

  function toggle(id: string) {
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a))
  }

  function runNow(id: string) {
    setAutomations(prev => prev.map(a =>
      a.id === id ? { ...a, status: 'running', lastRun: new Date().toISOString() } : a
    ))
    setTimeout(() => {
      setAutomations(prev => prev.map(a => a.id === id ? { ...a, status: 'idle' } : a))
    }, 2000)
  }

  function deleteAutomation(id: string) {
    setAutomations(prev => prev.filter(a => a.id !== id))
  }

  function addAutomation() {
    if (!newName.trim() || !newAction.trim()) return
    setAutomations(prev => [...prev, {
      id: `a${Date.now()}`,
      name: newName.trim(),
      schedule: newSchedule.trim(),
      action: newAction.trim(),
      enabled: true,
      status: 'idle',
    }])
    setNewName(''); setNewSchedule('0 9 * * *'); setNewAction('')
    setShowAdd(false)
  }

  const enabled = automations.filter(a => a.enabled).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}
      >
        <div>
          <h2 className="text-sm font-mono tracking-[0.14em]" style={{ color: 'rgba(192,232,240,0.9)' }}>AUTOMATIONS</h2>
          <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.6)' }}>
            {automations.length} total · {enabled} active
          </p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5"
          style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff' }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-[10px] font-mono">New automation</span>
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden flex-shrink-0"
          >
            <div className="px-5 py-4 space-y-3" style={{ background: 'rgba(0,212,255,0.03)', borderBottom: '1px solid rgba(0,212,255,0.08)' }}>
              <div className="flex gap-3">
                <input
                  className="flex-1 rounded-md px-3 py-2 text-sm font-mono outline-none"
                  style={{ background: 'rgba(0,10,20,0.7)', border: '1px solid rgba(0,212,255,0.16)', color: 'rgba(192,232,240,0.9)' }}
                  placeholder="Automation name…"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                />
                <input
                  className="w-44 rounded-md px-3 py-2 text-[11px] font-mono outline-none"
                  style={{ background: 'rgba(0,10,20,0.7)', border: '1px solid rgba(0,212,255,0.16)', color: 'rgba(0,212,255,0.7)' }}
                  placeholder="Cron: 0 9 * * *"
                  value={newSchedule}
                  onChange={e => setNewSchedule(e.target.value)}
                />
              </div>
              <input
                className="w-full rounded-md px-3 py-2 text-[11px] font-mono outline-none"
                style={{ background: 'rgba(0,10,20,0.7)', border: '1px solid rgba(0,212,255,0.10)', color: 'rgba(192,232,240,0.7)' }}
                placeholder="Action description…"
                value={newAction}
                onChange={e => setNewAction(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-md text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.4)' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
                <button onClick={addAutomation} className="px-3 py-1.5 rounded-md text-[10px] font-mono" style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.24)', color: '#00d4ff' }}>
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
        <AnimatePresence initial={false}>
          {automations.map(auto => (
            <motion.div
              key={auto.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
            >
              <div
                className="flex items-center gap-4 rounded-lg px-4 py-3 group"
                style={{
                  background: auto.enabled ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)',
                  border: `1px solid ${auto.enabled ? 'rgba(0,212,255,0.10)' : 'rgba(255,255,255,0.05)'}`,
                  opacity: auto.enabled ? 1 : 0.55,
                }}
              >
                {/* Status dot */}
                <div className="flex-shrink-0">
                  {auto.status === 'running'
                    ? <motion.div className="w-2 h-2 rounded-full" style={{ background: '#00d4ff' }} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.8, repeat: Infinity }} />
                    : <div className="w-2 h-2 rounded-full" style={{ background: auto.enabled ? '#00ff88' : 'rgba(74,122,138,0.4)' }} />
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-mono" style={{ color: 'rgba(192,232,240,0.88)' }}>{auto.name}</p>
                    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,212,255,0.08)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.14)' }}>
                      {auto.schedule}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: 'rgba(192,232,240,0.42)' }}>{auto.action}</p>
                  <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.5)' }}>
                    Last run: {formatRelative(auto.lastRun)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => runNow(auto.id)}
                    disabled={auto.status === 'running'}
                    className="p-1.5 rounded"
                    style={{ color: auto.status === 'running' ? 'rgba(0,212,255,0.3)' : 'rgba(0,212,255,0.55)' }}
                    title="Run now"
                  >
                    {auto.status === 'running'
                      ? <Activity className="w-3.5 h-3.5" />
                      : <Zap className="w-3.5 h-3.5" />
                    }
                  </button>
                  <button onClick={() => toggle(auto.id)} className="p-1.5 rounded" style={{ color: auto.enabled ? 'rgba(0,255,136,0.55)' : 'rgba(192,232,240,0.3)' }} title={auto.enabled ? 'Pause' : 'Enable'}>
                    {auto.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => deleteAutomation(auto.id)} className="p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'rgba(255,107,53,0.45)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
