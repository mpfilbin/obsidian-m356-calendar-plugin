# Multi-Day Spanning Events Design

**Date:** 2026-06-23
**Feature:** Horizontal spanning event bars for multi-day events in month and week views

## Overview

Both the month view and the week view currently show every event as a pill inside its start day's cell. Multi-day events (all-day events spanning more than one calendar day, and timed events that cross midnight) should instead render as horizontal bars that stretch across the day columns they occupy — matching Microsoft Outlook's calendar layout.

## Scope

- **Month view:** multi-day event bars span horizontally across day columns within each week row; bars split at the week boundary and continue on the next row (matching Outlook's cross-row continuation behavior)
- **Week view all-day row:** multi-day event bars span across day columns; timed cross-midnight events also appear here (not in the timeline) with start time on the left edge and end time on the right edge of the bar
- **Out of scope:** timed events in the timeline area are unchanged; the day view is unchanged

## What Counts as "Spanning"

| Event type | Condition | Shown as spanning bar |
|---|---|---|
| `isAllDay: true` | end date > start date + 1 day (Graph end is exclusive, so a single all-day event has endDate = startDate + 1; spanning requires endDate > startDate + 1) | Yes |
| `isAllDay: false` | date portion of `end.dateTime` > date portion of `start.dateTime` (crosses midnight) | Yes |
| All others | — | No — rendered as today |

## Architecture

### Computation Layer — `src/lib/spanningLayout.ts`

A new pure module with no React dependency, easily unit-tested.

**Types:**

```typescript
export interface SpanningSegment {
  event: M365Event;
  startCol: number;        // 0=Sunday … 6=Saturday, clamped to week edges
  colSpan: number;         // columns occupied (1–7)
  lane: number;            // 0-indexed row within the spanning layer
  continuesLeft: boolean;  // event started before this week's Sunday
  continuesRight: boolean; // event ends after this week's Saturday
}

export interface WeekSpanningLayout {
  segments: SpanningSegment[];
  totalLanes: number;
}
```

**`computeWeekSpanningLayout(events, weekStart)`**

- `weekStart` is the Sunday of the week (local midnight)
- Filters to events that (a) are spanning and (b) overlap with this week (Sun–Sat inclusive)
- For each event:
  - `startCol = max(0, dayOfWeek(event.start))` — clamped to Sunday for events that started earlier
  - For all-day events, the inclusive end date is `endDate - 1 day` (since Graph end is exclusive); for timed events the end date is used as-is
  - `endCol = min(6, dayOfWeek(inclusive end date))` — clamped to Saturday for events ending later
  - `colSpan = endCol - startCol + 1`
  - `continuesLeft = event.start < weekStart`
  - `continuesRight = inclusive end date > weekStart + 6 days`
- Sorts by start date ASC, then by duration DESC
- Assigns lanes greedily: for each event, pick the lowest lane where no already-assigned event in that lane overlaps
- Returns all segments and `totalLanes`

### SpanningBar Component — `src/components/SpanningBar.tsx`

Renders a single spanning event bar. Receives an `M365Event`, its `M365Calendar`, and a `SpanningSegment`.

**Visual treatment:**

| Condition | Treatment |
|---|---|
| `isAllDay: true` | Title centered; slightly dimmed — background `color + '1a'`, border `color + '80'` — to match Outlook's "background context" style |
| `isAllDay: false` (cross-midnight) | Full-strength color (`color + '26'` bg, full color border); start time floated left, end time floated right, title centered |
| `continuesLeft: true` | Left border-radius `0` (flat edge signals continuation from prior row) |
| `continuesRight: true` | Right border-radius `0` |
| Neither continues flag | Standard `var(--radius-s)` on both sides |

- Hover triggers `showPopover` (same `EventHoverPopover` as today)
- Click calls `onEventClick` with the event
- Both segments of a cross-week event show the title (sufficient width may vary, but the title is always present)

### Month View Restructuring — `src/components/MonthView.tsx`

**Before:** flat array of 35–42 `<DayCell>` elements in a 7-column CSS grid.

**After:** the flat array is chunked into week groups of 7. Each week renders a `<MonthWeekRow>` containing two stacked layers:

```
<MonthWeekRow>
  <SpanningLayer>     CSS grid, 7 cols, auto-rows (one row per lane)
    <SpanningBar />   grid-column: startCol+1 / span colSpan; grid-row: lane+1
    ...
    [+N overflow badges per column when lanes exceed maxSpanningLanes]
  </SpanningLayer>
  <DayCellsRow>       CSS grid, 7 cols (unchanged layout)
    <DayCell />       day number, weather, single-day events only
    ...
  </DayCellsRow>
</MonthWeekRow>
```

- `computeWeekSpanningLayout` is called once per week row
- **Spanning events are lifted out of `DayCell`**: a day cell only renders events where `isSpanning(event) === false`
- **Overflow:** a `maxSpanningLanes` prop (default `2`) caps the visible lanes. Spanning events that would fall into a lane ≥ `maxSpanningLanes` are hidden; each day column they touch accumulates a hidden-event count, shown as a `+N` badge in the `SpanningLayer` at `grid-row: maxSpanningLanes + 1`. Clicking the badge navigates to the day view (same behavior as the existing day-cell overflow button)
- The existing `maxEventsPerDay` continues to govern single-day events inside day cells

### Week View All-Day Row Restructuring — `src/components/WeekView.tsx`

**Before:** `display: flex` row of 7 individual `AllDayCell` components, each owning its events.

**After:** the per-cell structure is replaced with a single `AllDayGrid`:

```
<AllDayRow>
  <gutter />                52px spacer, unchanged
  <AllDayGrid>              CSS grid, 7 cols, grid-auto-rows: EVENT_ROW_HEIGHT
    <SpanningBar />         all events go here, including single-day all-day events
    ...
  </AllDayGrid>
</AllDayRow>
```

- `computeWeekSpanningLayout` is called for the full week, with **single-day all-day events included** (they get `colSpan: 1`). This gives the all-day row a visually consistent look where every entry uses the same pill style.
- Timed cross-midnight events appear here with the time-label treatment described above.
- The row **grows vertically** to accommodate all lanes (no truncation). The timeline scroll area below absorbs the height change.
- **Todos** remain rendered separately in a thin row below the `AllDayGrid` — a 7-column flex row where each column holds that day's todo pills, identical in structure to the current per-cell approach. This row is only rendered if any enabled todo list has items in the current week.

## CSS Changes

New classes:

| Class | Purpose |
|---|---|
| `.m365-month-week-row` | flex-column container for SpanningLayer + DayCellsRow |
| `.m365-month-spanning-layer` | `display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: EVENT_HEIGHT` |
| `.m365-month-day-cells` | 7-column grid row (mirrors current month grid but per-week) |
| `.m365-week-allday-grid` | `display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: EVENT_HEIGHT` |
| `.m365-spanning-bar` | base pill styles |
| `.m365-spanning-bar.continues-left` | `border-top-left-radius: 0; border-bottom-left-radius: 0` |
| `.m365-spanning-bar.continues-right` | `border-top-right-radius: 0; border-bottom-right-radius: 0` |
| `.m365-spanning-bar--allday` | dimmed color treatment for all-day events |
| `.m365-spanning-bar--timed` | full-strength color treatment for cross-midnight timed events |
| `.m365-spanning-overflow-badge` | `+N` badge in month spanning layer |

The current `.m365-week-allday-cell` and `.m365-week-allday-row` flex layout is removed/replaced.

## Data Flow

```
events (from CalendarApp)
  → MonthView / WeekView
    → computeWeekSpanningLayout(events, weekStart)
      → SpanningSegment[]
        → SpanningBar (grid-positioned)
    → remaining single-day events
        → EventCard in DayCell (month) / per-column todo rows (week)
```

## Testing

### New: `tests/lib/spanningLayout.test.ts`

Pure function tests — no rendering required:

- Single-day all-day event → not included in output
- Single-day timed event → not included
- Multi-day all-day event within one week → correct `startCol`, `colSpan`, `lane: 0`, no continues flags
- Multi-day event crossing week boundary → `continuesRight: true`, `colSpan` clamped to Saturday
- Event that started in prior week → `continuesLeft: true`, `startCol: 0`
- Timed cross-midnight event → included with correct columns
- Two overlapping spanning events → assigned to `lane: 0` and `lane: 1`
- Non-overlapping events → both assigned to `lane: 0` (greedy packing)
- `totalLanes` reflects the highest lane used + 1

### Updated: `tests/components/MonthView.test.tsx`

- Multi-day event renders a `.m365-spanning-bar`, not an `EventCard` in a day cell
- Cross-week event produces spanning bars in both week rows
- Overflow badge appears when spanning events exceed `maxSpanningLanes`
- Single-day events continue rendering in day cells as before

### Updated: `tests/components/WeekView.test.tsx`

- Multi-day all-day event renders a spanning bar in the all-day grid
- Timed cross-midnight event appears in the all-day grid with start/end time labels
- Single-day all-day event renders with `colSpan: 1` in the all-day grid
- Todo items are unaffected by the spanning layer change
