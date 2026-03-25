import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Mail,
  Newspaper,
  Sparkles,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface BriefItem { label: string; value: string; color?: string }
interface NewsItem { headline: string; source: string; time: string }
interface EmailItem { sender: string; subject: string; preview: string; important: boolean }
interface SuggestedAction { message: string; level: 'info' | 'warn' | 'urgent' }

// ── Seed data ─────────────────────────────────────────────────────────────────

const BRIEF: BriefItem[] = [
  { label: 'Open tasks', value: '2 remaining today', color: '#ffc84a' },
  { label: 'Next event', value: 'Code review at 10:00', color: '#00d4ff' },
  { label: 'Builder runs', value: '1 completed overnight', color: '#00ff88' },
  { label: 'Automations', value: '4 active, 0 failed', color: '#00ff88' },
]

const NEWS: NewsItem[] = [
  { headline: 'OpenAI releases new model with 200K context', source: 'TechCrunch', time: '2h ago' },
  { headline: 'Apple announces Vision Pro 2 specs', source: 'The Verge', time: '4h ago' },
  { headline: 'Global interest rates hold steady', source: 'Reuters', time: '6h ago' },
  { headline: 'New JARVIS plugin API published', source: 'OpenClaw Blog', time: '1d ago' },
]

const EMAILS: EmailItem[] = [
  { sender: 'GitHub', subject: 'PR #42 approved and merged', preview: 'Your pull request was approved by…', important: true },
  { sender: 'Calendar', subject: 'Reminder: Team sync tomorrow', preview: 'You have a meeting scheduled…', important: false },
  { sender: 'Finance App', subject: 'Monthly statement ready', preview: 'Your October statement is now…', important: false },
]

const SUGGESTIONS: SuggestedAction[] = [
  { message: '2 tasks are due today and still open', level: 'warn' },
  { message: 'Your "Budget Check" automation is disabled', level: 'info' },
  { message: 'No deep work block scheduled for this afternoon', level: 'info' },
]

// ── Concierge Tab ─────────────────────────────────────────────────────────────

export function ConciergeTab() {
  const [running, setRunning] = useState<string | null>(null)
  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  function runQuick(action: string) {
    setRunning(action)
    setTimeout(() => setRunning(null), 2000)
  }

  return (
    <div className="flex flex-col gap-5 px-5 py-4 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: '#00d4ff' }} />
            <h2 className="text-sm font-mono tracking-[0.14em]" style={{ color: 'rgba(192,232,240,0.9)' }}>CONCIERGE</h2>
          </div>
          <p className="text-[9px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.55)' }}>{dateStr} · {now}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: '#00d4ff' }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="text-[9px] font-mono" style={{ color: 'rgba(0,212,255,0.5)' }}>Proactive</span>
        </div>
      </div>

      {/* A. Daily Brief */}
      <Section title="Daily Brief" icon={<Bell className="w-3.5 h-3.5" />} accent="#00d4ff">
        <div className="grid grid-cols-2 gap-2">
          {BRIEF.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(0,212,255,0.07)' }}
            >
              <span className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>{item.label.toUpperCase()}</span>
              <span className="text-[11px] font-mono" style={{ color: item.color ?? 'rgba(192,232,240,0.82)' }}>{item.value}</span>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* E. Quick Commands */}
      <Section title="Quick Commands" icon={<Clock className="w-3.5 h-3.5" />} accent="#ffc84a">
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Plan my day', icon: CalendarDays },
            { label: 'Summarize today', icon: Sparkles },
            { label: 'Check priorities', icon: CheckCircle2 },
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => runQuick(label)}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[10px] font-mono transition-all"
              style={{
                background: running === label ? 'rgba(255,200,74,0.14)' : 'rgba(255,200,74,0.07)',
                border: `1px solid ${running === label ? 'rgba(255,200,74,0.35)' : 'rgba(255,200,74,0.15)'}`,
                color: running === label ? '#ffc84a' : 'rgba(192,232,240,0.65)',
              }}
            >
              <Icon className="w-3 h-3" />
              {running === label ? 'Running…' : label}
            </button>
          ))}
        </div>
      </Section>

      {/* D. Suggested Actions */}
      <Section title="Suggested Actions" icon={<AlertCircle className="w-3.5 h-3.5" />} accent="#ff6b35">
        <div className="space-y-2">
          {SUGGESTIONS.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2"
              style={{
                background: s.level === 'urgent' ? 'rgba(255,107,53,0.08)' : s.level === 'warn' ? 'rgba(255,200,74,0.06)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${s.level === 'urgent' ? 'rgba(255,107,53,0.2)' : s.level === 'warn' ? 'rgba(255,200,74,0.14)' : 'rgba(0,212,255,0.08)'}`,
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: s.level === 'urgent' ? '#ff6b35' : s.level === 'warn' ? '#ffc84a' : '#00d4ff' }}
              />
              <p className="text-[11px] font-mono flex-1" style={{ color: 'rgba(192,232,240,0.75)' }}>{s.message}</p>
              <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(192,232,240,0.25)' }} />
            </motion.div>
          ))}
        </div>
      </Section>

      {/* B. News Summary */}
      <Section title="News Summary" icon={<Newspaper className="w-3.5 h-3.5" />} accent="#9ad1ff">
        <div className="space-y-2">
          {NEWS.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              className="flex items-start gap-2.5 rounded-lg px-3 py-2"
              style={{ background: 'rgba(154,209,255,0.04)', border: '1px solid rgba(154,209,255,0.08)' }}
            >
              <div className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#9ad1ff' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-mono leading-snug" style={{ color: 'rgba(192,232,240,0.8)' }}>{item.headline}</p>
                <p className="text-[8px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.6)' }}>{item.source} · {item.time}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <p className="text-[8px] font-mono mt-2" style={{ color: 'rgba(74,122,138,0.4)' }}>News feed is placeholder — live integration coming</p>
      </Section>

      {/* C. Email Summary */}
      <Section title="Email Summary" icon={<Mail className="w-3.5 h-3.5" />} accent="#c084fc">
        <div className="space-y-2">
          {EMAILS.map((email, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              className="flex items-start gap-2.5 rounded-lg px-3 py-2"
              style={{
                background: email.important ? 'rgba(192,132,252,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${email.important ? 'rgba(192,132,252,0.15)' : 'rgba(255,255,255,0.05)'}`,
              }}
            >
              {email.important && <div className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#c084fc' }} />}
              {!email.important && <div className="mt-1 w-1.5 h-1.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono" style={{ color: email.important ? '#c084fc' : 'rgba(192,232,240,0.5)' }}>{email.sender}</span>
                </div>
                <p className="text-[11px] font-mono" style={{ color: 'rgba(192,232,240,0.78)' }}>{email.subject}</p>
                <p className="text-[9px] font-mono mt-0.5 truncate" style={{ color: 'rgba(192,232,240,0.4)' }}>{email.preview}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <p className="text-[8px] font-mono mt-2" style={{ color: 'rgba(74,122,138,0.4)' }}>Email integration is placeholder — connect your inbox to activate</p>
      </Section>
    </div>
  )
}

function Section({ title, icon, accent, children }: { title: string; icon: React.ReactNode; accent: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-4" style={{ background: 'rgba(4,12,20,0.65)', border: `1px solid ${accent}18` }}>
      <div className="flex items-center gap-2 mb-3" style={{ color: accent }}>
        {icon}
        <span className="text-[9px] font-mono tracking-[0.18em]">{title.toUpperCase()}</span>
        <div className="flex-1 h-px" style={{ background: `${accent}18` }} />
      </div>
      {children}
    </div>
  )
}
