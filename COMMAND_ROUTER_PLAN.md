# Command Router Plan

Updated: 2026-03-28 (model-assisted pass)

---

## Overview

The Jarvis command routing layer classifies incoming natural-language commands
into one of 8 module domains and produces a structured `TypedRouteResult` that
drives staged-action creation. Since this pass, routing is model-assisted: a
Claude Haiku classifier runs on every command, with full heuristic fallback when
the model is unavailable.

---

## Heuristic Limitations (before this pass)

| Limitation | Impact |
|------------|--------|
| Keyword-only signal matching | "can you help me remember to book a dentist" hits `memory` not `concierge` |
| No entity extraction | Dates, names, and subjects not surfaced in route record |
| No routing method tracking | No way to know if a route was confident or just a best guess |
| Single-score domain ranking | Ties produce ambiguous results with no resolution strategy |
| No intent summarisation | Reply only shows domain name and rationale string |
| No fallback labelling | All routes look the same regardless of quality |

---

## New Model-Assisted Flow

```
User command
     │
     ▼
jarvisMessagePipeline.ts
     │
     ├─► classifyCommand(text)          ← model-router.ts
     │       │
     │       ├─► window.jarvis.llm.classify(command)   ← IPC → llm:classify → Anthropic
     │       │       │
     │       │       ├── ok: true, text  ──► parseModelText()
     │       │       │                           │
     │       │       │                           ├── valid JSON + known domain
     │       │       │                           │       └──► TypedRouteResult (routed_by_model)
     │       │       │                           │
     │       │       │                           └── invalid/unknown domain
     │       │       │                                   └──► heuristicClassify() (routed_by_fallback)
     │       │       │
     │       │       └── ok: false      ──► heuristicClassify() (routed_by_fallback)
     │       │
     │       └─► bridge absent          ──► heuristicClassify() (routed_by_fallback)
     │
     ├─► toOrchestratorRoute(result)    ← adapter in model-router.ts
     │
     ├─► stageMission(legacyRoute, text)  ← HeuristicOrchestratorProvider
     │
     └─► formatRouteReply(result)  →  addMessage(assistant)
```

### What the model returns

Claude Haiku is called with a strict system prompt requesting JSON only. The
expected schema:

```json
{
  "domain": "time",
  "intent": "Schedule a dentist appointment",
  "confidence": "high",
  "requires_approval": true,
  "suggested_action": "approve_and_stage",
  "entities": {
    "dates": ["tomorrow"],
    "contacts": ["dentist"],
    "keywords": ["schedule", "appointment"]
  }
}
```

### TypedRouteResult

The parsed model output is validated and normalised into a `TypedRouteResult`
(`src/features/chat/router-types.ts`):

| Field | Type | Description |
|-------|------|-------------|
| `targetDomain` | `RouterDomain` | One of 8 module domains |
| `intent` | `string` | 10-word max summary |
| `confidence` | `'high' \| 'medium' \| 'low'` | Classification confidence |
| `routedBy` | `RouterMethod` | How the result was produced |
| `requiresApproval` | `boolean` | Approval needed before execution |
| `suggestedAction` | `RouterSuggestedAction` | `stage \| approve_and_stage \| clarify \| unavailable` |
| `extractedEntities` | `RouterExtractedEntities` | Dates, contacts, keywords |
| `rationale` | `string` | Human-readable explanation |
| `fallbackReason?` | `string` | Why model was not used (when fallback) |
| `modelUsed?` | `string` | Model ID (when model path) |

---

## Fallback Behavior

The heuristic fallback (`src/features/chat/router-fallback.ts`) is triggered
automatically under these conditions:

| Condition | `routedBy` value |
|-----------|-----------------|
| `window.jarvis.llm.classify` absent | `routed_by_fallback` |
| `ANTHROPIC_API_KEY` not set | `routed_by_fallback` |
| Network/transport error | `routed_by_fallback` |
| API error (4xx/5xx) | `routed_by_fallback` |
| Response timeout (>8s) | `routed_by_fallback` |
| Malformed JSON in response | `routed_by_fallback` |
| Unknown `domain` value in response | `routed_by_fallback` |
| Model returns `confidence: "low"` | `routed_with_low_confidence` |
| No signal match in fallback | `manual_review_required` |

