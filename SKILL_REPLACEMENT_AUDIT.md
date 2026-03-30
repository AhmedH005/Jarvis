# Skill Replacement Audit

> Active audit for the cross-platform Jarvis rebuild. This repo now targets a safe staged-only runtime first: `DRY_RUN` is on, secrets are disabled, capabilities are gated off, and no live skill execution is allowed yet.

## Safety-First Baseline

- `DRY_RUN = true`
- `CAPABILITIES.execute = false`
- `CAPABILITIES.write = false`
- `CAPABILITIES.network = false`
- `SAFE_ROOT = <repo>/jarvis-runtime`
- no secrets are read for live providers
- skill manifests are loaded lazily

## Current Module Inventory And Decisions

| Current surface | What it was doing | What was weak / fake | New module destination | Skill-backed replacement | Decision |
| --- | --- | --- | --- | --- | --- |
| Chat | Mixed planner/calendar/chat routing with custom intent forks and OpenClaw chat fallback | Too much custom routing logic and too many legacy branches | `Command` | `agent-task-manager` as the orchestration backbone | `REPLACE_WITH_SKILL` |
| Tasks | Seeded planner tasks and custom scheduling semantics | Demo data and local planner behavior overstated reality | `Time` | `advanced-calendar` + `cron-scheduling` + staged action queue | `MERGE` |
| Calendar | Real shell, but custom local event store underneath | Local-only engine was still a weak custom backend | `Time` | `advanced-calendar` | `REPLACE_WITH_SKILL` |
| Automations | Seeded cards and fake run/toggle behavior | Fully fake operational state | `Time` | `cron-scheduling` | `DELETE` old behavior, `REPLACE_WITH_SKILL` |
| Dashboard | Decorative cards, fake finance/nutrition/life metrics | Mostly ornamental, not operational | split into `System` and `Finance` | runtime truth + explicit finance unavailable state | `DELETE` weak surfaces, `MERGE` useful truth into stronger modules |
| Concierge | Gmail/Twilio/custom inbox-reservation mix | Provider-specific and overstated in places | `Concierge` | `agent-mail-cli` + `bookameeting` | `REPLACE_WITH_SKILL` core, `KEEP_BUT_WRAP` staged approvals |
| Music Studio | Strong visual room but pseudo-band-heavy behavior | Too much theatrical generation framing, not enough real provider truth | `Creation` | `elevenlabs-tts` + `elevenlabs-transcribe` + `eachlabs-music` | `REPLACE_WITH_SKILL` |
| Coding Team | Real Builder backend with extra pseudo-team framing | Team abstraction was stronger than the underlying execution truth | `Dev` | existing OpenClaw Builder + shared `agent-task-manager` orchestration | `KEEP_BUT_WRAP` backend, `REPLACE_WITH_SKILL` orchestration |
| Memory | Partial grounded memory, but weak recall story and old home-path assumptions | Not cross-platform-safe and not explicitly sandboxed | `Memory` | `brainrepo` + `context-anchor` | `REPLACE_WITH_SKILL` |
| System truth scattered across tabs | Runtime health existed but was not the center of the product | Safety, approvals, receipts, and connectors were spread around | `System` | existing runtime + approvals + receipts | `KEEP_BUT_WRAP` |
| Finance calculators | Local planning widgets only | Not real finance and easy to misread as capability | `Finance` | `actual-budget` or explicit unavailable state | `DELETE` fake finance behavior |

## New Active Module Map

| New module | Replaces | Core role |
| --- | --- | --- |
| `Command` | Chat | natural-language intake, routing, staged orchestration |
| `Time` | Tasks + Calendar + Automations | schedule, tasks, recurring jobs |
| `Concierge` | Concierge | mail, booking, personal admin |
| `Creation` | Music Studio | voice, transcription, media generation |
| `Dev` | Coding Team | builder planning and execution requests |
| `Memory` | Memory-related logic | structured memory and retrieval |
| `Finance` | fake dashboard finance | real finance or explicit unavailable |
| `System` | dashboard/system fragments | safety, runtime, approvals, receipts, connectors |

## What Was Explicitly Removed From The Active Experience

- seeded planner tasks
- seeded automation cards
- fake finance overview cards
- fake nutrition / fitness / mood surfaces
- pseudo-band-first Music Studio framing as the primary functional model
- old multi-branch chat pipeline that mixed planner/calendar/chat heuristics

## Current Implementation Status

- providers are now selected around the curated cross-platform skill set
- module routing now stages actions instead of pretending to execute
- all active modules use the new module map
- safe-root runtime scaffolding exists under [`jarvis-runtime`](/Users/ahmedh005/Jarvis/jarvis-runtime)
- no real skill execution is enabled yet by design
