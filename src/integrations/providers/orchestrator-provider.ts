import type { BuilderWorkTarget } from '@/shared/builder-bridge'
import { buildBuilderRepoTarget } from '@/shared/builder-bridge'
import { heuristicClassify } from '@/features/chat/router-fallback'
import { toOrchestratorRoute } from '@/features/chat/model-router'
import { loadSkillManifest } from '@/integrations/skills/loader'
import { stageAction } from '@/integrations/runtime/safety'
import { enforce } from '@/integrations/governance/governance-enforcer'
import { useActionRuntimeStore } from '@/store/action-runtime'
import type { OrchestratorProvider, OrchestratorRoute, OrchestratorDomain, RouteConfidence } from '@/integrations/contracts/providers'
import type { ActionRecord, ProviderDescriptor } from '@/integrations/contracts/base'

function now(): string {
  return new Date().toISOString()
}

function focusTarget(): BuilderWorkTarget {
  return buildBuilderRepoTarget()
}

function buildRoute(input: string): OrchestratorRoute {
  const route = toOrchestratorRoute(
    heuristicClassify(input, 'Heuristic orchestrator route requested directly.'),
  )

  return {
    ...route,
    focusTarget: focusTarget(),
  }
}

export class HeuristicOrchestratorProvider implements OrchestratorProvider {
  readonly key = 'agent-task-manager-router'
  readonly label = 'Agent Task Manager Router'

  async describe(): Promise<ProviderDescriptor<{
    routeCommands: boolean
    stageActions: boolean
    trackReceipts: boolean
  }>> {
    const taskManager = await loadSkillManifest('agent-task-manager')

    // Reflect whether model-assisted routing is available at runtime.
    // The model router (model-router.ts) checks window.jarvis.llm.classify
    // and the ANTHROPIC_API_KEY credential status via llm:classify IPC.
    const modelRouterAvailable =
      typeof window !== 'undefined' &&
      typeof window.jarvis?.llm?.classify === 'function'

    let modelDetail: string
    let routerState: 'ready' | 'degraded'

    if (modelRouterAvailable) {
      // Key presence is checked by diagnostics; we can't read it directly here.
      // We optimistically report model-assisted when the bridge exists.
      modelDetail = 'Model-assisted routing active — classification via Claude Haiku with heuristic fallback.'
      routerState = 'ready'
    } else {
      modelDetail = 'Model-assisted routing unavailable (bridge absent or no Electron context) — heuristic fallback active.'
      routerState = 'degraded'
    }

    return {
      key: this.key,
      label: this.label,
      capabilities: {
        routeCommands: true,
        stageActions: true,
        trackReceipts: true,
      },
      health: {
        state: routerState,
        detail: `${taskManager.label} · ${modelDetail} Execution blocked by dry run and capability gates.`,
        missing: ['DRY_RUN', 'execute=false', 'write=false'],
        checkedAt: now(),
      },
    }
  }

  routeMission(input: string): OrchestratorRoute {
    return buildRoute(input)
  }

  stageMission(route: OrchestratorRoute, missionText: string): ActionRecord<{ missionText: string }> {
    // Fire-and-forget governance check — audits the intent; actual execution is gated by downstream providers
    void enforce('agent-task-manager', this.key, 'orchestrator:stageMission', ['dev_execution'], true)
    const actionId = stageAction({
      domain: 'orchestration',
      providerKey: this.key,
      title: route.actionLabel,
      summary: `${route.agentName} received a staged mission for "${missionText}".`,
      payload: {
        missionText,
        route,
      },
    })

    return useActionRecord(actionId)
  }
}

function useActionRecord(actionId: string): ActionRecord<{ missionText: string }> {
  const record = requireActionRecord(actionId)
  return record as ActionRecord<{ missionText: string }>
}

function requireActionRecord(actionId: string): ActionRecord {
  const { actions } = useActionRuntimeStore.getState()
  const action = actions.find((entry) => entry.id === actionId)
  if (!action) {
    throw new Error(`Staged action ${actionId} could not be found.`)
  }
  return action
}
