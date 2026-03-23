import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BuilderWorkTarget } from '@/shared/builder-bridge'
import {
  DEFAULT_AGENT_CONTROL_CONFIGS,
  type AgentControlConfig,
  type AgentControlMode,
  type AgentPersonaId,
} from '@/adapters/agent-control'

interface AgentControlState {
  configs: Record<AgentPersonaId, AgentControlConfig>
  updateConfig: (id: AgentPersonaId, patch: Partial<AgentControlConfig>) => void
  setResponsibilities: (id: AgentPersonaId, responsibilities: string[]) => void
  setMode: (id: AgentPersonaId, mode: AgentControlMode) => void
  setFocusTarget: (id: AgentPersonaId, focusTarget: BuilderWorkTarget) => void
  toggleVisibleCapability: (id: AgentPersonaId, capability: string) => void
  resetConfig: (id: AgentPersonaId) => void
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }

  return out
}

export const useAgentControlStore = create<AgentControlState>()(
  persist(
    (set) => ({
      configs: DEFAULT_AGENT_CONTROL_CONFIGS,

      updateConfig: (id, patch) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [id]: {
              ...state.configs[id],
              ...patch,
            },
          },
        })),

      setResponsibilities: (id, responsibilities) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [id]: {
              ...state.configs[id],
              responsibilities: dedupe(responsibilities),
            },
          },
        })),

      setMode: (id, mode) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [id]: {
              ...state.configs[id],
              mode,
            },
          },
        })),

      setFocusTarget: (id, focusTarget) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [id]: {
              ...state.configs[id],
              focusTarget,
            },
          },
        })),

      toggleVisibleCapability: (id, capability) =>
        set((state) => {
          const current = state.configs[id]
          const exists = current.visibleCapabilities.includes(capability)

          return {
            configs: {
              ...state.configs,
              [id]: {
                ...current,
                visibleCapabilities: exists
                  ? current.visibleCapabilities.filter((item) => item !== capability)
                  : [...current.visibleCapabilities, capability],
              },
            },
          }
        }),

      resetConfig: (id) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [id]: DEFAULT_AGENT_CONTROL_CONFIGS[id],
          },
        })),
    }),
    {
      name: 'jarvis-agent-control-v1',
      partialize: (state) => ({ configs: state.configs }),
      // Merge stored configs on top of defaults so newly-added fields are always present.
      merge: (persisted, current) => {
        const stored = (persisted as { configs?: Record<string, Partial<AgentControlConfig>> })?.configs ?? {}
        const merged = { ...current.configs } as Record<AgentPersonaId, AgentControlConfig>
        for (const [id, patch] of Object.entries(stored) as [AgentPersonaId, Partial<AgentControlConfig>][]) {
          if (id in merged) {
            merged[id] = { ...merged[id], ...patch }
          }
        }
        return { ...current, configs: merged }
      },
    }
  )
)
