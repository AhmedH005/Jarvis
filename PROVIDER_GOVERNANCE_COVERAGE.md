# Provider Governance Coverage

Updated: 2026-03-29

---

## Enforcement Chain

Every skill-backed provider action now follows this chain:

```
provider action called
  → enforce(skillId, providerKey, action, requiredScopes, isWriteOp)
    → checkSkillGovernance()    [trust + permissions + capability + DRY_RUN]
      → recordAuditEntry()      [appended to action store + staged to audit-log.jsonl]
    → EnforcementResult returned
  → if !result.allowed → toOperationResult(result) / toCalendarResult(result) returned early
  → else → existing provider logic continues (DRY_RUN, capability gates, bridge calls)
```

**Single shared path:** `src/integrations/governance/governance-enforcer.ts`

---

## Coverage Table

### Mail Provider (`concierge-mail-skill` / `agent-mail-cli`)

| Action | Skill ID | Scopes Required | Write Op | Governance Coverage |
|--------|----------|-----------------|----------|---------------------|
| `fetchRecentMessages` | `agent-mail-cli` | `external_api`, `network` | No | ✅ COVERED |
| `sendMessage` | `agent-mail-cli` | `email`, `external_api`, `network` | Yes | ✅ COVERED |

---

### Concierge Provider (`concierge-skill-provider`)

| Action | Skill ID | Scopes Required | Write Op | Governance Coverage |
|--------|----------|-----------------|----------|---------------------|
| `syncInboxFromGmail` | — | — | No | ✅ DELEGATED (delegates to mail provider which is covered) |
| `generateDraftReplyForEmail` | `agent-mail-cli` | `email` | Yes | ✅ COVERED |
| `queueDraftReplyForApproval` | `agent-mail-cli` | `email` | Yes | ✅ COVERED |
| `dispatchOutboundCall` | `bookameeting` | `external_api`, `network` | Yes | ✅ COVERED |
| `dispatchBookingRequest` | `bookameeting` | `calendar`, `external_api`, `network` | Yes | ✅ COVERED |
| `approveAction` | — | — | No | N/A (local store only, no external skill) |
| `rejectAction` | — | — | No | N/A (local store only, no external skill) |

---

### Speech Provider (`creation-speech-provider` / `elevenlabs-tts`)

| Action | Skill ID | Scopes Required | Write Op | Governance Coverage |
|--------|----------|-----------------|----------|---------------------|
| `speak` | `elevenlabs-tts` | `external_api`, `media_generation` | Yes | ✅ COVERED |

---

### Media Provider (`creation-skill-provider` / `eachlabs-music`)

| Action | Skill ID | Scopes Required | Write Op | Governance Coverage |
|--------|----------|-----------------|----------|---------------------|
| `generateTrack` | `eachlabs-music` | `external_api`, `media_generation` | Yes | ✅ COVERED |

---

### Builder Provider (`builder-skill-provider` / `agent-task-manager`)

| Action | Skill ID | Scopes Required | Write Op | Governance Coverage |
|--------|----------|-----------------|----------|---------------------|
| `requestPlan` | `agent-task-manager` | `dev_execution` | Yes | ✅ COVERED |
| `createExecutionRequest` | `agent-task-manager` | `dev_execution` | Yes | ✅ COVERED |
| `settleExecutionRequest` | `agent-task-manager` | `dev_execution` | Yes | ✅ COVERED |
| `startExecution` | `agent-task-manager` | `dev_execution` | Yes | ✅ COVERED |
| `finalizeExecution` | `agent-task-manager` | `dev_execution` | Yes | ✅ COVERED |
| `verifyRun` | `agent-task-manager` | `dev_execution` | No | ✅ COVERED |
| `loadHistory` | — | — | No | N/A (returns unavailable, no skill call) |

---

### Calendar Provider (`composed-calendar-provider` / `advanced-calendar`)

| Action | Skill ID | Scopes Required | Write Op | Governance Coverage |
|--------|----------|-----------------|----------|---------------------|
| `listEvents` | `advanced-calendar` | `calendar` | No | ✅ COVERED |
| `createEvent` | `advanced-calendar` | `calendar`, `write_files` | Yes | ✅ COVERED |
| `updateEvent` | `advanced-calendar` | `calendar`, `write_files` | Yes | ✅ COVERED |
| `moveEvent` | `advanced-calendar` | `calendar`, `write_files` | Yes | ✅ COVERED |
| `deleteEvent` | `advanced-calendar` | `calendar`, `write_files` | Yes | ✅ COVERED |
| `createRecurringEvents` | `cron-scheduling` | `calendar`, `write_files`, `dev_execution` | Yes | ✅ COVERED |