In all fallback cases:
- `fallbackReason` is set to a precise message explaining what happened
- The heuristic result is still valid and fully usable
- The system never returns an error to the user

---

## Confidence Handling

| Confidence | Routing method | suggestedAction behaviour |
|------------|---------------|--------------------------|
| `high` | `routed_by_model` | Normal — domain's default action |
| `medium` | `routed_by_model` | Normal — domain's default action |
| `low` (model) | `routed_with_low_confidence` | May be overridden to `clarify` |
| `low` (fallback) | `routed_with_low_confidence` or `manual_review_required` | Forced to `clarify` if no signal |

The `OrchestratorRoute.ambiguous` flag is set to `true` when
`routedBy` is `routed_with_low_confidence` or `manual_review_required`.

---

## Safety Constraints

- Classification is **read-only / inference-only** — no staged actions during classification
- `DRY_RUN` and capability gates are **not evaluated** in the router — they apply downstream in the staging layer
- `SAFE_ROOT` isolation is not relevant for routing — classification operates only on the command string
- The `llm:classify` IPC handler respects `NO_SECRETS_MODE` via `readSecret()` — if the key is blocked by secrets mode, the call returns `credentials_missing` and fallback is used
- No model results are treated as instructions — the model only classifies, never executes

---

## File Map

| File | Role |
|------|------|
| `src/features/chat/router-types.ts` | Strict types: `TypedRouteResult`, `RouterDomain`, `RouterMethod`, etc. |
| `src/features/chat/router-fallback.ts` | Heuristic classifier — pure function, no async I/O |
| `src/features/chat/model-router.ts` | Model classifier + fallback integration + OrchestratorRoute adapter |
| `src/features/chat/jarvisMessagePipeline.ts` | Pipeline entry point — calls `classifyCommand()`, stages action, formats reply |
| `electron/main.ts` | `llm:classify` IPC handler — non-streaming Anthropic API call |
| `electron/preload.ts` | `window.jarvis.llm.classify` bridge method |
| `src/lib/utils.ts` | `window.jarvis.llm.classify?` type declaration |
| `src/integrations/providers/orchestrator-provider.ts` | `HeuristicOrchestratorProvider` — still used for `stageMission()`; `describe()` reflects model-assisted status |

---

## Router Domain Map

| `RouterDomain` | UI Tab | `OrchestratorDomain` (legacy) |
|----------------|--------|-------------------------------|
| `command` | Command | `direct` |
| `time` | Time | `calendar` |
| `concierge` | Concierge | `concierge` |
| `creation` | Creation | `media` |
| `dev` | Dev | `builder` |
| `memory` | Memory | `memory` |
| `finance` | Finance | `system` |
| `unknown` | Command | `direct` |

---

## Current Status

| Component | Status |
|-----------|--------|
| `llm:classify` IPC handler | WIRED — runs when `ANTHROPIC_API_KEY` is set |
| Model classification | `STAGED_PENDING_CREDENTIALS` (key absent) or `WIRED_BLOCKED_BY_CAPABILITY` (key present, secrets blocked) |
| Heuristic fallback | **LIVE** — always active |
| `TypedRouteResult` in pipeline | **LIVE** — all commands produce typed results |
| Reply formatting | **LIVE** — includes `[MODEL]` / `[FALLBACK]` / `[MANUAL REVIEW]` badge |

---

## Remaining Work (not in this pass)

- Upgrade `OrchestratorProvider.stageMission()` to accept `TypedRouteResult` directly (removes the adapter)
- Add entity-aware action shaping (e.g. pre-fill event title from extracted date+intent)
- Add conversation-context window to classification prompt for multi-turn awareness
