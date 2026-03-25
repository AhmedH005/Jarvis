/** Shared date/ID utilities — no store or service dependencies. */

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function today(): string {
  return new Date().toISOString().split('T')[0]
}

export function addDays(d: string, n: number): string {
  const dt = new Date(d + 'T12:00:00')
  dt.setDate(dt.getDate() + n)
  return dt.toISOString().split('T')[0]
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function toTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
}

export function formatDayLabel(dateStr: string): string {
  const td = today()
  if (dateStr === td) return 'Today'
  if (dateStr === addDays(td, 1)) return 'Tomorrow'
  if (dateStr === addDays(td, -1)) return 'Yesterday'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
