# Current Time Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a red horizontal line to the Day and Week views that shows the current time, updates every minute, and auto-scrolls the view to center the line on mount.

**Architecture:** A new `useNow()` hook returns the current `Date` and refreshes every minute using a timeout aligned to the next whole-minute boundary, then a 60-second interval. `TimelineColumn` renders the line at `top: nowMinutes * PX_PER_MIN` when its `showNowLine` prop is true. `DayView` calls `useNow()` for the one-time scroll-to-center effect and passes `showNowLine={isToday}` to `TimelineColumn`. `WeekView` calls `useNow()` and renders a full-width overlay line directly inside `.m365-week-timeline-area`, which already serves as the scroll container.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library, jsdom

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/hooks/useNow.ts` | Real-time `Date` that ticks every minute |
| Create | `tests/hooks/useNow.test.ts` | Unit tests for the hook |
| Modify | `src/components/TimelineColumn.tsx` | Add `showNowLine` prop + now-line element |
| Modify | `styles.css` | Add `.m365-now-line` CSS rule; add `position: relative` to `.m365-week-timeline-area` |
| Modify | `src/components/DayView.tsx` | Pass `showNowLine`, add scroll-to-center on mount |
| Modify | `src/components/WeekView.tsx` | Add `useNow()`, overlay line, scroll-to-center on mount |
| Modify | `tests/components/TimelineColumn.test.tsx` | Tests for now-line presence/position |
| Modify | `tests/components/DayView.test.tsx` | Tests for now-line visibility and scroll |
| Modify | `tests/components/WeekView.test.tsx` | Tests for now-line visibility and scroll |

---

## Task 1: `useNow` hook

**Files:**
- Create: `src/hooks/useNow.ts`
- Create: `tests/hooks/useNow.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `tests/hooks/useNow.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from '../../src/hooks/useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T14:30:00.000'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current date as initial value', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toEqual(new Date('2026-04-14T14:30:00.000'));
  });

  it('updates after the next whole-minute boundary fires', () => {
    // At :30s into the minute, next boundary is 30 000 ms away
    vi.setSystemTime(new Date('2026-04-14T14:30:30.000'));
    const { result } = renderHook(() => useNow());

    act(() => {
      vi.setSystemTime(new Date('2026-04-14T14:31:00.000'));
      vi.advanceTimersByTime(30000);
    });

    expect(result.current.getMinutes()).toBe(31);
  });

  it('continues updating on the 60-second interval after the first tick', () => {
    // Starting at :00 — next boundary is 60 000 ms away
    vi.setSystemTime(new Date('2026-04-14T14:30:00.000'));
    const { result } = renderHook(() => useNow());

    act(() => {
      vi.setSystemTime(new Date('2026-04-14T14:31:00.000'));
      vi.advanceTimersByTime(60000);
    });
    expect(result.current.getMinutes()).toBe(31);

    act(() => {
      vi.setSystemTime(new Date('2026-04-14T14:32:00.000'));
      vi.advanceTimersByTime(60000);
    });
    expect(result.current.getMinutes()).toBe(32);
  });

  it('clears the timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const { unmount } = renderHook(() => useNow());
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 1.2: Run the tests to confirm they fail**

```
npx vitest run tests/hooks/useNow.test.ts
```

Expected: FAIL — `Cannot find module '../../src/hooks/useNow'`

- [ ] **Step 1.3: Create the hook**

Create `src/hooks/useNow.ts`:

```ts
import { useState, useEffect } from 'react';

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const msUntilNextMinute = 60000 - (Date.now() % 60000);
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const timeoutId = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, []);

  return now;
}
```

- [ ] **Step 1.4: Run the tests to confirm they pass**

```
npx vitest run tests/hooks/useNow.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 1.5: Run full suite to check for regressions**

```
npm test
```

Expected: all existing tests still pass

- [ ] **Step 1.6: Commit**

Commit message: `feat: add useNow hook for real-time minute-aligned clock`
Files: `src/hooks/useNow.ts`, `tests/hooks/useNow.test.ts`

---

## Task 2: `TimelineColumn` now-line + CSS

