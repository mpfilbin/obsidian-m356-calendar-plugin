# Month View Event Sort — Design Spec

**Date:** 2026-06-14  
**Status:** Approved

## Problem

Events in a day cell on the month view render in the order they arrive from the API (calendar fetch order). This means a 9 AM meeting might appear below a 3 PM meeting, and all-day events can appear anywhere in the list rather than at the top.

## Goal

Render events in each day cell in ascending start-time order, with all-day events pinned to the top.

## Approach

Sort `dayEvents` per-cell inside `MonthView.tsx`, immediately after the `.filter()` that selects events for the cell. No changes to CalendarApp, other views, or utility libraries.

## Sort Rules

1. All-day events (`isAllDay: true`) sort before timed events.
2. Among timed events, sort ascending by `start.dateTime` (ISO string lexicographic comparison — correct for ISO timestamps).
3. Among multiple all-day events, preserve API arrival order (no secondary sort).
4. Todos remain after all events, in their existing order (unchanged).

## Affected Code

- **`src/components/MonthView.tsx`** — one change: chain `.sort()` on `dayEvents` after `.filter()`.

```typescript
const dayEvents = events
  .filter((e) => e.start.dateTime.slice(0, 10) === cellDateStr)
  .sort((a, b) => {
    if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
    return a.start.dateTime.localeCompare(b.start.dateTime);
  });
```

## Scope

- The overflow popup (`OverflowPopup`) automatically gets the sorted tail because it slices from the same sorted `dayEvents` array — no separate change needed.
- Week and day views are unaffected.
- No new tests required for this change; existing month view tests cover the rendering path and the sort is a pure data transformation.

## Non-Goals

- Interleaving todos with events by time.
- Sorting events upstream in CalendarApp.
- Secondary sort for multiple all-day events.
