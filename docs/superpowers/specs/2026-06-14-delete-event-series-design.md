# Delete Event Series — Design Spec

**Date:** 2026-06-14  
**Branch:** mpf/delete-event-series  
**Status:** Approved

## Summary

When a user deletes a recurring calendar event from the `EventDetailModal`, they are offered a choice: delete only the selected occurrence, or delete the entire series. Single-instance events and events with no type info retain the current single-confirm behavior. Series master events get a single confirm with updated warning copy.

## Scope

- Delete choice appears only in `EventDetailModal`. No new delete entry points are added.
- Two options only: "Delete this event" and "Delete the series." "Delete this and all following" is out of scope.

---

## Section 1: Data Model & Service Layer

### `M365Event` (`src/types/index.ts`)

Add two optional fields:

```ts
type?: 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster';
seriesMasterId?: string; // present on occurrence and exception events
```

### `CalendarService` (`src/services/CalendarService.ts`)

**`getEventsForCalendar`:** Extend `$select` to include `type,seriesMasterId`.

**`mapEvent`:** Populate both new fields from the Graph response.

**New method `deleteEventSeries(seriesMasterId: string): Promise<void>`:**
- Identical implementation to `deleteEvent` — `DELETE /me/events/{seriesMasterId}` with auth header.
- Kept as a separate method so call-site intent is explicit and each method is independently testable.
- Clears the full cache on success (same as `deleteEvent`).

---

## Section 2: CalendarApp

### `handleEventClick` (`src/components/CalendarApp.tsx`)

`EventDetailModal` gains a second optional callback: `onDeleteSeriesCallback?: () => Promise<void>`.

When `calendar.canEdit` is true, the callbacks are wired as follows:

| Event type | `onDelete` | `onDeleteSeries` |
|---|---|---|
| `singleInstance` / no type | `deleteEvent(event.id)`, filter that event from state | `undefined` |
| `occurrence` / `exception` | `deleteEvent(event.id)`, filter that event from state | `deleteEventSeries(event.seriesMasterId!)`, filter all events with matching `seriesMasterId` from state, show "Series deleted" notice |
| `seriesMaster` | `deleteEvent(event.id)`, filter that event from state | `undefined` |

State update for series deletion via `onDeleteSeries` (occurrence/exception path only):
```ts
setEvents(prev => prev.filter(e =>
  e.seriesMasterId !== event.seriesMasterId && e.id !== event.seriesMasterId
))
```
This removes all occurrences/exceptions sharing the same master (`e.seriesMasterId === event.seriesMasterId`) and the master itself if it happens to be in state (`e.id === event.seriesMasterId`).

State update when `onDelete` is called on a series master:
```ts
setEvents(prev => prev.filter(e =>
  e.id !== event.id && e.seriesMasterId !== event.id
))
```
This removes the master event and all its occurrences/exceptions.

---

## Section 3: EventDetailForm UI

### New props on `EventDetailFormProps`

```ts
onDelete?: () => Promise<void>;      // unchanged
onDeleteSeries?: () => Promise<void>; // new; only passed for occurrence/exception events
```

### Confirm state

`confirmingDelete` changes from `boolean` to `false | 'occurrence' | 'single'`.

Clicking the "Delete" button:
- If `onDeleteSeries` is defined (occurrence/exception) → sets `confirmingDelete = 'occurrence'`
- Otherwise (single instance or series master) → sets `confirmingDelete = 'single'`

### Confirm UI rendering

**Case 1 — Recurring occurrence/exception** (`confirmingDelete === 'occurrence'`):

> _This will permanently delete this event._  
> `[Cancel]  [Delete this event]  [Delete the series]`

- "Delete this event" → calls `onDelete()`
- "Delete the series" → calls `onDeleteSeries()`
- Both buttons are disabled while `deleting` is true

**Case 2 — Series master** (`confirmingDelete === 'single'`, `event.type === 'seriesMaster'`):

> _This will permanently delete all events in this series._  
> `[Cancel]  [Delete all events]`

**Case 3 — Single instance / no type info** (`confirmingDelete === 'single'`, `event.type !== 'seriesMaster'`):

> _This will permanently delete the event._  
> `[Cancel]  [Delete event]`

Cases 2 and 3 share the same confirm state value (`'single'`); the button label and warning copy are derived from `event.type === 'seriesMaster'`.

### Error & cancel

- Error display and cancel behavior are identical across all three cases.
- `deleting` state tracks whichever async operation is in flight.
- On error: `setConfirmingDelete(false)` resets to pre-confirm state (same as today).

---

## Section 4: Testing

### `CalendarService` tests (`tests/services/CalendarService.test.ts`)

- `deleteEventSeries` sends `DELETE /me/events/{seriesMasterId}` with correct auth header
- `deleteEventSeries` clears the cache on success
- `deleteEventSeries` throws on Graph error
- `mapEvent` populates `type` and `seriesMasterId` from Graph response

### `EventDetailForm` tests (`tests/components/EventDetailModal.test.tsx`)

- Single-instance path: existing tests remain unchanged
- Series master path: clicking "Delete" shows "Delete all events in this series" warning copy and single confirm button
- Occurrence path: clicking "Delete" shows both "Delete this event" and "Delete the series" buttons
- "Delete this event" calls `onDelete`; "Delete the series" calls `onDeleteSeries`
- Cancel resets confirm state for occurrence path
- Error resets confirm state and shows inline error for both occurrence-path buttons

### `CalendarApp` tests (`tests/components/CalendarApp.test.tsx`)

- Existing single-instance event click + delete test remains green (no `type` field → single-confirm path)
- Occurrence event: `onDeleteSeries` is wired and calls `deleteEventSeries` with the correct `seriesMasterId`; all matching occurrences are removed from state
- Series master event: `onDeleteSeries` is `undefined`; modal uses series master warning copy