**Files:**
- Modify: `src/components/TimelineColumn.tsx`
- Modify: `styles.css`
- Modify: `tests/components/TimelineColumn.test.tsx`

- [ ] **Step 2.1: Write the failing tests**

At the top of `tests/components/TimelineColumn.test.tsx`, after the existing imports, add:

```ts
vi.mock('../../src/hooks/useNow', () => ({
  useNow: vi.fn(() => new Date('2026-04-14T14:30:00')),
}));
```

At the bottom of the file, add a new describe block:

```ts
describe('TimelineColumn now-line', () => {
  it('renders the now-line when showNowLine is true', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        showNowLine={true}
        data-testid="col"
      />,
    );
    const line = document.querySelector('.m365-now-line') as HTMLElement;
    expect(line).toBeInTheDocument();
    // 14:30 → 14*60+30 = 870 minutes * PX_PER_MIN(1) = 870px
    expect(line.style.top).toBe('870px');
  });

  it('does not render the now-line when showNowLine is false', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        showNowLine={false}
        data-testid="col"
      />,
    );
    expect(document.querySelector('.m365-now-line')).not.toBeInTheDocument();
  });

  it('does not render the now-line when showNowLine is omitted', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        data-testid="col"
      />,
    );
    expect(document.querySelector('.m365-now-line')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2.2: Run the tests to confirm they fail**

```
npx vitest run tests/components/TimelineColumn.test.tsx
```

Expected: FAIL — `showNowLine` prop not recognised / `.m365-now-line` not found

- [ ] **Step 2.3: Add the CSS rule**

In `styles.css`, after the `.m365-day-view-events` block (around line 474), add:

```css
/* ─── Now line ────────────────────────────────────────────────────────────── */

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

- [ ] **Step 2.4: Modify `TimelineColumn`**

Replace the contents of `src/components/TimelineColumn.tsx` with:

