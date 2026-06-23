# Multi-Day Spanning Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render multi-day (all-day and cross-midnight timed) events as horizontal bars that span across day columns in both the month view and the week view all-day row, matching Microsoft Outlook's calendar layout.

**Architecture:** A pure `computeWeekSpanningLayout` function computes per-event layout data (column positions, lane assignment) for each week. A new `SpanningBar` component renders each bar using CSS grid column positioning. The month view is restructured into per-week rows (each containing a spanning layer + day cells row), and the week view all-day row is replaced with a unified CSS grid.

**Tech Stack:** React 18, TypeScript (strict), Vitest + Testing Library, CSS custom properties (Obsidian theme vars)

## Global Constraints

- All TypeScript must compile clean (`npm run typecheck`)
- All tests must pass (`npm test`)
- ESLint must pass (`npm run lint`) — use `// eslint-disable-line obsidianmd/ui/sentence-case` only for proper nouns
- No new npm dependencies
- Use `mcp__git__*` MCP tools for all git operations — never raw `git` in bash
- Commit after every task
- Run commands from `/Users/mfilbin/Projects/TypeScript/obsidian/m365-calendar`

---

### Task 1: Computation Layer

**Files:**
- Create: `src/lib/spanningLayout.ts`
- Create: `tests/lib/spanningLayout.test.ts`

**Interfaces — Produces (used by Tasks 2, 3, 4):**
```typescript
// src/lib/spanningLayout.ts

export interface SpanningSegment {
  event: M365Event;
  startCol: number;        // 0=Sunday … 6=Saturday, clamped to week edges
  colSpan: number;         // columns occupied (1–7)
  lane: number;            // 0-indexed row in the spanning layer
  continuesLeft: boolean;  // event started before this week's Sunday
  continuesRight: boolean; // event ends after this week's Saturday
}

export interface WeekSpanningLayout {
  segments: SpanningSegment[];
  totalLanes: number;
}

export function isSpanningEvent(event: M365Event): boolean { ... }

export function computeWeekSpanningLayout(
  events: M365Event[],
  weekStart: Date,                           // local midnight Sunday of the week
  options?: { includeAllAllDay?: boolean },  // true → also include single-day all-day events
): WeekSpanningLayout { ... }
```

---

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/spanningLayout.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeWeekSpanningLayout, isSpanningEvent } from '../../src/lib/spanningLayout';
import { M365Event } from '../../src/types';

// Week of 2026-04-05 (Sunday) through 2026-04-11 (Saturday)
const WEEK_START = new Date('2026-04-05T00:00');

function allDay(id: string, startDate: string, endDate: string): M365Event {
  return {
    id,
    subject: `Event ${id}`,
    start: { dateTime: `${startDate}T00:00:00`, timeZone: 'UTC' },
    end: { dateTime: `${endDate}T00:00:00`, timeZone: 'UTC' },
    calendarId: 'cal1',
    isAllDay: true,
  };
}

function timed(id: string, startDT: string, endDT: string): M365Event {
  return {
    id,
    subject: `Event ${id}`,
    start: { dateTime: startDT, timeZone: 'UTC' },
    end: { dateTime: endDT, timeZone: 'UTC' },
    calendarId: 'cal1',
    isAllDay: false,
  };
}

describe('isSpanningEvent', () => {
  it('returns false for a single-day all-day event', () => {
    expect(isSpanningEvent(allDay('e1', '2026-04-06', '2026-04-07'))).toBe(false);
  });

  it('returns true for a multi-day all-day event', () => {
    expect(isSpanningEvent(allDay('e1', '2026-04-06', '2026-04-09'))).toBe(true);
  });

  it('returns false for a same-day timed event', () => {
    expect(isSpanningEvent(timed('e1', '2026-04-06T09:00:00', '2026-04-06T10:00:00'))).toBe(false);
  });

  it('returns true for a timed event crossing midnight', () => {
    expect(isSpanningEvent(timed('e1', '2026-04-06T22:00:00', '2026-04-07T01:00:00'))).toBe(true);
  });
});

