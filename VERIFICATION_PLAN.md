# Verification Plan

Updated: 2026-03-29

## What was already covered before this pass

- `npm run typecheck`
- `npm run build`
- Manual runtime/UI inspection paths in SystemOps and module tabs

## What was added in this pass

Lightweight deterministic verification via:

- `npm run verify:core`

Current focused tests:

| Area | Coverage added |
|---|---|
| Governance enforcement decisions | Pure decision tests for missing permissions, restricted trust, and dry-run behavior |
| Readiness engine classification | Tests for readiness-level and promotion-stage derivation |
| Memory scoring | Tests for module bias, case-insensitive tags, and token de-duplication |
| Router fallback behavior | Tests for unavailable finance routing, manual review fallback, and concierge approval routing |
| Provider result normalization | Tests for normalized staged/blocked result status and trace fields |
| Builder remediation/result shaping | Tests for remediation kind inference, empty-prompt decomposition fallback, and result summary verdicts |
| Calendar adapter precedence | Tests for `google -> ics -> local` selection order |

## Commands run in this pass

- `npm run typecheck`
- `npm run build`
- `npm run verify:core`

## What remains risky

| Area | Why it is still risky |
|---|---|
| Gmail / GCal / Anthropic / ElevenLabs live calls | No credentialed end-to-end execution happened in this environment |
| Electron bridge integration behavior | Pure tests do not prove preload/main wiring on the target machine |
| SAFE_ROOT live writes | Memory/calendar live write bridges are not implemented yet for several providers |
| OpenClaw-dependent skill execution | Requires an actual running gateway with the right skills installed and enabled |

## Manual smoke testing still required later

1. Gmail read on the target machine with real credentials and `network=true`
2. Google Calendar read with valid OAuth refresh token
3. Anthropic classifier path with `NO_SECRETS_MODE=false`
4. ElevenLabs speech/media calls with `execute=true` and network enabled
5. Activation-state mismatch check after any provider is marked activated
6. SystemOps review after each flag change to confirm readiness and action-log truth remain aligned

## Recommendation

Use the new deterministic suite as a fast regression net during future refactors, but treat it as a complement to operator-led smoke tests, not a replacement for real activation validation.
