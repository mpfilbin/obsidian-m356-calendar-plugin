# Day View Feature — Design Spec

**Date:** 2026-04-09

## Overview

Add a day view to the M365 Calendar plugin. Day view is entered by clicking a date in the month or week view, or by clicking the "+ N more" overflow banner in the month view. The day view renders a 24-hour vertical timeline with events positioned and sized proportionally to their duration. Overlapping events are displayed side by side in columns.

## Types

`ViewType` expands from `'month' | 'week'` to `'month' | 'week' | 'day'` in `src/components/CalendarApp.tsx` and `src/components/Toolbar.tsx`.

## Navigation & `CalendarApp` Changes

### `getDateRange`

A new `'day'` case returns:
- `start`: midnight of `currentDate` (local time)
- `end`: midnight of the following day (exclusive upper bound, matching the existing pattern)

### `handleNavigate`

In `'day'` view:
- `'prev'`: shifts `currentDate` back 1 day
- `'next'`: shifts `currentDate` forward 1 day
- `'today'`: resets `currentDate` to today

### `handleDayClick`

Replaces the current behavior of opening `CreateEventModal`. Now calls:
```ts
setView('day');
setCurrentDate(date);
```

This handler is already passed as `onDayClick` to both `MonthView` and `WeekView`, so clicking any day cell or week-day header in either view navigates to day view for that date. Event creation from a day cell is removed. Users create events via the "+ New event" toolbar button or by clicking a time slot in the day view.

### Day view wiring

`CalendarApp` renders `<DayView>` when `view === 'day'`, passing:
- `currentDate`
- `events` (already filtered to the day's range by `getDateRange`)
- `calendars`
- `onTimeClick` — opens `CreateEventModal` with the clicked time pre-filled as the start date
- `onEventClick` — same handler as month/week views

### Toolbar label

For `'day'` view, the label shows the full date: e.g., `"Wednesday, April 9, 2026"` using `toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })`.

## MonthView Overflow

`MonthView` gains an optional prop `maxEventsPerDay?: number` (default: `6`).

For each day cell:
- The first `maxEventsPerDay` events are rendered as normal.
- If there are additional events beyond the limit, a `<button>` is rendered after the visible events showing `+ N more` (where N is the overflow count).
- Clicking `+ N more` calls `onDayClick(day)`, navigating to the day view for that date — the same as clicking the date number.

No changes to `MonthViewProps` beyond `maxEventsPerDay`.

## `DayView` Component

**File:** `src/components/DayView.tsx`

### Props

```ts
interface DayViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
}
```

### Layout constants

```ts
const PX_PER_MIN = 1;       // 60px per hour, 1440px total
const MIN_EVENT_HEIGHT = 15; // minimum pixel height for very short events
```

### Structure

Two sections stacked vertically:

**1. All-day banner** (top)
- Shows events where `isAllDay === true` as `EventCard` components in a horizontal row.
- Hidden if there are no all-day events for the day.

**2. Scrollable timeline** (main)
- A positioned container, `1440px` tall.
- Hour labels (`00:00`–`23:00`) on the left as decorative row dividers.
- Timed events absolutely positioned within the container.
- Clicking the timeline background (not on an event) computes the vertical offset using `e.clientY - getBoundingClientRect().top`, rounds to the nearest 15 minutes, and calls `onTimeClick` with a `Date` set to that day and time.

### Event positioning

For each timed event:
```
top    = (startHour × 60 + startMinute) × PX_PER_MIN
height = max(durationMinutes × PX_PER_MIN, MIN_EVENT_HEIGHT)
```

Events with missing or unparseable `start`/`end` datetimes are filtered out before layout.

### Overlap layout — `layoutEvents`

A pure function `layoutEvents(events: M365Event[]): LayoutEvent[]` where:

```ts
interface LayoutEvent {
  event: M365Event;
  column: number;
  columnCount: number;
}
```

**Algorithm:**
1. Sort events by start time.
2. Group events into overlap clusters: a cluster is a maximal connected component in the overlap graph (events are nodes; an edge exists between two events if their time ranges overlap). Events in a cluster need not all overlap each other pairwise.
3. Within each cluster, assign column indices greedily: each event takes the lowest available column not already occupied by an overlapping event.
4. `columnCount` for each event is the total number of columns in its cluster.

Each event renders with:
```
width = 100% / columnCount
left  = column × (100% / columnCount)
```

Applied as inline styles on the absolutely-positioned event element.

## Error Handling

`DayView` is purely presentational — all data fetching and auth errors are handled in `CalendarApp` as before. Events with unparseable datetimes are silently filtered before the layout pass rather than crashing the component.

## Testing

### `layoutEvents` (unit tests)
- No events → empty array
- Single event → `column: 0, columnCount: 1`
- Two non-overlapping events → each gets `columnCount: 1`
- Two fully overlapping events → each gets `columnCount: 2`, different columns
- Three-way overlap → each gets `columnCount: 3`, all different columns
- Partial overlap chain (A overlaps B, B overlaps C, A does not overlap C) → A and C share a column, B gets its own

### `DayView` component tests
- All-day events render in the banner; timed events do not appear in the banner
- Timed events render in the timeline
- An event with no matching calendar is not rendered
- Clicking the timeline background calls `onTimeClick` with a time rounded to the nearest 15 minutes
- Clicking an event calls `onEventClick` with the correct event
- `onEventClick` click does not bubble to the timeline `onTimeClick` handler

### `MonthView` overflow tests
- A day with exactly 6 events shows all 6, no overflow button
- A day with 7 events shows 6 events and `+ 1 more`
- Clicking `+ N more` calls `onDayClick` with the correct date
- `maxEventsPerDay` prop overrides the default of 6

### `CalendarApp` navigation tests
- Clicking a day cell sets `view` to `'day'` and `currentDate` to the clicked date
- `getDateRange` returns a single-day range (midnight to next midnight) for `'day'` view
- Navigating prev/next in day view shifts `currentDate` by exactly 1 day
- Toolbar label in day view shows the full date string
