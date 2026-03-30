# Debugging Guide

Updated: 2026-03-29

## Where To Look First

1. System surfaces:
   Look at `SystemOps` for SAFETY flags, CONNECTORS, PROVIDER READINESS, and the ACTION LOG.
2. Runtime snapshot:
   `useRuntimeStore().snapshot` now includes readiness summary lines plus activation mismatch notes.
3. Provider result object:
   Every hardened provider result now carries:
   - `status`
   - `summary`
   - `failure.code` / `failure.status`
   - `trace.traceId`
   - `trace.auditEntryId`
   - `trace.stagedActionId`
4. Governance audit:
   In-session audit entries live in the action log.
   Persisted audit entries live at `jarvis-runtime/governance/audit-log.jsonl`.

## Distinguishing Common Blocks

### Governance block

Look for:
- `result.status === 'blockedByGovernance'`
- `failure.status === 'blockedByGovernance'`
- audit entry with `decision=blocked_by_governance`
- trace metadata showing missing permissions or restricted/blocked trust

Common causes:
- skill trust level is `blocked`
- required permission scope not granted
- skill trust level is `restricted`

Primary files:
- `src/integrations/governance/governance-decision.ts`
- `src/integrations/governance/governance-enforcer.ts`
- `jarvis-runtime/governance/skills.json`

### Capability block

Look for:
- `result.status === 'blockedByCapability'`
- `failure.code` like `capability_network_disabled`
- readiness blocker `capability_disabled` or `network_disabled`

Common causes:
- `CAPABILITIES.network=false`
- `CAPABILITIES.execute=false`
- `CAPABILITIES.write=false`

Primary file:
- `src/shared/operational-safety.ts`

### DRY_RUN block

Look for:
- `result.status === 'blockedByDryRun'`
- `result.state === 'staged'`
- readiness blocker `dry_run`

Interpretation:
- the request was accepted and staged
- no live mutation was attempted
- `trace.stagedActionId` tells you which staged action to inspect

Primary file:
- `src/shared/operational-safety.ts`

### Unavailable

Look for:
- `result.status === 'unavailable'`
- `failure.code` like `no_bridge`, `ics_source_unavailable`, `builder_history_unavailable`

Interpretation:
- no reachable live path exists right now
- this is different from a transient provider failure

### Provider vs transport failure

Provider failure:
- `result.status === 'providerFailure'`
- usually auth, upstream API rejection, bad response, or provider-side validation

Transport failure:
- `result.status === 'transportFailure'`
- usually timeout, DNS, refused connection, or network transport issues

## Inspecting Activation State

File:
- `jarvis-runtime/activation/activation-state.json`

What to compare:
- `currentStage`
- `activatedAt`
- `lastSmokeTestAt`
- `lastSmokeTestResult`

Mismatch detection:
- runtime snapshot now reports activation/readiness mismatches when:
  - activation tracks an unknown provider/action
  - an action is marked `activated` but readiness still reports blockers
  - readiness knows about a provider that activation state does not track

## Inspecting Memory Selection Issues

Primary files:
- `src/integrations/memory/memory-scoring.ts`
- `src/integrations/memory/memory-selector.ts`
- `src/integrations/memory/memory-store.ts`

Checklist:
- confirm the record domain matches module bias or explicit filter
- confirm tags match case-insensitively
- check `query` token overlap after de-duplication
- verify `updatedAt` is sensible; recency still matters
- inspect whether duplicate ids exist between persisted records and in-session receipts

Useful signals:
- `scoreDomainMatch()` now applies module bias directly
- `tokenize()` and tag matching now de-duplicate and normalize case
- scored records sort by score, then `updatedAt`, then `id` for determinism

## Inspecting Router Fallback Behavior

Primary files:
- `src/features/chat/model-router.ts`
- `src/features/chat/router-fallback.ts`
- `src/integrations/providers/orchestrator-provider.ts`

If a route fell back:
- check `routeResult.routedBy`
- inspect `routeResult.fallbackReason`
- confirm whether the bridge was absent, the model response was malformed, or credentials were blocked

Current truth:
- the shared fallback classifier is authoritative for heuristic routing
- `toOrchestratorRoute()` now maps to real provider keys
- direct orchestrator routing and chat routing use the same fallback logic

## Provider Failure Triage Order

1. Check provider result `status`
2. Check `failure.code`
3. Check `trace` fields for staged/audit correlation
4. Check SAFETY flags
5. Check governance store
6. Check runtime connector diagnostics
7. Check persisted runtime files in `jarvis-runtime/`

## Common Failure Patterns

`capability_network_disabled`
- Root cause: `CAPABILITIES.network=false`
- First place: `src/shared/operational-safety.ts`

`no_bridge`
- Root cause: running outside Electron or missing preload wiring
- First place: `electron/preload.ts`, `electron/main.ts`

`credentials_missing`
- Root cause: env var absent or intentionally unreadable under `NO_SECRETS_MODE`
- First place: `.env`, runtime diagnostics, provider `describe()`

`ics_source_unavailable`
- Root cause: neither `ICS_CALENDAR_URL` nor `jarvis-runtime/time/calendar.ics` is available
- First place: `src/integrations/adapters/calendar/ics-adapter.ts`

Activation mismatch notes in SystemOps
- Root cause: docs/state drift or a provider was marked activated before the code path was actually ready
- First place: `jarvis-runtime/activation/activation-state.json` and `src/integrations/runtime/readiness-engine.ts`

Silent empty data from SAFE_ROOT
- Root cause: missing file or parse failure now emits warnings
- First place: `src/integrations/runtime/files.ts`
