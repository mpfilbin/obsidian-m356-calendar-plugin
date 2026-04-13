# Week View Vertical Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vertical 24-hour timeline to the week view where timed events are positioned by start time with height proportional to duration, matching the day view's layout.

**Architecture:** Extract a shared `TimelineColumn` component from `DayView` that owns the slot grid, event block rendering, and click-to-navigate logic. `DayView` delegates its timeline section to `TimelineColumn` (re-exporting constants for backward compat). `WeekView` is restructured into three rows: a day-header row, an all-day-events row, and a scrollable timeline area with a shared 52px time gutter plus seven `TimelineColumn` instances side by side.

**Tech Stack:** React 18, TypeScript, Vitest + @testing-library/react, CSS custom properties (Obsidian vars)

---

### Task 1: Create TimelineColumn component (TDD)

**Files:**
- Create: `src/components/TimelineColumn.tsx`
- Create: `tests/components/TimelineColumn.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/TimelineColumn.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineColumn } from '../../src/components/TimelineColumn';
import { M365Event, M365Calendar } from '../../src/types';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const timedEvent: M365Event = {
  id: 'evt1',
  subject: 'Standup',
  start: { dateTime: '2026-04-09T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-09T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

describe('TimelineColumn', () => {
  it('positions event block at correct top offset', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
        data-testid="col"
      />,
    );
    const block = document.querySelector('.m365-day-event-block') as HTMLElement;
    expect(block).toBeInTheDocument();
    // 9:00 = 540 minutes * PX_PER_MIN(1) = 540px
    expect(block.style.top).toBe('540px');
  });

  it('gives event block correct height', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
        data-testid="col"
      />,
    );
    const block = document.querySelector('.m365-day-event-block') as HTMLElement;
    // 30 minutes * PX_PER_MIN(1) = 30px
    expect(block.style.height).toBe('30px');
  });

  it('does not render event when calendar is missing', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[]}
        onTimeClick={vi.fn()}
        data-testid="col"
      />,
    );
    expect(screen.queryByText('Standup')).not.toBeInTheDocument();
  });

  it('calls onTimeClick with correct date when timeline is clicked', () => {
    const onTimeClick = vi.fn();
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[]}
        calendars={[]}
        onTimeClick={onTimeClick}
        data-testid="col"
      />,
    );
    // clientY=90 → offsetY=90 (rect.top=0 in jsdom) → 90min → rounds to 1h 30m
    fireEvent.click(screen.getByTestId('col'), { clientY: 90 });
    const date = onTimeClick.mock.calls[0][0] as Date;
    expect(date.getHours()).toBe(1);
    expect(date.getMinutes()).toBe(30);
  });

  it('clamps click to 23:45 when at bottom of timeline', () => {
    const onTimeClick = vi.fn();
    const baseDate = new Date('2026-04-09');
    render(
      <TimelineColumn
        date={baseDate}
        events={[]}
        calendars={[]}
        onTimeClick={onTimeClick}
        data-testid="col"
      />,
    );
    fireEvent.click(screen.getByTestId('col'), { clientY: 1440 });
    const date = onTimeClick.mock.calls[0][0] as Date;
    expect(date.getHours()).toBe(23);
    expect(date.getMinutes()).toBe(45);
    expect(date.getDate()).toBe(baseDate.getDate());
  });

  it('calls onEventClick when an event is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
        onEventClick={onEventClick}
        data-testid="col"
      />,
    );
    await userEvent.click(screen.getByText('Standup'));
    expect(onEventClick).toHaveBeenCalledWith(timedEvent);
  });

  it('clicking an event does not trigger onTimeClick', async () => {
    const onTimeClick = vi.fn();
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={onTimeClick}
        onEventClick={vi.fn()}
        data-testid="col"
      />,
    );
    await userEvent.click(screen.getByText('Standup'));
    expect(onTimeClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/TimelineColumn.test.tsx
```

Expected: FAIL — `TimelineColumn` not found.

- [ ] **Step 3: Create TimelineColumn.tsx**

Create `src/components/TimelineColumn.tsx`:

```tsx
import React, { useMemo } from 'react';
import { M365Event, M365Calendar } from '../types';

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

export function layoutEvents(events: M365Event[]): LayoutEvent[] {
  const valid = events.filter((e) => {
    const startMs = new Date(e.start.dateTime).getTime();
    const endMs = new Date(e.end.dateTime).getTime();
    return !isNaN(startMs) && !isNaN(endMs) && endMs > startMs;
  });

  if (valid.length === 0) return [];

  const sorted = [...valid].sort(
    (a, b) =>
      new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime(),
  );

  const clusters: M365Event[][] = [];
  for (const event of sorted) {
    const eStart = new Date(event.start.dateTime).getTime();
    const eEnd = new Date(event.end.dateTime).getTime();
    const existing = clusters.find((cluster) =>
      cluster.some((other) => {
        const oStart = new Date(other.start.dateTime).getTime();
        const oEnd = new Date(other.end.dateTime).getTime();
        return eStart < oEnd && eEnd > oStart;
      }),
    );
    if (existing) {
      existing.push(event);
    } else {
      clusters.push([event]);
    }
  }

  const result: LayoutEvent[] = [];
  for (const cluster of clusters) {
    const assignments: number[] = new Array(cluster.length).fill(-1);
    for (let i = 0; i < cluster.length; i++) {
      const eStart = new Date(cluster[i].start.dateTime).getTime();
      const eEnd = new Date(cluster[i].end.dateTime).getTime();
      const used = new Set<number>();
      for (let j = 0; j < i; j++) {
        const oStart = new Date(cluster[j].start.dateTime).getTime();
        const oEnd = new Date(cluster[j].end.dateTime).getTime();
        if (eStart < oEnd && eEnd > oStart) used.add(assignments[j]);
      }
      let col = 0;
      while (used.has(col)) col++;
      assignments[i] = col;
    }
    const colCount = assignments.reduce((m, v) => Math.max(m, v), 0) + 1;
    for (let i = 0; i < cluster.length; i++) {
      result.push({ event: cluster[i], column: assignments[i], columnCount: colCount });
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
  'data-testid'?: string;
}

export const TimelineColumn: React.FC<TimelineColumnProps> = ({
  date,
  events,
  calendars,
  onTimeClick,
  onEventClick,
  showLabels = false,
  'data-testid': testId,
}) => {
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const laid = useMemo(() => layoutEvents(events), [events]);

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
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/TimelineColumn.test.tsx
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TimelineColumn.tsx tests/components/TimelineColumn.test.tsx
git commit -m "feat: extract TimelineColumn component with layout engine and tests"
```

---

### Task 2: Refactor DayView to use TimelineColumn

**Files:**
- Modify: `src/components/DayView.tsx`
- Test: `tests/components/DayView.test.tsx` (must remain passing — no changes needed)

- [ ] **Step 1: Run DayView tests to confirm baseline**

```bash
npx vitest run tests/components/DayView.test.tsx
```

Expected: all tests PASS (baseline before touching DayView).

- [ ] **Step 2: Replace DayView.tsx**

Replace the entire contents of `src/components/DayView.tsx` with:

```tsx
import React, { useMemo } from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';
import { TimelineColumn } from './TimelineColumn';

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

  return (
    <div className="m365-day-view">
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
      <TimelineColumn
        date={currentDate}
        events={timedEvents}
        calendars={calendars}
        onTimeClick={onTimeClick}
        onEventClick={onEventClick}
        showLabels={true}
        data-testid="m365-day-timeline"
      />
    </div>
  );
};
```

- [ ] **Step 3: Run DayView tests to verify they still pass**

```bash
npx vitest run tests/components/DayView.test.tsx
```

Expected: all tests PASS (same as baseline).

- [ ] **Step 4: Commit**

```bash
git add src/components/DayView.tsx
git commit -m "refactor: DayView delegates timeline rendering to TimelineColumn"
```

---

### Task 3: Add CSS for week view timeline layout

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Replace the Week View CSS section**

In `styles.css`, find the `/* ─── Week View ───` section and replace it entirely with the following (the new rules cover the same section):

Replace this block (lines 217–271):
```css
/* ─── Week View ───────────────────────────────────────────────────────────── */

.m365-calendar-week-view {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  height: 100%;
}

.m365-calendar-week-day {
  border-right: 1px solid var(--background-modifier-border);
  cursor: pointer;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.m365-calendar-week-day:hover {
  background: var(--background-modifier-hover);
}

.m365-calendar-week-day-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--size-4-2);
  border-bottom: 1px solid var(--background-modifier-border);
  flex-shrink: 0;
}

.m365-calendar-week-day-name {
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  text-transform: uppercase;
}

.m365-calendar-week-day-number {
  font-size: var(--font-ui-medium);
  font-weight: var(--font-semibold);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.m365-calendar-week-day-number.today {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}

.m365-calendar-week-day-events {
  padding: var(--size-4-1);
  overflow-y: auto;
  flex: 1;
}
```