```tsx
import React, { useMemo } from 'react';
import { M365Event, M365Calendar } from '../types';
import { useNow } from '../hooks/useNow';

export interface LayoutEvent {
  event: M365Event;
  column: number;
  columnCount: number;
}

export const PX_PER_MIN = 1;
export const HOURS_IN_DAY = 24;
export const MIN_EVENT_HEIGHT = 15;
export const TIME_LABEL_WIDTH_PX = 52;
export const COLUMN_GAP_PX = 6;

type StampedEvent = { event: M365Event; startMs: number; endMs: number };

export function layoutEvents(events: M365Event[]): LayoutEvent[] {
  const stamped: StampedEvent[] = events
    .map((e) => ({
      event: e,
      startMs: new Date(e.start.dateTime).getTime(),
      endMs: new Date(e.end.dateTime).getTime(),
    }))
    .filter(({ startMs, endMs }) => !isNaN(startMs) && !isNaN(endMs) && endMs > startMs);

  if (stamped.length === 0) return [];

  const sorted = [...stamped].sort((a, b) => a.startMs - b.startMs);

  const clusters: StampedEvent[][] = [];
  for (const s of sorted) {
    const existing = clusters.find((cluster) =>
      cluster.some((other) => s.startMs < other.endMs && s.endMs > other.startMs),
    );
    if (existing) {
      existing.push(s);
    } else {
      clusters.push([s]);
    }
  }

  const result: LayoutEvent[] = [];
  for (const cluster of clusters) {
    const assignments: number[] = new Array(cluster.length).fill(-1);
    for (let i = 0; i < cluster.length; i++) {
      const used = new Set<number>();
      for (let j = 0; j < i; j++) {
        if (cluster[i].startMs < cluster[j].endMs && cluster[i].endMs > cluster[j].startMs) {
          used.add(assignments[j]);
        }
      }
      let col = 0;
      while (used.has(col)) col++;
      assignments[i] = col;
    }
    const colCount = assignments.reduce((m, v) => Math.max(m, v), -1) + 1;
    for (let i = 0; i < cluster.length; i++) {
      result.push({ event: cluster[i].event, column: assignments[i], columnCount: colCount });
    }
  }

  return result;
}

interface TimelineColumnProps {
  date: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
  showLabels?: boolean;
  showNowLine?: boolean;
  'data-testid'?: string;
}

export const TimelineColumn: React.FC<TimelineColumnProps> = ({
  date,
  events,
  calendars,
  onTimeClick,
  onEventClick,
  showLabels = false,
  showNowLine = false,
  'data-testid': testId,
}) => {
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const laid = useMemo(() => layoutEvents(events), [events]);

  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const totalMinutes = Math.min(Math.round(offsetY / PX_PER_MIN / 15) * 15, 23 * 60 + 45);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const d = new Date(date);
    d.setHours(hours, minutes, 0, 0);
    onTimeClick(d);
  };

  const eventsLeft = showLabels ? TIME_LABEL_WIDTH_PX : 0;

  return (
    <div
      className="m365-timeline-column"
      style={{ position: 'relative', height: `${HOURS_IN_DAY * 60 * PX_PER_MIN}px` }}
      onClick={handleClick}
      data-testid={testId}
    >
      {Array.from({ length: HOURS_IN_DAY * 4 }, (_, i) => {
        const slotMin = i * 15;
        const hour = Math.floor(slotMin / 60);
        const minute = slotMin % 60;
        const isHour = minute === 0;
        const isHalf = minute === 30;
        return (
          <div
            key={i}
            className={`m365-day-view-slot${isHour ? ' m365-day-view-slot--hour' : isHalf ? ' m365-day-view-slot--half' : ' m365-day-view-slot--quarter'}`}
            style={{ position: 'absolute', top: `${slotMin * PX_PER_MIN}px`, width: '100%' }}
          >
            {showLabels && isHour && (
              <span className="m365-day-view-hour-label">
                {String(hour).padStart(2, '0')}:00
              </span>
            )}
          </div>
        );
      })}
      <div
        className="m365-day-view-events"
        style={{ position: 'absolute', top: 0, left: `${eventsLeft}px`, right: 0, bottom: 0 }}
      >
        {laid.map(({ event, column, columnCount }) => {
          const cal = calendarMap.get(event.calendarId);
          if (!cal) return null;
          const start = new Date(event.start.dateTime);
          const end = new Date(event.end.dateTime);
          const startMin = start.getHours() * 60 + start.getMinutes();
          const durationMin = (end.getTime() - start.getTime()) / 60000;
          const height = Math.max(durationMin, MIN_EVENT_HEIGHT) * PX_PER_MIN;
          const gapPx = columnCount > 1 ? COLUMN_GAP_PX : 0;
          const widthStyle = `calc(${100 / columnCount}% - ${((columnCount - 1) * gapPx) / columnCount}px)`;
          const leftStyle =
            column === 0
              ? '0'
              : `calc(${(column * 100) / columnCount}% + ${(column * gapPx) / columnCount}px)`;
          const startTimeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const endTimeStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return (
            <button
              key={event.id}
              type="button"
              className="m365-event-click-btn m365-day-event-block"
              aria-label={`Edit event: ${event.subject}`}
              style={{
                position: 'absolute',
                top: `${startMin * PX_PER_MIN}px`,
                height: `${height}px`,
                width: widthStyle,
                left: leftStyle,
                backgroundColor: `${cal.color}26`,
                border: `1px solid ${cal.color}`,
                overflow: 'hidden',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick?.(event);
              }}
            >
              <div className="m365-day-event-content">
                <span className="m365-day-event-time" style={{ color: cal.color }}>
                  {startTimeStr} – {endTimeStr}
                </span>
                <span className="m365-day-event-title" style={{ color: cal.color }}>
                  {event.subject}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {showNowLine && (
        <div
          className="m365-now-line"
          style={{ top: `${nowMinutes * PX_PER_MIN}px` }}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2.5: Run the tests to confirm they pass**

```
npx vitest run tests/components/TimelineColumn.test.tsx
```

Expected: PASS (all tests including 3 new now-line tests)

- [ ] **Step 2.6: Run full suite to check for regressions**

```
npm test
```

Expected: all tests pass

- [ ] **Step 2.7: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 2.8: Commit**

Commit message: `feat: add now-line to TimelineColumn and .m365-now-line CSS`
Files: `src/components/TimelineColumn.tsx`, `styles.css`, `tests/components/TimelineColumn.test.tsx`

---

## Task 3: `DayView` now-line + scroll-to-center

**Files:**
- Modify: `src/components/DayView.tsx`
- Modify: `tests/components/DayView.test.tsx`

- [ ] **Step 3.1: Write the failing tests**

At the top of `tests/components/DayView.test.tsx`, after the existing imports, add:

```ts
vi.mock('../../src/hooks/useNow', () => ({
  useNow: vi.fn(() => new Date('2026-04-14T14:30:00')),
}));
```

At the bottom of the file, add two new describe blocks:

```ts
describe('DayView now-line', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T14:30:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the now-line when currentDate is today', () => {
    render(
      <DayView
        currentDate={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-now-line')).toBeInTheDocument();
  });

  it('does not render the now-line when currentDate is not today', () => {
    render(
      <DayView
        currentDate={new Date('2026-04-13')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-now-line')).not.toBeInTheDocument();
  });
});

describe('DayView scroll-to-center', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T14:30:00'));
    // jsdom returns 0 for clientHeight/scrollHeight by default; override so
    // the clamping math in the scroll effect produces a non-zero result.
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 400 });
    Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 1440 });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 0 });
    Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 0 });
  });

  it('scrolls to center the now-line when viewing today', () => {
    // useNow → 14:30 → nowMinutes = 870
    // timelineRef.offsetTop = 0 (no all-day events, jsdom default)
    // target = 0 + 870 - 400/2 = 670
    // clamped: max(0, min(670, 1440-400=1040)) = 670
    render(
      <DayView
        currentDate={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
      />,
    );
    const container = document.querySelector('.m365-day-view') as HTMLElement;
    expect(container.scrollTop).toBe(670);
  });

  it('does not scroll when currentDate is not today', () => {
    render(
      <DayView
        currentDate={new Date('2026-04-13')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
      />,
    );
    const container = document.querySelector('.m365-day-view') as HTMLElement;
    expect(container.scrollTop).toBe(0);
  });
});
```

- [ ] **Step 3.2: Run the tests to confirm they fail**

```
npx vitest run tests/components/DayView.test.tsx
```

Expected: FAIL — now-line not found, scroll assertions failing

- [ ] **Step 3.3: Modify `DayView`**

Replace the full contents of `src/components/DayView.tsx` with:

```tsx
import React, { useMemo, useRef, useEffect } from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';
import { TimelineColumn } from './TimelineColumn';
import { useNow } from '../hooks/useNow';

