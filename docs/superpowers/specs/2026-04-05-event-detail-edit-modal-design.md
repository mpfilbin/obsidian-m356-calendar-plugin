# Event Detail / Edit Modal — Design Spec

**Date:** 2026-04-05
**Status:** Approved

---

## Overview

Users currently have no way to view or edit the details of a calendar event — clicking an event card does nothing. This feature adds a click handler to event cards that opens an edit modal pre-populated with the event's details. The user can modify fields and save changes back to Microsoft Graph, or cancel to discard.

---

## Architecture

Follows the existing `CreateEventModal` pattern: an Obsidian `Modal` subclass mounts a React form component via `createRoot`. No changes to the create flow.

**New files:**
- `src/components/EventDetailModal.tsx` — Modal subclass and embedded `EventDetailForm` React form component

**Modified files:**
- `src/types/index.ts` — add `location` field to `M365Event`
- `src/services/CalendarService.ts` — fetch `location`, add `updateEvent()` method
- `src/components/EventCard.tsx` — add `onClick` prop
- `src/components/MonthView.tsx` — add `onEventClick` prop, wire to EventCard
- `src/components/WeekView.tsx` — add `onEventClick` prop, wire to EventCard
- `src/components/CalendarApp.tsx` — add `handleEventClick`, open modal, refresh on save

---

## Data Layer

### `src/types/index.ts`
Add `location?: string` to `M365Event`.

### `src/services/CalendarService.ts`

**`getEvents` / `$select`:** Add `'location'` to the select string.

**`mapEvent()`:** Map `event.location?.displayName ?? undefined` to the `location` field.

**New method `updateEvent(eventId: string, patch: EventPatch): Promise<void>`:**

Where `EventPatch` is a local interface (defined in `CalendarService.ts` or `types/index.ts`) with all fields optional:
```typescript
interface EventPatch {
  subject?: string;
  location?: string;       // sent as { displayName: string } in the request body
  isAllDay?: boolean;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  bodyContent?: string;    // sent as { contentType: 'text', content: string }
}
```

The method constructs the Graph API body from whichever fields are present, calls `PATCH https://graph.microsoft.com/v1.0/me/events/{eventId}`, uses the auth token from `AuthService`, and throws on non-2xx response.

**Known limitation:** The fetched `bodyPreview` field contains at most the first ~255 characters of the event body. Saving edits back via `body.content` will replace the full body with this potentially truncated text. Acceptable for now; fetching the full body would require an additional API call or expanding `$select` to include `body`.

---

## EventDetailModal

**`src/components/EventDetailModal.tsx`**

```
class EventDetailModal extends Modal {
  constructor(app, event, calendar, calendarService, onSave)
  onOpen()  → titleEl.setText('Edit event'), createRoot(contentEl).render(<EventDetailForm .../>)
  onClose() → root.unmount()
}
```

Opened from `CalendarApp.handleEventClick(event)`. The `onSave` callback triggers a silent background refresh (`fetchAll({ reloadCalendars: false, notify: false })`).

---

## EventDetailForm

**`src/components/EventDetailForm.tsx`**

Controlled React form, state initialized from the event prop.

**Fields:**
| Field | Input type | Notes |
|-------|-----------|-------|
| Subject | `<input type="text">` | Required |
| Location | `<input type="text">` | Optional, new field |
| All day | checkbox/toggle | Switches start/end between `datetime-local` and `date` |
| Start | `datetime-local` or `date` | Controlled by isAllDay |
| End | `datetime-local` or `date` | Controlled by isAllDay |
| Description | `<textarea>` | Maps to bodyPreview / body.content |

**Actions:**
- **OK** — calls `calendarService.updateEvent()`, shows loading state, closes modal + calls `onSave()` on success, shows inline error on failure
- **Cancel** — closes modal without saving

---

## Click Handler Wiring

### `EventCard`
Add `onClick?: () => void` prop. Attach to the card `div`'s `onClick`.

### `MonthView` + `WeekView`
Add `onEventClick: (event: M365Event) => void` prop. Pass through to each `EventCard` as `onClick={() => { e.stopPropagation(); onEventClick(event); }}`. The `stopPropagation` prevents the day cell's `onDayClick` from also firing.

### `CalendarApp`
Add `handleEventClick(event: M365Event)`:
```
function handleEventClick(event: M365Event) {
  const calendar = calendarMap.get(event.calendarId);
  if (!calendar) return;
  new EventDetailModal(app, event, calendar, calendarService, () => {
    fetchAll({ reloadCalendars: false, notify: false });
  }).open();
}
```
Pass `onEventClick={handleEventClick}` to `MonthView` and `WeekView`.

---

## Error Handling

- If `updateEvent()` throws, `EventDetailForm` catches and displays an inline error message below the form fields. The modal stays open so the user can retry or cancel.
- Network errors and non-2xx Graph responses both surface as thrown errors.

---

## Testing

### `CalendarService.updateEvent`
- Mock `fetch`, verify `PATCH /v1.0/me/events/{id}` called with correct body + auth header
- Verify throws on non-2xx response

### `EventDetailForm`
- Render with a mock event; verify fields are pre-populated
- Simulate editing subject + location; click OK; verify `calendarService.updateEvent` called with correct payload and `onSave` called on success
- Simulate `updateEvent` rejection; verify inline error message shown, `onSave` not called

### `EventCard`
- Verify `onClick` is called when the card is clicked

### `MonthView` / `WeekView`
- Verify `onEventClick` called with correct event when an event card is clicked
- Verify `onDayClick` is NOT called when an event card is clicked (stopPropagation)