With:
```css
/* ─── Week View ───────────────────────────────────────────────────────────── */

.m365-calendar-week-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.m365-week-column-headers {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1px solid var(--background-modifier-border);
}

.m365-week-gutter-spacer {
  width: 52px;
  flex-shrink: 0;
}

.m365-calendar-week-day {
  flex: 1;
  cursor: pointer;
  border-right: 1px solid var(--background-modifier-border);
}

.m365-calendar-week-day:hover {
  background: var(--background-modifier-hover);
}

.m365-calendar-week-day-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--size-4-2);
}

.m365-calendar-week-day-name {
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  text-transform: uppercase;
}

.m365-calendar-week-day-number {
  font-size: var(--font-ui-medium);
  font-weight: var(--font-semibold);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.m365-calendar-week-day-number.today {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}

.m365-week-allday-row {
  display: flex;
  flex-shrink: 0;
  min-height: 24px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.m365-week-allday-gutter {
  width: 52px;
  flex-shrink: 0;
}

.m365-week-allday-cell {
  flex: 1;
  padding: 2px var(--size-4-1);
  border-right: 1px solid var(--background-modifier-border);
  overflow: hidden;
}

.m365-week-timeline-area {
  display: flex;
  flex: 1;
  overflow-y: auto;
}

.m365-week-time-gutter {
  width: 52px;
  flex-shrink: 0;
}

.m365-timeline-column {
  flex: 1;
  border-right: 1px solid var(--background-modifier-border);
  overflow: hidden;
  box-sizing: border-box;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "style: update week view CSS for vertical timeline layout"
```

---

### Task 4: Restructure WeekView with timeline (TDD)

**Files:**
- Modify: `tests/components/WeekView.test.tsx`
- Modify: `src/components/WeekView.tsx`

- [ ] **Step 1: Add new failing tests to WeekView.test.tsx**

Add the following new `describe` block at the bottom of `tests/components/WeekView.test.tsx`, after the existing `describe('WeekView', ...)` block. Also add `fireEvent` to the existing `@testing-library/react` import at the top of the file.

Updated import line (line 2):
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
```

New tests to append at the bottom of the file:

```tsx
const allDayEventOnMonday: M365Event = {
  id: 'evt-allday',
  subject: 'Conference Day',
  start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-07T00:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: true,
};

describe('WeekView timeline layout', () => {
  it('renders timed events as positioned blocks in the timeline', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[eventOnMonday]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    const block = document.querySelector('.m365-day-event-block') as HTMLElement;
    expect(block).toBeInTheDocument();
    // 10:00 = 600 minutes * PX_PER_MIN(1) = top: 600px
    expect(block.style.top).toBe('600px');
  });

  it('renders all-day events in the all-day row, not as positioned blocks', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[allDayEventOnMonday]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Conference Day')).toBeInTheDocument();
    expect(document.querySelector('.m365-week-allday-row')).toBeInTheDocument();
    expect(document.querySelector('.m365-day-event-block')).not.toBeInTheDocument();
  });

  it('all-day row is visible even with no all-day events', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-week-allday-row')).toBeInTheDocument();
  });

  it('clicking a time slot in the timeline calls onDayClick with that day and time', () => {
    const onDayClick = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={onDayClick}
      />,
    );
    // Monday column is index 1 (Sunday is 0)
    const timelines = document.querySelectorAll('[data-testid^="m365-week-timeline-"]');
    // clientY=90 → offsetY=90 (rect.top=0 in jsdom) → 90min → 1h 30m
    fireEvent.click(timelines[1], { clientY: 90 });
    expect(onDayClick).toHaveBeenCalledWith(expect.any(Date));
    const date = onDayClick.mock.calls[0][0] as Date;
    expect(date.getHours()).toBe(1);
    expect(date.getMinutes()).toBe(30);
  });
});
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
npx vitest run tests/components/WeekView.test.tsx
```

Expected: The original 5 tests PASS, the 4 new tests FAIL (no `.m365-week-allday-row`, no `.m365-day-event-block`, no `[data-testid^="m365-week-timeline-"]`).

- [ ] **Step 3: Replace WeekView.tsx**

Replace the entire contents of `src/components/WeekView.tsx` with:

```tsx
import React, { useMemo } from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';
import { TimelineColumn, HOURS_IN_DAY, PX_PER_MIN } from './TimelineColumn';
import { toDateOnly } from '../lib/datetime';

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
  const today = new Date();

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
          const allDayEvents = events.filter(
            (e) => e.isAllDay && e.start.dateTime.slice(0, 10) === cellDateStr,
          );
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
      <div className="m365-week-timeline-area">
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
          const timedEvents = events.filter(
            (e) => !e.isAllDay && e.start.dateTime.slice(0, 10) === cellDateStr,
          );
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

- [ ] **Step 4: Run all WeekView tests to verify they all pass**

```bash
npx vitest run tests/components/WeekView.test.tsx
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Run the full test suite to verify nothing else broke**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/WeekView.tsx tests/components/WeekView.test.tsx
git commit -m "feat: week view vertical timeline with shared time gutter and all-day row"
```
