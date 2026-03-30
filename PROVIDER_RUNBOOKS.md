# Provider Runbooks

Updated: 2026-03-29

This runbook is intentionally compact. It describes the current truth for each provider after the hardening pass.

## Memory

- Reads:
  Live now from SAFE_ROOT and in-session receipts
- Writes:
  Still staged-only
- Watch:
  `status`, `trace.stagedActionId`, memory scoring diagnostics
- Do not promote yet:
  `memory:write`, `memory:ingest`

## Calendar

- Reads:
  Composed provider with precedence `google -> ics -> local`
- Local ICS:
  Only live if the file actually exists
- Writes:
  Still staged-only in the current provider implementation
- Watch:
  adapter status, merged fallback behavior, duplicate ids, readiness `not_implemented`

## Mail

- Read:
  Real live candidate once Gmail credentials are present and network is enabled
- Send:
  Real live candidate only after `DRY_RUN=false` and write capability is enabled
- Watch:
  `status`, `failure.code`, Gmail OAuth drift, `trace.stagedActionId`

## Concierge

- Inbox sync:
  Delegates to the real mail provider
- Draft generation / booking:
  Still staged-only
- Watch:
  whether a result is `blockedByDryRun`, `blockedByCapability`, or `staged`

## Speech / Media

- Live candidate:
  Yes, once credentials + network + execute + secrets access are enabled
- Watch:
  `providerFailure` vs `transportFailure`
- Prereqs:
  `ELEVENLABS_API_KEY`, `NO_SECRETS_MODE=false`, `network=true`, `execute=true`

## Builder

- Current truth:
  intentionally staged-only in the provider layer
- Pure heuristics:
  decomposition, remediation shaping, result summary are locally available and now directly testable
- Do not promote yet:
  request/execution/remediation actions

## Orchestrator / Router

- Heuristic fallback:
  always live
- Model-assisted path:
  candidate once Anthropic key is readable and bridge is available
- Staging:
  `orchestrator:stageMission` should remain staged-only; downstream providers own real execution
