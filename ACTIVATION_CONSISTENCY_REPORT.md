# Activation Consistency Report

Updated: 2026-03-29

This report compares the activation/readiness documents and machine-local activation state against the current code after the hardening pass.

## Major corrections made

| Artifact | Previous inconsistency | Current correction |
|---|---|---|
| `ACTIVATION_COMMANDS.md` and related docs | `markSkillVetted()` and `grantPermission()` were documented with extra operator arguments that the real code does not accept. | Commands were corrected to the actual function signatures used in code. |
| Activation docs | Multiple documents treated `allowed_read_only` as the top-level audit decision. | Docs now distinguish between governance `decision` and effective read-only result/outcome semantics. |
| Readiness docs | Memory writes, calendar writes, concierge draft/booking, and builder actions were described as flag-only promotions. | Docs now reflect that these remain staged-only until live execution paths are implemented. |
| Calendar docs | ICS local read was treated as live by default. | Docs now require an actual local ICS file before claiming local ICS live-read status. |
| Router docs | Some sections implied the model router was waiting on `ANTHROPIC_API_KEY` even when the key is present but blocked by `NO_SECRETS_MODE`. | Docs now separate “credential present but blocked” from “credential absent.” |
| Runtime/System truth | Activation/readiness drift was previously manual to spot. | Runtime snapshot now emits activation mismatch notes automatically. |

## Current artifact status

| Artifact | Status | Notes |
|---|---|---|
| `EXECUTION_ENABLEMENT_PLAN.md` | Updated | Promotion order now distinguishes real live candidates from stage-only placeholders. |
| `READINESS_SMOKE_TESTS.md` | Updated | Smoke tests now reference normalized provider result status/trace fields where relevant. |
| `ACTIVATION_CHECKLIST.md` | Updated | Checklist no longer implies unsupported write activations are immediately promotable. |
| `PROVIDER_RUNBOOKS.md` | Updated | Runbooks now separate live-capable providers from staged-only providers. |
| `ACTIVATION_COMMANDS.md` | Updated | Operator commands now match the real API signatures. |
| `PRE_LIVE_AUDIT.md` | Updated | Risk framing now explicitly calls out staged-only gaps. |
| `LIVE_INTEGRATION_STATUS.md` | Updated | Rebased to current safety flags and post-hardening runtime truth. |
| `SKILL_WIRING_LOG.md` | Updated | Rebased to current provider/skill wiring and blocker truth. |
| `jarvis-runtime/activation/activation-state.json` | Audited, not rewritten | Still contains partial tracking only; runtime mismatch detection now surfaces drift instead of silently trusting it. |

## Remaining inconsistencies or limits

| Item | Severity | Why it remains |
|---|---:|---|
| `activation-state.json` tracks only a subset of actions/providers | Medium | It is machine-local state and was not auto-expanded in this pass. Runtime mismatch detection now calls out omissions. |
| No real credentialed activation has been executed on the target machine | High | Documentation is now honest, but live activation still requires manual operator validation. |
| Stage-only providers still appear in some older narrative documents in git history | Low | The current documents were updated, but older branch history still contains superseded text. |

## Bottom line

The activation docs now match the hardened code closely enough to use as an operator guide. The remaining gap is no longer “documentation drift”; it is real implementation scope: several write paths are still intentionally staged-only and must remain so until live bridges are built.
