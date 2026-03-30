# Functional Replacement Plan

> Superseded for the next implementation pass. The active source of truth for the deferred Windows/Linux rebuild is [`SKILL_REPLACEMENT_AUDIT.md`](/Users/ahmedh005/Jarvis/SKILL_REPLACEMENT_AUDIT.md), [`SKILL_SELECTION_MATRIX.md`](/Users/ahmedh005/Jarvis/SKILL_SELECTION_MATRIX.md), and [`MODULE_RESTRUCTURE_PLAN.md`](/Users/ahmedh005/Jarvis/MODULE_RESTRUCTURE_PLAN.md).

## Objective

Keep Jarvis looking like Jarvis while replacing weak custom behavior with truthful, provider-backed execution underneath the existing UI shell.

## Current Functionality Inventory

| Domain | What the UI implies | What is actually implemented | Fake / demo / partial / weak | Real and should be kept | Decision |
| --- | --- | --- | --- | --- | --- |
| Command Center / mission routing | Intent-aware handoff to the right Jarvis capability | Command routing now passes through `OrchestratorProvider` via [`src/integrations/providers/orchestrator-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/orchestrator-provider.ts) and [`src/store/mission-intake.ts`](/Users/ahmedh005/Jarvis/src/store/mission-intake.ts) | Routing is still heuristic, not model-backed; old "active agent" style certainty was overstated | Shared action states, staged missions, truthful unavailable reasons | `REFACTOR` |
| Concierge email | Real inbox, draft, review, approve, send | Gmail fetch/send is real through Electron bridge and `MailProvider`; Concierge orchestration now routes through `ConciergeProvider` | Previous seeded concierge data overstated readiness; draft generation still depends on OpenClaw/fallback logic | Gmail bridge, approval queue, outbound draft/send lifecycle | `KEEP_BUT_WRAP` |
| Concierge phone / reservations | Real phone and booking help | Twilio outbound calling is real; reservations remain a curated workflow with booking briefs, phone handoff, and calendar linkage | Booking discovery remains custom heuristics and directory data; not a live reservation network | Twilio bridge, explicit approval boundary, booking receipts | `KEEP_BUT_WRAP` |
| Concierge monitoring | Ongoing active monitoring | Monitoring worker now reports unavailable/failed truthfully instead of pretending to monitor | The previous monitoring path was effectively a stub | Honest unavailability surface | `REPLACE_WITH_PROVIDER` |
| Coding Team / Builder | Multi-agent coding team with planning, execution, verification, history | Real Builder planning, approval, execution, verification, and history are wrapped by `BuilderProvider`; store and tab loaders now call the provider | Team persona complexity is mostly presentation; some remediation creation still uses custom request shaping | Builder bridge, checker verification bridge, execution history | `KEEP_BUT_WRAP` |
| Calendar / reminders | Real scheduling and reminder control | Calendar actions now route through `CalendarProvider`; local persisted calendar store is the real backend | No Apple/Google calendar connector yet; reminders are still local overlay only | Persisted local calendar state, recurrence logic, renderer compatibility | `KEEP_BUT_WRAP` |
| Memory / context | Grounded recall across personal and project context | `MemoryProvider` reads grounded files, local memory store, and execution receipts | No embeddings/vector search; old memory claims were looser than the implementation | Filesystem-backed notes, receipts, scoped memory separation | `REFACTOR` |
| Media / speech / voice | Real voice and music generation | Speech routes through `SpeechProvider`; music routes through `MediaProvider`; native TTS fallback stays real | Silent mock audio was fake and has been removed; instrument layers are descriptive-only when no real provider exists | ElevenLabs bridges, native speech fallback, honest unavailable states | `REFACTOR` |
| System / runtime truth | Live operational health and connector state | `RuntimeProvider` aggregates provider readiness plus Electron diagnostics for OpenClaw, Gmail, Twilio, ElevenLabs, Telegram | Older status surfaces were scattered and partially adapter-driven | Central diagnostics, capability flags, provider health | `REFACTOR` |
| Finance | Operational finance surface | No grounded provider implementation was found in the current repo | Any implied sync or authority would be fake today | None yet beyond capability planning | `DELETE` for fake behavior, `UNAVAILABLE` until a real provider exists |

## Target Provider Map

| Domain | Provider interface | Current implementation status | Recommended capability / integration source | Fallback plan |
| --- | --- | --- | --- | --- |
| Orchestration / routing | `OrchestratorProvider` | Landed, heuristic router with shared action records | Upgrade later to an LLM-backed classifier using the existing Builder / OpenClaw planning surface | Keep heuristic routing but continue surfacing confidence and unavailable states |
| Mail | `MailProvider` | Landed, Gmail-backed | Gmail OAuth refresh-token flow already present in Electron | Expose unconfigured state and allow draft-only local staging |
| Concierge | `ConciergeProvider` | Landed, wraps inbox/phone/booking/docs flows | Keep the current concierge worker graph but continue replacing ad hoc logic with provider-backed workers | Limit actions to staging and approvals when connectors are missing |
| Builder / coding | `BuilderProvider` | Landed, wraps plan/request/run/history/verify | Existing Builder bridge plus checker bridge | Return unavailable instead of adapter-level demo fallback |
| Calendar | `CalendarProvider` | Landed, local persisted provider | Future Apple Calendar / Google Calendar adapter | Keep local store provider as degraded but truthful mode |
| Reminders | `ReminderProvider` | Landed, local reminder overlay | Future Apple Reminders / Google Tasks adapter | Keep local-only reminder state if no external connector exists |
| Memory | `MemoryProvider` | Landed, grounded filesystem + receipts | Optional future SQLite/vector index if Jarvis needs deeper search | Continue file-backed retrieval with explicit source attribution |
| Speech | `SpeechProvider` | Landed, ElevenLabs + native fallback | ElevenLabs for premium TTS, browser-native speech as local fallback | Native browser speech only |
| Media | `MediaProvider` | Landed, ElevenLabs-backed | ElevenLabs music/audio generation already wired in Electron | Truthful unavailable state; no fake audio fallback |
| Runtime | `RuntimeProvider` | Landed, centralized provider + connector health | Keep as the shared truth source for System and Command Center | Cached provider descriptors plus explicit missing-config reasons |

## Replacement Priority

1. Orchestration / action state: completed foundation. Shared action, approval, receipt, and route-state models are now in place and should remain the backbone for every future domain.
2. Concierge truthfulness: completed first pass. Seeded fake inbox/admin data was removed, Gmail/Twilio now sit behind provider boundaries, and monitoring no longer lies.
3. System diagnostics: completed first pass. Runtime health is centralized and no longer depends on scattered direct status checks.
4. Builder routing: completed first pass. Builder stores and key coding surfaces now use `BuilderProvider`.
5. Calendar compatibility layer: completed first pass. Existing calendar UI now routes through `CalendarProvider` via async action wrappers.
6. Memory grounding: completed first pass at provider level. The next step is to mount provider-backed memory surfaces wherever the UI exposes memory.
7. Media / speech: completed first pass. Fake audio fallback was removed; the next step is richer provider selection and STT support.

## Risks / Trade-Offs

| Replacement | Benefits | Risks | Environmental dependencies |
| --- | --- | --- | --- |
| Gmail through `MailProvider` | Real inbox/send behavior with explicit config state | Sensitive actions need strict approval boundaries; OAuth token drift can break mail silently if not surfaced | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER_EMAIL` |
| Twilio through concierge/phone workers | Real outbound calling and status callbacks | Requires a reachable webhook base URL and correctly configured Twilio number; booking calls are still not the same as direct booking authority | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, optional public webhook URL |
| Builder bridge through `BuilderProvider` | Swappable builder backend boundary, truthful history/verification | The repo still contains some legacy adapter surfaces for remediation shaping and older unmounted tabs | Electron runtime, Builder bridge, checker bridge, OpenClaw/backend availability |
| Local calendar provider | Stable provider boundary without a redesign | Local persistence is not the same as external calendar sync; cross-device truth still depends on a future adapter | Zustand persistence only today |
| Grounded memory provider | Clear source attribution and operational receipts | Search depth is shallow without an index; memory quality depends on note hygiene | Filesystem bridge, local storage, action receipt store |
| ElevenLabs speech/media | Real media generation when configured | Credential gaps are common; browser-native TTS is only a partial fallback and there is no real music fallback | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` for speech voice selection |
| Runtime diagnostics aggregation | One truthful health source for system UI and command routing | Only as complete as the bridges it can query; unmounted legacy tabs still need gradual migration | Electron preload bridge, provider registry |

## Keep / Wrap / Replace / Delete Summary

### Keep

- [`electron/openclaw.ts`](/Users/ahmedh005/Jarvis/electron/openclaw.ts): real local service bridge.
- [`electron/gmail.ts`](/Users/ahmedh005/Jarvis/electron/gmail.ts): real Gmail connector.
- [`electron/phone.ts`](/Users/ahmedh005/Jarvis/electron/phone.ts): real Twilio phone connector.
- [`src/adapters/builder-execution.ts`](/Users/ahmedh005/Jarvis/src/adapters/builder-execution.ts): real Builder run bridge.
- [`src/adapters/checker.ts`](/Users/ahmedh005/Jarvis/src/adapters/checker.ts): real verification bridge.

### Keep But Wrap

- [`electron/preload.ts`](/Users/ahmedh005/Jarvis/electron/preload.ts): still the bridge boundary, now extended with runtime diagnostics.
- [`src/store/builder-plan.ts`](/Users/ahmedh005/Jarvis/src/store/builder-plan.ts): UI store retained, execution moved behind `BuilderProvider`.
- [`src/store/builder-execution-request.ts`](/Users/ahmedh005/Jarvis/src/store/builder-execution-request.ts): approval UI retained, provider-backed settlement.
- [`src/store/builder-execution.ts`](/Users/ahmedh005/Jarvis/src/store/builder-execution.ts): execution UI retained, provider-backed starts/finalization.
- [`src/components/tabs/CodingTeamTab.tsx`](/Users/ahmedh005/Jarvis/src/components/tabs/CodingTeamTab.tsx): unchanged surface, truthful provider-backed history loading.
- [`src/components/tabs/TabShell.tsx`](/Users/ahmedh005/Jarvis/src/components/tabs/TabShell.tsx): unchanged shell, provider-backed coding loader.
- [`src/components/tabs/CalendarTab.tsx`](/Users/ahmedh005/Jarvis/src/components/tabs/CalendarTab.tsx): unchanged surface, provider-backed action calls.
- [`src/services/ttsService.ts`](/Users/ahmedh005/Jarvis/src/services/ttsService.ts): same service entry point, now delegated to `SpeechProvider`.

### Refactor

- [`electron/main.ts`](/Users/ahmedh005/Jarvis/electron/main.ts): now exports centralized runtime diagnostics IPC.
- [`src/store/mission-intake.ts`](/Users/ahmedh005/Jarvis/src/store/mission-intake.ts): mission routing now flows through `OrchestratorProvider`.
- [`src/components/tabs/CommandCenterTab.tsx`](/Users/ahmedh005/Jarvis/src/components/tabs/CommandCenterTab.tsx): same UI, new truthful unavailable states.
- [`src/store/concierge.ts`](/Users/ahmedh005/Jarvis/src/store/concierge.ts): seeded fake records removed and stripped during migration.
- [`src/features/concierge/conciergeOrchestrator.ts`](/Users/ahmedh005/Jarvis/src/features/concierge/conciergeOrchestrator.ts): key actions now delegate to `ConciergeProvider`.
- [`src/services/musicService.ts`](/Users/ahmedh005/Jarvis/src/services/musicService.ts): fake silent audio removed; provider-backed generation only.
- [`src/calendar/calendarActions.ts`](/Users/ahmedh005/Jarvis/src/calendar/calendarActions.ts): replaced by provider-backed compatibility wrappers.

### Replace With Provider

- [`src/integrations/contracts/providers.ts`](/Users/ahmedh005/Jarvis/src/integrations/contracts/providers.ts): new contract surface for all major domains.
- [`src/integrations/registry/providerRegistry.ts`](/Users/ahmedh005/Jarvis/src/integrations/registry/providerRegistry.ts): central provider selection layer.
- [`src/integrations/providers/runtime-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/runtime-provider.ts): centralized runtime truth.
- [`src/integrations/providers/mail-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/mail-provider.ts): Gmail provider wrapper.
- [`src/integrations/providers/concierge-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/concierge-provider.ts): concierge provider wrapper.
- [`src/integrations/providers/builder-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/builder-provider.ts): builder provider wrapper.
- [`src/integrations/providers/calendar-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/calendar-provider.ts): calendar/reminder providers.
- [`src/integrations/providers/memory-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/memory-provider.ts): grounded memory provider.
- [`src/integrations/providers/speech-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/speech-provider.ts): speech abstraction.
- [`src/integrations/providers/media-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/media-provider.ts): media generation abstraction.
- [`src/store/runtime.ts`](/Users/ahmedh005/Jarvis/src/store/runtime.ts): shared runtime snapshot store.
- [`src/store/action-runtime.ts`](/Users/ahmedh005/Jarvis/src/store/action-runtime.ts): shared action / approval / receipt model.

### Delete / Isolate

- Seeded concierge demo records in [`src/store/concierge.ts`](/Users/ahmedh005/Jarvis/src/store/concierge.ts) were removed from defaults and migration-cleaned from persisted state.
- Silent mock audio fallback in [`src/services/musicService.ts`](/Users/ahmedh005/Jarvis/src/services/musicService.ts) was removed.
- Fake monitoring success paths in [`src/features/concierge/workers/monitoringWorker.ts`](/Users/ahmedh005/Jarvis/src/features/concierge/workers/monitoringWorker.ts) were isolated behind honest unavailable/error reporting.
- Legacy adapter-driven demo surfaces in [`src/adapters/backend-files.ts`](/Users/ahmedh005/Jarvis/src/adapters/backend-files.ts) remain isolated for older unmounted tabs and should be retired incrementally rather than trusted as runtime truth.

## Remaining Follow-Up

- Replace heuristic command classification with a model-assisted router while keeping the same route object contract.
- Add external calendar/reminder adapters behind the existing provider contracts.
- Move remaining legacy remediation-request shaping into `BuilderProvider` if the Builder bridge grows that capability.
- Migrate unmounted System / Memory legacy tab data sources to `RuntimeProvider` and `MemoryProvider` if those tabs return to the active shell.
