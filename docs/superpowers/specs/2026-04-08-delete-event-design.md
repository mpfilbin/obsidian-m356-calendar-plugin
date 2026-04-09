# Delete Event Feature — Design Spec

**Date:** 2026-04-08

## Overview

Add the ability to delete an existing calendar event from within the event detail modal. Deletion is only available for events belonging to editable calendars (`canEdit === true`). A two-phase inline confirmation prevents accidental deletion.

## Service Layer

`CalendarService` gains a new method:

```ts
async deleteEvent(eventId: string): Promise<void>
```

- Calls `DELETE https://graph.microsoft.com/v1.0/me/events/{eventId}` with a bearer token.
- Throws an `Error` on any non-2xx response.
- Calls `this.cache.clearAll()` on success.
- Follows the same pattern as `updateEvent`.

## UI — `EventDetailForm`

### New prop

```ts
onDelete?: () => Promise<void>
```

When `undefined`, no Delete button is rendered. When provided, a "Delete" button appears in the actions row alongside Cancel/OK.

### New state

```ts
const [confirmingDelete, setConfirmingDelete] = useState(false);
```

### Two-phase flow

**Normal state:**
- Actions row: `[Cancel] [Delete] [OK]`
- Delete button sets `confirmingDelete = true`.

**Confirming state** (`confirmingDelete === true`):
- Form fields are disabled (not hidden — the user can still see what they're about to delete).
- Actions row is replaced with: message "This will permanently delete the event." and buttons `[Cancel] [Delete event]`.
- Cancel resets `confirmingDelete = false`.
- "Delete event" calls `onDelete()`.
  - On success: modal closes.
  - On failure: `console.error('M365 Calendar:', e)` is called, the inline `error` state is set, and `confirmingDelete` resets to `false` so the user can retry or cancel.

## `EventDetailModal` Wiring

`EventDetailModal` accepts a new optional constructor parameter:

```ts
private readonly onDeleteCallback?: () => Promise<void>
```

It forwards this as `onDelete` to `EventDetailForm`. On successful delete, the modal closes.

## `CalendarApp` Wiring

In `handleEventClick`:

1. Look up the event's calendar from the `calendars` state array using `event.calendarId`.
2. If `calendar?.canEdit === true`, wire up an `onDelete` callback that:
   - Calls `calendarService.deleteEvent(event.id)`.
   - On success: removes the event from local `events` state directly (avoids Graph propagation delay), shows an Obsidian `Notice` toast ("Event deleted"), and the modal closes.
   - On failure: re-throws so `EventDetailForm` can display the inline error (no `Notice` toast — the inline error is the sole failure signal to avoid redundancy).
3. If `canEdit` is false or the calendar is not found, pass `onDelete={undefined}` — no Delete button is shown.

## Error Handling

| Scenario | Behavior |
|---|---|
| Delete API call fails | `console.error('M365 Calendar:', e)` + inline error in form + `confirmingDelete` resets to `false` |
| Calendar not found / not editable | Delete button not shown |
| Success | Event removed from local state + `Notice` toast + modal closes |

## Testing

### `CalendarService.deleteEvent`
- Calls `DELETE /me/events/{id}` with the correct auth header.
- Calls `cache.clearAll()` on success.
- Throws on non-2xx response.

### `EventDetailForm`
- Delete button renders when `onDelete` is provided; absent when `onDelete` is `undefined`.
- Clicking Delete enters confirming state (fields disabled, confirm message + buttons shown).
- Clicking Cancel in confirming state returns to normal state.
- Clicking "Delete event" calls `onDelete`.
- When `onDelete` rejects, inline error is shown and confirming state resets.

### `CalendarApp` / `EventDetailModal`
- `onDelete` is wired when `canEdit === true`.
- `onDelete` is not wired (Delete button absent) when `canEdit === false`.
