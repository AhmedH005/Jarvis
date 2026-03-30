# Calendar Adapter Plan

Updated: 2026-03-28

---

## Overview

The Time module reads calendar data through a composed provider that selects the best available adapter at runtime. Adapter precedence is:

```
Google Calendar (GCAL_*) → ICS feed (ICS_CALENDAR_URL) → local safe-root JSON
```

All write operations (create / update / move / delete) remain staged under DRY_RUN regardless of adapter.

---

## Architecture

```
TimeModuleTab / CalendarProvider consumers
             │
             ▼
ComposedCalendarProvider   ← src/integrations/providers/calendar-provider.ts
             │
             ├─► GoogleCalendarAdapter   ← src/integrations/adapters/calendar/google-calendar-adapter.ts
             │       │
             │       └─► window.jarvis.gcal.listEvents()
             │               │
             │               └─► IPC gcal:listEvents → electron/gcal.ts
             │                       └─► Google Calendar API v3
             │                           (OAuth2 refresh token pattern from gmail.ts)
             │
             ├─► ICSCalendarAdapter      ← src/integrations/adapters/calendar/ics-adapter.ts
             │       │
             │       ├─► window.jarvis.ics.fetchUrl(ICS_CALENDAR_URL)
             │       │       └─► IPC ics:fetchUrl → electron/gcal.ts (shared handler)
             │       │
             │       └─► readSafeFile('time/calendar.ics')  ← always live, local
             │
             └─► LocalCalendarProvider   ← existing (readSafeJson time/events.json)
```

---

## PHASE 1 — Google Calendar Adapter

### Env vars required

| Var | Required | Description |
|-----|----------|-------------|
| `GCAL_CLIENT_ID` | yes | Google OAuth2 client ID |
| `GCAL_CLIENT_SECRET` | yes | Google OAuth2 client secret |
| `GCAL_REFRESH_TOKEN` | yes | Long-lived refresh token |
| `GCAL_CALENDAR_ID` | no (default: `primary`) | Target calendar ID |

### Status model

| Condition | liveStatus |
|-----------|------------|
| Credentials absent | `STAGED_PENDING_CREDENTIALS` |
| Credentials present + `CAPABILITIES.network=false` | `WIRED_BLOCKED_BY_CAPABILITY` |
| Credentials present + network enabled | `LIVE_READ_ONLY` |

### API path

```
IPC gcal:listEvents → getAccessToken() → POST oauth2.googleapis.com/token
                                       → GET /calendar/v3/calendars/{id}/events
```

### Promotion path

1. `STAGED_PENDING_CREDENTIALS` → add `GCAL_CLIENT_ID`, `GCAL_CLIENT_SECRET`, `GCAL_REFRESH_TOKEN` to `.env`
2. → `WIRED_BLOCKED_BY_CAPABILITY` → set `CAPABILITIES.network = true` in `src/shared/operational-safety.ts`
3. → `LIVE_READ_ONLY` — real GCal reads flowing

### Writes

All write methods (`createEvent`, `updateEvent`, `moveEvent`, `deleteEvent`, `createRecurringEvents`) stage under DRY_RUN. No Google Calendar write API calls are made.

---

## PHASE 2 — ICS / CalDAV Adapter

### Read sources (in priority order)

| Source | Env var | IPC path | Status |
|--------|---------|----------|--------|
| Remote ICS URL | `ICS_CALENDAR_URL` | `ics:fetchUrl` → electron/gcal.ts | `WIRED_BLOCKED_BY_CAPABILITY` when URL set + network blocked |
| Local safe-root ICS | none (file: `jarvis-runtime/time/calendar.ics`) | `fs:readFile` | **LIVE** always |
| CalDAV | `CALDAV_URL` + `CALDAV_USERNAME` + `CALDAV_PASSWORD` | not implemented | `STAGED_PENDING_CREDENTIALS` |

### ICS parser

Minimal built-in parser (`src/integrations/adapters/calendar/ics-adapter.ts`):
- No new npm dependencies
- Handles VCALENDAR/VEVENT blocks, RFC 5545 line unfolding
- Parses `DTSTART`, `DTEND`, `SUMMARY`, `UID`, `DESCRIPTION`, `LOCATION`, `RRULE`
- DATE-only and DATE-TIME formats (with/without Z suffix)

