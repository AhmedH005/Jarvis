# Execution Enablement Plan

Updated: 2026-03-29

This plan reflects the current code after the hardening pass. It separates:

- genuinely live-capable paths
- safe staged/read-only paths
- staged-only paths that still need implementation before activation

## Current safety baseline

| Flag | Value | Effect |
|---|---|---|
| `DRY_RUN` | `true` | Mutating actions stage only |
| `NO_SECRETS_MODE` | `true` | Secrets-backed providers cannot read credentials through `readSecret()` |
| `CAPABILITIES.network` | `false` | No outbound calls |
| `CAPABILITIES.execute` | `false` | No execute/media paths |
| `CAPABILITIES.write` | `false` | No write/mutation paths |

Source of truth:
- `src/shared/operational-safety.ts`

## Promotion classes

### Class A: Read-only or inference-only candidates

These can be activated once their prerequisites are satisfied:

- Local ICS read
- Memory reads
- Gmail read
- Google Calendar read
- Remote ICS read
- Model-assisted router

### Class B: Execute/API candidates

These can be activated after secrets and execute/network gates are opened:

- Speech / TTS
- Media generation

### Class C: Real live write candidate today

Only one write path is actually implemented end-to-end enough to treat as a live candidate:

- Gmail send

### Class D: Still staged-only even after flags change

These are not honest activation targets yet:

- Memory writes
- Calendar writes / recurring writes
- Concierge draft generation
- Concierge booking dispatch
- Builder request/execution/remediation actions
- `orchestrator:stageMission`

These now surface a `not_implemented` readiness blocker and should stay staged until live paths are built.

## Recommended order

### Wave 1: Low-risk reads

1. Local ICS read
   Requirement: actual file at `jarvis-runtime/time/calendar.ics`
2. Memory reads
   Requirement: optional records in `jarvis-runtime/memory/records.json`
3. Gmail read
   Requirements:
   - Gmail OAuth env vars present
   - `CAPABILITIES.network=true`
   - `NO_SECRETS_MODE=false`
4. Google Calendar read
   Requirements:
   - GCal env vars present
   - network already enabled
5. Remote ICS read
   Requirements:
   - `ICS_CALENDAR_URL`
   - network already enabled
6. Model-assisted router
   Requirements:
   - `ANTHROPIC_API_KEY` present
   - `NO_SECRETS_MODE=false`
   - Electron bridge available

### Wave 2: Execute/API paths

1. Speech
   Requirements:
   - `ELEVENLABS_API_KEY`
   - `CAPABILITIES.network=true`
   - `CAPABILITIES.execute=true`
   - `NO_SECRETS_MODE=false`
2. Media
   Same requirements as speech

### Wave 3: Real live mutation currently supported

1. Gmail send
   Requirements:
   - Gmail read already stable
   - `DRY_RUN=false`
   - `CAPABILITIES.write=true`
   - `CAPABILITIES.network=true`
   - `agent-mail-cli` vetted with the required scope

## Explicitly deferred from activation

Do not treat these as flag-only promotions:

- Memory write / ingest
- Calendar create / update / move / delete / recurring
- Concierge draft / booking
- Builder live execution

They remain stage-only because the live execution bridges are not implemented in the current provider layer.

## Operator notes

- Use `npm run typecheck`, `npm run build`, and `npm run verify:core` before any activation work on a new machine.
- Watch SystemOps for:
  - normalized provider result `status`
  - readiness summary lines
  - activation mismatch notes
- Treat `ACTIVATION_CONSISTENCY_REPORT.md` and `KNOWN_RISKS_AND_GAPS.md` as required reading before changing flags.
