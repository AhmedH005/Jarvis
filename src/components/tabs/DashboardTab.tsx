import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Apple,
  CheckCircle2,
  Circle,
  DollarSign,
  Dumbbell,
  Heart,
  Plus,
  Settings,
  TrendingDown,
  TrendingUp,
  Utensils,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FinanceEntry { category: string; amount: number; trend: 'up' | 'down' | 'flat'; color: string }
interface Meal { id: string; name: string; calories: number; time: string; macros: { p: number; c: number; f: number } }
interface Preference { key: string; label: string; value: string; type: 'text' | 'toggle' | 'select'; options?: string[] }

// ── Seed data ─────────────────────────────────────────────────────────────────

const FINANCE: FinanceEntry[] = [
  { category: 'Rent', amount: 1800, trend: 'flat', color: '#4a7a8a' },
  { category: 'Food', amount: 340, trend: 'up', color: '#ffc84a' },
  { category: 'Transport', amount: 120, trend: 'down', color: '#00ff88' },
  { category: 'Subscriptions', amount: 89, trend: 'flat', color: '#9ad1ff' },
  { category: 'Misc', amount: 210, trend: 'up', color: '#ff6b35' },
]

const MEALS: Meal[] = [
  { id: 'm1', name: 'Oatmeal + berries', calories: 380, time: 'Breakfast', macros: { p: 12, c: 64, f: 7 } },
  { id: 'm2', name: 'Grilled chicken salad', calories: 520, time: 'Lunch', macros: { p: 42, c: 28, f: 18 } },
  { id: 'm3', name: 'Salmon + rice + broccoli', calories: 680, time: 'Dinner', macros: { p: 48, c: 72, f: 16 } },
]

const PREFS: Preference[] = [
  { key: 'diet', label: 'Dietary preference', value: 'No preference', type: 'select', options: ['No preference', 'Vegetarian', 'Vegan', 'Keto', 'Paleo', 'Halal'] },
  { key: 'wakeup', label: 'Wake-up time', value: '07:30', type: 'text' },
  { key: 'deep_work', label: 'Deep work hours', value: '09:00 – 13:00', type: 'text' },
  { key: 'notifications', label: 'Notifications', value: 'true', type: 'toggle' },
  { key: 'language', label: 'Language', value: 'English', type: 'select', options: ['English', 'Arabic', 'French', 'Spanish'] },
]

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function DashboardTab() {
  return (
    <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto h-full">
      <h2 className="text-sm font-mono tracking-[0.16em] flex-shrink-0" style={{ color: 'rgba(192,232,240,0.9)' }}>DASHBOARD</h2>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DailyOverview />
        <FinanceModule />
        <NutritionModule />
        <PreferencesModule />
        <FitnessPlaceholder />
        <MoodPlaceholder />
      </div>
    </div>
  )
}

// ── A. Daily Overview ─────────────────────────────────────────────────────────

function DailyOverview() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const tasks = [
    { title: 'Review builder runs', done: true },
    { title: 'Set up weekly automation', done: false },
    { title: 'Update nutrition preferences', done: false },
  ]
  return (
    <Card title="Daily Overview" icon={<CheckCircle2 className="w-3.5 h-3.5" />} accent="#00d4ff">
      <p className="text-[10px] font-mono mb-3" style={{ color: 'rgba(74,122,138,0.7)' }}>{today}</p>
      <div className="space-y-1.5 mb-3">
        {tasks.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            {t.done
              ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: '#00ff88' }} />
              : <Circle className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(192,232,240,0.3)' }} />}
            <span className="text-[11px] font-mono" style={{ color: t.done ? 'rgba(192,232,240,0.45)' : 'rgba(192,232,240,0.8)', textDecoration: t.done ? 'line-through' : 'none' }}>
              {t.title}
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-md px-3 py-2" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.12)' }}>
        <p className="text-[10px] font-mono" style={{ color: 'rgba(0,212,255,0.7)' }}>
          💡 You have 2 open tasks today. Consider blocking time after lunch.
        </p>
      </div>
    </Card>
  )
}

// ── B. Finance Module ─────────────────────────────────────────────────────────

