# Activation Checklist

Updated: 2026-03-29

Use this checklist on the target machine only after reading:

- `EXECUTION_ENABLEMENT_PLAN.md`
- `ACTIVATION_CONSISTENCY_REPORT.md`
- `KNOWN_RISKS_AND_GAPS.md`

## Pre-flight

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run verify:core`
- [ ] Confirm `DRY_RUN=true`
- [ ] Confirm all `CAPABILITIES.*=false`
- [ ] Confirm `NO_SECRETS_MODE=true`
- [ ] Open SystemOps and record the current readiness summary
- [ ] Run `inventorySkills()` if governance store is still empty

## Wave 1: Read-only / inference-only

- [ ] Local ICS read
  Requires an actual `jarvis-runtime/time/calendar.ics` file
- [ ] Memory reads
  Optional seed data in `jarvis-runtime/memory/records.json`
- [ ] Gmail read
  Requires Gmail OAuth env vars, `network=true`, `NO_SECRETS_MODE=false`
- [ ] Google Calendar read
  Requires GCal env vars and network
- [ ] Remote ICS read
  Requires `ICS_CALENDAR_URL` and network
- [ ] Model-assisted router
  Requires `ANTHROPIC_API_KEY` and `NO_SECRETS_MODE=false`

After each step:
- [ ] Verify result `status`
- [ ] Verify SystemOps readiness changed as expected
- [ ] Verify no activation mismatch note was introduced

## Wave 2: Execute/API

- [ ] Speech
  Requires `ELEVENLABS_API_KEY`, `network=true`, `execute=true`, `NO_SECRETS_MODE=false`
- [ ] Media
  Same requirements as speech

After each step:
- [ ] Confirm the provider returns live success, not staged output
- [ ] Confirm audit/action log entries are truthful

## Wave 3: Real live mutation currently supported

- [ ] Gmail send only
  Requires:
  - Gmail read already stable
  - `DRY_RUN=false`
  - `CAPABILITIES.write=true`
  - required governance vetting/permissions

After activation:
- [ ] Send only to a self-controlled address first
- [ ] Confirm `status === 'success'`
- [ ] Confirm no unexpected extra sends

## Explicitly not activatable yet

Do not attempt to promote these based on flags alone:

- [ ] Memory write / ingest
- [ ] Calendar write / recurring
- [ ] Concierge draft generation
- [ ] Concierge booking dispatch
- [ ] Builder provider live execution

These remain stage-only until live implementation work exists in the provider layer.
