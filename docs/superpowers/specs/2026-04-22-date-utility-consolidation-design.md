# Date Utility Consolidation — Design Spec

## Goal

Move four date-range and calendar-grid utility functions from component files into `src/lib/datetime.ts`, where they become independently testable and component files stay focused on rendering. Also promote `ViewType` from a local type alias in `CalendarApp.tsx` to a named export in `types.ts`.

## Motivation

`getWeekDays` lives inside `WeekView.tsx`, `getDaysInMonthView` lives inside `MonthView.tsx`, and `getDateRange`/`getDatesInRange` live inside `CalendarApp.tsx`. All four are pure date calculations with no UI concerns. Moving them to `datetime.ts` makes them:

- Independently testable (currently covered only by component render tests)
- Consistent with the existing pattern (`toDateOnly`, `formatTime`, `parseDateInput`, etc.)
- Easier to find and reuse

## Changes

### `src/types/index.ts`

Add `ViewType` as a named export:

```typescript
export type ViewType = 'month' | 'week' | 'day';
```

`ViewType` is already implicitly used across the codebase (settings, toolbar, CalendarApp). Defining it once in `types/index.ts` removes the need for `CalendarApp.tsx` to own it.

### `src/lib/datetime.ts`

Add four new exported functions:

**`getWeekDays(date: Date): Date[]`**
Returns 7 `Date` objects for the week containing `date`, starting from Sunday (day 0). The Sunday is derived by subtracting `date.getDay()` days.

**`getDaysInMonthView(date: Date): Date[]`**
Returns the full calendar grid for the month — all days in the month plus leading days from the previous month (to start on Sunday) and trailing days from the next month (to complete the last row). Total length is always a multiple of 7.

**`getDateRange(date: Date, view: ViewType): { start: Date; end: Date }`**
Returns the fetch window for a given view:
- `'month'`: first of the month → first of the next month
- `'week'`: Sunday of the week (local midnight) → next Sunday
- `'day'`: start of day → start of next day

**`getDatesInRange(start: Date, end: Date): string[]`**
Returns `YYYY-MM-DD` strings (via `toDateOnly`) for every day in `[start, end)`, exclusive of `end`.

### `src/components/CalendarApp.tsx`

- Remove local `getDateRange` and `getDatesInRange` function definitions
- Remove local `ViewType` type alias
- Add `ViewType` to import from `../types`
- Add `getDateRange`, `getDatesInRange` to import from `../lib/datetime`

### `src/components/WeekView.tsx`

- Remove local `getWeekDays` function definition
- Add `getWeekDays` to import from `../lib/datetime`

### `src/components/MonthView.tsx`

- Remove local `getDaysInMonthView` function definition
- Add `getDaysInMonthView` to import from `../lib/datetime`

## Tests

New `describe` blocks added to `tests/lib/datetime.test.ts`:

**`getWeekDays`**
- Returns exactly 7 dates
- First date is Sunday (`.getDay() === 0`)
- Dates are consecutive
- Works when input date is already Sunday
- Works when input date is Saturday

**`getDaysInMonthView`**
- Total count is a multiple of 7
- First day is a Sunday
- Contains all days of the requested month
- Leading days belong to the previous month
- Trailing days belong to the next month

**`getDateRange`**
- `'month'` view: start is first of month, end is first of next month
- `'week'` view: start is Sunday at midnight, end is 7 days later
- `'day'` view: start is start of day, end is start of next day

**`getDatesInRange`**
- Returns correct count of date strings
- Strings are in `YYYY-MM-DD` format
- Range is half-open (includes start, excludes end)

## Out of Scope

- No behaviour changes — this is a pure refactor
- No changes to `WeatherService`, `CalendarService`, or any other file
- No changes to how the functions work, only where they live