function FinanceModule() {
  const total = FINANCE.reduce((s, e) => s + e.amount, 0)
  const balance = 4820
  return (
    <Card title="Finance" icon={<DollarSign className="w-3.5 h-3.5" />} accent="#00ff88">
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>BALANCE</p>
          <p className="text-xl font-mono" style={{ color: '#00ff88', textShadow: '0 0 12px rgba(0,255,136,0.3)' }}>
            ${balance.toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>THIS MONTH</p>
          <p className="text-sm font-mono" style={{ color: '#ff6b35' }}>${total.toLocaleString()}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {FINANCE.map(e => (
          <div key={e.category} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: e.color }} />
              <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.65)' }}>{e.category}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.85)' }}>${e.amount}</span>
              {e.trend === 'up' && <TrendingUp className="w-2.5 h-2.5" style={{ color: '#ff6b35' }} />}
              {e.trend === 'down' && <TrendingDown className="w-2.5 h-2.5" style={{ color: '#00ff88' }} />}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── C. Nutrition Module ───────────────────────────────────────────────────────

function NutritionModule() {
  const [generating, setGenerating] = useState(false)
  const [mealPref, setMealPref] = useState('')
  const totalCals = MEALS.reduce((s, m) => s + m.calories, 0)

  function generate() {
    if (!mealPref.trim()) return
    setGenerating(true)
    setTimeout(() => { setGenerating(false); setMealPref('') }, 1800)
  }

  return (
    <Card title="Nutrition" icon={<Utensils className="w-3.5 h-3.5" />} accent="#ffc84a">
      {/* Calorie summary */}
      <div className="flex items-center gap-4 mb-3">
        <div>
          <p className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>TODAY</p>
          <p className="text-lg font-mono" style={{ color: '#ffc84a' }}>{totalCals} kcal</p>
        </div>
        <div className="flex-1">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,200,74,0.12)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: '#ffc84a', boxShadow: '0 0 6px rgba(255,200,74,0.5)' }}
              animate={{ width: `${Math.min((totalCals / 2200) * 100, 100)}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </div>
          <p className="text-[8px] font-mono mt-0.5" style={{ color: 'rgba(74,122,138,0.5)' }}>{totalCals} / 2200 kcal goal</p>
        </div>
      </div>

      {/* Meals */}
      <div className="space-y-1.5 mb-3">
        {MEALS.map(meal => (
          <div key={meal.id} className="flex items-center justify-between rounded px-2 py-1.5" style={{ background: 'rgba(255,200,74,0.04)', border: '1px solid rgba(255,200,74,0.08)' }}>
            <div>
              <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.8)' }}>{meal.name}</p>
              <p className="text-[8px] font-mono" style={{ color: 'rgba(74,122,138,0.6)' }}>{meal.time} · P:{meal.macros.p}g C:{meal.macros.c}g F:{meal.macros.f}g</p>
            </div>
            <span className="text-[10px] font-mono" style={{ color: '#ffc84a' }}>{meal.calories}</span>
          </div>
        ))}
      </div>

      {/* Recipe generator */}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md px-2.5 py-1.5 text-[10px] font-mono outline-none"
          style={{ background: 'rgba(0,10,20,0.7)', border: '1px solid rgba(255,200,74,0.14)', color: 'rgba(192,232,240,0.8)' }}
          placeholder="Ask for a meal idea… (e.g. high protein, quick)"
          value={mealPref}
          onChange={e => setMealPref(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && generate()}
        />
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[9px] font-mono"
          style={{ background: 'rgba(255,200,74,0.10)', border: '1px solid rgba(255,200,74,0.2)', color: '#ffc84a', opacity: generating ? 0.5 : 1 }}
        >
          <Apple className="w-3 h-3" />
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
    </Card>
  )
}

// ── D. Preferences Module ─────────────────────────────────────────────────────

function PreferencesModule() {
  const [prefs, setPrefs] = useState<Preference[]>(PREFS)
  const [saving, setSaving] = useState(false)

  function updatePref(key: string, value: string) {
    setPrefs(prev => prev.map(p => p.key === key ? { ...p, value } : p))
  }

  function save() {
    setSaving(true)
    setTimeout(() => setSaving(false), 800)
  }

  return (
    <Card title="Preferences" icon={<Settings className="w-3.5 h-3.5" />} accent="#9ad1ff">
      <div className="space-y-2.5 mb-3">
        {prefs.map(p => (
          <div key={p.key} className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-mono flex-shrink-0" style={{ color: 'rgba(192,232,240,0.55)' }}>{p.label}</span>
            {p.type === 'toggle' ? (
              <button
                onClick={() => updatePref(p.key, p.value === 'true' ? 'false' : 'true')}
                className="w-8 h-4 rounded-full relative transition-colors"
                style={{ background: p.value === 'true' ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(0,212,255,0.2)' }}
              >
                <motion.div
                  className="absolute top-0.5 w-3 h-3 rounded-full"
                  style={{ background: p.value === 'true' ? '#00d4ff' : 'rgba(192,232,240,0.4)' }}
                  animate={{ left: p.value === 'true' ? '17px' : '1px' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </button>
            ) : p.type === 'select' ? (
              <select
                className="rounded-md px-2 py-1 text-[9px] font-mono outline-none"
                style={{ background: 'rgba(0,10,20,0.7)', border: '1px solid rgba(154,209,255,0.16)', color: '#9ad1ff' }}
                value={p.value}
                onChange={e => updatePref(p.key, e.target.value)}
              >
                {p.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                className="rounded-md px-2 py-1 text-[9px] font-mono outline-none w-32"
                style={{ background: 'rgba(0,10,20,0.7)', border: '1px solid rgba(154,209,255,0.12)', color: '#9ad1ff' }}
                value={p.value}
                onChange={e => updatePref(p.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <button
        onClick={save}
        className="w-full py-1.5 rounded-md text-[10px] font-mono"
        style={{ background: 'rgba(154,209,255,0.08)', border: '1px solid rgba(154,209,255,0.18)', color: '#9ad1ff' }}
      >
        {saving ? 'Saved ✓' : 'Save preferences'}
      </button>
    </Card>
  )
}

// ── Placeholders ──────────────────────────────────────────────────────────────

function FitnessPlaceholder() {
  return (
    <Card title="Fitness" icon={<Dumbbell className="w-3.5 h-3.5" />} accent="#ff6b35">
      <div className="flex flex-col items-center justify-center py-6 gap-2">
        <Dumbbell className="w-8 h-8" style={{ color: 'rgba(255,107,53,0.25)' }} />
        <p className="text-[10px] font-mono text-center" style={{ color: 'rgba(192,232,240,0.3)' }}>Fitness tracking<br />coming soon</p>
        <span className="text-[8px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,107,53,0.08)', color: 'rgba(255,107,53,0.5)', border: '1px solid rgba(255,107,53,0.14)' }}>PLACEHOLDER</span>
      </div>
    </Card>
  )
}

function MoodPlaceholder() {
  return (
    <Card title="Mood Tracking" icon={<Heart className="w-3.5 h-3.5" />} accent="#ff6b9d">
      <div className="flex flex-col items-center justify-center py-6 gap-2">
        <div className="flex gap-2 mb-2">
          {['😴', '😐', '🙂', '😊', '🚀'].map((e, i) => (
            <button key={i} className="text-xl hover:scale-125 transition-transform">{e}</button>
          ))}
        </div>
        <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.35)' }}>Tap to log today's mood</p>
        <span className="text-[8px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,107,157,0.06)', color: 'rgba(255,107,157,0.45)', border: '1px solid rgba(255,107,157,0.12)' }}>PLACEHOLDER</span>
      </div>
    </Card>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ title, icon, accent, children }: { title: string; icon: React.ReactNode; accent: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{
        background: 'rgba(4,12,20,0.7)',
        border: `1px solid ${accent}1a`,
        boxShadow: `0 0 24px ${accent}08`,
      }}
    >
      <div className="flex items-center gap-2 mb-3" style={{ color: accent }}>
        {icon}
        <span className="text-[10px] font-mono tracking-[0.16em]">{title.toUpperCase()}</span>
        <div className="flex-1 h-px" style={{ background: `${accent}20` }} />
      </div>
      {children}
    </div>
  )
}
