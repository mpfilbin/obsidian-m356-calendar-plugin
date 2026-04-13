# Week View Vertical Timeline

**Date:** 2026-04-13
**Status:** Approved

## Summary

Replace the current list-based week view with a vertical 24-hour timeline matching the day view's layout. Events are positioned top-to-bottom by start time with height proportional to duration. A shared time gutter on the left aligns all seven day columns. All-day events appear in a dedicated row above the timeline.

## Approach

Extract a shared `TimelineColumn` component from `DayView`. Both `DayView` and `WeekView` use it. This eliminates code duplication and keeps both views consistent.

## Components

### `TimelineColumn` (new — `src/components/TimelineColumn.tsx`)

Renders the slot grid and absolutely-positioned event blocks for a single day column.

```ts
interface TimelineColumnProps {
  date: Date;
  events: M365Event[];         // timed events only (no all-day)
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
}
```

- Slot grid: hour/half/quarter divs, same logic as current DayView
- Event blocks: absolutely positioned using `layoutEvents`, `PX_PER_MIN`, `MIN_EVENT_HEIGHT` from DayView constants (moved here or re-exported)
- Height: `HOURS_IN_DAY * 60 * PX_PER_MIN` (1440px)
- Reuses existing CSS classes: `m365-day-view-slot`, `m365-day-event-block`, `m365-day-event-content`, etc.

### `DayView` (refactored)

- All-day events row and time gutter labels remain in `DayView`
- Timeline section delegates to `TimelineColumn`
- Rendered output is structurally identical — no visual change, no test breakage

### `WeekView` (restructured)

Two vertical sections:

**All-day row** (`m365-week-allday-row`):
- `display: flex`
- 52px gutter spacer on the left (aligns with time gutter below)
- 7 equal-width cells (`flex: 1`), one per day
- Each cell shows stacked all-day `EventCard` items
- `min-height: 24px` so the row is visible even when no all-day events exist

**Timeline area** (`m365-week-timeline-area`):
- `display: flex`, `overflow-y: auto`, `flex: 1`
- Time gutter (`m365-week-time-gutter`): 52px wide, `flex-shrink: 0`, `position: relative`, height 1440px — renders hour labels at `top: hour * 60 * PX_PER_MIN`
- 7 `TimelineColumn` instances: `flex: 1` each, separated by 1px borders

## Layout & CSS

Current `.m365-calendar-week-view` is `grid-template-columns: repeat(7, 1fr)`. This is replaced with a `flex-direction: column` wrapper containing the all-day row and timeline area.

New CSS classes needed:
- `m365-week-allday-row` — flex row, all-day strip
- `m365-week-allday-gutter` — 52px spacer to align with time gutter
- `m365-week-allday-cell` — flex: 1, one per day
- `m365-week-timeline-area` — flex row, scrollable, flex: 1
- `m365-week-time-gutter` — 52px, hour labels

Existing day view CSS classes are reused by `TimelineColumn` with no changes.

## Data Flow

`WeekView` receives the same props as today. Internally:
1. Splits events into per-day buckets (existing logic)
2. Splits each day's bucket into `allDay` and `timed` subsets
3. `timed` → `TimelineColumn` for each day
4. `allDay` → all-day row cells

**`onTimeClick`**: clicking a time slot in a week column calls `onDayClick(date)` where `date` is the clicked day with the clicked hour/minute — navigates to day view for that day, consistent with clicking a day header.

The day header click (`onDayClick`) is preserved unchanged.

## Testing

- **`TimelineColumn`** — new tests: event block `top`/`height` positioning for a given event time; `onTimeClick` called with correct date
- **`WeekView`** — existing tests updated: timed events appear as positioned blocks, all-day events in the all-day row
- **`DayView`** — existing tests pass unchanged (structural output is the same)
