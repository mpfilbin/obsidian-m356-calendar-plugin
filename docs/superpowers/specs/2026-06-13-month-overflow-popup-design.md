# Month View Overflow Hover Popup

**Date:** 2026-06-13  
**Branch:** mpf/simple_month_view

## Summary

When a day cell in the month view contains more than 4 items (events + todos), show a `(+n)` bar at the bottom of the cell. Hovering over the bar reveals a read-only popup listing the overflow items as compact cards. Clicking the bar still navigates to the day view.

## Changes

### 1. `(+n)` bar (`MonthView.tsx`)

- Change `maxEventsPerDay` default from `6` to `4`.
- Change overflow button text from `"+ X more"` to `"(+X)"`.
- Add a subtle background (`--background-modifier-border` at low opacity) to the bar so it reads as a band, not plain text.
- Add `onMouseEnter` and `onMouseLeave` handlers to trigger the overflow popup (see Section 3).
- Click behavior unchanged: navigates to the day view.

### 2. `OverflowPopup` component (`src/components/OverflowPopup.tsx`)

New component rendered via `createPortal` to `document.body`.

**Props:**
- `events: M365Event[]` — the overflow events (those not shown in the cell)
- `todos: M365TodoItem[]` — the overflow todos
- `calendarMap: Map<string, M365Calendar>`
- `todoListMap: Map<string, M365TodoList>`
- `anchorRect: DOMRect` — bounding rect of the `(+n)` bar button

**Rendering:**
- Positioned fixed, aligned to the top of the anchor.
- Placed to the right of the anchor; falls back to the left if the right side would overflow the viewport (same logic as `EventHoverPopover`).
- Lists overflow events first (as `EventCard`), then overflow todos (as `TodoCard`), with no `onClick` handlers — informational only.
- Max-height with `overflow-y: auto` to handle large overflow counts.
- `pointer-events: none` so it does not capture mouse events.

**Popup width:** 220px (narrower than `EventHoverPopover`'s 280px since it's just compact cards).

### 3. Local state in `MonthView`

```ts
const [overflowPopover, setOverflowPopover] = useState<{
  events: M365Event[];
  todos: M365TodoItem[];
  anchorRect: DOMRect;
} | null>(null);
const overflowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- `onMouseEnter` on the `(+n)` button: clear any pending timer, then set a 300ms timer that calls `setOverflowPopover(...)` with the overflow events/todos and `e.currentTarget.getBoundingClientRect()`.
- `onMouseLeave` on the `(+n)` button: clear the timer and call `setOverflowPopover(null)`.
- `useEffect` cleanup clears the timer on unmount.
- `createPortal(<OverflowPopup ...>, document.body)` rendered at the bottom of `MonthView`'s JSX when `overflowPopover !== null`.

### 4. CSS (`styles.css`)

- Update `.m365-month-overflow-btn` to add a subtle background tint using `var(--background-modifier-border)` so the bar is visually distinct.
- New `.m365-overflow-popup` class: `position: fixed`, `background: var(--background-primary)`, `border: 1px solid var(--background-modifier-border)`, `border-radius: 6px`, `padding: 6px`, `z-index: 1000`, `max-height: 300px`, `overflow-y: auto`, `pointer-events: none`, `width: 220px`.

## What does NOT change

- `CalendarApp.tsx` — no prop changes needed; `maxEventsPerDay` is not passed explicitly.
- `PopoverContext.tsx` / `EventHoverPopover.tsx` — unchanged; individual event hover still works as before.
- Clicking the `(+n)` bar still navigates to the day view.
- The overflow popup items are not clickable.

## Testing

- Verify `(+n)` bar appears for days with 5+ items and not for days with 4 or fewer.
- Verify hovering shows the correct overflow items (those not already visible in the cell).
- Verify clicking still navigates to the day view.
- Check that existing tests asserting the overflow threshold do not regress (threshold changes from 6 to 4).
