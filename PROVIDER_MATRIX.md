# Provider Matrix

> Superseded for the next implementation pass. The active Windows/Linux-first skill choices now live in [`SKILL_SELECTION_MATRIX.md`](/Users/ahmedh005/Jarvis/SKILL_SELECTION_MATRIX.md).

| Domain | Provider interface | Chosen implementation | Alternatives considered | Required env / config | Current status | Next steps |
| --- | --- | --- | --- | --- | --- | --- |
| Command routing | `OrchestratorProvider` | `HeuristicOrchestratorProvider` in [`src/integrations/providers/orchestrator-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/orchestrator-provider.ts) | OpenClaw classifier, planner-led route model | Electron runtime optional; downstream providers determine readiness | `partial-ready` | Replace keyword scoring with model-assisted route classification |
| Mail | `MailProvider` | `GmailMailProvider` in [`src/integrations/providers/mail-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/mail-provider.ts) | Apple Mail adapter, Fastmail adapter | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER_EMAIL` | `ready-if-configured` | Add additional mail providers behind the same contract |
| Concierge workflows | `ConciergeProvider` | `DefaultConciergeProvider` in [`src/integrations/providers/concierge-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/concierge-provider.ts) | Dedicated admin workflow engine, MCP-style admin skill | Gmail and/or Twilio config; OpenClaw optional for drafting | `partial-ready` | Continue replacing worker-local heuristics with provider-backed subflows |
| Builder / coding | `BuilderProvider` | `BuilderBridgeProvider` in [`src/integrations/providers/builder-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/builder-provider.ts) | Direct OpenClaw task executor, alternate coding backend | Electron Builder bridge, checker bridge | `ready-in-electron` | Add remediation-request creation to the provider contract if needed |
| Calendar | `CalendarProvider` | `LocalCalendarProvider` in [`src/integrations/providers/calendar-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/calendar-provider.ts) | Apple Calendar adapter, Google Calendar adapter | None beyond local persisted store | `ready-local-only` | Add external sync providers behind the same interface |
| Reminders | `ReminderProvider` | `LocalReminderProvider` in [`src/integrations/providers/calendar-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/calendar-provider.ts) | Apple Reminders, Google Tasks | None beyond local persisted store | `partial-local-only` | Introduce a real reminder connector |
| Memory | `MemoryProvider` | `GroundedMemoryProvider` in [`src/integrations/providers/memory-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/memory-provider.ts) | SQLite memory index, vector store, external memory service | Filesystem bridge and local storage | `ready` | Add deeper indexed search if recall quality becomes limiting |
| Speech | `SpeechProvider` | `DefaultSpeechProvider` in [`src/integrations/providers/speech-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/speech-provider.ts) | ElevenLabs-only path, native-only path | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` for premium voice; browser speech for fallback | `ready-with-degraded-fallback` | Add STT provider and selector support |
| Media | `MediaProvider` | `ElevenLabsMediaProvider` in [`src/integrations/providers/media-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/media-provider.ts) | Local audio pipeline, alternate hosted media provider | `ELEVENLABS_API_KEY` | `ready-if-configured` | Add alternate media providers; keep no-fake fallback rule |
| Runtime / health | `RuntimeProvider` | `DefaultRuntimeProvider` in [`src/integrations/providers/runtime-provider.ts`](/Users/ahmedh005/Jarvis/src/integrations/providers/runtime-provider.ts) | Scattered ad hoc status polling | Electron `runtime:getDiagnostics` preload bridge | `ready` | Use this as the only system truth source for future tabs |

## Registry

- Registry file: [`src/integrations/registry/providerRegistry.ts`](/Users/ahmedh005/Jarvis/src/integrations/registry/providerRegistry.ts)
- Shared action model: [`src/store/action-runtime.ts`](/Users/ahmedh005/Jarvis/src/store/action-runtime.ts)
- Shared runtime snapshot store: [`src/store/runtime.ts`](/Users/ahmedh005/Jarvis/src/store/runtime.ts)

## Notes

- The chosen implementations favor integrations already present in the repo over speculative rewrites.
- Where no real external provider exists yet, the fallback is explicit degraded or unavailable state, not synthetic success.
- Finance intentionally remains outside the matrix until a real provider can be attached without faking authority.
