# Event Hover Details — Design Spec

**Date:** 2026-04-14  
**Branch:** `feat/event-hover-details`  
**Status:** Approved

---

## Overview

Show a read-only popover when hovering over any event in the month, week, or day view. The popover appears after a 300ms delay, dismisses on mouse-out, and does not replace the existing click-to-edit behavior.

---

## Architecture & Data Flow

A new `PopoverContext` sits just outside `CalendarApp` in the React tree. It holds:

- `hoveredEvent: M365Event | null`
- `hoveredCalendar: M365Calendar | null`
- `anchorRect: DOMRect | null` — the bounding rect of the hovered event button, captured at hover time
- `showPopover(event, calendar, rect)` — debounced 300ms before showing
- `hidePopover()` — fires immediately, cancels any pending show

Every event button in `MonthView`, `WeekView` (all-day row), `DayView` (all-day row), and `TimelineColumn` (timed events) calls `usePopoverContext()` and wires `onMouseEnter`/`onMouseLeave` to these two functions. No new props flow through any view component.

A single `<EventHoverPopover>` renders via `ReactDOM.createPortal` into `document.body` when `hoveredEvent` is non-null. Click behavior is unchanged — the existing `onEventClick` chain and `EventDetailModal` are untouched.

---

## Components

### New: `src/PopoverContext.tsx`

Exports `PopoverProvider`, `usePopoverContext`, and supporting types.

- Internally uses a `useRef` for the 300ms debounce timer
- `showPopover(event, calendar, rect)` schedules the state update after the delay
- `hidePopover()` clears the timer and immediately sets all state to `null`
- `PopoverProvider` wraps its children and renders `<EventHoverPopover>` via portal when `hoveredEvent` is non-null

### New: `src/components/EventHoverPopover.tsx`

Pure presentational component. Receives `event: M365Event`, `calendar: M365Calendar`, and `anchorRect: DOMRect`.

Computes `position: fixed` coordinates from `anchorRect`:
- Default: right of the anchor with a small gap
- Flip: if right side would overflow `window.innerWidth`, positions to the left instead

Renders (each field only if present):
- Event subject — bold header
- Formatted time range (start–end) or "All day" for all-day events
- Location
- `bodyPreview` — truncated to ~3 lines via CSS `-webkit-line-clamp`
- "Open in Outlook" label (non-interactive) when `webLink` is present — the popover uses `pointer-events: none` so no anchor tag

Uses CSS class `m365-event-hover-popover` for visual styling.

### Modified: `MonthView.tsx`, `WeekView.tsx`, `DayView.tsx`, `TimelineColumn.tsx`

Each event button gains:
- `onMouseEnter`: calls `showPopover(event, calendar, e.currentTarget.getBoundingClientRect())`
- `onMouseLeave`: calls `hidePopover()`

No new props added to any of these components.

### Modified: `src/view.tsx`

`PopoverProvider` wraps `<CalendarApp />` in the React tree. `CalendarApp` itself does not change.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| `location` absent | Field not rendered |
| `bodyPreview` absent | Field not rendered |
| `webLink` absent | "Open in Outlook" link not rendered |
| Rapid hover across events | 300ms debounce + immediate hide prevents flashing |
| Popover overflows right edge | Flips to left side of anchor |
| Obsidian pane resized | Position computed fresh from `getBoundingClientRect()` at hover time — always accurate |

---

## Styling

New block in `styles.css` for `.m365-event-hover-popover`:

- `position: fixed` is applied via inline style in `EventHoverPopover.tsx`, not this CSS block
- `z-index` high enough to clear Obsidian UI layers
- Themed background, border, box shadow, padding
- `max-width: 280px`
- `pointer-events: none` — popover is read-only; mouse events pass through to underlying UI

---

## Testing

### `tests/components/EventHoverPopover.test.tsx`

- Renders all fields when all are present (subject, time range, location, bodyPreview, webLink indicator)
- Omits optional fields when absent from the event
- Shows "All day" instead of a time range for all-day events
- Positions to the left when `anchorRect` is near the right viewport edge

### `tests/PopoverContext.test.tsx`

- `showPopover` does not display the popover before 300ms
- `showPopover` displays the popover after 300ms
- `hidePopover` called before 300ms cancels the pending show
- `hidePopover` dismisses a visible popover immediately
