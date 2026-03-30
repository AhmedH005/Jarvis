# Module Restructure Plan

> This is the active module blueprint implemented in the repo. The Jarvis shell stays visually intact, while tab responsibilities have been reorganized around the new safe provider system.

## Active Module Layout

### 1. Command

- replaces: Chat
- purpose: natural-language input, mission routing, staged orchestration
- provider backbone: `OrchestratorProvider` backed by `agent-task-manager`
- active behavior:
  - user enters a command
  - Jarvis classifies the target module
  - action is staged
  - assistant reply explains route, state, and safety block

### 2. Time

- replaces: Tasks + Calendar + Automations
- purpose: unified schedule, tasks, recurring jobs
- providers: `advanced-calendar` + `cron-scheduling`
- active behavior:
  - reads safe-root schedule scaffolding
  - stages event and recurring-job requests
  - removes old seeded planner and automation behavior from the active path

### 3. Concierge

- replaces: old concierge execution logic
- purpose: mail, bookings, personal admin
- providers: `agent-mail-cli` + `bookameeting`
- active behavior:
  - stages inbox sync, draft generation, and booking requests
  - shows safe-root inbox/booking state
  - does not send mail or claim booking authority

### 4. Creation

- replaces: Music Studio
- purpose: voice, transcription, media generation
- providers: `elevenlabs-tts`, `elevenlabs-transcribe`, `eachlabs-music`
- active behavior:
  - stages voice, transcript, and media requests
  - removes fake generated artifacts
  - keeps the Jarvis room but centers real provider targets

### 5. Dev

- replaces: Coding Team
- purpose: builder planning and execution requests
- providers: existing Builder backend + shared `agent-task-manager`
- active behavior:
  - stages dev plans and execution requests
  - removes pseudo-team emphasis from the active module
  - keeps approvals and receipts in the shared system model

### 6. Memory

- replaces: vague memory behavior
- purpose: structured memory and retrieval
- providers: `brainrepo` + `context-anchor`
- active behavior:
  - reads grounded memory from `jarvis-runtime`
  - searches memory safely
  - stages writes instead of committing them

### 7. Finance

- replaces: fake dashboard finance
- purpose: real finance or explicit unavailable state
- provider target: `actual-budget`
- active behavior:
  - tells the truth that finance is unavailable
  - removes fake balances, calculators-as-capabilities, and decorative finance claims

### 8. System

- replaces: scattered dashboard/system truth
- purpose: runtime safety, approvals, receipts, connectors
- providers: existing runtime + approval/receipt stores
- active behavior:
  - surfaces dry run, capability gates, safe root, connector readiness, approvals, and receipts

## Implementation Notes

- the visual shell was preserved
- the active tab map now follows the required module structure
- old weak module logic is no longer on the mounted tab path
- every active action path ends in `staged`, `unavailable`, or an explicit read-only result while safety remains enabled

## Not Yet Enabled By Design

- live calendar writes
- live mail sends
- live bookings
- live media generation
- live builder execution
- live finance sync

These stay blocked until `DRY_RUN`, capability gates, and no-secrets mode are intentionally changed.