describe('computeWeekSpanningLayout', () => {
  it('excludes single-day all-day events by default', () => {
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-06', '2026-04-07')],
      WEEK_START,
    );
    expect(segments).toHaveLength(0);
  });

  it('excludes same-day timed events', () => {
    const { segments } = computeWeekSpanningLayout(
      [timed('e1', '2026-04-06T09:00:00', '2026-04-06T10:00:00')],
      WEEK_START,
    );
    expect(segments).toHaveLength(0);
  });

  it('includes multi-day all-day event with correct columns', () => {
    // Apr 6 (Mon) – Apr 8 (Wed), end exclusive Apr 9
    const { segments, totalLanes } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-06', '2026-04-09')],
      WEEK_START,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].startCol).toBe(1);   // Monday = col 1
    expect(segments[0].colSpan).toBe(3);    // Mon–Wed = 3 cols
    expect(segments[0].lane).toBe(0);
    expect(segments[0].continuesLeft).toBe(false);
    expect(segments[0].continuesRight).toBe(false);
    expect(totalLanes).toBe(1);
  });

  it('clamps end to Saturday and sets continuesRight for events ending later', () => {
    // Apr 8 (Wed) – Apr 13 (Mon next week)
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-08', '2026-04-14')],
      WEEK_START,
    );
    expect(segments[0].startCol).toBe(3);   // Wednesday
    expect(segments[0].colSpan).toBe(4);    // Wed–Sat
    expect(segments[0].continuesRight).toBe(true);
    expect(segments[0].continuesLeft).toBe(false);
  });

  it('clamps start to Sunday and sets continuesLeft for events that started earlier', () => {
    // Apr 1 (Wed prev week) – Apr 7 (Tue this week)
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-01', '2026-04-08')],
      WEEK_START,
    );
    expect(segments[0].startCol).toBe(0);   // Sunday
    expect(segments[0].colSpan).toBe(3);    // Sun–Tue
    expect(segments[0].continuesLeft).toBe(true);
    expect(segments[0].continuesRight).toBe(false);
  });

  it('includes timed cross-midnight event with correct columns', () => {
    // Mon 22:00 – Tue 01:00
    const { segments } = computeWeekSpanningLayout(
      [timed('e1', '2026-04-06T22:00:00', '2026-04-07T01:00:00')],
      WEEK_START,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].startCol).toBe(1);   // Monday
    expect(segments[0].colSpan).toBe(2);    // Mon–Tue
  });

  it('excludes events entirely before this week', () => {
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-03-30', '2026-04-03')],
      WEEK_START,
    );
    expect(segments).toHaveLength(0);
  });

  it('excludes events entirely after this week', () => {
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-12', '2026-04-15')],
      WEEK_START,
    );
    expect(segments).toHaveLength(0);
  });

  it('assigns overlapping events to different lanes', () => {
    const e1 = allDay('e1', '2026-04-06', '2026-04-09'); // Mon–Wed
    const e2 = allDay('e2', '2026-04-07', '2026-04-10'); // Tue–Thu (overlaps e1)
    const { segments, totalLanes } = computeWeekSpanningLayout([e1, e2], WEEK_START);
    expect(segments).toHaveLength(2);
    const lanes = segments.map((s) => s.lane);
    expect(lanes).toContain(0);
    expect(lanes).toContain(1);
    expect(totalLanes).toBe(2);
  });

  it('packs non-overlapping events into the same lane', () => {
    const e1 = allDay('e1', '2026-04-06', '2026-04-08'); // Mon–Tue
    const e2 = allDay('e2', '2026-04-09', '2026-04-11'); // Wed–Thu (no overlap)
    const { segments, totalLanes } = computeWeekSpanningLayout([e1, e2], WEEK_START);
    expect(segments[0].lane).toBe(0);
    expect(segments[1].lane).toBe(0);
    expect(totalLanes).toBe(1);
  });

  it('includes single-day all-day events when includeAllAllDay is true', () => {
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-06', '2026-04-07')],
      WEEK_START,
      { includeAllAllDay: true },
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].startCol).toBe(1);
    expect(segments[0].colSpan).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/spanningLayout.test.ts
```

Expected: FAIL with "Cannot find module '../../src/lib/spanningLayout'"

- [ ] **Step 3: Implement `src/lib/spanningLayout.ts`**

Create the file with this exact content:

```typescript
import { M365Event } from '../types';
import { toDateOnly } from './datetime';

export interface SpanningSegment {
  event: M365Event;
  startCol: number;
  colSpan: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
}

export interface WeekSpanningLayout {
  segments: SpanningSegment[];
  totalLanes: number;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00`);
  d.setDate(d.getDate() + n);
  return toDateOnly(d);
}

export function isSpanningEvent(event: M365Event): boolean {
  const startDate = event.start.dateTime.slice(0, 10);
  const endDate = event.end.dateTime.slice(0, 10);
  if (event.isAllDay) {
    // All-day end is exclusive; single-day has endDate = startDate + 1.
    // Spanning means more than one day: endDate > startDate + 1.
    return endDate > addDays(startDate, 1);
  }
  return endDate > startDate;
}

export function computeWeekSpanningLayout(
  events: M365Event[],
  weekStart: Date,
  options: { includeAllAllDay?: boolean } = {},
): WeekSpanningLayout {
  const weekStartStr = toDateOnly(weekStart);
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekStart.getDate() + 6);
  const weekEndStr = toDateOnly(weekEndDate);

  function inclusiveEnd(e: M365Event): string {
    const endStr = e.end.dateTime.slice(0, 10);
    return e.isAllDay ? addDays(endStr, -1) : endStr;
  }

  const relevant = events.filter((e) => {
    const startDate = e.start.dateTime.slice(0, 10);
    const endDate = inclusiveEnd(e);
    if (startDate > weekEndStr || endDate < weekStartStr) return false;
    if (isSpanningEvent(e)) return true;
    if (options.includeAllAllDay && e.isAllDay) return true;
    return false;
  });

  relevant.sort((a, b) => {
    const aStart = a.start.dateTime.slice(0, 10);
    const bStart = b.start.dateTime.slice(0, 10);
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    const aEnd = inclusiveEnd(a);
    const bEnd = inclusiveEnd(b);
    if (aEnd !== bEnd) return aEnd > bEnd ? -1 : 1;
    return 0;
  });

  const laneSlots: Array<Array<{ startCol: number; endCol: number }>> = [];

  const segments: SpanningSegment[] = relevant.map((event) => {
    const eventStart = event.start.dateTime.slice(0, 10);
    const eventEnd = inclusiveEnd(event);

    const continuesLeft = eventStart < weekStartStr;
    const continuesRight = eventEnd > weekEndStr;

    const clampedStart = continuesLeft ? weekStartStr : eventStart;
    const clampedEnd = continuesRight ? weekEndStr : eventEnd;

    const startCol = new Date(`${clampedStart}T00:00`).getDay();
    const endCol = new Date(`${clampedEnd}T00:00`).getDay();
    const colSpan = endCol - startCol + 1;

    let lane = 0;
    for (;;) {
      if (!laneSlots[lane]) laneSlots[lane] = [];
      const conflict = laneSlots[lane].some(
        (slot) => slot.startCol <= endCol && slot.endCol >= startCol,
      );
      if (!conflict) {
        laneSlots[lane].push({ startCol, endCol });
        break;
      }
      lane++;
    }

    return { event, startCol, colSpan, lane, continuesLeft, continuesRight };
  });

  return { segments, totalLanes: laneSlots.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/spanningLayout.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

Use the `mcp__git__git_commit` tool:
```
feat: add computeWeekSpanningLayout utility for multi-day event layout
```
Files: `src/lib/spanningLayout.ts`, `tests/lib/spanningLayout.test.ts`

---

### Task 2: SpanningBar Component

**Files:**
- Create: `src/components/SpanningBar.tsx`
- Modify: `styles.css` (append new rules only — do not remove existing rules yet)
- Create: `tests/components/SpanningBar.test.tsx`

**Interfaces:**
- Consumes: `SpanningSegment`, `WeekSpanningLayout` from `src/lib/spanningLayout.ts`
- Produces: `<SpanningBar event calendar segment onEventClick? />` used by Tasks 3 and 4

---

- [ ] **Step 1: Write the failing tests**

Create `tests/components/SpanningBar.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpanningBar } from '../../src/components/SpanningBar';
import { M365Event, M365Calendar } from '../../src/types';
import { SpanningSegment } from '../../src/lib/spanningLayout';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const allDayEvent: M365Event = {
  id: 'e1',
  subject: 'Team Offsite',
  start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: true,
};

