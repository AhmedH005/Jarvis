# Readiness Smoke Tests

Updated: 2026-03-29

These smoke tests are aligned to the hardened result model:

- `result.status`
- `result.failure.code`
- `result.trace`

They are written to verify current truth, not aspirational live behavior.

## Baseline checks

Run before any activation work:

```bash
npm run typecheck
npm run build
npm run verify:core
```

## ST-MEM-READ

Goal:
- verify memory reads are live and structured

Trigger:

```ts
const result = await getMemoryProvider().snapshot()
```

Expected:
- `result.ok === true`
- `result.status === 'readOnlySuccess'`
- `result.data` present

## ST-CAL-LOCAL

Goal:
- verify local calendar read only when a real ICS/local source exists

Precondition:
- either `jarvis-runtime/time/calendar.ics` exists, or `jarvis-runtime/time/events.json` contains fallback events

Trigger:

```ts
const result = await getCalendarProvider().listEvents()
```

Expected:
- `result.success === true` if a source exists
- `result.status === 'readOnlySuccess'`
- if no ICS source exists, expect `status === 'unavailable'` from the ICS adapter path and local fallback behavior from the composed provider

## ST-MAIL-BLOCKED

Goal:
- verify capability gating is explicit for Gmail reads in baseline mode

Trigger:

```ts
const result = await getMailProvider().fetchRecentMessages()
```

Expected with baseline flags:
- `result.ok === false`
- `result.status === 'blockedByCapability'`
- `result.failure?.code === 'capability_network_disabled'`

## ST-MAIL-STAGED

Goal:
- verify Gmail send remains staged under `DRY_RUN=true`

Trigger:

```ts
const result = await getMailProvider().sendMessage({
  to: 'self@example.com',
  subject: 'Jarvis smoke',
  body: 'staged test',
})
```

Expected with baseline flags:
- `result.ok === true`
- `result.state === 'staged'`
- `result.status === 'blockedByDryRun'`
- `result.trace?.stagedActionId` present

## ST-ROUTER-FALLBACK

Goal:
- verify routing still works safely when the model path is unavailable or blocked

Trigger:

```ts
const route = await classifyCommand('Draft an email reply and book a reservation')
```

Expected:
- route exists
- route `routedBy` is one of:
  - `routed_by_model`
  - `routed_by_fallback`
  - `routed_with_low_confidence`
  - `manual_review_required`
- fallback routes include `fallbackReason`

## ST-SPEECH-BLOCKED

Goal:
- verify speech path reports the right blocker before activation

Trigger:

```ts
const result = await getSpeechProvider().speak('test')
```

Expected in baseline mode:
- staged or blocked result, never live audio
- `status` should indicate `blockedByDryRun`, `blockedByCapability`, `providerFailure`, or `unavailable`
- `failure.code` should not be an ad hoc string outside the normalized provider contract

## ST-READINESS-TRUTH

Goal:
- verify readiness/reporting is not over-promising

Check:
- SystemOps readiness for:
  - memory writes
  - calendar writes
  - concierge draft/booking
  - builder actions

Expected:
- those actions remain `staged_only`
- blockers include `not_implemented`

## ST-ACTIVATION-MISMATCH

Goal:
- verify activation drift is surfaced

Check:
- runtime snapshot system lines
- SystemOps readiness notes

Expected:
- if `activation-state.json` omits or overstates an action, a diagnostic note appears

## Live smoke tests still required later

- Gmail read with real credentials
- Google Calendar read with real credentials
- Anthropic classification with secrets mode disabled
- ElevenLabs speech/media with execute + network enabled
- Gmail send with `DRY_RUN=false`

Anything beyond that should be treated as manual pre-activation verification, not as already-supported live behavior.
