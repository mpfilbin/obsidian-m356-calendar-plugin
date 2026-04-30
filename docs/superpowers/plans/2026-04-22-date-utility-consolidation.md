# Date Utility Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move four date-range and calendar-grid utility functions from component files into `src/lib/datetime.ts` so they are independently testable, and promote `ViewType` from a local alias in `CalendarApp.tsx` to a named export in `src/types/index.ts`.

**Architecture:** Pure refactor — no behaviour changes. Functions are extracted verbatim from their component files, exported from `datetime.ts`, and re-imported at the original call sites. `ViewType` is added to `types/index.ts` and `M365CalendarSettings.defaultView` is updated to use it.

**Tech Stack:** TypeScript, Vitest

---

## Files

| Action | Path | Change |
|--------|------|--------|
| Modify | `src/lib/datetime.ts` | Add 4 new exports: `getWeekDays`, `getDaysInMonthView`, `getDateRange`, `getDatesInRange` |
| Modify | `src/types/index.ts` | Add `ViewType` export; update `defaultView` to use it |
| Modify | `src/components/WeekView.tsx` | Remove `getWeekDays`, import from `../lib/datetime` |
| Modify | `src/components/MonthView.tsx` | Remove `getDaysInMonthView`, import from `../lib/datetime` |
| Modify | `src/components/CalendarApp.tsx` | Remove `getDateRange`, `getDatesInRange`, local `ViewType`; import all from lib/types |
| Modify | `tests/lib/datetime.test.ts` | Add `describe` blocks for all 4 new functions |

---

## Task 1: Extract `getWeekDays` and `getDaysInMonthView`

**Files:**
- Modify: `src/lib/datetime.ts`
- Modify: `tests/lib/datetime.test.ts`
- Modify: `src/components/WeekView.tsx`
- Modify: `src/components/MonthView.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/datetime.test.ts`. First update the import line at the top:

```typescript
import { toDateOnly, toDateTimeLocal, toLocalISOString, parseDateInput, formatTime, getWeekDays, getDaysInMonthView } from '../../src/lib/datetime';
```

Then append these two `describe` blocks at the end of the file:

```typescript
describe('getWeekDays', () => {
  it('returns exactly 7 dates', () => {
    expect(getWeekDays(new Date(2026, 3, 14))).toHaveLength(7);
  });

  it('first date is always Sunday', () => {
    // April 14, 2026 is Tuesday — week should start Sunday April 12
    const days = getWeekDays(new Date(2026, 3, 14));
    expect(days[0].getDay()).toBe(0);
  });

  it('dates are consecutive', () => {
    const days = getWeekDays(new Date(2026, 3, 14)); // all within April, safe for +1 checks
    for (let i = 1; i < 7; i++) {
      expect(days[i].getDate()).toBe(days[i - 1].getDate() + 1);
    }
  });

  it('returns the same week when input is already Sunday', () => {
    // April 12, 2026 is Sunday
    const days = getWeekDays(new Date(2026, 3, 12));
    expect(days[0]).toEqual(new Date(2026, 3, 12));
  });

  it('returns correct week when input is Saturday', () => {
    // April 18, 2026 is Saturday — week still starts April 12
    const days = getWeekDays(new Date(2026, 3, 18));
    expect(days[0]).toEqual(new Date(2026, 3, 12));
  });
});

describe('getDaysInMonthView', () => {
  it('total count is always a multiple of 7', () => {
    expect(getDaysInMonthView(new Date(2026, 3, 1)).length % 7).toBe(0);
    expect(getDaysInMonthView(new Date(2026, 0, 1)).length % 7).toBe(0);
  });

  it('first date in the grid is always Sunday', () => {
    expect(getDaysInMonthView(new Date(2026, 3, 1))[0].getDay()).toBe(0);
  });

  it('contains all days of the requested month', () => {
    // April 2026 has 30 days
    const days = getDaysInMonthView(new Date(2026, 3, 1));
    const aprilDays = days.filter((d) => d.getMonth() === 3 && d.getFullYear() === 2026);
    expect(aprilDays).toHaveLength(30);
  });

  it('includes leading days from previous month when 1st is not Sunday', () => {
    // April 1, 2026 is Wednesday (getDay() = 3) → 3 leading days: March 29, 30, 31
    const days = getDaysInMonthView(new Date(2026, 3, 1));
    expect(days[0].getMonth()).toBe(2); // March
    expect(days[0].getDate()).toBe(29);
  });

  it('starts directly on the 1st when the month begins on Sunday', () => {
    // March 1, 2026 is Sunday — no leading days
    const days = getDaysInMonthView(new Date(2026, 2, 1));
    expect(days[0]).toEqual(new Date(2026, 2, 1));
  });

  it('trailing days belong to the next month', () => {
    // April 2026: 3 leading + 30 days = 33 → pad to 35 → May 1, May 2 are trailing
    const days = getDaysInMonthView(new Date(2026, 3, 1));
    const last = days[days.length - 1];
    expect(last.getMonth()).toBe(4); // May
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run tests/lib/datetime.test.ts
```

