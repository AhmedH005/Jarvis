# Live Integration Status

Updated: 2026-03-29

This file summarizes the current runtime truth after the hardening pass.

## Safety baseline

| Item | Value |
|---|---|
| `DRY_RUN` | `true` |
| `NO_SECRETS_MODE` | `true` |
| `CAPABILITIES.network` | `false` |
| `CAPABILITIES.execute` | `false` |
| `CAPABILITIES.write` | `false` |

## Provider status summary

| Provider | Current truth | Notes |
|---|---|---|
| Orchestrator | fallback live, stageMission staged-only | direct heuristics now share one fallback source |
| Memory | reads live, writes staged-only | selector/scoring hardened; no live write bridge |
| Calendar | reads composable, writes staged-only | ICS now only claims live-read if a real source exists |
| Mail | read is live-candidate, send is live-candidate | normalized statuses/traces now distinguish capability vs dry-run vs provider failures |
| Concierge | inbox delegates to mail, draft/booking staged-only | readiness now marks staged-only gaps explicitly |
| Speech | live-candidate with key + execute + network + secrets access | result normalization added |
| Media | live-candidate with key + execute + network + secrets access | result normalization added |
| Builder | staged-only | pure heuristics extracted and tested; live provider path still deferred |

## Runtime truth changes from this pass

- Provider results now expose normalized `status` and `trace`
- Governance no longer double-writes audit entries
- `stageAction()` no longer labels every staged action as a dry-run block
- Runtime snapshot now includes readiness summary and activation mismatch notes
- Readiness now marks staged-only provider gaps with `not_implemented`

## Honest activation status

Ready to verify on a credentialed machine:

- Gmail read
- Google Calendar read
- Remote ICS read
- Anthropic model routing
- ElevenLabs speech/media
- Gmail send

Not ready to claim as live-capable yet:

- Memory writes
- Calendar writes
- Concierge live draft/booking
- Builder live execution
