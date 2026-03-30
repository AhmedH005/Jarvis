# Skill Wiring Log

Updated: 2026-03-29

This log captures the current code-level wiring, not aspirational future wiring.

| Skill / Provider | Wired path | Current state | Main blocker or note |
|---|---|---|---|
| `advanced-calendar` / composed calendar | composed provider -> google/ics/local adapters | read path present | live writes not implemented in provider layer |
| `cron-scheduling` | composed calendar recurring staging | staged-only | recurring live path not implemented |
| `agent-mail-cli` | Gmail bridge via mail provider | read live-candidate, send live-candidate | requires network and readable credentials |
| `bookameeting` | concierge staged booking path | staged-only | no live dispatch wiring |
| `elevenlabs-tts` | speech provider -> TTS bridge | live-candidate | needs key + execute + network + secrets access |
| `eachlabs-music` | media provider -> music bridge | live-candidate | needs key + execute + network + secrets access |
| `brainrepo` | memory provider + structured store | reads live | writes still staged-only |
| `context-anchor` | SAFE_ROOT read through memory provider | live read | local content dependent |
| `agent-task-manager` | orchestrator + builder provider | routing live, builder staged-only | live builder path not wired into provider |
| `agent-orchestrator` | inventory/governance only | not on a live path | deferred |
| `elevenlabs-transcribe` | manifest only | deferred | no transcribe provider path |
| `actual-budget` | manifest only | deferred | finance module/provider not wired |
| Anthropic command router | renderer classify bridge -> `llm:classify` | live-candidate | key must be readable; fallback always available |

## Important notes

- Presence in governance inventory does not mean live execution is wired.
- Readiness is now the source of truth for whether a path is:
  - `staged_only`
  - `read_only_live_candidate`
  - `write_live_candidate`
  - `fully_live_candidate`
- Activation should follow readiness, not just the existence of a manifest or bridge.