*Note: LocalCalendarProvider and adapter implementations (GoogleCalendarAdapter, ICSCalendarAdapter) are gated upstream by ComposedCalendarProvider's governance check.*

---

### Orchestrator Provider (`agent-task-manager-router`)

| Action | Skill ID | Scopes Required | Write Op | Governance Coverage |
|--------|----------|-----------------|----------|---------------------|
| `routeMission` | — | — | No | N/A (pure heuristic, no skill call, no I/O) |
| `stageMission` | `agent-task-manager` | `dev_execution` | Yes | ✅ COVERED (audit-only; return type is ActionRecord, not ProviderOperationResult) |

*Note: `stageMission` governance check is fire-and-forget for auditing. Blocking is enforced by downstream provider calls when routes are executed.*

---

### Memory Provider (`memory-skill-provider`)

| Action | Skill ID | Scopes Required | Write Op | Governance Coverage |
|--------|----------|-----------------|----------|---------------------|
| `snapshot` | — | — | No | N/A (local read from safe-root only) |
| `search` | — | — | No | N/A (local read) |
| `write` | `brainrepo` | `write_files` | Yes | ✅ COVERED |
| `query` | — | — | No | N/A (local structured store read) |
| `getById` | — | — | No | N/A (local read) |
| `ingest` | `brainrepo` | `write_files` | Yes | ✅ COVERED |
| `storeReport` | — | — | No | N/A (local read) |

---

### Runtime Provider (`runtime-skill-provider`)

| Action | Skill ID | Scopes Required | Write Op | Governance Coverage |
|--------|----------|-----------------|----------|---------------------|
| `getSnapshot` | — | — | No | N/A (introspection only, no skill call) |

---

## Gap Analysis

| Gap | Status | Notes |
|-----|--------|-------|
| LocalCalendarProvider write methods | NOT COVERED | These are gated upstream by ComposedCalendarProvider; direct calls are only used internally |
| Google/ICS adapter write methods | NOT COVERED | Gated upstream by ComposedCalendarProvider |
| Orchestrator `stageMission` blocking | AUDIT-ONLY | Can't short-circuit without changing return type; blocking enforced downstream |
| `approveAction` / `rejectAction` | N/A | Local store mutations; no skill, no network, no external I/O |
| Runtime `getSnapshot` | N/A | Read-only introspection |

---

## Enforcement Outcomes

| Outcome | `allowed` | When |
|---------|-----------|------|
| `allowed_to_stage` | true | Trust vetted/trusted/unknown + permissions satisfied + write op (under DRY_RUN) |
| `allowed_read_only` | true | Trust ok + permissions satisfied + read op |
| `blocked_by_governance` | false | Trust=blocked OR missing required permission scopes |
| `requires_elevated_approval` | true | Trust=restricted (staging proceeds; live exec needs consent) |
| `blocked_by_capability` | false | Required capability (network/execute) is disabled |
| `blocked_by_dry_run` | true | Write op under DRY_RUN (normal staging path) |

---

## Audit Trail

Every `enforce()` call produces a `GovernanceAuditEntry` with:
- `entryId`, `timestamp`, `skillId`, `providerKey`, `action`
- `decision` (GovernanceDecision from `checkSkillGovernance`)
- `trustLevel`, `reason`
- `enforcementOutcome` (final `EnforcementOutcome`)
- `permissionsRequired`, `permissionsMissing`
- `isWriteOp`

In-session entries: accessible via `getInSessionAuditLog()` from action store.
Persisted entries: staged to `jarvis-runtime/governance/audit-log.jsonl`.

---

## Files Modified

| File | Change |
|------|--------|
| `src/integrations/governance/governance-enforcer.ts` | **CREATED** — shared enforcement utility |
| `src/shared/skill-governance-types.ts` | Added `EnforcementOutcome` type + Phase-5 fields to `GovernanceAuditEntry` |
| `src/integrations/governance/audit-trail.ts` | Updated `recordAuditEntry` comment for richer fields |
| `src/integrations/providers/mail-provider.ts` | `fetchRecentMessages`, `sendMessage` → enforce() |
| `src/integrations/providers/concierge-provider.ts` | 4 write methods → enforce() |
| `src/integrations/providers/speech-provider.ts` | `speak` → enforce() |
| `src/integrations/providers/media-provider.ts` | `generateTrack` → enforce() |
| `src/integrations/providers/builder-provider.ts` | 6 action methods → enforce() |
| `src/integrations/providers/calendar-provider.ts` | `listEvents` + 5 write methods → enforce() |
| `src/integrations/providers/orchestrator-provider.ts` | `stageMission` → enforce() (audit-only) |
| `src/integrations/providers/memory-provider.ts` | `write`, `ingest` → enforce() |
