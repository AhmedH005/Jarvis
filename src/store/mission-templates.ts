import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from '@/lib/utils'
import type { AgentPersonaId } from '@/adapters/agent-control'
import type { MissionActionMode } from './mission-intake'

// ── Template model ─────────────────────────────────────────────────────────────

export interface MissionTemplate {
  id:                   string
  name:                 string
  missionText:          string
  recommendedAgentId:   AgentPersonaId
  recommendedAgentName: string
  actionMode:           MissionActionMode
  actionLabel:          string
  targetHint:           string | null
  targetId:             string | null
  rationale:            string
  /** 'starter' templates are pre-seeded examples; 'user-template' are user-created */
  source:               'user-template' | 'starter'
  createdAt:            string
  updatedAt:            string
}

export type TemplateSaveFields = Omit<MissionTemplate, 'id' | 'name' | 'createdAt' | 'updatedAt'>

// ── Store interface ────────────────────────────────────────────────────────────

interface MissionTemplatesState {
  templates: MissionTemplate[]
  saveTemplate:   (name: string, fields: TemplateSaveFields) => MissionTemplate
  updateTemplate: (id: string, name: string, fields: TemplateSaveFields) => void
  deleteTemplate: (id: string) => void
}

// ── Starter templates ─────────────────────────────────────────────────────────
// Clearly labeled example templates, pre-seeded on first run.
// Users can delete or overwrite them at any time.

const STARTER_TEMPLATES: MissionTemplate[] = [
  {
    id:                   'starter-plan-feature',
    name:                 'Plan a feature',
    missionText:          'Plan the implementation of a new feature for the calendar app',
    recommendedAgentId:   'alex',
    recommendedAgentName: 'Alex',
    actionMode:           'plan-only',
    actionLabel:          'Generate plan',
    targetHint:           'app/calendar',
    targetId:             'app/calendar',
    rationale:            'Starter example — routes to Alex for plan-only scoping before any execution request is created.',
    source:               'starter',
    createdAt:            '2026-01-01T00:00:00.000Z',
    updatedAt:            '2026-01-01T00:00:00.000Z',
  },
  {
    id:                   'starter-build-request',
    name:                 'Build execution request',
    missionText:          'Create an execution request to implement the scheduler refactor',
    recommendedAgentId:   'kai',
    recommendedAgentName: 'Kai',
    actionMode:           'execution-request',
    actionLabel:          'Create execution request',
    targetHint:           'package/scheduler',
    targetId:             'package/scheduler',
    rationale:            'Starter example — routes to Kai to package a plan into an approval-gated execution request.',
    source:               'starter',
    createdAt:            '2026-01-01T00:00:00.000Z',
    updatedAt:            '2026-01-01T00:00:00.000Z',
  },
  {
    id:                   'starter-verify-run',
    name:                 'Verify last run',
    missionText:          'Verify the last finalized Builder run',
    recommendedAgentId:   'maya',
    recommendedAgentName: 'Maya',
    actionMode:           'verification',
    actionLabel:          'Verify Builder run',
    targetHint:           'repo-wide',
    targetId:             'repo',
    rationale:            'Starter example — routes to Maya to attach a Checker verification decision to the most recent finalized run.',
    source:               'starter',
    createdAt:            '2026-01-01T00:00:00.000Z',
    updatedAt:            '2026-01-01T00:00:00.000Z',
  },
]

// ── Store ──────────────────────────────────────────────────────────────────────

export const useMissionTemplatesStore = create<MissionTemplatesState>()(
  persist(
    (set) => ({
      templates: STARTER_TEMPLATES,

      saveTemplate(name, fields) {
        const now = new Date().toISOString()
        const template: MissionTemplate = {
          ...fields,
          id:        nanoid(),
          name:      name.trim() || 'Untitled template',
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({ templates: [template, ...state.templates] }))
        return template
      },

      updateTemplate(id, name, fields) {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...fields,
                  id,
                  name:      name.trim() || t.name,
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        }))
      },

      deleteTemplate(id) {
        set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }))
      },
    }),
    {
      name:       'jarvis-mission-templates-v1',
      partialize: (state) => ({ templates: state.templates }),
    }
  )
)
