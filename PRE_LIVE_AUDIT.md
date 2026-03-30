# Pre-Live Audit

Updated: 2026-03-29

## Safe first activations

Lowest-risk order:

1. Local ICS read
2. Memory reads
3. Gmail read
4. Google Calendar read
5. Remote ICS read
6. Model-assisted routing
7. Speech
8. Media
9. Gmail send

## Still blocked by real implementation gaps

These are not just waiting on flags:

- Memory writes
- Calendar writes
- Concierge live draft generation
- Concierge live booking dispatch
- Builder live execution

Readiness now surfaces these with `not_implemented`.

## Credential-dependent paths

- Gmail
- Google Calendar
- Anthropic model router
- ElevenLabs speech/media

## Highest-risk live step currently supported

- Gmail send

Reason:
- irreversible side effect
- depends on write + network + governance
- easiest place to cause user-facing damage if misconfigured

## Final recommendation

Treat Wave 3 as “Gmail send only” until the staged-only provider gaps are implemented. Everything else should remain a documented deferred activation target, not an operator action item.
