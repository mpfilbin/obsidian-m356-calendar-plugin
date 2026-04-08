# New Event Button — Design Specification

**Date:** 2026-04-07
**Status:** Approved

---

## Overview

Add a "New event" button to the calendar toolbar that opens the existing `CreateEventModal` pre-populated with today's date. This provides a direct entry point for event creation without requiring the user to click a specific day cell.

---

## Goals

- Surface a prominent "New event" button in the toolbar
- Reuse the existing `CreateEventModal` and `handleDayClick` flow
- Keep `Toolbar` a pure presentational component (all actions as callbacks)

## Non-Goals

- Any changes to the `CreateEventModal` form itself
- A separate code path for event creation (the existing `handleDayClick` is reused)

---

## Design

### Toolbar changes

`ToolbarProps` gains one new callback:

```ts
onNewEvent: () => void;
```

The button is rendered between the view toggle group and the refresh button:

```
[ ‹  Today  ›  April 2026 ]   [ Month | Week ]   [ + New event ]   [ ↻ ]
```

Label: **`+ New event`**
CSS class: `m365-new-event-btn` (custom styles in `styles.css` — does not use `mod-cta`)

### CalendarApp wiring

`CalendarApp` passes:

```tsx
onNewEvent={() => handleDayClick(new Date())}
```

`handleDayClick` already handles the full flow:
1. Guards against no enabled calendars (no-op)
2. Opens `CreateEventModal` with `initialDate = new Date()` (pre-fills 9:00–10:00 AM today)
3. On successful creation, injects the created event into existing local event state so it appears immediately, rather than calling `fetchAll()` — avoids relying on an immediate re-fetch, which can be delayed by Microsoft Graph propagation

No new state is required.

### Styling

New rule in `styles.css` under the toolbar section:

```css
.m365-new-event-btn {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-s);
  cursor: pointer;
  padding: var(--size-4-1) var(--size-4-3);
  font-size: var(--font-ui-small);
  white-space: nowrap;
}

.m365-new-event-btn:hover {
  filter: brightness(0.9);
}
```

---

## Testing

**`Toolbar.test.tsx`** — one new test:

- Clicking the "+ New event" button calls `onNewEvent`

`CalendarApp` wiring is not separately tested — the `handleDayClick` path is already covered by the existing day-click tests, and the button→handler connection is verified by the Toolbar test.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/Toolbar.tsx` | Add `onNewEvent` prop; render `+ New event` button |
| `tests/components/Toolbar.test.tsx` | Add test for `onNewEvent` callback |
| `src/components/CalendarApp.tsx` | Pass `onNewEvent` to `<Toolbar />` |
| `styles.css` | Add `.m365-new-event-btn` styles |
