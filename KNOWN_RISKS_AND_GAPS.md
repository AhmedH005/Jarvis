# Known Risks And Gaps

Updated: 2026-03-29

This is the honest remainder after the hardening pass. These are not hypothetical; they are the places most likely to matter during first activation on a new machine.

## Not fully verified yet

- No real Gmail, Google Calendar, Anthropic, ElevenLabs, or OpenClaw live call was executed in this pass.
- No end-to-end Electron smoke test was run after the hardening changes.
- No provider was promoted on a real machine with credentials and network enabled.

## Depends on the new machine

- Electron preload/main bridge availability
- SAFE_ROOT path and file permissions
- Presence of local ICS/calendar/runtime files
- Audio routing for TTS/media playback
- OpenClaw gateway availability and installed skill inventory

## Depends on credentials

- Gmail read/send
- Google Calendar read
- Anthropic model-assisted routing
- ElevenLabs speech/media
- Any booking or external provider later wired behind concierge

## Depends on enabling network / execute / write later

- Gmail live reads need `CAPABILITIES.network=true`
- Speech/media need `CAPABILITIES.network=true` and `CAPABILITIES.execute=true`
- Gmail send needs `DRY_RUN=false` and `CAPABILITIES.write=true`
- Several other write flows still would not become live even after flags change because the live bridge is not implemented yet

## Most likely first-live activation failure points

1. OAuth/token drift:
   Gmail and Google Calendar may fail on refresh token validity, scope drift, or cloud-console configuration.
2. Secrets-mode confusion:
   A key can exist in `.env` but still be unusable because `NO_SECRETS_MODE=true`.
3. Activation-state drift:
   Operators may mark an action activated before the code path is actually ready. Mismatch detection now helps, but this still needs operator discipline.
4. Stage-only paths mistaken for live candidates:
   Memory writes, calendar writes, concierge draft/booking flows, and builder execution still need real live bridges.
5. OpenClaw assumptions:
   A skill may exist in docs/governance inventory but still be unavailable in the running gateway.

## Parts most likely to break under first live activation

- Gmail send
  Highest irreversible user-facing consequence.
- Google Calendar read/write
  OAuth + time data correctness + adapter precedence all matter.
- Anthropic command classification
  Safe fallback exists, but the model path depends on secrets-mode and live API behavior.
- ElevenLabs speech/media
  Credential, execute, network, and playback environment all have to line up.

## What should be watched closely during rollout

- Provider result `status` and `failure.code`
- `trace.auditEntryId` / `trace.stagedActionId`
- SystemOps readiness summary and activation mismatch notes
- `jarvis-runtime/governance/audit-log.jsonl`
- `jarvis-runtime/activation/activation-state.json`
- SAFE_ROOT parse/read warnings emitted by `src/integrations/runtime/files.ts`

## Explicit deferred work

- Live SAFE_ROOT write bridge for memory persistence
- Live calendar write execution path in the composed provider
- Live concierge draft-generation and booking-dispatch execution paths
- Live Builder provider execution path
- Broader integration coverage for Electron bridge behavior

## Bottom line

Jarvis is materially more stable, more internally consistent, and easier to diagnose than before this pass. It is not “activation complete.” The largest remaining uncertainty is not hidden bugs in the hardening layer; it is the absence of live, credentialed, on-machine validation for the providers that matter most.
