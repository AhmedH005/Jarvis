# Cleanup Report

Updated: 2026-03-29

This cleanup pass was conservative. Only code with clear proof of staleness or duplication was removed or isolated.

| File / Path | Removed or isolated | Why it was stale | Replacement / live path | Risk notes |
|---|---|---|---|---|
| `src/integrations/providers/orchestrator-provider.ts` | Removed embedded heuristic signal table and route builder duplication | It duplicated the shared fallback router and had already drifted from typed routing/provider-key truth. | Shared fallback in `src/features/chat/router-fallback.ts` plus adapter in `src/features/chat/model-router.ts`. | Low risk; `routeMission()` still exists and now delegates to the shared logic. |
| `src/features/chat/model-router.ts` | Removed unused classification prompt constant | The prompt string was no longer consumed by the actual IPC classifier path. | Live path is the bridge call plus fallback handling already in `classifyCommand()`. | Low risk; pure dead code removal. |
| `src/features/chat/router-types.ts` | Removed unused `LOW_CONFIDENCE_THRESHOLD` constant | The constant was no longer referenced anywhere. | Confidence handling remains in `model-router.ts` and `router-fallback.ts`. | Low risk. |
| `src/integrations/adapters/calendar/ics-adapter.ts` | Removed unused `icsUrlConfigured()` helper | It was no longer referenced after direct bridge/config checks became the real source of truth. | Live path is `tryFetchRemoteICS()` and `tryReadLocalICS()`. | Low risk. |
| `src/integrations/adapters/calendar/google-calendar-adapter.ts` | Removed obsolete local `success()` / `failure()` helpers | Shared calendar result helpers replaced ad hoc success/failure builders. | `calendarSuccessResult()` / `calendarFailureResult()` in `src/integrations/contracts/result-helpers.ts`. | Low risk. |
| `src/integrations/providers/calendar-provider.ts` | Removed obsolete local read `success()` helper | Shared calendar result helpers now provide normalized status/trace behavior. | `calendarSuccessResult()` / `calendarFailureResult()` in `src/integrations/contracts/result-helpers.ts`. | Low risk. |
| `src/integrations/governance/skill-governance.ts` | Removed duplicate audit write side effect | Auditing also happened in `enforce()`, creating duplicate entries for one action. | Single authoritative audit write in `src/integrations/governance/governance-enforcer.ts`. | Medium-value cleanup; materially improves audit signal. |
| `src/integrations/runtime/safety.ts` | Removed unconditional dry-run suffixing in `stageAction()` | It mislabeled non-dry-run staged actions and governance audit entries as dry-run blocks. | Callers now provide truthful summaries, while result helpers provide normalized status. | Medium-value behavior cleanup; improves operator trust in logs. |
| `src/integrations/providers/builder-heuristics.ts` | Isolated pure builder heuristics from provider runtime code | The logic was live but coupled too tightly to the provider, which made testing and debugging harder. | Provider now imports the isolated pure helper module. | Low risk; behavior preserved with better testability. |
| `src/integrations/governance/governance-decision.ts` | Isolated pure governance decision logic from store/runtime concerns | This was not dead code, but isolating it removed duplication pressure and made decisions directly testable. | `checkSkillGovernance()` now delegates to the pure helper. | Low risk; improves maintainability and verification. |

Not removed on purpose:

- `stageCounterBump()` in `src/integrations/governance/skill-governance-store.ts`
  It is currently unused, but it represents a plausible future governance metric path. It was left in place and should be revisited only if the governance store stays action-count-free.

- `activation-state.json`
  The file is machine-local operator state, not just documentation. It was audited and compared against readiness, but not rewritten automatically in this pass.
