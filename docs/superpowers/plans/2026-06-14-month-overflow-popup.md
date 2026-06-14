# Month View Overflow Hover Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a `(+n)` bar at the bottom of day cells with more than 4 items, and reveal the overflow items as read-only compact cards in a hover popup.

**Architecture:** Local state inside `MonthView` holds the overflow popover state; a 300ms timer (matching existing event hover behavior) fires on `onMouseEnter` of the overflow button. A new `OverflowPopup` component handles its own `createPortal` to `document.body` and positions itself relative to the button's bounding rect — same pattern as `EventHoverPopover`.

**Tech Stack:** React 18, TypeScript, `react-dom/createPortal`, Vitest + React Testing Library, CSS custom properties (Obsidian vars)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/components/MonthView.tsx` | Update text/default; add hover state, timer, cleanup, portal render |
| Create | `src/components/OverflowPopup.tsx` | Positioned portal showing overflow EventCards + TodoCards |
| Modify | `tests/components/MonthView.test.tsx` | Update 4 stale tests; add hover describe block |
| Create | `tests/components/OverflowPopup.test.tsx` | Unit tests for rendering and positioning |
| Modify | `styles.css` | Bar background tint + popup panel styles |

---

## Task 1: Update overflow button text and default (TDD)

**Files:**
- Modify: `tests/components/MonthView.test.tsx`
- Modify: `src/components/MonthView.tsx`

- [ ] **Step 1: Update four stale tests in `tests/components/MonthView.test.tsx`**

Replace lines 123–215 with the following (all other tests stay identical):

```tsx
  it('shows all events when count is at or below maxEventsPerDay', () => {
    const events = Array.from({ length: 6 }, (_, i) => ({
      ...eventOnApril4,
      id: `evt${i}`,
      subject: `Event ${i}`,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    expect(screen.queryByText(/^\(\+\d+\)$/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Event \d/)).toHaveLength(6);
  });

  it('shows overflow button when events exceed maxEventsPerDay', () => {
    const events = Array.from({ length: 8 }, (_, i) => ({
      ...eventOnApril4,
      id: `evt${i}`,
      subject: `Event ${i}`,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    expect(screen.getByText('(+2)')).toBeInTheDocument();
  });

  it('clicking the overflow button calls onDayClick', async () => {
    const onDayClick = vi.fn();
    const events = Array.from({ length: 8 }, (_, i) => ({
      ...eventOnApril4,
      id: `evt${i}`,
      subject: `Event ${i}`,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={onDayClick}
        maxEventsPerDay={6}
      />,
    );
    await userEvent.click(screen.getByText('(+2)'));
    expect(onDayClick).toHaveBeenCalledWith(expect.any(Date));
  });

  it('overflow button click calls onDayClick exactly once (stopPropagation works)', async () => {
    const onDayClick = vi.fn();
    const events = Array.from({ length: 8 }, (_, i) => ({
      ...eventOnApril4,
      id: `evt${i}`,
      subject: `Event ${i}`,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={onDayClick}
        maxEventsPerDay={6}
      />,
    );
    await userEvent.click(screen.getByText('(+2)'));
    expect(onDayClick).toHaveBeenCalledTimes(1);
  });

  it('uses default limit of 4 when maxEventsPerDay is not specified', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      ...eventOnApril4,
      id: `evt${i}`,
      subject: `Event ${i}`,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('(+1)')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests and confirm the four changed tests fail**

```bash
npx vitest run tests/components/MonthView.test.tsx
```

Expected: 4 failures about `+ 2 more` / `+ 1 more` not found, plus 1 failure about `more` regex.

- [ ] **Step 3: Update `src/components/MonthView.tsx` — change default and button text**

Change line 28 (default prop):
```tsx
  maxEventsPerDay = 4,
```

Change the overflow button text (lines 129–139). Replace:
```tsx
  + {totalItems - maxEventsPerDay} more
```
with:
```tsx
  (+{totalItems - maxEventsPerDay})
```

- [ ] **Step 4: Run tests and confirm all pass**

```bash
npx vitest run tests/components/MonthView.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/MonthView.tsx tests/components/MonthView.test.tsx
git commit -m "feat: change overflow bar text to (+n) and lower default to 4"
```

---

## Task 2: Create OverflowPopup component (TDD)

**Files:**
- Create: `tests/components/OverflowPopup.test.tsx`
- Create: `src/components/OverflowPopup.tsx`

- [ ] **Step 1: Write `tests/components/OverflowPopup.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OverflowPopup } from '../../src/components/OverflowPopup';
import { M365Event, M365Calendar, M365TodoItem, M365TodoList } from '../../src/types';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const event1: M365Event = {
  id: 'evt1',
  subject: 'Stand-up',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const event2: M365Event = {
  id: 'evt2',
  subject: 'Design Review',
  start: { dateTime: '2026-04-04T14:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T15:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const todoList: M365TodoList = { id: 'list1', displayName: 'Work', color: '#3b82f6' };

const todo1: M365TodoItem = {
  id: 'task1',
  title: 'Buy milk',
  listId: 'list1',
  dueDate: '2026-04-04',
  importance: 'normal',
};

const anchorRect = {
  top: 100, left: 50, right: 200, bottom: 130,
  width: 150, height: 30, x: 50, y: 100,
  toJSON: () => ({}),
} as DOMRect;

describe('OverflowPopup', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1024);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders overflow events as compact event cards', () => {
    render(
      <OverflowPopup
        events={[event1, event2]}
        todos={[]}
        calendarMap={new Map([['cal1', calendar]])}
        todoListMap={new Map()}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.getByText('Stand-up')).toBeInTheDocument();
    expect(screen.getByText('Design Review')).toBeInTheDocument();
  });

  it('renders overflow todos as compact todo cards', () => {
    render(
      <OverflowPopup
        events={[]}
        todos={[todo1]}
        calendarMap={new Map()}
        todoListMap={new Map([['list1', todoList]])}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('skips events whose calendar is missing from calendarMap', () => {
    render(
      <OverflowPopup
        events={[event1]}
        todos={[]}
        calendarMap={new Map()}
        todoListMap={new Map()}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.queryByText('Stand-up')).not.toBeInTheDocument();
  });

  it('skips todos whose list is missing from todoListMap', () => {
    render(
      <OverflowPopup
        events={[]}
        todos={[todo1]}
        calendarMap={new Map()}
        todoListMap={new Map()}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.queryByText('Buy milk')).not.toBeInTheDocument();
  });

  it('positions popup to the right of the anchor when space allows', () => {
    // innerWidth=1024, anchorRect.right=200: 200 + 8 + 220 = 428 < 1024 → right side
    render(
      <OverflowPopup
        events={[event1]}
        todos={[]}
        calendarMap={new Map([['cal1', calendar]])}
        todoListMap={new Map()}
        anchorRect={anchorRect}
      />,
    );
    const popup = document.querySelector('.m365-overflow-popup') as HTMLElement;
    expect(popup.style.left).toBe('208px'); // 200 + 8
  });

  it('falls back to left of anchor when right side would overflow viewport', () => {
    vi.stubGlobal('innerWidth', 400);
    // anchorRect.right=200 → 200 + 8 + 220 = 428 > 400 → left side
    // left = anchorRect.left(50) - 8 - 220 = -178
    const narrowRect = { ...anchorRect, right: 200 } as DOMRect;
    render(
      <OverflowPopup
        events={[event1]}
        todos={[]}
        calendarMap={new Map([['cal1', calendar]])}
        todoListMap={new Map()}
        anchorRect={narrowRect}
      />,
    );
    const popup = document.querySelector('.m365-overflow-popup') as HTMLElement;
    expect(popup.style.left).toBe('-178px'); // 50 - 8 - 220
  });
});
```

- [ ] **Step 2: Run tests and confirm they all fail**

```bash
npx vitest run tests/components/OverflowPopup.test.tsx
```

Expected: all tests fail with module not found or similar.

- [ ] **Step 3: Create `src/components/OverflowPopup.tsx`**

```tsx
import React from 'react';
import { createPortal } from 'react-dom';
import { M365Event, M365Calendar, M365TodoItem, M365TodoList } from '../types';
import { EventCard } from './EventCard';
import { TodoCard } from './TodoCard';

interface OverflowPopupProps {
  events: M365Event[];
  todos: M365TodoItem[];
  calendarMap: Map<string, M365Calendar>;
  todoListMap: Map<string, M365TodoList>;
  anchorRect: DOMRect;
}

const POPUP_WIDTH = 220;
const GAP = 8;

export const OverflowPopup: React.FC<OverflowPopupProps> = ({
  events,
  todos,
  calendarMap,
  todoListMap,
  anchorRect,
}) => {
  const wouldOverflow = anchorRect.right + GAP + POPUP_WIDTH > window.innerWidth;
  const left = wouldOverflow
    ? anchorRect.left - GAP - POPUP_WIDTH
    : anchorRect.right + GAP;

  return createPortal(
    <div
      className="m365-overflow-popup"
      style={{ position: 'fixed', top: `${anchorRect.top}px`, left: `${left}px`, pointerEvents: 'none' }}
    >
      {events.map((event) => {
        const cal = calendarMap.get(event.calendarId);
        if (!cal) return null;
        return <EventCard key={event.id} event={event} calendar={cal} />;
      })}
      {todos.map((todo) => {
        const list = todoListMap.get(todo.listId);
        if (!list) return null;
        return <TodoCard key={todo.id} todo={todo} todoList={list} />;
      })}
    </div>,
    document.body,
  );
};
```

- [ ] **Step 4: Run tests and confirm all pass**

```bash
npx vitest run tests/components/OverflowPopup.test.tsx
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/OverflowPopup.tsx tests/components/OverflowPopup.test.tsx
git commit -m "feat: add OverflowPopup component for month view overflow hover"
```

---

## Task 3: Wire hover behavior into MonthView (TDD)

**Files:**
- Modify: `tests/components/MonthView.test.tsx`
- Modify: `src/components/MonthView.tsx`

- [ ] **Step 1: Add hover tests to `tests/components/MonthView.test.tsx`**

Add these imports to the top of the file (after the existing imports):
```tsx
import { fireEvent, act } from '@testing-library/react';
import { beforeEach, afterEach } from 'vitest';
```

Then append this describe block at the very end of the file (after the `MonthView — todos` describe block):

```tsx
describe('MonthView — overflow popup hover', () => {
  const events8 = Array.from({ length: 8 }, (_, i) => ({
    ...eventOnApril4,
    id: `evt${i}`,
    subject: `Event ${i}`,
  }));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', 1024);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not show overflow popup before 300ms of hover', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events8}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Show 2 more items' }));
    act(() => { vi.advanceTimersByTime(299); });
    expect(document.querySelector('.m365-overflow-popup')).toBeNull();
  });

  it('shows overflow popup with overflow events after 300ms of hover', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events8}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Show 2 more items' }));
    act(() => { vi.advanceTimersByTime(300); });
    expect(document.querySelector('.m365-overflow-popup')).not.toBeNull();
    expect(screen.getByText('Event 6')).toBeInTheDocument();
    expect(screen.getByText('Event 7')).toBeInTheDocument();
  });

  it('hides overflow popup immediately on mouse leave', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events8}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Show 2 more items' });
    fireEvent.mouseEnter(btn);
    act(() => { vi.advanceTimersByTime(300); });
    expect(document.querySelector('.m365-overflow-popup')).not.toBeNull();
    fireEvent.mouseLeave(btn);
    expect(document.querySelector('.m365-overflow-popup')).toBeNull();
  });

  it('mouse leave before 300ms cancels the popup', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events8}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Show 2 more items' });
    fireEvent.mouseEnter(btn);
    act(() => { vi.advanceTimersByTime(299); });
    fireEvent.mouseLeave(btn);
    act(() => { vi.advanceTimersByTime(1); });
    expect(document.querySelector('.m365-overflow-popup')).toBeNull();
  });
});
```

- [ ] **Step 2: Run new tests and confirm they fail**

```bash
npx vitest run tests/components/MonthView.test.tsx -t "overflow popup hover"
```

Expected: 4 failures (popup not found / no hover handlers yet).

- [ ] **Step 3: Update `src/components/MonthView.tsx` with hover wiring**

Replace the import line at the top:
```tsx
import React from 'react';
```
with:
```tsx
import React, { useState, useRef, useEffect } from 'react';
```

Add `OverflowPopup` import after the `usePopoverContext` import line:
```tsx
import { OverflowPopup } from './OverflowPopup';
```

Add state and timer ref inside the component body, after the existing `const { showPopover, hidePopover } = usePopoverContext();` line:
```tsx
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
```

Replace the existing overflow button (the `{totalItems > maxEventsPerDay && (` block) with:
```tsx
              {totalItems > maxEventsPerDay && (
                <button
                  type="button"
                  className="m365-month-overflow-btn"
                  aria-label={`Show ${totalItems - maxEventsPerDay} more items`}
                  onMouseEnter={(e) => {
                    if (overflowTimerRef.current !== null) clearTimeout(overflowTimerRef.current);
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
```

Add the `OverflowPopup` render inside the outer `<div className="m365-calendar-month-view">`, after the `<div className="m365-calendar-month-grid">` closing tag:
```tsx
        {overflowPopover && (
          <OverflowPopup
            events={overflowPopover.events}
            todos={overflowPopover.todos}
            calendarMap={calendarMap}
            todoListMap={todoListMap}
            anchorRect={overflowPopover.anchorRect}
          />
        )}
```

- [ ] **Step 4: Run the full MonthView test suite and confirm all tests pass**

```bash
npx vitest run tests/components/MonthView.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/MonthView.tsx tests/components/MonthView.test.tsx
git commit -m "feat: wire overflow hover popup into MonthView"
```

---

## Task 4: CSS styling

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Update `.m365-month-overflow-btn` in `styles.css`**

Find the existing `.m365-month-overflow-btn` block (around line 511) and replace it:

```css
.m365-month-overflow-btn {
  display: block;
  width: 100%;
  background: var(--background-modifier-border);
  border: none;
  border-radius: 3px;
  padding: 1px 4px;
  margin: 1px 0;
  cursor: pointer;
  font-size: 0.75em;
  color: var(--text-muted);
  text-align: center;
}
```

- [ ] **Step 2: Add `.m365-overflow-popup` styles to `styles.css`**

Add the following block immediately after the `.m365-month-overflow-btn:hover` rule:

```css
.m365-overflow-popup {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  padding: 6px;
  z-index: 1000;
  max-height: 300px;
  overflow-y: auto;
  width: 220px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 3: Run typecheck to confirm no issues**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "style: add overflow bar background and popup panel styles"
```