// Re-export layout utilities so existing importers (tests, etc.) are unaffected
export {
  layoutEvents,
  PX_PER_MIN,
  HOURS_IN_DAY,
  MIN_EVENT_HEIGHT,
  TIME_LABEL_WIDTH_PX,
  COLUMN_GAP_PX,
} from './TimelineColumn';
export type { LayoutEvent } from './TimelineColumn';

interface DayViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
}

export const DayView: React.FC<DayViewProps> = ({
  currentDate,
  events,
  calendars,
  onTimeClick,
  onEventClick,
}) => {
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const allDayEvents = useMemo(() => events.filter((e) => e.isAllDay), [events]);
  const timedEvents = useMemo(() => events.filter((e) => !e.isAllDay), [events]);

  const isToday = useMemo(() => {
    const today = new Date();
    return (
      currentDate.getFullYear() === today.getFullYear() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getDate() === today.getDate()
    );
  }, [currentDate]);

  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isToday || !scrollRef.current || !timelineRef.current) return;
    const container = scrollRef.current;
    const timelineTop = timelineRef.current.offsetTop;
    const target = timelineTop + nowMinutes - container.clientHeight / 2;
    container.scrollTop = Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight));
  }, []); // intentionally empty: fires once on mount to center the now-line

  return (
    <div className="m365-day-view" ref={scrollRef}>
      {allDayEvents.length > 0 && (
        <div className="m365-day-view-allday">
          {allDayEvents.map((event) => {
            const cal = calendarMap.get(event.calendarId);
            if (!cal) return null;
            return (
              <button
                key={event.id}
                type="button"
                className="m365-event-click-btn"
                aria-label={`Edit event: ${event.subject}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick?.(event);
                }}
              >
                <EventCard event={event} calendar={cal} />
              </button>
            );
          })}
        </div>
      )}
      <div ref={timelineRef}>
        <TimelineColumn
          date={currentDate}
          events={timedEvents}
          calendars={calendars}
          onTimeClick={onTimeClick}
          onEventClick={onEventClick}
          showLabels={true}
          showNowLine={isToday}
          data-testid="m365-day-timeline"
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 3.4: Run the tests to confirm they pass**

```
npx vitest run tests/components/DayView.test.tsx
```

Expected: PASS (all tests including 4 new tests)

- [ ] **Step 3.5: Run full suite to check for regressions**

```
npm test
```

Expected: all tests pass

- [ ] **Step 3.6: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 3.7: Commit**

Commit message: `feat: show now-line in day view and scroll to center on mount`
Files: `src/components/DayView.tsx`, `tests/components/DayView.test.tsx`

---

## Task 4: `WeekView` now-line + scroll-to-center

**Files:**
- Modify: `src/components/WeekView.tsx`
- Modify: `styles.css`
- Modify: `tests/components/WeekView.test.tsx`

- [ ] **Step 4.1: Write the failing tests**

At the top of `tests/components/WeekView.test.tsx`, after the existing imports, add:

```ts
vi.mock('../../src/hooks/useNow', () => ({
  useNow: vi.fn(() => new Date('2026-04-14T14:30:00')),
}));
```

At the bottom of the file, add two new describe blocks:

```ts
describe('WeekView now-line', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T14:30:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the full-width now-line overlay when showing the current week', () => {
    // 2026-04-14 is a Tuesday; its week (Sun Apr 12–Sat Apr 18) includes today
    render(
      <WeekView
        currentDate={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    const line = document.querySelector('.m365-now-line') as HTMLElement;
    expect(line).toBeInTheDocument();
    // 14:30 → 870 minutes * PX_PER_MIN(1) = 870px
    expect(line.style.top).toBe('870px');
  });

  it('does not render the now-line when showing a different week', () => {
    // 2026-04-06 is a Monday; its week (Sun Apr 5–Sat Apr 11) does not include Apr 14
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-now-line')).not.toBeInTheDocument();
  });
});

describe('WeekView scroll-to-center', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T14:30:00'));
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 400 });
    Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 1440 });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 0 });
    Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 0 });
  });

  it('scrolls the timeline area to center the now-line when showing the current week', () => {
    // useNow → 14:30 → nowMinutes = 870
    // No offsetTop adjustment needed (all-day row is outside .m365-week-timeline-area)
    // target = 870 - 400/2 = 670
    // clamped: max(0, min(670, 1440-400=1040)) = 670
    render(
      <WeekView
        currentDate={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    const timelineArea = document.querySelector('.m365-week-timeline-area') as HTMLElement;
    expect(timelineArea.scrollTop).toBe(670);
  });

  it('does not scroll when showing a different week', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    const timelineArea = document.querySelector('.m365-week-timeline-area') as HTMLElement;
    expect(timelineArea.scrollTop).toBe(0);
  });
});
```

- [ ] **Step 4.2: Run the tests to confirm they fail**

```
npx vitest run tests/components/WeekView.test.tsx
```

Expected: FAIL — now-line not found, scroll assertions failing

- [ ] **Step 4.3: Add `position: relative` to `.m365-week-timeline-area` in `styles.css`**

Find the `.m365-week-timeline-area` rule (around line 301) and add `position: relative`:

```css
.m365-week-timeline-area {
  display: flex;
  flex: 1;
  overflow-y: auto;
  position: relative;
}
```

- [ ] **Step 4.4: Modify `WeekView`**

Replace the full contents of `src/components/WeekView.tsx` with:

```tsx
import React, { useMemo, useRef, useEffect } from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';
import { TimelineColumn, HOURS_IN_DAY, PX_PER_MIN } from './TimelineColumn';
import { toDateOnly } from '../lib/datetime';
import { useNow } from '../hooks/useNow';