const timedEvent: M365Event = {
  id: 'e2',
  subject: 'Late Night Call',
  start: { dateTime: '2026-04-06T22:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-07T02:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const baseSegment: SpanningSegment = {
  event: allDayEvent,
  startCol: 1,
  colSpan: 3,
  lane: 0,
  continuesLeft: false,
  continuesRight: false,
};

describe('SpanningBar', () => {
  it('renders the event subject', () => {
    render(
      <SpanningBar event={allDayEvent} calendar={calendar} segment={baseSegment} />,
    );
    expect(screen.getByText('Team Offsite')).toBeInTheDocument();
  });

  it('applies correct grid-column and grid-row styles from segment', () => {
    render(
      <SpanningBar event={allDayEvent} calendar={calendar} segment={baseSegment} />,
    );
    const bar = document.querySelector('.m365-spanning-bar') as HTMLElement;
    expect(bar.style.gridColumn).toBe('2 / span 3'); // startCol(1)+1=2
    expect(bar.style.gridRow).toBe('1');              // lane(0)+1=1
  });

  it('applies grid-row for non-zero lane', () => {
    const seg = { ...baseSegment, lane: 2 };
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={seg} />);
    const bar = document.querySelector('.m365-spanning-bar') as HTMLElement;
    expect(bar.style.gridRow).toBe('3');
  });

  it('adds continues-left class when continuesLeft is true', () => {
    const seg = { ...baseSegment, continuesLeft: true };
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={seg} />);
    expect(document.querySelector('.m365-spanning-bar.continues-left')).toBeInTheDocument();
  });

  it('adds continues-right class when continuesRight is true', () => {
    const seg = { ...baseSegment, continuesRight: true };
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={seg} />);
    expect(document.querySelector('.m365-spanning-bar.continues-right')).toBeInTheDocument();
  });

  it('applies --allday modifier class for all-day events', () => {
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={baseSegment} />);
    expect(document.querySelector('.m365-spanning-bar--allday')).toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar--timed')).not.toBeInTheDocument();
  });

  it('does not render time labels for all-day events', () => {
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={baseSegment} />);
    expect(document.querySelector('.m365-spanning-bar-start-time')).not.toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar-end-time')).not.toBeInTheDocument();
  });

  it('renders start/end time labels and --timed class for timed cross-midnight events', () => {
    const seg = { ...baseSegment, event: timedEvent };
    render(<SpanningBar event={timedEvent} calendar={calendar} segment={seg} />);
    expect(document.querySelector('.m365-spanning-bar--timed')).toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar-start-time')).toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar-end-time')).toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar--allday')).not.toBeInTheDocument();
  });

  it('calls onEventClick with the event when clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <SpanningBar
        event={allDayEvent}
        calendar={calendar}
        segment={baseSegment}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit event: Team Offsite' }));
    expect(onEventClick).toHaveBeenCalledWith(allDayEvent);
  });

  it('does not throw when onEventClick is not provided', async () => {
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={baseSegment} />);
    await expect(
      userEvent.click(screen.getByRole('button', { name: 'Edit event: Team Offsite' })),
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/SpanningBar.test.tsx
```

Expected: FAIL with "Cannot find module '../../src/components/SpanningBar'"

- [ ] **Step 3: Implement `src/components/SpanningBar.tsx`**

```typescript
import React from 'react';
import { M365Event, M365Calendar } from '../types';
import { SpanningSegment } from '../lib/spanningLayout';
import { formatTime } from '../lib/datetime';
import { usePopoverContext } from '../PopoverContext';

interface SpanningBarProps {
  event: M365Event;
  calendar: M365Calendar;
  segment: SpanningSegment;
  onEventClick?: (event: M365Event) => void;
}

export const SpanningBar: React.FC<SpanningBarProps> = ({
  event,
  calendar,
  segment,
  onEventClick,
}) => {
  const { showPopover, hidePopover } = usePopoverContext();
  const { color } = calendar;

  const bgColor = event.isAllDay ? `${color}1a` : `${color}26`;
  const borderColor = event.isAllDay ? `${color}80` : color;

  const classes = [
    'm365-spanning-bar',
    event.isAllDay ? 'm365-spanning-bar--allday' : 'm365-spanning-bar--timed',
    segment.continuesLeft ? 'continues-left' : '',
    segment.continuesRight ? 'continues-right' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      style={{
        gridColumn: `${segment.startCol + 1} / span ${segment.colSpan}`,
        gridRow: segment.lane + 1,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        color: borderColor,
      }}
      aria-label={`Edit event: ${event.subject}`}
      onMouseEnter={(e) =>
        showPopover(event, calendar, e.currentTarget.getBoundingClientRect())
      }
      onMouseLeave={() => hidePopover()}
      onClick={(e) => {
        e.stopPropagation();
        onEventClick?.(event);
      }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {!event.isAllDay && (
        <span className="m365-spanning-bar-start-time">
          {formatTime(new Date(event.start.dateTime))}
        </span>
      )}
      <span className="m365-spanning-bar-title">{event.subject}</span>
      {!event.isAllDay && (
        <span className="m365-spanning-bar-end-time">
          {formatTime(new Date(event.end.dateTime))}
        </span>
      )}
    </button>
  );
};
```

- [ ] **Step 4: Append new CSS rules to `styles.css`**

Add the following block at the end of `styles.css` (after the last existing rule):

```css
/* ─── Spanning Bar ─────────────────────────────────────────────────────────── */

.m365-spanning-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--radius-s);
  padding: 1px var(--size-4-1);
  margin: 1px 2px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  min-width: 0;
  box-sizing: border-box;
  width: calc(100% - 4px);
  pointer-events: auto;
}

.m365-spanning-bar:hover {
  filter: brightness(0.92);
}

.m365-spanning-bar.continues-left {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: 0;
  width: calc(100% - 2px);
}

.m365-spanning-bar.continues-right {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  margin-right: 0;
  width: calc(100% - 2px);
}

.m365-spanning-bar.continues-left.continues-right {
  width: 100%;
}

.m365-spanning-bar-title {
  font-size: var(--font-ui-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.m365-spanning-bar-start-time {
  font-size: var(--font-ui-smaller);
  flex-shrink: 0;
  white-space: nowrap;
}

.m365-spanning-bar-end-time {
  font-size: var(--font-ui-smaller);
  flex-shrink: 0;
  white-space: nowrap;
  margin-left: auto;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/components/SpanningBar.test.tsx
```

Expected: All tests PASS

- [ ] **Step 6: Run full suite to check for regressions**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 8: Commit**

```
feat: add SpanningBar component for multi-day event bars
```
Files: `src/components/SpanningBar.tsx`, `styles.css`, `tests/components/SpanningBar.test.tsx`

---

### Task 3: Month View Restructuring

**Files:**
- Modify: `src/components/MonthView.tsx`
- Modify: `styles.css` (change existing month grid rules; append new week-row rules)
- Modify: `tests/components/MonthView.test.tsx` (append new test cases)

**Interfaces:**
- Consumes: `computeWeekSpanningLayout`, `SpanningSegment` from `src/lib/spanningLayout.ts`
- Consumes: `SpanningBar` from `src/components/SpanningBar.tsx`

---

- [ ] **Step 1: Append new test cases to `tests/components/MonthView.test.tsx`**

Add the following block at the end of the file (after line 701):

```typescript
// ─── Spanning events ──────────────────────────────────────────────────────────

const multiDayEvent: M365Event = {
  id: 'multi1',
  subject: 'Long Conference',
  start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' }, // Apr 6–8 inclusive, end exclusive
  calendarId: 'cal1',
  isAllDay: true,
};

describe('MonthView — spanning events', () => {
  it('renders a multi-day event as a spanning bar', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[multiDayEvent]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-spanning-bar')).toBeInTheDocument();
    expect(screen.getByText('Long Conference')).toBeInTheDocument();
  });

  it('does not render a spanning event inside a day cell event button', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[multiDayEvent]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    const dayCellBtns = document.querySelectorAll('.m365-calendar-day-cell .m365-event-click-btn');
    const subjects = Array.from(dayCellBtns).map((b) => b.textContent);
    expect(subjects.every((t) => !t?.includes('Long Conference'))).toBe(true);
  });

  it('renders a cross-week spanning event as bars in both week rows', () => {
    // Apr 4 (Sat, week 1) – Apr 8 (Wed, week 2)
    const crossWeek: M365Event = {
      id: 'cross1',
      subject: 'Multi Week Event',
      start: { dateTime: '2026-04-04T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
      calendarId: 'cal1',
      isAllDay: true,
    };
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[crossWeek]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelectorAll('.m365-spanning-bar').length).toBe(2);
  });

  it('shows a spanning overflow badge when spanning events exceed maxSpanningLanes', () => {
    // Three events all starting on the same Monday: only 2 lanes visible, 1 overflows
    const events: M365Event[] = Array.from({ length: 3 }, (_, i) => ({
      id: `multi${i}`,
      subject: `Conference ${i}`,
      start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
      calendarId: 'cal1',
      isAllDay: true,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxSpanningLanes={2}
      />,
    );
    expect(document.querySelector('.m365-spanning-overflow-badge')).toBeInTheDocument();
    expect(document.querySelectorAll('.m365-spanning-bar').length).toBe(2);
  });

  it('clicking the spanning overflow badge calls onDayClick', async () => {
    const onDayClick = vi.fn();
    const events: M365Event[] = Array.from({ length: 3 }, (_, i) => ({
      id: `multi${i}`,
      subject: `Conference ${i}`,
      start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
      calendarId: 'cal1',
      isAllDay: true,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={onDayClick}
        maxSpanningLanes={2}
      />,
    );
    await userEvent.click(document.querySelector('.m365-spanning-overflow-badge')!);
    expect(onDayClick).toHaveBeenCalledWith(expect.any(Date));
  });

  it('calls onEventClick when a spanning bar is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[multiDayEvent]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit event: Long Conference' }));
    expect(onEventClick).toHaveBeenCalledWith(multiDayEvent);
  });

  it('still renders single-day events in day cells alongside spanning events', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[multiDayEvent, eventOnApril4]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-spanning-bar')).toBeInTheDocument();
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run tests/components/MonthView.test.tsx -t "spanning"
```

Expected: FAIL with "Cannot find module ... SpanningBar" or similar import error (the MonthView hasn't changed yet)

- [ ] **Step 3: Update `src/components/MonthView.tsx`**

Replace the entire file with the following content. This preserves all existing functionality but restructures the grid into week rows with a spanning layer:

```typescript
import React, { useState, useRef, useEffect } from 'react';
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList, DayContextMenuPayload } from '../types';
import { EventCard } from './EventCard';
import { TodoCard } from './TodoCard';
import { SpanningBar } from './SpanningBar';
import { toDateOnly, getDaysInMonthView } from '../lib/datetime';
import { computeWeekSpanningLayout } from '../lib/spanningLayout';
import { usePopoverContext } from '../PopoverContext';
import { OverflowPopup } from './OverflowPopup';

interface MonthViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onDayContextMenu?: (payload: DayContextMenuPayload, event: MouseEvent) => void;
  onEventClick?: (event: M365Event) => void;
  maxEventsPerDay?: number;
  maxSpanningLanes?: number;
  weather?: Map<string, DailyWeather | null>;
  weatherUnits?: 'imperial' | 'metric';
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  completingTodoIds?: Set<string>;
}

export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onDayContextMenu,
  onEventClick,
  maxEventsPerDay = 4,
  maxSpanningLanes = 2,
  weather,
  weatherUnits = 'imperial',
  todos = [],
  todoLists = [],
  onTodoClick,
  completingTodoIds,
}) => {
  const days = getDaysInMonthView(currentDate);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  const calendarMap = new Map(calendars.map((c) => [c.id, c]));
  const todoListMap = new Map(todoLists.map((l) => [l.id, l]));
  const today = new Date();
  const { showPopover, hidePopover } = usePopoverContext();

  const [overflowPopover, setOverflowPopover] = useState<{
    events: M365Event[];
    todos: M365TodoItem[];
    anchorRect: DOMRect;
  } | null>(null);
  const overflowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (overflowTimerRef.current !== null) clearTimeout(overflowTimerRef.current);
    };
  }, []);

  return (
    <div className="m365-calendar-month-view">
      <div className="m365-calendar-month-header">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="m365-calendar-day-header">
            {d}
          </div>
        ))}
      </div>
      <div className="m365-calendar-month-grid">
        {weeks.map((week, weekIdx) => {
          const weekStart = week[0];
          const { segments } = computeWeekSpanningLayout(events, weekStart);
          const visibleSegments = segments.filter((s) => s.lane < maxSpanningLanes);

          const overflowCounts = new Array(7).fill(0) as number[];
          for (const seg of segments) {
            if (seg.lane >= maxSpanningLanes) {
              for (let col = seg.startCol; col < seg.startCol + seg.colSpan; col++) {
                overflowCounts[col]++;
              }
            }
          }

          const spanningIds = new Set(segments.map((s) => s.event.id));

          return (
            <div key={weekIdx} className="m365-month-week-row">
              <div className="m365-month-spanning-layer">
                {visibleSegments.map((seg) => {
                  const cal = calendarMap.get(seg.event.calendarId);
                  if (!cal) return null;
                  return (
                    <SpanningBar
                      key={seg.event.id}
                      event={seg.event}
                      calendar={cal}
                      segment={seg}
                      onEventClick={onEventClick}
                    />
                  );
                })}
                {overflowCounts.map((count, col) =>
                  count > 0 ? (
                    <button
                      key={`overflow-${weekIdx}-${col}`}
                      type="button"
                      className="m365-spanning-overflow-badge"
                      style={{
                        gridColumn: col + 1,
                        gridRow: maxSpanningLanes + 1,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDayClick(week[col]);
                      }}
                      onContextMenu={(e) => e.stopPropagation()}
                    >
                      +{count}
                    </button>
                  ) : null,
                )}
              </div>
              <div className="m365-month-day-cells">
                {week.map((day) => {
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const isToday = day.toDateString() === today.toDateString();
                  const cellDateStr = toDateOnly(day);
                  const dayEvents = events
                    .filter(
                      (e) =>
                        !spanningIds.has(e.id) &&
                        e.start.dateTime.slice(0, 10) === cellDateStr,
                    )
                    .sort((a, b) => {
                      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
                      if (a.isAllDay) return 0;
                      return a.start.dateTime.localeCompare(b.start.dateTime);
                    });
                  const dayTodos = todos.filter((t) => t.dueDate === cellDateStr);
                  const eventSlots = Math.min(dayEvents.length, maxEventsPerDay);
                  const todoSlots = Math.min(dayTodos.length, maxEventsPerDay - eventSlots);
                  const totalItems = dayEvents.length + dayTodos.length;
                  return (
                    <div
                      key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                      className={[
                        'm365-calendar-day-cell',
                        isCurrentMonth ? '' : 'other-month',
                        isToday ? 'today' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onDayClick(day)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        onDayContextMenu?.({ kind: 'allday', date: day }, e.nativeEvent);
                      }}
                    >
                      <div className="m365-month-day-header-row">
                        <span className="m365-calendar-day-number">{day.getDate()}</span>
                        {weather !== undefined &&
                          (() => {
                            const w = weather.get(cellDateStr);
                            if (!w) return null;
                            const unit = weatherUnits === 'imperial' ? '°F' : '°C';
                            const high =
                              w.tempHigh !== null
                                ? `↑ ${Math.round(w.tempHigh)}${unit}`
                                : null;
                            const low =
                              w.tempLow !== null
                                ? `↓ ${Math.round(w.tempLow)}${unit}`
                                : null;
                            const precip =
                              w.precipProbability !== null
                                ? `☂ ${Math.round(w.precipProbability * 100)}%`
                                : null;
                            return (
                              <>
                                <img
                                  className="m365-weather-icon m365-weather-month"
                                  src={`https://openweathermap.org/img/wn/${w.condition.iconCode}.png`}
                                  alt={w.condition.description}
                                  width={24}
                                  height={24}
                                />
                                {(high || low || precip) && (
                                  <div className="m365-month-weather-details">
                                    {high && <span>{high}</span>}
                                    {low && <span>{low}</span>}
                                    {precip && <span>{precip}</span>}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                      </div>
                      {dayEvents.slice(0, eventSlots).map((event) => {
                        const cal = calendarMap.get(event.calendarId);
                        if (!cal) return null;
                        return (
                          <button
                            key={event.id}
                            type="button"
                            className="m365-event-click-btn"
                            aria-label={`Edit event: ${event.subject}`}
                            onMouseEnter={(e) =>
                              showPopover(
                                event,
                                cal,
                                e.currentTarget.getBoundingClientRect(),
                              )
                            }
                            onMouseLeave={() => hidePopover()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEventClick?.(event);
                            }}
                            onContextMenu={(e) => e.stopPropagation()}
                          >
                            <EventCard event={event} calendar={cal} />
                          </button>
                        );
                      })}
                      {dayTodos.slice(0, todoSlots).map((todo) => {
                        const list = todoListMap.get(todo.listId);
                        if (!list) return null;
                        return (
                          <button
                            key={todo.id}
                            type="button"
                            className="m365-event-click-btn"
                            aria-label={`View task: ${todo.title}`}
                            disabled={completingTodoIds?.has(todo.id) ?? false}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTodoClick?.(todo);
                            }}
                            onContextMenu={(e) => e.stopPropagation()}
                          >
                            <TodoCard
                              todo={todo}
                              todoList={list}
                              isCompleting={completingTodoIds?.has(todo.id) ?? false}
                            />
                          </button>
                        );
                      })}
                      {totalItems > maxEventsPerDay && (
                        <button
                          type="button"
                          className="m365-month-overflow-btn"
                          aria-label={`Show ${totalItems - maxEventsPerDay} more items`}
                          onContextMenu={(e) => e.stopPropagation()}
                          onMouseEnter={(e) => {
                            if (overflowTimerRef.current !== null)
                              clearTimeout(overflowTimerRef.current);
                            const rect = e.currentTarget.getBoundingClientRect();
                            overflowTimerRef.current = setTimeout(() => {
                              overflowTimerRef.current = null;
                              setOverflowPopover({
                                events: dayEvents.slice(eventSlots),
                                todos: dayTodos.slice(todoSlots),
                                anchorRect: rect,
                              });
                            }, 300);
                          }}
                          onMouseLeave={() => {
                            if (overflowTimerRef.current !== null) {
                              clearTimeout(overflowTimerRef.current);
                              overflowTimerRef.current = null;
                            }
                            setOverflowPopover(null);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDayClick(day);
                          }}
                        >
                          (+{totalItems - maxEventsPerDay})
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {overflowPopover && (
        <OverflowPopup
          events={overflowPopover.events}
          todos={overflowPopover.todos}
          calendarMap={calendarMap}
          todoListMap={todoListMap}
          anchorRect={overflowPopover.anchorRect}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 4: Update CSS for month view grid in `styles.css`**

**Replace** the existing `.m365-calendar-month-grid` rule:

Old:
```css
.m365-calendar-month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 1fr;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

New:
```css
.m365-calendar-month-grid {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

**Replace** the existing `.m365-calendar-day-cell` rule (remove `border-bottom`):

Old:
```css
.m365-calendar-day-cell {
  border-right: 1px solid var(--background-modifier-border);
  border-bottom: 1px solid var(--background-modifier-border);
  padding: var(--size-4-1);
  cursor: pointer;
  overflow: hidden;
}
```

New:
```css
.m365-calendar-day-cell {
  border-right: 1px solid var(--background-modifier-border);
  padding: var(--size-4-1);
  cursor: pointer;
  overflow: hidden;
}
```

**Append** new rules at the end of the `styles.css` month view section (before the `/* ─── Week View ───... */` comment, or at end of file):

```css
.m365-month-week-row {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border-bottom: 1px solid var(--background-modifier-border);
}

.m365-month-spanning-layer {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 22px;
  flex-shrink: 0;
}

.m365-month-day-cells {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  flex: 1;
  min-height: 0;
}

.m365-spanning-overflow-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-s);
  padding: 1px var(--size-4-1);
  margin: 1px 2px;
  background: var(--background-modifier-border);
  border: none;
  font-size: 0.75em;
  color: var(--text-muted);
  cursor: pointer;
  width: calc(100% - 4px);
  box-sizing: border-box;
}

.m365-spanning-overflow-badge:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
```

- [ ] **Step 5: Run the full MonthView test suite**

```bash
npx vitest run tests/components/MonthView.test.tsx
```

Expected: All tests PASS (including new spanning tests and all pre-existing tests)

- [ ] **Step 6: Run full suite to check for regressions**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 8: Commit**

```
feat: restructure month view into week rows with spanning event layer
```
Files: `src/components/MonthView.tsx`, `styles.css`, `tests/components/MonthView.test.tsx`

---

### Task 4: Week View All-Day Row Restructuring

**Files:**
- Modify: `src/components/WeekView.tsx`
- Modify: `styles.css` (update existing all-day row rules; append new rules)
- Modify: `tests/components/WeekView.test.tsx` (append new test cases)

**Interfaces:**
- Consumes: `computeWeekSpanningLayout` from `src/lib/spanningLayout.ts`
- Consumes: `SpanningBar` from `src/components/SpanningBar.tsx`

---

- [ ] **Step 1: Append new test cases to `tests/components/WeekView.test.tsx`**

Add the following at the end of the file (after line 562):

```typescript
// ─── Spanning events in week all-day row ─────────────────────────────────────

const multiDayAllDay: M365Event = {
  id: 'multi1',
  subject: 'Three Day Conference',
  start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' }, // Mon–Wed inclusive
  calendarId: 'cal1',
  isAllDay: true,
};

const crossMidnight: M365Event = {
  id: 'cross1',
  subject: 'Late Night Event',
  start: { dateTime: '2026-04-06T22:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-07T02:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

describe('WeekView — spanning events in all-day row', () => {
  it('renders a multi-day all-day event as a spanning bar in the all-day grid', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[multiDayAllDay]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-spanning-bar')).toBeInTheDocument();
    expect(screen.getByText('Three Day Conference')).toBeInTheDocument();
    expect(document.querySelector('.m365-day-event-block')).not.toBeInTheDocument();
  });

  it('renders a timed cross-midnight event in the all-day grid, not in the timeline', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[crossMidnight]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-spanning-bar')).toBeInTheDocument();
    expect(screen.getByText('Late Night Event')).toBeInTheDocument();
    expect(document.querySelector('.m365-day-event-block')).not.toBeInTheDocument();
  });

  it('renders start and end time labels on a timed cross-midnight spanning bar', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[crossMidnight]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-spanning-bar-start-time')).toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar-end-time')).toBeInTheDocument();
  });

  it('renders a single-day all-day event as a spanning bar with colSpan 1', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[allDayEventOnMonday]} // existing fixture: single-day all-day
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    const bar = document.querySelector('.m365-spanning-bar') as HTMLElement;
    expect(bar).toBeInTheDocument();
    expect(bar.style.gridColumn).toBe('2 / span 1'); // Monday = col 2 (startCol 1 + 1)
  });

  it('calls onEventClick when a spanning bar in the all-day row is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[multiDayAllDay]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit event: Three Day Conference' }),
    );
    expect(onEventClick).toHaveBeenCalledWith(multiDayAllDay);
  });

  it('still renders todos in the week view when spanning events are present', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-14')}
        events={[multiDayAllDay]}
        calendars={[calendar]}
        todos={[todoOnApril14]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npx vitest run tests/components/WeekView.test.tsx -t "spanning"
```

Expected: FAIL (WeekView hasn't changed yet)

- [ ] **Step 3: Update `src/components/WeekView.tsx`**

Replace the entire file with the following content:

```typescript
import React, { useMemo, useRef, useEffect } from 'react';
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList, DayContextMenuPayload } from '../types';
import { SpanningBar } from './SpanningBar';
import { TodoCard } from './TodoCard';
import { TimelineColumn, HOURS_IN_DAY, PX_PER_MIN } from './TimelineColumn';
import { toDateOnly, getWeekDays } from '../lib/datetime';
import { computeWeekSpanningLayout } from '../lib/spanningLayout';
import { useNow } from '../hooks/useNow';
import { usePopoverContext } from '../PopoverContext';

interface WeekViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onDayContextMenu?: (payload: DayContextMenuPayload, event: MouseEvent) => void;
  onEventClick?: (event: M365Event) => void;
  weather?: Map<string, DailyWeather | null>;
  weatherUnits?: 'imperial' | 'metric';
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  completingTodoIds?: Set<string>;
}

export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onDayContextMenu,
  onEventClick,
  weather,
  weatherUnits = 'imperial',
  todos = [],
  todoLists = [],
  onTodoClick,
  completingTodoIds,
}) => {
  const weekDays = getWeekDays(currentDate);
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const todoListMap = useMemo(() => new Map(todoLists.map((l) => [l.id, l])), [todoLists]);
  const todosByDate = useMemo(() => {
    const map = new Map<string, M365TodoItem[]>();
    for (const todo of todos) {
      if (!todo.dueDate) continue;
      if (!map.has(todo.dueDate)) map.set(todo.dueDate, []);
      map.get(todo.dueDate)!.push(todo);
    }
    return map;
  }, [todos]);

  // All-day row layout: all-day events (single + multi) + cross-midnight timed events
  const allDayLayout = useMemo(() => {
    const allDayRowEvents = events.filter(
      (e) =>
        e.isAllDay ||
        e.start.dateTime.slice(0, 10) !== e.end.dateTime.slice(0, 10),
    );
    return computeWeekSpanningLayout(allDayRowEvents, weekDays[0], {
      includeAllAllDay: true,
    });
  }, [events, weekDays]);

  // Timeline events: timed events that start and end on the same calendar day
  const timedByDate = useMemo(() => {
    const map = new Map<string, M365Event[]>();
    for (const event of events) {
      if (event.isAllDay) continue;
      if (event.start.dateTime.slice(0, 10) !== event.end.dateTime.slice(0, 10)) continue;
      const key = event.start.dateTime.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const { showPopover: _showPopover, hidePopover: _hidePopover } = usePopoverContext();

  const isCurrentWeek = useMemo(
    () =>
      weekDays.some(
        (d) =>
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate(),
      ),
    [weekDays, now],
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCurrentWeek || !scrollRef.current) return;
    const container = scrollRef.current;
    const target = nowMinutes * PX_PER_MIN - container.clientHeight / 2;
    container.scrollTop = Math.max(
      0,
      Math.min(target, container.scrollHeight - container.clientHeight),
    );
  }, []); // intentionally empty: fires once on mount

  const hasTodos = weekDays.some(
    (d) => (todosByDate.get(toDateOnly(d)) ?? []).length > 0,
  );

  return (
    <div className="m365-calendar-week-view">
      {/* Day header row */}
      <div className="m365-week-column-headers">
        <div className="m365-week-gutter-spacer" />
        {weekDays.map((day) => {
          const isToday = day.toDateString() === now.toDateString();
          return (
            <div
              key={`header-${toDateOnly(day)}`}
              className={['m365-calendar-week-day', isToday ? 'today' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onDayClick(day)}
              onContextMenu={(e) => {
                e.preventDefault();
                onDayContextMenu?.({ kind: 'allday', date: day }, e.nativeEvent);
              }}
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
                {weather !== undefined &&
                  (() => {
                    const dateStr = toDateOnly(day);
                    const w = weather.get(dateStr);
                    if (w === undefined || w === null) return null;
                    return (
                      <div className="m365-weather-strip m365-weather-week">
                        <img
                          className="m365-weather-icon"
                          src={`https://openweathermap.org/img/wn/${w.condition.iconCode}.png`}
                          alt={w.condition.description}
                          width={24}
                          height={24}
                        />
                        <div className="m365-weather-temps">
                          <span className="m365-weather-current">
                            {w.tempCurrent !== null
                              ? `${Math.round(w.tempCurrent)}°${weatherUnits === 'imperial' ? 'F' : 'C'}`
                              : '—'}
                          </span>
                          <span className="m365-weather-high">
                            H:{' '}
                            {w.tempHigh !== null
                              ? `${Math.round(w.tempHigh)}°${weatherUnits === 'imperial' ? 'F' : 'C'}`
                              : '—'}
                          </span>
                          <span className="m365-weather-low">
                            L:{' '}
                            {w.tempLow !== null
                              ? `${Math.round(w.tempLow)}°${weatherUnits === 'imperial' ? 'F' : 'C'}`
                              : '—'}
                          </span>
                          <span className="m365-weather-precip">
                            ☂{' '}
                            {w.precipProbability !== null
                              ? `${Math.round(w.precipProbability * 100)}%`
                              : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div className="m365-week-allday-row">
        <div className="m365-week-allday-gutter" />
        <div className="m365-week-allday-main">
          {/* Background columns: provide per-day context menu targets and vertical borders */}
          <div className="m365-week-allday-columns">
            {weekDays.map((day) => (
              <div
                key={`bg-${toDateOnly(day)}`}
                className="m365-week-allday-cell"
                onContextMenu={(e) => {
                  e.preventDefault();
                  onDayContextMenu?.({ kind: 'allday', date: day }, e.nativeEvent);
                }}
              />
            ))}
          </div>
          {/* Spanning events grid */}
          <div className="m365-week-allday-grid">
            {allDayLayout.segments.map((seg) => {
              const cal = calendarMap.get(seg.event.calendarId);
              if (!cal) return null;
              return (
                <SpanningBar
                  key={seg.event.id}
                  event={seg.event}
                  calendar={cal}
                  segment={seg}
                  onEventClick={onEventClick}
                />
              );
            })}
          </div>
          {/* Todos row — only rendered when at least one day has todos */}
          {hasTodos && (
            <div className="m365-week-todo-strip">
              {weekDays.map((day) => {
                const cellDateStr = toDateOnly(day);
                return (
                  <div key={cellDateStr} className="m365-week-todo-cell">
                    {(todosByDate.get(cellDateStr) ?? []).map((todo) => {
                      const list = todoListMap.get(todo.listId);
                      if (!list) return null;
                      return (
                        <button
                          key={todo.id}
                          type="button"
                          className="m365-event-click-btn"
                          aria-label={`View task: ${todo.title}`}
                          disabled={completingTodoIds?.has(todo.id) ?? false}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTodoClick?.(todo);
                          }}
                          onContextMenu={(e) => e.stopPropagation()}
                        >
                          <TodoCard
                            todo={todo}
                            todoList={list}
                            isCompleting={completingTodoIds?.has(todo.id) ?? false}
                          />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
          return (
            <TimelineColumn
              key={`timeline-${cellDateStr}`}
              date={day}
              events={timedByDate.get(cellDateStr) ?? []}
              calendars={calendars}
              onTimeClick={onDayClick}
              onTimeContextMenu={(dateTime, e) =>
                onDayContextMenu?.({ kind: 'timed', dateTime }, e)
              }
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

**Note:** `_showPopover` and `_hidePopover` are prefixed with `_` because `usePopoverContext` is called but its return values are only used by `SpanningBar` internally now. Remove the `usePopoverContext` import and call entirely if you get a lint error — the hook is no longer needed directly in WeekView.

Actually, remove the `usePopoverContext` import and call — `SpanningBar` handles its own popover. The updated imports should be:

```typescript
import React, { useMemo, useRef, useEffect } from 'react';
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList, DayContextMenuPayload } from '../types';
import { SpanningBar } from './SpanningBar';
import { TodoCard } from './TodoCard';
import { TimelineColumn, HOURS_IN_DAY, PX_PER_MIN } from './TimelineColumn';
import { toDateOnly, getWeekDays } from '../lib/datetime';
import { computeWeekSpanningLayout } from '../lib/spanningLayout';
import { useNow } from '../hooks/useNow';
```

And remove the `usePopoverContext` line from the component body.

- [ ] **Step 4: Update CSS for week view all-day row in `styles.css`**

**Replace** the existing `.m365-week-allday-row` rule:

Old:
```css
.m365-week-allday-row {
  display: flex;
  flex-shrink: 0;
  min-height: 24px;
  border-bottom: 1px solid var(--background-modifier-border);
}
```

New:
```css
.m365-week-allday-row {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1px solid var(--background-modifier-border);
}
```

**Replace** the existing `.m365-week-allday-cell` rule:

Old:
```css
.m365-week-allday-cell {
  flex: 1;
  padding: 2px var(--size-4-1);
  border-right: 1px solid var(--background-modifier-border);
  overflow: hidden;
}
```

New:
```css
.m365-week-allday-cell {
  flex: 1;
  border-right: 1px solid var(--background-modifier-border);
  pointer-events: auto;
}
```

**Append** new rules at the end of `styles.css`:

```css
/* ─── Week View All-Day Grid ──────────────────────────────────────────────── */

.m365-week-allday-main {
  flex: 1;
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.m365-week-allday-columns {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  pointer-events: none;
}

.m365-week-allday-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 22px;
  min-height: 22px;
  position: relative;
  pointer-events: none;
}

.m365-week-todo-strip {
  display: flex;
  position: relative;
  border-top: 1px solid var(--background-modifier-border);
}

.m365-week-todo-cell {
  flex: 1;
  padding: 2px var(--size-4-1);
  border-right: 1px solid var(--background-modifier-border);
  overflow: hidden;
}
```

- [ ] **Step 5: Run the full WeekView test suite**

```bash
npx vitest run tests/components/WeekView.test.tsx
```

Expected: All tests PASS (including new spanning tests and all pre-existing tests)

- [ ] **Step 6: Run full suite to check for regressions**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 7: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: No errors or warnings

- [ ] **Step 8: Commit**

```
feat: restructure week view all-day row with spanning event grid
```
Files: `src/components/WeekView.tsx`, `styles.css`, `tests/components/WeekView.test.tsx`
