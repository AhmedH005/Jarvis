# Skill Governance Plan

Updated: 2026-03-29

---

## Overview

The Skill Governance Layer answers six questions before any skill-backed action executes:

1. **What skills are installed or wired?** — inventoried from the known skill catalog
2. **What each skill is allowed to do?** — explicit permission scopes (additive, least-privilege)
3. **Whether the skill was vetted?** — trust level in the governance store
4. **What trust level it has?** — `unknown | unverified | vetted | trusted | restricted | blocked`
5. **What actions it attempted?** — per-skill action counters + audit trail
6. **Whether an action requires elevated consent?** — `requires_elevated_approval` decision

This layer is deterministic, inspectable, and safe. No trust is assumed. No skill silently gains permissions.

---

## Trust Model

### Trust Levels

| Level | Meaning | Execution |
|-------|---------|-----------|
| `unknown` | Not yet assessed | Staging permitted; live execution blocked until vetted |
| `unverified` | Seen, but not reviewed | Staging permitted; live execution blocked |
| `vetted` | Passed governance review | Allowed within explicitly granted scopes |
| `trusted` | Explicitly elevated | Full granted-scope execution |
| `restricted` | Limited — needs consent | Requires elevated approval before execution |
| `blocked` | Rejected entirely | No staging or execution permitted |

**Default: `unknown`**. No skill ever defaults to `vetted` or `trusted`.

### Permission Scopes

Permission scopes are additive. A skill has only what is explicitly granted.

| Scope | What It Covers |
|-------|----------------|
| `read_files` | Read files within SAFE_ROOT |
| `write_files` | Write or mutate local files |
| `network` | Outbound HTTP/network calls |
| `external_api` | Third-party API calls |
| `email` | Read or send email |
| `calendar` | Read or write calendar data |
| `media_generation` | Generate audio/video/image |
| `dev_execution` | Execute code, scripts, agent tasks |
| `browser_automation` | Drive browser or web automation |

---

## Governance Decision Logic

```
checkSkillGovernance(skillId, providerKey, action, requiredScopes, isWriteOp)
```

Priority order (first match wins):

1. `trustLevel === 'blocked'` → `blocked_by_governance`
2. `missingPermissions.length > 0` → `blocked_by_governance`
3. `trustLevel === 'restricted'` → `requires_elevated_approval`
4. capability gate blocks required scope → `blocked_by_capability`
5. `isWriteOp && DRY_RUN` → `blocked_by_dry_run`
6. `unknown` or `unverified` trust → `allowed_to_stage` (flagged for vetting)
7. `vetted/trusted` + permissions satisfied → `allowed_to_stage`

Every check produces a `GovernanceCheckResult` with:
- `decision` — what was decided
- `trustLevel` — current trust level
- `reason` — human-readable explanation
- `permissionsRequired` — what the action needed
- `permissionsGranted` — what the skill has
- `permissionsMissing` — what's missing

Every check is written to the audit trail.

---

## Known Skill Catalog

| Skill ID | Source | Default Permissions |
|----------|--------|---------------------|
| `agent-task-manager` | openclaw | `dev_execution`, `network` |
| `agent-orchestrator` | openclaw | `dev_execution`, `network` |
| `advanced-calendar` | openclaw | `calendar`, `external_api` |
| `cron-scheduling` | openclaw | `dev_execution` |
| `agent-mail-cli` | openclaw | `email`, `external_api`, `network` |
| `bookameeting` | openclaw | `calendar`, `external_api`, `network` |
| `elevenlabs-tts` | openclaw | `external_api`, `media_generation` |
| `elevenlabs-transcribe` | openclaw | `external_api` |
| `eachlabs-music` | openclaw | `external_api`, `media_generation` |
| `brainrepo` | builtin | `read_files` |
| `context-anchor` | builtin | `read_files` |
| `actual-budget` | openclaw | `read_files`, `external_api` |

Default permissions are assigned at inventory time. Trust level defaults to `unknown`.

---

## Storage

