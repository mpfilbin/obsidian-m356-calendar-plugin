# Event Hover Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a read-only, 300ms-debounced hover popover on every event in the month, week, and day views, displaying subject, time range, location, body preview, and an "Open in Outlook" label.

**Architecture:** A `PopoverContext` holds hover state and is accessed directly by event buttons via `usePopoverContext()` — no prop drilling. A single `<EventHoverPopover>` is portal-rendered to `document.body` to avoid clipping by `overflow:hidden` timeline containers.

**Tech Stack:** React 18, `react-dom` portal, Vitest + jsdom + @testing-library/react, TypeScript

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/PopoverContext.tsx` | Context, provider, `showPopover`/`hidePopover`, portal render |
| Create | `src/components/EventHoverPopover.tsx` | Presentational popover; position computation; field rendering |
| Modify | `src/view.tsx` | Wrap `<CalendarApp>` with `<PopoverProvider>` |
| Modify | `src/components/MonthView.tsx` | Add `onMouseEnter`/`onMouseLeave` to event buttons |
| Modify | `src/components/WeekView.tsx` | Add `onMouseEnter`/`onMouseLeave` to all-day event buttons |
| Modify | `src/components/DayView.tsx` | Add `onMouseEnter`/`onMouseLeave` to all-day event buttons |
| Modify | `src/components/TimelineColumn.tsx` | Add `onMouseEnter`/`onMouseLeave` to timed event buttons |
| Modify | `styles.css` | `.m365-event-hover-popover` and child element styles |
| Create | `tests/components/EventHoverPopover.test.tsx` | Component unit tests |
| Create | `tests/PopoverContext.test.tsx` | Context behavior tests (fake timers) |

---

## Task 1: EventHoverPopover component

**Files:**
- Create: `src/components/EventHoverPopover.tsx`
- Create: `tests/components/EventHoverPopover.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/EventHoverPopover.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { EventHoverPopover } from '../../src/components/EventHoverPopover';
import { M365Event, M365Calendar } from '../../src/types';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const baseEvent: M365Event = {
  id: 'evt1',
  subject: 'Team Standup',
  start: { dateTime: '2026-04-14T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-14T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

function makeRect(right: number): DOMRect {
  return { top: 100, left: 50, right, bottom: 150, width: right - 50, height: 50, x: 50, y: 100, toJSON: () => ({}) } as DOMRect;
}

describe('EventHoverPopover', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1024);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders subject, time range, location, bodyPreview, and webLink indicator when all present', () => {
    const event: M365Event = {
      ...baseEvent,
      location: 'Conference Room A',
      bodyPreview: 'Sprint review topics',
      webLink: 'https://outlook.com/event/1',
    };
    render(<EventHoverPopover event={event} calendar={calendar} anchorRect={makeRect(200)} />);
    expect(screen.getByText('Team Standup')).toBeInTheDocument();
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
    expect(screen.getByText('Conference Room A')).toBeInTheDocument();
    expect(screen.getByText('Sprint review topics')).toBeInTheDocument();
    expect(screen.getByText('Open in Outlook')).toBeInTheDocument();
  });

  it('omits optional fields when absent from the event', () => {
    render(<EventHoverPopover event={baseEvent} calendar={calendar} anchorRect={makeRect(200)} />);
    expect(screen.queryByText('Open in Outlook')).not.toBeInTheDocument();
    expect(document.querySelector('.m365-popover-location')).not.toBeInTheDocument();
    expect(document.querySelector('.m365-popover-body')).not.toBeInTheDocument();
  });

  it('shows "All day" for all-day events', () => {
    const event: M365Event = { ...baseEvent, isAllDay: true };
    render(<EventHoverPopover event={event} calendar={calendar} anchorRect={makeRect(200)} />);
    expect(screen.getByText('All day')).toBeInTheDocument();
  });

  it('positions to the left when anchorRect is near the right viewport edge', () => {
    // right=900: 900 + 8 (gap) + 280 (width) = 1188 > 1024 → flip left
    // expected left: 50 - 8 - 280 = -238
    const { container } = render(
      <EventHoverPopover event={baseEvent} calendar={calendar} anchorRect={makeRect(900)} />,
    );
    const popover = container.firstChild as HTMLElement;
    expect(popover.style.left).toBe('-238px');
  });

  it('positions to the right when there is space', () => {
    // right=200: 200 + 8 + 280 = 488 < 1024 → no flip
    // expected left: 200 + 8 = 208
    const { container } = render(
      <EventHoverPopover event={baseEvent} calendar={calendar} anchorRect={makeRect(200)} />,
    );
    const popover = container.firstChild as HTMLElement;
    expect(popover.style.left).toBe('208px');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/components/EventHoverPopover.test.tsx
```

Expected: All 5 tests fail with "Cannot find module '../../src/components/EventHoverPopover'".

- [ ] **Step 3: Create the component**

Create `src/components/EventHoverPopover.tsx`:

```tsx
import React from 'react';
import { M365Event, M365Calendar } from '../types';

interface EventHoverPopoverProps {
  event: M365Event;
  calendar: M365Calendar;
  anchorRect: DOMRect;
}

const POPOVER_WIDTH = 280;
const GAP = 8;

export const EventHoverPopover: React.FC<EventHoverPopoverProps> = ({
  event,
  calendar,
  anchorRect,
}) => {
  const wouldOverflow = anchorRect.right + GAP + POPOVER_WIDTH > window.innerWidth;
  const left = wouldOverflow
    ? anchorRect.left - GAP - POPOVER_WIDTH
    : anchorRect.right + GAP;

  const startTime = new Date(event.start.dateTime);
  const endTime = new Date(event.end.dateTime);
  const timeRange = event.isAllDay
    ? 'All day'
    : `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} \u2013 ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div
      className="m365-event-hover-popover"
      style={{ position: 'fixed', top: `${anchorRect.top}px`, left: `${left}px`, pointerEvents: 'none' }}
    >
      <div className="m365-popover-subject" style={{ color: calendar.color }}>
        {event.subject}
      </div>
      <div className="m365-popover-time">{timeRange}</div>
      {event.location && (
        <div className="m365-popover-location">{event.location}</div>
      )}
      {event.bodyPreview && (
        <div className="m365-popover-body">{event.bodyPreview}</div>
      )}
      {event.webLink && (
        <div className="m365-popover-weblink">Open in Outlook</div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/EventHoverPopover.test.tsx
```

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```
git add src/components/EventHoverPopover.tsx tests/components/EventHoverPopover.test.tsx
git commit -m "feat: add EventHoverPopover component"
```

---

## Task 2: PopoverContext

**Files:**
- Create: `src/PopoverContext.tsx`
- Create: `tests/PopoverContext.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/PopoverContext.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { PopoverProvider, usePopoverContext } from '../src/PopoverContext';
import { M365Event, M365Calendar } from '../src/types';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const event: M365Event = {
  id: 'evt1',
  subject: 'Team Standup',
  start: { dateTime: '2026-04-14T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-14T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const rect = {
  top: 100, left: 50, right: 200, bottom: 150,
  width: 150, height: 50, x: 50, y: 100,
  toJSON: () => ({}),
} as DOMRect;

const Trigger: React.FC = () => {
  const { showPopover, hidePopover } = usePopoverContext();
  return (
    <>
      <button data-testid="show" onClick={() => showPopover(event, calendar, rect)}>show</button>
      <button data-testid="hide" onClick={() => hidePopover()}>hide</button>
    </>
  );
};

describe('PopoverContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', 1024);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not show popover before 300ms', () => {
    render(<PopoverProvider><Trigger /></PopoverProvider>);
    fireEvent.click(screen.getByTestId('show'));
    act(() => { vi.advanceTimersByTime(299); });
    expect(screen.queryByText('Team Standup')).not.toBeInTheDocument();
  });

  it('shows popover after 300ms', () => {
    render(<PopoverProvider><Trigger /></PopoverProvider>);
    fireEvent.click(screen.getByTestId('show'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Team Standup')).toBeInTheDocument();
  });

  it('hidePopover cancels a pending show', () => {
    render(<PopoverProvider><Trigger /></PopoverProvider>);
    fireEvent.click(screen.getByTestId('show'));
    fireEvent.click(screen.getByTestId('hide'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByText('Team Standup')).not.toBeInTheDocument();
  });

  it('hidePopover dismisses a visible popover immediately', () => {
    render(<PopoverProvider><Trigger /></PopoverProvider>);
    fireEvent.click(screen.getByTestId('show'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Team Standup')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hide'));
    expect(screen.queryByText('Team Standup')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/PopoverContext.test.tsx
```

Expected: All 4 tests fail with "Cannot find module '../src/PopoverContext'".

- [ ] **Step 3: Create the context**

Create `src/PopoverContext.tsx`:

```tsx
import React, { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { M365Event, M365Calendar } from './types';
import { EventHoverPopover } from './components/EventHoverPopover';

interface PopoverState {
  event: M365Event;
  calendar: M365Calendar;
  anchorRect: DOMRect;
}

interface PopoverContextValue {
  showPopover: (event: M365Event, calendar: M365Calendar, rect: DOMRect) => void;
  hidePopover: () => void;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

export function usePopoverContext(): PopoverContextValue {
  const ctx = useContext(PopoverContext);
  // Return no-ops when rendered outside a provider (e.g. in tests that don't wrap with PopoverProvider)
  return ctx ?? { showPopover: () => {}, hidePopover: () => {} };
}

export const PopoverProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPopover = (event: M365Event, calendar: M365Calendar, rect: DOMRect) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPopover({ event, calendar, anchorRect: rect });
    }, 300);
  };

  const hidePopover = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPopover(null);
  };

  return (
    <PopoverContext.Provider value={{ showPopover, hidePopover }}>
      {children}
      {popover &&
        createPortal(
          <EventHoverPopover
            event={popover.event}
            calendar={popover.calendar}
            anchorRect={popover.anchorRect}
          />,
          document.body,
        )}
    </PopoverContext.Provider>
  );
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/PopoverContext.test.tsx
```

Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```
git add src/PopoverContext.tsx tests/PopoverContext.test.tsx
git commit -m "feat: add PopoverContext with debounced show/hide and portal render"
```

---

## Task 3: Wire MonthView event buttons

**Files:**
- Modify: `src/components/MonthView.tsx`

- [ ] **Step 1: Add import and mouse handlers to MonthView**

At the top of `src/components/MonthView.tsx`, add the import on the line after the existing imports:

```tsx
import { usePopoverContext } from '../PopoverContext';
```

Inside the `MonthView` component function body, after the `calendarMap` and `today` declarations, add:

```tsx
const { showPopover, hidePopover } = usePopoverContext();
```

Find the event `<button>` inside the `dayEvents.slice(0, maxEventsPerDay).map(...)` callback (around line 84) and add the two mouse handlers:

```tsx
<button
  key={event.id}
  type="button"
  className="m365-event-click-btn"
  aria-label={`Edit event: ${event.subject}`}
  onMouseEnter={(e) => showPopover(event, cal, e.currentTarget.getBoundingClientRect())}
  onMouseLeave={() => hidePopover()}
  onClick={(e) => {
    e.stopPropagation();
    onEventClick?.(event);
  }}
>
  <EventCard event={event} calendar={cal} />
</button>
```

- [ ] **Step 2: Run the MonthView tests to confirm no regressions**

```bash
npx vitest run tests/components/MonthView.test.tsx
```

Expected: All existing tests pass.

- [ ] **Step 3: Commit**

```
git add src/components/MonthView.tsx
git commit -m "feat: wire hover popover on MonthView event buttons"
```

---

## Task 4: Wire WeekView all-day event buttons

**Files:**
- Modify: `src/components/WeekView.tsx`

- [ ] **Step 1: Add import and mouse handlers to WeekView**

Add the import at the top of `src/components/WeekView.tsx`:

```tsx
import { usePopoverContext } from '../PopoverContext';
```

Inside the `WeekView` component function body, after the `calendarMap` and `eventsByDate` declarations, add:

```tsx
const { showPopover, hidePopover } = usePopoverContext();
```

Find the all-day event `<button>` inside the `allDayEvents.map(...)` callback (inside `.m365-week-allday-cell`, around line 113) and add the mouse handlers:

```tsx
<button
  key={event.id}
  type="button"
  className="m365-event-click-btn"
  aria-label={`Edit event: ${event.subject}`}
  onMouseEnter={(e) => showPopover(event, cal, e.currentTarget.getBoundingClientRect())}
  onMouseLeave={() => hidePopover()}
  onClick={(e) => {
    e.stopPropagation();
    onEventClick?.(event);
  }}
>
  <EventCard event={event} calendar={cal} />
</button>
```

- [ ] **Step 2: Run the WeekView tests to confirm no regressions**

```bash
npx vitest run tests/components/WeekView.test.tsx
```

Expected: All existing tests pass.

- [ ] **Step 3: Commit**

```
git add src/components/WeekView.tsx
git commit -m "feat: wire hover popover on WeekView all-day event buttons"
```

---

## Task 5: Wire DayView all-day event buttons

**Files:**
- Modify: `src/components/DayView.tsx`

- [ ] **Step 1: Add import and mouse handlers to DayView**

Add the import at the top of `src/components/DayView.tsx`:

```tsx
import { usePopoverContext } from '../PopoverContext';
```

Inside the `DayView` component function body, after the `calendarMap`, `allDayEvents`, and `timedEvents` declarations, add:

```tsx
const { showPopover, hidePopover } = usePopoverContext();
```

Find the all-day event `<button>` inside the `allDayEvents.map(...)` callback (inside `.m365-day-view-allday`, around line 66) and add the mouse handlers:

```tsx
<button
  key={event.id}
  type="button"
  className="m365-event-click-btn"
  aria-label={`Edit event: ${event.subject}`}
  onMouseEnter={(e) => showPopover(event, cal, e.currentTarget.getBoundingClientRect())}
  onMouseLeave={() => hidePopover()}
  onClick={(e) => {
    e.stopPropagation();
    onEventClick?.(event);
  }}
>
  <EventCard event={event} calendar={cal} />
</button>
```

- [ ] **Step 2: Run the DayView tests to confirm no regressions**

```bash
npx vitest run tests/components/DayView.test.tsx
```

Expected: All existing tests pass.

- [ ] **Step 3: Commit**

```
git add src/components/DayView.tsx
git commit -m "feat: wire hover popover on DayView all-day event buttons"
```

---

## Task 6: Wire TimelineColumn timed event buttons

**Files:**
- Modify: `src/components/TimelineColumn.tsx`

- [ ] **Step 1: Add import and mouse handlers to TimelineColumn**

Add the import at the top of `src/components/TimelineColumn.tsx`:

```tsx
import { usePopoverContext } from '../PopoverContext';
```

Inside the `TimelineColumn` component function body, after the `calendarMap` and `laid` declarations, add:

```tsx
const { showPopover, hidePopover } = usePopoverContext();
```

Find the timed event `<button>` inside the `laid.map(...)` callback (inside `.m365-day-view-events`, around line 155) and add the mouse handlers alongside the existing `onClick`:

```tsx
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
  onMouseEnter={(e) => showPopover(event, cal, e.currentTarget.getBoundingClientRect())}
  onMouseLeave={() => hidePopover()}
  onClick={(e) => {
    e.stopPropagation();
    onEventClick?.(event);
  }}
>
```

- [ ] **Step 2: Run the TimelineColumn tests to confirm no regressions**

```bash
npx vitest run tests/components/TimelineColumn.test.tsx
```

Expected: All existing tests pass.

- [ ] **Step 3: Commit**

```
git add src/components/TimelineColumn.tsx
git commit -m "feat: wire hover popover on TimelineColumn timed event buttons"
```

---

## Task 7: Wire PopoverProvider in view.tsx and add CSS

**Files:**
- Modify: `src/view.tsx`
- Modify: `styles.css`

- [ ] **Step 1: Add PopoverProvider to the React tree in view.tsx**

Add the import to `src/view.tsx`:

```tsx
import { PopoverProvider } from './PopoverContext';
```

Update the `onOpen` render call so `PopoverProvider` wraps `CalendarApp`:

```tsx
async onOpen(): Promise<void> {
  this.root = createRoot(this.contentEl);
  this.root.render(
    <StrictMode>
      <AppContext.Provider value={this.contextValue}>
        <PopoverProvider>
          <CalendarApp />
        </PopoverProvider>
      </AppContext.Provider>
    </StrictMode>,
  );
}
```

- [ ] **Step 2: Add popover styles to styles.css**

Append the following block to the end of `styles.css`:

```css
/* ─── Event Hover Popover ────────────────────────────────────────────────── */

.m365-event-hover-popover {
  z-index: 1000;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  box-shadow: var(--shadow-l);
  padding: var(--size-4-3);
  max-width: 280px;
  pointer-events: none;
}

.m365-popover-subject {
  font-weight: var(--font-semibold);
  font-size: var(--font-ui-medium);
  margin-bottom: var(--size-4-1);
}

.m365-popover-time {
  font-size: var(--font-ui-small);
  color: var(--text-muted);
  margin-bottom: var(--size-4-1);
}

.m365-popover-location {
  font-size: var(--font-ui-small);
  color: var(--text-muted);
  margin-bottom: var(--size-4-1);
}

.m365-popover-body {
  font-size: var(--font-ui-small);
  color: var(--text-normal);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: var(--size-4-1);
}

.m365-popover-weblink {
  font-size: var(--font-ui-small);
  color: var(--text-accent);
}
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```
git add src/view.tsx styles.css
git commit -m "feat: wire PopoverProvider and add hover popover styles"
```