Expected: FAIL — `getWeekDays` and `getDaysInMonthView` are not exported.

- [ ] **Step 3: Add `getWeekDays` and `getDaysInMonthView` to `src/lib/datetime.ts`**

Append after the existing `formatTime` export:

```typescript
/** Returns the 7 Date objects for the week containing `date`, starting from Sunday. */
export function getWeekDays(date: Date): Date[] {
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

/**
 * Returns the Date objects for a full month calendar grid:
 * all days of the month plus leading days from the previous month (to start on
 * Sunday) and trailing days from the next month (to complete the last row).
 * Total length is always a multiple of 7.
 */
export function getDaysInMonthView(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Leading days from previous month
  for (let i = firstDay.getDay(); i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }
  // Days in current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Trailing days to complete the last week
  let trailingDay = 1;
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, trailingDay++));
  }
  return days;
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

```bash
npx vitest run tests/lib/datetime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update `src/components/WeekView.tsx`**

Remove the local `getWeekDays` function (lines 19–27):

```typescript
// DELETE THIS:
function getWeekDays(date: Date): Date[] {
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}
```

Update the import from `../lib/datetime` to include `getWeekDays`:

```typescript
import { toDateOnly, getWeekDays } from '../lib/datetime';
```

- [ ] **Step 6: Update `src/components/MonthView.tsx`**

Remove the local `getDaysInMonthView` function (lines 17–38):

```typescript
// DELETE THIS:
function getDaysInMonthView(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Leading days from previous month
  for (let i = firstDay.getDay(); i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }
  // Days in current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Trailing days to complete the last week
  let trailingDay = 1;
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, trailingDay++));
  }
  return days;
}
```

Update the import from `../lib/datetime` to include `getDaysInMonthView`:

```typescript
import { toDateOnly, getDaysInMonthView } from '../lib/datetime';
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

Use `mcp__git__*` MCP tools (required by this repo's CLAUDE.md):

```
Stage: src/lib/datetime.ts, tests/lib/datetime.test.ts,
       src/components/WeekView.tsx, src/components/MonthView.tsx
Message: refactor: extract getWeekDays and getDaysInMonthView to src/lib/datetime
```

---

## Task 2: Add `ViewType`, extract `getDateRange` and `getDatesInRange`

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/datetime.ts`
- Modify: `tests/lib/datetime.test.ts`
- Modify: `src/components/CalendarApp.tsx`

- [ ] **Step 1: Add `ViewType` to `src/types/index.ts`**

Add this line near the top of `src/types/index.ts`, after the existing imports (before `M365Calendar`):

```typescript
export type ViewType = 'month' | 'week' | 'day';
```

Then update `M365CalendarSettings.defaultView` from the inline union to use `ViewType`:

```typescript
// Change:
  defaultView: 'month' | 'week' | 'day';
// To:
  defaultView: ViewType;
```

- [ ] **Step 2: Write the failing tests**

Update the import line at the top of `tests/lib/datetime.test.ts`:

```typescript
import { toDateOnly, toDateTimeLocal, toLocalISOString, parseDateInput, formatTime, getWeekDays, getDaysInMonthView, getDateRange, getDatesInRange } from '../../src/lib/datetime';
```

Append these two `describe` blocks at the end of the file:

```typescript
describe('getDateRange', () => {
  it('month view: start is first of month, end is first of next month', () => {
    const { start, end } = getDateRange(new Date(2026, 3, 14), 'month');
    expect(start).toEqual(new Date(2026, 3, 1));
    expect(end).toEqual(new Date(2026, 4, 1));
  });

  it('day view: start is start of day, end is start of next day', () => {
    const { start, end } = getDateRange(new Date(2026, 3, 14, 15, 30), 'day');
    expect(start).toEqual(new Date(2026, 3, 14));
    expect(end).toEqual(new Date(2026, 3, 15));
  });

  it('week view: start is Sunday at local midnight, end is next Sunday', () => {
    // April 14, 2026 is Tuesday — week starts Sunday April 12
    const { start, end } = getDateRange(new Date(2026, 3, 14), 'week');
    expect(start).toEqual(new Date(2026, 3, 12, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 3, 19, 0, 0, 0, 0));
  });

  it('week view: start is the same day when input is already Sunday', () => {
    const { start } = getDateRange(new Date(2026, 3, 12), 'week'); // Sunday April 12
    expect(start).toEqual(new Date(2026, 3, 12, 0, 0, 0, 0));
  });
});

describe('getDatesInRange', () => {
  it('returns the correct number of date strings', () => {
    expect(getDatesInRange(new Date(2026, 3, 1), new Date(2026, 3, 4))).toHaveLength(3);
  });

  it('strings are in YYYY-MM-DD format', () => {
    const dates = getDatesInRange(new Date(2026, 3, 1), new Date(2026, 3, 3));
    expect(dates[0]).toBe('2026-04-01');
    expect(dates[1]).toBe('2026-04-02');
  });

  it('range is half-open: includes start, excludes end', () => {
    const dates = getDatesInRange(new Date(2026, 3, 1), new Date(2026, 3, 4));
    expect(dates).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
    expect(dates).not.toContain('2026-04-04');
  });

  it('returns an empty array when start equals end', () => {
    const d = new Date(2026, 3, 1);
    expect(getDatesInRange(d, d)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

```bash
npx vitest run tests/lib/datetime.test.ts
```

Expected: FAIL — `getDateRange` and `getDatesInRange` are not exported.

- [ ] **Step 4: Add `getDateRange` and `getDatesInRange` to `src/lib/datetime.ts`**

First add the `ViewType` import at the top of `src/lib/datetime.ts`:

```typescript
import type { ViewType } from '../types';
```

Then append after `getDaysInMonthView`:

```typescript
/**
 * Returns the event-fetch window for a given view:
 * - month: first of the month → first of the next month
 * - week:  Sunday of the week (local midnight) → next Sunday
 * - day:   start of the day → start of the next day
 */
export function getDateRange(date: Date, view: ViewType): { start: Date; end: Date } {
  if (view === 'month') {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    };
  }
  if (view === 'day') {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
    };
  }
  // week — normalize to local midnight so cache keys are stable
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  sunday.setHours(0, 0, 0, 0);
  const nextSunday = new Date(sunday);
  nextSunday.setDate(sunday.getDate() + 7);
  return { start: sunday, end: nextSunday };
}

/** Returns `YYYY-MM-DD` strings for every day in `[start, end)` (end is exclusive). */
export function getDatesInRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  while (current < end) {
    dates.push(toDateOnly(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
```

- [ ] **Step 5: Run the new tests to verify they pass**

```bash
npx vitest run tests/lib/datetime.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update `src/components/CalendarApp.tsx`**

Remove the local `ViewType` type alias (line 14):

```typescript
// DELETE THIS:
type ViewType = 'month' | 'week' | 'day';
```

Remove the two local function definitions (`getDatesInRange` at lines 22–30, `getDateRange` at lines 32–52):

```typescript
// DELETE THIS:
function getDatesInRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  while (current < end) {
    dates.push(toDateOnly(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// DELETE THIS:
function getDateRange(date: Date, view: ViewType): { start: Date; end: Date } {
  if (view === 'month') {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    };
  }
  if (view === 'day') {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
    };
  }
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  sunday.setHours(0, 0, 0, 0);
  const nextSunday = new Date(sunday);
  nextSunday.setDate(sunday.getDate() + 7);
  return { start: sunday, end: nextSunday };
}
```

Update the `../lib/datetime` import to include the new functions:

```typescript
import { toDateOnly, getDateRange, getDatesInRange } from '../lib/datetime';
```

Add `ViewType` to the existing `../types` import. The current import is:

```typescript
import { M365Calendar, M365Event, DailyWeather } from '../types';
```

Change it to:

```typescript
import { M365Calendar, M365Event, DailyWeather, ViewType } from '../types';
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

Use `mcp__git__*` MCP tools:

```
Stage: src/types/index.ts, src/lib/datetime.ts, tests/lib/datetime.test.ts,
       src/components/CalendarApp.tsx
Message: refactor: extract getDateRange and getDatesInRange to src/lib/datetime
```
