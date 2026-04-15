# Current Time Indicator — Design Spec

**Date:** 2026-04-14

## Overview

Add a red horizontal line to the Day and Week views indicating the current time, with auto-scroll to center the line on load. The line updates in real time (advances every minute). It is only visible when the displayed date range includes today.

## Scope

- **Day view**: line spans the full width of `TimelineColumn`; visible only when `currentDate` is today.
- **Week view**: line spans the full width of `.m365-week-timeline-area` (including the time gutter); visible only when the displayed week includes today.
- **Month view**: no changes.

## Components and Changes

### 1. `useNow` hook — new file: `src/hooks/useNow.ts`

Returns the current `Date`, refreshed every minute. Aligns the first tick to the next whole minute (delay = `60000 - Date.now() % 60000`) so the line moves at `:00` seconds rather than drifting. Subsequent ticks fire every 60 seconds. Cleans up the interval on unmount.

```
export function useNow(): Date
```

Both `DayView` and `WeekView` (and `TimelineColumn`) call this independently. The hook is unconditional — visibility is controlled by the caller, not the hook.

### 2. `TimelineColumn` — modified

New prop:

```ts
showNowLine?: boolean
```

When `showNowLine` is true, `TimelineColumn` calls `useNow()` internally and renders an absolutely-positioned line. (`DayView` also calls `useNow()` independently for the scroll calculation — two separate intervals, both ticking at the same wall-clock minute boundary.)

```
position: absolute
top: nowMinutes * PX_PER_MIN   // nowMinutes = now.getHours() * 60 + now.getMinutes()
left: 0
right: 0
height: 2px
background-color: red (var(--color-red) if available in Obsidian theme tokens)
pointer-events: none
z-index: 10
```

The line is rendered inside the existing `position: relative` timeline container, so no structural changes are needed.

### 3. `DayView` — modified

- Computes `isToday(currentDate)` and passes `showNowLine={isToday(currentDate)}` to `TimelineColumn`.
- Gains a `ref` (`scrollRef`) on the `.m365-day-view` scroll container.
- Gains a `ref` (`timelineRef`) on the `TimelineColumn` wrapper div to capture its `offsetTop` (accounts for any all-day events row above the timeline).
- On mount, a `useEffect` with empty deps fires once:
  ```
  scrollRef.current.scrollTop =
    (timelineRef.current.offsetTop + nowPx) - scrollRef.current.clientHeight / 2
  ```
  Clamped to `[0, scrollHeight - clientHeight]`.

`isToday(d)` is a small inline helper: compares year/month/date of `d` to `new Date()`.

### 4. `WeekView` — modified

- Computes `isCurrentWeek`: true if `new Date()` falls within the displayed Sunday–Saturday range.
- Calls `useNow()` when `isCurrentWeek` is true (always called unconditionally per hook rules; result ignored when not current week).
- When `isCurrentWeek`, renders a full-width overlay line inside `.m365-week-timeline-area`:
  ```
  position: absolute
  top: nowMinutes * PX_PER_MIN
  left: 0
  right: 0
  height: 2px
  background-color: red
  pointer-events: none
  z-index: 10
  ```
  `.m365-week-timeline-area` already has `display: flex`; adding `position: relative` to it enables absolute child positioning.
- Gains a `ref` (`scrollRef`) on `.m365-week-timeline-area`.
- On mount, a `useEffect` with empty deps fires once:
  ```
  scrollRef.current.scrollTop = nowPx - scrollRef.current.clientHeight / 2
  ```
  Clamped to `[0, scrollHeight - clientHeight]`. No `offsetTop` adjustment needed — the all-day row is outside `.m365-week-timeline-area`.

## Data Flow

```
useNow() → Date → nowMinutes = hours * 60 + minutes → nowPx = nowMinutes * PX_PER_MIN
```

- `PX_PER_MIN = 1` (from `TimelineColumn` constants), so `nowPx === nowMinutes`.
- Each component that calls `useNow()` gets its own interval; they tick independently but nearly simultaneously.

## Scroll Behavior

- Fires **once on mount** via `useEffect(fn, [])`.
- If the view is not showing today/this week, the scroll effect is a no-op (guard: only set `scrollTop` if `isToday` / `isCurrentWeek`).
- No re-centering after manual scroll.
- No re-centering on panel resize.
- Navigating away from and back to a view remounts the component, so the scroll fires again on return.

## Edge Cases

| Scenario | Behavior |
|---|---|
| `nowMinutes === 0` (midnight) | Line at `top: 0`; scroll clamps to 0 (view scrolls to top) |
| View shows past/future date | Line not rendered; scroll effect skipped |
| Week includes today but today is a Sunday | `isCurrentWeek` is true; line renders at correct y-position |
| All-day events row present in Day view | `timelineRef.offsetTop` captures the correct offset automatically |
| Obsidian panel resized after mount | Scroll position not re-adjusted (acceptable per requirements) |

## Styling

A single CSS rule added to `styles.css`:

```css
.m365-now-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background-color: var(--color-red, red);
  pointer-events: none;
  z-index: 10;
}
```

Used by both the `TimelineColumn` line and the `WeekView` overlay.

## Testing

| Test | What it verifies |
|---|---|
| `useNow` — initial value | Returns current `Date` on first render |
| `useNow` — tick | After mocked interval fires, returned date advances by one minute |
| `useNow` — cleanup | `clearInterval` called on unmount |
| `TimelineColumn` — line present | `showNowLine={true}` renders `.m365-now-line` at correct `top` |
| `TimelineColumn` — line absent | `showNowLine={false}` renders no `.m365-now-line` |
| `DayView` — line on today | `currentDate = today` → line present |
| `DayView` — line off non-today | `currentDate = yesterday` → line absent |
| `DayView` — scroll on mount | `scrollRef.current.scrollTop` set to expected value |
| `WeekView` — line on current week | Week containing today → line present |
| `WeekView` — line off past week | Past week → line absent |
| `WeekView` — scroll on mount | `scrollRef.current.scrollTop` set to expected value |