### Governance Store
```
jarvis-runtime/governance/skills.json
```
Format: `Record<skillId, SkillGovernanceRecord>` (JSON object)
- local-first, structured, deterministic, inspectable
- reads always live
- writes always staged under DRY_RUN

### Audit Log
```
jarvis-runtime/governance/audit-log.jsonl
```
Format: newline-delimited JSON (one `GovernanceAuditEntry` per line)
- append-only
- in-session entries also captured in the action store
- readable with any JSON parser

---

## Verification Hooks

| Function | Effect |
|----------|--------|
| `markSkillVetted(skillId, notes?)` | Sets trust to `vetted`, verifiedBy: 'user' |
| `restrictSkill(skillId, reason)` | Sets trust to `restricted`, records reason |
| `blockSkill(skillId, reason)` | Sets trust to `blocked`, records reason |
| `grantPermission(skillId, scope)` | Adds scope to permissions (idempotent) |
| `revokePermission(skillId, scope)` | Removes scope from permissions |
| `inventorySkills()` | Scans known skill catalog, creates missing records |
| `explainGovernanceRecord(record)` | Returns human-readable state summary |

All hooks are staged — no live writes under DRY_RUN.

---

## Audit Trail

Every governance check produces a `GovernanceAuditEntry`:

```typescript
{
  entryId:     string     // stable unique id
  timestamp:   string     // ISO 8601
  skillId:     string
  providerKey: string
  action:      string     // human-readable description
  decision:    GovernanceDecision
  trustLevel:  SkillTrustLevel
  reason:      string
  stagedActionId?: string
}
```

In-session entries are accessible via `getInSessionAuditLog()`.
Persisted entries are read from `governance/audit-log.jsonl` via `loadPersistedAuditLog()`.
Both are merged via `getFullAuditLog()`.

---

## SystemOpsTab Integration

The SYSTEM tab shows a minimal SKILL GOVERNANCE card with:
- Total skills tracked in governance store
- Unvetted count (unknown + unverified)
- Restricted count
- Blocked count
- Named list of blocked/restricted skills

No redesign. Content-only addition.

---

## Current Status

| Item | Status |
|------|--------|
| Governance types | LIVE |
| Governance store | LIVE_READ_ONLY (`skills.json` empty, write-ready) |
| Audit trail | LIVE (in-session); `WIRED_BLOCKED_BY_DRY_RUN` for disk writes |
| Enforcement layer | LIVE (deterministic checks) |
| Skill inventory | LIVE (12 known skills cataloged) |
| Verification hooks | LIVE (staged) |
| SystemOpsTab surfacing | LIVE (governance summary card) |

**Promotion path for governance writes:**
1. Set `DRY_RUN=false`
2. Set `CAPABILITIES.write=true`
3. → Records persisted to `jarvis-runtime/governance/skills.json`
4. → Audit entries appended to `jarvis-runtime/governance/audit-log.jsonl`

---

## File Map

| File | Role |
|------|------|
| `src/shared/skill-governance-types.ts` | All canonical governance types and constants |
| `src/integrations/governance/skill-governance-store.ts` | SAFE_ROOT read/stage for governance records |
| `src/integrations/governance/skill-governance.ts` | Enforcement, inventory, verification hooks |
| `src/integrations/governance/audit-trail.ts` | Append-only audit log (in-session + persisted) |
| `jarvis-runtime/governance/skills.json` | Live governance store (empty, write-ready) |
| `jarvis-runtime/governance/audit-log.jsonl` | Audit log (empty, append-ready) |
| `src/components/tabs/SystemOpsTab.tsx` | SKILL GOVERNANCE card added |

---

## Remaining Work

- Wire `checkSkillGovernance()` into provider execution paths when DRY_RUN is lifted
- Wire `inventorySkills()` to run on startup (so store is populated from first launch)
- Implement disk write path for `skills.json` and `audit-log.jsonl` (when write capability enabled)
- Add operator UI to promote skill trust level (vetted/trusted/restricted/blocked)
- Add provenance check against live OpenClaw manifest when gateway is online