interface WeekViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
}

function getWeekDays(date: Date): Date[] {
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onEventClick,
}) => {
  const weekDays = getWeekDays(currentDate);
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, { allDay: M365Event[]; timed: M365Event[] }>();
    for (const event of events) {
      const key = event.start.dateTime.slice(0, 10);
      if (!map.has(key)) map.set(key, { allDay: [], timed: [] });
      const bucket = map.get(key)!;
      if (event.isAllDay) bucket.allDay.push(event);
      else bucket.timed.push(event);
    }
    return map;
  }, [events]);
  const today = new Date();

  const isCurrentWeek = useMemo(() => {
    const todayStr = new Date().toDateString();
    return weekDays.some((d) => d.toDateString() === todayStr);
  }, [weekDays]);

  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCurrentWeek || !scrollRef.current) return;
    const container = scrollRef.current;
    const target = nowMinutes - container.clientHeight / 2;
    container.scrollTop = Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight));
  }, []); // intentionally empty: fires once on mount to center the now-line

  return (
    <div className="m365-calendar-week-view">
      {/* Day header row */}
      <div className="m365-week-column-headers">
        <div className="m365-week-gutter-spacer" />
        {weekDays.map((day) => {
          const isToday = day.toDateString() === today.toDateString();
          return (
            <div
              key={`header-${toDateOnly(day)}`}
              className={['m365-calendar-week-day', isToday ? 'today' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onDayClick(day)}
            >
              <div className="m365-calendar-week-day-header">
                <span className="m365-calendar-week-day-name">
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span
                  className={['m365-calendar-week-day-number', isToday ? 'today' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {day.getDate()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      <div className="m365-week-allday-row">
        <div className="m365-week-allday-gutter" />
        {weekDays.map((day) => {
          const cellDateStr = toDateOnly(day);
          const allDayEvents = eventsByDate.get(cellDateStr)?.allDay ?? [];
          return (
            <div key={`allday-${cellDateStr}`} className="m365-week-allday-cell">
              {allDayEvents.map((event) => {
                const cal = calendarMap.get(event.calendarId);
                if (!cal) return null;
                return (
                  <button
                    key={event.id}
                    type="button"
                    className="m365-event-click-btn"
                    aria-label={`Edit event: ${event.subject}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick?.(event);
                    }}
                  >
                    <EventCard event={event} calendar={cal} />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Timeline area */}
      <div className="m365-week-timeline-area" ref={scrollRef}>
        {isCurrentWeek && (
          <div
            className="m365-now-line"
            style={{ top: `${nowMinutes * PX_PER_MIN}px` }}
          />
        )}
        <div
          className="m365-week-time-gutter"
          style={{ position: 'relative', height: `${HOURS_IN_DAY * 60 * PX_PER_MIN}px` }}
        >
          {Array.from({ length: HOURS_IN_DAY }, (_, hour) => (
            <span
              key={hour}
              className="m365-day-view-hour-label"
              style={{ position: 'absolute', top: `${hour * 60 * PX_PER_MIN}px` }}
            >
              {String(hour).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {weekDays.map((day) => {
          const cellDateStr = toDateOnly(day);
          const timedEvents = eventsByDate.get(cellDateStr)?.timed ?? [];
          return (
            <TimelineColumn
              key={`timeline-${cellDateStr}`}
              date={day}
              events={timedEvents}
              calendars={calendars}
              onTimeClick={onDayClick}
              onEventClick={onEventClick}
              data-testid={`m365-week-timeline-${cellDateStr}`}
            />
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 4.5: Run the tests to confirm they pass**

```
npx vitest run tests/components/WeekView.test.tsx
```

Expected: PASS (all tests including 4 new tests)

- [ ] **Step 4.6: Run full suite to check for regressions**

```
npm test
```

Expected: all tests pass

- [ ] **Step 4.7: Typecheck**

```
npm run typecheck
```

Expected: no errors

- [ ] **Step 4.8: Commit**

Commit message: `feat: show now-line in week view and scroll to center on mount`
Files: `src/components/WeekView.tsx`, `styles.css`, `tests/components/WeekView.test.tsx`
