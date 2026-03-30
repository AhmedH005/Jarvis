# Skill Selection Matrix

> This matrix reflects the strict curated skill set now used by the repo. No overlapping alternatives are active in the code path.

## Active Choices

| Domain | Allowed curated skills | Chosen implementation | Why chosen | Required env / config | Current status |
| --- | --- | --- | --- | --- | --- |
| Orchestration | `agent-task-manager`, `agent-orchestrator` | `agent-task-manager` | Single shared backbone for Command, Time, Concierge, and Dev without orchestration sprawl | none active yet because execution is gated | `selected / staged-only` |
| Time | `advanced-calendar`, `cron-scheduling` | both | Clean split between schedule state and recurring jobs | future calendar connector config when live wiring begins | `selected / staged-only` |
| Concierge | `agent-mail-cli`, `bookameeting` | both | Cross-platform mail/admin plus booking handoff without fake autonomy | future mail credentials and booking connector config | `selected / staged-only` |
| Creation | `elevenlabs-tts`, `elevenlabs-transcribe`, `eachlabs-music` | all three | Covers TTS, STT, and music with one coherent Creation stack | future API keys, still disabled by no-secrets mode | `selected / staged-only` |
| Dev | existing OpenClaw Builder, shared `agent-task-manager` | both | Builder stays the real backend; task manager owns queue/orchestration | builder bridge remains present, execution still blocked | `selected / staged-only` |
| Memory | `brainrepo`, `context-anchor` | both | Grounded, cross-platform, file-based, and easy to sandbox | safe-root files only | `selected / read-safe` |
| Finance | `actual-budget` | unavailable until real connector exists | explicit unavailable beats fake finance | future Actual Budget config if adopted | `selected / unavailable` |
| System | existing runtime + approvals + receipts | existing runtime stack | already the strongest truth source in repo | no secrets, dry run, and capability gates reflected here | `active` |

## Rejected For This Pass

- `agent-orchestrator`
  Reason: overlaps with `agent-task-manager` and violates the “choose one orchestrator only” rule.

## Safety Overlay Applied To Every Skill

| Safety control | Current setting | Effect |
| --- | --- | --- |
| `DRY_RUN` | `true` | all action paths stage instead of executing |
| `CAPABILITIES.execute` | `false` | no provider may actually run external work |
| `CAPABILITIES.write` | `false` | no provider may mutate runtime files or external systems |
| `CAPABILITIES.network` | `false` | no provider may call networked skill backends |
| `NO_SECRETS_MODE` | `true` | API-key-backed paths remain disabled |
| filesystem sandbox | `jarvis-runtime` only | file reads are restricted to the safe local runtime root |

## Lazy Loading Policy

- skill manifests are loaded only when a provider is described or used
- no selected skill is imported at startup
- this repo currently loads local manifest wrappers, not live skill SDKs, until the real wiring pass begins
