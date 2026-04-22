# Calendar Indicator & Move in Edit Event Modal

**Date:** 2026-04-22  
**Status:** Approved

## Overview

Add a calendar indicator to the Edit Event modal that shows which calendar an event belongs to (name + color swatch). When the event is on a writable calendar, the indicator becomes an editable dropdown that allows moving the event to a different calendar.

## Requirements

- Show the calendar name and a color swatch in the Edit Event modal.
- All calendars are listed in the dropdown; read-only calendars (`canEdit: false`) are disabled as options.
- If the event itself is on a read-only calendar, the dropdown is disabled entirely (display-only indicator).
- Calendar change + other field edits save together via the existing Save button.
- Moving uses the Graph API move endpoint — not delete + recreate — so the event ID, attendees, and recurrence chain are preserved.

## Architecture

### Service layer — `CalendarService`

One new method:

```ts
async moveEvent(eventId: string, destinationCalendarId: string): Promise<void>
```

- Calls `POST https://graph.microsoft.com/v1.0/me/events/{eventId}/move` with body `{ destinationId }`.
- On success, calls `cache.clearAll()` (consistent with `updateEvent` and `deleteEvent`).
- No changes to `EventPatch` or any other existing service method.

### CalendarApp wiring

`handleEventClick` passes the full `calendars` list into `EventDetailModal`.

The `onSave` callback receives `(patch: EventPatch, targetCalendarId: string)`. After `onSave` resolves:

1. If `targetCalendarId !== event.calendarId`: call `calendarService.moveEvent(event.id, targetCalendarId)`.
2. Then call `calendarService.updateEvent(event.id, patch)` for any field changes.

Both calls are inside the existing try/catch that calls `notifyError`. The `onSaved` refresh (`fetchAll`) fires after both complete, unchanged.

### EventDetailModal

Constructor gains a `calendars: M365Calendar[]` parameter, passed through to `EventDetailForm`.

### EventDetailForm

**New prop:** `calendars: M365Calendar[]`  
**New state:** `selectedCalendarId: string` — initialized from `event.calendarId`

**Dropdown behavior:**
- The `<select>` is `disabled` when the event's calendar has `canEdit: false`.
- All calendars are listed as `<option>` elements; those with `canEdit: false` have `disabled` set.
- A color swatch (`<span>` with inline `background-color`) is rendered outside the `<select>`, positioned alongside it, reflecting the currently selected calendar's color.

**onSave signature change:** `onSave: (patch: EventPatch, targetCalendarId: string) => Promise<void>`

## Data flow

```
User opens Edit modal
  → CalendarApp passes calendars[] + event to EventDetailModal
  → EventDetailForm renders calendar dropdown (disabled if canEdit: false)
User edits fields and/or changes calendar, clicks Save
  → handleSave calls onSave(patch, selectedCalendarId)
  → CalendarApp: if targetCalendarId !== event.calendarId → moveEvent()
  → CalendarApp: updateEvent(patch)
  → onSaved() → fetchAll()
```

## Error handling

- Any failure in `moveEvent` or `updateEvent` surfaces via `notifyError` — error message shown in the form, modal stays open.
- If `moveEvent` succeeds but `updateEvent` fails: the event has already moved to the new calendar. This partial state is acceptable — the next `fetchAll` reflects reality. No rollback.
- Moving to the same calendar (no change): `moveEvent` is skipped entirely; `CalendarApp` compares `targetCalendarId` to `event.calendarId` before calling the service.
- Delete button behavior: unchanged — calls `deleteEvent` on the original event ID regardless of dropdown state.

## Testing

- Unit test `CalendarService.moveEvent`: verify correct endpoint, method, body, and cache clear on success.
- Unit test `EventDetailForm`: verify dropdown is disabled when the event calendar has `canEdit: false`; verify read-only option elements for `canEdit: false` calendars; verify `onSave` is called with correct `targetCalendarId`.
- Integration test in `CalendarApp`: verify `moveEvent` is called when calendar changes, skipped when it doesn't, and sequenced before `updateEvent`.
