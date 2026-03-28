import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CalendarEvent } from '@/calendar/calendarTypes'

interface CalendarStore {
  events: CalendarEvent[]
  addEvent: (event: CalendarEvent) => void
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void
  removeEvent: (id: string) => void
  setEvents: (events: CalendarEvent[]) => void
}

export const useCalendarStore = create<CalendarStore>()(
  persist(
    (set) => ({
      events: [],

      addEvent: (event) =>
        set((s) => ({ events: [...s.events, event] })),

      updateEvent: (id, patch) =>
        set((s) => ({
          events: s.events.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e
          ),
        })),

      removeEvent: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),

      setEvents: (events) => set({ events }),
    }),
    { name: 'jarvis-calendar-v1' }
  )
)
