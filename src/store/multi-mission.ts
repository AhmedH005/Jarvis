import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MissionRoute } from './mission-intake'

// ── Staged mission ────────────────────────────────────────────────────────────

export interface StagedMission {
  id:          string
  missionText: string
  route:       MissionRoute
  status:      'pending' | 'handed-off'
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface MultiMissionState {
  staged: StagedMission[]

  /** Replace all staged missions (called after user confirms CREATE MISSIONS) */
  stage:       (missions: StagedMission[]) => void
  /** Mark one mission as handed off */
  markHandedOff: (id: string) => void
  /** Remove a single mission from the queue */
  remove:      (id: string) => void
  /** Clear all staged missions */
  clear:       () => void
}

function genId(): string {
  return `mm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function buildStagedId(): string {
  return genId()
}

export const useMultiMissionStore = create<MultiMissionState>()(
  persist(
    (set) => ({
      staged: [],

      stage(missions) {
        set({ staged: missions })
      },

      markHandedOff(id) {
        set((s) => ({
          staged: s.staged.map((m) =>
            m.id === id ? { ...m, status: 'handed-off' } : m
          ),
        }))
      },

      remove(id) {
        set((s) => ({ staged: s.staged.filter((m) => m.id !== id) }))
      },

      clear() {
        set({ staged: [] })
      },
    }),
    {
      name:       'jarvis-multi-mission',
      version:    1,
      partialize: (s) => ({ staged: s.staged }),
    },
  ),
)
