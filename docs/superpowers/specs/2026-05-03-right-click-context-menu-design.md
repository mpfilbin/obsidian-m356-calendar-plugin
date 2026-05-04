# Right-Click Context Menu Design

**Date:** 2026-05-03  
**Status:** Approved

## Overview

Add right-click context menus to the month and week calendar views, allowing users to create a new event or task scoped to the day (and time, in the timeline) they right-clicked.

## Requirements

- Right-clicking a day cell in the **month view** shows a context menu with "New event" and "New task".
- Right-clicking a day **header** in the week view shows the same menu.
- Right-clicking a cell in the **all-day row** of the week view shows the same menu; "New event" opens with the all-day checkbox pre-checked.
- Right-clicking in the **timeline area** of the week view shows the same menu; "New event" opens with the start time computed from the click's vertical position.
- The native browser context menu is suppressed in all these areas.
- Existing left-click behavior (navigate to day view, open popovers, etc.) is unchanged.

## Data Contract

A new discriminated union added to `src/types/index.ts`:

```ts
export type DayContextMenuPayload =
  | { kind: 'timed'; dateTime: Date }  // timeline right-click — includes computed time
  | { kind: 'allday'; date: Date }     // month cell, week header, or all-day row
```

Both `MonthView` and `WeekView` receive one new optional prop:

```ts
onDayContextMenu?: (payload: DayContextMenuPayload, event: MouseEvent) => void;
```

## Component Changes

### `MonthView`

Each day cell `<div>` gets an `onContextMenu` handler:

```ts
onContextMenu={(e) => {
  e.preventDefault();
  onDayContextMenu?.({ kind: 'allday', date: day }, e.nativeEvent);
}}
```

### `WeekView`

Three areas get `onContextMenu` handlers (all call `e.preventDefault()`):

1. **Day header** (`m365-calendar-week-day` div): fires `{ kind: 'allday', date: day }`
2. **All-day row cells** (`m365-week-allday-cell` div): fires `{ kind: 'allday', date: day }`
3. **Timeline columns**: delegated via a new `TimelineColumn` prop (see below)

### `TimelineColumn`

Gains a new optional prop:

```ts
onTimeContextMenu?: (dateTime: Date, event: MouseEvent) => void;
```

Uses the same click-position-to-time math already used by `onTimeClick`. `WeekView` converts this into a `{ kind: 'timed', dateTime }` payload and calls `onDayContextMenu`.

### `CreateEventModal` / `CreateEventForm`

`openCreateEventModal` in `CalendarApp` gains an optional second parameter `initialAllDay?: boolean`. When `true`, `CreateEventForm` initializes `isAllDay` to `true`, which already switches the start/end inputs to date-only pickers via the existing `handleAllDayChange` logic.

## CalendarApp Wiring

```ts
const handleDayContextMenu = (payload: DayContextMenuPayload, event: MouseEvent) => {
  const menu = new Menu();
  menu.addItem(item =>
    item.setTitle('New event').setIcon('calendar-plus').onClick(() => {
      const date = payload.kind === 'timed' ? payload.dateTime : payload.date;
      openCreateEventModal(date, payload.kind === 'allday');
    })
  );
  menu.addItem(item =>
    item.setTitle('New task').setIcon('check-square').onClick(() => {
      // Tasks only have a due date (no time), so always pass the date portion only.
      const date = payload.kind === 'timed' ? payload.dateTime : payload.date;
      openCreateTaskModal(date);
    })
  );
  menu.showAtMouseEvent(event);
};
```

`MonthView` and `WeekView` both receive `onDayContextMenu={handleDayContextMenu}`.

## Error Handling

No special error handling required. The existing guard in `openCreateEventModal` (no enabled calendars → Notice) and `openCreateTaskModal` (no lists → Notice) covers the failure cases.

## Testing

- Unit tests for `MonthView`: simulate `contextmenu` on a day cell, assert `onDayContextMenu` called with `{ kind: 'allday', date }`.
- Unit tests for `WeekView`: simulate `contextmenu` on day header, all-day cell, and (via `TimelineColumn`) timeline — assert correct payload kind and date/time values.
- Unit tests for `TimelineColumn`: simulate `contextmenu` at a known vertical offset, assert `onTimeContextMenu` called with correctly computed `dateTime`.
- No tests needed for `CalendarApp` menu wiring (Obsidian `Menu` is a side-effectful UI primitive; covered by integration behavior).
