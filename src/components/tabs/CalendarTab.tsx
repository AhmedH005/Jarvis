/**
 * CalendarTab — Jarvis-controlled calendar UI.
 *
 * Uses react-big-calendar for the grid (day/week/month/agenda views).
 * All mutations go through calendarActions.ts — never direct store calls.
 * Jarvis drives this tab through the calendar action API, not through the UI.
 */

import { useState, useCallback, useMemo } from 'react'
import { Calendar, dateFnsLocalizer, type View, type SlotInfo } from 'react-big-calendar'
import withDragAndDrop, { type EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Plus, Trash2, X, Lock, Unlock, ChevronDown } from 'lucide-react'

import { useCalendarStore } from '@/store/calendarStore'
import { createEvent, updateEvent, moveEvent, deleteEvent } from '@/calendar/calendarActions'
import type { CalendarEvent } from '@/calendar/calendarTypes'

import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import '@/calendar/calendar.css'

// ── date-fns localizer ────────────────────────────────────────────────────────

const locales = { 'en-US': enUS }
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales })
const DnDCalendar = withDragAndDrop(Calendar)

// ── RBC event shape ───────────────────────────────────────────────────────────

interface RBCEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  resource: CalendarEvent  // full model attached for inspection
}

function toRBCEvent(e: CalendarEvent): RBCEvent {
  return {
    id: e.id,
    title: e.title,
    start: new Date(e.start),
    end: new Date(e.end),
    allDay: e.allDay,
    resource: e,
  }
}

// ── Add Event Modal ───────────────────────────────────────────────────────────

function AddEventModal({
  initialDate,
  onClose,
}: {
  initialDate: string
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(initialDate)
  const [startTime, setStartTime] = useState('09:00')
  const [duration, setDuration] = useState(60)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!title.trim()) { setError('Title is required'); return }
    const startDt = new Date(`${date}T${startTime}:00`)
    const endDt = new Date(startDt.getTime() + duration * 60 * 1000)

    const result = await createEvent({
      title: title.trim(),
      start: startDt.toISOString().replace(/\.\d{3}Z$/, ''),
      end: endDt.toISOString().replace(/\.\d{3}Z$/, ''),
      notes: notes.trim() || undefined,
      source: 'manual',
    })

    if (!result.success) { setError(result.error); return }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-6 w-full max-w-sm flex flex-col gap-4"
        style={{
          background: 'rgba(4, 14, 28, 0.97)',
          border: '1px solid rgba(0,212,255,0.2)',
          boxShadow: '0 0 40px rgba(0,212,255,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-mono tracking-[0.16em]" style={{ color: 'rgba(0,212,255,0.8)' }}>
            NEW EVENT
          </p>
          <button onClick={onClose} className="opacity-50 hover:opacity-100 transition-opacity">
            <X className="w-4 h-4" style={{ color: 'rgba(192,232,240,0.7)' }} />
          </button>
        </div>

        {error && (
          <p className="text-[10px] font-mono" style={{ color: '#ff6b35' }}>{error}</p>
        )}

        <ModalField label="TITLE">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
            placeholder="Event title"
            className="modal-input"
          />
        </ModalField>

        <div className="grid grid-cols-2 gap-3">
          <ModalField label="DATE">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="modal-input"
            />
          </ModalField>
          <ModalField label="START">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="modal-input"
            />
          </ModalField>
        </div>

        <ModalField label="DURATION">
          <div className="flex gap-2">
            {[30, 60, 90, 120].map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className="flex-1 text-[9px] font-mono py-1 rounded transition-all"
                style={{
                  background: duration === d ? 'rgba(0,212,255,0.2)' : 'rgba(0,212,255,0.05)',
                  border: `1px solid ${duration === d ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.12)'}`,
                  color: duration === d ? '#00d4ff' : 'rgba(192,232,240,0.5)',
                }}
              >
                {d}m
              </button>
            ))}
          </div>
        </ModalField>

        <ModalField label="NOTES (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes..."
            className="modal-input resize-none"
          />
        </ModalField>

        <button
          onClick={() => void handleSubmit()}
          className="py-2 rounded text-[10px] font-mono tracking-[0.12em] transition-all"
          style={{
            background: 'rgba(0,212,255,0.15)',
            border: '1px solid rgba(0,212,255,0.35)',
            color: '#00d4ff',
          }}
        >
          CREATE EVENT
        </button>
      </div>
    </div>
  )
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[9px] font-mono tracking-[0.14em]" style={{ color: 'rgba(0,212,255,0.5)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ── Event Inspector ───────────────────────────────────────────────────────────