### CalDAV

`CALDAV_URL` is read by `ics:getConfig` IPC and surfaced in `ICSCalendarAdapter.describe()`. No actual CalDAV request is made. Status: `STAGED_PENDING_CREDENTIALS`.

---

## PHASE 3 — Composed Provider

`ComposedCalendarProvider` in `src/integrations/providers/calendar-provider.ts`:

- `bestReadAdapter()` — async; checks Google credentials + network capability, returns first usable adapter
- `listEvents()` — reads from best adapter; falls back to local and merges/deduplicates by `id`
- Write methods delegate to the best available adapter (all stage under DRY_RUN)
- `adapterStatus()` — returns `ComposedAdapterReport` with per-adapter liveStatus for UI display

Registry entry in `src/integrations/registry/providerRegistry.ts` replaced `LocalCalendarProvider` with `ComposedCalendarProvider`.

---

## PHASE 4 — TimeModuleTab display

`src/components/tabs/TimeModuleTab.tsx` updated to:
- Call `composed.adapterStatus()` after `describe()`
- Show `Active adapter` + per-adapter `liveStatus` in the TIME BACKBONE card
- Color coding: `LIVE` / `LIVE_READ_ONLY` → green, `WIRED_*` → amber, other → muted

---

## File Map

| File | Role |
|------|------|
| `src/shared/gcal-bridge.ts` | Shared GCalEventRecord, GCalStatus, result types |
| `electron/gcal.ts` | IPC handlers: `gcal:status`, `gcal:listEvents`, `ics:getConfig`, `ics:fetchUrl` |
| `src/integrations/adapters/calendar/adapter-types.ts` | `CalendarAdapterName`, `CalendarAdapterStatus`, `ComposedAdapterReport` |
| `src/integrations/adapters/calendar/google-calendar-adapter.ts` | Google Calendar read adapter |
| `src/integrations/adapters/calendar/ics-adapter.ts` | ICS + local file read adapter |
| `src/integrations/providers/calendar-provider.ts` | Added `ComposedCalendarProvider` |
| `src/integrations/registry/providerRegistry.ts` | Uses `ComposedCalendarProvider` |
| `electron/preload.ts` | Added `gcal` and `ics` bridge sections |
| `src/lib/utils.ts` | Added `gcal?` and `ics?` to `window.jarvis` type |
| `src/components/tabs/TimeModuleTab.tsx` | Surfaces adapter status |
| `tsconfig.node.json` | Added `src/shared/gcal-bridge.ts` to include list |

---

## Safety constraints (unchanged)

| Flag | Value | Effect |
|------|-------|--------|
| `DRY_RUN` | `true` | All writes staged, never executed |
| `CAPABILITIES.network` | `false` | Blocks all remote reads (GCal API, remote ICS URL) |
| `CAPABILITIES.write` | `false` | Redundant with DRY_RUN for calendar writes |
| `NO_SECRETS_MODE` | `true` | Does not affect GCal (reads `process.env` directly, not via `readSecret`) |

---

## Current Status

| Adapter | Read | Write | liveStatus | Promotion path |
|---------|------|-------|------------|----------------|
| Google Calendar | blocked | staged | `STAGED_PENDING_CREDENTIALS` | Set `GCAL_*` env vars |
| ICS remote | blocked | N/A | `WIRED_BLOCKED_BY_CAPABILITY` (if URL set) or not configured | Set `ICS_CALENDAR_URL` + `CAPABILITIES.network=true` |
| ICS local | **LIVE** | N/A | `LIVE_READ_ONLY` | Drop `jarvis-runtime/time/calendar.ics` |
| CalDAV | N/A | N/A | `STAGED_PENDING_CREDENTIALS` | Not implemented |

---

## Remaining Work

- Upgrade CalDAV from skeleton to real PROPFIND-based read (when needed)
- Add write path to Google Calendar (behind `CAPABILITIES.write=true` gate)
- Add entity-aware event pre-fill from `TypedRouteResult.extractedEntities`
- Expose `GCAL_CALENDAR_ID` in TimeModuleTab status display
