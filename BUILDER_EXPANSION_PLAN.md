# Builder Provider Expansion Plan

Updated: 2026-03-29

---

## Current State (Pre-Expansion)

### BuilderBridgeProvider — existing capabilities

| Method | What it does today | Weakness |
|--------|-------------------|----------|
| `requestPlan` | Stages a plan request | No context attached, no decomposition, just a raw prompt |
| `createExecutionRequest` | Stages execution from plan | Passes plan as-is, no enrichment |
| `settleExecutionRequest` | Stages approve/deny action | No structured reason capture |
| `startExecution` | Stages execution start | No context snapshot |
| `finalizeExecution` | Stages finalization | Draft is unstructured, free-form text |
| `loadHistory` | Returns unavailable | Bridge not wired in safe runtime |
| `verifyRun` | Stages verification | No structured verification criteria |

All methods: governance-gated via `enforce()`. All outputs: `staged` or `blocked`. Bridge calls (`window.jarvis.*`) not invoked under DRY_RUN.

---

## Current Weaknesses

1. **No task decomposition** — `requestPlan` takes a raw prompt and passes it through. There is no structured breakdown of tasks, priorities, or file scope.
2. **No context attachment** — plans carry no project context, memory records, or prior run history. The builder acts blind to what JARVIS knows.
3. **No remediation shaping** — `verifyRun` is staged, but there is no method to transform a failing run + error report into a structured remediation plan. `createBuilderRemediationRequest()` (adapter) is never called by the provider.
4. **No structured result summaries** — finalized runs are summarized by free-form strings from the bridge. No structured breakdown of what changed, what was verified, what to do next.
5. **`loadHistory` always unavailable** — the safe runtime never attempts history reads even when the bridge exists.
6. **DevTab surfaces no builder intelligence** — shows only raw action log entries; no action type, context, decomposition, or governance reason.

---

## Legacy Builder Logic Still Existing (outside provider)

| Location | What it does | Should be absorbed? |
|----------|-------------|---------------------|
| `src/adapters/builder-plan.ts` | Bridge adapter for `planTask` IPC | No — keep as IPC bridge adapter |
| `src/adapters/builder-execution.ts` | Bridge adapters for `start/finalize/listHistory` IPC | No — keep as IPC bridge adapters |
| `src/adapters/builder-execution-request.ts` | Bridge adapters for `createRequest/createRemediationRequest/settle` IPC | No — keep as IPC bridge adapters |
| `src/store/builder-plan.ts` | Zustand UI store for plan workflow | No — UI state only |
| `src/store/builder-execution.ts` | Zustand UI store for execution workflow | No — UI state only |
| `src/store/builder-execution-request.ts` | Zustand UI store for request workflow | No — UI state only |
| `src/components/tabs/AgentWorkSurface.tsx` | Batch ops: verify/remediate/approve/start | No — UI surface only |
| `src/components/tabs/CodingTeamTab.tsx` | Team roster + run history display | No — UI surface only |

The provider layer is the **right place** for: context assembly, decomposition structuring, remediation plan shaping, result summarization, and governed execution. The adapters remain thin IPC wrappers.

---

## Target Action Types (Phase 2)

| Action Type | Input | Output | Notes |
|-------------|-------|--------|-------|
| `plan_work` | prompt + optional context | `BuilderPlanResult` | existing, enriched with context |
| `decompose_task` | prompt + optional context | `BuilderTaskDecomposition` | NEW — breaks prompt into structured subtasks |
| `shape_fix_request` | runId + errorSummary + optional context | `BuilderRemediationPlan` | NEW — transforms failing run into structured plan |
| `stage_execution` | plan | `BuilderExecutionRequest` | existing, unchanged |
| `summarize_result` | run | `BuilderResultSummary` | NEW — rich structured summary of a completed run |
| `attach_context` | planId + context | `BuilderContextAttachment` | NEW — attach memory/project context to a plan |
| `create_remediation_plan` | runId + prompt + optional context | `BuilderRemediationPlan` | NEW — full remediation plan from run history + memory |

---

## Governance + Memory + Routing Dependencies

### Governance
- All new methods governed via `enforce('agent-task-manager', this.key, 'builder:<action>', ['dev_execution'], true)`
- `allowed: false` → return `toOperationResult(gov)` immediately
- DRY_RUN = all outputs `state: 'staged'`

### Memory
- Context assembly uses `lookupBuilderContext(prompt)` and `lookupProjectContext(tags)` from `@/integrations/memory/hooks`
- Context is **attached to the staged payload**, not passed to the bridge (DRY_RUN)
- Memory is read-only here — no writes during decomposition or planning

### Routing
- Orchestrator routes to `builder` domain when `dev/code/build/fix` signals match
- Route lands at `BuilderProvider` via `builder-skill-provider`
- New methods do not change routing — they enrich what happens once builder domain is entered

---

## Files Created / Modified

| File | Change |
|------|--------|
| `BUILDER_EXPANSION_PLAN.md` | **CREATED** (this file) |
| `src/shared/builder-action-types.ts` | **CREATED** — typed builder action model |
| `src/integrations/contracts/providers.ts` | **UPDATED** — extend BuilderProvider interface |
| `src/integrations/providers/builder-provider.ts` | **UPDATED** — new methods + context attachment |
| `src/components/tabs/DevTab.tsx` | **UPDATED** — minimal truth surfacing |

---

## Non-Negotiable Rules (carried forward from mission brief)

- DRY_RUN = true at all times. No execution starts.
- No fake multi-agent theater. New methods do local structured shaping only.
- Governance stays active on every new method.
- All outputs: typed, inspectable, staged.
- No visual redesign of DevTab — content additions only.