function EventInspector({
  event,
  onClose,
  onDeleted,
}: {
  event: CalendarEvent
  onClose: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(event.title)
  const [notes, setNotes] = useState(event.notes ?? '')
  const [error, setError] = useState('')

  async function handleSave() {
    const result = await updateEvent(event.id, { title, notes: notes || undefined })
    if (!result.success) { setError(result.error); return }
    setEditing(false)
    onClose()
  }

  async function handleDelete() {
    const result = await deleteEvent(event.id)
    if (!result.success) { setError(result.error); return }
    onDeleted()
  }

  async function handleToggleLock() {
    await updateEvent(event.id, { locked: !event.locked })
    onClose()
  }

  const startLabel = event.allDay
    ? new Date(event.start + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : new Date(event.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  const endLabel = event.allDay
    ? ''
    : new Date(event.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end p-6"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="rounded-xl p-5 w-72 flex flex-col gap-3"
        style={{
          pointerEvents: 'all',
          background: 'rgba(4, 14, 28, 0.97)',
          border: '1px solid rgba(0,212,255,0.2)',
          boxShadow: '0 0 40px rgba(0,212,255,0.08)',
        }}
      >
        <div className="flex items-start justify-between gap-2">
          {editing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="modal-input flex-1"
            />
          ) : (
            <p
              className="text-[12px] font-mono flex-1 cursor-pointer"
              style={{ color: 'rgba(192,232,240,0.9)' }}
              onClick={() => setEditing(true)}
            >
              {event.title}
            </p>
          )}
          <button onClick={onClose} className="opacity-40 hover:opacity-80 transition-opacity flex-shrink-0">
            <X className="w-3.5 h-3.5" style={{ color: 'rgba(192,232,240,0.7)' }} />
          </button>
        </div>

        <p className="text-[9px] font-mono" style={{ color: 'rgba(0,212,255,0.6)' }}>
          {startLabel}{endLabel ? ` → ${endLabel}` : ''}
        </p>

        {event.source && (
          <p className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.3)' }}>
            source: {event.source}
          </p>
        )}

        {editing ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes..."
            className="modal-input resize-none"
          />
        ) : event.notes ? (
          <p
            className="text-[10px] leading-snug cursor-pointer"
            style={{ color: 'rgba(192,232,240,0.55)' }}
            onClick={() => setEditing(true)}
          >
            {event.notes}
          </p>
        ) : null}

        {error && (
          <p className="text-[9px] font-mono" style={{ color: '#ff6b35' }}>{error}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          {editing ? (
            <>
              <ActionButton onClick={() => void handleSave()} accent="green">SAVE</ActionButton>
              <ActionButton onClick={() => setEditing(false)} accent="dim">CANCEL</ActionButton>
            </>
          ) : (
            <>
              <ActionButton onClick={() => setEditing(true)} accent="blue">EDIT</ActionButton>
              <ActionButton onClick={() => void handleToggleLock()} accent="dim">
                {event.locked ? <><Unlock className="w-3 h-3 inline mr-1" />UNLOCK</> : <><Lock className="w-3 h-3 inline mr-1" />LOCK</>}
              </ActionButton>
              <ActionButton
                onClick={() => void handleDelete()}
                accent="red"
                disabled={!!event.locked}
                title={event.locked ? 'Unlock first' : undefined}
              >
                <Trash2 className="w-3 h-3 inline mr-1" />DEL
              </ActionButton>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  accent,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  accent: 'blue' | 'green' | 'red' | 'dim'
  disabled?: boolean
  title?: string
}) {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    blue:  { bg: 'rgba(0,212,255,0.1)',   border: 'rgba(0,212,255,0.3)',   text: '#00d4ff' },
    green: { bg: 'rgba(0,255,136,0.1)',   border: 'rgba(0,255,136,0.3)',   text: '#00ff88' },
    red:   { bg: 'rgba(255,107,53,0.1)',  border: 'rgba(255,107,53,0.3)',  text: '#ff6b35' },
    dim:   { bg: 'rgba(192,232,240,0.05)', border: 'rgba(192,232,240,0.15)', text: 'rgba(192,232,240,0.5)' },
  }
  const c = colors[accent]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex-1 py-1.5 rounded text-[8px] font-mono tracking-[0.1em] transition-all"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// ── Main CalendarTab ──────────────────────────────────────────────────────────

export function CalendarTab() {
  const events = useCalendarStore((s) => s.events)
  const [view, setView] = useState<View>('week')
  const [date, setDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [addModal, setAddModal] = useState<string | null>(null)  // holds pre-filled date

  const rbcEvents = useMemo(() => events.map(toRBCEvent), [events])

  const handleSelectEvent = useCallback((rbcEvent: object) => {
    const ev = (rbcEvent as RBCEvent).resource
    setSelectedEvent(ev)
  }, [])

  const handleSelectSlot = useCallback((slot: SlotInfo) => {
    const d = slot.start instanceof Date ? slot.start : new Date(slot.start)
    setAddModal(d.toISOString().split('T')[0])
  }, [])

  const handleEventDrop = useCallback(({ event, start, end }: EventInteractionArgs<object>) => {
    const rbcEv = event as RBCEvent
    const newStart = start instanceof Date ? start : new Date(start)
    const newEnd   = end   instanceof Date ? end   : new Date(end)
    void moveEvent(
      rbcEv.id,
      newStart.toISOString().replace(/\.\d{3}Z$/, ''),
      newEnd.toISOString().replace(/\.\d{3}Z$/, '')
    )
  }, [])

  const handleEventResize = useCallback(({ event, start, end }: EventInteractionArgs<object>) => {
    const rbcEv = event as RBCEvent
    const newStart = start instanceof Date ? start : new Date(start)
    const newEnd   = end   instanceof Date ? end   : new Date(end)
    void moveEvent(
      rbcEv.id,
      newStart.toISOString().replace(/\.\d{3}Z$/, ''),
      newEnd.toISOString().replace(/\.\d{3}Z$/, '')
    )
  }, [])

  // Color events by source
  const eventStyleGetter = useCallback((rbcEvent: object) => {
    const ev = (rbcEvent as RBCEvent).resource
    const color = ev.color ?? (
      ev.source === 'jarvis' ? '#00d4ff' :
      ev.locked ? '#ffc84a' :
      '#00d4ff'
    )
    const alpha = ev.locked ? '0.35' : '0.2'
    return {
      style: {
        background: `${color}${Math.round(parseFloat(alpha) * 255).toString(16).padStart(2, '0')}`,
        border: `1px solid ${color}55`,
        color: 'rgba(192,232,240,0.9)',
        borderRadius: '3px',
        fontSize: '10px',
      },
    }
  }, [])

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'rgba(4, 14, 24, 0.95)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
        style={{
          borderBottom: '1px solid rgba(0,212,255,0.08)',
          background: 'linear-gradient(180deg, rgba(7,14,23,0.85), rgba(7,14,23,0.4))',
        }}
      >
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-mono tracking-[0.18em]" style={{ color: 'rgba(0,212,255,0.7)' }}>
            CALENDAR
          </p>
          <span
            className="text-[8px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.15)',
              color: 'rgba(0,212,255,0.5)',
            }}
          >
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View selector */}
          <div className="flex items-center rounded overflow-hidden" style={{ border: '1px solid rgba(0,212,255,0.14)' }}>
            {(['day', 'week', 'month', 'agenda'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-2.5 py-1 text-[8px] font-mono tracking-[0.1em] transition-all uppercase"
                style={{
                  background: view === v ? 'rgba(0,212,255,0.18)' : 'transparent',
                  color: view === v ? '#00d4ff' : 'rgba(192,232,240,0.4)',
                  borderRight: v !== 'agenda' ? '1px solid rgba(0,212,255,0.1)' : undefined,
                }}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAddModal(todayStr)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[9px] font-mono tracking-[0.1em] transition-all"
            style={{
              background: 'rgba(0,212,255,0.12)',
              border: '1px solid rgba(0,212,255,0.3)',
              color: '#00d4ff',
            }}
          >
            <Plus className="w-3 h-3" />
            ADD
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-2">
        <DnDCalendar
          localizer={localizer}
          events={rbcEvents}
          view={view}
          date={date}
          onView={setView}
          onNavigate={setDate}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          selectable
          resizable
          eventPropGetter={eventStyleGetter}
          style={{ height: '100%' }}
          popup
          showMultiDayTimes
          step={30}
          timeslots={2}
          scrollToTime={new Date(new Date().setHours(8, 0, 0, 0))}
          formats={{
            timeGutterFormat: (date: Date) => format(date, 'h a'),
            dayHeaderFormat: (date: Date) => format(date, 'EEE M/d'),
            dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
              `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
          }}
        />
      </div>

      {/* Modals */}
      {addModal && (
        <AddEventModal
          initialDate={addModal}
          onClose={() => setAddModal(null)}
        />
      )}

      {selectedEvent && (
        <EventInspector
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDeleted={() => setSelectedEvent(null)}
        />
      )}

      <style>{`
        .modal-input {
          width: 100%;
          background: rgba(0,212,255,0.06);
          border: 1px solid rgba(0,212,255,0.18);
          border-radius: 4px;
          color: rgba(192,232,240,0.9);
          font-family: inherit;
          font-size: 11px;
          padding: 6px 8px;
          outline: none;
          transition: border-color 0.15s;
        }
        .modal-input:focus {
          border-color: rgba(0,212,255,0.45);
        }
        .modal-input::placeholder {
          color: rgba(192,232,240,0.25);
        }
        .modal-input::-webkit-calendar-picker-indicator {
          filter: invert(0.7) sepia(1) hue-rotate(170deg);
        }
      `}</style>
    </div>
  )
}
